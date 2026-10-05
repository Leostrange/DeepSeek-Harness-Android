// RC2 真实组件的手机尺寸回归；不连接模型或修改 Android 数据。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { browserFixture } from './rc1-browser-fixture.mjs';

const runtime = process.env.DSHA_TEST_RUNTIME;
assert.ok(runtime, 'Set DSHA_TEST_RUNTIME to the extracted RC2 runtime or a prepared fixture');
const asset = 'app/src/main/assets/web-integration/mobile-layout.js';
const manifest = JSON.parse(fs.readFileSync('app/src/main/assets/web-integration/manifest.json', 'utf8'));
assert.ok(manifest.content_scripts.some(entry => entry.js.indexOf('mobile-layout.js') >= 0 &&
  entry.js.indexOf('mobile-layout.js') < entry.js.indexOf('page.js')));
assert.match(fs.readFileSync('app/src/main/java/com/deepseekharness/app/ui/WebPageScripts.java', 'utf8'),
  /read\(context, "web-integration\/mobile-layout.js"\)/);
const fixture = await browserFixture(runtime);
const { page } = fixture; page.on("pageerror",e=>console.error("PAGE ERROR",String(e)));
try {
  const frontend = path.resolve(runtime, 'node_modules/@deepseek-ai/dsh-web-frontend/dist');
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  for (const match of html.matchAll(/href="\.\/(assets\/[^" ]+\.css)"/g))
    await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, match[1]), 'utf8') });
  await fixture.load('dsh-client-ui-user-questions', [], 'module.exports.audit = {PlanReviewPanel, QuestionFlow};');
  await fixture.load('dsh-client-ui-jobs', [], 'module.exports.audit = {JobItem};');
  await fixture.load('dsh-client-ui-settings-models', [], 'module.exports.audit = {ModelRow};');
  await fixture.load('dsh-client-ui-plugin-manager', [], 'module.exports.audit = {CardHead};');
  await page.addScriptTag({ path: asset });
  await page.addScriptTag({ path: asset });
  assert.equal(await page.locator('#dsha-mobile-layout').count(), 1, 'Repeated native injection must be idempotent');
  await page.evaluate(() => {
    const React = auditModules.react.default || auditModules.react;
    const ReactDOM = auditModules['react-dom'].default || auditModules['react-dom'];
    const questions = auditExports['@deepseek-ai/dsh-client-ui-user-questions'].audit;
    const jobs = auditExports['@deepseek-ai/dsh-client-ui-jobs'].audit;
    const t = key => ({'plan.discuss': 'Обсудить изменения плана', 'plan.approve': 'Подтвердить и продолжить',
      'kill.confirmAction': 'Подтвердить остановку задачи'}[key] || key);
    window.pressed = 0;
    window.root = ReactDOM.createRoot(document.getElementById('root'));
    window.renderCase = kind => {
      if (kind === 'plan') root.render(React.createElement(questions.PlanReviewPanel, {
        pending: {snapshot:()=>({channel:'waterfall'}),key:'plan', answer: async () => {pressed++;}, cancel: async () => {pressed++;}},
        review: {id:'plan', question:'Проверка плана', plan:'# План\n\nОписание', approve:{label:'approve'}},
        t, renderSlot: () => null
      }));
      if (kind === 'question') root.render(React.createElement(questions.QuestionFlow, {
        pending: {liveKeys:()=>['question'],engage(){},releaseFocus(){},holdFocus(){},snapshot(){return {channel:"waterfall",state:"active"}},takeTime(){},dismiss(){},key:'question', questions:[{id:'q', question:'Выберите вариант', options:[{label:'Первый вариант'}]}],
          cancel: async () => {pressed++;}, answer: async () => {pressed++;}},
        useStore: pick => pick({progressByRequest:{}}), useQuestionCard: (key,pick) => pick({channel:"waterfall",state:"active"}), actions:{prune(){},replace(){}, clear(){}}, t
      }));
      if(kind === 'model') root.render(React.createElement(auditExports['@deepseek-ai/dsh-client-ui-settings-models'].audit.ModelRow, {model:{id:'long-model-name',name:'Очень длинное название модели'},position:1,t,disabled:false,expanded:false,onFieldChange(){pressed++;},onRemove(){pressed++;},onToggle(){pressed++;}}));
      if(kind === 'plugin') root.render(React.createElement(auditExports['@deepseek-ai/dsh-client-ui-plugin-manager'].audit.CardHead, {title:'Очень длинное название плагина withoutspacesxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',description:'Описание',t,onOpen(){pressed++;},icon:null,tags:null,end:React.createElement('button',{onClick(){pressed++;}},'Включить пользовательский плагин')}));
      if (kind === 'job') root.render(React.createElement('ul', {className:'QsffPG_menu'}, React.createElement(jobs.JobItem, {
        job: {id:'job', label:'python very-long-script-with-arguments-and-no-spaces.py', kind:'process', status:'running', startedAt:0},
        now:10000, expanded:false, onToggle(){}, kill:{state:'armed', onPress(){pressed++;}}, t
      })));
    };
  });
  const cases = [];
  await page.addStyleTag({content:'body {font-size:20.8px} button {font-size:inherit}'});
  for (const [width, height] of [[280,360], [320,640], [360,800], [600,400]]) {
    await page.setViewportSize({width, height});
    for (const kind of ['plan', 'question', 'job', 'model', 'plugin']) {
      await page.evaluate(kind => renderCase(kind), kind);
      const card = page.locator(kind === 'plan' ? '.LVzXQa_card' : kind === 'question' ? '.Mbwy4a_card' : kind === 'job' ? '.QsffPG_item' : kind === 'model' ? '.zGbnIq_modelEntry' : '.X_2TxG_cardHead');
      await card.waitFor();
      const result = await card.evaluate(el => ({
        overflow:document.documentElement.scrollWidth-innerWidth,
        buttons:[...el.querySelectorAll('button')].map(button => {
          const box=button.getBoundingClientRect(); return {left:box.left, right:box.right};
        })
      }));
      assert.ok(result.overflow <= 1, `${kind} ${width}: horizontal overflow ${result.overflow}`);
      for (const button of result.buttons) assert.ok(button.left >= 0 && button.right <= width+1, JSON.stringify({kind,width,button}));
      if (kind === 'job') {
        const overlap = await page.evaluate(() => {
          const text=document.querySelector('.QsffPG_row').getBoundingClientRect();
          const stop=document.querySelector('.QsffPG_stop').getBoundingClientRect();
          return text.right > stop.left;
        });
        assert.equal(overlap, false, 'Stop button must have separate space');
      }
      cases.push({kind,width,height});
    }
  }
  await page.evaluate(() => renderCase('job'));
  await page.locator('.QsffPG_stop').click();
  assert.equal(await page.evaluate(() => pressed), 1, 'Original React stop handler must remain callable');
  await page.evaluate(() => renderCase('plan'));
  await page.getByRole('button', {name:'Подтвердить и продолжить', exact:true}).click();
  assert.equal(await page.evaluate(() => pressed), 2, 'Original plan approval handler must remain callable');
  await page.evaluate(() => {
    const trigger=document.createElement('button'); trigger.id='progress'; trigger.className='QsffPG_trigger';
    trigger.innerHTML='Задачи <span class="QsffPG_triggerDot"></span>'; document.body.append(trigger);
  });
  assert.equal(await page.locator('#progress').evaluate(el => getComputedStyle(el,'::after').animationName), 'dsha-task-progress');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#progress').evaluate(el => getComputedStyle(el,'::after').animationName), 'none');
  await page.locator('.QsffPG_triggerDot').evaluate(el => el.remove());
  assert.equal(await page.locator('#progress').evaluate(el => getComputedStyle(el,'::after').content), 'none', 'No progress for inactive tasks');
  const early = await fixture.browser.newPage();
  await early.addInitScript({path:asset});
  await early.goto(page.url());
  await early.locator('#dsha-mobile-layout').waitFor({state:'attached'});
  assert.equal(await early.locator('#dsha-mobile-layout').count(), 1, 'Document-start injection must install after head appears');
  await early.close();
  assert.deepEqual(fixture.errors, []);
  console.log(JSON.stringify({status:'PASS',cases,callbacks:true,idempotent:true,reducedMotion:true}, null, 2));
} finally { await fixture.close(); }
