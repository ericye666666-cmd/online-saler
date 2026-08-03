import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { ProductDetailStatus, prisma } from "@online-saler/database";
import { ADMIN_USER_HEADER, requireAdminPermission } from "../operations/operations-access-check";
import { ProductDetailGenerationService } from "./product-detail-generation.service";
import { ProductDetailGenerationRunnerService } from "./product-detail-generation-runner.service";
import { ProductDetailAssetService } from "./product-detail-asset.service";
import { ProductImageStorageService } from "./product-image-storage.service";
import { ProductImageProcessingService } from "./product-image-processing.service";

@Controller()
export class ProductDetailGenerationController {
  constructor(
    private readonly details: ProductDetailGenerationService,
    private readonly runner: ProductDetailGenerationRunnerService,
    private readonly assets: ProductDetailAssetService,
    private readonly storage: ProductImageStorageService,
    private readonly imageProcessing: ProductImageProcessingService
  ) {}

  @Get("operations/product-detail-generation")
  async generationBatches(
    @Headers(ADMIN_USER_HEADER) adminUserId?: string,
    @Query("batchId") batchId?: string
  ) {
    await requireAdminPermission(adminUserId, "page.product.details");
    return this.details.listDetailGenerationBatches(batchId);
  }

  @Get("product-detail-profiles/:profileId")
  async profileDetail(
    @Param("profileId") profileId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "page.product.details");
    return this.details.getProfileDetail(profileId);
  }

  @Get("products/:productId/detail-profile")
  async productDetail(
    @Param("productId") productId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "page.product.digitalization");
    return this.details.getProductDetail(productId);
  }

  @Get("operations/product-batches/:batchId/detail-generation")
  async batchDetail(
    @Param("batchId") batchId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "page.product.digitalization");
    return this.details.getBatchDetailStatus(batchId);
  }

  @Post("operations/product-batches/:batchId/detail-generation-jobs")
  async createBatchJobs(
    @Param("batchId") batchId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    return this.details.ensureBatchGenerationJobs(batchId);
  }

  @Post("product-detail-generation-jobs/:jobId/retry")
  async retry(
    @Param("jobId") jobId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    return this.details.retryJob(jobId);
  }

  @Post("product-detail-generation-jobs/:jobId/run")
  async run(
    @Param("jobId") jobId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    return this.runner.run(jobId);
  }

  @Post("operations/product-batches/:batchId/detail-generation/run")
  async runBatch(
    @Param("batchId") batchId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    const setup = await this.details.ensureBatchGenerationJobs(batchId);
    if (!setup.ready) {
      throw new BadRequestException("Complete calibration for every product in the batch before generating details");
    }
    return this.runner.runBatch(batchId);
  }

  @Post("operations/product-batches/:batchId/detail-generation/retry-failed")
  async retryFailedBatch(
    @Param("batchId") batchId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    await this.details.resetBatchJobs(batchId, [ProductDetailStatus.FAILED]);
    return this.runner.runBatch(batchId);
  }

  @Post("operations/product-batches/:batchId/detail-generation/regenerate-outdated")
  async regenerateOutdatedBatch(
    @Param("batchId") batchId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    await this.details.resetBatchJobs(batchId, [ProductDetailStatus.OUTDATED]);
    return this.runner.runBatch(batchId);
  }

  @Post("operations/product-batches/:batchId/detail-generation/approve")
  async approveBatch(
    @Param("batchId") batchId: string,
    @Body() body: { employeeId?: string },
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.approve");
    return this.details.approveBatch(batchId, body.employeeId);
  }

  @Patch("product-detail-profiles/:profileId/copy")
  async updateCopy(
    @Param("profileId") profileId: string,
    @Body() body: unknown,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    const profile = await this.details.updateCopy(profileId, body);
    const generatedAssets = await this.assets.generateForProfile(profileId);
    return { profile, assets: generatedAssets };
  }

  @Post("product-detail-profiles/:profileId/recalculate-fit")
  async recalculateFit(
    @Param("profileId") profileId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    const profile = await this.details.recalculateFit(profileId);
    const generatedAssets = await this.assets.generateForProfile(profileId);
    return { profile, assets: generatedAssets };
  }

  @Post("product-detail-profiles/:profileId/regenerate-openai")
  async regenerateOpenAi(
    @Param("profileId") profileId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    const jobId = await this.details.resetOpenAiGeneration(profileId);
    return this.runner.run(jobId);
  }

  @Post("product-detail-profiles/:profileId/approve")
  async approveProfile(
    @Param("profileId") profileId: string,
    @Body() body: { employeeId?: string },
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.approve");
    return this.details.approveProfile(profileId, body.employeeId);
  }

  @Post("product-detail-profiles/:profileId/assets/generate")
  async generateAssets(
    @Param("profileId") profileId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    return this.assets.generateForProfile(profileId);
  }

  @Post("product-detail-profiles/:profileId/main-image")
  async selectProfileMainImage(
    @Param("profileId") profileId: string,
    @Body() body: { imageId?: string },
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    const imageId = body.imageId?.trim();
    if (!imageId) throw new BadRequestException("imageId is required");

    const profile = await this.details.prepareMainImageChange(profileId);
    const comparison = await this.imageProcessing.selectMainImage(
      { productId: profile.productId, imageId },
      { recordDetailSourceChange: false }
    );
    const generatedAssets = await this.assets.generateForProfile(profileId);
    return { comparison, assets: generatedAssets };
  }

  @Get("product-detail-assets/:assetId/content")
  async assetContent(@Param("assetId") assetId: string, @Res() response: any) {
    const asset = await prisma.productDetailAsset.findUnique({ where: { id: assetId } });
    const prefix = `gs://${this.storage.bucket}/`;
    if (!asset?.storageUrl?.startsWith(prefix)) {
      throw new BadRequestException("Stored product detail asset was not found");
    }
    const stored = await this.storage.download(asset.storageUrl.slice(prefix.length));
    response.setHeader("Content-Type", asset.mimeType ?? stored.contentType);
    response.setHeader("Cache-Control", "private, max-age=3600");
    return response.send(Buffer.from(stored.body));
  }
}
