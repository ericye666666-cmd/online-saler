import { OperationsRequestIdentity } from "./operations-request-identity";
import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
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

@Controller("operations/product-control")
export class OperationsProductControlController {
  constructor(private readonly productControl: OperationsProductControlService, private readonly identity: OperationsRequestIdentity) {}

  @Get("summary")
  async summary(@Headers("authorization") authorization?: string) {
    return this.productControl.summary(await this.identity.adminId(authorization));
  }

  @Get("products")
  async products(@Query("status") status?: ProductStatus, @Headers("authorization") authorization?: string) {
    return this.productControl.list(status, await this.identity.adminId(authorization));
  }

  @Get("locations")
  async locations(@Headers("authorization") authorization?: string) {
    return this.productControl.locations(await this.identity.adminId(authorization));
  }

  @Patch("products/:id/price")
  async setPrice(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: PriceBody) {
    return this.productControl.setPrice(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/prepare-storage")
  async prepareStorage(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.prepareForStorage(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/location-hint")
  async locationHint(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.assignRandomLocation(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/confirm-placed")
  async confirmPlaced(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.confirmPlaced(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/publish")
  async publish(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: EmployeeBody) {
    return this.productControl.publish(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/unpublish")
  async unpublish(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: UnpublishBody) {
    return this.productControl.unpublish(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("labels/printed")
  async markPrinted(@Headers("authorization") authorization: string | undefined, @Body() body: PrintedBody) {
    return this.productControl.markLabelsPrinted(await this.identity.employeeInput(authorization, body));
  }
}
