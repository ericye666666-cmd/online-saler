import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ProductStatus } from "@online-saler/database";
import { OperationsProductControlService } from "./operations-product-control.service";

type EmployeeBody = {
  employeeId?: string;
  adminUserId?: string;
};

type PriceBody = EmployeeBody & {
  priceKsh?: number;
};

type PrintedBody = EmployeeBody & {
  productIds?: string[];
};

type UnpublishBody = EmployeeBody & {
  reason?: string;
};

type ConfirmPlacedAtLocationBody = EmployeeBody & {
  locationCode?: string;
};

@Controller("operations/product-control")
export class OperationsProductControlController {
  constructor(private readonly productControl: OperationsProductControlService) {}

  @Get("summary")
  summary(@Query("adminUserId") adminUserId?: string) {
    return this.productControl.summary(adminUserId);
  }

  @Get("products")
  products(@Query("status") status?: ProductStatus, @Query("adminUserId") adminUserId?: string) {
    return this.productControl.list(status, adminUserId);
  }

  @Get("locations")
  locations(@Query("adminUserId") adminUserId?: string) {
    return this.productControl.locations(adminUserId);
  }

  @Patch("products/:id/price")
  setPrice(@Param("id") id: string, @Body() body: PriceBody) {
    return this.productControl.setPrice(id, body);
  }

  @Post("products/:id/prepare-storage")
  prepareStorage(@Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.prepareForStorage(id, body);
  }

  @Post("products/:id/location-hint")
  locationHint(@Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.assignRandomLocation(id, body);
  }

  @Post("products/:id/confirm-placed")
  confirmPlaced(@Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.confirmPlaced(id, body);
  }

  @Post("products/:id/confirm-placed-at-location")
  confirmPlacedAtLocation(@Param("id") id: string, @Body() body: ConfirmPlacedAtLocationBody) {
    return this.productControl.confirmPlacedAtLocation(id, body);
  }

  @Post("products/:id/publish")
  publish(@Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.publish(id, body);
  }

  @Post("products/:id/unpublish")
  unpublish(@Param("id") id: string, @Body() body: UnpublishBody) {
    return this.productControl.unpublish(id, body);
  }

  @Post("labels/printed")
  markPrinted(@Body() body: PrintedBody) {
    return this.productControl.markLabelsPrinted(body);
  }
}
