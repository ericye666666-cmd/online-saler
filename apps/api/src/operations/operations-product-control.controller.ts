import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ProductStatus } from "@online-saler/database";
import { OperationsProductControlService } from "./operations-product-control.service";

type EmployeeBody = {
  employeeId?: string;
};

type PriceBody = EmployeeBody & {
  priceKsh?: number;
};

type PrintedBody = EmployeeBody & {
  productIds?: string[];
};

@Controller("operations/product-control")
export class OperationsProductControlController {
  constructor(private readonly productControl: OperationsProductControlService) {}

  @Get("summary")
  summary() {
    return this.productControl.summary();
  }

  @Get("products")
  products(@Query("status") status?: ProductStatus) {
    return this.productControl.list(status);
  }

  @Get("locations")
  locations() {
    return this.productControl.locations();
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

  @Post("labels/printed")
  markPrinted(@Body() body: PrintedBody) {
    return this.productControl.markLabelsPrinted(body);
  }
}
