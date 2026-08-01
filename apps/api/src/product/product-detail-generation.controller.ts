import { Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ADMIN_USER_HEADER, requireAdminPermission } from "../operations/operations-access-check";
import { ProductDetailGenerationService } from "./product-detail-generation.service";
import { ProductDetailGenerationRunnerService } from "./product-detail-generation-runner.service";

@Controller()
export class ProductDetailGenerationController {
  constructor(
    private readonly details: ProductDetailGenerationService,
    private readonly runner: ProductDetailGenerationRunnerService
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
}
