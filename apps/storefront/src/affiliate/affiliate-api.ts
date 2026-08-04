import { NextResponse } from "next/server";
import { AffiliatePlatformError } from "./affiliate-platform-service";

export function affiliateApiError(error: unknown, event: string) {
  if (error instanceof AffiliatePlatformError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
  }
  console.error(event, error);
  return NextResponse.json(
    { error: "The Affiliate action could not be completed. Please try again." },
    { status: 500, headers: noStoreHeaders },
  );
}

export const noStoreHeaders = { "cache-control": "no-store" };
