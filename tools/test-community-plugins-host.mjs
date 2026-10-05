import assert from 'node:assert/strict';
import {Context} from '@deepseek-ai/cordis';
import {SessionProjectionRegistry} from '@deepseek-ai/dsh-session-projection';
import {resolveConfig} from '../app/src/main/assets/builtin-plugins/dsh-session-health/lib/config.js';
import {sessionHealthProjectionDefinition} from '../app/src/main/assets/builtin-plugins/dsh-session-health/lib/projection.js';
const ctx=new Context();
const registry=new SessionProjectionRegistry(ctx);
registry.register(sessionHealthProjectionDefinition(resolveConfig({cost:{priceSource:'static'}})));
const events=[
 {type:'user/message',data:{},seq:0},
 {type:'request/context',data:{contextWindow:100000},seq:1},
 {type:'assistant/message',data:{usage:{inputTokens:20000,cacheReadTokens:40000,outputTokens:100}},seq:2},
 {type:'step/end',data:{turn:1},seq:3},
 {type:'step/end',data:{turn:1},seq:4},
 {type:'compaction/end',data:{},seq:5},
];
const restored=registry.restore({},events,0,{id:'test'},0);
const value=restored.snapshot?.values?.sessionHealth ?? restored.values?.sessionHealth;
assert.ok(value,JSON.stringify(restored));
assert.equal(value.turns,1);assert.equal(value.compactions,1);
assert.equal(value.total,60000);assert.equal(value.ratio,.6);
assert.match(value.advice,/[А-Яа-я]/);assert.doesNotMatch(value.advice,/[\u4e00-\u9fff]/);
const checkpoint=restored.checkpoint;
assert.deepEqual(registry.viewCheckpoint(checkpoint).sessionHealth,value,'Cold restored session has the same health');
assert.deepEqual(registry.viewCheckpoint({sessionHealth:{...checkpoint.sessionHealth,ver:7}}),{},'Old cache refolds');
for(const name of ['dsh-peak-chip','dsh-batch-tool-calls','dsh-any-background','dsh-subagent-model-picker']) {
 const plugin=await import('../app/src/main/assets/builtin-plugins/'+name+'/lib/index.js');
 assert.ok(plugin.apply||plugin.default?.apply,name);
}
await ctx.scope?.dispose?.();
console.log('Community host imports and RC2 health fold/checkpoint/restore passed');
