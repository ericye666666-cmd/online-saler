export type SourceApp = "STOREFRONT" | "OPERATIONS" | "ADMIN" | "API" | "WORKER";

export type HealthStatus = "ok" | "degraded";

export interface HealthResponse {
  service: string;
  status: HealthStatus;
  version: string;
  timestamp: string;
}

export type AppKey = "storefront" | "operations" | "admin" | "api" | "worker";

export const FOUNDATION_APPS: Record<AppKey, string> = {
  storefront: "Customer Storefront",
  operations: "Operations App",
  admin: "Admin Console",
  api: "Unified Backend API",
  worker: "Background Worker"
};

export type MoneyKsh = number;
