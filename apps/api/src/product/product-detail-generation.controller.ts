import { Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ADMIN_USER_HEADER, requireAdminPermission } from "../operations/operations-access-check";
import { ProductDetailGenerationService } from "./product-detail-generation.service";

@Controller()
export class ProductDetailGenerationController {
  constructor(private readonly details: ProductDetailGenerationService) {}

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
}
