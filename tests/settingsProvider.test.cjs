const assert=require('node:assert/strict');
const {test}=require('node:test');
const {readFileSync}=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const next={bedtime:'21:00',wakeTime:'08:00',blockMode:'custom',routine:'evening',userName:'New name',motivation:'New reason'};
async function fixture() {
 const disk=new Map([['@dusk/bedtime','23:00'],['@dusk/wake_time','06:00'],['@dusk/block_mode','custom'],['@dusk/username','Old name'],['@dusk/onboarding_complete','true']]);
 let failKey=null,receipt=null,api,root;const calls=[];let foreground;
 const storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>{if(k===failKey)throw Error('disk full');disk.set(k,v);},removeItem:async k=>disk.delete(k)};
 const modules=new Map();
 const native={configureBedtimeBlocking:async input=>{if(receipt!==input.settingsTransactionId){calls.push(['configure']);receipt=input.settingsTransactionId;}},
 refreshBedtimeShieldAppearance:()=>{},reconcileBedtimeException:()=>{},reconcileProtectionWindow:(...args)=>calls.push(['reconcile',...args])};
 function load(file) {
  const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const mod={exports:{}};new Function('require','module','exports','__DEV__','setInterval','clearInterval',js)(resolve,mod,mod.exports,false,()=>1,()=>{});return mod.exports;
 }
 function resolve(name) {
  if(name==='react'||name==='react/jsx-runtime')return require(name);
  if(name.includes('async-storage'))return storage;
  if(name==='expo-notifications')return {setNotificationHandler(){},cancelAllScheduledNotificationsAsync:async()=>{},getPermissionsAsync:async()=>({status:'denied'})};
  if(name==='react-native')return {Platform:{OS:'ios'},AppState:{currentState:'active',addEventListener:(_,fn)=>{foreground=fn;return {remove(){}};}}};
  if(name==='./AuthContext')return {useAuth:()=>({})};
  if(name==='./JournalContext')return {useJournal:()=>({})};
  if(name==='@/lib/screenTime')return native;
  if(name==='@/lib/premiumExceptionRecovery')return {reconcilePremiumAppExceptions(){}};
  if(name==='@/lib/premiumAppException'||name==='@/lib/premiumProtection')return {};
  if(name==='@/lib/bedtimeWindow')return {isBedtimeWindowActive:()=>false,bedtimeNightKey:()=> '2026-11-07'};
  if(name.startsWith('@/lib/')||name.startsWith('./')){
   const file=name.startsWith('@/')?name.slice(2)+'.ts':'lib/'+name.slice(2)+'.ts';
   if(!modules.has(file))modules.set(file,load(file));return modules.get(file);
  }
  throw Error(name);
 }
 async function mount(){const mod=load('context/SleepContext.tsx');function Probe(){api=mod.useSleep();return null;}
  await act(async()=>{root=create(React.createElement(mod.SleepProvider,null,React.createElement(Probe)));});}
 await mount();return {get api(){return api;},disk,calls,fail:k=>failKey=k,
 foreground:()=>foreground('active'),restart:async()=>{await act(async()=>root.unmount());await mount();},close:async()=>act(async()=>root.unmount())};
}
test('provider publishes all Settings only after journal commit',async()=>{
 const f=await fixture();await act(async()=>{await f.api.saveSettings(next,true);});
 for(const [key,value] of Object.entries(next)){assert.equal(f.api[key==='routine'?'protectionRoutine':key],value);}
 assert.equal(f.api.storageError,null);await f.close();
});
test('partial save blocks stale foreground repair and retry restores complete state',async()=>{
 const f=await fixture();f.fail('@dusk/wake_time');
 await act(async()=>{await assert.rejects(f.api.saveSettings(next,true),/disk full/);});
 assert.equal(f.api.bedtime,'23:00');assert.equal(f.api.wakeTime,'06:00');assert.ok(f.api.storageError);
 const before=f.calls.length;await act(async()=>f.foreground());assert.equal(f.calls.length,before);
 f.fail(null);await act(async()=>{await f.api.retryLoadSavedSettings();});
 assert.equal(f.api.storageError,null);assert.equal(f.api.bedtime,'21:00');assert.equal(f.api.wakeTime,'08:00');
 assert.equal(f.calls.filter(x=>x[0]==='configure').length,1);await f.close();
});
test('provider restart resolves journal before exposing partial preferences',async()=>{
 const f=await fixture();f.fail('@dusk/username');
 await act(async()=>{await assert.rejects(f.api.saveSettings(next,true));});
 await f.restart();assert.ok(f.api.storageError);assert.equal(f.api.isOnboardingComplete,false);
 f.fail(null);await act(async()=>f.api.retryLoadSavedSettings());assert.equal(f.api.userName,'New name');
 assert.equal(f.api.isOnboardingComplete,true);assert.equal(f.calls.filter(x=>x[0]==='configure').length,1);await f.close();
});
for(const [method,key,value,field,old] of [['setWakeTime','@dusk/wake_time','09:00','wakeTime','06:00'],['setBlockMode','@dusk/block_mode','social','blockMode','custom'],['setUserName','@dusk/username','Changed','userName','Old name'],['setMotivation','@dusk/motivation','Changed','motivation','']]) {
 test(method+' does not publish a failed storage write',async()=>{
  const f=await fixture();f.fail(key);await act(async()=>{await assert.rejects(f.api[method](value));});assert.equal(f.api[field],old);await f.close();
 });
}
