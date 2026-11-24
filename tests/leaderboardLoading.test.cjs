const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
async function fixture(fetchRows) {
  let state, timeout, metric='current_streak';
  const module={exports:{}};
  const js=ts.transpileModule(readFileSync('lib/useLeaderboard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','module','exports','setTimeout','clearTimeout',js)(require,module,module.exports,fn=>{timeout=fn;return fn;},()=>{});
  function Probe(){state=module.exports.useLeaderboard(metric,fetchRows);return null;}
  let root; await act(async()=>{root=create(React.createElement(Probe));});
  return {get state(){return state;},retry:async()=>act(async()=>state.retry()),timeout:async()=>act(async()=>timeout()),
    change:async value=>act(async()=>{metric=value;root.update(React.createElement(Probe));}),
    rerender:async fn=>act(async()=>{fetchRows=fn;root.update(React.createElement(Probe));}),
    close:async()=>act(async()=>root.unmount())};
}
test('failed cloud request is not an empty leaderboard; retry can recover',async()=>{
  let fail=true;const f=await fixture(async()=>{if(fail)throw Error('offline');return [{id:'a'}];});
  assert.equal(f.state.failed,true);assert.equal(f.state.loading,false);
  fail=false;await f.retry();assert.equal(f.state.failed,false);assert.deepEqual(f.state.profiles,[{id:'a'}]);await f.close();
});
test('successful empty board remains distinct from failure',async()=>{
  const f=await fixture(async()=>[]);assert.equal(f.state.failed,false);assert.equal(f.state.loading,false);assert.deepEqual(f.state.profiles,[]);await f.close();
});
test('older metric response cannot overwrite the newly selected ranking',async()=>{
  const old=deferred(),next=deferred();const f=await fixture(metric=>metric==='current_streak'?old.promise:next.promise);
  await f.change('longest_streak');await act(async()=>next.resolve([{id:'new'}]));
  await act(async()=>old.resolve([{id:'old'}]));assert.deepEqual(f.state.profiles,[{id:'new'}]);await f.close();
});
test('timeout stops spinner; late success cannot overwrite a successful retry',async()=>{
  const old=deferred();let first=true;const f=await fixture(()=>{if(first){first=false;return old.promise;}return Promise.resolve([{id:'retry'}]);});
  await f.timeout();assert.equal(f.state.failed,true);assert.equal(f.state.loading,false);
  await f.retry();await act(async()=>old.resolve([{id:'stale'}]));assert.deepEqual(f.state.profiles,[{id:'retry'}]);await f.close();
});
test('provider callback identity changes do not repeatedly fetch; retry uses latest callback',async()=>{
  let calls=0;const f=await fixture(async()=>{calls++;return [];});
  await f.rerender(async()=>{calls++;return [{id:'latest'}];});assert.equal(calls,1);
  await f.retry();assert.equal(calls,2);assert.deepEqual(f.state.profiles,[{id:'latest'}]);await f.close();
});
test('unmounted request rejection is handled without updating the removed screen',async()=>{
  const request=deferred();const f=await fixture(()=>request.promise);await f.close();await act(async()=>request.reject(Error('offline')));
});
