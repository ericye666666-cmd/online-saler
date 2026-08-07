import { Body, Controller, Param, Post } from "@nestjs/common";
import { requireAdminPermission } from "../operations/operations-access-check";
import {
  ProductCalibrationService,
  type CalibrateProductInput
} from "./product-calibration.service";

@Controller("products")
export class ProductCalibrationController {
  constructor(private readonly service: ProductCalibrationService) {}

  @Post(":id/calibrate")
  async calibrate(@Param("id") id: string, @Body() body: CalibrateProductInput & { adminUserId?: string }) {
    await requireAdminPermission(body.adminUserId, "action.product.edit");
    return this.service.calibrate(id, body);
  }
}
