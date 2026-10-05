/**
 * dsh-batch-tool-calls —— 让 Agent 在**一个步骤**里批量发起互不依赖的工具调用。
 *
 * 为什么值得装：每一步都会把整个Чат上下文重新发一遍（命中提示缓存同样计费）。
 * 实测一个 standard 预设的会话：4 витков / 60 步 / 90 раз工具调用（平均 1.5 раз/步），
 * 其中 26 个步骤各自只跑了一条 shell 命令；该会话缓存命中读 5,664,640 token
 * （≈ 94,411 token/步）。把这些彼此独立的单调用步骤合并，步数直接下降，
 * 缓存重读按比例下降。
 *
 * 怎么生效：向宿主 systemPrompt 注册**一段静态**提示段（默认 order 100，落在人格前缀
 * 之后、plan:policy 之前）。静态文本对提示缓存友好：内容稳定 → 前缀命中率不受影响。
 *
 * 平面：systemPrompt 注册表属于宿主组合；本插件不发布任何服务，只消费它，
 * 因此对所有预设的所有 Agent（含子代理）生效。预设可用同名 section 覆盖。
 *
 * 配置（见 cordis.patch.yml）：
 *   enabled      boolean  默认 true；false = 完全不注册
 *   language     'auto' | 'zh' | 'en'  默认 auto（跟随部署语言）
 *   order        number   默认 100
 *   minCalls     number   默认 3   提示里的「每步几个」下限
 *   maxCalls     number   默认 6   提示里的上限
 *   mentionShell boolean  默认 true  是否包含「独立 shell 命令合并成一次 bash」
 *   extra        string   默认 ''    追加自定义文本（另起一段）
 */
import z from '@deepseek-ai/schemastery'

/** Cordis 插件名（诊断与日志里可见）。 */
const name = 'batch-tool-calls'
/** 必需服务：只读注册表，缺失时本行等待而不是报错。 */
const inject = ['systemPrompt']

/** 段名固定：预设若要用自己的文本替换它，注册同名 section 即可（scoped 覆盖 global）。 */
const SECTION_NAME = 'batch-tool-calls:policy'
const DEFAULT_ORDER = 100
const DEFAULT_MIN_CALLS = 3
const DEFAULT_MAX_CALLS = 6

const Config = z.object({
  enabled: z.boolean().default(true),
  language: z.union([z.const('auto'), z.const('zh'), z.const('en'), z.const('ru')]).default('auto'),
  order: z.number().default(DEFAULT_ORDER),
  minCalls: z.natural().min(1).default(DEFAULT_MIN_CALLS),
  maxCalls: z.natural().min(1).default(DEFAULT_MAX_CALLS),
  mentionShell: z.boolean().default(true),
  extra: z.string().default(''),
})

/** `auto` 时跟随部署语言：先看 DSH/DSHA 的语言环境变量，再看 LANG/LC_ALL。 */
function pickLanguage(configured) {
  if (configured === 'zh' || configured === 'en' || configured === 'ru') return configured
  let raw = ''
  try {
    raw = String(process.env.DSH_UI_LANGUAGE || process.env.DSHA_UI_LANGUAGE || process.env.LC_ALL || process.env.LANG || '')
  } catch (_error) {
    raw = ''
  }
  return /^ru/i.test(raw) ? 'ru' : /^zh/i.test(raw) ? 'zh' : 'en'
}

/** 归一化配置：既支持经 schema 解析后的对象，也支持直接调用 apply 时传入的部分配置。 */
function normalize(config) {
  const raw = config === undefined || config === null ? {} : config
  const min = Number.isInteger(raw.minCalls) && raw.minCalls >= 1 ? raw.minCalls : DEFAULT_MIN_CALLS
  const maxRaw = Number.isInteger(raw.maxCalls) && raw.maxCalls >= 1 ? raw.maxCalls : DEFAULT_MAX_CALLS
  return {
    enabled: raw.enabled !== false,
    language: ['zh','en','ru'].includes(raw.language) ? raw.language : 'auto',
    order: Number.isFinite(raw.order) ? raw.order : DEFAULT_ORDER,
    minCalls: min,
    maxCalls: Math.max(min, maxRaw),
    mentionShell: raw.mentionShell !== false,
    extra: typeof raw.extra === 'string' ? raw.extra.trim() : '',
  }
}

function zhText(min, max, mentionShell) {
  const lines = [
    '## Независимые вызовы инструментов в одном шаге',
    '',
    'Каждый шаг повторно передаёт контекст, в том числе платный кэш. Отправляй независимые вызовы вместе в одном шаге:',
    '',
    '- Независимые вызовы чтения, поиска и команд без изменений отправляй вместе, обычно ' + min + '–' + max + ' вызовов.',
  ]
  if (mentionShell) lines.push('- Независимые команды можно объединять в один вызов bash с учётом требуемого поведения при ошибке.')
  lines.push(
    '- Если вызов зависит от результата предыдущего, выполняй его следующим шагом.',
    '- Изменения одного файла и последовательность чтение → изменение выполняй последовательно.',
    '- Зависимые и разрушительные действия, а также запросы подтверждения выполняй последовательно. Сохраняй корректность.',
  )
  return lines.join('\n')
}

function enText(min, max, mentionShell) {
  const lines = [
    '## Spend fewer steps: batch independent tool calls',
    '',
    'Every step resends the whole conversation context (cache hits are still billed), so issue independent calls in the SAME step:',
    '',
    '- Fire independent inspection calls (`read` / `grep` / `glob` / web search / read-only commands) together, typically ' + min + '-' + max + ' at once.',
  ]
  if (mentionShell) lines.push('- Merge independent shell commands into one `bash` call (`a && b`; use `a; b` to run both) instead of one command per step.')
  lines.push(
    '- Split into a later step only when a call needs the previous result (locate first, then read that file).',
    '- Multiple `edit`s of the same file, and "read then edit", must stay sequential.',
    '- Dependent chains, destructive operations, and anything needing user confirmation stay step-by-step; never trade correctness for fewer steps.',
  )
  return lines.join('\n')
}

/** 组装最终段落文本（导出仅供测试与自定义复用）。 */
function buildSectionText(config) {
  const cfg = normalize(config)
  const base = ['zh','ru'].includes(pickLanguage(cfg.language))
    ? zhText(cfg.minCalls, cfg.maxCalls, cfg.mentionShell)
    : enText(cfg.minCalls, cfg.maxCalls, cfg.mentionShell)
  return cfg.extra ? base + '\n\n' + cfg.extra : base
}

/**
 * 安装提示段。
 * @param ctx - Cordis 上下文；注册经 `ctx.systemPrompt.section()`，随本行卸载自动撤销。
 * @param config - {@link Config} 解析后的配置。
 */
function apply(ctx, config) {
  const cfg = normalize(config)
  if (!cfg.enabled) return
  const text = buildSectionText(cfg)
  // 提示段支持 {{变量}} 插值，未注册的变量会在组装时抛错；这里提前挡住，避免整段被吃掉。
  if (text.includes('{{')) throw new Error('batch-tool-calls: section text must not contain "{{...}}" prompt variables')
  ctx.systemPrompt.section({ name: SECTION_NAME, order: cfg.order, text })
}

export { Config, SECTION_NAME, apply, buildSectionText, inject, name, normalize, pickLanguage }
