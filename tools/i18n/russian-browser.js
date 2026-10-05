/* 使用真实 RC2 locale API；插件自己的 effect 继续拥有词典与清理回调。 */
function installDshaRussianLocale(locale) {
    const original = locale.register;
    const originalResolveText=locale.resolveText;
    const resolveText=function(text){ const value=originalResolveText.call(this,text); return this.getSnapshot().active==='ru' && !(text && typeof text==='object' && typeof text.ru==='string') ? (Object.prototype.hasOwnProperty.call(DSHA_PLUGIN_COPY_RU,value) ? DSHA_PLUGIN_COPY_RU[value] : value) : value; };
    if(originalResolveText)locale.resolveText=resolveText;
    const generatedRussian = new Map();
    const placeholders = value => [...String(value).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(',');
    const register = function (ns, dictionaries, dict) {
        const catalog = DSHA_RU_LOCALES[ns];
        if (dictionaries === 'ru' && generatedRussian.has(ns)) {
            generatedRussian.get(ns)();
            generatedRussian.delete(ns);
        }
        if (catalog && dictionaries === 'en' && dict && typeof dict === 'object') {
            const ru = {};
            for (const [key, english] of Object.entries(dict)) {
                const translated = catalog[key];
                if (typeof translated === 'string' && placeholders(english) === placeholders(translated)) ru[key] = translated;
            }
            const removeEnglish = original.call(this, ns, dictionaries, dict);
            if (this.dicts?.get(ns)?.has('ru')) return removeEnglish;
            let removeRussian;
            try { removeRussian = original.call(this, ns, 'ru', ru); }
            catch (error) { removeEnglish(); throw error; }
            generatedRussian.set(ns, removeRussian);
            return () => {
                removeRussian(); removeEnglish();
                if (generatedRussian.get(ns) === removeRussian) generatedRussian.delete(ns);
            };
        }
        if (catalog && dictionaries && typeof dictionaries === 'object' && dictionaries.en && !dictionaries.ru) {
            const ru = {};
            for (const [key, english] of Object.entries(dictionaries.en)) {
                const translated = catalog[key];
                if (typeof translated === 'string' && placeholders(english) === placeholders(translated)) ru[key] = translated;
            }
            return original.call(this, ns, { ...dictionaries, ru });
        }
        return original.call(this, ns, dictionaries, dict);
    };
    locale.register = register;
    const removeLanguage = locale.getSnapshot().locales.some(language => language.id === 'ru')
        ? () => {} : locale.addLanguage({id:'ru', label:'Русский', fallback:'en'});
    return () => {
        if (locale.register === register) locale.register = original;
        if(locale.resolveText===resolveText)locale.resolveText=originalResolveText;
        removeLanguage();
    };
}

/* 原生语言只作用于界面；聊天、文件、模型回复及工具参数保持原文。 */
function installDshaLanguageBridge(locale) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
    const valid = value => value === 'zh' || value === 'en' || value === 'ru';
    const apply = () => {
        const language = window.__DSHA_LANGUAGE__;
        if (!valid(language)) return;
        if (locale.getSnapshot().active !== language) locale.setLocale(language);
        document.documentElement.lang = language;
    };
    window.addEventListener('dsha-language', apply);
    apply();
    return () => window.removeEventListener('dsha-language', apply);
}
