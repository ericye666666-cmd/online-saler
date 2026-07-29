import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ProductBarcodeService } from "./product-barcode.service";

interface GenerateBarcodeBody {
  employeeId: string;
}

@Controller("products")
export class ProductBarcodeController {
  constructor(private readonly service: ProductBarcodeService) {}

  @Post(":id/barcode")
  generate(@Param("id") id: string, @Body() body: GenerateBarcodeBody) {
    return this.service.generate(id, body.employeeId);
  }

  @Get("barcode/:barcode")
  getByBarcode(@Param("barcode") barcode: string) {
    return this.service.getByBarcode(barcode);
  }
}
