import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { RefundRequestStatus } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import {
  OperationsRefundRequestService,
  type CompleteRefundRequestInput,
  type CreateRefundRequestInput,
  type ReviewRefundRequestInput
} from "./operations-refund-request.service";

/**
 * Four routes, three different permissions. Customer service can reach `create`
 * and `cancel`; only finance can reach `review` and `complete`.
 */
@Controller("operations/customer-service/refund-requests")
export class OperationsRefundRequestController {
  constructor(
    private readonly refunds: OperationsRefundRequestService,
    private readonly access: OperationsAccessService
  ) {}

  @Get()
  async list(
    @Headers("authorization") authorization: string | undefined,
    @Query("status") status?: RefundRequestStatus,
    @Query("orderId") orderId?: string
  ) {
    return this.refunds.list({ status, orderId, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Post()
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: CreateRefundRequestInput) {
    return this.refunds.create(await this.authorized(authorization, body));
  }

  @Post(":requestId/review")
  async review(
    @Headers("authorization") authorization: string | undefined,
    @Param("requestId") requestId: string,
    @Body() body: ReviewRefundRequestInput
  ) {
    return this.refunds.review(requestId, await this.authorized(authorization, body));
  }

  @Post(":requestId/complete")
  async complete(
    @Headers("authorization") authorization: string | undefined,
    @Param("requestId") requestId: string,
    @Body() body: CompleteRefundRequestInput
  ) {
    return this.refunds.complete(requestId, await this.authorized(authorization, body));
  }

  @Post(":requestId/cancel")
  async cancel(
    @Headers("authorization") authorization: string | undefined,
    @Param("requestId") requestId: string,
    @Body() body: { adminUserId?: string; reason?: string }
  ) {
    return this.refunds.cancel(requestId, await this.authorized(authorization, body));
  }

  private async authorized<T extends { adminUserId?: string }>(authorization: string | undefined, input: T): Promise<T> {
    return { ...input, adminUserId: await this.access.requireAccessToken(authorization) };
  }
}
