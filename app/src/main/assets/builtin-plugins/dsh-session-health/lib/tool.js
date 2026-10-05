import { defineTool } from '@deepseek-ai/dsh-tools';
import { assess } from "./assess.js";
import { buildCommandText } from "./command.js";
const PARAMETERS = {
    reason: {
        type: 'string',
        description: 'Причина проверки для журнала вызова',
    },
    remainingRounds: {
        type: 'integer',
        description: 'Ожидаемое число оставшихся витков для сравнения стоимости продолжения и новой сессии',
    },
    dependsOnEarly: {
        type: 'boolean',
        description: 'Зависит ли работа от раннего контекста до сжатия? Для большого рефакторинга обычно true',
    },
    earlyDecisionRecorded: {
        type: 'boolean',
        description: 'Записаны ли ранние решения, соглашения и числа в Git или документах? Укажите при dependsOnEarly=true',
    },
    handoffDoc: {
        type: 'string',
        description: 'Файл передачи контекста для проверки восстановления; соответствует /health doc=',
    },
};
const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        severity: {
            type: 'string',
            required: true,
            enum: ['green', 'blue', 'yellow', 'red'],
            description: 'Зелёный — можно продолжать; синий — следите за контекстом; жёлтый — завершите этап; красный — завершите работу',
        },
        recommendation: {
            type: 'string',
            required: true,
            enum: ['continue', 'continue-with-note', 'suggest-switch', 'danger-zone'],
            description: 'Рекомендация с учётом стоимости продолжения и перехода',
        },
        summary: { type: 'string', required: true, description: 'Рекомендация' },
        report: { type: 'string', description: 'Полный отчёт для жёлтого или красного уровня, Markdown' },
        signals: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
                windowPercent: { type: 'number', description: 'Доля окна модели на вход за виток; отсутствует, если неизвестно' },
                tokensPerRound: { type: 'number', description: 'Входные токены за виток; отсутствует, если неизвестно' },
                turns: { type: 'number', description: 'Число витков' },
                messageCount: { type: 'number', description: 'Число сообщений пользователя и ассистента' },
                compactions: { type: 'number', description: 'Число сжатий контекста' },
            },
        },
        handoffReady: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
                isGitRepo: { type: 'boolean', description: 'Есть ли репозиторий Git; отсутствует, если неизвестно' },
                clean: { type: 'boolean', description: 'Чиста ли рабочая копия Git; отсутствует, если неизвестно' },
                uncommittedCount: { type: 'integer', description: 'Число несохранённых изменений; отсутствует, если неизвестно' },
                lastCommit: { type: 'string', description: 'Последний коммит; отсутствует, если неизвестно' },
                hasHandoff: { type: 'boolean', description: 'Готов ли документ передачи; отсутствует, если неизвестно' },
                runningProcesses: { type: 'array', items: { type: 'string' }, description: 'Названия запущенных процессов проекта' },
            },
        },
        cost: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
                cacheHitRate: { type: 'number', description: 'Доля токенов из кэша за сессию, 0…1; совпадает со статистикой под полем ввода' },
                effectivePerRound: { type: 'number', description: 'Оплачиваемые токены за виток с учётом скидки кэша' },
                effectivePerRoundUsd: { type: 'number', description: 'Стоимость витка в долларах' },
                effectivePerRoundCny: { type: 'number', description: 'Стоимость витка в юанях по официальному тарифу' },
                inputPricePerM: { type: 'number', description: 'Цена входа, USD за миллион токенов' },
                inputMissPerMCny: { type: 'number', description: 'Официальная цена входа без кэша, CNY за миллион' },
                inputHitPerMCny: { type: 'number', description: 'Официальная цена входа из кэша, CNY за миллион' },
                inputMissPerMUsd: { type: 'number', description: 'Официальная цена входа без кэша, USD за миллион' },
                inputHitPerMUsd: { type: 'number', description: 'Официальная цена входа из кэша, USD за миллион' },
                pricePeriod: { type: 'string', enum: ['peak', 'offpeak'], description: 'Текущий пиковый или льготный тариф, по пекинскому времени' },
                remainingRounds: { type: 'integer', description: 'Число оставшихся витков, указанное при вызове' },
                expectedTotalTokens: { type: 'number', description: 'Ожидаемые оплачиваемые токены: effectivePerRound × remainingRounds' },
                expectedTotalUsd: { type: 'number', description: 'Ожидаемая стоимость оставшихся витков в долларах' },
                expectedTotalCny: { type: 'number', description: 'Ожидаемая стоимость оставшихся витков в юанях' },
            },
        },
    },
};
/** Replay-safe text projection of the canonical result value. */
function renderToolText(value) {
    if (value.report !== undefined && value.report.length > 0)
        return value.report;
    const s = value.signals;
    if (s === undefined)
        return value.summary ?? 'Проверка здоровья сессии завершена.';
    const parts = [value.summary ?? ''];
    if (s.windowPercent !== undefined)
        parts.push(`Заполнение окна ${s.windowPercent}%`);
    if (s.tokensPerRound !== undefined)
        parts.push(`Вход за виток ${s.tokensPerRound} token`);
    if (s.turns !== undefined)
        parts.push(`${s.turns} витков`);
    if (s.messageCount !== undefined)
        parts.push(`${s.messageCount} сообщений`);
    if ((s.compactions ?? 0) > 0)
        parts.push(`Сжатий ${s.compactions} раз`);
    return parts.filter(Boolean).join('；') + '. Для полного отчёта выполните /health.';
}
/** Build the model-facing tool (config closed over at mount time). */
export function sessionHealthTool(ctx, config) {
    return defineTool({
        name: 'session_health',
        description: 'Оценить здоровье сессии: реальные токены, заполнение окна и стоимость перехода. Проверка только читает данные. Если рекомендуется новая сессия, предоставьте отчёт пользователю.',
        parameters: PARAMETERS,
        output: {
            schema: OUTPUT_SCHEMA,
            render: (_args, value) => [{ type: 'text', text: renderToolText(value) }],
        },
        timeoutMs: 15_000,
        execute: async (args, exec) => {
            const session = exec.agent?.session;
            if (session === undefined) {
                throw new Error('Текущая сессия не найдена: session_health доступен только внутри сессии');
            }
            const report = await assess(ctx, session, exec.agent?.id, exec.signal, config, {
                docName: args.handoffDoc ?? null,
                checkProcesses: true,
                remainingRounds: args.remainingRounds ?? null,
                dependsOnEarly: args.dependsOnEarly,
                earlyDecisionRecorded: args.earlyDecisionRecorded,
            });
            const signals = {};
            if (report.signals.ratio !== null)
                signals.windowPercent = Math.round(report.signals.ratio * 100);
            if (report.signals.total !== null)
                signals.tokensPerRound = report.signals.total;
            if (report.signals.turns !== null)
                signals.turns = report.signals.turns;
            if (report.signals.userMessages !== null || report.signals.assistantMessages !== null) {
                signals.messageCount = (report.signals.userMessages ?? 0) + (report.signals.assistantMessages ?? 0);
            }
            signals.compactions = report.signals.compactions;
            const handoffReady = { runningProcesses: report.handoff.runningProcesses };
            if (report.handoff.isGitRepo !== null)
                handoffReady.isGitRepo = report.handoff.isGitRepo;
            if (report.handoff.clean !== null)
                handoffReady.clean = report.handoff.clean;
            if (report.handoff.uncommittedCount !== null)
                handoffReady.uncommittedCount = report.handoff.uncommittedCount;
            if (report.handoff.lastCommit !== null)
                handoffReady.lastCommit = report.handoff.lastCommit;
            if (report.handoff.hasHandoff !== null)
                handoffReady.hasHandoff = report.handoff.hasHandoff;
            const cost = {};
            if (report.signals.cacheHitRate !== null)
                cost.cacheHitRate = report.signals.cacheHitRate;
            if (report.signals.effectivePerRound !== null)
                cost.effectivePerRound = report.signals.effectivePerRound;
            if (report.signals.effectivePerRoundUsd !== null)
                cost.effectivePerRoundUsd = report.signals.effectivePerRoundUsd;
            if (report.signals.effectivePerRoundCny !== null)
                cost.effectivePerRoundCny = report.signals.effectivePerRoundCny;
            cost.inputPricePerM = report.signals.inputPricePerM;
            if (report.signals.inputMissPerMCny !== null)
                cost.inputMissPerMCny = report.signals.inputMissPerMCny;
            if (report.signals.inputHitPerMCny !== null)
                cost.inputHitPerMCny = report.signals.inputHitPerMCny;
            cost.inputMissPerMUsd = report.signals.inputMissPerMUsd;
            cost.inputHitPerMUsd = report.signals.inputHitPerMUsd;
            if (report.signals.pricePeriod !== null)
                cost.pricePeriod = report.signals.pricePeriod;
            if (args.remainingRounds !== undefined)
                cost.remainingRounds = args.remainingRounds;
            if (report.signals.expectedTotalTokens !== null)
                cost.expectedTotalTokens = report.signals.expectedTotalTokens;
            if (report.signals.expectedTotalUsd !== null)
                cost.expectedTotalUsd = report.signals.expectedTotalUsd;
            if (report.signals.expectedTotalCny !== null)
                cost.expectedTotalCny = report.signals.expectedTotalCny;
            return {
                severity: report.severity,
                recommendation: report.recommendation,
                summary: report.summary,
                ...(report.severity === 'yellow' || report.severity === 'red'
                    ? { report: buildCommandText(report, { minimal: false }) }
                    : {}),
                signals,
                handoffReady,
                cost,
            };
        },
        presentCall: (args) => ({
            card: 'generic',
            title: 'Проверить здоровье сессии',
            kind: 'read',
            rawInput: args.reason ?? '',
        }),
    });
}
