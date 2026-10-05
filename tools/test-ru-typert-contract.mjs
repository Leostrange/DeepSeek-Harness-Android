import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const installed=path.resolve('app/build/locked-dsh-runtime/node_modules');
const modules=path.join(installed,'@deepseek-ai');
const loader=await fs.readFile(path.join(modules,'dsh-typert-loader/lib/index.js'),'utf8');
const start=loader.indexOf('const MEMBER_KINDS');
const end=loader.indexOf('async function apply(ctx, config)');
const sandbox=vm.createContext({});
vm.runInContext('const TYPERT_HOST_EXPORT="./typert";\n'+loader.slice(start,end)+'\nthis.validate=validateTypertManifest;',sandbox);
const {Context}=await import(pathToFileURL(path.join(modules,'cordis/lib/index.js')));
const {TypertRegistry}=await import(pathToFileURL(path.join(modules,'dsh-typert-registry/lib/index.js')));
const ctx=new Context();
const registry=new TypertRegistry(ctx);
const temporary=[];const disposers=[];
try {
  const pkg='dsh-agent-preset-registry';
  const recipe=JSON.parse(await fs.readFile('app/src/main/assets/ru-preset-editor-host-patch.json','utf8'));
  let source=await fs.readFile(path.join(modules,pkg,'lib/typert.host.js'),'utf8');
  for(const patch of recipe.patches){assert.equal(source.split(patch.before).length,2);source=source.replace(patch.before,patch.after);}
  const file=path.join(modules,pkg,'lib/.dsha-contract-check.mjs');temporary.push(file);await fs.writeFile(file,source);
  const {TYPERT}=await import(pathToFileURL(file));
  sandbox.validate('@deepseek-ai/'+pkg,TYPERT);
  const save=TYPERT.invocations.find(row=>row.method==='save');assert.ok(save);
  const broken={...TYPERT,invocations:[{...save,parameters:save.parameters.map(row=>row.name==='content'?{...row,codec:{...row.codec,typeSymbol:undefined}}:row)}]};
  assert.throws(()=>sandbox.validate('@deepseek-ai/'+pkg,broken),/typeSymbol/);
  for(const key of ['content','expected']){
    const codec=save.parameters.find(row=>row.name===key).codec;
    assert.equal(codec.mode,'strict');assert.equal(codec.create().safeParse('draft').success,true);
    assert.equal(codec.create().safeParse(42).success,false);assert.equal(codec.create().safeParse('x'.repeat(262145)).success,false);
  }
  disposers.push(registry.register(TYPERT));
  const critical=[];
  for(const folder of await fs.readdir(modules)){
    if(folder===pkg)continue;
    const host=path.join(modules,folder,'lib/typert.host.js');let text;
    try{text=await fs.readFile(host,'utf8');}catch{continue;}
    if(!text.includes("namespace: 'directoryPicker'")&&!text.includes("method: 'listProviders'")&&!text.includes("namespace: 'pluginManager'"))continue;
    const artifact=(await import(pathToFileURL(host))).TYPERT;
    sandbox.validate('@deepseek-ai/'+folder,artifact);disposers.push(registry.register(artifact));critical.push(folder);
  }
  assert.ok(registry.local.get('agentPresets/save'));
  assert.ok(registry.local.get('directoryPicker/list'),'The directory API must survive registration of the editor');
  assert.ok(registry.local.get('llm/listProviders'),'The model API must survive registration of the editor');
  assert.ok(critical.some(name=>name.includes('plugin')),'Check plugin management API manifests');
  disposers[0]();
  assert.equal(registry.local.get('agentPresets/save'),undefined);
  assert.ok(registry.local.get('directoryPicker/list'));
  assert.ok(registry.local.get('llm/listProviders'));
  console.log('PASS actual Typert loader validation and registry: strict save codecs, directory picker, model providers and plugin APIs; independent disposal');
} finally {
  for(const dispose of disposers.reverse())dispose();
  for(const file of temporary)await fs.unlink(file);
}
