import { OperationsRequestIdentity } from "./operations-request-identity";
import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { ProductBatchStatus, ProductStatus, ReviewResult } from "@online-saler/database";
import { OperationsProductBatchService } from "./operations-product-batch.service";

type AdminEmployeeBody = {
  adminUserId?: string;
  employeeId?: string;
};

type CreateBatchBody = AdminEmployeeBody & {
  targetCount?: number;
  note?: string;
  intakeCategory?: "SHOES" | null;
};

type ReviewBody = AdminEmployeeBody & {
  result?: ReviewResult;
  reason?: string;
};

type RetakeBody = AdminEmployeeBody & {
  reason?: string;
};

@Controller("operations/product-batches")
export class OperationsProductBatchController {
  constructor(private readonly batches: OperationsProductBatchService, private readonly identity: OperationsRequestIdentity) {}

  @Get("summary")
  async summary(@Headers("authorization") authorization?: string, @Query("employeeId") employeeId?: string) {
    return this.batches.summary(await this.identity.adminId(authorization), employeeId);
  }

  @Get()
  async list(
    @Headers("authorization") authorization?: string,
    @Query("employeeId") employeeId?: string,
    @Query("status") status?: ProductBatchStatus
  ) {
    return this.batches.listBatches({ adminUserId: await this.identity.adminId(authorization), employeeId, status });
  }

  @Post()
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: CreateBatchBody) {
    return this.batches.createBatch(await this.identity.employeeInput(authorization, body));
  }

  @Get("products")
  async products(
    @Headers("authorization") authorization?: string,
    @Query("queue") queue?: Parameters<OperationsProductBatchService["listProducts"]>[0]["queue"],
    @Query("status") status?: ProductStatus,
    @Query("search") search?: string,
    @Query("batchId") batchId?: string,
    @Query("category") category?: string,
    @Query("employeeId") employeeId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("includeTestData") includeTestData?: string
  ) {
    return this.batches.listProducts({
      adminUserId: await this.identity.adminId(authorization),
      queue,
      status,
      search,
      batchId,
      category,
      employeeId,
      dateFrom,
      dateTo,
      includeTestData: includeTestData === "true"
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Headers("authorization") authorization?: string) {
    return this.batches.batchDetail(id, await this.identity.adminId(authorization));
  }

  @Post(":id/run-ai")
  async runAi(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.runBatchAi(id, await this.identity.employeeInput(authorization, body));
  }

  @Post(":id/generate-barcodes")
  async generateBarcodes(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.generateBatchBarcodes(id, await this.identity.employeeInput(authorization, body));
  }

  @Post(":id/mark-labels-printed")
  async markLabelsPrinted(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.markBatchPrinted(id, await this.identity.employeeInput(authorization, body));
  }

  @Post(":id/stock-in")
  async stockIn(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.stockInBatch(id, await this.identity.employeeInput(authorization, body));
  }

  @Post(":id/prepare-storage")
  async prepareStorage(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.prepareBatchStorage(id, await this.identity.employeeInput(authorization, body));
  }

  @Post(":id/publish")
  async publish(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.publishBatch(id, await this.identity.employeeInput(authorization, body));
  }

  @Post(":id/complete-and-publish")
  async completeAndPublish(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.completeAndPublishBatch(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/review")
  async reviewProduct(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: ReviewBody) {
    return this.batches.reviewProduct(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/recalibration")
  async recalibration(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: RetakeBody) {
    return this.batches.markProductForRecalibration(id, await this.identity.employeeInput(authorization, body));
  }

  @Post("products/:id/retake")
  async retakeProduct(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: RetakeBody) {
    return this.batches.markProductForRetake(id, await this.identity.employeeInput(authorization, body));
  }
}
