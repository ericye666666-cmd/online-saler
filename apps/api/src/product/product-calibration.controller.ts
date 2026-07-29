import { Body, Controller, Param, Post } from "@nestjs/common";
import {
  ProductCalibrationService,
  type CalibrateProductInput
} from "./product-calibration.service";

@Controller("products")
export class ProductCalibrationController {
  constructor(private readonly service: ProductCalibrationService) {}

  @Post(":id/calibrate")
  calibrate(@Param("id") id: string, @Body() body: CalibrateProductInput) {
    return this.service.calibrate(id, body);
  }
}
