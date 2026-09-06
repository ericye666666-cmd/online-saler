import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { verifyStorefront } from "./verify-storefront.mjs";

const responses = {
  "/": [200, '<main><a aria-label="Direct Loop home">Direct Loop</a></main>'],
  "/api-proxy/public/products": [200, "[]"],
  "/api-proxy/public/products/filters": [200, '{"categories":[]}'],
  "/cart": [200, '<main><section class="checkoutEmptyState"><h1>Your bag</h1><p>Loading…</p></section></main>'],
  "/checkout": [200, '<main><section class="customerLoginCard"><h1>Sign in before checkout</h1><a href="/login?returnTo=%2Fcheckout">Continue with Google</a></section></main>'],
  "/api/payments/mpesa/callback": [400, '{"error":"Invalid callback payload"}'],
  "/seller/staging-affiliate": [200, '<main><h1 class="text-4xl">Staging Affiliate</h1></main>']
};

async function serverFixture(t, overrides = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, method: req.method, headers: req.headers, body });
    const configured = overrides[req.url] ?? responses[req.url] ?? [404, "Not found"];
    const [status, responseBody] = typeof configured === "function" ? configured(requests) : configured;
    res.writeHead(status);
    res.end(responseBody);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const logs = [];
  return {
    requests,
    logs,
    run: (options = {}) => verifyStorefront({
      serviceUrl: `http://127.0.0.1:${server.address().port}`,
      retries: 0,
      log: (message) => logs.push(message),
      ...options
    })
  };
}

test("checks all seven deployed surfaces with current bag and anonymous checkout HTML", async (t) => {
  const fixture = await serverFixture(t, {
    // Exercise a large Next.js response; the entire body is consumed instead
    // of closing a curl pipe as soon as a marker appears near the beginning.
    "/": [200, `${responses["/"][1]}<script>${"x".repeat(300000)}</script>`]
  });
  await fixture.run();
  assert.deepEqual(fixture.requests.map((request) => request.path), Object.keys(responses));
  const callback = fixture.requests.find((request) => request.method === "POST");
  assert.equal(callback.path, "/api/payments/mpesa/callback");
  assert.equal(callback.body, "{}");
  assert.ok(fixture.requests.every((request) => request.headers.cookie === "storefront-locale=en"));
  assert.equal(fixture.logs.filter((line) => /\[PASS\].*HTTP/.test(line)).length, 7);
});

test("fails by route name when matching words occur only in serialized scripts", async (t) => {
  const fixture = await serverFixture(t, {
    "/cart": [200, `<main>Error</main><script>${responses["/cart"][1]}</script>`]
  });
  await assert.rejects(fixture.run(), /\[FAIL\] Shopping bag page \(\/cart\): HTTP 200, response did not match/);
  assert.equal(fixture.requests.length, 4);
});

test("reports a broken API payload even when it starts with the old expected character", async (t) => {
  const fixture = await serverFixture(t, { "/api-proxy/public/products": [200, "[broken json"] });
  await assert.rejects(fixture.run(), /Public products API .*response did not match/);
});

test("rejects a filters error containing the categories word", async (t) => {
  const fixture = await serverFixture(t, {
    "/api-proxy/public/products/filters": [200, '{"error":"categories","categories":null}']
  });
  await assert.rejects(fixture.run(), /Product filters API .*response did not match/);
});

test("fails when checkout returns a generic page instead of the login gate", async (t) => {
  const fixture = await serverFixture(t, { "/checkout": [200, '<main><h1>Checkout</h1></main>'] });
  await assert.rejects(fixture.run(), /Checkout sign-in page .*response did not match/);
});

test("retries a cold-start GET and logs the path and status", async (t) => {
  const fixture = await serverFixture(t, {
    "/": (requests) => requests.length === 1 ? [503, "Starting"] : responses["/"]
  });
  await fixture.run({ retries: 1, retryDelayMs: 0 });
  assert.match(fixture.logs.find((line) => line.startsWith("[RETRY]")), /Storefront home \(\/\): HTTP 503/);
  assert.equal(fixture.requests.filter((request) => request.path === "/").length, 2);
});

test("does not turn redirects or HTTP errors into successful page checks", async (t) => {
  const fixture = await serverFixture(t, { "/cart": [302, responses["/cart"][1]] });
  await assert.rejects(fixture.run(), /Shopping bag page .*expected HTTP 200, received HTTP 302/);
});

test("still requires the malformed callback to return HTTP 400 and never retries POST", async (t) => {
  const fixture = await serverFixture(t, { "/api/payments/mpesa/callback": [500, "Error"] });
  await assert.rejects(fixture.run({ retries: 2, retryDelayMs: 0 }), /Malformed M-Pesa callback rejection .*expected HTTP 400, received HTTP 500/);
  assert.equal(fixture.requests.filter((request) => request.method === "POST").length, 1);
});

test("keeps the public affiliate fixture check and names its failure", async (t) => {
  const fixture = await serverFixture(t, { "/seller/staging-affiliate": [404, "Missing affiliate"] });
  await assert.rejects(fixture.run(), /Public affiliate page .*expected HTTP 200, received HTTP 404/);
});
