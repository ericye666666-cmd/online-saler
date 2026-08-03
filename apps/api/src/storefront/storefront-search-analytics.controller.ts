import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { prisma } from "@online-saler/database";

type SearchEventBody = {
  query?: unknown;
  resultCount?: unknown;
  category?: unknown;
};

export type NormalizedSearchEvent = {
  keyword: string;
  resultCount: number;
  category: string | null;
};

@Controller("public/analytics/searches")
export class StorefrontSearchAnalyticsController {
  @Post()
  @HttpCode(202)
  async record(@Body() body: SearchEventBody) {
    const event = normalizeSearchEvent(body);
    await prisma.storefrontSearchEvent.create({ data: event });
    return { accepted: true };
  }
}

export function normalizeSearchEvent(body: SearchEventBody): NormalizedSearchEvent {
  const keyword = cleanText(body.query, 100).toLocaleLowerCase("en");
  const category = cleanText(body.category, 80) || null;
  const resultCount = Number(body.resultCount);

  if (keyword.length < 2) {
    throw new BadRequestException("Search query must contain at least 2 characters.");
  }
  if (!Number.isInteger(resultCount) || resultCount < 0 || resultCount > 100_000) {
    throw new BadRequestException("Search result count must be a non-negative integer.");
  }

  return { keyword, resultCount, category };
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}
