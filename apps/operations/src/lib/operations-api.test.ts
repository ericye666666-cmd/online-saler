import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  LEGACY_SESSION_ADMIN_USER_KEY,
  OPERATIONS_SESSION_CHANGED_EVENT,
  OPERATIONS_SESSION_EXPIRED_EVENT,
  SESSION_ACCESS_TOKEN_KEY,
  applyToCurrentOperationsSession,
  operationsFetch
} from "./operations-api";

function sessionToken(adminUserId: string, renewal = 1): string {
  return `${Buffer.from(JSON.stringify({ v: 1, sub: adminUserId, exp: 2_000_000_000 + renewal })).toString("base64url")}.test-signature-${renewal}`;
}

function browserFixture(t: TestContext, respond: () => Response | Promise<Response> = () => new Response("{}")) {
  const storage = new Map<string, string>([
    [SESSION_ACCESS_TOKEN_KEY, "signed-current-session"],
    [LEGACY_SESSION_ADMIN_USER_KEY, "legacy-admin-id"]
  ]);
  const events = new EventTarget();
  const browser = {
    location: { origin: "https://operations.example" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => { storage.delete(key); }
    },
    dispatchEvent: (event: Event) => events.dispatchEvent(event)
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: browser, configurable: true });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const requests: { input: RequestInfo | URL; options?: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, options?: RequestInit) => {
    requests.push({ input, options });
    return respond();
  });
  return { storage, events, requests };
}

test("JSON requests preserve their payload and headers while using the current signed session", async (t) => {
  const { requests } = browserFixture(t);
  const headers = new Headers({ "Content-Type": "application/json", "X-Request-Id": "batch-10", Authorization: "Bearer stale-render-session" });
  const body = JSON.stringify({ targetCount: 10 });
  await operationsFetch("/api-proxy/operations/product-batches?view=current", {
    method: "POST", headers, body, redirect: "follow"
  });

  assert.equal(requests.length, 1);
  assert.equal(String(requests[0].input), "https://operations.example/api-proxy/operations/product-batches?view=current");
  const sent = new Request(requests[0].input, requests[0].options);
  assert.equal(sent.headers.get("Authorization"), "Bearer signed-current-session");
  assert.equal(sent.headers.get("Content-Type"), "application/json");
  assert.equal(sent.headers.get("X-Request-Id"), "batch-10");
  assert.equal(await sent.text(), body);
  assert.equal(sent.redirect, "error");
  assert.equal(sent.cache, "no-store");
  assert.equal(headers.get("Authorization"), "Bearer stale-render-session");
});

test("multipart uploads keep browser-generated boundaries and raw image uploads retain their bytes", async (t) => {
  const { requests } = browserFixture(t);
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const file = new Blob([bytes], { type: "image/png" });
  const form = new FormData();
  form.append("file", file, "shoe.png");
  await operationsFetch("/api-proxy/products/shoe/images/upload", { method: "POST", body: form });
  assert.equal(requests[0].options?.body, form);
  assert.equal(new Headers(requests[0].options?.headers).has("Content-Type"), false);
  const multipart = new Request(requests[0].input, requests[0].options);
  assert.match(multipart.headers.get("Content-Type") ?? "", /^multipart\/form-data; boundary=/);
  assert.equal(multipart.headers.get("Authorization"), "Bearer signed-current-session");
  const uploadedFile = (await multipart.formData()).get("file") as File;
  assert.deepEqual(new Uint8Array(await uploadedFile.arrayBuffer()), bytes);

  await operationsFetch("/api-proxy/products/shoe/images/upload", {
    method: "POST", body: file, headers: { "Content-Type": "image/png", "X-Image-Type": "SIZE_LABEL" }
  });
  const raw = new Request(requests[1].input, requests[1].options);
  assert.equal(raw.headers.get("Content-Type"), "image/png");
  assert.equal(raw.headers.get("X-Image-Type"), "SIZE_LABEL");
  assert.equal(raw.headers.get("Authorization"), "Bearer signed-current-session");
  assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), bytes);
});

test("polls read a new session token on every request", async (t) => {
  const { storage, requests } = browserFixture(t);
  await operationsFetch(new URL("https://operations.example/api-proxy/ai-jobs/job-1"));
  storage.set(SESSION_ACCESS_TOKEN_KEY, "signed-new-session");
  await operationsFetch("/api-proxy/ai-jobs/job-1");
  assert.equal(new Headers(requests[0].options?.headers).get("Authorization"), "Bearer signed-current-session");
  assert.equal(new Headers(requests[1].options?.headers).get("Authorization"), "Bearer signed-new-session");
});

test("401 clears the rejected session and requests the existing login UX without consuming the response", async (t) => {
  const { storage, events } = browserFixture(t, () => new Response('{"message":"Session expired"}', { status: 401 }));
  let expired = 0;
  events.addEventListener(OPERATIONS_SESSION_EXPIRED_EVENT, () => { expired += 1; });
  const response = await operationsFetch("/api-proxy/operations/warehouse-locations");
  assert.equal(storage.has(SESSION_ACCESS_TOKEN_KEY), false);
  assert.equal(storage.has(LEGACY_SESSION_ADMIN_USER_KEY), false);
  assert.equal(expired, 1);
  assert.deepEqual(await response.json(), { message: "Session expired" });
});

test("an old 401 cannot clear a session established while the request was in flight", async (t) => {
  const { storage, events } = browserFixture(t, () => {
    storage.set(SESSION_ACCESS_TOKEN_KEY, "signed-replacement-session");
    return new Response("{}", { status: 401 });
  });
  let expired = 0;
  events.addEventListener(OPERATIONS_SESSION_EXPIRED_EVENT, () => { expired += 1; });
  await operationsFetch("/api-proxy/operations/product-batches");
  assert.equal(storage.get(SESSION_ACCESS_TOKEN_KEY), "signed-replacement-session");
  assert.equal(expired, 0);
});

test("permission denial does not sign out an authenticated employee", async (t) => {
  const { storage, events } = browserFixture(t, () => new Response("{}", { status: 403 }));
  let expired = 0;
  events.addEventListener(OPERATIONS_SESSION_EXPIRED_EVENT, () => { expired += 1; });
  assert.equal((await operationsFetch("/api-proxy/operations/access/accounts")).status, 403);
  assert.equal(storage.get(SESSION_ACCESS_TOKEN_KEY), "signed-current-session");
  assert.equal(expired, 0);
});

test("missing sessions do not reuse a stale caller-supplied authorization header", async (t) => {
  const { storage, requests } = browserFixture(t);
  storage.delete(SESSION_ACCESS_TOKEN_KEY);
  await operationsFetch("/api-proxy/operations/analytics", { headers: { Authorization: "Bearer stale-session" } });
  assert.equal(new Headers(requests[0].options?.headers).has("Authorization"), false);
});

test("credentials cannot be sent to external images, printer agents or non-proxy paths", async (t) => {
  const { requests } = browserFixture(t);
  for (const url of [
    "https://images.example/api-proxy/products/photo.png",
    "//other.example/api-proxy/products",
    "http://127.0.0.1:8719/print/label",
    "https://operations.example/images/photo.png",
    "/api-proxy-untrusted/products",
    "/api-proxy/../images/photo.png"
  ]) {
    await assert.rejects(operationsFetch(url, { headers: { Authorization: "Bearer signed-current-session" } }), /Operations API proxy/);
  }
  assert.equal(requests.length, 0);
});

test("a cross-tab account switch stops an existing batch before the next item can use the new employee's token", async (t) => {
  const aliceToken = sessionToken("admin-alice");
  const bobToken = sessionToken("admin-bob");
  const { storage, requests, events } = browserFixture(t, () => {
    // A different tab signs in while Alice's first upload is in flight.
    storage.set(SESSION_ACCESS_TOKEN_KEY, bobToken);
    return new Response("{}");
  });
  storage.set(SESSION_ACCESS_TOKEN_KEY, aliceToken);
  let changed = 0;
  events.addEventListener(OPERATIONS_SESSION_CHANGED_EVENT, () => { changed += 1; });
  const oldBatch = async () => {
    for (let item = 1; item <= 10; item += 1) {
      await operationsFetch(`/api-proxy/products/item-${item}/images/upload`, {
        method: "POST",
        headers: { "Content-Type": "image/png", "X-Admin-User-Id": "admin-alice" },
        body: new Blob([`image-${item}`], { type: "image/png" })
      });
    }
  };

  await assert.rejects(oldBatch(), /employee account has changed/);
  assert.equal(requests.length, 1);
  assert.equal(new Headers(requests[0].options?.headers).get("Authorization"), `Bearer ${aliceToken}`);
  assert.equal(changed, 1);
  assert.equal(storage.get(SESSION_ACCESS_TOKEN_KEY), bobToken);
});

test("stale actor IDs in query, JSON and multipart and captured bearer tokens all block an account switch", async (t) => {
  const { storage, requests } = browserFixture(t);
  storage.set(SESSION_ACCESS_TOKEN_KEY, sessionToken("admin-bob"));
  const multipart = new FormData();
  multipart.append("adminUserId", "admin-alice");
  const calls: [string, RequestInit?][] = [
    ["/api-proxy/operations/product-batches?adminUserId=admin-alice"],
    ["/api-proxy/operations/product-batches", { method: "POST", body: JSON.stringify({ adminUserId: "admin-alice", targetCount: 10 }) }],
    ["/api-proxy/operations/access/accounts?requesterAdminUserId=admin-alice"],
    ["/api-proxy/operations/access/accounts", { method: "POST", body: JSON.stringify({ requesterAdminUserId: "admin-alice", name: "New employee" }) }],
    ["/api-proxy/products/item-1/images/upload", { method: "POST", body: multipart }],
    ["/api-proxy/operations/orders", { headers: { Authorization: `Bearer ${sessionToken("admin-alice")}` } }]
  ];
  for (const [url, options] of calls) await assert.rejects(operationsFetch(url, options), /employee account has changed/);
  assert.equal(requests.length, 0);
});

test("the same employee can renew a token without aborting their existing batch", async (t) => {
  const firstToken = sessionToken("admin-alice", 1);
  const renewedToken = sessionToken("admin-alice", 2);
  const { storage, requests, events } = browserFixture(t);
  storage.set(SESSION_ACCESS_TOKEN_KEY, firstToken);
  let changed = 0;
  events.addEventListener(OPERATIONS_SESSION_CHANGED_EVENT, () => { changed += 1; });
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${firstToken}` },
    body: JSON.stringify({ adminUserId: "admin-alice" })
  };
  await operationsFetch("/api-proxy/operations/product-batches/batch-1/prepare-storage", options);
  storage.set(SESSION_ACCESS_TOKEN_KEY, renewedToken);
  await operationsFetch("/api-proxy/operations/product-batches/batch-1/prepare-storage", options);
  assert.equal(requests.length, 2);
  assert.equal(new Headers(requests[1].options?.headers).get("Authorization"), `Bearer ${renewedToken}`);
  assert.equal(changed, 0);
});

test("late refresh success or failure cannot overwrite or delete a changed session, including same-user renewal", async (t) => {
  const { storage } = browserFixture(t);
  const aliceToken = sessionToken("admin-alice", 1);
  for (const scenario of [
    { outcome: "success", replacement: sessionToken("admin-bob") },
    { outcome: "failure", replacement: sessionToken("admin-bob") },
    { outcome: "success", replacement: sessionToken("admin-alice", 2) },
    { outcome: "failure", replacement: sessionToken("admin-alice", 2) }
  ]) {
    storage.set(SESSION_ACCESS_TOKEN_KEY, aliceToken);
    let succeed!: () => void;
    let fail!: (reason: Error) => void;
    const pendingResponse = new Promise<void>((resolve, reject) => { succeed = resolve; fail = reject; });
    let refreshMutations = 0;
    const refresh = pendingResponse.then(
      () => applyToCurrentOperationsSession(aliceToken, () => {
        refreshMutations += 1;
        storage.set(SESSION_ACCESS_TOKEN_KEY, aliceToken);
      }),
      () => applyToCurrentOperationsSession(aliceToken, () => {
        refreshMutations += 1;
        storage.delete(SESSION_ACCESS_TOKEN_KEY);
      })
    );
    // Cross-tab sign-in / renewal finishes before the old request settles.
    storage.set(SESSION_ACCESS_TOKEN_KEY, scenario.replacement);
    if (scenario.outcome === "success") succeed();
    else fail(new Error("Old session expired"));
    await refresh;
    assert.equal(refreshMutations, 0, scenario.outcome);
    assert.equal(storage.get(SESSION_ACCESS_TOKEN_KEY), scenario.replacement);
  }

  storage.set(SESSION_ACCESS_TOKEN_KEY, aliceToken);
  let currentRefreshApplied = false;
  applyToCurrentOperationsSession(aliceToken, () => { currentRefreshApplied = true; });
  assert.equal(currentRefreshApplied, true);
});
