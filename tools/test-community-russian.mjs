// Verify the community translation against downloaded public HTML and its real search script.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let playwright;
try {playwright=require('playwright');}
catch {playwright=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const snapshots=process.env.DSHA_COMMUNITY_FIXTURES || 'app/build/community';
const htmlFiles=fs.readdirSync(snapshots).filter(name=>name.endsWith('.html'));
assert.ok(htmlFiles.length>=18,'Download the community pages before this audit');
const script=fs.readFileSync('app/src/main/assets/web-integration/community-ru.js','utf8');
const appScript=fs.readFileSync(path.join(snapshots,'app.js'),'utf8');
const browser=await playwright.chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:800}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
let currentHtml;
await page.route('https://dsha.cc/**',route=>{
  const url=route.request().url();
  if(/\/assets\/app\..+\.js$/.test(url))return route.fulfill({contentType:'text/javascript',body:appScript});
  if(/\/assets\/styles\..+\.css$/.test(url))return route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(snapshots,'styles.css'),'utf8')});
  if(url.includes('/assets/'))return route.fulfill({body:'',contentType:url.endsWith('.css')?'text/css':'text/javascript'});
  return route.fulfill({contentType:'text/html',body:currentHtml});
});
try {
  for(const name of htmlFiles){
    currentHtml=fs.readFileSync(path.join(snapshots,name),'utf8');
    await page.goto('https://dsha.cc/');
    const hrefs=await page.locator('a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
    await page.evaluate(source=>{(0,eval)(source);},script);
    await page.waitForTimeout(40);
    const remaining=await page.evaluate(()=>{
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const texts=[];
      while(walker.nextNode()){
        const node=walker.currentNode;
        if(!node.parentElement.closest('script,style,noscript,textarea')&&/[\u4e00-\u9fff]/.test(node.nodeValue))texts.push(node.nodeValue);
      }
      for(const node of document.querySelectorAll('[placeholder],[aria-label],[title]'))
        for(const attr of ['placeholder','aria-label','title'])if(/[\u4e00-\u9fff]/.test(node.getAttribute(attr)||''))texts.push(node.getAttribute(attr));
      return texts;
    });
    assert.deepEqual(remaining,[],name+' has untranslated application copy');
    assert.deepEqual(await page.locator('a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),hrefs,'Translation must preserve installation and download URLs');
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');
    if(name==='index.html'){
      await page.locator('[data-search]').fill('темы');
      await page.waitForTimeout(250);
      const visible=await page.locator('[data-search-text]').evaluateAll(nodes=>nodes.filter(node=>!node.hidden).map(node=>node.textContent));
      assert.equal(visible.length,1,'Russian search must find the theme plugin');
      assert.match(visible[0],/Свои темы и обои/);
      assert.match(await page.locator('[data-results]').textContent(),/Показано: 1 \/ 11/);
      await page.screenshot({path:'app/build/reports/community-russian-mobile.png'});
    }
  }
  await page.evaluate(()=>{
    const input=document.createElement('textarea');input.value='Мой текст 中文';document.body.appendChild(input);
    const status=document.createElement('p');status.textContent='打开插件管理，查看 dsh-web-mobile 的状态。';document.body.appendChild(status);
  });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('textarea').last().inputValue(),'Мой текст 中文');
  assert.match(await page.locator('body').textContent(),/проверьте состояние dsh-web-mobile/);
  assert.deepEqual(errors,[]);
  console.log('PASS: '+htmlFiles.length+' community pages, Russian search, dynamic status, original links and user input');
} finally {await browser.close();}
