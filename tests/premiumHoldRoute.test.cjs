const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const revision = 'a'.repeat(64);
async function fixture({count=3, choice={index:1,revision}, preview=false}={}) {
  const calls=[];const module={exports:{}};
  const source=readFileSync('components/LockScreen.tsx','utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const rn={Platform:{OS:'ios'},StyleSheet:{create:x=>x},Alert:{alert:(...args)=>calls.push(['alert',...args])}};
  for(const name of ['View','Text','TouchableOpacity','ScrollView','StatusBar']) rn[name]=name;
  new Function('require','module','exports','__DEV__',js)(name=>{
    if(name==='react'||name==='react/jsx-runtime') return require(name);
    if(name==='react-native') return rn;
    if(name==='@expo/vector-icons') return {Ionicons:'Icon'};
    if(name==='react-native-safe-area-context') return {useSafeAreaInsets:()=>({top:0,bottom:0})};
    if(name==='expo-router') return {router:{replace:path=>calls.push(['navigate',path])},useFocusEffect:fn=>React.useEffect(fn,[fn])};
    if(name==='@/components/StarBackground') return {StarBackground:'Stars'};
    if(name==='@/components/HoldButton') return {HoldButton:'HoldButton'};
    if(name==='@/constants/theme') return {Colors:{},Fonts:{}};
    if(name==='@/context/SleepContext') return {useSleep:()=>({blockMode:'custom',unlockScreen:async ticket=>calls.push(['unlock',ticket]),devDismissLock:()=>{}})};
    if(name==='@/lib/screenTime') return {selectionIdForMode:mode=>'curfy-block-'+mode};
    if(name==='@/modules/curfy-protected-apps') return {
      CurfyAppLabel:'AppLabel',readProtectedAppChoices:()=>({count,revision}),
      prepareProtectedAppChoice:(...args)=>{calls.push(['prepare',...args]);return 'opaque-ticket';},
    };
    throw Error(name);
  },module,module.exports,false);
  let root;await act(async()=>{root=create(React.createElement(module.exports.LockScreen,{mode:preview?'preview':'escape',choice}));});
  return {root,calls,close:async()=>act(async()=>root.unmount())};
}
test('Premium app row prepares only its chosen ticket and grants nothing until hold completes',async()=>{
  const f=await fixture();assert.deepEqual(f.calls,[['prepare','curfy-block-custom',revision,1]]);
  assert.equal(f.root.root.findByType('AppLabel').props.index,1);
  await act(async()=>{await f.root.root.findByType('HoldButton').props.onUnlock();});
  assert.deepEqual(f.calls.slice(-2),[['unlock','opaque-ticket'],['navigate','/(tabs)']]);await f.close();
});
test('Free one-app hold keeps its existing single-app grant path',async()=>{
  const f=await fixture({count:1,choice:undefined});
  await act(async()=>{await f.root.root.findByType('HoldButton').props.onUnlock();});
  assert.equal(f.calls.some(c=>c[0]==='prepare'),false);
  assert.ok(f.calls.some(c=>c[0]==='unlock'&&c[1]===undefined));await f.close();
});
for(const choice of [null,{index:4,revision},{index:1,revision:'b'.repeat(64)}]) test('invalid or stale multi-app route cannot start a hold: '+JSON.stringify(choice),async()=>{
  const f=await fixture({choice});assert.equal(f.root.root.findAllByType('HoldButton').length,0);
  assert.equal(f.calls.some(c=>c[0]==='unlock'||c[0]==='prepare'),false);await f.close();
});
test('hold preview never prepares a ticket or grants app access',async()=>{
  const f=await fixture({preview:true});await act(async()=>{await f.root.root.findByType('HoldButton').props.onUnlock();});
  assert.deepEqual(f.calls.map(c=>c[0]),['alert']);await f.close();
});
