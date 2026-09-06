import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsAfterSalesService, type AfterSalesInput } from "./operations-after-sales.service";

@Controller("operations/orders/:orderId/after-sales")
export class OperationsAfterSalesController {
  constructor(private readonly service: OperationsAfterSalesService, private readonly access: OperationsAccessService) {}

  @Get()
  async list(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string) {
    return this.service.list(orderId, await this.access.requireAccessToken(authorization));
  }

  @Post()
  async request(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AfterSalesInput) {
    return this.service.execute(orderId, undefined, "REQUEST", body, await this.access.requireAccessToken(authorization));
  }

  @Post(":returnId/decision")
  async decision(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Param("returnId") returnId: string, @Body() body: AfterSalesInput) {
    return this.service.execute(orderId, returnId, "DECISION", body, await this.access.requireAccessToken(authorization));
  }

  @Post(":returnId/receive")
  async receive(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Param("returnId") returnId: string, @Body() body: AfterSalesInput) {
    return this.service.execute(orderId, returnId, "RECEIVE", body, await this.access.requireAccessToken(authorization));
  }

  @Post(":returnId/refunds")
  async refund(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Param("returnId") returnId: string, @Body() body: AfterSalesInput) {
    return this.service.execute(orderId, returnId, "REFUND", body, await this.access.requireAccessToken(authorization));
  }

  @Post(":returnId/restock")
  async restock(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Param("returnId") returnId: string, @Body() body: AfterSalesInput) {
    return this.service.execute(orderId, returnId, "RESTOCK", body, await this.access.requireAccessToken(authorization));
  }
}
