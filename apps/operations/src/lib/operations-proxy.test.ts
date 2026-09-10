import assert from "node:assert/strict";
import { test } from "node:test";
import { operationsProxyTarget } from "./operations-proxy";

test("proxy targets retain the configured API origin/base path and encode ordinary path segments", () => {
  assert.equal(
    operationsProxyTarget("https://api.example/internal", "https://operations.example/api-proxy/products?view=active&limit=10", ["products", "item name"]),
    "https://api.example/internal/products/item%20name?view=active&limit=10"
  );
  assert.equal(
    operationsProxyTarget("http://localhost:4000/", "https://operations.example/api-proxy/products", ["products", "item?other=value#anchor"]),
    "http://localhost:4000/products/item%3Fother%3Dvalue%23anchor"
  );
});

test("proxy targets reject absolute, protocol-relative and traversal paths including encoded variants", () => {
  for (const path of [
    ["https:", "attacker.example"],
    ["https://attacker.example"],
    ["//attacker.example"],
    ["", "attacker.example"],
    ["\\\\attacker.example"],
    ["..", "private"],
    ["products", ".", "private"],
    ["products", "../private"],
    ["%2f%2fattacker.example"],
    ["%252f%252fattacker.example"],
    ["%2e%2e", "private"],
    ["%252e%252e", "private"],
    ["%5c%5cattacker.example"],
    ["https%3a", "attacker.example"],
    ["\nhttps:", "attacker.example"]
  ]) {
    assert.equal(operationsProxyTarget("https://api.example/internal/", "https://operations.example/api-proxy/anything", path), null, JSON.stringify(path));
  }
});

test("proxy forwards session headers and upload bytes only to its configured API, strips Host and does not follow redirects", async (t) => {
  const previousApiUrl = process.env.API_URL;
  process.env.API_URL = "https://api.example/internal";
  const { GET, POST } = await import("../app/api-proxy/[...path]/route");
  t.after(() => {
    if (previousApiUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = previousApiUrl;
  });
  const requests: { input: RequestInfo | URL; options?: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, options?: RequestInit) => {
    requests.push({ input, options });
    return new Response(null, { status: 307, headers: { Location: "https://external.example/target", "Set-Cookie": "test=value; HttpOnly" } });
  });
  const uploadBytes = new Uint8Array([137, 80, 78, 71]);
  const response = await POST(new Request("https://operations.example/api-proxy/products/p1/images/upload?view=batch", {
    method: "POST",
    headers: { Authorization: "Bearer employee-session", Cookie: "existing=value", Host: "attacker.example", "Content-Type": "image/png" },
    body: uploadBytes
  }), { params: Promise.resolve({ path: ["products", "p1", "images", "upload"] }) });
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0].input), "https://api.example/internal/products/p1/images/upload?view=batch");
  const sent = new Request(requests[0].input, requests[0].options);
  assert.equal(sent.headers.get("Authorization"), "Bearer employee-session");
  assert.equal(sent.headers.get("Cookie"), "existing=value");
  assert.equal(sent.headers.has("Host"), false);
  assert.equal(sent.redirect, "manual");
  assert.deepEqual(new Uint8Array(await sent.arrayBuffer()), uploadBytes);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("Set-Cookie"), "test=value; HttpOnly");

  const blocked = await GET(new Request("https://operations.example/api-proxy/%2f%2fattacker.example", {
    headers: { Authorization: "Bearer employee-session" }
  }), { params: Promise.resolve({ path: ["//attacker.example"] }) });
  assert.equal(blocked.status, 400);
  assert.equal(requests.length, 1);
});
