import { defineTool } from '@deepseek-ai/dsh-tools';
import { settleRun } from '@deepseek-ai/dsh-subagent';
/** Render text blocks from the canonical JSON block array without trusting arbitrary values. */
function outputValueText(values) {
    return values
        .filter((value) => typeof value === 'object' && value !== null && !Array.isArray(value)
        && value.type === 'text' && typeof value.text === 'string')
        .map(value => value.text)
        .join('');
}
/** Settle pending startup without rejecting the task producer contract. */
async function settleStart(start, signal) {
    try {
        return await settleRun(await start);
    }
    catch (error) {
        return signal.aborted
            ? { status: 'killed' }
            : { status: 'failed', detail: String(error) };
    }
}
/** A non-`completed` stop reason means the child did not finish cleanly. */
function stopReasonError(result) {
    switch (result.stopReason) {
        case 'completed':
            return undefined;
        case 'aborted':
            return 'subagent run was cancelled';
        case 'error':
            return 'subagent run failed';
        case 'max-tokens':
            return 'subagent run hit its token limit before finishing';
        case 'refusal':
            return 'subagent declined the task';
        default:
            return `subagent run ended abnormally (${String(result.stopReason)})`;
    }
}
/** Append the child's preserved partial answer to a stop-reason error. */
function withPartialText(error, output) {
    const text = output
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('');
    return text.length === 0 ? error : `${error}\nPartial output before the run ended:\n${text}`;
}
/** Task markers that push the auto tier toward `complex`. */
const COMPLEX_MARKERS = [
    /```|=>|#include|require\(/,
    /\b(function|class|interface|import|export|const|def)\s/,
    /\b(JSON|schema|structured|matrix|architecture|algorithm)\b/i,
    /\b(analy[sz]e|architect|design|optimize|debug|refactor|synthesi[sz]e|evaluate|investigate|research|derive|proof|implement|migrate|complex)\b/i,
];
/** Model-id signals for a strong / reasoning model. */
const STRONG_MODEL = /\b(pro|max|reason|think|ultra|code|turbo|large|deep)\b/i;
/** Model-id signals for a cheap / fast model. */
const LIGHT_MODEL = /\b(flash|mini|lite|fast|small|quick|nano|light)\b/i;
/** Classify a delegation task into the auto-selection tier. */
function classifyTier(description, prompt) {
    const task = `${description}\n${prompt}`;
    if (task.length >= 1200 || COMPLEX_MARKERS.some(marker => marker.test(task)))
        return 'complex';
    if (task.length <= 160)
        return 'trivial';
    return 'standard';
}
/** One-line justification of a tier for the audit reason. */
function tierNote(tier) {
    switch (tier) {
        case 'trivial':
            return 'short task without heavy markers';
        case 'complex':
            return 'long task or heavy markers (code / structured output / reasoning verbs)';
        case 'standard':
            return 'ordinary task length and content';
    }
}
/** Naming-based strength score: +1 strong signals, -1 cheap signals. */
function modelScore(id) {
    let score = 0;
    if (STRONG_MODEL.test(id))
        score += 1;
    if (LIGHT_MODEL.test(id))
        score -= 1;
    return score;
}
/** Pick the catalog model best matching a tier (ties keep catalog order). */
function pickModel(models, tier) {
    if (models.length === 0)
        return undefined;
    const scored = models.map(model => ({ id: model.id, score: modelScore(model.id) }));
    switch (tier) {
        case 'trivial': {
            const min = Math.min(...scored.map(entry => entry.score));
            return scored.find(entry => entry.score === min);
        }
        case 'complex': {
            const max = Math.max(...scored.map(entry => entry.score));
            return scored.find(entry => entry.score === max);
        }
        case 'standard':
            return scored.find(entry => entry.score === 0) ?? scored[0];
    }
}
/** One-tier escalation ladder; the top tier has no next tier. */
const NEXT_TIER = {
    trivial: 'standard',
    standard: 'complex',
    complex: undefined,
};
/** Append the audit line for an auto decision to a tool render. */
function autoRender(auto) {
    if (auto === undefined)
        return '';
    const escalation = auto.escalatedFrom === undefined ? '' : ` (повышен уровень с ${auto.escalatedFrom})`;
    return `\n[auto] provider=${auto.provider} model=${auto.model} tier=${auto.tier}${escalation}\nПричина: ${auto.reason}`;
}
/** Output-schema fragment for the auditable auto decision. */
const AUTO_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        provider: { type: 'string', required: true },
        model: { type: 'string', required: true },
        tier: { type: 'string', required: true },
        reason: { type: 'string', required: true },
        escalatedFrom: { type: 'string' },
    },
};
/**
 * Resolve `model: "auto"` against the provider catalog. The provider is the
 * explicit argument, else the calling agent's own route (`parent.options`).
 * Catalog membership is advisory, so the resolved id is only a pick: the
 * provider still owns rejection, exactly as with an explicit model.
 */
async function resolveAutoSelection(ctx, args, parentProvider, toolName) {
    const llm = ctx.get('llm');
    if (llm === undefined) {
        throw new Error(`${toolName}: model "auto" requires the llm service (no ctx.llm registered)`);
    }
    const provider = args.provider ?? parentProvider;
    if (provider === undefined) {
        throw new Error(`${toolName}: model "auto" needs a provider route — pass "provider" explicitly, or call from an agent `
            + 'whose options name one (parent.options.provider)');
    }
    const routes = llm.listProviders();
    if (!routes.some(route => route.id === provider)) {
        const known = routes.map(route => route.id).join(', ');
        throw new Error(`${toolName}: model "auto": unknown provider "${provider}" — registered provider routes: ${known || '(none)'}`);
    }
    let models;
    try {
        models = await llm.listModels(provider);
    }
    catch (cause) {
        throw new Error(`${toolName}: model "auto" could not list models for provider "${provider}": ${String(cause)}`);
    }
    const tier = classifyTier(args.description, args.prompt);
    const picked = pickModel(models, tier);
    if (picked === undefined) {
        throw new Error(`${toolName}: model "auto": provider "${provider}" advertises no models`);
    }
    const decision = {
        provider,
        model: picked.id,
        tier,
        reason: `auto policy: task classified "${tier}" (${tierNote(tier)}), picked "${picked.id}" from provider "${provider}"`,
    };
    const nextTier = NEXT_TIER[tier];
    let escalation;
    if (nextTier !== undefined) {
        const escalationPick = pickModel(models, nextTier);
        if (escalationPick !== undefined && escalationPick.id !== picked.id) {
            escalation = {
                id: escalationPick.id,
                tier: nextTier,
                reason: `auto escalation: retry on "${escalationPick.id}" (${nextTier} tier) after a failed foreground run`,
            };
        }
    }
    return { decision, escalation };
}
/** Collect and release one foreground run without letting disposal replace an independent result failure. */
async function settleForegroundRun(run) {
    const [execution] = await Promise.allSettled([
        run.result.then((result) => {
            const error = stopReasonError(result);
            if (error !== undefined) {
                throw new Error(withPartialText(error, result.output));
            }
            return {
                kind: 'foreground',
                runId: run.id,
                output: result.output,
            };
        }),
    ]);
    const [disposal] = await Promise.allSettled([Promise.resolve().then(() => run.dispose())]);
    if (execution.status === 'rejected') {
        if (disposal.status === 'rejected') {
            throw new AggregateError([execution.reason, disposal.reason], `subagent run failed: ${String(execution.reason)}; dispose failed: ${String(disposal.reason)}`);
        }
        throw execution.reason;
    }
    if (disposal.status === 'rejected')
        throw disposal.reason;
    return execution.value;
}
/** Resolve the model's optional scheduling request into one execution route. */
function resolveDelegationRun(request, options) {
    if (!options.backgroundEnabled) {
        // The schema permits undeclared keys, so omission also needs execution-time enforcement.
        if (request.run_in_background === true) {
            throw new Error('run_in_background is disabled for this tool instance (enableRunInBackground: false)');
        }
        return { runInBackground: false };
    }
    return {
        runInBackground: request.run_in_background ?? options.continuable,
    };
}
/**
 * Register the model-facing tools into `ctx.tools`. Returns the disposer that
 * unregisters both, owned by the caller's fiber.
 */
export function registerModelPickerTools(ctx, config) {
    const backgroundEnabled = config.enableRunInBackground;
    const continuable = config.backgroundMode === 'continuable';
    const maxDepth = typeof config.maxDepth === 'number' ? config.maxDepth : undefined;
    const enableAuto = config.enableAuto;
    const autoEscalate = config.autoEscalate;
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: config.toolName,
        description: 'Передать самостоятельную задачу субагенту с отдельным контекстом. Укажите provider и model для выбора модели; без них используется модель родительского агента. model: "auto" выбирает модель по сложности из каталога, записывает причину и при ошибке повторяет работу на следующем уровне. Каталог: ' + config.modelsToolName + '. Передайте полный промпт: субагент не видит этот диалог.'
            + (backgroundEnabled ? (continuable ? ' По умолчанию возвращает постоянный ID фонового субагента. После завершения приходит уведомление. send_message запускает следующий виток. run_in_background: false ожидает результат.' : ' По умолчанию ожидает результат. run_in_background: true возвращает ID фонового задания; результат — job_output, остановка — job_kill.') : ' Ожидает завершения и возвращает результат.'),
        parameters: {
            description: {
                type: 'string',
                required: true,
                description: 'Краткое название задачи, 3–5 слов.',
            },
            prompt: {
                type: 'string',
                required: true,
                description: 'Полное задание для субагента. Включите необходимые сведения: он не видит этот диалог.',
            },
            provider: {
                type: 'string',
                description: 'Провайдер модели, например deepseek-official. По умолчанию наследуется провайдер родителя. Каталог: ' + config.modelsToolName + '.',
            },
            model: {
                type: 'string',
                description: 'ID модели либо "auto" для выбора по сложности задачи. По умолчанию наследуется модель родителя. Каталог: ' + config.modelsToolName + '.',
            },
            max_tokens: {
                type: 'integer',
                description: 'Лимит выходных токенов, положительное целое число. Без значения наследуется лимит родителя.',
            },
            ...backgroundEnabled ? {
                run_in_background: {
                    type: 'boolean',
                    description: continuable
                        ? 'Работать в фоне и сразу вернуть постоянный ID субагента. По умолчанию true. false ожидает результат.'
                        : 'Работать в фоне и вернуть ID задания. По умолчанию false. Результат: job_output, остановка: job_kill.',
                },
            } : {},
        },
        output: {
            schema: {
                oneOf: [
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            kind: { type: 'string', required: true, const: 'background' },
                            jobId: { type: 'string', required: true },
                            auto: AUTO_SCHEMA,
                        },
                    },
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            kind: { type: 'string', required: true, const: 'continuable' },
                            subagentId: { type: 'string', required: true },
                            auto: AUTO_SCHEMA,
                        },
                    },
                    {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            kind: { type: 'string', required: true, const: 'foreground' },
                            runId: { type: 'string', required: true },
                            output: { type: 'array', required: true, items: { type: 'json' } },
                            auto: AUTO_SCHEMA,
                        },
                    },
                ],
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: (value.kind === 'background'
                        ? `Запущено фоновое задание субагента ${value.jobId}`
                        : value.kind === 'continuable'
                            ? `Запущен субагент ${value.subagentId}`
                            : outputValueText(value.output))
                        + autoRender(value.auto),
                }],
        },
        // Children never mutate the parent session; the one parent-owned write
        // (tasks.start) is a synchronous commutative insertion.
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const parent = exec.agent;
            if (!parent) {
                throw new Error(`${config.toolName} tool requires a calling agent (exec.agent was undefined)`);
            }
            // ---- per-call model route ----
            const agentOptions = {};
            let autoSelection;
            if (args.model === 'auto') {
                if (!enableAuto) {
                    throw new Error(`${config.toolName}: model "auto" is disabled on this instance (enableAuto: false)`);
                }
                autoSelection = await resolveAutoSelection(ctx, args, parent.options?.provider, config.toolName);
                agentOptions.provider = autoSelection.decision.provider;
                agentOptions.model = autoSelection.decision.model;
            }
            else {
                if (args.provider !== undefined) {
                    const llm = ctx.get('llm');
                    if (llm === undefined) {
                        throw new Error(`${config.toolName}: provider selection requires the llm service (no ctx.llm registered)`);
                    }
                    const routes = llm.listProviders();
                    if (!routes.some(route => route.id === args.provider)) {
                        const known = routes.map(route => route.id).join(', ');
                        throw new Error(`${config.toolName}: unknown provider "${args.provider}" — registered provider routes: ${known || '(none)'}`);
                    }
                    agentOptions.provider = args.provider;
                }
                if (args.model !== undefined) {
                    if (args.model.length === 0)
                        throw new Error(`${config.toolName}: model must be a non-empty string`);
                    agentOptions.model = args.model;
                }
            }
            if (args.max_tokens !== undefined) {
                if (!Number.isSafeInteger(args.max_tokens) || args.max_tokens <= 0) {
                    throw new Error(`${config.toolName}: max_tokens must be a positive integer`);
                }
                agentOptions.maxTokens = args.max_tokens;
            }
            const request = {
                label: args.description,
                prompt: [{ type: 'text', text: args.prompt }],
                parent,
                agentOptions,
                ...maxDepth !== undefined ? { maxDepth } : {},
            };
            const runSpec = resolveDelegationRun(args, { backgroundEnabled, continuable });
            const auto = autoSelection?.decision;
            if (runSpec.runInBackground) {
                if (continuable) {
                    // Resolves at inbox acceptance: the child owns its own turns from
                    // there, so this call neither waits for nor collects a result.
                    const started = await ctx.subagents.startContinuable({
                        provider: config.subagentProvider,
                        label: args.description,
                        request,
                        signal: exec.signal,
                    });
                    return {
                        kind: 'continuable',
                        subagentId: String(started.childId),
                        ...auto !== undefined ? { auto } : {},
                    };
                }
                const jobs = ctx.get('jobs');
                if (jobs === undefined) {
                    throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs');
                }
                const id = jobs.start({
                    kind: 'subagent',
                    label: args.description,
                    owner: parent,
                    run: () => {
                        const controller = new AbortController();
                        const start = ctx.subagents.start(config.subagentProvider, { ...request, signal: controller.signal });
                        return {
                            cancel: (reason) => {
                                controller.abort(reason ?? 'background subagent task killed');
                            },
                            done: settleStart(start, controller.signal),
                        };
                    },
                });
                return { kind: 'background', jobId: id, ...auto !== undefined ? { auto } : {} };
            }
            const run = await ctx.subagents.start(config.subagentProvider, {
                ...request,
                signal: exec.signal,
            });
            // Escalation applies only when the run outcome is visible here (foreground)
            // and the policy resolved a strictly stronger model for the next tier.
            if (autoSelection === undefined || autoSelection.escalation === undefined || !autoEscalate) {
                const settled = await settleForegroundRun(run);
                return {
                    ...settled,
                    ...auto !== undefined ? { auto } : {},
                };
            }
            try {
                const settled = await settleForegroundRun(run);
                return {
                    ...settled,
                    ...auto !== undefined ? { auto } : {},
                };
            }
            catch (firstError) {
                if (exec.signal.aborted)
                    throw firstError;
                const escalation = autoSelection.escalation;
                let retry;
                try {
                    retry = await ctx.subagents.start(config.subagentProvider, {
                        ...request,
                        agentOptions: { ...request.agentOptions, model: escalation.id },
                        signal: exec.signal,
                    });
                }
                catch (startError) {
                    throw new AggregateError([firstError, startError], `${config.toolName}: auto-chosen "${autoSelection.decision.model}" failed and the escalated retry on "${escalation.id}" could not start`);
                }
                try {
                    const settled = await settleForegroundRun(retry);
                    return {
                        ...settled,
                        auto: {
                            ...autoSelection.decision,
                            model: escalation.id,
                            tier: escalation.tier,
                            escalatedFrom: autoSelection.decision.model,
                        },
                    };
                }
                catch (retryError) {
                    throw new AggregateError([firstError, retryError], `${config.toolName}: auto-chosen "${autoSelection.decision.model}" failed and the escalated retry on "${escalation.id}" also failed`);
                }
            }
        },
    })));
    if (config.enableModelList) {
        disposers.push(ctx.tools.register(defineTool({
            name: config.modelsToolName,
            description: 'Показать провайдеров и их каталоги моделей для ' + config.toolName + '. Провайдер может принимать модели вне каталога. provider ограничивает список одним провайдером.',
            parameters: {
                provider: {
                    type: 'string',
                    description: 'Показать только этого провайдера. Без значения показываются все провайдеры.',
                },
            },
            output: {
                schema: { type: 'json' },
                render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
            },
            isConcurrencySafe: () => true,
            async execute(args) {
                const llm = ctx.get('llm');
                if (llm === undefined) {
                    return { providers: [], note: 'Сервис моделей недоступен' };
                }
                const routes = llm.listProviders();
                const wanted = args.provider;
                const providers = [];
                for (const route of routes) {
                    if (wanted !== undefined && route.id !== wanted)
                        continue;
                    let models = [];
                    let error;
                    try {
                        models = (await llm.listModels(route.id)).map(model => ({ id: model.id, name: model.name }));
                    }
                    catch (cause) {
                        error = String(cause);
                    }
                    providers.push({
                        provider: route.id,
                        name: route.name,
                        models,
                        ...error !== undefined ? { error } : {},
                    });
                }
                if (wanted !== undefined && providers.length === 0) {
                    const known = routes.map(route => route.id).join(', ');
                    return { providers: [], note: `unknown provider "${wanted}" — registered provider routes: ${known || '(none)'}` };
                }
                return { providers };
            },
        })));
    }
    return () => {
        for (const dispose of disposers.splice(0))
            dispose();
    };
}
