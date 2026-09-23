import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { OperationsAccessService } from "./operations-access.service";
import {
  OperationsRiderService,
  type RiderUpsertInput
} from "./operations-rider.service";
import type {
  DeliveryCodeInput,
  DeliveryFailureInput,
  DropOffInput
} from "./operations-fulfillment.service";

/**
 * The rider's own routes. Every one of them resolves the rider from the bearer
 * token and never from the request body, so a rider cannot name another rider's
 * id and read or close their deliveries.
 */
@Controller("operations/rider")
export class OperationsRiderController {
  constructor(
    private readonly riders: OperationsRiderService,
    private readonly access: OperationsAccessService
  ) {}

  @Get("me")
  async me(@Headers("authorization") authorization?: string) {
    return this.riders.me(await this.access.requireAccessToken(authorization));
  }

  @Get("deliveries")
  async deliveries(@Headers("authorization") authorization?: string) {
    return this.riders.myDeliveries(await this.access.requireAccessToken(authorization));
  }

  @Post("deliveries/:orderId/complete")
  async complete(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() body: DeliveryCodeInput
  ) {
    return this.riders.completeDelivery(orderId, await this.authorized(authorization, body));
  }

  @Post("deliveries/:orderId/drop-off")
  async dropOff(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() body: DropOffInput
  ) {
    return this.riders.authorizedDropOff(orderId, await this.authorized(authorization, body));
  }

  @Post("deliveries/:orderId/failed")
  async failed(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() body: DeliveryFailureInput
  ) {
    return this.riders.markFailed(orderId, await this.authorized(authorization, body));
  }

  @Post("deliveries/:orderId/return")
  async returnToNode(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() body: DeliveryFailureInput
  ) {
    return this.riders.startReturn(orderId, await this.authorized(authorization, body));
  }

  private async authorized<T extends { adminUserId?: string }>(authorization: string | undefined, input: T): Promise<T> {
    return { ...input, adminUserId: await this.access.requireAccessToken(authorization) };
  }
}

/** The store manager's rider roster. */
@Controller("operations/riders")
export class OperationsRiderRosterController {
  constructor(
    private readonly riders: OperationsRiderService,
    private readonly access: OperationsAccessService
  ) {}

  @Get()
  async list(@Headers("authorization") authorization?: string, @Query("nodeId") nodeId?: string) {
    return this.riders.roster({ adminUserId: await this.access.requireAccessToken(authorization), nodeId });
  }

  @Post()
  async add(@Headers("authorization") authorization: string | undefined, @Body() body: RiderUpsertInput) {
    return this.riders.addRider({ ...body, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Patch(":riderId")
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("riderId") riderId: string,
    @Body() body: RiderUpsertInput
  ) {
    return this.riders.updateRider(riderId, { ...body, adminUserId: await this.access.requireAccessToken(authorization) });
  }
}
