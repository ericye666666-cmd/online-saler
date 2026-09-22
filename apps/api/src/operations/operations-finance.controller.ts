import { Controller, Get, Headers, Query } from "@nestjs/common";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsFinanceService } from "./operations-finance.service";

@Controller("operations/finance")
export class OperationsFinanceController {
  constructor(
    private readonly finance: OperationsFinanceService,
    private readonly access: OperationsAccessService
  ) {}

  @Get("summary")
  async summary(
    @Headers("authorization") authorization?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string
  ) {
    return this.finance.summary({
      adminUserId: await this.access.requireAccessToken(authorization),
      dateFrom: dateFrom?.trim() || undefined,
      dateTo: dateTo?.trim() || undefined
    });
  }
}
