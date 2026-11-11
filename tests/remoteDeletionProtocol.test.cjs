const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');const path=require('node:path');
const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../supabase/functions/delete-account-recovery/protocol.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
function fixture(){let now=1000000;const users=new Set(['A','B']),calls=[];const deps={audience:'curfy-test',currentKey:'ab'.repeat(32),now:()=>now,authenticate:async token=>token==='Bearer valid'?'A':null,exists:async id=>users.has(id),deleteUser:async id=>{calls.push(id);users.delete(id)}};return {deps,users,calls,advance:()=>now+=31*86400000,call:async(action,extra={},auth)=>m.exports.deletionHandler(deps)(new Request('https://example.invalid',{method:'POST',headers:auth?{Authorization:auth}:{},body:JSON.stringify({action,...extra})})),prepare:async function(){const r=await this.call('prepare',{},'Bearer valid');assert.equal(r.status,200);return r.json()}};}
test('prepare authenticates and does not delete; forged body IDs are ignored',async()=>{const f=fixture();assert.equal((await f.call('prepare')).status,401);assert.equal((await f.call('prepare',{},'Bearer invalid')).status,401);const r=await f.call('prepare',{userId:'B'},'Bearer valid');assert.equal((await r.json()).userId,'A');assert.deepEqual(f.calls,[])});
test('lost commit response recovers without a session and never deletes B',async()=>{const f=fixture(),p=await f.prepare();assert.equal((await f.call('commit',{proof:p.proof,userId:'B'})).status,200);assert.deepEqual(await(await f.call('status',{proof:p.proof})).json(),{status:'deleted'});assert.equal((await f.call('commit',{proof:p.proof})).status,200);assert.deepEqual(f.calls,['A']);assert.ok(f.users.has('B'))});
test('proof forgery, missing proof, wrong project, and expiry cannot delete',async()=>{const f=fixture(),p=await f.prepare();for(const proof of [undefined,'junk',p.proof.replace(/^./,p.proof[0]==='a'?'b':'a')])assert.equal((await f.call('commit',{proof})).status,401);f.deps.audience='other';assert.equal((await f.call('commit',{proof:p.proof})).status,401);f.deps.audience='curfy-test';f.advance();assert.equal((await f.call('commit',{proof:p.proof})).status,410);assert.deepEqual(f.calls,[])});
test('key rotation accepts previous key during validity, rejects retired key',async()=>{const f=fixture(),p=await f.prepare();f.deps.previousKey=f.deps.currentKey;f.deps.currentKey='cd'.repeat(32);assert.equal((await f.call('status',{proof:p.proof})).status,200);delete f.deps.previousKey;assert.equal((await f.call('commit',{proof:p.proof})).status,401)});
test('Auth lookup failure and deletion failure never return success',async()=>{const f=fixture(),p=await f.prepare();f.deps.deleteUser=async()=>{throw Error('db unavailable')};assert.equal((await f.call('commit',{proof:p.proof})).status,503);f.deps.exists=async()=>{throw Error('401')};assert.equal((await f.call('status',{proof:p.proof})).status,503);assert.deepEqual(f.calls,[])});
test('concurrent duplicate commit reconciles verified absence',async()=>{const f=fixture(),p=await f.prepare();const results=await Promise.all([f.call('commit',{proof:p.proof}),f.call('commit',{proof:p.proof})]);assert.ok(results.every(r=>r.status===200));assert.ok(f.calls.every(id=>id==='A'));assert.ok(f.users.has('B'))});
test('method, malformed and oversized bodies are rejected without deletion',async()=>{const f=fixture(),h=m.exports.deletionHandler(f.deps);assert.equal((await h(new Request('https://example.invalid'))).status,405);for(const [body,status]of [['{',400],['x'.repeat(8193),413],['null',400]])assert.equal((await h(new Request('https://example.invalid',{method:'POST',body}))).status,status);assert.deepEqual(f.calls,[])});
test('missing signing secret cannot issue a recovery capability',async()=>{const f=fixture();f.deps.currentKey='';assert.equal((await f.call('prepare',{},'Bearer valid')).status,503);assert.deepEqual(f.calls,[])});

test('expired proof reconciles completed deletion after a long-offline restart',async()=>{
 const f=fixture(),p=await f.prepare();
 assert.equal((await f.call('commit',{proof:p.proof})).status,200);
 f.advance();
 assert.deepEqual(await(await f.call('status',{proof:p.proof})).json(),{status:'deleted'});
 assert.deepEqual(await(await f.call('commit',{proof:p.proof})).json(),{status:'deleted'});
 assert.deepEqual(f.calls,['A']);assert.ok(f.users.has('B'));
});
test('expired proof never deletes an existing account or masks an Auth failure',async()=>{
 const f=fixture(),p=await f.prepare();f.advance();
 assert.equal((await f.call('commit',{proof:p.proof})).status,410);
 assert.ok(f.users.has('A'));assert.deepEqual(f.calls,[]);
 f.deps.exists=async()=>{throw Error('service unavailable')};
 assert.equal((await f.call('status',{proof:p.proof})).status,503);
});

test('archived verification keys reconcile absence but cannot authorize deletion',async()=>{
 const f=fixture(),p=await f.prepare();f.deps.verificationOnlyKeys=[f.deps.currentKey];f.deps.currentKey='ef'.repeat(32);
 assert.equal((await f.call('commit',{proof:p.proof})).status,410);assert.deepEqual(f.calls,[]);
 f.users.delete('A');f.advance();
 assert.deepEqual(await(await f.call('status',{proof:p.proof})).json(),{status:'deleted'});
});
