const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const group = 'curfy-block-custom';
const t1 = 'curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD01';
const t2 = 'curfy-single-app-2B5CE120-66A6-4E53-A6BB-661E51A9AD02';
const ledgerKey = 'curfy-premium-active-exceptions';
const now = new Date('2026-11-07T23:00:00-08:00');
function entry(id) { return {
  activityName: 'curfy-premium-exception-' + id.slice('curfy-single-app-'.length).toLowerCase(),
  selectionId: id, committedSelectionId: group, startedAt: +now,
  expiresAt: +now + 900000, bedtimeEndAt: +now + 7*3600000,
}; }
function fixture({ entitlement = 'owned', active = [t1,t2], blocked = ['C'], failStop = false } = {}) {
  const selections = new Map([[group,['A','B','C']], [t1,['A']], [t2,['B']], ['curfy-draft-custom',['A','B']]]);
  const storage = new Map([
    ['curfy-scheduled-selection-id',group], ['curfy-bedtime-clock-window',{startMinute:22*60,endMinute:6*60}],
    [ledgerKey,Object.fromEntries(active.map(id => [entry(id).activityName,entry(id)]))],
  ]);
  const shields = new Set(blocked), activities = new Set(['curfy-bedtime',...active.map(id=>entry(id).activityName)]);
  const calls = [];
  const tokens = input => input.currentBlocklist ? [...shields] : selections.get(input.activitySelectionId) || [];
  const meta = values => ({applicationCount:values.length,categoryCount:0,webdomainCount:0,includeEntireCategory:false});
  const native = {
    AuthorizationStatus:{approved:2}, getAuthorizationStatus:()=>2,
    userDefaultsGet:key=>storage.get(key), userDefaultsSet:(key,value)=>storage.set(key,value), userDefaultsRemove:key=>storage.delete(key),
    getActivities:()=>[...activities],
    configureActions: config=>calls.push(['actions',config]),
    stopMonitoring:names=>{ calls.push(['stop',names]); if(!failStop) names.forEach(name=>activities.delete(name)); },
    startMonitoring:async (name,schedule)=>{ calls.push(['start',name,schedule]); activities.add(name); },
    getFamilyActivitySelectionId:id=>JSON.stringify(selections.get(id)),
    setFamilyActivitySelectionId:({id,familyActivitySelection})=>selections.set(id,JSON.parse(familyActivitySelection)),
    activitySelectionMetadata:input=>meta(tokens(input)),
    intersection:(a,b)=>meta(tokens(a).filter(token=>tokens(b).includes(token))),
    difference:(a,b,options)=>{
      assert.equal(options.stripToken,true);
      const values=tokens(a).filter(token=>!tokens(b).includes(token));
      selections.set(options.persistAsActivitySelectionId,values); return meta(values);
    },
    blockSelection:input=>{calls.push(['block',input.activitySelectionId]);tokens(input).forEach(token=>shields.add(token));},
    unblockSelection:input=>{calls.push(['unblock',input.activitySelectionId]);tokens(input).forEach(token=>shields.delete(token));},
    isShieldActive:()=>shields.size>0, resetBlocks:()=>shields.clear(), updateShield:()=>{},
  };
  const loaded = new Map();
  function local(name) {
    if(name==='react-native-device-activity') return native;
    if(name==='@/lib/premiumStore') return {refreshPremiumEntitlement:async()=>entitlement};
    if(name==='@/modules/curfy-protected-apps') return {validateProtectedAppChoice:()=>true};
    if(!loaded.has(name)) {
      const source=readFileSync(name.replace('@/','')+'.ts','utf8');
      const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
      const module={exports:{}};new Function('require','module','exports',js)(local,module,module.exports);loaded.set(name,module.exports);
    }
    return loaded.get(name);
  }
  return {native,calls,selections,storage,shields,activities,lifecycle:local('@/lib/premiumProtection'),screen:local('@/lib/screenTime'),operation:local('@/lib/protectionOperation'),grant:local('@/lib/premiumAppException').grantPremiumAppException};
}

test('Premium foreground recovery restores only missing non-exempt app',()=>{
  const f=fixture({blocked:[]});
  f.screen.reconcileProtectionWindow('22:00','06:00','custom',now);
  assert.deepEqual([...f.shields],['C']);
  assert.ok(f.calls.filter(c=>c[0]==='block').every(c=>c[1]!==group));
});
test('all selected apps can retain independent active exceptions',()=>{
  const f=fixture(); f.selections.set(group,['A','B']); f.shields.clear();
  f.screen.reconcileProtectionWindow('22:00','06:00','custom',now);
  assert.equal(f.shields.size,0); assert.equal(f.calls.some(c=>c[0]==='block'),false);
});
test('native selection subtraction failure never shields an active exception',()=>{
  const f=fixture(); f.native.difference=()=>undefined;
  assert.throws(()=>f.screen.reconcileProtectionWindow('22:00','06:00','custom',now),/isolate/);
  assert.deepEqual([...f.shields],['C']);
});
test('Premium stop retires each exception before the daily monitor',()=>{
  const f=fixture();f.screen.stopBedtimeBlocking(now);
  assert.equal(f.activities.size,0);assert.equal(f.shields.size,0);
  assert.deepEqual(f.storage.get(ledgerKey),{});
  const stops=f.calls.filter(c=>c[0]==='stop');assert.deepEqual(stops.at(-1)[1],['curfy-bedtime']);
});
test('refused Premium exception stop preserves daily cutoff and recovery metadata',()=>{
  const f=fixture({failStop:true});
  assert.throws(()=>f.screen.stopBedtimeBlocking(now),/could not stop/);
  assert.ok(f.activities.has('curfy-bedtime'));assert.equal(Object.keys(f.storage.get(ledgerKey)).length,2);
  assert.equal(f.calls.some(c=>c[0]==='stop'&&c[1].includes('curfy-bedtime')),false);
});
test('unrecorded Premium monitor prevents daily teardown',()=>{
  const f=fixture({active:[]});f.activities.add('curfy-premium-exception-orphan');
  assert.throws(()=>f.screen.stopBedtimeBlocking(now),/unrecognized/);
  assert.ok(f.activities.has('curfy-bedtime'));
});
for(const entitlement of ['free','unknown']) test(`${entitlement} cannot configure multiple applications`,async()=>{
  const f=fixture({entitlement,active:[]});
  await assert.rejects(f.screen.configureBedtimeBlocking({bedtime:'22:00',wakeTime:'06:00',mode:'custom',now}),/Premium/);
  assert.equal(f.calls.length,0);
});
test('verified ownership configures multiple app shields and retires old exceptions',async()=>{
  const f=fixture();
  await f.screen.configureBedtimeBlocking({bedtime:'22:00',wakeTime:'06:00',mode:'custom',now});
  assert.deepEqual([...f.shields].sort(),['A','B','C']);assert.deepEqual(f.storage.get(ledgerKey),{});
  assert.deepEqual([...f.activities],['curfy-bedtime']);
});
test('failed schedule replacement restores original selection and earned per-app deadlines',async()=>{
  const f=fixture();const start=f.native.startMonitoring;let count=0;
  f.native.startMonitoring=async(...args)=>{await start(...args);if(++count===1) throw Error('failed after replacement');};
  await assert.rejects(f.screen.configureBedtimeBlocking({bedtime:'21:00',wakeTime:'07:00',mode:'custom',draftSelectionId:'curfy-draft-custom',now}),/failed after replacement/);
  assert.deepEqual(f.selections.get(group),['A','B','C']);
  assert.deepEqual([...f.shields],['C']);
  assert.equal(f.storage.get(ledgerKey)[entry(t1).activityName].expiresAt,+now+900000);
});
test('shared native-operation guard rejects stop and configure during a Premium grant',async()=>{
  const f=fixture({active:[],blocked:['A','B','C']});let release;
  const wait=new Promise(resolve=>{release=resolve;});const start=f.native.startMonitoring;
  f.native.startMonitoring=async(...args)=>{await wait;return start(...args);};
  const request=f.grant({bedtime:'22:00',wakeTime:'06:00',mode:'custom',ticketId:t1,now});
  await Promise.resolve();await Promise.resolve();
  assert.throws(()=>f.screen.stopBedtimeBlocking(now),/still preparing/);
  await assert.rejects(f.screen.configureBedtimeBlocking({bedtime:'21:00',wakeTime:'06:00',mode:'custom',now}),/still preparing/);
  release();await request;assert.equal(f.operation.protectionOperationPending(),false);
});

test('missing per-app monitor cannot be treated as a recoverable active allowance',()=>{
  const f=fixture();f.activities.delete(entry(t1).activityName);
  assert.throws(()=>f.screen.reconcileProtectionWindow('22:00','06:00','custom',now),/reblock monitor is missing/);
  assert.ok(f.shields.has('A'));assert.ok(f.activities.has('curfy-bedtime'));
  assert.equal(f.lifecycle.premiumAccessExpiresAt(t1,+now),null);
});
test('one app exception does not authorize changing all Premium protection',()=>{
  const f=fixture({active:[t1],blocked:['B','C']});
  assert.equal(f.lifecycle.allPremiumAppsHaveActiveExceptions(group,+now),false);
});
test('all individually earned app exceptions authorize the same protected edit gate',()=>{
  const f=fixture();f.selections.set(group,['A','B']);f.shields.clear();
  assert.equal(f.lifecycle.allPremiumAppsHaveActiveExceptions(group,+now),true);
});
