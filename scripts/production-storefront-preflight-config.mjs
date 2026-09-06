// This module only inspects gcloud's service descriptions. It never reads a
// secret value, changes Cloud Run configuration, or includes runtime values in
// errors: descriptions can contain literal credentials in unrelated env vars.
const CLOUD_SQL_ANNOTATION = "run.googleapis.com/cloudsql-instances";
const SECRET_ANNOTATION = "run.googleapis.com/secrets";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredString(value, message) {
  requireCondition(typeof value === "string" && value.length > 0 && value === value.trim(), message);
  return value;
}

function baseUrl(value, message) {
  requiredString(value, message);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(message);
  }
  requireCondition(parsed.protocol === "https:" && !parsed.username && !parsed.password
    && !parsed.search && !parsed.hash && /^\/*$/.test(parsed.pathname), message);
  return value.replace(/\/+$/, "");
}

function callbackUrl(value) {
  const message = "Proposed M-Pesa callback URL must be an HTTPS callback endpoint without credentials, query, or fragment.";
  requiredString(value, message);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(message);
  }
  requireCondition(value.startsWith("https://") && parsed.protocol === "https:"
    && !parsed.username && !parsed.password && !/[?#]/.test(value)
    && parsed.pathname === "/api/payments/mpesa/callback", message);
  return value;
}

function annotation(service, key) {
  return service?.spec?.template?.metadata?.annotations?.[key]
    ?? service?.metadata?.annotations?.[key];
}

function containerEnvironment(service) {
  const containers = service?.spec?.template?.spec?.containers;
  requireCondition(Array.isArray(containers) && containers.length === 1,
    "Preflight requires an unambiguous single-container service configuration.");
  const entries = containers[0]?.env;
  requireCondition(Array.isArray(entries), "Service environment configuration is missing.");
  const environment = new Map();
  for (const entry of entries) {
    requireCondition(typeof entry?.name === "string" && !environment.has(entry.name),
      "Service environment configuration contains invalid or duplicate entries.");
    environment.set(entry.name, entry);
  }
  return environment;
}

function literalEnvironment(environment, name, message) {
  const entry = environment.get(name);
  requireCondition(entry && !entry.valueFrom, message);
  return requiredString(entry.value, message);
}

function checkCloudSql(service, intended) {
  const binding = annotation(service, CLOUD_SQL_ANNOTATION);
  requireCondition(typeof binding === "string", "A service Cloud SQL binding is missing.");
  const instances = binding.split(",").map((value) => value.trim());
  requireCondition(instances.length === 1 && instances[0] === intended,
    "A service Cloud SQL binding differs from the intended single instance.");
}

function checkServingTemplate(service) {
  const status = service?.status;
  const readyRevision = requiredString(status?.latestReadyRevisionName,
    "A service has no ready revision.");
  requireCondition(status?.latestCreatedRevisionName === readyRevision,
    "A service's latest configuration is not its ready revision.");
  requireCondition(Array.isArray(status.traffic) && status.traffic.length > 0,
    "A service's current traffic allocation is missing or invalid.");
  let totalPercent = 0;
  for (const target of status.traffic) {
    requireCondition(target && typeof target === "object"
      && (target.latestRevision === undefined || typeof target.latestRevision === "boolean"),
    "A service's current traffic allocation is invalid.");
    const revision = target.revisionName === undefined && target.latestRevision === true
      ? readyRevision : target.revisionName;
    requiredString(revision, "A service's traffic revision is missing or invalid.");
    // gcloud can omit percent for a tagged URL that receives no default traffic.
    const percent = target.percent === undefined && typeof target.tag === "string" && target.tag.trim()
      ? 0 : target.percent;
    requireCondition(Number.isInteger(percent) && percent >= 0 && percent <= 100,
      "A service's current traffic percentage is invalid.");
    if (percent > 0) {
      requireCondition(revision === readyRevision,
        "A service is routing traffic to a revision other than its latest ready configuration.");
    }
    totalPercent += percent;
  }
  requireCondition(totalPercent === 100,
    "A service's current traffic allocation does not total 100 percent.");
}

function sameProjectIdentifiers(storefront, api, projectId) {
  const identifiers = new Set([projectId]);
  const namespaces = [storefront?.metadata?.namespace, api?.metadata?.namespace]
    .filter((value) => value !== undefined);
  requireCondition(namespaces.every((value) => typeof value === "string" && value.length > 0),
    "Service project metadata is invalid.");
  requireCondition(new Set(namespaces).size <= 1, "Services belong to different projects.");
  if (namespaces.length > 0) {
    const namespace = namespaces[0];
    requireCondition(namespace === projectId || /^\d+$/.test(namespace),
      "Service project metadata differs from the proposed project.");
    // Cloud Run v1 reports its project number in metadata.namespace. Both
    // descriptions are fetched from the proposed project by the caller.
    identifiers.add(namespace);
  }
  return identifiers;
}

function normalizeSecretName(reference, allowedProjects) {
  const simpleName = /^[A-Za-z0-9_-]+$/;
  if (simpleName.test(reference)) return reference;
  const resource = /^projects\/([^/]+)\/secrets\/([A-Za-z0-9_-]+)$/.exec(reference);
  requireCondition(resource && allowedProjects.has(resource[1]),
    "DATABASE_URL must reference a Secret Manager secret in the deployment project.");
  return resource[2];
}

function databaseSecret(service, environment, allowedProjects) {
  const entry = environment.get("DATABASE_URL");
  requireCondition(entry && !Object.hasOwn(entry, "value") && entry.valueFrom?.secretKeyRef,
    "DATABASE_URL must use a Secret Manager binding, not a literal value.");
  const reference = entry.valueFrom.secretKeyRef;
  let name = requiredString(reference.name, "DATABASE_URL secret reference is invalid.");
  const version = requiredString(reference.key, "DATABASE_URL secret version is invalid.");
  requireCondition(/^(latest|\d+)$/.test(version), "DATABASE_URL secret version is invalid.");

  // Cloud Run v1 may store a generated alias in secretKeyRef.name and map it
  // to projects/<project number>/secrets/<name> in this annotation.
  const aliases = annotation(service, SECRET_ANNOTATION);
  if (aliases !== undefined) {
    requireCondition(typeof aliases === "string", "Secret Manager alias metadata is invalid.");
    const matches = aliases.split(",").map((entry) => entry.trim()).filter((entry) => {
      const separator = entry.indexOf(":");
      return separator >= 0 && entry.slice(0, separator).trim() === name;
    });
    requireCondition(matches.length <= 1, "DATABASE_URL secret alias is ambiguous.");
    if (matches.length === 1) name = matches[0].slice(matches[0].indexOf(":") + 1).trim();
  }

  return { name: normalizeSecretName(name, allowedProjects), version };
}

export function validateProductionConfiguration({ storefront, api, proposed } = {}) {
  requireCondition(storefront?.metadata?.name === "online-saler-storefront-production",
    "The described storefront is not the production storefront service.");
  requireCondition(api?.metadata?.name === "online-saler-api-staging",
    "The described API is not the expected live API service.");
  checkServingTemplate(storefront);
  checkServingTemplate(api);
  requireCondition(proposed && typeof proposed === "object", "Proposed deployment configuration is missing.");
  const projectId = requiredString(proposed.projectId, "Proposed deployment project is missing.");
  requireCondition(/^[A-Za-z0-9-]+$/.test(projectId), "Proposed deployment project is invalid.");
  const allowedProjects = sameProjectIdentifiers(storefront, api, projectId);
  const storefrontEnvironment = containerEnvironment(storefront);
  const apiEnvironment = containerEnvironment(api);

  const apiUrl = baseUrl(proposed.apiUrl, "Proposed API URL is invalid.");
  requireCondition(baseUrl(api?.status?.url, "The API service URL is invalid.") === apiUrl,
    "The proposed API URL differs from the live API service URL.");
  requireCondition(baseUrl(literalEnvironment(storefrontEnvironment, "API_URL",
    "The current storefront API URL is missing or invalid."),
  "The current storefront API URL is invalid.") === apiUrl,
  "The proposed API URL differs from the current storefront API URL.");

  const publicUrl = baseUrl(proposed.publicUrl, "Proposed public URL is invalid.");
  requireCondition(baseUrl(literalEnvironment(storefrontEnvironment, "STOREFRONT_PUBLIC_URL",
    "The current storefront public URL is missing or invalid."),
  "The current storefront public URL is invalid.") === publicUrl,
  "The proposed public URL differs from the current storefront public URL.");
  const intendedCallbackUrl = callbackUrl(proposed.callbackUrl);
  requireCondition(literalEnvironment(storefrontEnvironment, "MPESA_CALLBACK_URL",
    "The current M-Pesa callback URL is missing or invalid.") === intendedCallbackUrl,
  "The proposed M-Pesa callback URL differs from the current storefront callback URL.");

  const cloudSqlInstance = requiredString(proposed.cloudSqlInstance, "Proposed Cloud SQL instance is missing.");
  checkCloudSql(storefront, cloudSqlInstance);
  checkCloudSql(api, cloudSqlInstance);
  const runtimeServiceAccount = requiredString(proposed.runtimeServiceAccount,
    "Proposed storefront runtime service account is missing.");
  requireCondition(storefront?.spec?.template?.spec?.serviceAccountName === runtimeServiceAccount,
    "The proposed storefront runtime service account differs from the current service account.");

  requireCondition(proposed.databaseSecret === "PRODUCTION_DATABASE_URL"
    && proposed.databaseSecretVersion === "latest",
  "The proposed storefront database must use PRODUCTION_DATABASE_URL at latest.");
  const productionDatabaseSecret = databaseSecret(storefront, storefrontEnvironment, allowedProjects);
  requireCondition(productionDatabaseSecret.name === proposed.databaseSecret
    && productionDatabaseSecret.version === proposed.databaseSecretVersion,
  "The current storefront database binding differs from PRODUCTION_DATABASE_URL at latest.");
  const apiDatabaseSecret = databaseSecret(api, apiEnvironment, allowedProjects);

  return { productionDatabaseSecret, apiDatabaseSecret };
}
