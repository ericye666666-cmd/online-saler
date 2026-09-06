import assert from "node:assert/strict";
import test from "node:test";
import { databaseTarget, verifyProductionDatabase } from "./production-storefront-preflight-db.mjs";

const url = "postgresql://reader:secret-sentinel@localhost/shop?host=/cloudsql/project:region:instance&schema=public";
const env = { DATABASE_URL: url, PREFLIGHT_API_DATABASE_URL: url.replace("reader:secret-sentinel", "other:other-secret") };

test("database comparison ignores credentials but distinguishes database, schema and instance", () => {
  assert.equal(databaseTarget(url), databaseTarget(env.PREFLIGHT_API_DATABASE_URL));
  for (const changed of [url.replace("/shop?", "/other?"), url.replace("schema=public", "schema=other"), url.replace("region:instance", "region:other")]) {
    let called = false;
    assert.throws(() => verifyProductionDatabase({ env: { ...env, PREFLIGHT_API_DATABASE_URL: changed }, run: () => { called = true; } }), /database targets differ/);
    assert.equal(called, false, "different targets cannot reach even the read-only schema command");
  }
});

test("schema verification only performs a read-only diff with URL values absent from CLI arguments and logs", () => {
  const logs = [];
  verifyProductionDatabase({ env, log: (line) => logs.push(line), run: (_node, args, options) => {
    assert.deepEqual(args.slice(1, 3), ["migrate", "diff"]);
    assert.ok(args.includes("--exit-code"));
    assert.ok(args.includes("--from-schema-datasource"));
    assert.ok(args.includes("--to-schema-datamodel"));
    assert.equal(args.some((argument) => argument.includes("secret-sentinel") || argument.includes("postgresql:")), false);
    assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    assert.equal(options.env.DATABASE_URL, url);
    return { status: 0, stdout: "secret-sentinel", stderr: "other-secret" };
  } });
  assert.match(logs.join("\n"), /PASS/);
  assert.doesNotMatch(logs.join("\n"), /secret-sentinel|other-secret/);
});

test("schema drift, failed connection and timeout stop publication without leaking engine diagnostics", () => {
  for (const result of [
    { status: 2 }, { status: 1 }, { status: null, signal: "SIGTERM" },
    { status: 0, error: new Error(`could not connect ${url}`) }
  ]) {
    assert.throws(() => verifyProductionDatabase({ env, run: () => ({ ...result, stdout: url, stderr: url }) }), (error) => {
      assert.doesNotMatch(error.message, /secret-sentinel|postgresql:/);
      return /schema|verification/.test(error.message);
    });
  }
  assert.throws(() => databaseTarget("secret-sentinel"), (error) => !error.message.includes("secret-sentinel"));
});

test("ambiguous URL parameters cannot make target comparison disagree with the Prisma connection", () => {
  for (const suffix of ["&host=/cloudsql/other", "&schema=other", "&port=5433", "&options=-c%20search_path%3Dother", "&dbname=other", "#fragment"]) {
    const changed = url + suffix;
    let calls = 0;
    assert.throws(() => verifyProductionDatabase({ env: { DATABASE_URL: changed, PREFLIGHT_API_DATABASE_URL: changed }, run: () => { calls += 1; } }), (error) => {
      assert.doesNotMatch(error.message, /secret-sentinel|postgresql:/);
      return /valid PostgreSQL/.test(error.message);
    });
    assert.equal(calls, 0);
  }
});
