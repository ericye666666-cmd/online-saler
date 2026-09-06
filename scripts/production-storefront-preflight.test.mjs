import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { productionRollbackSnapshot, runProductionPreflight } from "./production-storefront-preflight.mjs";

const env = {
  PREFLIGHT_PROJECT_ID: "shop-project", PREFLIGHT_REGION: "africa-south1", PREFLIGHT_IMAGE_URI: "registry/storefront-preflight:revision",
  PREFLIGHT_RUN_ID: "1234", PREFLIGHT_RUN_ATTEMPT: "1", PREFLIGHT_API_URL: "https://api.example.test",
  PREFLIGHT_PUBLIC_URL: "https://shop.example.test", PREFLIGHT_CALLBACK_URL: "https://shop.example.test/api/payments/mpesa/callback",
  PREFLIGHT_CLOUD_SQL_INSTANCE: "shop-project:africa-south1:database", PREFLIGHT_RUNTIME_SERVICE_ACCOUNT: "runtime@shop-project.iam.gserviceaccount.com"
};

function service(name, databaseSecret, entries = {}) {
  return {
    metadata: { name, namespace: "1234" },
    status: {
      url: name === "online-saler-api-staging" ? env.PREFLIGHT_API_URL : "https://production.run.app",
      latestCreatedRevisionName: `${name}-00020-abc`, latestReadyRevisionName: `${name}-00020-abc`,
      traffic: [{ revisionName: `${name}-00020-abc`, percent: 100 }]
    },
    spec: { template: {
      metadata: { annotations: { "run.googleapis.com/cloudsql-instances": env.PREFLIGHT_CLOUD_SQL_INSTANCE } },
      spec: { serviceAccountName: env.PREFLIGHT_RUNTIME_SERVICE_ACCOUNT, containers: [{ env: [
        { name: "DATABASE_URL", valueFrom: { secretKeyRef: { name: databaseSecret, key: "latest" } } },
        ...Object.entries(entries).map(([key, value]) => ({ name: key, value }))
      ] }] }
    } }
  };
}

function fixture({ drift = false, failExecution = false, failCleanup = false } = {}) {
  const calls = [];
  const logs = [];
  const command = (_gcloud, args, options) => {
    calls.push(args);
    assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    if (args[1] === "services") return JSON.stringify(args[3] === "online-saler-api-staging"
      ? service(args[3], "STAGING_DATABASE_URL")
      : service(args[3], "PRODUCTION_DATABASE_URL", {
        API_URL: drift ? "https://wrong.example.test" : env.PREFLIGHT_API_URL,
        STOREFRONT_PUBLIC_URL: env.PREFLIGHT_PUBLIC_URL, MPESA_CALLBACK_URL: env.PREFLIGHT_CALLBACK_URL
      }));
    if (args[2] === "execute" && failExecution) throw new Error("secret-sentinel postgres://private-credentials");
    if (args[2] === "delete" && failCleanup) throw new Error("secret-sentinel cleanup failed");
    return "{}";
  };
  return { calls, logs, run: () => runProductionPreflight({ env, command, log: (line) => logs.push(line) }) };
}

test("configuration drift stops before any temporary job is created", () => {
  const f = fixture({ drift: true });
  assert.throws(f.run);
  assert.equal(f.calls.some((args) => args[1] === "jobs"), false);
});

test("successful preflight uses existing bindings and deletes its isolated job without updating service traffic", () => {
  const f = fixture();
  f.run();
  const jobs = f.calls.filter((args) => args[1] === "jobs");
  assert.deepEqual(jobs.map((args) => args[2]), ["deploy", "execute", "delete"]);
  assert.ok(jobs[0].includes("DATABASE_URL=PRODUCTION_DATABASE_URL:latest,PREFLIGHT_API_DATABASE_URL=STAGING_DATABASE_URL:latest"));
  assert.ok(jobs[0].includes(env.PREFLIGHT_IMAGE_URI));
  assert.ok(jobs[0].includes("--max-retries=0"));
  assert.ok(jobs[1].includes("--wait"));
  assert.equal(f.calls.some((args) => args[1] === "services" && args[2] !== "describe"), false);
});

test("failed schema execution still cleans up and reports only a static redacted failure", () => {
  const f = fixture({ failExecution: true });
  assert.throws(f.run, (error) => {
    assert.match(error.message, /production deployment is blocked/);
    assert.doesNotMatch(error.message, /secret-sentinel|private-credentials/);
    return true;
  });
  assert.equal(f.calls.at(-1)[2], "delete");
  assert.doesNotMatch(f.logs.join("\n"), /secret-sentinel|private-credentials/);
});

test("production workflow retains manual confirmation and places the candidate schema gate before deployment", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-storefront-production.yml", import.meta.url), "utf8");
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^  (push|pull_request):/m);
  assert.match(workflow, /inputs\.confirm.*deploy-production/);
  assert.match(workflow, /MPESA_PRODUCTION_LAUNCH_MODE=\$\{\{ inputs\.mpesa_launch_mode \}\}/);
  assert.ok(workflow.indexOf("node scripts/production-storefront-preflight.mjs") < workflow.indexOf("- name: Deploy Cloud Run service"));
  assert.doesNotMatch(workflow, /continue-on-error:/);
  assert.doesNotMatch(workflow, /\| grep -[Eq]*q/);
  const dockerfile = readFileSync(new URL("../Dockerfile.storefront", import.meta.url), "utf8");
  assert.match(dockerfile, /FROM builder AS preflight\nCOPY scripts\/production-storefront-preflight-db.mjs/);
  assert.ok(dockerfile.indexOf("FROM builder AS preflight") < dockerfile.indexOf(" AS runner"));
});

test("cleanup failure blocks production even after schema verification succeeds", () => {
  const f = fixture({ failCleanup: true });
  assert.throws(f.run, (error) => /Could not remove temporary preflight job/.test(error.message) && !error.message.includes("secret-sentinel"));
  assert.equal(f.calls.at(-1)[2], "delete");
});

test("rollback logging includes only validated image, revision and traffic fields", () => {
  const current = service("online-saler-storefront-production", "PRODUCTION_DATABASE_URL");
  current.status.latestReadyRevisionName = "online-saler-storefront-production-00020-abc";
  current.status.traffic = [{ revisionName: current.status.latestReadyRevisionName, percent: 100, url: "secret-sentinel" }];
  current.spec.template.spec.containers[0].image = "africa-south1-docker.pkg.dev/shop-project/storefront/image:revision";
  current.spec.template.spec.containers[0].env.push({ name: "PRIVATE", value: "secret-sentinel" });
  const snapshot = productionRollbackSnapshot(current);
  assert.equal(snapshot.latestReadyRevision, current.status.latestReadyRevisionName);
  assert.equal(snapshot.traffic[0].percent, 100);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret-sentinel|PRIVATE/);
  current.spec.template.spec.containers[0].image = "https://secret-sentinel@registry/image";
  assert.equal(productionRollbackSnapshot(current).image, null);
});
