const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const moduleUnderTest={exports:{}};
new Function('module','exports',ts.transpileModule(readFileSync('lib/leaderboardRanks.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText)(moduleUnderTest,moduleUnderTest.exports);
const {leaderboardRanks}=moduleUnderTest.exports;
const rows=[10,8,8,4,4,2].map((value,index)=>({id:String(index),current_streak:value,longest_streak:20}));
test('tied ranks match server greater-than count including the top-four boundary',()=>{
  assert.deepEqual([...leaderboardRanks(rows,'current_streak').values()],[1,2,2,4,4,6]);
});
test('all-time metric and all-zero boards share first place correctly',()=>{
  assert.deepEqual([...leaderboardRanks(rows,'longest_streak').values()],[1,1,1,1,1,1]);
  assert.deepEqual([...leaderboardRanks(rows.map(row=>({...row,current_streak:0})),'current_streak').values()],[1,1,1,1,1,1]);
});
test('rank calculation does not mutate fetched profile order or values',()=>{
  const before=JSON.stringify(rows);leaderboardRanks(rows,'current_streak');assert.equal(JSON.stringify(rows),before);
  assert.equal(leaderboardRanks([],'current_streak').size,0);
});
