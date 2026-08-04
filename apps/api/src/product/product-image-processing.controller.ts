import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { prisma } from "@online-saler/database";
import {
  isBackgroundRemovalMode,
  isImageProcessingOperation,
  type RunImageProcessingRequest,
  type RetryImageProcessingRequest,
  type SelectProductMainImageRequest,
  type StartImageProcessingRequest
} from "@online-saler/shared-types";
import { ADMIN_USER_HEADER, requireAdminPermission } from "../operations/operations-access-check";
import { ProductImageJobRunnerService } from "./product-image-job-runner.service";
import { ProductImageProcessingService } from "./product-image-processing.service";
import { ProductImageStorageService } from "./product-image-storage.service";

@Controller()
export class ProductImageProcessingController {
  constructor(
    private readonly imageProcessing: ProductImageProcessingService,
    private readonly jobRunner: ProductImageJobRunnerService,
    private readonly storage: ProductImageStorageService
  ) {}

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

  @Post("image-processing-jobs/:jobId/run")
  async run(
    @Param("jobId") jobId: string,
    @Body() body: RunImageProcessingRequest | undefined,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    if (
      body?.backgroundRemovalMode &&
      !isBackgroundRemovalMode(body.backgroundRemovalMode)
    ) {
      throw new BadRequestException("Unsupported background removal mode");
    }
    return this.jobRunner.run(jobId, body?.backgroundRemovalMode);
  }

  @Get("products/:productId/image-comparison")
  async comparison(
    @Param("productId") productId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "page.product.digitalization");
    return this.imageProcessing.getComparison(productId);
  }

  @Get("products/:productId/image-assets/:assetId/content")
  async assetContent(
    @Param("productId") productId: string,
    @Param("assetId") assetId: string,
    @Res() response: any
  ) {
    const asset = await prisma.productImageVariantAsset.findFirst({
      where: { id: assetId, productId }
    });
    if (!asset?.storageUrl.startsWith(`gs://${this.storage.bucket}/`)) {
      throw new BadRequestException("Stored image asset not found");
    }

    const objectName = asset.storageUrl.slice(`gs://${this.storage.bucket}/`.length);
    const stored = await this.storage.download(objectName);
    response.setHeader("Content-Type", stored.contentType);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.send(Buffer.from(stored.body));
  }

  @Post("products/:productId/main-image")
  async selectMainImage(
    @Param("productId") productId: string,
    @Body() body: SelectProductMainImageRequest,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    if (!body?.imageId?.trim()) throw new BadRequestException("imageId is required");
    return this.imageProcessing.selectMainImage(
      { productId, imageId: body.imageId.trim() },
      { humanConfirmed: body.humanConfirmed !== false }
    );
  }

  @Post("products/:productId/images/:imageId/manual-cutout")
  async saveManualCutout(
    @Param("productId") productId: string,
    @Param("imageId") imageId: string,
    @Req() request: any,
    @Headers("content-type") contentType?: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    if (contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "image/png") {
      throw new BadRequestException("Manual cutout must be uploaded as image/png");
    }
    const body = await readBinaryBody(request, 10 * 1024 * 1024);
    return this.imageProcessing.saveManualCutout({ productId, sourceImageId: imageId, body });
  }

  @Post("products/:productId/images/:imageId/guided-cutout")
  async saveGuidedCutout(
    @Param("productId") productId: string,
    @Param("imageId") imageId: string,
    @Body() body: { points?: unknown },
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    return this.imageProcessing.saveGuidedCutout({
      productId,
      sourceImageId: imageId,
      points: body?.points
    });
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

async function readBinaryBody(request: any, maximumBytes: number): Promise<Buffer> {
  if (Buffer.isBuffer(request.body)) {
    if (!request.body.length || request.body.length > maximumBytes) {
      throw new BadRequestException("Manual cutout must be between 1 byte and 10 MB");
    }
    return request.body;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) {
      throw new BadRequestException("Manual cutout must be between 1 byte and 10 MB");
    }
    chunks.push(buffer);
  }
  if (!size) throw new BadRequestException("Manual cutout image is required");
  return Buffer.concat(chunks);
}
