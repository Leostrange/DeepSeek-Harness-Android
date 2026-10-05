import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture} from './rc1-browser-fixture.mjs';

const source=fs.readFileSync('app/src/main/assets/builtin-plugins/dsh-web-mobile/lib/client.js','utf8');
const start=source.indexOf('function simplifyStatsSegments()');
const end=source.indexOf('\nfunction createStatsLineTask()',start);
assert.ok(start>=0&&end>start,'mobile stats simplifier is shipped');
assert.match(source,/\[data-mobile-nav="stats-tps"\][\s\S]{0,180}display:\s*flex\s*!important/);

const fixture=await browserFixture(process.env.DSHA_TEST_RUNTIME);
try {
  const {page}=fixture;
  await page.setContent(`<div data-mobile-nav="stats">
    <span><button class="demo_pill" data-kind="performance"><span class="demo_label">28 витков · 399 шагов<span class="demo_sep">·</span>65 ток/с</span></button></span>
    <span><button class="demo_pill" data-kind="usage"><span class="demo_label">101 млн ток<span class="demo_sep">·</span>Попадание в кэш 96%</span></button></span>
  </div>`);
  await page.addScriptTag({content:source.slice(start,end)+';window.simplifyStatsSegments=simplifyStatsSegments;'});
  const result=await page.evaluate(()=>{window.simplifyStatsSegments();return [...document.querySelectorAll('.demo_label')].map(node=>node.textContent);});
  assert.deepEqual(result,['28 витков · 399 шагов·65 ток/с','101 млн ток']);
  const clicks=await page.evaluate(()=>new Promise(resolve=>{const seen=[];for(const button of document.querySelectorAll('button[data-kind]'))button.addEventListener('click',()=>{seen.push(button.dataset.kind);if(seen.length===2)resolve(seen);});document.querySelector('[data-kind="performance"]').click();document.querySelector('[data-kind="usage"]').click();}));
  assert.deepEqual(clicks,['performance','usage']);
  assert.equal(await page.locator('[data-mobile-nav="stats"] button').count(),2);
  console.log('PASS mobile stats keeps full turns/steps, speed, total tokens and both clickable detail buttons; cache label is removed');
} finally { await fixture.close(); }
