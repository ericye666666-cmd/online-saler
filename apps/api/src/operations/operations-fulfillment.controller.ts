import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { InventoryItemStatus, WarehouseLocationStatus } from "@online-saler/database";
import {
  OperationsFulfillmentService,
  type AdminInput,
  type AfterSaleInput,
  type EmployeeInput,
  type ExceptionInput,
  type OrderCenterListInput,
  type PackingInput,
  type PickupInput,
  type RiderInput,
  type ScanInput
} from "./operations-fulfillment.service";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsWarehouseService } from "./operations-warehouse.service";

@Controller("operations/orders")
export class OperationsFulfillmentController {
  constructor(
    private readonly orders: OperationsFulfillmentService,
    private readonly access: OperationsAccessService
  ) {}

  @Get("summary")
  async summary(@Headers("authorization") authorization: string | undefined, @Query() query: OrderCenterListInput) {
    return this.orders.summary({ ...query, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Get("employees")
  async employees(@Headers("authorization") authorization?: string) {
    return this.orders.employees(await this.access.requireAccessToken(authorization));
  }

  @Get()
  async list(@Headers("authorization") authorization: string | undefined, @Query() query: OrderCenterListInput) {
    return this.orders.listOrders({ ...query, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Get(":orderId")
  async detail(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string) {
    return this.orders.orderDetail(orderId, await this.access.requireAccessToken(authorization));
  }

  @Post(":orderId/assign-picker")
  async assignPicker(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: EmployeeInput) {
    return this.orders.assignPicker(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/claim-picking")
  async claimPicking(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.claimPicking(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/items/:orderItemId/scan")
  async scanItem(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Param("orderItemId") orderItemId: string, @Body() body: ScanInput) {
    return this.orders.scanItem(orderId, orderItemId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/start-packing")
  async startPacking(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: EmployeeInput) {
    return this.orders.startPacking(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/complete-packing")
  async completePacking(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: PackingInput) {
    return this.orders.completePacking(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/ready-for-pickup")
  async readyForPickup(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.readyForPickup(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/ready-for-dispatch")
  async readyForDispatch(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.readyForDispatch(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/assign-rider")
  async assignRider(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: RiderInput) {
    return this.orders.assignRider(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/dispatch")
  async dispatch(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.dispatch(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/confirm-pickup")
  async confirmPickup(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: PickupInput) {
    return this.orders.confirmPickup(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/complete-delivery")
  async completeDelivery(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.completeDelivery(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/exception")
  async exception(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: ExceptionInput) {
    return this.orders.markException(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/cancel")
  async cancel(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.cancel(orderId, await this.authorizedInput(authorization, body));
  }

  @Post(":orderId/assign-after-sale")
  async assignAfterSale(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string, @Body() body: AfterSaleInput) {
    return this.orders.assignAfterSale(orderId, await this.authorizedInput(authorization, body));
  }

  private async authorizedInput<T extends AdminInput>(authorization: string | undefined, input: T): Promise<T> {
    return {
      ...input,
      adminUserId: await this.access.requireAccessToken(authorization)
    };
  }
}

@Controller("operations/warehouse-locations")
export class OperationsWarehouseLocationsController {
  constructor(private readonly warehouse: OperationsWarehouseService) {}

  @Get()
  list(
    @Query("adminUserId") adminUserId?: string,
    @Query("search") search?: string,
    @Query("status") status?: WarehouseLocationStatus,
    @Query("minCapacity") minCapacity?: string,
    @Query("maxCapacity") maxCapacity?: string,
    @Query("onlyAvailable") onlyAvailable?: string,
    @Query("onlyFull") onlyFull?: string
  ) {
    return this.warehouse.listLocations({
      adminUserId,
      search,
      status,
      minCapacity: optionalNumber(minCapacity),
      maxCapacity: optionalNumber(maxCapacity),
      onlyAvailable: onlyAvailable === "true",
      onlyFull: onlyFull === "true"
    });
  }

  @Get("summary")
  summary(@Query("adminUserId") adminUserId?: string) {
    return this.warehouse.locationSummary(adminUserId);
  }

  @Post()
  create(@Body() body: { adminUserId?: string; locationCode?: string; capacity?: number; status?: WarehouseLocationStatus; note?: string }) {
    return this.warehouse.createLocation(body);
  }

  @Post("bulk")
  bulk(@Body() body: { adminUserId?: string; prefix?: string; start?: string | number; end?: string | number; capacity?: number; status?: WarehouseLocationStatus; note?: string }) {
    return this.warehouse.bulkCreateLocations(body);
  }

  @Patch(":locationId/status")
  status(@Param("locationId") locationId: string, @Body() body: { adminUserId?: string; status?: WarehouseLocationStatus; note?: string }) {
    return this.warehouse.setLocationStatus(locationId, body);
  }

  @Patch(":locationId/capacity")
  capacity(@Param("locationId") locationId: string, @Body() body: { adminUserId?: string; capacity?: number; note?: string }) {
    return this.warehouse.updateCapacity(locationId, body);
  }

  @Post("move-item")
  moveItem(@Body() body: { adminUserId?: string; inventoryItemId?: string; locationId?: string; note?: string }) {
    return this.warehouse.moveInventoryItem(body);
  }
}

@Controller("operations/inventory-overview")
export class OperationsInventoryOverviewController {
  constructor(private readonly warehouse: OperationsWarehouseService) {}

  @Get()
  overview(
    @Query("adminUserId") adminUserId?: string,
    @Query("category") category?: string,
    @Query("gender") gender?: string,
    @Query("size") size?: string,
    @Query("condition") condition?: string,
    @Query("published") published?: "published" | "unpublished",
    @Query("inventoryStatus") inventoryStatus?: InventoryItemStatus
  ) {
    return this.warehouse.inventoryOverview({
      adminUserId,
      category,
      gender,
      size,
      condition,
      published,
      inventoryStatus
    });
  }
}

function optionalNumber(value?: string) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
