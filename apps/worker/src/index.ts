import { RESERVATION_MINUTES } from "@online-saler/business-rules";
import type { HealthResponse } from "@online-saler/shared-types";

export function getWorkerHealth(): HealthResponse {
  return {
    service: "worker",
    status: "ok",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString()
  };
}

if (process.argv.includes("--once")) {
  console.log(JSON.stringify({ ...getWorkerHealth(), reservationMinutes: RESERVATION_MINUTES }));
} else {
  console.log("online-saler worker started", getWorkerHealth());
}
