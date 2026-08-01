import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ProductStatus, ReviewResult } from "@online-saler/database";
import { OperationsProductBatchService } from "./operations-product-batch.service";

type AdminEmployeeBody = {
  adminUserId?: string;
  employeeId?: string;
};

type CreateBatchBody = AdminEmployeeBody & {
  targetCount?: number;
  note?: string;
};

type ReviewBody = AdminEmployeeBody & {
  result?: ReviewResult;
  reason?: string;
};

@Controller("operations/product-batches")
export class OperationsProductBatchController {
  constructor(private readonly batches: OperationsProductBatchService) {}

  @Get("summary")
  summary(@Query("adminUserId") adminUserId?: string, @Query("employeeId") employeeId?: string) {
    return this.batches.summary(adminUserId, employeeId);
  }

  @Post()
  create(@Body() body: CreateBatchBody) {
    return this.batches.createBatch(body);
  }

  @Get("products")
  products(
    @Query("adminUserId") adminUserId?: string,
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
      adminUserId,
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
  detail(@Param("id") id: string, @Query("adminUserId") adminUserId?: string) {
    return this.batches.batchDetail(id, adminUserId);
  }

  @Post(":id/run-ai")
  runAi(@Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.runBatchAi(id, body);
  }

  @Post(":id/generate-barcodes")
  generateBarcodes(@Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.generateBatchBarcodes(id, body);
  }

  @Post(":id/mark-labels-printed")
  markLabelsPrinted(@Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.markBatchPrinted(id, body);
  }

  @Post(":id/stock-in")
  stockIn(@Param("id") id: string, @Body() body: AdminEmployeeBody) {
    return this.batches.stockInBatch(id, body);
  }

  @Post("products/:id/review")
  reviewProduct(@Param("id") id: string, @Body() body: ReviewBody) {
    return this.batches.reviewProduct(id, body);
  }
}
