import { assertSubagentMaxDepth } from '@deepseek-ai/dsh-subagent';
import { registerModelPickerTools } from "./tools.js";
/** Prompt order after bounded delegation policy and before child reporting. */
const SUBAGENT_SECTION_ORDER = 116.5;
export const name = 'dsh-subagent-model-picker';
export const inject = ['tools', 'subagents', 'systemPrompt'];
export const defaultConfig = {
    subagentProvider: 'spawn',
    toolName: 'subagent_model',
    modelsToolName: 'subagent_models',
    enableRunInBackground: true,
    backgroundMode: 'one-shot',
    enableModelList: true,
    enableAuto: true,
    autoEscalate: true,
    maxDepth: 3,
};
export function resolveConfig(config) {
    return {
        subagentProvider: config.subagentProvider ?? defaultConfig.subagentProvider,
        toolName: config.toolName ?? defaultConfig.toolName,
        modelsToolName: config.modelsToolName ?? defaultConfig.modelsToolName,
        enableRunInBackground: config.enableRunInBackground ?? defaultConfig.enableRunInBackground,
        backgroundMode: config.backgroundMode ?? defaultConfig.backgroundMode,
        enableModelList: config.enableModelList ?? defaultConfig.enableModelList,
        enableAuto: config.enableAuto ?? defaultConfig.enableAuto,
        autoEscalate: config.autoEscalate ?? defaultConfig.autoEscalate,
        maxDepth: config.maxDepth ?? defaultConfig.maxDepth,
    };
}
export function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    // Direct apply() bypasses any schema defaults; validate here like the
    // shipped tool does.
    if (resolved.maxDepth !== 'provider-managed')
        assertSubagentMaxDepth(resolved.maxDepth);
    const backgroundEnabled = resolved.enableRunInBackground;
    const continuable = resolved.backgroundMode === 'continuable';
    // Mirror provider lifecycle: sibling load order and HMR replacement can
    // change provider availability while this fiber stays active.
    let disposeTools;
    const mount = (provider) => {
        // A numeric cap the provider cannot enforce is a misconfiguration — fail
        // at mount (the earliest point capabilities are known), not on delegation.
        if (typeof resolved.maxDepth === 'number' && !provider.capabilities.depthLimit) {
            throw new Error(`dsh-subagent-model-picker: provider "${provider.name}" cannot enforce maxDepth `
                + `(no depthLimit capability) — set maxDepth: 'provider-managed' to leave the recursion `
                + 'budget to the provider');
        }
        if (continuable && provider.prepareContinuable === undefined) {
            throw new Error(`dsh-subagent-model-picker: provider "${provider.name}" does not support `
                + '`backgroundMode: continuable`');
        }
        disposeTools = registerModelPickerTools(ctx, resolved);
    };
    ctx.on('subagent/provider-added', (provider) => {
        if (provider.name === resolved.subagentProvider && disposeTools === undefined)
            mount(provider);
    });
    ctx.on('subagent/provider-removed', (name) => {
        if (name !== resolved.subagentProvider || disposeTools === undefined)
            return;
        disposeTools();
        disposeTools = undefined;
    });
    const present = ctx.subagents.getProvider(resolved.subagentProvider);
    if (present !== undefined) {
        mount(present);
    }
    else {
        ctx.logger.info(`dsh-subagent-model-picker: subagent provider "${resolved.subagentProvider}" not registered yet; `
            + `the "${resolved.toolName}" tool will register when it appears`);
    }
    if (backgroundEnabled && continuable) {
        // The section follows provider availability without its own manual
        // lifecycle: empty text is omitted while the tool is absent.
        ctx.systemPrompt.section({
            name: `tool:${resolved.toolName}`,
            order: SUBAGENT_SECTION_ORDER,
            text: context => disposeTools === undefined || ctx.tools.get(resolved.toolName, context.scope) === undefined
                ? ''
                : `Use ${resolved.toolName} in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set \`run_in_background: false\` only when your next action depends on that subagent's result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message.`,
        });
    }
}
export default {
    name,
    inject,
    apply,
};
