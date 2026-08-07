import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
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
import { OperationsWarehouseService } from "./operations-warehouse.service";

@Controller("operations/orders")
export class OperationsFulfillmentController {
  constructor(private readonly orders: OperationsFulfillmentService) {}

  @Get("summary")
  summary(@Query() query: OrderCenterListInput) {
    return this.orders.summary(query);
  }

  @Get("employees")
  employees(@Query("adminUserId") adminUserId?: string) {
    return this.orders.employees(adminUserId);
  }

  @Get()
  list(@Query() query: OrderCenterListInput) {
    return this.orders.listOrders(query);
  }

  @Get(":orderId")
  detail(@Param("orderId") orderId: string, @Query("adminUserId") adminUserId?: string) {
    return this.orders.orderDetail(orderId, adminUserId);
  }

  @Post(":orderId/assign-picker")
  assignPicker(@Param("orderId") orderId: string, @Body() body: EmployeeInput) {
    return this.orders.assignPicker(orderId, body);
  }

  @Post(":orderId/claim-picking")
  claimPicking(@Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.claimPicking(orderId, body);
  }

  @Post(":orderId/items/:orderItemId/scan")
  scanItem(@Param("orderId") orderId: string, @Param("orderItemId") orderItemId: string, @Body() body: ScanInput) {
    return this.orders.scanItem(orderId, orderItemId, body);
  }

  @Post(":orderId/start-packing")
  startPacking(@Param("orderId") orderId: string, @Body() body: EmployeeInput) {
    return this.orders.startPacking(orderId, body);
  }

  @Post(":orderId/complete-packing")
  completePacking(@Param("orderId") orderId: string, @Body() body: PackingInput) {
    return this.orders.completePacking(orderId, body);
  }

  @Post(":orderId/ready-for-pickup")
  readyForPickup(@Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.readyForPickup(orderId, body);
  }

  @Post(":orderId/ready-for-dispatch")
  readyForDispatch(@Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.readyForDispatch(orderId, body);
  }

  @Post(":orderId/assign-rider")
  assignRider(@Param("orderId") orderId: string, @Body() body: RiderInput) {
    return this.orders.assignRider(orderId, body);
  }

  @Post(":orderId/dispatch")
  dispatch(@Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.dispatch(orderId, body);
  }

  @Post(":orderId/confirm-pickup")
  confirmPickup(@Param("orderId") orderId: string, @Body() body: PickupInput) {
    return this.orders.confirmPickup(orderId, body);
  }

  @Post(":orderId/complete-delivery")
  completeDelivery(@Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.completeDelivery(orderId, body);
  }

  @Post(":orderId/exception")
  exception(@Param("orderId") orderId: string, @Body() body: ExceptionInput) {
    return this.orders.markException(orderId, body);
  }

  @Post(":orderId/cancel")
  cancel(@Param("orderId") orderId: string, @Body() body: AdminInput) {
    return this.orders.cancel(orderId, body);
  }

  @Post(":orderId/assign-after-sale")
  assignAfterSale(@Param("orderId") orderId: string, @Body() body: AfterSaleInput) {
    return this.orders.assignAfterSale(orderId, body);
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
