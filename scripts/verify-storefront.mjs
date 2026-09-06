import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

// Read complete responses before asserting: piping curl into grep -q can fail
// with a broken pipe once a large Next.js response matches near its beginning.
function renderedHtml(body) {
  return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

const checks = [
  {
    name: "Storefront home", path: "/",
    validate(body) {
      assert.match(renderedHtml(body), /<main\b/);
      assert.match(renderedHtml(body), /Direct Loop/i);
    }
  },
  {
    name: "Public products API", path: "/api-proxy/public/products",
    validate(body) { assert.ok(Array.isArray(JSON.parse(body)), "Expected a product array"); }
  },
  {
    name: "Product filters API", path: "/api-proxy/public/products/filters",
    validate(body) { assert.ok(Array.isArray(JSON.parse(body).categories), "Expected a categories array"); }
  },
  {
    name: "Shopping bag page", path: "/cart",
    validate(body) {
      // A cookie-free HTTP request renders the initial cart shell. Check the
      // actual heading, not words that happen to occur in serialized i18n data.
      assert.match(renderedHtml(body), /<section\b[^>]*class="[^"]*\bcheckoutEmptyState\b[^"]*"[^>]*>\s*<h1\b[^>]*>Your bag<\/h1>/);
    }
  },
  {
    name: "Checkout sign-in page", path: "/checkout",
    validate(body) {
      const html = renderedHtml(body);
      assert.match(html, /<section\b[^>]*class="[^"]*\bcustomerLoginCard\b[^"]*"/);
      assert.match(html, /<h1\b[^>]*>Sign in before checkout<\/h1>/);
      assert.match(html, /href="\/login\?returnTo=%2Fcheckout"/);
    }
  },
  {
    name: "Malformed M-Pesa callback rejection", path: "/api/payments/mpesa/callback",
    method: "POST", body: "{}", expectedStatus: 400,
    validate() {}
  },
  {
    name: "Public affiliate page", path: "/seller/staging-affiliate",
    validate(body) {
      assert.match(renderedHtml(body), /<h1\b[^>]*>Staging Affiliate<\/h1>/);
    }
  }
];

export async function verifyStorefront({
  serviceUrl,
  fetchImpl = fetch,
  log = console.log,
  retries = 24,
  retryDelayMs = 5000,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  const base = new URL(serviceUrl);
  assert.ok(["http:", "https:"].includes(base.protocol), "Expected an HTTP(S) service URL");
  assert.ok(!base.username && !base.password, "Service URL must not contain credentials");

  for (const check of checks) {
    const expectedStatus = check.expectedStatus ?? 200;
    const label = `${check.name} (${check.path})`;
    log(`[CHECK] ${label}`);
    let response;
    let body;
    // Only retry GET transport/server errors. Never retry a payment callback.
    const attempts = check.method === "POST" ? 1 : retries + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        response = await fetchImpl(new URL(check.path, base), {
          method: check.method ?? "GET",
          redirect: "manual",
          headers: {
            "accept-language": "en",
            // Pin the supported UI locale so the server-rendered headings are
            // deterministic even if the site's default language later changes.
            cookie: "storefront-locale=en",
            ...(check.body ? { "content-type": "application/json" } : {})
          },
          body: check.body,
          signal: AbortSignal.timeout(30000)
        });
        body = await response.text();
        if ((response.status >= 500 || response.status === 429) && attempt < attempts) {
          log(`[RETRY] ${label}: HTTP ${response.status}, attempt ${attempt}/${attempts}`);
          await delay(retryDelayMs);
          continue;
        }
        break;
      } catch (error) {
        if (attempt === attempts) {
          throw new Error(`[FAIL] ${label}: request failed (${error.message})`);
        }
        log(`[RETRY] ${label}: request failed, attempt ${attempt}/${attempts}`);
        await delay(retryDelayMs);
      }
    }
    if (response.status !== expectedStatus) {
      throw new Error(`[FAIL] ${label}: expected HTTP ${expectedStatus}, received HTTP ${response.status}`);
    }
    try {
      check.validate(body);
    } catch {
      // Avoid dumping a page/API response into public CI logs.
      throw new Error(`[FAIL] ${label}: HTTP ${response.status}, response did not match the expected page/API contract`);
    }
    log(`[PASS] ${label}: HTTP ${response.status}`);
  }
  log("[PASS] All 7 Storefront smoke checks passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyStorefront({ serviceUrl: process.env.SERVICE_URL });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
