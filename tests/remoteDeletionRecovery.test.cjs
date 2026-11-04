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
  restoreError = false,
} = {}) {
  const storage = new Map(receipt ? [[KEY, receipt]] : []);
  const stats = { invokes: 0, signOuts: 0, signIns: 0, writes: 0, removes: 0 };
  let signOutFails = failSignOut;
  let signOutReportsError = signOutReturnsError;
  let remoteFails = failRemote;
  let diskReadsFail = failRead;
  let currentSession = initialSession ? { user: { id: "test-user-id" } } : null;
  const listeners = new Set();

  const supabase = {
    auth: {
      getSession: async () => ({
        data: { session: restoreError ? null : currentSession },
        error: restoreError ? Error("Auth session could not be restored") : null,
      }),
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
      upsert: async () => ({ error: null }),
    }),
  };
  const asyncStorage = {
    getItem: async key => {
      if (diskReadsFail) throw Error("AsyncStorage unavailable");
      return storage.get(key) ?? null;
    },
    setItem: async (key, value) => { stats.writes++; storage.set(key, value); },
    removeItem: async key => { stats.removes++; storage.delete(key); },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    name => {
      if (name === "@/lib/supabase") {
        return { isSupabaseConfigured: true, supabase };
      }
      if (name === "@react-native-async-storage/async-storage") {
        return { __esModule: true, default: asyncStorage };
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
