const assert = require('node:assert/strict');
const {test} = require('node:test');
const {readFileSync} = require('node:fs');
const ts = require('typescript');
const settings = {bedtime:'22:00',wakeTime:'07:00',blockMode:'custom',routine:'evening',userName:'Test',motivation:'Boundary'};
function load(file, dependencies) {
  const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const mod={exports:{}};new Function('require','module','exports',js)(dependencies,mod,mod.exports);return mod.exports;
}
function fixture() {
  const disk=new Map();let failure=()=>false;let receipt=null;let nativeCalls=0;
  const storage={getItem:async key=>{if(failure('get',key))throw Error('read failed');return disk.get(key)??null;},
    setItem:async(key,value)=>{if(failure('set',key))throw Error('write failed');disk.set(key,value);},
    removeItem:async key=>{if(failure('remove',key))throw Error('remove failed');disk.delete(key);}};
  const guard=load('lib/protectionOperation.ts',()=>{});
  const restart=()=>load('lib/settingsTransaction.ts',name=>name.includes('async-storage')?storage:guard);
  let api=restart();
  const configure=async input=>{const done=guard.beginProtectionOperation(input.operationOwner);try{
    if(receipt!==input.settingsTransactionId){nativeCalls++;receipt=input.settingsTransactionId;}
  }finally{done();}};
  return {disk,storage,guard,configure,get api(){return api;},restart:()=>{api=restart();},
    fail:fn=>failure=fn,get nativeCalls(){return nativeCalls;}};
}
test('journal is durable before native mutation and removed only after verified local commit',async()=>{
 const f=fixture();await f.api.saveSettingsTransaction(settings,true,'curfy-draft-custom',async input=>{
   assert.ok(f.disk.has(f.api.SETTINGS_JOURNAL_KEY));assert.equal(f.disk.has('@dusk/bedtime'),false);await f.configure(input);
 });assert.equal(f.disk.has(f.api.SETTINGS_JOURNAL_KEY),false);assert.equal(f.disk.get('@dusk/wake_time'),'07:00');
});
for(const key of ['@dusk/bedtime','@dusk/wake_time','@dusk/block_mode','@curfy/protection_routine','@dusk/username','@dusk/motivation']) {
 test('restart completes partial local write failure at '+key+' without another native commit',async()=>{
  const f=fixture();f.fail((op,k)=>op==='set'&&k===key);
  await assert.rejects(f.api.saveSettingsTransaction(settings,true,undefined,f.configure));assert.equal(f.nativeCalls,1);
  assert.ok(f.disk.has(f.api.SETTINGS_JOURNAL_KEY));f.fail(()=>false);f.restart();
  assert.deepEqual(await f.api.recoverSettingsTransaction(f.configure),settings);assert.equal(f.nativeCalls,1);
  assert.equal(await f.api.recoverSettingsTransaction(f.configure),null);
 });
}
for(const op of ['get','set']) test('journal '+op+' failure prevents native mutation',async()=>{
 const f=fixture();f.fail((operation,key)=>operation===op&&key===f.api.SETTINGS_JOURNAL_KEY);
 await assert.rejects(f.api.saveSettingsTransaction(settings,true,undefined,f.configure));assert.equal(f.nativeCalls,0);
});
test('cosmetic save and recovery never configure native protection',async()=>{
 const f=fixture();f.fail((op,k)=>op==='set'&&k==='@dusk/username');
 await assert.rejects(f.api.saveSettingsTransaction(settings,false,undefined,f.configure));f.fail(()=>false);f.restart();
 await f.api.recoverSettingsTransaction(f.configure);assert.equal(f.nativeCalls,0);
});
test('cleanup failure is retryable without resetting native exceptions',async()=>{
 const f=fixture();f.fail(op=>op==='remove');await assert.rejects(f.api.saveSettingsTransaction(settings,true,undefined,f.configure));
 f.fail(()=>false);f.restart();await f.api.recoverSettingsTransaction(f.configure);assert.equal(f.nativeCalls,1);
});
test('silent preference write failure is detected and recovered',async()=>{
 const f=fixture();const set=f.storage.setItem;f.storage.setItem=async(k,v)=>{if(k!=='@dusk/wake_time')await set(k,v);};
 await assert.rejects(f.api.saveSettingsTransaction(settings,true,undefined,f.configure),/confirm/);
 f.storage.setItem=set;await f.api.recoverSettingsTransaction(f.configure);assert.equal(f.nativeCalls,1);
});
test('restart before native completion resumes the recorded intent',async()=>{
 const f=fixture();await assert.rejects(f.api.saveSettingsTransaction(settings,true,'curfy-draft-custom',async()=>{throw Error('process interrupted');}));
 f.restart();await f.api.recoverSettingsTransaction(f.configure);assert.equal(f.nativeCalls,1);
});
test('confirmed native failure aborts journal without changing local preferences',async()=>{
 const f=fixture();f.disk.set('@dusk/bedtime','23:00');
 await assert.rejects(f.api.saveSettingsTransaction(settings,true,undefined,async()=>{throw Object.assign(Error('native rejected'),{settingsRollbackConfirmed:true});}));
 assert.equal(f.disk.get('@dusk/bedtime'),'23:00');assert.equal(f.disk.has(f.api.SETTINGS_JOURNAL_KEY),false);
});
test('corrupt journal blocks recovery and is preserved',async()=>{
 const f=fixture();f.disk.set(f.api.SETTINGS_JOURNAL_KEY,'{"version":200}');
 await assert.rejects(f.api.recoverSettingsTransaction(f.configure));assert.equal(f.nativeCalls,0);assert.ok(f.disk.has(f.api.SETTINGS_JOURNAL_KEY));
});
test('pending journal cannot be overwritten by another save',async()=>{
 const f=fixture();f.disk.set(f.api.SETTINGS_JOURNAL_KEY,'pending');
 await assert.rejects(f.api.saveSettingsTransaction(settings,true,undefined,f.configure),/previous Settings/);
 assert.equal(f.disk.get(f.api.SETTINGS_JOURNAL_KEY),'pending');
});
test('transaction excludes overlapping native mutations until local writes finish',async()=>{
 const f=fixture();let resume;const wait=new Promise(r=>resume=r);let entered;
 const ready=new Promise(r=>entered=r);const set=f.storage.setItem;
 f.storage.setItem=async(k,v)=>{if(k==='@dusk/wake_time'){entered();await wait;}await set(k,v);};
 const saving=f.api.saveSettingsTransaction(settings,true,undefined,f.configure);await ready;
 assert.equal(f.guard.protectionOperationPending(),true);assert.throws(()=>f.guard.beginProtectionOperation(),/Wait/);
 await assert.rejects(f.api.saveSettingsTransaction(settings,false,undefined,f.configure),/Wait/);
 resume();await saving;assert.equal(f.guard.protectionOperationPending(),false);
});
