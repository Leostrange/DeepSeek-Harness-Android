// Проверка на настоящем LocaleRuntime и компонентах RC2 без доступа к данным телефона.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import { browserFixture } from './rc1-browser-fixture.mjs';

const runtime=process.env.DSHA_TEST_RUNTIME;
assert.ok(runtime, 'Set DSHA_TEST_RUNTIME');
const assets='app/src/main/assets/';
const readRecipe=name=>JSON.parse(fs.readFileSync(assets+name,'utf8'));
for(const name of ['ru-agent-team-patch.json','ru-permission-patch.json','ru-auto-review-patch.json','ru-preset-picker-patch.json','language-patch.json']) {
  const spec=readRecipe(name);
  let source=fs.readFileSync(path.resolve(runtime,'node_modules',spec.module),'utf8');
  for(const patch of spec.patches) {
    const after=(patch.prependAsset?fs.readFileSync(assets+patch.prependAsset,'utf8')+'\n':'')+patch.after;
    assert.equal(source.split(patch.before).length-1,1,name);
    source=source.replace(patch.before,()=>after);
    const old=source.split(patch.before).length-1;
    assert.equal(old,after.split(patch.before).length-1, 'Idempotent patch recognition');
  }
  const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
}
const fixture=await browserFixture(runtime);
const {page}=fixture;
try {
  const frontend=path.resolve(runtime,'node_modules/@deepseek-ai/dsh-web-frontend/dist');
  const html=fs.readFileSync(path.join(frontend,'index.html'),'utf8');
  for(const match of html.matchAll(/href="\.\/(assets\/[^" ]+\.css)"/g))
    await page.addStyleTag({content:fs.readFileSync(path.join(frontend,match[1]),'utf8')});
  await fixture.load('dsh-client-locale',[readRecipe('language-patch.json')]);
  await fixture.load('dsh-client-ui-plugin-manager',[readRecipe('plugin-manager-navigation-patch.json'),readRecipe('ru-plugin-manager-copy-patch.json')],'module.exports.audit={packageText,rowText};');
  await fixture.load('dsh-client-ui-jobs',[readRecipe('ru-jobs-patch.json')]);
  await fixture.load('dsh-experimental-client-ui-agent-team',[readRecipe('ru-agent-team-patch.json')]);
  await fixture.load('dsh-client-ui-permission-presets',[readRecipe('ru-permission-patch.json')],
    'module.exports.audit={PermissionSelect,PERMISSION_ACCESS_NS};');
  await fixture.load('dsh-client-ui-agent-preset',[readRecipe('ru-preset-picker-patch.json')],
    'module.exports.audit={AgentPresetSeat};');
  await page.addScriptTag({path:assets+'web-integration/language.js'});
  const mobileSource=fs.readFileSync(assets+'builtin-plugins/dsh-web-mobile/lib/client.js','utf8');
  const mobileDictionary=mobileSource.split('__modules["i18n/locales.js"] = function (require, module, exports) {')[1].split('__modules["index.js"]')[0].replace(/\s*};\s*$/, '');
  await page.evaluate(source=>{
    const exports={};new Function('exports',source)(exports);window.mobileDictionary=exports;
  },mobileDictionary);
  const nativeBridge=await page.evaluate(async () => {
    const cleanup=[],changes=[];
    window.__DSHA_LANGUAGE__='ru';
    const track=event=>changes.push(event.detail);
    window.addEventListener('dsha-language-selected',track);
    let provided;
    await auditExports['@deepseek-ai/dsh-client-locale'].apply({
      emit(){},configForms:{get(){return undefined;}},
      effect(run){const stop=run();if(typeof stop==='function')cleanup.push(stop);},
      provide(name,value){provided=value;},slots:{installLocale(){},inject(){}}
    });
    const initial=provided.getSnapshot().active;
    const russian=provided.bind('settings.locale')('language.title');
    const mobile=window.mobileDictionary;
    const removeMobile=provided.register(mobile.NS,{zh:mobile.zh,en:mobile.en});
    const sessionLog=provided.bind(mobile.NS)('sessionLog');
    const untranslatedMobileKeys=Object.keys(mobile.en).filter(key=>/[\u4e00-\u9fff]/.test(provided.bind(mobile.NS)(key)) || provided.bind(mobile.NS)(key)===mobile.en[key]);
    provided.setLocale('en');
    const englishSessionLog=provided.bind(mobile.NS)('sessionLog');
    removeMobile();
    const selected=window.__DSHA_LANGUAGE__;
    for(const stop of cleanup.reverse())stop();
    window.removeEventListener('dsha-language-selected',track);
    delete window.__DSHA_LANGUAGE__;
    return {initial,russian,selected,changes,sessionLog,englishSessionLog,untranslatedMobileKeys};
  });
  assert.equal(nativeBridge.initial,'ru','Native Russian must be active before the UI mounts');
  assert.equal(nativeBridge.sessionLog,'Журнал сессии');
  assert.equal(nativeBridge.englishSessionLog,'Session log');
  assert.deepEqual(nativeBridge.untranslatedMobileKeys,[]);
  assert.notEqual(nativeBridge.russian,'Language');
  assert.equal(nativeBridge.selected,'en');
  assert.deepEqual(nativeBridge.changes,['en']);
  const registration=await page.evaluate(() => {
    const LocaleRuntime=auditExports['@deepseek-ai/dsh-client-locale'].LocaleRuntime;
    window.locale=new LocaleRuntime({emit(){}},undefined,{languages:['en'],preference:'en'});
    window.removeRussian=installDshaRussianLocale(locale);
    window.disposers=[];
    window.slots=[];
    const context={locale, sessions:{binding(){}}, uiWorkspace:{},
      effect(run){const stop=run();if(typeof stop==='function')disposers.push(stop);},
      remote:{$on(){return ()=>{};}},
      get(name){return name==='connection'?{generation:{subscribe(){return ()=>{};},getSnapshot(){return undefined;}}}:{dismiss(){},decorate(){return ()=>{};}};},
      configForms:{describe(){return {}; }},
      slots:{inject(name,run){run();},register(spec){slots.push(spec);return ()=>{};}}};
    auditExports['@deepseek-ai/dsh-experimental-client-ui-agent-team'].apply(context);
    auditExports['@deepseek-ai/dsh-client-ui-jobs'].apply(context);
    auditExports['@deepseek-ai/dsh-client-ui-permission-presets'].apply(context);
    locale.setLocale('ru');
    const remove=locale.register('settings.locale',{en:{'language.title':'Language'},zh:{'language.title':'语言'}});
    const translated=locale.bind('settings.locale')('language.title');remove();
    return {slots:slots.map(slot=>({id:slot.id,name:slot.name})),translated,
      agent:locale.bind('agent-team')('trigger'),active:locale.getSnapshot().active};
  });
  assert.ok(registration.slots.some(slot=>slot.id==='agent-team'&&slot.name==='conversation.session.header.actions'));
  assert.equal(registration.active,'ru');
  assert.equal(registration.agent,'Агенты');
  assert.notEqual(registration.translated,'Language');
  assert.equal(registration.translated,JSON.parse(fs.readFileSync(assets+'web-integration/ru-locales.json','utf8'))['settings.locale']['language.title']);
  const emptyLanguages=await page.evaluate(()=>['ru','en','zh'].map(language=>{locale.setLocale(language);return locale.bind('job')('dshaEmpty');}));assert.deepEqual(emptyLanguages,['Фоновых задач нет','No tasks','暂无任务']);
  const pluginCopy=JSON.parse(fs.readFileSync('tools/i18n/plugin-copy-ru.json','utf8'));
  for(const directory of ['app/src/main/assets/app-integration',...fs.readdirSync('app/src/main/assets/builtin-plugins').map(name=>'app/src/main/assets/builtin-plugins/'+name)]){const manifest=directory+'/package.json';if(!fs.existsSync(manifest))continue;const meta=JSON.parse(fs.readFileSync(manifest,'utf8'));assert.ok(pluginCopy[meta.name],meta.name);if(meta.description)assert.ok(pluginCopy[meta.description],meta.name+' description');}
  const stockPage=await page.evaluate(()=>{const {packageText,rowText}=auditExports['@deepseek-ai/dsh-client-ui-plugin-manager'].audit;locale.setLocale('ru');const resolver=locale.resolveText.bind(locale);return [packageText({name:'dsh-app-integration',meta:{description:'DSHA 后台任务、网页返回和草稿恢复适配'}},resolver),rowText({moduleName:'dsh-web-mobile'},resolver)];});assert.equal(stockPage[0].title,'Интеграция с DSHA');assert.match(stockPage[0].description,/восстановления черновиков/);assert.equal(stockPage[1].title,'Мобильный интерфейс');
  const pluginCheck=await page.evaluate(copy=>{locale.setLocale('ru');const ru=Object.entries(copy).every(([key,value])=>locale.resolveText(key)===value);const own=locale.resolveText({en:'Voice input',ru:'Авторский перевод'});const custom=locale.resolveText('My custom plugin');locale.setLocale('en');const en=locale.resolveText({en:'Voice input',zh:'语音输入'});locale.setLocale('zh');const zh=locale.resolveText({en:'Voice input',zh:'语音输入'});locale.setLocale('ru');return{ru,own,custom,en,zh};},pluginCopy);
  assert.deepEqual(pluginCheck,{ru:true,own:'Авторский перевод',custom:'My custom plugin',en:'Voice input',zh:'语音输入'});
  const directory = await page.evaluate(() => {
    const english = {'browser.title':'Select Workspace Directory','browser.newFolder':'New folder'};
    const removeEnglish = locale.register('directory-browser','en',english);
    const translated = locale.bind('directory-browser')('browser.title');
    const removeExplicit = locale.register('directory-browser','ru',{'browser.title':'Перевод самого плагина'});
    const explicit = locale.bind('directory-browser')('browser.title');
    removeEnglish();
    const retained = locale.bind('directory-browser')('browser.title');
    removeExplicit();
    return {translated,explicit,retained,clean:locale.dicts.get('directory-browser').size};
  });
  assert.equal(directory.translated,'Выбрать папку рабочей области');
  assert.equal(directory.explicit,'Перевод самого плагина');
  assert.equal(directory.retained,directory.explicit);
  assert.equal(directory.clean,0);
  await page.evaluate(() => {
    const React=auditModules.react.default||auditModules.react;
    const ReactDOM=auditModules['react-dom'].default||auditModules['react-dom'];
    window.root=ReactDOM.createRoot(document.getElementById('root'));
    window.selected=[];
    const presets=[{id:'custom-a',name:'Мой режим',description:'User prompt'}, {id:'custom-b',name:'Другой режим',description:'Custom'}];
    const state={options:presets,current:'custom-a',busy:false,error:null,introduce:false};
    const seat=auditExports['@deepseek-ai/dsh-client-ui-agent-preset'].audit.AgentPresetSeat;
    window.renderPreset=()=>root.render(React.createElement(seat,{
      load(){},select:async id=>{selected.push(id);},introduced(){},useAgentPresetSeat:pick=>pick(state),
      useSessionRetainInfo:pick=>pick({retainedBy:{mainView:1}}),useDeveloperTools:()=>false,t:key=>key
    }));
    const permission=auditExports['@deepseek-ai/dsh-client-ui-permission-presets'].audit;
    const catalog={options:[{value:'workspace-write',name:'Workspace'},{value:'auto',name:'Auto review'}]};
    window.renderPermission=()=>root.render(React.createElement(permission.PermissionSelect,{
      locked:false, select:async id=>{selected.push(id);},useProjection:()=>({currentValue:'workspace-write'}),
      usePermissionCatalog:pick=>pick({value:catalog}),t:locale.bind(permission.PERMISSION_ACCESS_NS)
    }));
    renderPreset();
  });
  await page.getByRole('button',{name:'Мой режим'}).click();
  await page.getByRole('menuitem',{name:/Другой режим/}).click();
  assert.deepEqual(await page.evaluate(()=>selected),['custom-b'],'Normal user can select a preset');
  await page.evaluate(()=>renderPermission());
  await page.getByRole('button',{name:/Режим доступа/}).click();
  await page.getByRole('menuitem',{name:/Авторевью/}).click();
  await page.getByRole('heading',{name:'Включить Авторевью (эксперимент)?'}).waitFor();
  const enable=page.getByRole('button',{name:'Включить Авторевью',exact:true});
  assert.equal(await enable.isEnabled(),false,'Consent must still be required');
  await page.getByRole('checkbox',{name:'Я понимаю эти риски и хочу продолжить'}).check();
  await enable.click();
  assert.deepEqual(await page.evaluate(()=>selected),['custom-b','auto']);
  const cleanup=await page.evaluate(() => {
    for(const dispose of disposers.reverse())dispose();
    const removed=locale.dicts.get('settings.permission')?.has('ru')===false;
    removeRussian();
    return {removed,selectable:locale.getSnapshot().locales.some(language=>language.id==='ru')};
  });
  assert.equal(cleanup.removed,true,'Plugin disposal owns Russian dictionaries');
  assert.equal(cleanup.selectable,false,'Locale disposal removes only the owned language');
  assert.deepEqual(fixture.errors,[]);
  console.log('PASS: RC2 locale lifecycle, Russian Auto review consent, Agent Team action registration, preset picker without developer mode, five exact patch recipes');
} finally {await fixture.close();}
