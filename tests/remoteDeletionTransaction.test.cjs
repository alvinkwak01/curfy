const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const path=require('node:path');
const mod={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/remoteDeletionTransaction.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports);
const {createDeletionTransaction,readDeletionIntent,REMOTE_DELETION_PENDING_KEY:KEY}=mod.exports;
function fixture(){
 const disk=new Map(), calls=[];
 let deleted=false, loseResponse=false, failConfirm=false, failStatus=false;
 const storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>{disk.set(k,v)},removeItem:async k=>{disk.delete(k)}};
 const transport={prepare:async()=>{calls.push('prepare');return {userId:'A',requestId:'request-A',proof:'secret-proof-A'}},status:async i=>{calls.push('status');assert.equal(i.proof,'secret-proof-A');if(failStatus)throw Error('401 is not success');return deleted?'deleted':'pending'},commit:async i=>{calls.push('commit');assert.ok(disk.has(KEY));assert.equal(i.userId,'A');deleted=true;if(loseResponse)throw Error('response lost');return 'deleted'}};
 const confirm=async id=>{calls.push('confirm');assert.equal(id,'A');if(failConfirm)throw Error('disk unavailable')};
 return {disk,calls,storage,transport,confirm,tx:()=>createDeletionTransaction(storage,transport),lose:()=>{loseResponse=true},failConfirm:()=>{failConfirm=true},failStatus:()=>{failStatus=true}};
}
test('journal is saved before commit and retained until explicit finalization',async()=>{
 const f=fixture(),t=f.tx();await t.run('A',f.confirm);assert.deepEqual(f.calls,['prepare','status','commit','confirm']);assert.ok(f.disk.has(KEY));await t.finish('A');assert.equal(await readDeletionIntent(f.storage),null);
});
test('lost response recovers after restart with no session, without deleting twice',async()=>{
 const f=fixture();f.lose();await assert.rejects(f.tx().run('A',f.confirm),/response lost/);await f.tx().run(null,f.confirm);assert.deepEqual(f.calls,['prepare','status','commit','status','confirm']);
});
test('exit after prepare readback resumes the same request',async()=>{
 const f=fixture();f.transport.status=async()=>{throw Error('process exits')};await assert.rejects(f.tx().run('A',f.confirm));f.transport.status=async()=> 'pending';await f.tx().run(null,f.confirm);assert.equal(f.calls.filter(x=>x==='prepare').length,1);assert.equal(f.calls.filter(x=>x==='commit').length,1);
});
test('failed confirmation retains proof for the next process',async()=>{
 const f=fixture();f.failConfirm();await assert.rejects(f.tx().run('A',f.confirm),/disk unavailable/);await f.tx().run(null,async()=>{});assert.equal(f.calls.filter(x=>x==='commit').length,1);assert.ok(f.disk.has(KEY));
});
for(const mode of ['throw','drop','corrupt'])test(`journal ${mode} prevents destructive commit`,async()=>{
 const f=fixture();f.storage.setItem=async(k,v)=>{if(mode==='throw')throw Error('disk');if(mode==='corrupt')f.disk.set(k,'{}')};await assert.rejects(f.tx().run('A',f.confirm));assert.deepEqual(f.calls,['prepare']);
});
test('malformed or unreadable journal never starts another deletion',async()=>{
 const f=fixture();f.disk.set(KEY,'broken');await assert.rejects(f.tx().run('A',f.confirm));f.storage.getItem=async()=>{throw Error('read failed')};await assert.rejects(f.tx().run('A',f.confirm));assert.deepEqual(f.calls,[]);
});
test('missing session and missing journal is not successful remote deletion',async()=>{
 const f=fixture();await assert.rejects(f.tx().run(null,f.confirm));assert.deepEqual(f.calls,[]);
});
test('wrong active account cannot reuse or clear another account proof',async()=>{
 const f=fixture();await f.tx().run('A',f.confirm);f.calls.length=0;await assert.rejects(f.tx().run('B',f.confirm));await assert.rejects(f.tx().finish('B'));assert.deepEqual(f.calls,[]);assert.ok(f.disk.has(KEY));
});
test('server prepared identity mismatch never saves or commits',async()=>{
 const f=fixture();f.transport.prepare=async()=>({userId:'B',requestId:'r',proof:'p'});await assert.rejects(f.tx().run('A',f.confirm));assert.equal(f.disk.size,0);assert.deepEqual(f.calls,[]);
});
test('status authorization or network failure is never confirmation',async()=>{
 const f=fixture();f.failStatus();await assert.rejects(f.tx().run('A',f.confirm));assert.deepEqual(f.calls,['prepare','status']);assert.ok(f.disk.has(KEY));
});
test('unexpected status and unconfirmed commit fail closed',async()=>{
 for(const stage of ['status','commit']){const f=fixture();f.transport[stage]=async()=>undefined;await assert.rejects(f.tx().run('A',f.confirm));assert.ok(!f.calls.includes('confirm'));}
});
test('overlapping commands cannot commit or erase an in-flight journal',async()=>{
 const f=fixture();let release;f.transport.prepare=()=>new Promise(r=>{release=r});const t=f.tx(),running=t.run('A',f.confirm);await new Promise(r=>setImmediate(r));await assert.rejects(t.run('A',f.confirm),/already/);await assert.rejects(t.finish('A'),/already/);release({userId:'A',requestId:'request-A',proof:'secret-proof-A'});await running;
});
test('failed journal removal remains retryable',async()=>{
 const f=fixture();await f.tx().run('A',f.confirm);f.storage.removeItem=async()=>{};await assert.rejects(f.tx().finish('A'));assert.ok(f.disk.has(KEY));
});
