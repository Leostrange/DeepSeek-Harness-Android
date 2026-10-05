import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const modulePath=path.resolve('app/build/locked-dsh-runtime/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js');
const recipe=JSON.parse(await fs.readFile('app/src/main/assets/response-language-policy-patch.json','utf8'));
let source=await fs.readFile(modulePath,'utf8');
for(const patch of recipe.patches){
  assert.equal(source.split(patch.before).length,2,'response-language patch anchor is unique');
  source=source.replace(patch.before,patch.after);
}
const start=source.indexOf('const DSHA_RESPONSE_LANGUAGE_POLICIES');
const stop=source.indexOf('/**\n* Render the complete dynamic context snapshot.',start);
assert.ok(start>=0&&stop>start,'response-language policy is installed in the locked runtime');
const snippet=source.slice(start,stop)+'\nthis.renderPrompt=renderPrompt;';
for(const [language,word] of [['ru','Russian'],['en','English'],['zh','Simplified Chinese']]){
  const context=vm.createContext({process:{env:{DSHA_UI_LANGUAGE:language}},Object});
  vm.runInContext(snippet,context);
  const rendered=context.renderPrompt({sections:[{text:'BASE',interpolate:false}],variables:{}});
  assert.match(rendered,/^BASE\n\n/);
  assert.match(rendered,new RegExp(word));
  assert.match(rendered,/visible reasoning or progress update/);
  assert.match(rendered,/tool-call description/);
}
const context=vm.createContext({process:{env:{DSHA_UI_LANGUAGE:'invalid'}},Object});
vm.runInContext(snippet,context);
assert.equal(context.renderPrompt({sections:[{text:'BASE',interpolate:false}],variables:{}}),'BASE');
console.log('PASS selected UI language is appended to every rendered system prompt');
