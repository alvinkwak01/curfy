const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { act,create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
async function fixture({outcome='owned'}={}) {
  let ownership='free',value,notify;const calls=[];
  const store={loadPremiumEntitlement:async()=>ownership,subscribePremiumTransactions:fn=>{notify=fn;return ()=>{};},
    purchasePremium:async()=>{calls.push('purchase');if(outcome==='owned') ownership='owned';return outcome;},
    restorePremium:async()=>{calls.push('restore');ownership='owned';return 'owned';}};
  const js=ts.transpileModule(readFileSync('context/PremiumContext.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',js)(name=>{
    if(name==='react'||name==='react/jsx-runtime')return require(name);
    if(name==='react-native')return {Platform:{OS:'ios'},AppState:{addEventListener:()=>({remove(){}})}};
    if(name==='@/lib/premiumStore')return store;
    throw Error(name);
  },module,module.exports);
  function Probe(){value=module.exports.usePremium();return null;}
  let root;await act(async()=>{root=create(React.createElement(module.exports.PremiumProvider,null,React.createElement(Probe)));});
  return {get value(){return value;},store,calls,change:x=>{ownership=x;notify();},close:async()=>act(async()=>root.unmount())};
}
for(const outcome of ['owned','pending','cancelled']) test('Premium provider reconciles '+outcome+' through verified ownership',async()=>{
  const f=await fixture({outcome});assert.equal(f.value.entitlement,'free');
  await act(async()=>{assert.equal(await f.value.purchase(),outcome);});
  assert.equal(f.value.entitlement,outcome==='owned'?'owned':'free');assert.equal(f.value.isChecking,false);await f.close();
});
test('purchase and restore cannot open simultaneous StoreKit requests',async()=>{
  const f=await fixture();let release;f.store.purchasePremium=()=>new Promise(resolve=>{release=resolve;});
  await act(async()=>{const request=f.value.purchase();await assert.rejects(f.value.restore(),/already in progress/);release('cancelled');await request;});
  assert.equal(f.calls.includes('restore'),false);await f.close();
});
test('restore enables owned state, later refund update removes it without changing shields',async()=>{
  const f=await fixture();await act(async()=>{await f.value.restore();});assert.equal(f.value.entitlement,'owned');
  await act(async()=>{f.change('free');});assert.equal(f.value.entitlement,'free');await f.close();
});
