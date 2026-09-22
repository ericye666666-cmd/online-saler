import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { OperationsAccessService } from "./operations-access.service";
import {
  OperationsPaymentReviewService,
  type CallbackResolutionInput,
  type PaymentReviewActionInput
} from "./operations-payment-review.service";

@Controller("operations/payment-review")
export class OperationsPaymentReviewController {
  constructor(
    private readonly review: OperationsPaymentReviewService,
    private readonly access: OperationsAccessService
  ) {}

  @Get()
  async queue(
    @Headers("authorization") authorization: string | undefined,
    @Query("includeResolved") includeResolved?: string
  ) {
    return this.review.queue({
      adminUserId: await this.access.requireAccessToken(authorization),
      includeResolved: includeResolved === "true"
    });
  }

  @Get("payments/:paymentId")
  async detail(@Headers("authorization") authorization: string | undefined, @Param("paymentId") paymentId: string) {
    return this.review.detail(paymentId, await this.access.requireAccessToken(authorization));
  }

  @Post("payments/:paymentId/settle")
  async settle(
    @Headers("authorization") authorization: string | undefined,
    @Param("paymentId") paymentId: string,
    @Body() body: PaymentReviewActionInput
  ) {
    return this.review.settle(paymentId, {
      ...body,
      adminUserId: await this.access.requireAccessToken(authorization)
    });
  }

  @Post("payments/:paymentId/reject")
  async reject(
    @Headers("authorization") authorization: string | undefined,
    @Param("paymentId") paymentId: string,
    @Body() body: PaymentReviewActionInput
  ) {
    return this.review.reject(paymentId, {
      ...body,
      adminUserId: await this.access.requireAccessToken(authorization)
    });
  }

  @Post("callbacks/:callbackId/resolve")
  async resolveCallback(
    @Headers("authorization") authorization: string | undefined,
    @Param("callbackId") callbackId: string,
    @Body() body: CallbackResolutionInput
  ) {
    return this.review.resolveCallback(callbackId, {
      ...body,
      adminUserId: await this.access.requireAccessToken(authorization)
    });
  }
}
