const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = readFileSync(
  join(__dirname, "../supabase/functions/delete-account/index.ts"), "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function endpoint({ authenticated = true, deleteFails = false, invalidateOnDelete = false } = {}) {
  const calls = { getUser: 0, delete: [], createdClients: [] };
  let handler;
  const createClient = (url, key, options) => {
    calls.createdClients.push({ url, key, hasAuth: !!options?.global?.headers?.Authorization });
    if (options?.global?.headers?.Authorization) {
      return {
        auth: {
          getUser: async () => {
            calls.getUser++;
            return authenticated
              ? { data: { user: { id: "verified-caller-id" } }, error: null }
              : { data: { user: null }, error: { message: "Invalid JWT" } };
          },
        },
      };
    }
    return {
      auth: { admin: {
        deleteUser: async id => {
          calls.delete.push(id);
          if (invalidateOnDelete && !deleteFails) authenticated = false;
          return deleteFails
            ? { error: { message: "Server declined deletion" } }
            : { error: null };
        },
      } },
    };
  };
  const Deno = {
    env: { get: key => ({
      SUPABASE_URL: "https://test.example.invalid",
      SUPABASE_ANON_KEY: "public-test",
      SUPABASE_SERVICE_ROLE_KEY: "private-server-test",
    })[key] },
    serve: callback => { handler = callback; },
  };
  const mod = { exports: {} };
  new Function("require", "Deno", "module", "exports", compiled)(
    name => {
      assert.match(name, /supabase-js/);
      return { createClient };
    }, Deno, mod, mod.exports,
  );
  assert.equal(typeof handler, "function");
  return { handler, calls };
}
function request(method, authorization, body) {
  return new Request("https://curfy.example.invalid/functions/v1/delete-account", {
    method,
    headers: authorization ? { Authorization: authorization } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("GET and other non-POST requests cannot delete an account, even when authorized", async () => {
  const f = endpoint();
  for (const method of ["GET", "HEAD", "PUT", "DELETE"]) {
    const res = await f.handler(request(method, "Bearer valid-token"));
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("Allow"), "POST");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(f.calls.createdClients.length, 0);
  assert.deepEqual(f.calls.delete, []);
});

test("deletion refuses missing, malformed and unverifiable Bearer credentials", async () => {
  const f = endpoint();
  for (const header of [undefined, "Basic abc", "Bearer", "Bearer  "]) {
    const res = await f.handler(request("POST", header));
    assert.equal(res.status, 401);
  }
  assert.deepEqual(f.calls.delete, []);
  const badUser = endpoint({ authenticated: false });
  const res = await badUser.handler(request("POST", "Bearer made-up"));
  assert.equal(res.status, 401);
  assert.equal(badUser.calls.getUser, 1);
  assert.deepEqual(badUser.calls.delete, []);
});

test("deletion only uses the server-verified caller identity, never a forged body ID", async () => {
  const f = endpoint();
  const res = await f.handler(request("POST", "Bearer valid-token", {
    user_id: "another-person", id: "someone-else",
  }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });
  assert.equal(f.calls.getUser, 1);
  assert.deepEqual(f.calls.delete, ["verified-caller-id"]);
  assert.equal(f.calls.createdClients[0].hasAuth, true);
  assert.equal(f.calls.createdClients[1].hasAuth, false);
  assert.equal(f.calls.createdClients[1].key, "private-server-test");
});

test("server rejection cannot masquerade as a successful remote deletion", async () => {
  const f = endpoint({ deleteFails: true });
  const res = await f.handler(request("POST", "Bearer valid-token"));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.ok(body.error);
  assert.equal(body.success, undefined);
  assert.deepEqual(f.calls.delete, ["verified-caller-id"]);
});

test('lost-success-response release gate: a removed caller cannot authenticate the current endpoint retry',async()=>{
 const f=endpoint({invalidateOnDelete:true});
 // The server commits deletion, but the client never receives this response.
 const lost=await f.handler(request('POST','Bearer formerly-valid-token'));
 assert.equal(lost.status,200);
 const retry=await f.handler(request('POST','Bearer formerly-valid-token'));
 assert.equal(retry.status,401);
 assert.deepEqual(f.calls.delete,['verified-caller-id']);
 // This documents an OPEN release blocker, not successful recovery. Do not
 // change 401 to success without independently authenticated deletion proof.
});
