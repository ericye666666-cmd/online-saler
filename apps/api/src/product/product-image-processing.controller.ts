import { BadRequestException, Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import {
  isImageProcessingOperation,
  type RetryImageProcessingRequest,
  type SelectProductMainImageRequest,
  type StartImageProcessingRequest
} from "@online-saler/shared-types";
import { ADMIN_USER_HEADER, requireAdminPermission } from "../operations/operations-access-check";
import { ProductImageProcessingService } from "./product-image-processing.service";

@Controller()
export class ProductImageProcessingController {
  constructor(private readonly imageProcessing: ProductImageProcessingService) {}

  @Post("products/:productId/images/:imageId/processing-jobs")
  async start(
    @Param("productId") productId: string,
    @Param("imageId") imageId: string,
    @Body() body: StartImageProcessingRequest,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    if (!body?.operation || !isImageProcessingOperation(body.operation)) {
      throw new BadRequestException("A supported operation is required");
    }

    return this.imageProcessing.start({
      productId,
      sourceImageId: imageId,
      operation: body.operation
    });
  }

  @Get("products/:productId/image-comparison")
  async comparison(
    @Param("productId") productId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "page.product.digitalization");
    return this.imageProcessing.getComparison(productId);
  }

  @Post("products/:productId/main-image")
  async selectMainImage(
    @Param("productId") productId: string,
    @Body() body: SelectProductMainImageRequest,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    if (!body?.imageId?.trim()) throw new BadRequestException("imageId is required");
    return this.imageProcessing.selectMainImage({ productId, imageId: body.imageId.trim() });
  }

  @Post("image-processing-jobs/:jobId/retry")
  async retry(
    @Param("jobId") jobId: string,
    @Body() body: RetryImageProcessingRequest,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    return this.imageProcessing.retry({ jobId, reason: body?.reason });
  }
}
