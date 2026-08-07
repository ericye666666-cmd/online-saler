import { Injectable } from "@nestjs/common";
import type { HealthResponse } from "@online-saler/shared-types";

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      service: "api",
      status: "ok",
      version: process.env.npm_package_version ?? "0.1.0",
      timestamp: new Date().toISOString()
    };
  }
}
