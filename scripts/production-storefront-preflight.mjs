import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductionConfiguration } from "./production-storefront-preflight-config.mjs";

export function productionRollbackSnapshot(storefront) {
  const revision = (value) => typeof value === "string" && /^online-saler-storefront-production-[a-z0-9-]+$/.test(value) ? value : null;
  const image = storefront.spec?.template?.spec?.containers?.[0]?.image;
  return {
    latestReadyRevision: revision(storefront.status?.latestReadyRevisionName),
    image: typeof image === "string" && /^[a-z0-9.-]+-docker\.pkg\.dev\/[a-z0-9/_:.-]+(?:@sha256:[a-f0-9]{64})?$/.test(image) ? image : null,
    traffic: (Array.isArray(storefront.status?.traffic) ? storefront.status.traffic : []).map((entry) => ({
      revisionName: revision(entry.revisionName),
      percent: Number.isFinite(entry.percent) && entry.percent >= 0 && entry.percent <= 100 ? entry.percent : null,
      latestRevision: entry.latestRevision === true
    }))
  };
}

export function runProductionPreflight({ env = process.env, command = execFileSync, log = console.log } = {}) {
  const required = (name) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing preflight input: ${name}.`);
    return value;
  };
  const projectId = required("PREFLIGHT_PROJECT_ID");
  const region = required("PREFLIGHT_REGION");
  const image = required("PREFLIGHT_IMAGE_URI");
  const runId = required("PREFLIGHT_RUN_ID");
  const attempt = required("PREFLIGHT_RUN_ATTEMPT");
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(attempt)) throw new Error("Invalid preflight run identifier.");
  const jobName = `storefront-preflight-${runId}-${attempt}`;
  const common = ["--project", projectId, "--region", region, "--quiet"];
  const cloud = (args, failure) => {
    try {
      return command("gcloud", args, {
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 420_000, maxBuffer: 8 * 1024 * 1024
      });
    } catch { throw new Error(failure); }
  };
  const describe = (service) => {
    const json = cloud(["run", "services", "describe", service, ...common, "--format=json"], "Cannot read current Cloud Run configuration; production deployment is blocked.");
    try { return JSON.parse(json); } catch { throw new Error("Cloud Run returned invalid configuration; details are redacted."); }
  };
  const proposed = {
    projectId,
    apiUrl: required("PREFLIGHT_API_URL"),
    publicUrl: required("PREFLIGHT_PUBLIC_URL"),
    callbackUrl: required("PREFLIGHT_CALLBACK_URL"),
    cloudSqlInstance: required("PREFLIGHT_CLOUD_SQL_INSTANCE"),
    runtimeServiceAccount: required("PREFLIGHT_RUNTIME_SERVICE_ACCOUNT"),
    databaseSecret: "PRODUCTION_DATABASE_URL",
    databaseSecretVersion: "latest"
  };
  const storefront = describe("online-saler-storefront-production");
  const bindings = validateProductionConfiguration({ storefront, api: describe("online-saler-api-staging"), proposed });
  log(`Production rollback snapshot: ${JSON.stringify(productionRollbackSnapshot(storefront))}`);
  log("PASS: Proposed production routing, database binding, Cloud SQL attachment and runtime identity match the existing services.");
  const reference = (secret) => `${secret.name}:${secret.version}`;
  let jobMayExist = false;
  let failure;
  try {
    jobMayExist = true;
    cloud([
      "run", "jobs", "deploy", jobName, ...common,
      "--image", image, "--service-account", proposed.runtimeServiceAccount,
      "--set-cloudsql-instances", proposed.cloudSqlInstance,
      "--set-secrets", `DATABASE_URL=${reference(bindings.productionDatabaseSecret)},PREFLIGHT_API_DATABASE_URL=${reference(bindings.apiDatabaseSecret)}`,
      "--command", "node", "--args", "scripts/production-storefront-preflight-db.mjs",
      "--tasks=1", "--parallelism=1", "--max-retries=0", "--task-timeout=5m", "--memory=1Gi", "--cpu=1"
    ], `Cannot create read-only preflight job ${jobName}; production deployment is blocked.`);
    cloud(["run", "jobs", "execute", jobName, ...common, "--wait", "--format=json"],
      `Read-only preflight job ${jobName} failed. Review its redacted check result in Cloud Logging; production deployment is blocked.`);
    log("PASS: Read-only database target and candidate schema checks completed before production deployment.");
  } catch (error) { failure = error; }
  finally {
    if (jobMayExist) {
      try { cloud(["run", "jobs", "delete", jobName, ...common], `Could not remove temporary preflight job ${jobName}.`); }
      catch (error) { failure ??= error; }
    }
  }
  if (failure) throw failure;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runProductionPreflight(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
