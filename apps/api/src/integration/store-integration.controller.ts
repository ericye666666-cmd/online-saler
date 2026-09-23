import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { assertStoreIntegrationKey, storeIntegrationKeyHeader } from "./store-integration-auth";
import {
  StoreIntegrationService,
  type StoreDispatchInput,
  type StoreIntegrationInput,
  type StorePickupInput,
  type StoreReceiveInput
} from "./store-integration.service";
import type { DeliveryFailureReason } from "@online-saler/database";

/**
 * The store ERP's entry point. Its backend calls these with the shared key; a
 * clerk's browser never does, so the key stays server-side.
 *
 * `storeCode` is a path parameter rather than a body field on purpose: it is the
 * one thing that decides what the caller may see, so it belongs where it is
 * obvious in every log line and every route.
 */
@Controller("integration/store-fulfillment/:storeCode")
export class StoreIntegrationController {
  constructor(private readonly stores: StoreIntegrationService) {}

  /** The three piles a store works through, with their counts. */
  @Get("board")
  async board(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.board(storeCode);
  }

  /** Looks a parcel up by the code printed on its fulfillment sheet. */
  @Get("scan")
  async scan(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string,
    @Query("packageCode") packageCode: string
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.scan(storeCode, packageCode);
  }

  /** The riders of this store, for the dispatch picker. */
  @Get("riders")
  async riders(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.riders(storeCode);
  }

  @Post("packages/:orderId/receive")
  async receive(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string,
    @Param("orderId") orderId: string,
    @Body() body: Omit<StoreReceiveInput, "storeCode">
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.receive(orderId, { ...body, storeCode });
  }

  @Post("packages/:orderId/dispatch")
  async dispatch(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string,
    @Param("orderId") orderId: string,
    @Body() body: Omit<StoreDispatchInput, "storeCode">
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.dispatch(orderId, { ...body, storeCode });
  }

  @Post("packages/:orderId/pickup")
  async pickup(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string,
    @Param("orderId") orderId: string,
    @Body() body: Omit<StorePickupInput, "storeCode">
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.pickup(orderId, { ...body, storeCode });
  }

  @Post("packages/:orderId/confirm-return")
  async confirmReturn(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string,
    @Param("orderId") orderId: string,
    @Body() body: Omit<StoreIntegrationInput, "storeCode">
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.confirmReturn(orderId, { ...body, storeCode });
  }

  @Post("packages/:orderId/delivery-failed")
  async deliveryFailed(
    @Headers(storeIntegrationKeyHeader()) key: string | undefined,
    @Param("storeCode") storeCode: string,
    @Param("orderId") orderId: string,
    @Body() body: Omit<StoreIntegrationInput, "storeCode"> & { reason?: DeliveryFailureReason }
  ) {
    assertStoreIntegrationKey(key);
    return this.stores.markFailed(orderId, { ...body, storeCode });
  }
}
