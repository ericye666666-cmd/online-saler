import { Controller, Get, Query } from "@nestjs/common";
import { FulfillmentMethod } from "@online-saler/database";
import { OperationsAnalyticsService, type AnalyticsFilters } from "./operations-analytics.service";

@Controller("operations/analytics")
export class OperationsAnalyticsController {
  constructor(private readonly analytics: OperationsAnalyticsService) {}

  @Get("dashboard")
  dashboard(
    @Query("adminUserId") adminUserId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("category") category?: string,
    @Query("employeeId") employeeId?: string,
    @Query("affiliateId") affiliateId?: string,
    @Query("fulfillmentMethod") fulfillmentMethod?: FulfillmentMethod
  ) {
    return this.analytics.dashboard(cleanFilters({
      adminUserId,
      dateFrom,
      dateTo,
      category,
      employeeId,
      affiliateId,
      fulfillmentMethod
    }));
  }
}

function cleanFilters(filters: AnalyticsFilters): AnalyticsFilters {
  return {
    adminUserId: clean(filters.adminUserId),
    dateFrom: clean(filters.dateFrom),
    dateTo: clean(filters.dateTo),
    category: clean(filters.category),
    employeeId: clean(filters.employeeId),
    affiliateId: clean(filters.affiliateId),
    fulfillmentMethod: filters.fulfillmentMethod && Object.values(FulfillmentMethod).includes(filters.fulfillmentMethod)
      ? filters.fulfillmentMethod
      : undefined
  };
}

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
