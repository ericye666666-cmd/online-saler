import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { FulfillmentExceptionReason } from "@online-saler/database";
import { OperationsFulfillmentService, type FulfillmentQueueKey, type OrderQueueKey } from "./operations-fulfillment.service";

type EmployeeBody = {
  employeeId?: string;
  adminUserId?: string;
  note?: string;
};

type ScanBody = EmployeeBody & {
  barcode?: string;
};

type PackBody = EmployeeBody & {
  packingStatus?: string;
};

type PickupBody = EmployeeBody & {
  verification?: string;
};

type DeliveryBody = EmployeeBody & {
  riderName?: string;
  riderPhone?: string;
};

type ExceptionBody = EmployeeBody & {
  reason?: FulfillmentExceptionReason;
};

@Controller("operations/fulfillment")
export class OperationsFulfillmentController {
  constructor(private readonly fulfillment: OperationsFulfillmentService) {}

  @Get("summary")
  summary(@Query("adminUserId") adminUserId?: string) {
    return this.fulfillment.summary(adminUserId);
  }

  @Get("tasks")
  tasks(
    @Query("queue") queue?: FulfillmentQueueKey,
    @Query("search") search?: string,
    @Query("adminUserId") adminUserId?: string
  ) {
    return this.fulfillment.listFulfillmentTasks({ queue, search, adminUserId });
  }

  @Get("orders")
  orders(@Query("queue") queue?: OrderQueueKey, @Query("search") search?: string, @Query("adminUserId") adminUserId?: string) {
    return this.fulfillment.listOrders({ queue, search, adminUserId });
  }

  @Get("inventory")
  inventory(@Query("search") search?: string, @Query("adminUserId") adminUserId?: string) {
    return this.fulfillment.searchInventory({ search, adminUserId });
  }

  @Post("orders/:orderId/start-picking")
  startPicking(@Param("orderId") orderId: string, @Body() body: EmployeeBody) {
    return this.fulfillment.startPicking(orderId, body);
  }

  @Post("orders/:orderId/confirm-picked")
  confirmPicked(@Param("orderId") orderId: string, @Body() body: ScanBody) {
    return this.fulfillment.confirmPicked(orderId, body);
  }

  @Post("orders/:orderId/pack")
  pack(@Param("orderId") orderId: string, @Body() body: PackBody) {
    return this.fulfillment.pack(orderId, body);
  }

  @Post("orders/:orderId/ready-for-pickup")
  readyForPickup(@Param("orderId") orderId: string, @Body() body: EmployeeBody) {
    return this.fulfillment.readyForPickup(orderId, body);
  }

  @Post("orders/:orderId/confirm-pickup")
  confirmPickup(@Param("orderId") orderId: string, @Body() body: PickupBody) {
    return this.fulfillment.confirmPickup(orderId, body);
  }

  @Post("orders/:orderId/assign-delivery")
  assignDelivery(@Param("orderId") orderId: string, @Body() body: DeliveryBody) {
    return this.fulfillment.assignDelivery(orderId, body);
  }

  @Post("orders/:orderId/complete-delivery")
  completeDelivery(@Param("orderId") orderId: string, @Body() body: EmployeeBody) {
    return this.fulfillment.completeDelivery(orderId, body);
  }

  @Post("orders/:orderId/exception")
  markException(@Param("orderId") orderId: string, @Body() body: ExceptionBody) {
    return this.fulfillment.markException(orderId, body);
  }
}
