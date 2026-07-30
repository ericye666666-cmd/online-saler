import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { requireAdminPermission } from "../operations/operations-access-check";
import { ProductBarcodeService } from "./product-barcode.service";

interface GenerateBarcodeBody {
  employeeId: string;
  adminUserId?: string;
}

@Controller("products")
export class ProductBarcodeController {
  constructor(private readonly service: ProductBarcodeService) {}

  @Post(":id/barcode")
  async generate(@Param("id") id: string, @Body() body: GenerateBarcodeBody) {
    await requireAdminPermission(body.adminUserId, "action.product.edit");
    return this.service.generate(id, body.employeeId);
  }

  @Get("barcode/:barcode")
  getByBarcode(@Param("barcode") barcode: string) {
    return this.service.getByBarcode(barcode);
  }
}
