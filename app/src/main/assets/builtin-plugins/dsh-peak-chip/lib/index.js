/*!
 * dsh-peak-chip —— 宿主半边：官方Баланс + Расход сегодня
 *
 * Баланс来自官方开放平台：
 *   GET https://api.deepseek.com/user/balance
 * 官方只给Баланс、不给消费明细（`/user/usage` 是 404，实测 12 个端点只有它和
 * `/models` 返回 200）。所以「花了多少」要靠两条路：Баланс差分，和自己记 token。
 *
 * ── 账的口径（v4，2026-09-20 定稿）──────────────────────────
 *   B_首 = Сегодня首个Баланс（固定不变）
 *   L    = 本地Сегодня估算消耗（全部计费事件，真实峰谷档）
 *   T    = СегодняПополнить额度（台阶检测出来的整数，可手动修正）
 *   V    = B_首 − Текущий баланс              （正 = 钱变少，充了值就是负的）
 *   S    = V + T                        （面板上的「Расход сегодня」）
 *   O    = max(0, S − L)                （「其它端消费」：同一账号上别的客户端花的）
 *   E    = max(0, L − S)                （「Расхождение」：只有**本机估算比账号推算还高**才算异常）
 *
 * Пополнить识别**不假设档位**，只假设「整数元」（官方最低可充 1 юаней，2026-09-20 实测）：
 * 在累计观测量 R = (Текущий баланс − B_首) + L 上找台阶，先做 3 窗中位数滤波。
 * 理由与阈值见 MEDIAN_WINDOW / STEP_MIN / STEP_KEEP 的注释。
 *
 * ── 记账前提（用户承诺，2026-09-20）────────────────────────────
 *   ① **同时只用一个客户端** → 运行中的窗口里 它端消费 = 0
 *   ② **只在当前客户端运行时Пополнить** → 停机窗口里 Пополнить = 0
 *
 * 数据经本插件自己的 settings 命名空间送到浏览器半边（客户端用
 * ctx.settingsScope.bind({namespace}) 读），不需要 Typert remote。
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import z from '@deepseek-ai/schemastery';

/** Cordis 插件名。 */
export const name = 'dsh-peak-chip';

/** 依赖的设置服务；缺失时本行等待而不是崩掉。 */
export const inject = ['settings'];

/** 本插件拥有的设置命名空间（同时是宿主→客户端的通道）。 */
const NS = 'dsh-peak-chip';

/** 官方Баланс接口要求的凭据引用名。 */
const KEY_REF = 'DEEPSEEK_API_KEY';

const BALANCE_URL = 'https://api.deepseek.com/user/balance';

/**
 * 本插件**自己的目录**：从 `import.meta.url` 反推，不依赖 `$DSH_HOME` 的写法，
 * 也不依赖谁把它装在哪（Windows 那边不是 `/root/.dsh`；将来换安装位置也照样对）。
 * 客户端"Запросить исправление"的提示词要用它 —— 客户端**不许**写死路径。
 */
const SELF_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SELF_MANUAL = join(SELF_DIR, '维修手册.md');
const TIMEOUT_MS = 15000;

/** 官方Пополнить页（控制台）。 */
const TOPUP_URL = 'https://platform.deepseek.com/top_up';

/** DSHA 的 3090 桥：把链接交给 App，由系统浏览器打开。 */
const BRIDGE_OPEN_URL = 'http://127.0.0.1:3090/app/open';

/** 桥的鉴权 token 文件（相对 $DSH_HOME）；与 dsha-task-notifier 读的是同一个。 */
const BRIDGE_TOKEN_FILE = '.bridge_token';

/** 依赖服务还没就位时的重试间隔；只在启动后头几秒用到，比Норма周期短得多。 */
const RETRY_MS = 5000;

/* ── Пополнить识别参数（v4：不假设档位，只假设「整数元」）────────────
   官方Пополнить最低 **1 юаней**（2026-09-20 实测；原先记的「最低 10 юаней起」是错的），
   所以整张档位表作废。它不只是多余 —— 它会把任何 0.01 юаней的残差放大成 10 юаней，
   实测一小时内凭空造出 4 раз假Пополнить、把面板抬高了 49 юаней。

   改成在**累计观测量** R 上找台阶：

     R(t) = (Текущий баланс − Сегодня首个Баланс) + Сегодня本地估算消耗

   没有Пополнить的时候 R 贴着 0 游走；Пополнить到账会把 R 抬上一个**永久台阶**。

   噪声来自Баланс结算滞后：单窗尖峰、下一窗回落，实测幅度到 ±0.75。
   而 ¥1 Пополнить的台阶只有 ~1.0 —— 单窗幅度判据分不开（信噪比 1.3 倍）。
   所以先做中位数滤波：滤波后噪声实测只剩 ±0.04，¥1 信号是它的 24 倍。 */
const MEDIAN_WINDOW = 3;   /* 中位数滤波窗宽（窗口数） */
const STEP_MIN = 0.5;      /* 台阶判据：|M − 上次认账值| 至少这么大（元） */
const STEP_KEEP = 2;       /* 且要连续维持这么多窗才认账 —— 单窗尖峰过不了 */

/**
 * Расхождение的Недостоверно阈值（元）。**Сегодня锁存**：
 *   Расхождение < 2  → Норма
 *   Расхождение ≥ 2  → Недостоверно，并且**当天不再恢复**（即使后来Расхождение又降回 2 以下）
 * 跨日才清除。判定放在宿主，这样面板没打开的时候也在盯着。
 */

/**
 * **口径版本号**。改了"Как считается расхождение"就把它 +1：
 * 旧口径留在状态里的告警状态（含灰）会由 accountDay **一次性作废**。
 *
 * 为什么必须有：锁存是**粘的**（Красный当天不回退、灰永久），而口径一变，旧口径下
 * 判出的"Недостоверно"就是错的 —— 不主动作废，用户得一直看着一个假Красный灯。
 *
 * 历史：
 *   v4.0.7 拆开其它端消费 O 与Расхождение E（旧口径 E=|S−L| 把"别的客户端花同一个
 *     账号的钱"算成Расхождение，电脑端一用就连锁 18 窗，实测）。
 *   v4.0.8 换成三档告警（Жёлтый 0.6–1.2 可恢复 / Красный >1.2 Сегодня锁存 / 灰连续三天Красный
 *     永久），认Пополнить加"За этот интервал баланс должен увеличиться"，手填值跨日归零。
 *     **灰的唯一出口就是这个版本号**：真的改了代码才升版。
 */
const RULE_VERSION = 408;

/* ── 三档告警阈值（见 `计费算法说明.md` §7.2）────────────────
   判据是 E = max(0, R − T)，前提是"Пополнения сверены с оплатой"：
   Пополнить识别错误属于预期内、不可解，由手动修正兜底，**不算Недостоверно**。 */
/** Жёлтый色·Требует проверки：进入线。 */
const ALERT_YELLOW = 0.6;
/** Жёлтый色·Требует проверки：解除线（比进入线低 → 0.4–0.6 是滞回带，防抖动闪Жёлтый）。 */
const ALERT_YELLOW_EXIT = 0.4;
/** Красный色·Недостоверно：进入线。 */
const ALERT_RED = 1.2;
/** 三档统一：连续这么多窗才算数（防单窗尖峰）。 */
const ALERT_STREAK = 3;
/** 连续这么多**自然日**都Был красный уровень → 灰色·Ошибка（永久）。 */
const ALERT_GRAY_DAYS = 3;

/**
 * 官方Пополнить页上的额度和档位（元）。
 *
 * ⚠️ v4 起**不再使用**：官方最低可充 **1 юаней**（2026-09-20 实测），原先记的
 * 「最低 10 юаней起、只能整档充」是错的。这里只留作历史注记，别再拿来推断金额 ——
 * 把 0.01 юаней的估算残差放大成 10 юаней就是这个假设干的。
 */

/* ── 本地记账用的价目与峰谷规则 ────────────────────────────────
   ⚠️ 这张表和 client.js 里那份是同一份数据的两处副本：宿主用它算钱，
   客户端用它渲染面板。改一处必须改另一处 —— test/pricing-sync 会盯着。 */
const PRICES = [
  { match: 'flash', hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  { match: 'pro', hit: [0.15, 0.30], miss: [4.5, 9.0], out: [13.5, 27.0] },
];
const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];
const HOLIDAY_RANGES = [
  ['2026-01-01', '2026-01-03', 'Новый год'],
  ['2026-02-15', '2026-02-23', 'Китайский Новый год'],
  ['2026-04-04', '2026-04-06', 'Цинмин'],
  ['2026-05-01', '2026-05-05', 'День труда'],
  ['2026-06-19', '2026-06-21', 'Праздник драконьих лодок'],
  ['2026-09-25', '2026-09-27', 'Праздник середины осени'],
  ['2026-10-01', '2026-10-07', 'Национальный праздник Китая'],
];

/**
 * 本插件对Расхождение的方向约定：**允许估算偏大**（宁可多算，不要漏算）。
 * v4 只在本地账本的大胆方案里保留这个方向（疑似调用也算、输入全按未命中）；
 * Пополнить不再靠档位去「向上取」，改成对累计观测量做台阶检测后取整数。
 */

/**
 * 取中位数（不改动入参）。窗宽固定为 MEDIAN_WINDOW（3），
 * 单窗尖峰进不了中位数 —— 这正是用来区分「结算滞后」和「真Пополнить」的手段。
 * @param values - 数值数组（会被复制后排序）。
 * @returns 中位数；空数组返回 0。
 */
function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 解析 settings 里存的 R 历史（JSON 数组字符串）。
 * 坏值一律当空数组 —— 一个畸形的历史不该让整轮轮询失败。
 * @param raw - 字符串或任何东西。
 * @returns 只含有限数的数组。
 */
function parseRHistory(raw) {
  /* 兼容两种形态：settings 里存的是字符串，accountDay 的返回值也可直接回喂 */
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'number' && Number.isFinite(v));
  } catch {
    return [];
  }
}

/* ── 本地记账：把 provider 上报的 usage 按官方价折成钱 ──────────
   数据源是宿主 session/event 流里的 assistant/message（provider 真实上报的用量）。
   刻意不去包 llm/stream 瀑布：那条路要处理包装路由重复计费、嵌套去重，代价大得多，
   而这里只需要回答「这个窗口大概花了多少钱」这一个量级问题。 */

const CLOCK_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function bjClock(ms) {
  const parts = CLOCK_FMT.formatToParts(new Date(ms));
  const got = {};
  for (const part of parts) got[part.type] = part.value;
  return {
    key: `${got.year}-${got.month}-${got.day}`,
    minutes: (Number(got.hour) % 24) * 60 + Number(got.minute),
  };
}

/** Выходной或法定节假日 → 全天Льготный；调休上班的Выходной同样按Льготный（官方口径）。 */
function isRestAt(ms) {
  const key = bjClock(ms).key;
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return HOLIDAY_RANGES.some(([from, to]) => key >= from && key <= to);
}

function isPeakAt(ms) {
  if (isRestAt(ms)) return false;
  const minutes = bjClock(ms).minutes;
  return PEAK_WINDOWS.some(([from, to]) => minutes >= from && minutes < to);
}

function pos(v) { return (typeof v === 'number' && Number.isFinite(v) && v > 0) ? v : 0; }

/** 收到 4 位小数。Баланс是两位小数的数，连加会积出 70.46000000000001 这种脏值。 */
function round4(v) { return Math.round(v * 1e4) / 1e4; }

/**
 * 一套调用算三个口径 —— 两条完整的估测方案，外加一个点估计。
 *
 * **保守（`low`，偏小）**：往便宜那头算
 *   - 输入按上报的分桶（命中算命中价）
 *   - 模型认不出При Flash，档位一律按**Льготный**
 *
 * **大胆（`high`，偏高）**：往贵那头算
 *   - **输入一律按未命中计价** —— 假设缓存一次都没生效
 *   - 模型认不出При Pro，档位一律按**Пиковый**
 *
 * 于是真实消费几乎必然落在 [low, high] 里：Баланс侧推出来的消费如果掉在区间外，
 * 说明本地账漏了整类调用，而不是价格算错。
 *
 * `point` 才是账算用的那一套（v4 起）：**真实峰的谷档位 + 真实分桶**，
 * 模型认不出退回 Flash 价目（不再记 0 —— 静默归零比算不准更糟）。
 *
 * ⚠️ v4 变更：不再有 `confident` 参数。`assistant/attempt`、`compaction/summary`
 * 这些同样计费的事件**一并计入三个口径** —— 原先只把它们算进 `high`，理由是
 * 「可能与 assistant/message 重复」，但 2026-09-20 逐条比对确认**不重复**
 * （compaction 是独立一次调用，实测一次读 739,620 个未命中 token ≈ 0.75 юаней，
 * 占当天本地账的 27%；漏掉它会让本地估算系统性偏小）。
 * @param usage - provider 上报的用量块。
 * @param model - 这次请求用的模型 id。
 * @param atMs - 请求发起时刻。
 */
function costOfUsage(usage, model, atMs) {
  const miss = pos(usage.inputTokens) + pos(usage.cacheWriteTokens);
  const hit = pos(usage.cacheReadTokens);
  const out = pos(usage.outputTokens);
  const name = String(model ?? '').toLowerCase();
  let known = null;
  for (const candidate of PRICES) {
    if (name.includes(candidate.match)) { known = candidate; break; }
  }
  const idx = isPeakAt(atMs) ? 1 : 0;
  const rate = (entry, phase) =>
    (miss * entry.miss[phase] + hit * entry.hit[phase] + out * entry.out[phase]) / 1e6;

  const lowEntry = known ?? PRICES[0];
  const highEntry = known ?? PRICES[1];
  /* 大胆口径：缓存读也按未命中价算 —— 这就是「假设缓存完全没生效」的天花板 */
  const highRate = (miss + hit) * highEntry.miss[1] / 1e6 + out * highEntry.out[1] / 1e6;

  return {
    point: rate(lowEntry, idx),
    low: rate(lowEntry, 0),
    high: highRate,
  };
}

/** 本地记账状态：窗口内的逐次调用、疑似计费却没 usage 的事件、最近用过的模型。 */
const meter = { recent: [], suspect: [], model: '', windowMs: 5 * 60 * 1000 };

/**
 * 哪些事件算「疑似计费但没有 usage」。
 *
 * 实测日志里有一类 `web/deepseek-search-llm-request`（原生联网搜索）——它显然是一次
 * LLM 调用，却不带 usage，于是本地账本永远记不到它。判据取宽一点：类型里带 llm 或
 * search 的都算候选，`request/header` 除外（那是模型信息，不计费）。
 */
function looksBillableWithoutUsage(type) {
  return type !== 'request/header' && /llm|search/i.test(type);
}

/**
 * 滚动窗口内的合计，把拟合要用的原始原料一起给出。
 *
 * point/low/high 是三个口径的金额；miss/hit/write/out 是**全部计费事件**的原始
 * token 桶 —— 拟合时要用桶，不是用金额：只有桶才能分出「漏了整类调用」和
 * 「某个桶单价算错」。v4 起桶里含 compaction/summary，与 point 口径一致。
 */
function windowSpend(now) {
  const cutoff = now - meter.windowMs;
  while (meter.recent.length > 0 && meter.recent[0].at < cutoff) meter.recent.shift();
  while (meter.suspect.length > 0 && meter.suspect[0].at < cutoff) meter.suspect.shift();
  let point = 0, low = 0, high = 0;
  let miss = 0, hit = 0, write = 0, out = 0, calls = 0, extra = 0;
  for (const item of meter.recent) {
    point += item.point;
    low += item.low;
    high += item.high;
    miss += item.miss;
    hit += item.hit;
    write += item.write;
    out += item.out;
    if (item.kind === 'assistant/message') calls += 1;
    else extra += 1;   /* attempt / compaction —— 留痕，方便核对 */
  }
  const noUsage = {};
  for (const item of meter.suspect) noUsage[item.type] = (noUsage[item.type] ?? 0) + 1;
  return {
    point: round4(point), low: round4(low), high: round4(high),
    miss, hit, write, out, calls, extra, noUsage,
  };
}

/** 从事件里取出用量块：有的在 data.usage，有的在 data.chunk.usage。 */
function usageOfEvent(event) {
  const direct = event.data?.usage;
  if (direct !== null && direct !== undefined) return direct;
  const chunk = event.data?.chunk;
  if (chunk !== null && chunk !== undefined && chunk.type === 'usage'
      && chunk.usage !== null && chunk.usage !== undefined) return chunk.usage;
  return null;
}

/**
 * 记一次调用。
 *
 * **v4 起三个事件类型一视同仁**：`assistant/message`（一个 step 一条）、
 * `assistant/attempt`、`compaction/summary` 都带 provider 上报的 usage，都计费。
 * 旧版担心 attempt/compaction 与 message 重复，只把它们算进大胆口径 —— 2026-09-20
 * 逐条比对确认**不重复**，而漏掉 compaction 会让本地估算系统性偏小（一次压缩
 * 读整个上下文，实测 0.75 юаней、占当天 27%）。
 *
 * 仍然按类型分开计数（`calls` vs `extra`），账本里能看出是哪一类。
 */
function recordUsage(event) {
  if (event.type === 'request/header') {
    const model = event.data?.header?.config?.model;
    if (typeof model === 'string' && model.length > 0) meter.model = model;
    return;
  }
  const at = Date.now();
  const billable = event.type === 'assistant/message'
    || event.type === 'assistant/attempt'
    || event.type === 'compaction/summary';
  const usage = billable ? usageOfEvent(event) : null;
  if (usage === null) {
    /* 疑似计费却没有 usage —— 记下来，它就是本地账本漏掉的那部分的证据。 */
    if (looksBillableWithoutUsage(event.type)) meter.suspect.push({ at, type: event.type });
    return;
  }
  meter.recent.push({
    at,
    kind: event.type,
    miss: pos(usage.inputTokens) + pos(usage.cacheWriteTokens),
    hit: pos(usage.cacheReadTokens),
    write: pos(usage.cacheWriteTokens),
    out: pos(usage.outputTokens),
    ...costOfUsage(usage, meter.model, at),
  });
}

/** 对账日志最多留多少条窗口记录（≈ 8 小时的 5 мин钟轮询）。**只给面板用**。 */
const DBG_KEEP = 100;

/** 往对账日志里追加一条窗口记录，返回新的 JSON 串。 */
function appendDebug(logJson, record) {
  let list = [];
  try {
    const parsed = JSON.parse(logJson);
    if (Array.isArray(parsed)) list = parsed;
  } catch { list = []; }
  list.push(record);
  if (list.length > DBG_KEEP) list = list.slice(list.length - DBG_KEEP);
  return JSON.stringify(list);
}

/**
 * 运行时 schema。刻意全部拍平，不放嵌套对象 —— 少一层 schema 就少一类
 * 「设置里缺字段导致校验不过」的坑。
 *
 * 名字对照（v4 账的口径）：
 *   V Баланс变动值 = dayFirstBalance − balance      （正 = 钱变少）
 *   L 本地今日估算 = localToday
 *   T СегодняПополнить额度 = topUpTotal                   （手动优先，见下）
 *   S Расход сегодня     = todaySpent = V + T
 *   E Расхождение         = residual = |S − L|
 */
/* 只为测试导出：这样测试用的是**真的默认值**，不会抄一份假 schema 跟实现漂移。 */
export const Config = z.object({
  /** витков询间隔（分钟）。 */
  refreshMinutes: z.number().default(5),
  /** 最新查到的总Баланс；-1 = 还不知道。 */
  balance: z.number().default(-1),
  /** Баланс币种（CNY / USD）。 */
  currency: z.string().default(''),
  /** Расход сегодня S = V + T（钳到 ≥ 0）；-1 = 还不知道。 */
  todaySpent: z.number().default(-1),
  /** 上一次查询对应的北京日期。 */
  dayKey: z.string().default(''),
  /** 上一次查询时刻（毫秒）。 */
  at: z.number().default(0),
  /** 上一次查询的失败原因；成功时为空串。 */
  error: z.string().default(''),

  /* ── Сегодня账（宿主维护，客户端只读）──────────────────────── */

  /** Сегодня首个Баланс B_首。固定不变 —— 不再像旧的 baseBalance 那样被Пополнить累加修改。 */
  dayFirstBalance: z.number().default(-1),
  /** 本地今日估算消耗 L（Σ 每窗 point，含 compaction）。 */
  localToday: z.number().default(0),
  /** Баланс变动值 V = B_首 − Текущий баланс（可为负：净Пополнить大于净消费）。 */
  balanceDelta: z.number().default(0),
  /** 自动识别出的СегодняПополнить累计。 */
  autoTopUp: z.number().default(0),
  /** 最终生效的СегодняПополнить额度 T（手动优先）。 */
  topUpTotal: z.number().default(0),
  /** 算这套账用的口径版本；与代码里的 RULE_VERSION 不一致时会一次性作废旧口径的锁存。 */
  ruleVersion: z.number().default(0),
  /** 其它端消费 O = max(0, S − L)：同一账号上别的客户端（如电脑端 DSH）花的钱。
      Баланс是**账号级**的，本地估算只算本机 —— 这段差额是Норма现象，不是Ошибка。 */
  otherSpent: z.number().default(0),
  /** Расхождение E = max(0, L − S)：本机估算**高出**账号推算的部分。只有一个方向可疑：
      账号总共花的钱不可能少于本机花的钱，所以 L > S 才说明本机多算了。 */
  residual: z.number().default(-1),
  /** 告警级别：`none` / `yellow`（Требует проверки，可恢复）/ `red`（Недостоверно，Сегодня锁存）/ `gray`（Ошибка，永久）。 */
  alertLevel: z.string().default('none'),
  /** Жёлтый：连续处于Жёлтый区间的窗数（E ≥ 0.6 加一；E < 0.4 归零；中间保持）。 */
  yellowStreak: z.number().default(0),
  /** Красный：连续越Красный线的窗数。 */
  redStreak: z.number().default(0),
  /** 连续多少个自然日Был красный уровень。**跨日不清** —— 清掉它就永远触发不了灰。 */
  redDayStreak: z.number().default(0),
  /** 最近一个"Был красный уровень"的自然日（YYYY-MM-DD），用来判断连不连续。 */
  lastRedDayKey: z.string().default(''),
  /** 灰触发的时刻（0 = 没触发）。一旦非 0 就永久保留。 */
  grayAt: z.number().default(0),
  /** 今天是否已经Красный过（跨日时用来累加 redDayStreak）。 */
  todayHadRed: z.number().default(0),
  /** 最近一窗识别到的Пополнить额（0 = 没识别到）。记账留痕。 */
  topUp: z.number().default(0),
  /** 本窗「已看到、还没连续两窗确认」的Пополнить额（已计入 topUpTotal，未计入 autoTopUp）。 */
  pendingTopUp: z.number().default(0),

  /**
   * 用户手动填写的Пополнить额度；-1 = 没手动填过（用自动值）。
   * 语义：**直接覆盖**，之后自动识别到的Пополнить再在这个基础上累加。
   */
  manualTopUp: z.number().default(-1),
  /** 宿主内部：上一次已生效的手动值，用来发现客户端刚写入的修改。 */
  appliedManual: z.number().default(-1),
  /** 宿主内部：用户填手动值时，Автоматический подсчёт已经到多少（之后只累加增量）。 */
  autoAtManual: z.number().default(0),

  /** 宿主内部：最近 MEDIAN_WINDOW 窗的 R 值（JSON 数组字符串），做中位数滤波。 */
  rHistory: z.string().default('[]'),
  /** 宿主内部：上次认账时的滤波值 M（可以是负数）。 */
  rBaseline: z.number().default(0),
  /** 宿主内部：是否已经建立基线（1 = 是）。单独一个标志位，别拿 rBaseline 当哨兵。 */
  hasBaseline: z.number().default(0),
  /** 宿主内部：连续多少窗满足台阶判据（单窗尖峰过不了这一关）。 */
  stepStreak: z.number().default(0),

  /**
   * 客户端的「打开Пополнить页」请求：每次点击写入一个递增的时间戳。
   * 客户端Недоступно 3090 桥的 token（只有宿主读得到 `$DSH_HOME/.bridge_token`），
   * 所以这个按钮必须由宿主代劳 —— 这里只是那条请求通道。
   */
  openTopUp: z.number().default(0),
  /**
   * 客户端的「手填值已提交，请立刻单独取一次Баланс」请求：每次写入一个递增的时间戳。
   * 宿主只认「变大」，处理完**不清零**（同 openTopUp）。
   */
  /** 本插件自己的目录（宿主算出来告诉客户端；客户端不许写死路径）。 */
  selfDir: z.string().default(''),
  /** 维修手册的绝对路径（= selfDir + /维修手册.md）。 */
  manualPath: z.string().default(''),
  previewNow: z.number().default(0),
  /**
   * ── 提交预览（A′ 方案，v4.1.4）────────────────────────────
   * 手填值写入的那一瞬间，宿主**单独取一次Баланс**，用与Норма窗口**同一套算术**算出
   * 面板该显示的数字，放在这组字段里；下一窗Норма算账成功时清掉（previewAt = 0）。
   *
   * ⚠️ 这组字段**不参与记账**：不进 `accountDay`、不动 T/O/E、不动台阶检测与告警锁存。
   *    它只是在两个Норма窗口之间「顶替显示」，用完即弃 —— 这样一次临时采样不会污染
   *    中位数滤波（`rHistory`）和台阶确认（`stepStreak`）。
   */
  previewAt: z.number().default(0),
  /** 这一轮预览"Баланс получен отдельно"的时间；0 = 没取到（那就只顶替手填的那个数）。 */
  previewSampleAt: z.number().default(0),
  /** 预览用：刚提交的Пополнить额（手填优先；清除手动值后就是Автоматический подсчёт）。 */
  previewTopUp: z.number().default(-1),
  /** 预览用：单独取到的Баланс；-1 = 没取到。 */
  previewBalance: z.number().default(-1),
  /** 预览用：Начальный баланс дня（还没有Сегодня锚点时，就用这次采样自己当锚点）。 */
  previewDayFirst: z.number().default(-1),
  /** 预览用：Расход сегодня S = max(0, V + T)，与Норма窗同一个 `accountTotals()`。 */
  previewTodaySpent: z.number().default(-1),
  /** 预览用：Расход других устройств O = max(0, S − L)。 */
  previewOtherSpent: z.number().default(-1),
  /** 最近一个轮询窗口里、本地При token 记出来的消费（元）。 */
  windowSpend: z.number().default(0),
  /**
   * 对账日志（JSON 数组的字符串）—— 最近 `DBG_KEEP` = 100 сообщений窗口（≈8 小时），**排障用**
   * （面板不读它，读的是上面那些标量状态）。
   *
   * 这是插件**唯一**的逐窗记录：v4.1.0 之前另有一份 `ledger-*.jsonl` 落盘文件，内容和这里
   * 完全重复、纯冗余 —— 已删。要更长的记录，临时把这里的 JSON 导出成文件即可（按需，不常驻写盘）。
   */
  dbgLog: z.string().default('[]'),
});

/** 北京时间日界。en-CA 直接给出 YYYY-MM-DD。 */
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function bjDayKey(ms) {
  return DAY_FMT.format(new Date(ms));
}

/**
 * 从 balance_infos 里挑条目。
 *
 * 多币种账号会同时返回 CNY/USD 两条，且实测返回顺序不稳定；固定取首条会在
 * USD 排前时读到 0.00。规则：优先取有Баланс的，同有Баланс优先 CNY，全零也优先 CNY。
 * @param infos - 官方响应的 balance_infos。
 * @returns 选中的条目，或 undefined。
 */
function pickInfo(infos) {
  const list = Array.isArray(infos)
    ? infos.filter((entry) => entry !== null && typeof entry === 'object')
    : [];
  if (list.length === 0) return undefined;
  const positive = list.filter((entry) => Number(entry.total_balance) > 0);
  const pool = positive.length > 0 ? positive : list;
  return pool.find((entry) => String(entry.currency).toUpperCase() === 'CNY') ?? pool[0];
}

/**
 * 查一次官方Баланс。凭据每次现取，所以换 key 不用重启。
 * @param ctx - 宿主上下文。
 * @returns 总Баланс与币种。
 * @throws 凭据缺失、网络失败、响应形状不对时抛出可读原因。
 */
async function fetchBalance(ctx) {
  const credentials = ctx.get('credentials');
  if (credentials === undefined) {
    /* 启动期各 bundle 是并行挂载的，此刻Недоступно别的插件提供的服务是Норма现象，
       不是Ошибка —— 打上标记让调用方短间隔重试，别当成错误写进面板。 */
    const error = new Error('Сервис ключей ещё не готов');
    error.serviceNotReady = true;
    throw error;
  }
  const resolved = await credentials.resolve(credentialRef(KEY_REF));
  const key = resolved === undefined ? undefined : resolved.value;
  if (typeof key !== 'string' || key.length === 0) throw new Error(`Не настроен ${KEY_REF}`);

  const response = await fetch(BALANCE_URL, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Сервис баланса: HTTP ${response.status}`);
  const data = await response.json();
  const info = pickInfo(data === null || data === undefined ? undefined : data.balance_infos);
  if (info === undefined) throw new Error('Сервис баланса не вернул balance_infos');
  const total = Number(info.total_balance);
  if (!Number.isFinite(total)) throw new Error('Некорректный баланс');
  return { total, currency: String(info.currency ?? '') };
}

/**
 * 账号口径的两个派生量：`V = начальный баланс − текущий баланс`、`S = max(0, V + T)`。
 *
 * **只有这一处实现**：Норма窗（`accountDay`）与提交预览（`previewTotals`）都调它 ——
 * v4.0.6 那次「指示灯Недостоверно」就是两边各写一份口径、然后互相打脸。
 *
 * @param dayFirstBalance - Сегодня首个Баланс（元）。
 * @param total - Текущий баланс（元）。
 * @param topUpTotal - Пополнения сегодня（含手填与待确认）。
 * @returns {{balanceDelta: number, todaySpent: number}} V 与 S。
 */
export function accountTotals(dayFirstBalance, total, topUpTotal) {
  const balanceDelta = round4(dayFirstBalance - total);
  return { balanceDelta, todaySpent: Math.max(0, round4(balanceDelta + topUpTotal)) };
}

/**
 * Сегодня账的**纯函数**：给定上一状态、最新Баланс、本窗本地消费，算出下一状态。
 *
 * 从 refresh 里抽出来是为了能脱离网络和 settings 直接测 —— 把历史账本行一条条
 * 喂进来，就能一整天地复现「Пополнить认到几次、Расхождение多大」。改这套口径之前先跑它。
 *
 * @param state - 上一次的状态（settings 命名空间里的那些字段）。
 * @param total - 本次查到的Баланс。
 * @param localPoint - 本窗的本地估算（元）。
 * @param dayKey - 本次的北京日期（YYYY-MM-DD）。
 * @returns 新的Сегодня账字段集合。
 */
/**
 * 提交预览（A′ 方案）：手填值刚写下去、Норма窗口还没跑时，面板该显示的数字。
 *
 * 纯函数，参数都是普通值；与 `accountDay` 共用 `accountTotals()` / `splitResidual()`，
 * 所以**不会出现第二份口径**。调用方只把结果写进 `preview*` 字段给面板看，
 * 绝不回写 `accountDay` 的任何状态。
 *
 * 手填优先（覆盖语义）：填了就用填的数，清除手动值（-1）时退回Автоматический подсчёт。
 *
 * @param input - `{ dayFirstBalance, balance, manualTopUp, autoTopUp, localToday }`。
 * @returns `{ topUpTotal, todaySpent, balanceDelta, otherSpent }`。
 */
export function previewTotals(input) {
  const manualTopUp = Number(input.manualTopUp);
  const topUpTotal = round4(manualTopUp >= 0 ? manualTopUp : Number(input.autoTopUp));
  const { balanceDelta, todaySpent } = accountTotals(
    Number(input.dayFirstBalance), Number(input.balance), topUpTotal);
  const split = splitResidual(todaySpent, Number(input.localToday));
  return { topUpTotal, todaySpent, balanceDelta, otherSpent: split.otherSpent };
}

/**
 * 把「账号推算」与「本机估算」的差额切成两半。纯函数，只为可测而导出。
 *
 * 恒等式：**账号总共花的钱 ≥ 本机花的钱**（本机也是账号的一部分）。
 *   账号 > 本机 → 差额是别的客户端花的 → 其它端消费（Норма）
 *   本机 > 账号 → **不可能**，除非本机多算/重复计费 → Расхождение（异常）
 *
 * ⚠️ 已知边界：E 抓的是"Часть изменения баланса, не объяснённая обнаруженными пополнениями"。本机**渐进式**多算会被Пополнить
 * 台阶检测吸收成 T（R 的抬升看起来就像到账），E 因此归零 —— 这是这套模型的固有
 * 盲区，不是这里能修的；要抓它得另找独立证据（例如При token 重算一遍定价）。
 */
export function splitResidual(todaySpent, localToday) {
  const s = Number(todaySpent) || 0;
  const l = Number(localToday) || 0;
  return {
    otherSpent: round4(Math.max(0, s - l)),
    residual: round4(Math.max(0, l - s)),
  };
}

export function accountDay(state, total, localPoint, dayKey, opts = {}) {
  let dayFirstBalance = Number(state.dayFirstBalance);
  let localToday = Number(state.localToday);
  let autoTopUp = Number(state.autoTopUp);
  let rHistory = parseRHistory(state.rHistory);
  let rBaseline = Number(state.rBaseline);
  /* ⚠️ 不能拿 rBaseline 的数值当「有没有基线」的哨兵：R 的基线可以是**负数**
     （其它端消费会让它一路向下），用 -1 当哨兵会把真实基线误判成未初始化。
     回放测试抓到过这个坑，所以单独用一个标志位。 */
  let hasBaseline = Number(state.hasBaseline) === 1;
  let stepStreak = Number(state.stepStreak);
  let autoAtManual = Number(state.autoAtManual);
  let appliedManual = Number(state.appliedManual);
  let otherSpent = Number(state.otherSpent);
  const ruleVersion = Number(state.ruleVersion);
  /** 跨日要把用户手填的Пополнить值清零（"Без переноса"）。 */
  let manualTopUpReset = false;

  /* ── 三档告警状态（跨日**不清**，只有口径升版才清）────────── */
  let alertLevel = typeof state.alertLevel === 'string' ? state.alertLevel : 'none';
  let yellowStreak = Number(state.yellowStreak);
  let redStreak = Number(state.redStreak);
  let redDayStreak = Number(state.redDayStreak);
  let lastRedDayKey = typeof state.lastRedDayKey === 'string' ? state.lastRedDayKey : '';
  let grayAt = Number(state.grayAt);
  let todayHadRed = Number(state.todayHadRed);

  /* ★ 口径迁移：版本对不上就作废旧口径留下的判定状态（只作废一次）。
     灰也一起清 —— 这**就是灰唯一的出口**：真的改了代码并升版。 */
  if (ruleVersion !== RULE_VERSION) {
    otherSpent = 0;
    alertLevel = 'none';
    yellowStreak = 0;
    redStreak = 0;
    redDayStreak = 0;
    lastRedDayKey = '';
    grayAt = 0;
    todayHadRed = 0;
  }

  const newDay = state.dayKey !== dayKey || !(dayFirstBalance > 0);
  if (newDay) {
    /* 新的一天（或首启）：基准就是此刻。
       这一窗的本地消费发生在基准之前，不计入 —— 保证 V 与 L 从同一起点算，
       否则两者区间不齐，Расхождение会被区间差整个吞掉。 */
    dayFirstBalance = total;
    localToday = 0;
    autoTopUp = 0;
    rHistory = [];
    rBaseline = 0;
    hasBaseline = false;
    stepStreak = 0;
    autoAtManual = 0;
    appliedManual = Number(state.manualTopUp);
    /* 跨日：账本全部归零（用户定的"Новый начальный баланс в полночь"）。
       ⚠️ 但**告警状态不清**：Красный日计数、灰、连续窗计数都要活过午夜，
          否则"Три дня красного уровня → серый"永远触发不了。 */
    if (todayHadRed === 1) {
      const yesterday = new Date(Date.parse(`${state.dayKey}T00:00:00Z`) - 86400000);
      const yesterdayKey = Number.isNaN(yesterday.getTime()) ? '' : yesterday.toISOString().slice(0, 10);
      redDayStreak = (lastRedDayKey === yesterdayKey ? redDayStreak : 0) + 1;
      lastRedDayKey = state.dayKey;        /* 刚过去的那一天 */
    } else {
      redDayStreak = 0;
    }
    todayHadRed = 0;
    /* Жёлтый/Красный锁存是"Сегодня"的：跨日复位。灰是永久的，不在这里动。 */
    if (alertLevel !== 'gray') alertLevel = 'none';
    yellowStreak = 0;
    redStreak = 0;
    otherSpent = 0;
    /* 手动值跨日归零（用户定：直接开始重计，不携带昨天的任何账） */
    manualTopUpReset = true;
  } else {
    localToday = round4(localToday + localPoint);
  }

  /* 累计观测量 R：没有Пополнить的时候贴着 0 游走，Пополнить到账会把它抬上一个永久台阶 */
  const R = round4((total - dayFirstBalance) + localToday);
  rHistory.push(R);
  if (rHistory.length > MEDIAN_WINDOW) rHistory = rHistory.slice(rHistory.length - MEDIAN_WINDOW);
  const M = round4(median(rHistory));

  /* 台阶检测：中位数滤波杀掉「结算滞后」造成的单窗尖峰，真台阶留得住。
     单窗噪声实测 ±0.75，而 ¥1 Пополнить台阶只有 ~1.0 —— 不做滤波就分不开。

     ⚠️ **只认正台阶**。负台阶意味着Баланс掉得比本地账快，那是「其它端消费」或
     结算延迟，不是负Пополнить —— 它必须留在Расхождение里（让 E 显示出来），绝不能被
     计成 autoTopUp 的减项。回放测试盯着这一条。 */
  let step = 0;
  let topUp = 0;
  /* ★ v4.0.8：认Пополнить多一条前提 —— **За этот интервал баланс должен увеличиться**。
     Пополнить让Баланс升（ΔB < 0），而"Задержка списания"只让Баланс不动（ΔB ≥ 0）。
     两者在缺口上都表现为正跳，只有Баланс变化方向能把它们分开。
     `opts.balanceRose === false` 时**不认台阶**：那部分留在 E 里显示出来，
     而不是被静默吃进 T（宁可漏判、让人去手动修，也不要静默虚高）。
     ⚠️ 已知代价：Пополнить额小于同窗本机消费时Баланс是净下降的 → 会漏判（靠手动修正兜底）。 */
  const mayBeTopUp = opts?.balanceRose !== false;
  if (!hasBaseline) {
    rBaseline = M;                       /* 建立基线，本窗不判 */
    hasBaseline = true;
  } else if (M < rBaseline) {
    /* 基线**跟着向下漂移走**：R 往下走意味着「其它端消费」或本地估算偏高，
       那不是台阶。若把基线钉在原处，漂移会攒成一个假台阶（回放测试抓到过）。
       向上的移动一律不算漂移 —— 那才是Пополнить。 */
    rBaseline = M;
    stepStreak = 0;
  } else {
    step = round4(M - rBaseline);
    if (step >= STEP_MIN && mayBeTopUp) stepStreak += 1;
    else stepStreak = 0;
    if (stepStreak >= STEP_KEEP) {
      topUp = Math.round(step);
      autoTopUp = round4(autoTopUp + topUp);
      /* 基线回到当前滤波值（而不是加上取整后的值）：取整余数留在 R 里，
         最终由Расхождение行显示出来，而不是累积成下一次假台阶。 */
      rBaseline = M;
      stepStreak = 0;
    }
  }

  /* ── 待确认的台阶（provisional）★ 修 v4.0.3 的缺陷 ──────────
     台阶要连续 STEP_KEEP 窗才认账，可Баланс在**到账那一窗**就已经变了。
     不把「已看到、还没确认」的部分先计入 T，Пополнить必然让那一窗
       S = V + T 少掉一整笔Пополнить额 → E 直接飙到Пополнить额那么大
     → 再叠上「E ≥ 2 即Сегодня锁存Недостоверно」，**每一次Пополнить都会把当天锁死**。

     所以：待确认的台阶按整数先计入 T_eff。它只是本窗的临时量，
     不给Автоматический подсчёт、不落库（下一窗要么被确认真台阶，要么自己消失）。

     ⚠️ 必须用**原始 R**，不能用滤波后的 M：M 滞后一窗（3 窗中位数里
     要有两个高值才抬起来），用它救不了到账那一窗 —— 而那正是出问题的窗。 */
  const rawStep = round4(R - rBaseline);
  /* 临时值同样受"Баланс должен увеличиться"约束 —— 否则它会在到账那一窗偷偷把 T 抬起来 */
  const pending = (hasBaseline && rawStep >= STEP_MIN && mayBeTopUp) ? Math.round(rawStep) : 0;

  /* 跨日"Без переноса"：用户手填的Пополнить值当天有效，**过了零点归零**。
     否则新一天的 T 会从昨天的手填值起步，S 直接虚高。 */
  if (manualTopUpReset) {
    appliedManual = 0;
    autoAtManual = 0;
  } else if (Number(state.manualTopUp) !== appliedManual) {
    /* 手动修正：客户端写入 manualTopUp 后宿主在这里认领 —— 记下当时的Автоматический подсчёт，
       之后的自动识别只累加**增量**（用户定的语义：直接覆盖，然后继续叠）。 */
    appliedManual = Number(state.manualTopUp);
    autoAtManual = autoTopUp;
  }

  const manualTopUp = manualTopUpReset ? 0 : Number(state.manualTopUp);
  const confirmed = manualTopUp >= 0
    ? round4(manualTopUp + (autoTopUp - autoAtManual))
    : autoTopUp;
  /* 显示与算账都用含 pending 的值 —— 否则面板上的 T 和 S 口径不一致 */
  const topUpTotal = round4(confirmed + pending);

  const { balanceDelta, todaySpent } = accountTotals(dayFirstBalance, total, topUpTotal);

  /* ★ v4.0.7：把「其它端消费」从Расхождение里分出去。
     账号Баланс是**账号级**的：同一个 key 账号下，电脑端 / 手机端 / 任何别的客户端
     花的钱都会让Баланс下降，而 L 只是**本机**的估算。以前用 E = |S − L| 一把抓，
     于是「在电脑上干活」会被判成指标Недостоверно —— 实测 2026-09-20 当晚就是这么锁死的：
     本机 L=14.85、账号 S=18.35，差的 3.5 全是电脑端花的，E 却连续 18 窗 ≥ 2。

     正确的切法利用一个恒等式：**账号总共花的 ≥ 本机花的**，所以
       S > L → 差额是别的客户端花的（Норма，显示出来即可）
       L > S → 本机估算高出账号总额（**不可能**，除非本机多算/重复计费）→ 这才是异常
     判定权仍然只有一处：这里。 */
  const split = splitResidual(todaySpent, localToday);
  otherSpent = split.otherSpent;                                     /* O */
  const residual = split.residual;                                   /* E */

  /* ── 三档告警（`计费算法说明.md` §7.2）──────────────────────
     前提：**Пополнения сверены с оплатой**。Пополнить识别错误是预期内、不可解的，由手动修正
     兜底，不算Недостоверно —— 填对之后 E = max(0, ε − M)，那项Расхождение从 E 里彻底出局。

       Жёлтый：E ≥ 0.6 加一；E < 0.4 归零；0.4–0.6 之间保持（滞回带，防闪Жёлтый）
       Красный：E > 1.2 加一，否则归零
       只升不降：今天Красный了就不回Жёлтый；灰永久，永不回退
       灰：连续 3 个自然日都Был красный уровень（累加发生在跨日那一段） */
  if (residual > ALERT_RED) redStreak += 1; else redStreak = 0;
  if (residual >= ALERT_YELLOW) yellowStreak += 1;
  else if (residual < ALERT_YELLOW_EXIT) yellowStreak = 0;
  if (yellowStreak > ALERT_STREAK) yellowStreak = ALERT_STREAK;
  if (redStreak >= ALERT_STREAK) {
    redStreak = ALERT_STREAK;
    todayHadRed = 1;
  }
  if (grayAt === 0 && redDayStreak >= ALERT_GRAY_DAYS) {
    /* 连续三天都Красный → 判为永久Ошибка：口径已经不成立（例如官方改了计费规则）。
       我们不是官方，做不出自更新的插件 → 它就该一直亮着，直到有人去改代码。
       唯一出口是"Увеличить RULE_VERSION"，那条迁移会把它清掉。 */
    grayAt = Number(state.at) > 0 ? Number(state.at) : 1;
  }
  if (grayAt > 0) {
    alertLevel = 'gray';
  } else if (redStreak >= ALERT_STREAK) {
    alertLevel = 'red';
  } else if (yellowStreak >= ALERT_STREAK) {
    if (alertLevel !== 'red') alertLevel = 'yellow';
  } else if (alertLevel === 'yellow') {
    alertLevel = 'none';                   /* Жёлтый是可恢复的 */
  }

  const next = {
    dayKey, dayFirstBalance, localToday, balanceDelta, autoTopUp, topUpTotal,
    residual, otherSpent, ruleVersion: RULE_VERSION, topUp, pendingTopUp: pending,
    appliedManual, autoAtManual,
    alertLevel, yellowStreak, redStreak, redDayStreak, lastRedDayKey, grayAt, todayHadRed,
    /* 用字符串返回，和读入的形态一致 —— 否则调用方（或测试）直接回喂时会丢历史 */
    rHistory: JSON.stringify(rHistory),
    rBaseline, hasBaseline: hasBaseline ? 1 : 0, stepStreak, R, M, step, todaySpent,
  };
  /* 跨日"Без переноса"要把手填值清掉 —— 只在需要时带上这个键，
     免得 `{...state, ...accountDay(...)}` 回放时把字段设成 undefined。 */
  if (manualTopUpReset) next.manualTopUp = 0;
  return next;
}

/**
 * 刷新一次并写回命名空间。失败只记 error，保留上一次的数字不抹掉。
 * @param ctx - 宿主上下文。
 * @param scope - 本插件的设置作用域。
 * @returns 是否应该短间隔重试（依赖服务还没就位），而不是等下一个Норма周期。
 */
async function refresh(ctx, scope) {
  const current = scope.get();
  const now = Date.now();
  const dayKey = bjDayKey(now);

  let patch;
  try {
    const { total, currency } = await fetchBalance(ctx);
    const previous = current.balance;          /* 上一次查到的Баланс；-1 = 还没查过 */
    /* 比上次多出这么多 → 是Пополнить/赠金到账，不是消费。
       四舍五入到 4 位：Баланс是两位小数的字符串，直接相减会有浮点噪声
       （68.46 - 20.46 = 47.99999999999999），会让档位比较在边界上判错。 */
    const increase = previous >= 0 ? round4(total - previous) : 0;

    /* 本地记账窗口 = витков询间隔，这样「这个窗口花了多少」正好对上Баланс变化 */
    meter.windowMs = Math.max(1, Number(current.refreshMinutes) || 5) * 60000;
    const local = windowSpend(now);

    /* ── 停机窗口 = 它端消费的直接证据 ─────────────────────────
       宿主进程没在跑的时候，这台设备**不可能**产生任何调用（宿主就是 agent 运行时）。
       所以一个跨了停机时间的窗口里，Баланс下降只可能来自别处。
       判据：距上一次轮询的时间差远大于轮询间隔。

       `away` 窗口有两个用途：① 拟合时必须排除（那一段本端账本天然是空的，
       混进去会把回归拉偏）；② 它就是「有没有别的端在花钱」的实测答案。 */
    const dt = current.at > 0 ? now - Number(current.at) : 0;
    const away = current.at > 0 && dt > meter.windowMs * 1.5;

    /* ── Сегодня账（v4）──────────────────────────────────────────
       等式：B_现 = B_首 + T − L − O     （O = 它端消费 / 本地漏记 / 结算延迟）

         V（Баланс变动值） = B_首 − B_现            正 = 钱变少；充了值就是负的
         S（Расход сегодня）   = V + T
         E（Расхождение）       = |S − L| = |T − R|      R 见下

       注意 E = |T − R|：**只要 T 是由 R 自己取整出来的，E 就恒 ≤ 0.5**，
       于是「其它端消费」会被静默吃进 T 而 E 什么都看不见。所以 T 必须来自
       **独立观测到的台阶**，不能写成 round(R)。这条是这套口径的全部要害。

       具体算法在 accountDay()（纯函数，可脱离网络单测）。 */
    const day = accountDay(current, total, local.point, dayKey, { balanceRose: increase > 0 });

    /* 这一窗口的账，记进对账日志（dbgLog，最近 100 窗）。 */
    const record = {
      t: now,
      dt,
      away: away ? 1 : 0,
      /* 本窗口的口径消费与Сегодня账 */
      local: local.point,
      delta: increase,
      balance: total,
      dayFirst: day.dayFirstBalance,
      localToday: day.localToday,
      /* 认Пополнить */
      step: day.step,
      topUp: day.topUp,
      pending: day.pendingTopUp,
      autoTopUp: day.autoTopUp,
      topUpTotal: day.topUpTotal,
      /* 派生量与告警档 */
      V: day.balanceDelta,
      S: day.todaySpent,
      E: day.residual,
      other: day.otherSpent,
      alert: day.alertLevel,
    };
    patch = {
      balance: total,
      currency,
      dayKey,
      todaySpent: day.todaySpent,
      at: now,
      error: '',
      dayFirstBalance: day.dayFirstBalance,
      localToday: day.localToday,
      balanceDelta: day.balanceDelta,
      autoTopUp: day.autoTopUp,
      topUpTotal: day.topUpTotal,
      residual: day.residual,
      otherSpent: day.otherSpent,
      alertLevel: day.alertLevel,
      yellowStreak: day.yellowStreak,
      redStreak: day.redStreak,
      redDayStreak: day.redDayStreak,
      lastRedDayKey: day.lastRedDayKey,
      grayAt: day.grayAt,
      todayHadRed: day.todayHadRed,
      /* 跨日"Без переноса"：手填值归零要真的写回设置，否则客户端输入框还显示昨天的数 */
      ...(day.manualTopUp === undefined ? {} : { manualTopUp: day.manualTopUp }),
      topUp: day.topUp,
      pendingTopUp: day.pendingTopUp,
      appliedManual: day.appliedManual,
      autoAtManual: day.autoAtManual,
      rHistory: day.rHistory,
      rBaseline: day.rBaseline,
      hasBaseline: day.hasBaseline,
      stepStreak: day.stepStreak,
      windowSpend: local.point,
      /* 这一窗的合法值已经就位 → 清掉提交预览（下一窗之间不再顶替显示）。 */
      previewAt: 0,
      previewSampleAt: 0,
      previewTopUp: -1,
      previewBalance: -1,
      previewDayFirst: -1,
      previewTodaySpent: -1,
      previewOtherSpent: -1,
      dbgLog: appendDebug(current.dbgLog, record),
    };
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.serviceNotReady === true) {
      /* 服务没就位：什么都不写，保持现状（多半是启动后头几秒）。 */
      return true;
    }
    patch = {
      /* ⚠️ 这里**不能**写 dayKey。跨日重锚是靠 `state.dayKey !== dayKey` 判断的
         （见 accountDay），要是查询失败也把 dayKey 推进一天，而基准还是昨天的，
         第二天成功时就会认为「今天已经打过基准了」，一整天用错基准。
         失败时只挪 at（停机判据要用）和 error。 */
      at: now,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const settings = ctx.get('settings');
  if (settings === undefined) return true;
  try {
    await settings.update(NS, { ...current, ...patch });
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-peak-chip] Не удалось сохранить настройки: ${String(error)}`);
  }
  return false;
}

/**
 * 读 3090 桥的 token（只读一次，失败不缓存空值以便下次重试）。
 * @returns token 字符串，读不到时为空串。
 */
let bridgeToken = null;
async function readBridgeToken() {
  if (bridgeToken !== null) return bridgeToken;
  try {
    /* 走 $DSH_HOME 解析，不写死 /root/.dsh —— 电脑那一端根本没有这个路径 */
    const raw = await readFile(join(resolveDshHome(), BRIDGE_TOKEN_FILE), 'utf8');
    const token = raw.trim();
    if (token.length > 0) bridgeToken = token;
    return token;
  } catch {
    return '';
  }
}

/**
 * 请 App 用系统浏览器打开官方Пополнить页。
 *
 * 浏览器半边没法直连 3090 桥（跨源 + Недоступно token），所以由宿主代发这一枪。
 * @param ctx - 宿主上下文。
 */
async function openTopUpPage(ctx) {
  try {
    const token = await readBridgeToken();
    if (token.length === 0) {
      ctx.logger?.warn?.('[dsh-peak-chip] Токен подключения недоступен; страница пополнения не открыта');
      return;
    }
    const url = `${BRIDGE_OPEN_URL}?url=${encodeURIComponent(TOPUP_URL)}&token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) ctx.logger?.warn?.(`[dsh-peak-chip] Страница пополнения: HTTP ${response.status}`);
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-peak-chip] Не удалось открыть страницу пополнения: ${String(error)}`);
  }
}

/**
 * 注册命名空间并按间隔轮询。用自排队的 setTimeout 而不是 setInterval，
 * 这样改了 refreshMinutes 下一轮就生效，也不会因为一次慢请求堆叠。
 * @param ctx - 宿主上下文。
 * @param config - 本行的组合配置。
 */
export function apply(ctx, config) {
  /* 重新挂载时清空记账窗口：别把上一次挂载的旧账带进新窗口。 */
  meter.recent.length = 0;
  meter.model = '';

  /* 本地记账：跟宿主的会话事件流，逐次把 provider 上报的用量折成钱。
     这个监听不属于设置作用域，单独注册、单独收拾。 */
  ctx.effect(
    () => ctx.on('session/event', (session, event) => {
      try {
        if (event !== null && event !== undefined) recordUsage(event);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-peak-chip] Ошибка учёта расходов: ${String(error)}`);
      }
    }),
    'dsh-peak-chip: usage meter',
  );

  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(NS, Config, { base: config ?? {} });
    let timer = null;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      let retry = false;
      try {
        retry = await refresh(ctx, scope);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-peak-chip] Ошибка обновления баланса: ${String(error)}`);
      }
      if (stopped) return;
      const minutes = Math.max(1, Number(scope.get().refreshMinutes) || 5);
      timer = setTimeout(tick, retry ? RETRY_MS : minutes * 60 * 1000);
    };

    /** 写回设置（预览用；Норма窗在 refresh() 里自己写）。 */
    const writeSettings = async (fields) => {
      const service = ctx.get('settings');
      if (service === undefined) return;
      try {
        await service.update(NS, { ...scope.get(), ...fields });
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-peak-chip] Не удалось сохранить предпросмотр: ${String(error)}`);
      }
    };

    /* 把自己的位置告诉客户端：路径因实例而异，客户端只能显示、不能推算。
       启动时写一次就够（写失败只影响"Запросить исправление"提示词里的路径，不影响记账）。 */
    void writeSettings({ selfDir: SELF_DIR, manualPath: SELF_MANUAL });

    /* 一次只跑一个预览；跑的过程中又来请求，就合并成「跑完再来一轮」（用户连点两次
       不应该叠出两个采样）。 */
    let previewing = false;
    let previewQueued = false;

    /**
     * 手填值提交时立刻生成一组**只用于显示**的预览数字（A′ 方案）。
     * 两步：① 先把「你刚填的数」顶上去（不需要网络）；② 单独取一次Баланс，补齐 S/O/Баланс。
     * 取不到Баланс时只留第①步 —— 手填值照样立刻可见，S 等下一窗。
     */
    const runPreview = async () => {
      if (previewing) { previewQueued = true; return; }
      previewing = true;
      try {
        do {
          previewQueued = false;
          const at = Date.now();
          const manualTopUp = Number(scope.get().manualTopUp);
          await writeSettings({
            previewAt: at, previewSampleAt: 0, previewTopUp: manualTopUp,
            previewBalance: -1, previewDayFirst: -1, previewTodaySpent: -1, previewOtherSpent: -1,
          });
          if (stopped) return;
          let total = NaN;
          try {
            const got = await fetchBalance(ctx);
            total = got.total;
          } catch (error) {
            /* 不是Ошибка：预览只是"Предварительная проверка"，取不到就等下一窗的正式值。 */
            ctx.logger?.warn?.(`[dsh-peak-chip] Не удалось получить баланс для предпросмотра: ${String(error)}`);
          }
          if (!Number.isFinite(total)) continue;
          const state = scope.get();
          const knownFirst = Number(state.dayFirstBalance);
          /* 还没有Сегодня锚点（刚跨日、或插件刚装上）→ 就用这次采样当锚点，
             和Норма窗第一窗的行为一致。 */
          const dayFirstBalance = knownFirst > 0 ? knownFirst : total;
          const preview = previewTotals({
            dayFirstBalance,
            balance: total,
            manualTopUp,
            autoTopUp: Number(state.autoTopUp),
            localToday: Number(state.localToday),
          });
          await writeSettings({
            previewAt: at, previewSampleAt: Date.now(), previewTopUp: preview.topUpTotal,
            previewBalance: total, previewDayFirst: dayFirstBalance,
            previewTodaySpent: preview.todaySpent, previewOtherSpent: preview.otherSpent,
          });
        } while (previewQueued && !stopped);
      } finally {
        previewing = false;
      }
    };

    /* 客户端的两条请求通道（都只认「时间戳变大」，初始化成当前值，
       免得重启后把上一次的请求补做一遍）：
         ① openTopUp   点「Пополнить」  → 宿主代开官方Пополнить页；
         ② previewNow  提交手填值 → 宿主**单独取一次Баланс**，写一组只用于显示的预览数字。
        ⚠️ 这里**不**补跑一个临时窗口：那会在中位数滤波里插一个不规则的采样点，还会把
           stepStreak 往前推 —— 显示快 1~2 с，不值得动账。 */
    let lastTopUp = Number(scope.get().openTopUp) || 0;
    let lastPreview = Number(scope.get().previewNow) || 0;
    const unwatch = typeof scope.watch === 'function' ? scope.watch(() => {
      const stamp = Number(scope.get().openTopUp) || 0;
      if (stamp > lastTopUp) {
        lastTopUp = stamp;
        void openTopUpPage(ctx);
      }
      const request = Number(scope.get().previewNow) || 0;
      if (request > lastPreview) {
        lastPreview = request;
        void runPreview();
      }
    }) : null;

    void tick();

    settingsCtx.effect(() => () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      if (typeof unwatch === 'function') unwatch();
    }, 'dsh-peak-chip: balance poll');
  });
}
