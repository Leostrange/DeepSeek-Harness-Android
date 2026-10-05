import assert from 'node:assert/strict';
import fs from 'node:fs';
import {browserFixture, installShippedMobileStyles} from './rc1-browser-fixture.mjs';

const fixture = await browserFixture();
const {page} = fixture;
try {
  await installShippedMobileStyles(page);
  await page.addScriptTag({content:fs.readFileSync('app/src/main/assets/web-integration/mobile-layout.js','utf8')});
  await page.evaluate(() => {
    document.body.style.margin='0';
    document.body.innerHTML = `
      <div data-mobile-nav="frame" style="position:relative;display:grid;width:360px;height:700px">
        <aside style="width:280px;height:700px;background:#333"></aside>
        <main style="width:360px;height:700px;background:#fff"></main>
        <div data-mobile-nav="backdrop"></div>
      </div>
      <div data-phase="active" style="width:360px"><div id="chat-parent" class="EvIC1a_scroll" style="box-sizing:border-box;width:360px"><div data-dab-chat-card style="padding:18px;border:1px solid;">Сообщение</div></div></div>`;
  });
  const card = await page.locator('[data-dab-chat-card]').boundingBox();
  assert.equal(Math.round(card.x),16);
  assert.equal(Math.round(360-card.x-card.width),16);
  await page.evaluate(() => document.documentElement.setAttribute('data-dsha-pip',''));
  assert.equal(await page.locator('[data-mobile-nav="frame"] > aside').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await page.locator('[data-mobile-nav="backdrop"]').evaluate(el=>getComputedStyle(el).display),'none');
  await page.evaluate(() => document.documentElement.removeAttribute('data-dsha-pip'));
  assert.notEqual(await page.locator('[data-mobile-nav="frame"] > aside').evaluate(el=>getComputedStyle(el).display),'none');
  await page.evaluate(() => {
    document.body.innerHTML = `<div data-mobile-nav="frame"><div class="hHd-Xa_footArea">
      <div class="hHd-Xa_footerActions"><div data-mobile-nav="drawer-actions"><button>Журнал сессии</button></div><button class="sh-fa">Здоровье сессии</button></div>
      <div class="hHd-Xa_settingsArea"><button>Настройки</button></div></div></div>`;
  });
  const positions = await page.evaluate(() => {
    const box=s=>document.querySelector(s).getBoundingClientRect();
    return {log:box('[data-mobile-nav="drawer-actions"]'),health:box('.sh-fa'),settings:box('.hHd-Xa_settingsArea')};
  });
  assert.ok(positions.log.bottom < positions.health.top);
  assert.ok(Math.abs(positions.health.y-positions.settings.y)<1);
  assert.ok(positions.settings.x < positions.health.x);
  await page.evaluate(() => {
    document.body.innerHTML = `<div role="dialog" aria-modal="true" data-shortcut-modal="settings" style="display:flex">
      <nav><span>Настройки</span><div class="audit_navList" style="display:flex"><button class="audit_navCell">Общие</button><button class="audit_navCell">Модели</button><button class="audit_navCell">Плагины</button><button class="audit_navCell">Пресеты агентов</button><button class="audit_navCell">Тема</button></div></nav>
      <section id="settings-content" style="overflow:auto;min-height:0"><p>Содержимое</p></section></div>`;
  });
  const before=await page.locator('[aria-modal="true"]').boundingBox();
  await page.evaluate(() => document.getElementById('settings-content').innerHTML='<p>'.repeat(80)+'Длинный список'+'</p>'.repeat(80));
  const after=await page.locator('[aria-modal="true"]').boundingBox();
  assert.ok(Math.abs(before.height-after.height)<=1,'settings sheet height stays stable');
  assert.equal(await page.locator('.audit_navList').evaluate(el=>getComputedStyle(el).flexWrap),'nowrap');
  assert.deepEqual(fixture.errors,[]);
  console.log('Bugtracker mobile card, PiP drawer, sidebar footer, and settings geometry passed');
} finally { await fixture.close(); }
