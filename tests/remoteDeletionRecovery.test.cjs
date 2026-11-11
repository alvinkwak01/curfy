const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;

const source = readFileSync(join(__dirname, "../context/AuthContext.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const KEY = "@curfy/remote_deletion_confirmed_user";

async function fixture({
  receipt = null, initialSession = true, failSignOut = false,
  signOutReturnsError = false, failRemote = false, failRead = false,
  restoreError = false, consent = null, waitForSignIn = null, failConsentWrite = false,
  persistedStorage = null, failConsentValue = null, ignoreReceiptWrite = false, waitForSession = null, failReceiptRemove = false, serverDeleted = false, loseCommitResponse = false,
} = {}) {
  const storage = persistedStorage ?? new Map(receipt ? [[KEY, receipt]] : []);
  if (consent) storage.set("@curfy/leaderboard_consent_v1", consent);
  const stats = { profileWrites: 0, invokes: 0, signOuts: 0, signIns: 0, writes: 0, removes: 0 };
  let signOutFails = failSignOut;
  let signOutReportsError = signOutReturnsError;
  let remoteFails = failRemote;
  let diskReadsFail = failRead;
  let currentSession = initialSession ? { user: { id: "test-user-id" } } : null;
  const listeners = new Set();

  const supabase = {
    auth: {
      getSession: async () => { if (waitForSession) await waitForSession; return {
        data: { session: restoreError ? null : currentSession },
        error: restoreError ? Error("Auth session could not be restored") : null,
      }; },
      onAuthStateChange: callback => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      signOut: async () => {
        stats.signOuts++;
        if (signOutFails) throw Error("native Supabase signout storage failed");
        if (signOutReportsError) return { error: Error("local auth state refused signout") };
        currentSession = null;
        listeners.forEach(listener => listener("SIGNED_OUT", null));
        return { error: null };
      },
      signInAnonymously: async () => {
        stats.signIns++;
        if (waitForSignIn) await waitForSignIn;
        currentSession = { user: { id: "accidentally-new-account" } };
        return { data: { session: currentSession }, error: null };
      },
    },
    functions: {
      invoke: async (_name, opts) => {
        stats.invokes++;
        assert.equal(opts.method, "POST");
        return remoteFails
          ? { data: null, error: Error("server unavailable") }
          : { data: { success: true }, error: null };
      },
    },
    from: () => ({
      upsert: async () => { stats.profileWrites++; return { error: null }; },
    }),
  };
  const asyncStorage = {
    getItem: async key => {
      if (diskReadsFail) throw Error("AsyncStorage unavailable");
      return storage.get(key) ?? null;
    },
    setItem: async (key, value) => { if (ignoreReceiptWrite && key === KEY) return; if ((failConsentWrite || value === failConsentValue) && key === "@curfy/leaderboard_consent_v1") throw Error("consent storage failed"); stats.writes++; storage.set(key, value); },
    removeItem: async key => { if (failReceiptRemove && key === KEY) throw Error("receipt removal failed"); stats.removes++; storage.delete(key); },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    name => {
      if (name === "@/lib/supabase") {
        return { isSupabaseConfigured: true, supabase, remoteDeletionTransport: {
          prepare: async () => {
            if (remoteFails) { stats.invokes++; throw Error("server unavailable"); }
            return { userId: currentSession.user.id, requestId: "r", proof: "p" };
          },
          status: async () => serverDeleted ? "deleted" : "pending",
          commit: async () => {
            const {error} = await supabase.functions.invoke("delete-account-recovery", {method:"POST"});
            if (error) throw error;
            serverDeleted = true;
            if (loseCommitResponse) throw Error("response lost");
            return "deleted";
          },
        } };
      }
      if (name === "@react-native-async-storage/async-storage") {
        return { __esModule: true, default: asyncStorage };
      }
      if (name === "@/lib/remoteDeletionTransaction") {
        const tx = {exports:{}};
        new Function("module","exports",ts.transpileModule(readFileSync(join(__dirname,"../lib/remoteDeletionTransaction.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(tx,tx.exports);
        return tx.exports;
      }
      return require(name);
    },
    mod, mod.exports,
  );
  let api;
  function Probe() { api = mod.exports.useAuth(); return null; }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(mod.exports.AuthProvider, null, React.createElement(Probe)));
  });
  return {
    get api() { return api; },
    storage, stats,
    allowConsentWrites: () => { failConsentWrite = false; failConsentValue = null; },
    allowSignOut: () => { signOutFails = false; signOutReportsError = false; },
    allowRemote: () => { remoteFails = false; },
    allowReads: () => { diskReadsFail = false; },
    unmount: async () => { await act(async () => { renderer.unmount(); }); },
  };
}

test("after confirmed remote deletion, a failed local signout is retryable without re-deleting", async () => {
  const f = await fixture({ failSignOut: true });
  assert.equal(f.api.isAuthLoading, false);
  await act(async () => {
    await assert.rejects(f.api.deleteRemoteAccount(), /signout storage failed/);
  });
  assert.equal(f.stats.invokes, 1);
  assert.equal(f.storage.get(KEY), "test-user-id");
  assert.equal(f.api.isDeletingAccount, true);
  await act(async () => { await f.api.ensureAnonymousProfile("Must not rejoin"); });
  assert.equal(f.stats.signIns, 0);

  f.allowSignOut();
  await act(async () => { await f.api.deleteRemoteAccount(); });
  assert.equal(f.stats.invokes, 1, "never invoke deleted account's server endpoint twice");
  assert.equal(f.stats.signOuts, 2);
  assert.equal(f.api.isDeletingAccount, true, "keep suppressing cloud signup until local wipe ends");

  await act(async () => { await f.api.finishAccountDeletion(); });
  assert.equal(f.storage.has(KEY), false);
  assert.equal(f.api.isDeletingAccount, false);
  await f.unmount();
});

test("Supabase-returned signout errors are rejected, not mistaken for deletion success", async () => {
  const f = await fixture({ signOutReturnsError: true });
  await act(async () => {
    await assert.rejects(f.api.deleteRemoteAccount(), /couldn't clear its local cloud session/);
  });
  assert.equal(f.stats.invokes, 1);
  assert.equal(f.storage.get(KEY), "test-user-id");
  assert.equal(f.api.isDeletingAccount, true);
  f.allowSignOut();
  await act(async () => { await f.api.deleteRemoteAccount(); });
  assert.equal(f.stats.invokes, 1);
  await f.unmount();
});

test("reboot with a confirmed deletion receipt does not create another cloud identity", async () => {
  const f = await fixture({ receipt: "test-user-id", initialSession: false });
  assert.equal(f.api.isAuthLoading, false);
  assert.equal(f.api.isDeletingAccount, true);
  await act(async () => { await f.api.ensureAnonymousProfile("Not a new account"); });
  assert.equal(f.stats.signIns, 0);
  await act(async () => { await f.api.deleteRemoteAccount(); });
  assert.equal(f.stats.invokes, 0);
  assert.equal(f.stats.signOuts, 1);
  await f.unmount();
});

test("verified deletion receipt survives auth restoration failure after server removed user", async () => {
  // A deleted account often has an unusable access token. The independently
  // persisted success receipt must let the device finish clearing its data.
  const f = await fixture({
    receipt: "test-user-id", initialSession: false, restoreError: true,
  });
  assert.equal(f.api.isDeletingAccount, true);
  await act(async () => { await f.api.deleteRemoteAccount(); });
  assert.equal(f.stats.invokes, 0);
  assert.equal(f.stats.signOuts, 1);
  assert.equal(f.storage.get(KEY), "test-user-id");
  await f.unmount();
});

test("an unconfirmed server deletion does not write a false receipt or suppress normal retries", async () => {
  const f = await fixture({ failRemote: true });
  await act(async () => {
    await assert.rejects(f.api.deleteRemoteAccount(), /couldn't delete your online account/);
  });
  assert.equal(f.storage.has(KEY), false);
  assert.equal(f.api.isDeletingAccount, false);
  assert.equal(f.stats.signOuts, 0);
  f.allowRemote();
  await act(async () => { await f.api.deleteRemoteAccount(); });
  assert.equal(f.stats.invokes, 2);
  assert.equal(f.storage.get(KEY), "test-user-id");
  await f.unmount();
});

test("unreadable authentication/deletion state cannot silently bypass remote deletion", async () => {
  const f = await fixture({ failRead: true });
  assert.equal(f.api.isAuthLoading, false);
  assert.equal(f.api.isDeletingAccount, true);
  await act(async () => {
    await assert.rejects(f.api.deleteRemoteAccount(), /couldn't verify your online account/);
  });
  assert.equal(f.stats.invokes, 0);
  assert.equal(f.stats.signOuts, 0);
  await f.unmount();
});

test("a resolved Supabase session error also forbids an unconfirmed remote wipe", async () => {
  const f = await fixture({ restoreError: true });
  assert.equal(f.api.isAuthLoading, false);
  assert.equal(f.api.isDeletingAccount, true);
  await act(async () => {
    await assert.rejects(f.api.deleteRemoteAccount(), /couldn't verify your online account/);
  });
  assert.equal(f.stats.invokes, 0);
  await f.unmount();
});

test("finish receipt removal occurs only in the completed local deletion workflow", () => {
  const sleep = readFileSync(join(__dirname, "../context/SleepContext.tsx"), "utf8");
  const root = readFileSync(join(__dirname, "../app/_layout.tsx"), "utf8");
  const start = sleep.indexOf("  const deleteAccount = async () => {");
  const end = sleep.indexOf("  const streak = computeStreak(sleepLog);", start);
  assert.ok(start >= 0 && end > start);
  const body = sleep.slice(start, end);
  for (const before of ["await deleteRemoteAccount();", "stopBedtimeBlocking();",
    "clearCurfyOnboardingSelectionsAfterAccountDeletion();",
    "await clearJournal();", "await AsyncStorage.multiRemove(ALL_STORAGE_KEYS);"]) {
    assert.ok(body.indexOf(before) >= 0 && body.indexOf(before) < body.indexOf("await finishAccountDeletion();"));
  }
  assert.match(root, /isOnboardingComplete \|\| isAuthLoading \|\| isSignedIn \|\| isDeletingAccount/);
  assert.match(root, /!isSignedIn \|\| isDeletingAccount/);
});

test("first launch does not enroll or upload a profile without explicit consent", async () => {
  const f = await fixture({ initialSession: false });
  await act(async () => { await f.api.ensureAnonymousProfile("Private"); await f.api.syncProfile("23:00", 2, 3, "Private"); });
  assert.equal(f.stats.signIns, 0); assert.equal(f.stats.profileWrites, 0);
  await act(async () => { await f.api.setLeaderboardParticipation(true); await f.api.ensureAnonymousProfile("Public"); });
  assert.equal(f.stats.signIns, 1); assert.equal(f.stats.profileWrites, 1);
  assert.equal(f.storage.get("@curfy/leaderboard_consent_v1"), "joined"); await f.unmount();
});
test("legacy cloud sessions cannot sync until consent is recorded", async () => {
  const f = await fixture();
  await act(async () => { await f.api.syncProfile("23:00", 2, 3, "Private"); });
  assert.equal(f.stats.profileWrites, 0); await f.unmount();
});
test("failed consent persistence cannot authorize cloud enrollment", async () => {
  const f = await fixture({ initialSession: false, failConsentWrite: true });
  await act(async () => { await assert.rejects(f.api.setLeaderboardParticipation(true), /consent storage/); await f.api.ensureAnonymousProfile("Private"); });
  assert.equal(f.stats.signIns, 0); await f.unmount();
});
test("failed leave pauses uploads durably and preserves a retry until remote removal succeeds", async () => {
  const f = await fixture({ consent: "joined", failRemote: true });
  await act(async () => { await assert.rejects(f.api.setLeaderboardParticipation(false), /couldn't delete/); });
  assert.equal(f.storage.get("@curfy/leaderboard_consent_v1"), "leaving");
  await act(async () => { await f.api.syncProfile("23:00", 2, 3, "Private"); });
  assert.equal(f.stats.profileWrites, 0);
  f.allowRemote(); await act(async () => { await f.api.setLeaderboardParticipation(false); });
  assert.equal(f.api.leaderboardConsent, "declined"); assert.equal(f.api.isSignedIn, false);
  assert.equal(f.stats.invokes, 2); await f.unmount();
});
test("withdrawal waits for in-flight anonymous signup, then removes that exact newly created identity", async () => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const f = await fixture({ initialSession: false, consent: "joined", waitForSignIn: wait });
  await act(async () => {
    const signing = f.api.ensureAnonymousProfile("Private");
    await Promise.resolve();
    const leaving = f.api.setLeaderboardParticipation(false);
    release(); await signing; await leaving;
  });
  assert.equal(f.stats.signIns, 1); assert.equal(f.stats.profileWrites, 0);
  assert.equal(f.stats.invokes, 1); assert.equal(f.api.isSignedIn, false);
  assert.equal(f.api.leaderboardConsent, "declined"); await f.unmount();
});

test('failed final consent write cannot re-enroll a deleted account after restart',async()=>{
 const disk=new Map();const f=await fixture({consent:'joined',persistedStorage:disk,failConsentValue:'declined'});
 await act(async()=>{await f.api.deleteRemoteAccount();await assert.rejects(f.api.finishAccountDeletion(),/consent storage/);});
 await f.unmount();const restarted=await fixture({initialSession:false,persistedStorage:disk});
 await act(async()=>{await restarted.api.ensureAnonymousProfile('Must stay deleted');});
 assert.equal(restarted.stats.signIns,0);
 assert.equal(restarted.api.leaderboardConsent,'leaving','existing Settings must still show the retry action');
 await act(async()=>{await restarted.api.setLeaderboardParticipation(false);});
 assert.equal(restarted.api.leaderboardConsent,'declined');assert.equal(restarted.stats.invokes,0);await restarted.unmount();
});
test('failure to persist leaving keeps the server-confirmed receipt for restart',async()=>{
 const f=await fixture({consent:'joined',failConsentValue:'leaving'});
 await act(async()=>{await f.api.deleteRemoteAccount();await assert.rejects(f.api.finishAccountDeletion(),/consent storage/);});
 assert.equal(f.storage.get(KEY),'test-user-id');assert.equal(f.api.isDeletingAccount,true);
 f.allowConsentWrites();await act(async()=>f.api.finishAccountDeletion());assert.equal(f.storage.has(KEY),false);await f.unmount();
});
test('unconfirmed deletion receipt write never clears the recoverable local session',async()=>{
 const f=await fixture({consent:'joined',ignoreReceiptWrite:true});
 await act(async()=>{await assert.rejects(f.api.deleteRemoteAccount(),/confirm.*deletion receipt/);});
 assert.equal(f.stats.signOuts,0);assert.equal(f.api.isDeletingAccount,true);await f.unmount();
});
test('profile work waits until auth and deletion-receipt restoration complete',async()=>{
 let release;const wait=new Promise(resolve=>release=resolve);const f=await fixture({consent:'joined',waitForSession:wait});
 assert.equal(f.api.isAuthLoading,true);
 await act(async()=>{await f.api.ensureAnonymousProfile('Do not create another');});
 assert.equal(f.stats.signIns,0);release();await act(async()=>{await wait;});await f.unmount();
});

test('receipt removal failure leaves a restart-safe Finish leaving path',async()=>{
 const disk=new Map();const f=await fixture({consent:'joined',persistedStorage:disk,failReceiptRemove:true});
 await act(async()=>{await f.api.deleteRemoteAccount();await assert.rejects(f.api.finishAccountDeletion(),/receipt removal/);});
 assert.equal(disk.get(KEY),'test-user-id');assert.equal(f.api.leaderboardConsent,'leaving');await f.unmount();
 const restarted=await fixture({initialSession:false,persistedStorage:disk});
 await act(async()=>{await restarted.api.setLeaderboardParticipation(false);});
 assert.equal(restarted.api.leaderboardConsent,'declined');assert.equal(restarted.stats.invokes,0);await restarted.unmount();
});

test("lost commit response keeps uploads paused and restart recovers with no session", async () => {
 const f=await fixture({consent:"joined",loseCommitResponse:true});
 await act(async()=>{await assert.rejects(f.api.deleteRemoteAccount());});
 assert.equal(f.api.isDeletingAccount,true);
 assert.ok(f.storage.has("@curfy/remote_deletion_pending_v1"));
 assert.equal(f.storage.has(KEY),false);
 await act(async()=>{await f.api.ensureAnonymousProfile("No upload");});
 assert.equal(f.stats.signIns,0);
 const disk=f.storage;await f.unmount();
 const restarted=await fixture({persistedStorage:disk,initialSession:false,serverDeleted:true});
 assert.equal(restarted.api.isDeletingAccount,true);
 await act(async()=>{await restarted.api.deleteRemoteAccount();await restarted.api.finishAccountDeletion();});
 assert.equal(restarted.stats.invokes,0);
 assert.equal(restarted.api.leaderboardConsent,"declined");
 assert.equal(disk.has("@curfy/remote_deletion_pending_v1"),false);
 await restarted.unmount();
});
