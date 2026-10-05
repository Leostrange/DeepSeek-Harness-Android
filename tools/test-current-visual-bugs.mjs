// Current archive regressions: actual RC2 headers, provider forms, inventory and questions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {browserFixture,installShippedMobileStyles} from './rc1-browser-fixture.mjs';
const assets='app/src/main/assets/';
const recipe=name=>JSON.parse(fs.readFileSync(assets+name,'utf8'));
const fixture=await browserFixture(process.env.DSHA_TEST_RUNTIME);
const {page}=fixture;
try {
  const frontend=path.resolve(process.env.DSHA_TEST_RUNTIME,'node_modules/@deepseek-ai/dsh-web-frontend/dist');
  const html=fs.readFileSync(path.join(frontend,'index.html'),'utf8');
  for(const m of html.matchAll(/href="\.\/(assets\/[^" ]+\.css)"/g))await page.addStyleTag({content:fs.readFileSync(path.join(frontend,m[1]),'utf8')});
  // Native injection precedes plugin CSS in a real WebView: order must not undo fixes.
  await page.addScriptTag({path:assets+'web-integration/mobile-layout.js'});
  await installShippedMobileStyles(page);
  const mobileSource=fs.readFileSync(assets+'builtin-plugins/dsh-web-mobile/lib/client.js','utf8');
  assert.ok(mobileSource.includes("ctx.slots.inject('conversation.session.header.actions'"));
  const navStart=mobileSource.indexOf('function MobileNavToggle('),navEnd=mobileSource.indexOf('\n};\n__modules',navStart);
  await page.addScriptTag({content:`(()=>{const jsx_runtime_1=auditModules['react/jsx-runtime']; const primitives=auditModules['@deepseek-ai/dsh-client-ui-primitives'];const icon_compat_ts_1={IconPanelLeft:primitives.IconPanelLeftOutlineRegular,IconFolderOpen:primitives.IconFolderOpenOutlineRegular};const open_files_panel_ts_1={openFilesPanel:()=>actions.folder++};${mobileSource.slice(navStart,navEnd)};window.ActualMobileNavToggle=MobileNavToggle;})();`});

  await fixture.load('dsh-client-ui-theme',[],'module.exports.audit={installThemeStyles};');
  await page.evaluate(()=>auditExports['@deepseek-ai/dsh-client-ui-theme'].audit.installThemeStyles({effect:run=>run()}));
  await page.addStyleTag({content:'body{font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}'});
  await fixture.load('dsh-client-ui-conversation',[{...recipe('conversation-materialized-patch.json'),patches:recipe('conversation-materialized-patch.json').patches.slice(1)}],'module.exports.audit={ConversationSessionHeader,InputBar};');
  await fixture.load('dsh-client-ui-agent-preset',[recipe('ru-preset-picker-patch.json')],'module.exports.audit={AgentPresetSeat,AgentPresetSection};');
  await fixture.load('dsh-experimental-client-ui-agent-team',[recipe('ru-agent-team-patch.json')],'module.exports.audit={TeamAction};');
  await fixture.load('dsh-client-ui-settings-models',[],'module.exports.audit={CustomProviderCard};');
  await fixture.load('dsh-client-ui-settings-plugin-inventory',[recipe('ru-plugin-inventory-patch.json')],'module.exports.audit={PluginInventorySettingsTab};');
  await fixture.load('dsh-client-ui-model-selection',[],'module.exports.audit={ModelSelect};');
  await fixture.load('dsh-client-ui-jobs',[recipe('ru-jobs-patch.json')],'module.exports.audit={JobListAction};');
  await fixture.load('dsh-client-ui-user-questions',[],'module.exports.audit={QuestionFlow};');
  await page.evaluate(catalog=>{
    window.__DSHA_LANGUAGE__='ru';
    const React=auditModules.react.default||auditModules.react;
    const DOM=auditModules['react-dom'].default||auditModules['react-dom'];
    const h=React.createElement, primitives=auditModules['@deepseek-ai/dsh-client-ui-primitives'];
    const exported=name=>auditExports['@deepseek-ai/'+name].audit;
    const t=ns=>(key,params={})=>Object.entries(params).reduce((value,[key,arg])=>value.replaceAll('{'+key+'}',String(arg)),catalog[ns]?.[key]||catalog.conversation?.[key]||key);
    window.actions={tabs:[],folder:0,side:0,answers:[],presets:[]};
    document.getElementById('root').setAttribute('data-mobile-nav','frame');document.getElementById('root').setAttribute('data-sidebar-collapsed','');const frame=document.getElementById('root');frame.appendChild(document.createElement('aside'));const content=frame.appendChild(document.createElement('main'));window.root=DOM.createRoot(content);
    const session={id:'s',displayTitle:'Мой проект',origin:'user',blank:true,openState:'ready'};
    const children=Array.from({length:8},(_,index)=>({id:'child-'+index,label:'Субагент с длинным названием '+(index+1),mode:'continuable'}));
    const sessions={byId:{s:session},phase:'ready',projectionsBySession:{s:{values:{agentTeam:{members:[{id:'s',name:'lead',phase:'active'}],tasks:[]},subagentCatalog:children}}}};
    const seatProps={sessionId:'s',useSessionRetainInfo:pick=>pick({retainedBy:{mainView:1}}),useDeveloperTools:()=>false,load(){},introduced(){},select:async id=>actions.presets.push(id),useAgentPresetSeat:pick=>pick({options:[{id:'devtools'},{id:'custom',name:'Мой режим'}],current:'devtools',busy:false,error:null,introduce:false}),t:t('settings.agentPreset')};
    const modelState={groups:[{id:'deepseek-official',name:'DeepSeek',models:[{id:'deepseek-chat',name:'DeepSeek'}]}],current:{provider:'deepseek-official',model:'deepseek-chat'},pending:null};window.modelDirectory={subscribe:()=>()=>{},getSnapshot:()=>modelState};
    const inventory={agentPresets:[{id:'standard',isDefault:false,rows:[]},{id:'custom',isDefault:true,name:'Очень длинное название пользовательского режима для разработки Android',rows:[]}],entries:[]};
    const list=async()=>inventory;
    function ProviderForm(){
      const [mode,setMode]=React.useState('catalog');
      return h('section',{className:'zGbnIq_section'},h('div',{className:'zGbnIq_addCard'},
        h('div',{className:'zGbnIq_addModes'},h(primitives.SegmentedControl,{id:'providers',label:'Способ добавления',value:mode,onChange:setMode,options:[{value:'catalog',label:'Сторонний провайдер моделей'},{value:'custom',label:'Свой API модели'}]})),
        h(exported('dsh-client-ui-settings-models').CustomProviderCard,{revision:1,taken:[],protocols:['openai-completions','anthropic-messages'],operations:{},t:t('settings.models'),onClose(){},readOnly:false})));
    }
    window.renderVisual=(kind,blank=true)=>{
      session.blank=blank;
      if(kind==='header')root.render(h('div',{className:'wSkVaW_root','data-phase':'active',style:{height:'auto'}},
        h('header',{className:'wSkVaW_header'},h('div',{className:'wSkVaW_headerLeading'}),
          h(exported('dsh-client-ui-conversation').ConversationSessionHeader,{sessionId:'s',hideChrome:blank,useSessions:pick=>pick(sessions),useConversationViews:pick=>pick([{id:'chat',label:'Чат'},{id:'trajectory',label:'Траектория'}]),useStore:pick=>pick({view:'chat'}),open(){},selectView:id=>actions.tabs.push(id),t:t('conversation'),renderSlot:name=>name==='conversation.session.header.actions'?h(React.Fragment,null,h(ActualMobileNavToggle,{toggleSidebar:()=>actions.side++,t:key=>key==='open'?'Боковая панель':'Папка проекта'}),
            h(exported('dsh-experimental-client-ui-agent-team').TeamAction,{sessionId:'s',useSession:pick=>pick(session),useSessions:pick=>pick(sessions),useSessionStatus:()=>({}),openTeammate(){},t:t('agent-team')}),h(exported('dsh-client-ui-jobs').JobListAction,{sessionId:'s',useJobs:pick=>pick({rows:{s:window.emptyJobs?[]:[{id:'j',status:window.jobStatus||'running',startedAt:Date.now()-1000,finishedAt:Date.now(),label:'Сборка',output:{total:0},title:'Сборка'}]},observed:{}}),watchRows:()=>()=>{},observe(){},killJob(){},t:t('job')})):null})),
        h(exported('dsh-client-ui-conversation').InputBar,{sessionId:'s',variant:'composer',useSession:pick=>pick(session),useInput:pick=>pick({draft:'',phase:'plain',attachmentIds:[],queue:[]}),useBusyEnter:pick=>pick(false),useNotices:pick=>pick(undefined),useStopShortcut:pick=>pick([]),useMenuLauncher:pick=>pick(undefined),useFileUploads:pick=>pick({}),useProjection:()=>undefined,useLexicon:pick=>pick([]),t:t('conversation'),renderSlot:name=>name==='conversation.input.right'?h(exported('dsh-client-ui-agent-preset').AgentPresetSeat,seatProps):name==='conversation.input.model'?h(exported('dsh-client-ui-model-selection').ModelSelect,{locked:false,available:true,directory:window.modelDirectory,load(){},select(){},t:t('model')}):null})));
      if(kind==='model')root.render(h(primitives.Modal,{open:true,onClose(){},title:'Модели',closeLabel:'Закрыть',children:h(ProviderForm)}));
      if(kind==='plugin')root.render(h(primitives.Modal,{open:true,onClose(){},title:'Плагины',closeLabel:'Закрыть',children:h(exported('dsh-client-ui-settings-plugin-inventory').PluginInventorySettingsTab,{list,presetName:row=>row.name||'Стандартный режим',resolveText:()=>'',t:t('settings.pluginInventory'),useClientSync:pick=>pick({syncing:false,failures:[]}),retryClient(){}})}));
      if(kind==='question')root.render(h('div',{style:{width:'100%',padding:'16px',boxSizing:'border-box'}},h(exported('dsh-client-ui-user-questions').QuestionFlow,{pending:{liveKeys:()=>['q'],engage(){},releaseFocus(){},holdFocus(){},snapshot(){return {channel:"waterfall",state:"active"}},takeTime(){},dismiss(){},key:'q',questions:[{id:'q',question:'Выберите подходящий вариант работы с Android',options:[{label:'Включён',description:'Кружок справа, дорожка цветная'},{label:'Выключен',description:'Кружок слева, дорожка серая'},{label:'Нажму и включу',description:'Попробую включить прямо сейчас'}]}],answer:async v=>actions.answers.push(v),cancel:async()=>actions.answers.push('skip')},useStore:pick=>pick({progressByRequest:{}}),useQuestionCard:(key,pick)=>pick({channel:"waterfall",state:"active"}),actions:{prune(){},replace(){},clear(){}},t:t('question')})));
      if(kind==='presets')root.render(h(primitives.Modal,{open:true,onClose(){},title:'Пресеты',closeLabel:'Закрыть',children:h(exported('dsh-client-ui-agent-preset').AgentPresetSection,{useAgentPresetSection:pick=>pick({rows:[{id:'minimal'},{id:'devtools',name:'DevTools',isDefault:true},{id:'custom',name:'Мой режим',description:'Мои инструкции'}],view:window.presetView||null,saving:false,error:null}),useDeveloperTools:()=>true,load(){},closeView(){if(!window.presetView)return;window.presetView=null;renderVisual('presets');},makeDefault(){},close(){},savePreset:async(id,content)=>actions.presets.push('saved:'+id),view:id=>{actions.presets.push(id);window.presetView={id,title:id,content:'- name: "@deepseek-ai/dsh-persona"\n  config:\n    prefix: My original prompt\n'};renderVisual('presets');},t:t('settings.agentPreset')})}));
    };
  },JSON.parse(fs.readFileSync(assets+'web-integration/ru-locales.json','utf8')));
  await page.addStyleTag({content:'body{margin:0;font-size:20.8px} button,input,textarea{font-size:inherit}'});
  const cases=[];
  for(const width of [280,320,360,600])for(const kind of ['header','model','plugin','question','presets']){
    await page.setViewportSize({width,height:800});
    await page.evaluate(kind=>renderVisual(kind),kind);
    const target=page.locator(kind==='header'?'.wSkVaW_header':kind==='question'?'.Mbwy4a_card':kind==='plugin'?'.qSYn7G_groupTitleRow':kind==='model'?'.zGbnIq_addCard':'[data-agent-preset-id="custom"]');
    try{await target.waitFor({timeout:5000});}catch(error){console.log(JSON.stringify({kind,width,errors:fixture.errors,body:await page.locator("body").innerText()}));throw error;}
    const check=await page.evaluate(()=>({page:document.documentElement.scrollWidth-innerWidth,containers:[...document.querySelectorAll('[role=dialog],.Mbwy4a_card,.qSYn7G_section,.zGbnIq_addCard,.dsha-conversation-toolbar')].map(el=>({class:el.className,overflow:el.scrollWidth-el.clientWidth}))}));
    assert.ok(check.page<=1,JSON.stringify({kind,width,check}));
    
    for(const c of check.containers)assert.ok(c.overflow<=1,JSON.stringify({kind,width,c}));
    if(kind==='model'){const tabs=page.getByRole('tab');const bounds=await Promise.all([tabs.nth(0),tabs.nth(1)].map(el=>el.boundingBox()));assert.ok(Math.abs(bounds[1].y-bounds[0].y)<=1,JSON.stringify(bounds));}
    for(const dialog of await page.getByRole('dialog').all()){const box=await dialog.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=800+1,JSON.stringify({kind,width,box}));}
    if(kind==='header'){const boxes=await Promise.all([page.locator('[data-mobile-nav=toggle]'),page.locator('[data-mobile-nav=files]')].map(el=>el.boundingBox()));assert.ok(Math.abs(boxes[0].x-(width-boxes[1].x-boxes[1].width))<=1,JSON.stringify(boxes));const rowLocators=[page.getByRole('tab',{name:'Чат'}),page.getByRole('tab',{name:'Траектория'}),page.getByRole('button',{name:'Агенты',exact:true}),page.locator('.QsffPG_trigger')];const row=await Promise.all(rowLocators.map(el=>el.boundingBox()));const rowDebug=await Promise.all(rowLocators.map(el=>el.evaluate(node=>({tag:node.tagName,classes:node.className,parent:node.parentElement?.className,grand:node.parentElement?.parentElement?.className,height:getComputedStyle(node).height,padding:getComputedStyle(node).padding,lineHeight:getComputedStyle(node).lineHeight}))));assert.ok(row.every(box=>Math.abs(box.y-row[0].y)<=1&&Math.abs(box.height-row[0].height)<=1),JSON.stringify({row,rowDebug}));const leftGap=row[1].x-row[0].x-row[0].width,rightGap=row[3].x-row[2].x-row[2].width;assert.ok(Math.abs(leftGap-rightGap)<=(width<=320?3:1),JSON.stringify({leftGap,rightGap,row}));}
    cases.push({kind,width});
    if(width===360)await page.screenshot({path:`app/build/reports/current-visual-${kind}.png`,fullPage:true});
  }
  for(const kind of ['model','plugin','presets']){await page.setViewportSize({width:320,height:400});await page.evaluate(kind=>renderVisual(kind),kind);await page.locator(kind==='model'?'.zGbnIq_addCard':kind==='plugin'?'.qSYn7G_groupTitleRow':'[data-agent-preset-id="custom"]').waitFor();const box=await page.getByRole('dialog').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=401,JSON.stringify({kind,box}));}
  await page.setViewportSize({width:600,height:800});
  await page.evaluate(()=>renderVisual('header'));
  await page.locator('.uV2eYG_standardControls').waitFor();assert.ok(await page.locator('.uV2eYG_row').evaluate(el=>getComputedStyle(el.querySelector('.uV2eYG_tools')).gap===getComputedStyle(el.querySelector('.uV2eYG_standardControls')).gap),'Composer gaps match');
  const agents=page.getByRole('button',{name:'Агенты',exact:true});
  await page.locator('[data-mobile-nav=toggle]').click();assert.equal(await page.evaluate(()=>actions.side),1);assert.equal(await page.locator('[data-mobile-nav=toggle] svg').count(),1);assert.equal(await page.locator('[data-mobile-nav=files] svg').count(),1);
  const trajectory=page.getByRole('tab',{name:'Траектория'});
  const jobs=page.getByRole('button',{name:/Фоновые/});
  const positions=await Promise.all([agents,trajectory,jobs,page.getByRole('button',{name:'Папка проекта'})].map(el=>el.boundingBox()));
  assert.ok(Math.abs(positions[0].y-positions[1].y)<12&&positions[0].x<positions[2].x&&positions[3].y<positions[0].y,JSON.stringify(positions));
  assert.notEqual(await page.locator('.VoX2oq_triggerLabel').evaluate(el=>getComputedStyle(el).display),'none');
  await agents.click();await page.locator('[data-team-panel]').waitFor();
  const roster=page.locator('[data-team-panel] .VoX2oq_roster');
  assert.equal(await roster.locator('.VoX2oq_member').count(),9);
  const agentColumns=await Promise.all([roster.locator('.VoX2oq_member').nth(0),roster.locator('.VoX2oq_member').nth(1),roster.locator('.VoX2oq_member').nth(2)].map(el=>el.boundingBox()));
  assert.ok(agentColumns[0].x<agentColumns[1].x&&Math.abs(agentColumns[1].x-agentColumns[2].x)<=1,JSON.stringify(agentColumns));
  await page.setViewportSize({width:360,height:800});
  const subagentTab=page.locator('.dsha-agent-switcher button').first();
  await subagentTab.waitFor();assert.match(await subagentTab.innerText(),/^Субагенты \(8\)$/);assert.equal(await subagentTab.getAttribute('aria-selected'),'true');
  assert.equal(await roster.locator('.VoX2oq_member:visible').count(),8);
  await page.getByRole('tab',{name:'Агент чата (1)',exact:true}).click();
  assert.equal(await roster.locator('.VoX2oq_member:visible').count(),1);
  await subagentTab.click();
  await page.screenshot({path:'app/build/reports/agents-two-column-mobile.png',fullPage:true});
  await page.keyboard.press('Escape');await trajectory.click();await page.getByRole('button',{name:'Папка проекта'}).click();
  await page.locator('.cubgiG_seat').click();await page.getByRole('menuitem',{name:/Мой режим/}).click();
  assert.deepEqual(await page.evaluate(()=>actions.presets),['custom']);
  assert.equal(await page.evaluate(()=>actions.folder),1);assert.deepEqual(await page.evaluate(()=>actions.tabs),['trajectory']);
  await page.evaluate(()=>renderVisual('header',false));await page.locator('.cubgiG_seat').waitFor();assert.ok(await page.locator('.uV2eYG_row').evaluate(el=>getComputedStyle(el.querySelector('.uV2eYG_tools')).gap===getComputedStyle(el.querySelector('.uV2eYG_standardControls')).gap));
  await page.evaluate(()=>renderVisual('presets'));
  await page.setViewportSize({width:360,height:800});
  const custom=page.locator('[data-agent-preset-id="custom"]');await custom.waitFor();
  assert.deepEqual(await custom.locator('.rtSEdW_cardFoot button').allTextContents(),['Описание режима','Как использовать','Редактировать']);
  const actionBoxes=await Promise.all((await custom.locator('.rtSEdW_cardFoot button').all()).map(el=>el.boundingBox()));assert.ok(actionBoxes.every(b=>Math.abs(b.y-actionBoxes[0].y)<1&&Math.abs(b.height-actionBoxes[0].height)<1),JSON.stringify(actionBoxes));
  assert.equal(await page.locator('[data-agent-preset-id="minimal"]').getByRole('button',{name:/Редактировать|Посмотреть/}).count(),0);
  await custom.getByRole('button',{name:/Описание режима/}).click();await page.getByRole('dialog',{name:'Мой режим',exact:true}).locator('[data-guide-page=explanation]').getByText('Мои инструкции',{exact:true}).waitFor();
  await page.keyboard.press('Escape');await custom.getByRole('button',{name:/Редактировать/}).click();
  assert.deepEqual(await page.evaluate(()=>actions.presets),['custom','custom']);await page.locator('.dsha-preset-editor').waitFor();assert.equal(await page.getByRole('button',{name:'Сохранить',exact:true}).count(),1);await page.waitForTimeout(350);assert.ok(await page.locator('.dsha-editor-header').evaluate(el=>{const r=el.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.dsha-preset-editor');}));await page.screenshot({path:'app/build/reports/custom-editor-mobile.png',fullPage:true});await page.locator('.dsha-editor-header').getByRole('button',{name:'Закрыть',exact:true}).click();
  await page.locator('[data-agent-preset-id=devtools]').getByRole('button',{name:/Как использовать/}).click();await page.locator('[data-guide-page=usage]:not([hidden])').waitFor();assert.ok((await page.locator('[data-guide-page=usage]').innerText()).includes('Установи Git'));await page.waitForTimeout(350);await page.screenshot({path:'app/build/reports/devtools-guide-mobile.png',fullPage:true});await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));await page.screenshot({path:'app/build/reports/devtools-guide-dark.png',fullPage:true});await page.getByRole('tab',{name:'Описание режима',exact:true}).click();await page.locator('[data-guide-page=explanation]:not([hidden])').waitFor();assert.ok((await page.locator('[data-guide-page=explanation]').innerText()).includes('Управление инструментами Android'));await page.screenshot({path:'app/build/reports/devtools-description-dark.png',fullPage:true});await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'DevTools',exact:true}).waitFor({state:'hidden'});await page.waitForTimeout(350);await page.evaluate(()=>{document.body.removeAttribute('data-ds-dark-theme');window.emptyJobs=true;renderVisual('header');});await page.locator('.QsffPG_trigger').click();await page.getByRole('list',{name:'Фоновые задачи',exact:true}).waitFor();await page.getByText('Фоновых задач нет',{exact:true}).waitFor(); const menu=await page.locator('.QsffPG_menu').boundingBox(),header=await page.locator('header.wSkVaW_header').boundingBox();assert.ok(menu.y>=header.y+header.height+7&&menu.x>=15&&menu.x+menu.width<=361,JSON.stringify({menu,header}));await page.waitForTimeout(350);await page.screenshot({path:'app/build/reports/new-tasks-empty.png',fullPage:true});await page.evaluate(()=>{document.body.setAttribute('data-ds-dark-theme','');window.emptyJobs=false;window.jobStatus='completed';renderVisual('header');});await page.getByRole('button',{name:'Очистить',exact:true}).waitFor();await page.waitForTimeout(350);await page.screenshot({path:'app/build/reports/new-tasks-filled-dark.png',fullPage:true});await page.getByRole('button',{name:'Очистить',exact:true}).click();await page.getByText('Фоновых задач нет',{exact:true}).waitFor();
  assert.deepEqual(fixture.errors,[]);
  const result={result:'PASS',cases,headerOrder:true,persistentPreset:true,customActions:true,latePluginCss:true,shippedMobileCss:true,shortDialogs:true,customDevtools:true,shippedHelpPreserved:true,equalHeaderMargins:true,equalComposerGaps:true,emptyJobsAvailable:true,actualMobileNavComponent:true,jobsBelowToolbar:true,jobsEmptyState:true};fs.writeFileSync('app/build/reports/current-visual-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
} finally {await fixture.close();}
