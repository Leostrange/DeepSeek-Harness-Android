import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture,installShippedMobileStyles} from './rc1-browser-fixture.mjs';
const fixture=await browserFixture();const {page}=fixture;
try {
 await installShippedMobileStyles(page);
 for(const [name,extra] of [
  ['dsh-any-background','exports.audit={ThemeSection,ColorWheel,DEFAULT_CONFIG,BUILTIN_PRESETS,applyWp,rOps,adoptConfig,loadPersisted,initRpc,getConfig:()=>cfg,en};'],
  ['dsh-session-health','module.exports.audit={HealthBadge,OverviewPanel,OverviewStore};'],
  ['dsh-peak-chip','']
 ]) {
  const file='app/src/main/assets/builtin-plugins/'+name+'/lib/client.js';
  let source=fs.readFileSync(file,'utf8');const i=source.lastIndexOf('return module.exports;');
  source=source.slice(0,i)+extra+'\n'+source.slice(i);
  await page.addScriptTag({content:source});
 }
 const ru=JSON.parse(fs.readFileSync('tools/i18n/theme-ru.json','utf8'));
 const workspaceProvider=fs.readFileSync('app/build/locked-dsh-runtime/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js','utf8');
 assert.match(workspaceProvider,/super\(ctx, "uiWorkspace"\)/);
 const activation=await page.evaluate(()=>{
  const plugin=auditExports['dsh-session-health'];
  const available=new Set(['slots','sessions','remote','remote.commands','locale','uiWorkspace']);
  if(plugin.inject.some(service=>!available.has(service)))throw Error('Unavailable client service: '+plugin.inject.filter(service=>!available.has(service)));
  const registered=[];const navigation={openSession:()=>{}};
  const ctx={slots:{inject:(name,callback)=>callback(),register:(meta,render)=>registered.push({meta,render})},sessions:{},remote:{commands:{}},locale:{},uiWorkspace:navigation};
  plugin.apply(ctx);
  const overlay=registered.find(slot=>slot.meta.id==='session-health-overview-panel');
  return {count:registered.length,navigation:overlay.render().props.navigation===navigation};
 });
 assert.equal(activation.count,3);assert.equal(activation.navigation,true);
 await page.evaluate(dict=>{
  window.ru=dict;window.theme=auditExports['dsh-any-background'].audit;
  const missing=Object.keys(theme.en).filter(k=>!(k in dict));if(missing.length)throw Error('Missing theme translations: '+missing);
  window.react=auditModules.react;window.dom=auditModules['react-dom/client'];
  window.reactRoot=dom.createRoot(document.getElementById('root'));
  document.body.style.margin='0';
  window.state={url:null,color:null,schemeOverride:'auto',backgroundType:'image',generatedBg:null,regenerateOnReload:false,profiles:[],activeProfile:null,rotation:{enabled:false,interval:'daily',items:[]},schedule:{enabled:false,dayStart:'07:00',nightStart:'19:00',dayProfile:null,nightProfile:null}};
  window.changes=[];
  window.props=new Proxy({t:k=>dict[k]??k,hue:220,sat:.5,lit:.5,useStore:select=>select(state),setColor:(...args)=>changes.push(args)}, {get:(obj,key)=>key in obj?obj[key]:()=>false});
  reactRoot.render(react.createElement('div',{style:{padding:'12px',width:'100%',boxSizing:'border-box'}},react.createElement(theme.ThemeSection,props)));
 },ru);
 for(const width of [280,320,360,412,600,900]) {
  await page.setViewportSize({width,height:900});
  for(const label of ['Цвет','Интерфейс','Фон','Профили']) {
   await page.locator('.dab-nav-item').filter({hasText:label}).click();
   await page.waitForTimeout(90);
   const size=await page.evaluate(()=>({w:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,crash:!!document.querySelector('.dab-crash'),body:document.body.innerText}));
   assert.equal(size.crash,false,label+' rendered');
   assert.ok(size.scroll<=size.w+1,`${label} overflows at ${width}: ${JSON.stringify(size)}`);
   assert.doesNotMatch(size.body,/Theme color|Surfaces|Current accent|Quick swatches|Interface scheme|[\u4e00-\u9fff]/);
  }
 }
 await page.setViewportSize({width:280,height:900});
 await page.locator('.dab-nav-item').filter({hasText:'Цвет'}).click();
 const wheel=await page.locator('.dab-wheel').boundingBox();
 await page.touchscreen.tap(wheel.x+wheel.width/2,wheel.y+8);
 await page.waitForTimeout(80);
 assert.ok(await page.evaluate(()=>changes.length>0),'Touch changes color');
 const migration=await page.evaluate(async()=>{
  const saved=[];let config={...theme.DEFAULT_CONFIG,dshaOpaqueDefaults:undefined,opacities:{bg:.85,sidebar:.93,card:1,input:1}};
  theme.initRpc(async(endpoint,payload)=>{if(endpoint.endsWith('/read')||endpoint==='read')return {ok:true,value:{config}};saved.push(payload.config);return {ok:true,value:true};});
  await theme.loadPersisted();const baseline=theme.getConfig();
  config={...baseline,opacities:{...baseline.opacities,bg:.42}};await theme.loadPersisted();
  return {baseline:baseline.opacities.bg,custom:theme.getConfig().opacities.bg,saved:saved.length};
 });
 assert.equal(migration.baseline,.85);assert.equal(migration.custom,.42);assert.equal(migration.saved,0);
 const untouched=await page.evaluate(()=>{
  theme.adoptConfig(theme.DEFAULT_CONFIG);
  document.body.setAttribute('data-ds-dark-theme','true');
  document.body.style.colorScheme='dark';
  theme.applyWp();
  return {dark:document.body.getAttribute('data-ds-dark-theme'),scheme:document.body.style.colorScheme,preset:theme.BUILTIN_PRESETS[0].appearance.opacities.bg,panel:document.documentElement.style.getPropertyValue('--dsh-any-panel-layer-1')};
 });
 assert.equal(untouched.dark,'true');assert.equal(untouched.scheme,'dark');assert.equal(untouched.preset,1);assert.equal(untouched.panel,'');
 const health=await page.evaluate(async()=>{
  reactRoot.unmount();document.getElementById('root').innerHTML='';reactRoot=dom.createRoot(document.getElementById('root'));
  const values={sessionHealth:{severity:'green',advice:'Можно продолжать',turns:1,userMessages:1,assistantMessages:1,compactions:0,total:5000,window:100000,ratio:.05,effectivePerRound:5000,effectivePerRoundUsd:.001},contextPressure:{pressureTokens:5000,contextWindow:100000},tokenUsage:{uncachedInputTokens:5000,cacheReadTokens:0}};
  window.healthCalls=[];
  const sessions={binding(id){if(id!=='session-123')throw Error('Missing scope');return {session:{projections:{faceOf:key=>({getSnapshot:()=>values[key],subscribe:()=>()=>{}})}}};}};
  reactRoot.render(react.createElement(auditExports['dsh-session-health'].audit.HealthBadge,{sessionId:'session-123',sessions,commands:{execute:(...args)=>healthCalls.push(args)},locale:{snapshot:{active:'ru'}}}));
  return true;
 });
 await page.locator('.sh-badge').click();
 assert.deepEqual(await page.evaluate(()=>healthCalls),[['session-123','/health']]);
 assert.deepEqual(fixture.errors,[]);
 console.log('Community clients load; four Theme pages fit 280–900px; touch/color, saved opacity preservation, health badge passed');
} finally {await fixture.close();}
