import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture} from './rc1-browser-fixture.mjs';

const fixture = await browserFixture();
const {page} = fixture;
try {
 let source = fs.readFileSync(process.env.DSHA_THEME_TEST_SOURCE || 'app/src/main/assets/builtin-plugins/dsh-any-background/lib/client.js', 'utf8');
 const at = source.lastIndexOf('return module.exports;');
 source = source.slice(0, at) + 'exports.audit={DEFAULT_CONFIG,adoptConfig,applyWp,loadPersisted,getConfig:()=>cfg};\n' + source.slice(at);
 await page.addScriptTag({content: source});
 await page.addStyleTag({content: `
 body{--dsw-alias-bg-base:#faf8f5;--dsw-alias-bg-layer-1:#eee9e1;--dsw-alias-bg-layer-2:#e1d9cd;--dsw-alias-bg-layer-3:#d4c9b8;--dsw-specific-menu:#e8e3dc;--dsw-alias-markdown-code-block:#ededed;--dsw-alias-markdown-inline-code:#f0f0f0}
 body[data-ds-dark-theme="true"]{--dsw-alias-bg-base:#171a21;--dsw-alias-bg-layer-1:#232730;--dsw-alias-bg-layer-2:#303540;--dsw-alias-bg-layer-3:#424857;--dsw-specific-menu:#363a45}
 [role=dialog]{background:var(--dsw-alias-bg-layer-2)}
 .host-card,[data-conversation-composer-overlay]{background:var(--dsw-alias-bg-layer-1)}
 [data-sidebar-right-panel]{background:var(--dsw-alias-bg-layer-2);position:relative}
 [data-cordis-panel]{background:var(--dsw-specific-menu);backdrop-filter:blur(2px)}
 .md-code-block{background:#bada55}.md-code-block>div{background:#cadace}
 .dsh-mobile-app-header{background:#defabc}
 `});
 const ru = JSON.parse(fs.readFileSync('tools/i18n/theme-ru.json', 'utf8'));
 await page.evaluate(dict => {
  window.plugin = auditExports['dsh-any-background'];window.theme = plugin.audit;
  document.body.insertAdjacentHTML('beforeend', `<div class="dsh-mobile-app-header">Header</div><div data-sidebar-right-panel>Panel</div><div data-cordis-panel>Menu</div><div data-conversation-composer-overlay>Trajectory</div><div class="md-code-block"><div>Code</div></div><div role="dialog" aria-modal="true" aria-labelledby="title"><h2 id="title">Темы</h2><div class="host-card">Card</div><div id="theme-root"></div></div>`);
  window.snapshot = () => Object.fromEntries(['[role=dialog]', '.host-card', '[data-sidebar-right-panel]', '[data-cordis-panel]', '[data-conversation-composer-overlay]', '.md-code-block', '.md-code-block>div', '.dsh-mobile-app-header'].map(s => [s,getComputedStyle(document.querySelector(s)).backgroundColor]));
  window.calls=[];window.disposers=[];window.slots=[];window.saved=null;
  const ctx={
   connection:{rpc:{call:async(channel,endpoint,payload)=>{calls.push({endpoint,payload});return {ok:true,value:endpoint.endsWith('read')?{config:saved,wallpaperUrl:null,videoUrl:null}:true};}}},
   effect:fn=>{const dispose=fn();if(typeof dispose==='function')disposers.push(dispose);},
   on:()=>()=>{},
   slots:{inject:(name,fn)=>fn(),register:(meta,render)=>{slots.push({meta,render});return ()=>{};}},
   theme:{getTheme:()=>({themes:[],preference:'host'}),register:()=>()=>{},setTheme:id=>calls.push({theme:id})},
   locale:{register:()=>()=>{},bind:()=>k=>dict[k]??k}
  };
  window.before=snapshot();plugin.apply(ctx);
  window.openThemes=()=>{
   const slot=slots.find(s=>s.meta.id==='dsh-any-background');
   const actions={syncBg(){},syncColor(){},syncMeta(){}};
   const props=slot.meta.inject(actions);
   props.useStore=select=>select(theme.getConfig());
   window.themeProps=props;
   window.root=auditModules['react-dom/client'].createRoot(document.getElementById('theme-root'));
   root.render(auditModules.react.createElement(slot.render,props));
  };
 }, ru);
 await page.waitForTimeout(1700);
 assert.deepEqual(await page.evaluate(()=>snapshot()),await page.evaluate(()=>before),'Activation preserves native surfaces');
 for (const dark of [false,true]) {
  await page.evaluate(dark=>{document.body.toggleAttribute('data-ds-dark-theme',dark);if(dark)document.body.setAttribute('data-ds-dark-theme','true');window.before=snapshot();openThemes();},dark);
  for (const label of ['Цвет','Интерфейс','Фон','Профили']) {
   await page.locator('.dab-nav-item').filter({hasText:label}).click();
   assert.deepEqual(await page.evaluate(()=>snapshot()),await page.evaluate(()=>before),`${label} preserves host ${dark?'dark':'light'} colors`);
  }
  await page.evaluate(()=>root.unmount());
 }
 assert.deepEqual(await page.evaluate(()=>calls.filter(c=>!c.endpoint?.endsWith('read'))),[],'Opening settings never writes config or changes theme');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-cordis-panel]')).backdropFilter),'blur(2px)','Native blur is untouched');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('[data-sidebar-right-panel]')).position),'relative','Native panel positioning is untouched');
 const persisted=await page.evaluate(async()=>{
  saved={...theme.DEFAULT_CONFIG,dshaOpaqueDefaults:undefined,opacities:{bg:.85,sidebar:.93,card:1,input:1},settingsOpacity:.37};
  await theme.loadPersisted();theme.applyWp();openThemes();
  return {opacity:theme.getConfig().settingsOpacity,background:getComputedStyle(document.querySelector('[role=dialog]')).backgroundColor};
 });
 assert.equal(persisted.opacity,.37);assert.match(persisted.background,/0\.37\)/);
 await page.evaluate(()=>root.unmount());
 assert.deepEqual(await page.evaluate(()=>calls.filter(c=>!c.endpoint?.endsWith('read'))),[],'Saved custom settings are read without rewriting');
 await page.evaluate(()=>themeProps.setSop(.46));
 await page.waitForTimeout(350);
 assert.equal(await page.evaluate(()=>calls.findLast(c=>c.payload?.config)?.payload.config.settingsOpacity),.46,'Explicit UI action persists');
 const explicit=await page.evaluate(()=>{
  theme.adoptConfig({...theme.DEFAULT_CONFIG,settingsOpacity:.4,panelOpacity:.6,trajectoryOpacity:.7,producedOpacity:.5});theme.applyWp();
  const lowered=snapshot();theme.adoptConfig(theme.DEFAULT_CONFIG);theme.applyWp();return {lowered,restored:snapshot(),before};
 });
 assert.match(explicit.lowered['[role=dialog]'],/0\.4\)/);
 assert.match(explicit.lowered['[data-sidebar-right-panel]'],/0\.6\)/);
 assert.match(explicit.lowered['[data-conversation-composer-overlay]'],/0\.7\)/);
 assert.deepEqual(explicit.restored,explicit.before,'Reset restores native backgrounds including code wrappers');
 await page.evaluate(async()=>{
  saved={...theme.DEFAULT_CONFIG,color:[280,.4,.35],settingsOpacity:.8};
  await theme.loadPersisted();theme.applyWp();
 });
 await page.waitForTimeout(100);
 const customBefore=await page.evaluate(()=>snapshot());
 const writesBefore=await page.evaluate(()=>calls.length);
 await page.evaluate(()=>openThemes());
 await page.locator('.dab-nav-item').filter({hasText:'Интерфейс'}).click();
 await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>snapshot()),customBefore,'Opening settings preserves saved color and opacity');
 assert.equal(await page.evaluate(()=>calls.length),writesBefore,'Opening a custom theme does not write settings');
 await page.evaluate(()=>{root.unmount();theme.adoptConfig(theme.DEFAULT_CONFIG);theme.applyWp();});
 await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>snapshot()),explicit.before,'Returning from custom palette restores host scheme and surfaces');
 await page.evaluate(()=>{for(const dispose of disposers.reverse())dispose();});
 assert.deepEqual(await page.evaluate(()=>snapshot()),explicit.before,'Disabling unconfigured plugin preserves host scheme');
 assert.deepEqual(fixture.errors,[]);
 console.log('Theme activation/opening/closing: native light/dark surfaces unchanged; no writes; explicit opacity applies; reset and disable restore host.');
} finally {await fixture.close();}
