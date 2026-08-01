import { BadRequestException, Controller, Get, Headers, Param, Post, Res } from "@nestjs/common";
import { prisma } from "@online-saler/database";
import { ADMIN_USER_HEADER, requireAdminPermission } from "../operations/operations-access-check";
import { ProductDetailGenerationService } from "./product-detail-generation.service";
import { ProductDetailGenerationRunnerService } from "./product-detail-generation-runner.service";
import { ProductDetailAssetService } from "./product-detail-asset.service";
import { ProductImageStorageService } from "./product-image-storage.service";

@Controller()
export class ProductDetailGenerationController {
  constructor(
    private readonly details: ProductDetailGenerationService,
    private readonly runner: ProductDetailGenerationRunnerService,
    private readonly assets: ProductDetailAssetService,
    private readonly storage: ProductImageStorageService
  ) {}

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
    await this.details.ensureBatchGenerationJobs(batchId);
    return this.runner.runBatch(batchId);
  }

  @Post("product-detail-profiles/:profileId/assets/generate")
  async generateAssets(
    @Param("profileId") profileId: string,
    @Headers(ADMIN_USER_HEADER) adminUserId?: string
  ) {
    await requireAdminPermission(adminUserId, "action.product.edit");
    return this.assets.generateForProfile(profileId);
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
