import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { CustomerServiceCaseStatus, CustomerServiceIssueType } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
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
  constructor(
    private readonly customerService: OperationsCustomerServiceService,
    private readonly access: OperationsAccessService
  ) {}

  @Get("summary")
  async summary(@Headers("authorization") authorization?: string) {
    return this.customerService.summary(await this.access.requireAccessToken(authorization));
  }

  @Get("customers")
  async customers(@Headers("authorization") authorization: string | undefined, @Query("search") search?: string) {
    return this.customerService.searchCustomers({ search, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Get("orders")
  async orders(
    @Headers("authorization") authorization: string | undefined,
    @Query("queue") queue?: CustomerServiceQueueKey,
    @Query("search") search?: string
  ) {
    return this.customerService.searchOrders({ queue, search, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Get("cases")
  async cases(
    @Headers("authorization") authorization: string | undefined,
    @Query("queue") queue?: CustomerServiceQueueKey,
    @Query("issueType") issueType?: CustomerServiceIssueType,
    @Query("status") status?: CustomerServiceCaseStatus,
    @Query("search") search?: string
  ) {
    return this.customerService.listCases({ queue, issueType, status, search, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Get("notes")
  async notes(@Headers("authorization") authorization: string | undefined, @Query("search") search?: string) {
    return this.customerService.listNotes({ search, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Post("cases")
  async createCase(@Headers("authorization") authorization: string | undefined, @Body() body: CreateCaseBody) {
    return this.customerService.createCase(await this.authorizedInput(authorization, body));
  }

  @Patch("cases/:caseId")
  async updateCase(@Headers("authorization") authorization: string | undefined, @Param("caseId") caseId: string, @Body() body: UpdateCaseBody) {
    return this.customerService.updateCase(caseId, await this.authorizedInput(authorization, body));
  }

  @Post("notes")
  async createNote(@Headers("authorization") authorization: string | undefined, @Body() body: CreateNoteBody) {
    return this.customerService.createNote(await this.authorizedInput(authorization, body));
  }

  private async authorizedInput<T extends { adminUserId?: string }>(authorization: string | undefined, input: T): Promise<T> {
    return { ...input, adminUserId: await this.access.requireAccessToken(authorization) };
  }
}
