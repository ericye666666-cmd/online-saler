import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CustomerServiceCaseStatus, CustomerServiceIssueType } from "@online-saler/database";
import { OperationsCustomerServiceService, type CustomerServiceQueueKey } from "./operations-customer-service.service";

type CreateCaseBody = {
  adminUserId?: string;
  customerId?: string;
  orderId?: string;
  issueType?: CustomerServiceIssueType;
  title?: string;
  description?: string;
  tags?: string[] | string;
};

type CreateNoteBody = {
  adminUserId?: string;
  caseId?: string;
  customerId?: string;
  orderId?: string;
  body?: string;
  tags?: string[] | string;
};

type UpdateCaseBody = {
  adminUserId?: string;
  status?: CustomerServiceCaseStatus;
  title?: string;
  description?: string | null;
  tags?: string[] | string;
};

@Controller("operations/customer-service")
export class OperationsCustomerServiceController {
  constructor(private readonly customerService: OperationsCustomerServiceService) {}

  @Get("summary")
  summary(@Query("adminUserId") adminUserId?: string) {
    return this.customerService.summary(adminUserId);
  }

  @Get("customers")
  customers(@Query("search") search?: string, @Query("adminUserId") adminUserId?: string) {
    return this.customerService.searchCustomers({ search, adminUserId });
  }

  @Get("orders")
  orders(
    @Query("queue") queue?: CustomerServiceQueueKey,
    @Query("search") search?: string,
    @Query("adminUserId") adminUserId?: string
  ) {
    return this.customerService.searchOrders({ queue, search, adminUserId });
  }

  @Get("cases")
  cases(
    @Query("queue") queue?: CustomerServiceQueueKey,
    @Query("issueType") issueType?: CustomerServiceIssueType,
    @Query("status") status?: CustomerServiceCaseStatus,
    @Query("search") search?: string,
    @Query("adminUserId") adminUserId?: string
  ) {
    return this.customerService.listCases({ queue, issueType, status, search, adminUserId });
  }

  @Get("notes")
  notes(@Query("search") search?: string, @Query("adminUserId") adminUserId?: string) {
    return this.customerService.listNotes({ search, adminUserId });
  }

  @Post("cases")
  createCase(@Body() body: CreateCaseBody) {
    return this.customerService.createCase(body);
  }

  @Patch("cases/:caseId")
  updateCase(@Param("caseId") caseId: string, @Body() body: UpdateCaseBody) {
    return this.customerService.updateCase(caseId, body);
  }

  @Post("notes")
  createNote(@Body() body: CreateNoteBody) {
    return this.customerService.createNote(body);
  }
}
