import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture} from './rc1-browser-fixture.mjs';

const fixture=await browserFixture();
const {page}=fixture;
try {
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/web-integration/mobile-layout.js','utf8')});
  await page.evaluate(()=>{
    document.body.style.margin='0';
    document.documentElement.style.setProperty('--dsw-specific-menu','rgb(245, 245, 245)');
    document.documentElement.style.setProperty('--dsw-alias-label-primary','rgb(20, 20, 20)');
    document.body.innerHTML=`<div data-phase="active"><header class="wSkVaW_header" style="position:relative;height:76px;width:360px"><button data-mobile-nav="files" style="position:absolute;right:16px;top:6px;width:28px;height:28px">Папка</button></header><div class="wSkVaW_composerSeat" style="position:fixed;top:650px;left:20px;width:300px;height:120px"></div></div>`;
  });
  let source=fs.readFileSync('app/src/main/assets/builtin-plugins/dsh-peak-chip/lib/client.js','utf8');
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
    window.peakCleanup=null;
    auditExports['dsh-peak-chip'].apply({get:()=>undefined,effect:fn=>{peakCleanup=fn();}});
  });
  const chip=page.locator('[data-dsh-peak-chip]');
  await chip.waitFor();
  assert.equal(await chip.innerText(),'¥');
  assert.equal(await chip.evaluate(el=>el.nextElementSibling?.getAttribute('data-mobile-nav')),'files');
  const chipBox=await chip.boundingBox();
  const folderBox=await page.locator('[data-mobile-nav="files"]').boundingBox();
  assert.ok(Math.abs(folderBox.x-(chipBox.x+chipBox.width)-8)<=1,'tariff chip sits beside folder');
  assert.ok(Math.abs(folderBox.y-chipBox.y)<=1,'tariff chip shares folder baseline');
  await chip.click();
  const panel=page.locator('#dsh-peak-chip-panel');
  await panel.waitFor();
  const box=await panel.boundingBox();
  assert.ok(Math.abs(box.x+box.width/2-180)<=1,'tariff panel centered');
  assert.ok(box.y>=76,'tariff panel below chat header');
  assert.equal(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 245, 245)');
  assert.ok(await panel.evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight-8));
  await page.locator('.dsh-peak-chip-click').first().click();
  await page.locator('#dsh-peak-chip-detail').waitFor();
  assert.equal(await page.locator('#dsh-peak-chip-detail').evaluate(el=>el.parentElement?.id),'dsh-peak-chip-panel');
  await page.evaluate(()=>document.querySelector('header.wSkVaW_header').remove());
  await page.waitForTimeout(1100);
  assert.equal(await chip.count(),0,'tariff chip disappears outside chat');
  assert.equal(await panel.count(),0,'tariff panel closes outside chat');

  await page.evaluate(()=>{
    document.body.insertAdjacentHTML('beforeend','<div class="bRhRbq_panel" style="position:fixed;left:260px;top:700px;width:280px;height:100px"></div><div class="JObwrW_panel" style="position:fixed;left:260px;top:700px;width:260px;height:100px"></div>');
  });
  await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--dsha-composer-top')==='650px');
  for(const cls of ['.bRhRbq_panel','.JObwrW_panel']){
    const r=await page.locator(cls).boundingBox();
    assert.ok(Math.abs(r.x+r.width/2-170)<=1,`${cls} centered on composer`);
    assert.ok(r.y+r.height<=638,`${cls} above composer`);
  }
  await page.evaluate(()=>peakCleanup?.());
  assert.deepEqual(fixture.errors,[]);
  console.log('Tasklist tariff header/panel and composer popovers passed');
} finally {await fixture.close();}
