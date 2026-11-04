const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;

const source = readFileSync(join(__dirname, "../context/JournalContext.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

/** Exercise the actual React JournalProvider with an injectable disk API. */
async function fixture(initial = {}, options = {}) {
  const stored = new Map(Object.entries(initial));
  const stats = { writes: 0, clears: 0 };
  let failRead = !!options.failRead;
  let failWrite = false;
  let failClear = false;
  let gateWrite = null;
  const storage = {
    getItem: async key => {
      if (failRead) throw Error("native storage read unavailable");
      return stored.get(key) ?? null;
    },
    setItem: async (key, value) => {
      stats.writes++;
      if (gateWrite) await gateWrite;
      if (failWrite) throw Error("disk write unavailable");
      stored.set(key, value);
    },
    multiRemove: async keys => {
      stats.clears++;
      if (failClear) throw Error("disk removal unavailable");
      keys.forEach(key => stored.delete(key));
    },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    name => name === "@react-native-async-storage/async-storage"
      ? { __esModule: true, default: storage }
      : require(name),
    mod, mod.exports
  );
  const { JournalProvider, useJournal } = mod.exports;
  let api;
  function Probe() { api = useJournal(); return null; }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(JournalProvider, null, React.createElement(Probe)));
  });
  return {
    get api() { return api; },
    stored, stats,
    failReads: value => { failRead = value; },
    failWrites: value => { failWrite = value; },
    failClears: value => { failClear = value; },
    pauseWrites: until => { gateWrite = until; },
    unmount: async () => { await act(async () => { renderer.unmount(); }); },
  };
}

test("journal persists before acknowledging a write, retaining old entries on disk failure", async () => {
  const f = await fixture();
  assert.equal(f.api.loadError, null);
  const first = await f.api.addEntry("2026-11-04", "Keep this private");
  assert.equal(f.api.entries[0].id, first.id);
  assert.equal(JSON.parse(f.stored.get("@dusk/journal_entries"))[0].text, "Keep this private");
  f.failWrites(true);
  await assert.rejects(f.api.addEntry("2026-11-04", "Should not appear"),
    /disk write unavailable/);
  assert.equal(f.api.entries.length, 1);
  assert.equal(JSON.parse(f.stored.get("@dusk/journal_entries")).length, 1);
  f.failWrites(false);
  await f.api.addEntry("2026-11-04", "A real second entry");
  assert.equal(JSON.parse(f.stored.get("@dusk/journal_entries")).length, 2);
  await f.unmount();
});

test("journal hydration failures refuse new edits and permit a non-destructive retry", async () => {
  const existing = [{
    id: "saved-1", date: "2026-11-01", text: "Important journal history",
    createdAt: 1, updatedAt: 1,
  }];
  const raw = JSON.stringify(existing);
  const f = await fixture({ "@dusk/journal_entries": raw }, { failRead: true });
  assert.match(f.api.loadError, /couldn't read your journal/);
  await assert.rejects(f.api.addEntry("2026-11-04", "Never overwrite"),
    /Journal isn't ready/);
  assert.equal(f.stored.get("@dusk/journal_entries"), raw);
  f.failReads(false);
  await act(async () => { await f.api.retryLoad(); });
  assert.equal(f.api.loadError, null);
  assert.equal(f.api.entries[0].text, "Important journal history");
  await f.unmount();
});

test("journal serializes overlapping writes without losing either entry", async () => {
  const f = await fixture();
  await Promise.all([
    f.api.addEntry("2026-11-04", "First"),
    f.api.addEntry("2026-11-04", "Second"),
  ]);
  const actual = JSON.parse(f.stored.get("@dusk/journal_entries"));
  assert.equal(actual.length, 2);
  assert.deepEqual(new Set(actual.map(x => x.text)), new Set(["First", "Second"]));
  await f.unmount();
});

test("journal deletion waits for in-flight saves and never resurrects local data", async () => {
  const f = await fixture();
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  f.pauseWrites(wait);
  const save = f.api.addEntry("2026-11-04", "Must be removed");
  const clear = f.api.clearAll();
  release();
  await Promise.all([save, clear]);
  assert.equal(f.stored.has("@dusk/journal_entries"), false);
  assert.equal(f.api.entries.length, 0);
  await f.unmount();
});

test("journal removal error is reported and does not falsely clear displayed history", async () => {
  const f = await fixture();
  await f.api.addEntry("2026-11-04", "Don't silently lose this");
  f.failClears(true);
  await assert.rejects(f.api.clearAll(), /disk removal unavailable/);
  assert.equal(f.api.entries.length, 1);
  assert.equal(JSON.parse(f.stored.get("@dusk/journal_entries")).length, 1);
  await f.unmount();
});
