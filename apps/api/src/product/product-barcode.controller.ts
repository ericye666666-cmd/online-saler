import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { OperationsRequestIdentity } from "../operations/operations-request-identity";
import { ProductBarcodeService } from "./product-barcode.service";

interface GenerateBarcodeBody {
  employeeId: string;
  adminUserId?: string;
}

@Controller("products")
export class ProductBarcodeController {
  constructor(private readonly service: ProductBarcodeService, private readonly identity: OperationsRequestIdentity) {}

  @Post(":id/barcode")
  async generate(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: GenerateBarcodeBody) {
    const actor = await this.identity.employeePermission(authorization, "action.product.edit");
    return this.service.generate(id, actor.employeeId);
  }

  @Get("barcode/:barcode")
  async getByBarcode(@Headers("authorization") authorization: string | undefined, @Param("barcode") barcode: string) {
    await this.identity.permission(authorization, "page.product.digitalization");
    return this.service.getByBarcode(barcode);
  }
}
