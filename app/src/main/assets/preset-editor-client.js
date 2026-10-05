// Custom presets only: a single YAML draft backs both the prompt and composition views.
function DshaPresetEditor({viewed, editable, save, close, t}) {
    const [draft,setDraft]=react.useState(viewed.content);
    const [busy,setBusy]=react.useState(false);
    const [error,setError]=react.useState('');
    const [full,setFull]=react.useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 767px)').matches);
    const [tab,setTab]=react.useState('prompt');
    const [moduleName,setModuleName]=react.useState('');
    const copy=(ru,en)=>typeof window!=='undefined'&&window.__DSHA_LANGUAGE__==='ru'?ru:en;
    let rows,parseError;
    try { rows=dshaPresetYaml.load(draft,{schema:dshaPresetSchema});if(!Array.isArray(rows)||!rows.every(row=>row&&typeof row==='object'&&typeof row.name==='string'))throw Error('Expected a list of components'); }
    catch(failure){parseError=failure.message;rows=undefined;}
    const prompts=[];
    const seen=new Set();
    const collect=(entries,path=[])=>{if(seen.has(entries)||path.length>64)return;seen.add(entries);entries.forEach((row,index)=>{
        if(!row||typeof row!=='object')return;
        const at=[...path,index];
        if(row.name==='@deepseek-ai/dsh-persona'||row.name==='@deepseek-ai/dsh-agent-prompt')prompts.push({row,at});
        if(row.group&&Array.isArray(row.config))collect(row.config,[...at,'config']);
    });};
    if(rows)collect(rows);
    const update=change=>{
        if(!editable||busy||!rows)return;
        const next=dshaPresetYaml.load(draft,{schema:dshaPresetSchema});change(next);
        setDraft(dshaPresetYaml.dump(next,{schema:dshaPresetSchema,noRefs:true,lineWidth:-1}));setError('');
    };
    const requestClose=()=>{
        if(busy)return;
        if(editable&&draft!==viewed.content&&!window.confirm(copy('Отменить несохранённые изменения?','Discard unsaved changes?')))return;
        close();
    };
    const raw=()=>react_jsx_runtime.jsx('textarea',{'aria-label':copy('Состав режима и prompt','Composition and prompt'),className:'dsha-editor-source',readOnly:!editable,disabled:busy,value:draft,onChange:event=>setDraft(event.target.value),spellCheck:false});
    const button=(label,action,disabled=false,extra={})=>react_jsx_runtime.jsx('button',{type:'button',onClick:action,disabled:disabled||busy,...extra,children:label});
    const saveError=failure=>{
        const message=failure instanceof Error?failure.message:String(failure);
        const known={'Built-in presets are read-only':'Встроенные пресеты доступны только для чтения','Preset document is too large or invalid':'Документ пресета слишком большой или недопустим','Preset no longer exists':'Пресет больше не существует','Preset changed. Reopen it before saving':'Пресет изменился. Откройте его снова перед сохранением','Preset source is not editable':'Источник пресета недоступен для редактирования','Preset save is already running':'Сохранение пресета уже выполняется'};
        return copy(known[message]||'Не удалось сохранить пресет: '+message,message);
    };
    const dirty=editable&&draft!==viewed.content;
    const footer=react_jsx_runtime.jsxs('div',{className:'dsha-preset-editor-actions',children:[
        react_jsx_runtime.jsx('span',{className:'dsha-editor-save-state',role:'status',children:dirty?copy('Есть несохранённые изменения','Unsaved changes'):editable?copy('Изменения применятся к новым сессиям','Changes apply to new sessions'):copy('Встроенный пресет · только просмотр','Built-in preset · read only')}),
        button(t('close'),requestClose),
        editable?button(busy?copy('Сохранение…','Saving…'):copy('Сохранить','Save'),async()=>{
            setBusy(true);setError('');try{await save(viewed.id,draft,viewed.content);close();}catch(failure){setError(saveError(failure));}finally{setBusy(false);}
        },!dirty,{className:'dsha-editor-primary'}):null
    ]});
    return react_jsx_runtime.jsxs(_deepseek_ai_dsh_client_ui_primitives.Modal,{
        open:true,onClose:requestClose,closeLabel:t('close'),title:viewed.title,
        headless:true,

        className:full?'dsha-preset-editor dsha-preset-editor-full':'dsha-preset-editor',
        onKeyDownCapture:event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();requestClose();}},
        children:react_jsx_runtime.jsxs('div',{className:'dsha-editor-layout',children:[
            react_jsx_runtime.jsxs('header',{className:'dsha-editor-header',children:[
                react_jsx_runtime.jsx('h2',{children:viewed.title}),
                react_jsx_runtime.jsxs('div',{className:'dsha-editor-header-actions',children:[
                    button(full?'↙':'⛶',()=>setFull(!full),false,{'aria-label':full?copy('Свернуть','Exit full screen'):copy('На весь экран','Full screen'),'aria-pressed':full,title:full?copy('Свернуть','Exit full screen'):copy('На весь экран','Full screen')}),
                    button('×',requestClose,false,{'aria-label':t('close'),title:t('close')})
                ]})
            ]}),
        react_jsx_runtime.jsxs('div',{className:'dsha-preset-editor-body',children:[
            react_jsx_runtime.jsxs('div',{className:'dsha-editor-tabs',role:'tablist','aria-label':copy('Разделы пресета','Preset sections'),children:[
                button(copy('Промпт','Prompt'),()=>setTab('prompt'),false,{role:'tab','aria-selected':tab==='prompt'}),
                button(copy('Состав','Composition'),()=>setTab('composition'),false,{role:'tab','aria-selected':tab==='composition'})
            ]}),
            error?react_jsx_runtime.jsx('div',{className:'dsha-editor-error',role:'alert',children:error}):null,
            !rows?react_jsx_runtime.jsxs('div',{className:'dsha-editor-section',children:[react_jsx_runtime.jsx('p',{children:copy('Исправьте YAML состава перед сохранением.','Correct the composition YAML before saving.')}),raw()]})
            :tab==='prompt'?react_jsx_runtime.jsxs('div',{className:'dsha-editor-section',role:'tabpanel',children:[
                react_jsx_runtime.jsx('p',{className:'dsha-editor-hint',children:copy('Инструкции агента. Содержимое prompt сохраняется без перевода.','Agent instructions. Prompt content is saved without translation.')}),
                ...prompts.map(({row,at},index)=>react_jsx_runtime.jsxs('section',{className:'dsha-editor-card',children:[
                    react_jsx_runtime.jsx('h3',{children:row.id||copy('Инструкции агента','Agent instructions')}),
                    ...((row.name==='@deepseek-ai/dsh-agent-prompt')?['prompt']:['prefix','suffix']).map(field=>{
                        const value=row.config?.[field]??'';const expression=typeof value!=='string';
                        return react_jsx_runtime.jsxs('label',{className:'dsha-editor-field',children:[
                            react_jsx_runtime.jsx('span',{children:field==='suffix'?copy('Дополнение к инструкциям','Instruction suffix'):copy('Основной промпт','Main prompt')}),
                            react_jsx_runtime.jsx('textarea',{'aria-label':(field==='suffix'?copy('Дополнение к инструкциям','Instruction suffix'):copy('Основной промпт','Main prompt'))+(prompts.length>1?' '+(index+1):''),readOnly:!editable||expression,disabled:busy,value:expression?dshaPresetYaml.dump(value,{schema:dshaPresetSchema}):value,spellCheck:false,rows:field==='suffix'?3:8,onChange:event=>update(next=>{const target=at.reduce((current,key)=>current[key],next);target.config={...target.config,[field]:event.target.value};})})
                        ]},field);
                    })
                ]},at.join('/'))),
                prompts.length===0?react_jsx_runtime.jsxs('div',{className:'dsha-editor-empty',children:[react_jsx_runtime.jsx('p',{children:copy('В составе нет отдельного компонента prompt.','No dedicated prompt component in this composition.')}),editable?button(copy('Добавить промпт','Add prompt'),()=>update(next=>next.unshift({id:'persona',name:'@deepseek-ai/dsh-persona',config:{prefix:'',suffix:'Your working directory is {{cwd}}.'}}))):null]}):null
            ]}):react_jsx_runtime.jsxs('div',{className:'dsha-editor-section',role:'tabpanel',children:[
                react_jsx_runtime.jsx('p',{className:'dsha-editor-hint',children:copy('Компоненты запускаются в указанном порядке. Их параметры доступны в YAML ниже.','Components run in the listed order. Their configuration is available in the YAML below.')}),
                ...rows.map((row,index)=>react_jsx_runtime.jsxs('section',{className:'dsha-editor-card dsha-editor-component',children:[
                    react_jsx_runtime.jsxs('div',{className:'dsha-editor-component-name',children:[react_jsx_runtime.jsx('strong',{children:row.id||row.name||String(index+1)}),react_jsx_runtime.jsx('code',{children:row.name||''})]}),
                    react_jsx_runtime.jsxs('div',{className:'dsha-editor-component-actions',children:[
                        react_jsx_runtime.jsxs('label',{className:'dsha-editor-enable',children:[react_jsx_runtime.jsx('input',{type:'checkbox',checked:row.disabled!==true,disabled:!editable||busy||typeof row.disabled==='object',onChange:event=>update(next=>{next[index].disabled=!event.target.checked;})}),copy(typeof row.disabled==='object'?'По условию':'Включён',typeof row.disabled==='object'?'Conditional':'Enabled')]}),
                        editable?button('↑',()=>update(next=>{[next[index-1],next[index]]=[next[index],next[index-1]];}),index===0,{'aria-label':copy('Переместить вверх','Move up')}):null,
                        editable?button('↓',()=>update(next=>{[next[index+1],next[index]]=[next[index],next[index+1]];}),index===rows.length-1,{'aria-label':copy('Переместить вниз','Move down')}):null,
                        editable?button(copy('Удалить','Remove'),()=>update(next=>next.splice(index,1)),false,{className:'dsha-editor-remove'}):null
                    ]})
                ]},index)),
                editable?react_jsx_runtime.jsxs('div',{className:'dsha-editor-add',children:[react_jsx_runtime.jsx('input',{'aria-label':copy('Пакет компонента','Component package'),value:moduleName,placeholder:'@deepseek-ai/dsh-tool-…',disabled:busy,onChange:event=>setModuleName(event.target.value)}),button(copy('Добавить','Add'),()=>{update(next=>next.push({name:moduleName.trim()}));setModuleName('');},!moduleName.trim())]}):null,
                react_jsx_runtime.jsxs('details',{className:'dsha-editor-advanced',children:[react_jsx_runtime.jsx('summary',{children:copy('YAML состава · расширенное редактирование','Composition YAML · advanced editing')}),raw()]})
            ]})
        ]}),footer]})
    });
}

const dshaDevtoolsGuide = {"name": "DevTools", "intro": "Агент для управления инструментами Android-разработки. Git, SDK, сборка и автоматизация устройства.", "explanation": "# Управление инструментами Android-разработки\n\nЭтот плагин позволяет AI управлять установкой и использованием инструментов Android-разработки прямо из чата с DeepSeek Harness.\n\n## Установка\n\n### 1. Установите Termux\n- Скачайте Termux из [F-Droid](https://f-droid.org/packages/com.termux/) или [Google Play](https://play.google.com/store/apps/details?id=com.termux)\n- Запустите Termux и выполните первоначальную настройку\n\n### 2. Активируйте Shizuku (опционально)\n- Установите Shizuku из [Google Play](https://play.google.com/store/apps/details?id=moe.shizuku.privileged.api)\n- Активируйте Shizuku через настройки разработчика\n- Дайте разрешения DeepSeek Harness\n\n### 3. Установите инструменты\nЗапустите скрипт установки:\n```bash\n./install-devtools.sh\n```\n\nИли установите инструменты вручную в Termux:\n```bash\npkg install git nodejs python openssh clang make cmake curl wget zip unzip\n```\n\n## Доступные инструменты\n\n| Инструмент | Описание | Команда установки |\n|------------|----------|-------------------|\n| Git | Контроль версий | `pkg install git` |\n| Node.js | JavaScript runtime | `pkg install nodejs` |\n| Python | Интерпретатор Python | `pkg install python` |\n| OpenSSH | SSH клиент/сервер | `pkg install openssh` |\n| Clang | Компилятор C/C++ | `pkg install clang` |\n| Make | Автоматизация сборки | `pkg install make` |\n| CMake | Система сборки | `pkg install cmake` |\n| cURL | HTTP-клиент | `pkg install curl` |\n| Wget | Скачивание файлов | `pkg install wget` |\n| Zip/Unzip | Работа с архивами | `pkg install zip unzip` |\n\n", "usage": "### Через AI в чате\nВы можете просить AI установить или использовать инструменты:\n\n**Примеры запросов:**\n- \"Установи Git\"\n- \"Проверь, установлен ли Node.js\"\n- \"Склонируй репозиторий https://github.com/user/repo.git\"\n- \"Запусти Python-скрипт script.py\"\n- \"Скомпилируй C-программу\"\n\n### Доступные команды AI\n\n#### Установка инструментов\n```bash\npkg install <название_пакета> -y\n```\n\n#### Проверка версии\n```bash\n<инструмент> --version\n```\n\n#### Использование инструментов\n```bash\n# Git\ngit clone https://github.com/user/repo.git\ngit status\ngit add .\ngit commit -m \"Message\"\ngit push\n\n# Node.js\nnode script.js\nnpm install\n\n# Python\npython script.py\npip install\n\n# SSH\nssh user@host\n\n# Компиляция\nmake\ncmake .\nclang program.c\n```\n\n\n### Работа с Android\n\n### Через Termux API\nDeepSeek Harness может взаимодействовать с Termux через:\n1. **android_input** - ввод команд в Termux\n2. **android_app** - запуск Termux\n3. **android_screen** - чтение вывода (требуется включенная служба доступности)\n\n### Пример взаимодействия\n```javascript\n// 1. Запускаем Termux\nawait android_app({ action: 'launch', package: 'com.termux' });\n\n// 2. Ждем запуска\nawait new Promise(r => setTimeout(r, 2000));\n\n// 3. Вводим команду\nawait android_input({ action: 'text', text: 'pkg install git -y' });\nawait android_input({ action: 'keyevent', keycode: 66 }); // Enter\n\n// 4. Ждем завершения\nawait new Promise(r => setTimeout(r, 10000));\n```\n\n"};
function DshaPresetHelp({row, page, close, t}) {
    const name=presetDisplayText(row,t).name;
    const ru=typeof window!=='undefined'&&window.__DSHA_LANGUAGE__==='ru';
    const data=row.id==='devtools'?{...dshaDevtoolsGuide,name}: {name,intro:row.description||'',explanation:row.description||t('noDescription'),usage:'### '+name+'\n'+(ru?'Выберите режим перед первым сообщением. В редакторе настройте промпт и состав для новых сессий.':'Choose the preset before the first message. Edit its prompt and composition for new sessions.')};
    const guide={name:'$dsha.name',intro:'$dsha.intro',explanation:'$dsha.explanation',usage:'$dsha.usage'};
    const translate=(key,...args)=>key.startsWith('$dsha.')?data[key.slice(6)]:t(key,...args);
    return react_jsx_runtime.jsx(PresetGuideDialog,{guide,initialPage:page,t:translate,onClose:close});
}
