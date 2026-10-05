import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture,installShippedMobileStyles} from './rc1-browser-fixture.mjs';
const fixture=await browserFixture(process.env.DSHA_TEST_RUNTIME);
try {
 const {page}=fixture;
 const recipe=JSON.parse(fs.readFileSync('app/src/main/assets/ru-stats-strip-patch.json','utf8'));
 await fixture.load('dsh-client-ui-chat',[recipe],'module.exports.audit={StatsPills};');
 await installShippedMobileStyles(page);
 await page.addScriptTag({path:'app/src/main/assets/web-integration/mobile-layout.js'});
 await page.evaluate(catalog=>{
  const React=auditModules.react,dom=auditModules['react-dom/client'];
  const t=(key,args={})=>String(catalog.chat[key]||Object.values(catalog).map(namespace=>namespace[key]).find(Boolean)||key).replace(/\{(\w+)\}/g,(_,name)=>args[name]??'');
  const projections={sessionStats:{turns:28,steps:399,llmMs:4000,toolMs:0,ttftSteps:1,ttftMs:500,decodeMs:1000,decodeTokens:447},tokenUsage:{uncachedInputTokens:1000000,cacheReadTokens:100000000,cacheWriteTokens:0,outputTokens:447}};
  dom.createRoot(document.getElementById('root')).render(React.createElement(auditExports['@deepseek-ai/dsh-client-ui-chat'].audit.StatsPills,{t,useChat:select=>select({legacy:{nodes:[]}}),useProjection:key=>projections[key],usePerformanceUsage:select=>select('compact')}));
 },JSON.parse(fs.readFileSync('app/src/main/assets/web-integration/ru-locales.json','utf8')));
 await page.locator('[data-composer-stats]').waitFor();
 const text=await page.locator('[data-composer-stats]').innerText();
 assert.match(text,/28 витков · 399 шагов/);assert.match(text,/447 ток\/с/);assert.doesNotMatch(text,/кэш/);
 const buttons=page.locator('[data-composer-stats] button');assert.equal(await buttons.count(),2);
 await buttons.nth(1).click();await page.locator('[data-session-stats-usage]').waitFor();
 assert.match(await page.locator('[data-session-stats-usage]').innerText(),/Попадание в кэш/);
 await page.keyboard.press('Escape');await buttons.nth(0).click();await page.locator('[data-session-stats-details]').waitFor();
 assert.match(await page.locator('[data-session-stats-details]').innerText(),/447 ток\/с/);
 assert.deepEqual(fixture.errors,[]);
 console.log('PASS real compact-mode stats: full counts, speed and total; both original dialogs clickable, cache retained in details');
} finally {await fixture.close();}
