// 自定义预设保存使用原 Loader 的配置写入；活动会话保留其旧 generation。
async function dshaSavePreset(registry, id, content, expected) {
    if (['standard', 'ptc', 'minimal', 'shell', 'cordis'].includes(id)) throw new Error('Built-in presets are read-only');
    if (typeof content !== 'string' || content.length > 262144 || typeof expected !== 'string')
        throw new Error('Preset document is too large or invalid');
    const record = registry.definitions.get(id);
    if (!record) throw new Error('Preset no longer exists');
    const current = await registry.readDocument(id);
    if (current.content !== expected) throw new Error('Preset changed. Reopen it before saving');
    const plugins = load(content, {schema: entryListSchema});
    const problem = entryListProblem(plugins);
    if (problem) throw new Error(problem);
    const entry = record.context.fiber.entry;
    if (!entry || entry.options.config?.id !== id || entry.options.name !== '@deepseek-ai/dsh-agent-preset'
        || typeof entry.parent.tree.writeFile !== 'function' || entry.parent.tree.readonly
        || typeof entry.parent.tree.write !== 'function'
        || typeof entry.parent.tree.flushWrite !== 'function') throw new Error('Preset source is not editable');
    // 保存期间另一写入不能通过相同旧内容；旧注册的 context 也必须仍是当前对象。
    if (registry.definitions.get(id) !== record || (await registry.readDocument(id)).content !== expected)
        throw new Error('Preset changed. Reopen it before saving');
    const previous = entry.options.config;
    await entry.update({config: {...previous, plugins}}, false, true);
    try {
        entry.parent.tree.write();
        await entry.parent.tree.flushWrite();
    }
    catch (error) {
        await entry.update({config: previous}, false, true);
        throw error;
    }
    await registry.owner.loader.await();
    return registry.readDocument(id);
}
