import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { OperationsRequestIdentity } from "../operations/operations-request-identity";
import {
  ProductCalibrationService,
  type CalibrateProductInput
} from "./product-calibration.service";

@Controller("products")
export class ProductCalibrationController {
  constructor(private readonly service: ProductCalibrationService, private readonly identity: OperationsRequestIdentity) {}

  @Post(":id/calibrate")
  async calibrate(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: CalibrateProductInput & { adminUserId?: string }) {
    const actor = await this.identity.employeePermission(authorization, "action.product.edit");
    return this.service.calibrate(id, { ...body, ...actor });
  }
}
