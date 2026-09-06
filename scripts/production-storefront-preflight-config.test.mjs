import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionConfiguration } from "./production-storefront-preflight-config.mjs";

const projectId = "online-saler-staging";
const projectNumber = "123456789012";
const credentialSentinel = "DO_NOT_LOG_RAW_CREDENTIAL_6c5802";
const cloudSqlInstance = `${projectId}:africa-south1:online-saler-db`;
const apiUrl = "https://online-saler-api-staging-example-bq.a.run.app";
const publicUrl = "https://dloop.co.ke";
const callbackUrl = `${publicUrl}/api/payments/mpesa/callback`;
const runtimeServiceAccount = `storefront-runtime@${projectId}.iam.gserviceaccount.com`;

function fixture() {
  const service = (name, databaseSecretName, url, account) => ({
    apiVersion: "serving.knative.dev/v1",
    kind: "Service",
    metadata: { name, namespace: projectNumber, annotations: {} },
    spec: {
      template: {
        metadata: { annotations: { "run.googleapis.com/cloudsql-instances": cloudSqlInstance } },
        spec: {
          serviceAccountName: account,
          containers: [{
            image: "africa-south1-docker.pkg.dev/online-saler-staging/apps/service:verified-sha",
            env: [
              { name: "DATABASE_URL", valueFrom: { secretKeyRef: { name: databaseSecretName, key: "latest" } } },
              { name: "API_URL", value: apiUrl },
              { name: "STOREFRONT_PUBLIC_URL", value: publicUrl },
              { name: "MPESA_CALLBACK_URL", value: callbackUrl },
              { name: "UNRELATED_PRIVATE_SETTING", value: credentialSentinel }
            ]
          }]
        }
      }
    },
    status: {
      url,
      latestCreatedRevisionName: `${name}-00001-ready`,
      latestReadyRevisionName: `${name}-00001-ready`,
      traffic: [{ revisionName: `${name}-00001-ready`, percent: 100 }]
    }
  });
  return {
    storefront: service("online-saler-storefront-production", "PRODUCTION_DATABASE_URL",
      "https://online-saler-storefront-production-example-bq.a.run.app", runtimeServiceAccount),
    api: service("online-saler-api-staging", "STAGING_DATABASE_URL", apiUrl,
      `api-runtime@${projectId}.iam.gserviceaccount.com`),
    proposed: {
      projectId, apiUrl, publicUrl, callbackUrl, cloudSqlInstance, runtimeServiceAccount,
      databaseSecret: "PRODUCTION_DATABASE_URL", databaseSecretVersion: "latest"
    }
  };
}

function environment(service, name) {
  return service.spec.template.spec.containers[0].env.find((entry) => entry.name === name);
}

function rejectsSafely(input, pattern) {
  assert.throws(() => validateProductionConfiguration(input), (error) => {
    assert.match(error.message, pattern);
    assert.ok(!String(error).includes(credentialSentinel));
    assert.ok(!JSON.stringify(error).includes(credentialSentinel));
    return true;
  });
}

test("returns only the actual database bindings when existing production configuration matches", () => {
  const input = fixture();
  const original = structuredClone(input);
  const result = validateProductionConfiguration(input);
  assert.deepEqual(result, {
    productionDatabaseSecret: { name: "PRODUCTION_DATABASE_URL", version: "latest" },
    apiDatabaseSecret: { name: "STAGING_DATABASE_URL", version: "latest" }
  });
  assert.deepEqual(input, original);
  assert.ok(!JSON.stringify(result).includes(credentialSentinel));
});

test("normalizes trailing slashes in the service API and public base URLs", () => {
  const input = fixture();
  input.proposed.apiUrl += "/";
  environment(input.storefront, "API_URL").value += "//";
  environment(input.storefront, "STOREFRONT_PUBLIC_URL").value += "/";
  assert.doesNotThrow(() => validateProductionConfiguration(input));
});

test("accepts latest-revision traffic and zero-percent tagged revisions", () => {
  const input = fixture();
  for (const service of [input.storefront, input.api]) {
    service.status.traffic = [
      { latestRevision: true, percent: 60 },
      { latestRevision: true, revisionName: service.status.latestReadyRevisionName, percent: 40 },
      { revisionName: "older-tagged-revision", tag: "old", percent: 0 },
      { revisionName: "older-preview-revision", tag: "preview" }
    ];
  }
  assert.doesNotThrow(() => validateProductionConfiguration(input));
});

for (const serviceName of ["storefront", "api"]) {
  const trafficCases = [
    ["missing ready revision", (status) => { delete status.latestReadyRevisionName; }, /no ready revision/],
    ["empty ready revision", (status) => { status.latestReadyRevisionName = ""; }, /no ready revision/],
    ["missing latest revision", (status) => { delete status.latestCreatedRevisionName; }, /not its ready revision/],
    ["unready latest template", (status) => { status.latestCreatedRevisionName = "new-unready-revision"; }, /not its ready revision/],
    ["missing traffic", (status) => { delete status.traffic; }, /traffic allocation is missing or invalid/],
    ["empty traffic", (status) => { status.traffic = []; }, /traffic allocation is missing or invalid/],
    ["incomplete traffic", (status) => { status.traffic[0].percent = 99; }, /does not total 100/],
    ["excessive traffic", (status) => { status.traffic.push({ revisionName: status.latestReadyRevisionName, percent: 1 }); }, /does not total 100/],
    ["split serving revisions", (status) => {
      status.traffic[0].percent = 90;
      status.traffic.push({ revisionName: "older-revision", percent: 10 });
    }, /other than its latest ready configuration/],
    ["contradictory latest flag", (status) => {
      status.traffic = [{ latestRevision: true, revisionName: "older-revision", percent: 100 }];
    }, /other than its latest ready configuration/],
    ["missing traffic target", (status) => { delete status.traffic[0].revisionName; }, /traffic revision is missing or invalid/],
    ["invalid traffic row", (status) => { status.traffic = [null]; }, /traffic allocation is invalid/],
    ["missing untagged percentage", (status) => { delete status.traffic[0].percent; }, /traffic percentage is invalid/],
    ["string percentage", (status) => { status.traffic[0].percent = "100"; }, /traffic percentage is invalid/],
    ["negative percentage", (status) => { status.traffic[0].percent = -1; }, /traffic percentage is invalid/],
    ["fractional percentage", (status) => { status.traffic[0].percent = 99.5; }, /traffic percentage is invalid/]
  ];
  for (const [name, mutate, pattern] of trafficCases) {
    test(`rejects ${serviceName} readiness or traffic mismatch: ${name}`, () => {
      const input = fixture();
      mutate(input[serviceName].status);
      rejectsSafely(input, pattern);
    });
  }
}

test("resolves same-project secret resources and Cloud Run aliases, preserving API version", () => {
  const input = fixture();
  environment(input.storefront, "DATABASE_URL").valueFrom.secretKeyRef.name = "secret-database-alias";
  input.storefront.spec.template.metadata.annotations["run.googleapis.com/secrets"] =
    `other:projects/${projectNumber}/secrets/UNRELATED,secret-database-alias:projects/${projectNumber}/secrets/PRODUCTION_DATABASE_URL`;
  environment(input.api, "DATABASE_URL").valueFrom.secretKeyRef = {
    name: `projects/${projectId}/secrets/ACTUAL_API_DATABASE_URL`, key: "17"
  };
  assert.deepEqual(validateProductionConfiguration(input), {
    productionDatabaseSecret: { name: "PRODUCTION_DATABASE_URL", version: "latest" },
    apiDatabaseSecret: { name: "ACTUAL_API_DATABASE_URL", version: "17" }
  });
});

test("supports the service metadata annotation fallback", () => {
  const input = fixture();
  for (const service of [input.storefront, input.api]) {
    service.metadata.annotations["run.googleapis.com/cloudsql-instances"] = cloudSqlInstance;
    delete service.spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"];
  }
  environment(input.storefront, "DATABASE_URL").valueFrom.secretKeyRef.name = "database-alias";
  input.storefront.metadata.annotations["run.googleapis.com/secrets"] =
    `database-alias:projects/${projectId}/secrets/PRODUCTION_DATABASE_URL`;
  assert.doesNotThrow(() => validateProductionConfiguration(input));
});

const driftCases = [
  ["wrong storefront service", (input) => { input.storefront.metadata.name = "online-saler-storefront-staging"; }, /production storefront service/],
  ["wrong API service", (input) => { input.api.metadata.name = "another-api"; }, /expected live API service/],
  ["different proposed API URL", (input) => { input.proposed.apiUrl = "https://different-api.example.com"; }, /live API service URL/],
  ["different live API URL", (input) => { input.api.status.url = "https://different-api.example.com"; }, /live API service URL/],
  ["different storefront API URL", (input) => { environment(input.storefront, "API_URL").value = "https://different-api.example.com"; }, /current storefront API URL/],
  ["different public URL", (input) => { input.proposed.publicUrl = "https://different-store.example.com"; }, /current storefront public URL/],
  ["different callback URL", (input) => { input.proposed.callbackUrl = "https://different-store.example.com/api/payments/mpesa/callback"; }, /current storefront callback URL/],
  ["missing callback URL", (input) => { delete environment(input.storefront, "MPESA_CALLBACK_URL").value; }, /current M-Pesa callback URL/],
  ["different runtime account", (input) => { input.proposed.runtimeServiceAccount = `other@${projectId}.iam.gserviceaccount.com`; }, /runtime service account/],
  ["different storefront database secret", (input) => { environment(input.storefront, "DATABASE_URL").valueFrom.secretKeyRef.name = "OTHER_DATABASE_URL"; }, /current storefront database binding/],
  ["pinned storefront database version", (input) => { environment(input.storefront, "DATABASE_URL").valueFrom.secretKeyRef.key = "3"; }, /current storefront database binding/],
  ["different proposed database secret", (input) => { input.proposed.databaseSecret = "STAGING_DATABASE_URL"; }, /proposed storefront database/],
  ["different proposed database version", (input) => { input.proposed.databaseSecretVersion = "3"; }, /proposed storefront database/],
  ["different service project", (input) => { input.api.metadata.namespace = "987654321098"; }, /different projects/],
  ["duplicate critical environment entry", (input) => { input.storefront.spec.template.spec.containers[0].env.push({ name: "API_URL", value: credentialSentinel }); }, /duplicate entries/]
];

for (const [name, mutate, pattern] of driftCases) {
  test(`rejects configuration drift: ${name}`, () => {
    const input = fixture();
    mutate(input);
    rejectsSafely(input, pattern);
  });
}

for (const serviceName of ["storefront", "api"]) {
  for (const [name, binding] of [
    ["different instance", `${projectId}:africa-south1:other-db`],
    ["extra instance", `${cloudSqlInstance},${projectId}:africa-south1:other-db`],
    ["duplicate instance", `${cloudSqlInstance},${cloudSqlInstance}`],
    ["missing instance", undefined]
  ]) {
    test(`rejects ${serviceName} Cloud SQL ${name}`, () => {
      const input = fixture();
      input[serviceName].spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"] = binding;
      rejectsSafely(input, /Cloud SQL binding/);
    });
  }

  test(`rejects ${serviceName} literal database credentials without disclosing them`, () => {
    const input = fixture();
    const entry = environment(input[serviceName], "DATABASE_URL");
    delete entry.valueFrom;
    entry.value = `postgresql://user:${credentialSentinel}@db/database`;
    rejectsSafely(input, /Secret Manager binding, not a literal value/);
  });

  test(`rejects ${serviceName} cross-project secret aliases`, () => {
    const input = fixture();
    environment(input[serviceName], "DATABASE_URL").valueFrom.secretKeyRef.name = "database-alias";
    input[serviceName].spec.template.metadata.annotations["run.googleapis.com/secrets"] =
      `database-alias:projects/other-project/secrets/PRODUCTION_DATABASE_URL`;
    rejectsSafely(input, /deployment project/);
  });
}

for (const [name, reference] of [
  ["cross-project number", `projects/987654321098/secrets/PRIVATE_${credentialSentinel}`],
  ["cross-project ID", `projects/other-project/secrets/PRIVATE_${credentialSentinel}`],
  ["resource with version suffix", `projects/${projectId}/secrets/PRIVATE_${credentialSentinel}/versions/latest`],
  ["credential-bearing URL", `postgresql://user:${credentialSentinel}@db/database`]
]) {
  test(`rejects unsafe database secret resource: ${name}`, () => {
    const input = fixture();
    environment(input.api, "DATABASE_URL").valueFrom.secretKeyRef.name = reference;
    rejectsSafely(input, /deployment project/);
  });
}

test("rejects invalid secret versions without disclosing their values", () => {
  const input = fixture();
  environment(input.api, "DATABASE_URL").valueFrom.secretKeyRef.key = credentialSentinel;
  rejectsSafely(input, /secret version is invalid/);
});

test("rejects ambiguous secret aliases", () => {
  const input = fixture();
  environment(input.api, "DATABASE_URL").valueFrom.secretKeyRef.name = "database-alias";
  input.api.metadata.annotations["run.googleapis.com/secrets"] =
    `database-alias:projects/${projectId}/secrets/ONE,database-alias:projects/${projectId}/secrets/TWO`;
  rejectsSafely(input, /secret alias is ambiguous/);
});

test("invalid credential-bearing URLs have static errors", () => {
  const input = fixture();
  input.proposed.apiUrl = `https://user:${credentialSentinel}@api.example.com`;
  rejectsSafely(input, /API URL is invalid/);
});

for (const [name, value] of [
  ["credentials", `https://user:${credentialSentinel}@dloop.co.ke/api/payments/mpesa/callback`],
  ["query", `${callbackUrl}?secret=${credentialSentinel}`],
  ["fragment", `${callbackUrl}#${credentialSentinel}`],
  ["insecure protocol", callbackUrl.replace("https:", "http:")],
  ["wrong path", `${publicUrl}/api/other`],
  ["invalid URL", credentialSentinel]
]) {
  test(`rejects callback ${name} even when current and proposed values match`, () => {
    const input = fixture();
    input.proposed.callbackUrl = value;
    environment(input.storefront, "MPESA_CALLBACK_URL").value = value;
    rejectsSafely(input, /HTTPS callback endpoint without credentials, query, or fragment/);
  });
}
