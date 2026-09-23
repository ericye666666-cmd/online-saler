import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import {
  CustomerServiceCaseStatus,
  CustomerServiceCaseType,
  CustomerServiceEscalationTarget,
  CustomerServiceIssueType,
  CustomerServicePriority
} from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsCustomerServiceDeskService } from "./operations-customer-service-desk.service";
import { OperationsCustomerServiceService, type CustomerServiceQueueKey } from "./operations-customer-service.service";

type CreateCaseBody = {
  adminUserId?: string;
  customerId?: string;
  orderId?: string;
  issueType?: CustomerServiceIssueType;
  caseType?: CustomerServiceCaseType;
  priority?: CustomerServicePriority;
  assignedAdminUserId?: string;
  title?: string;
  description?: string;
  tags?: string[] | string;
};

type AssignCaseBody = {
  adminUserId?: string;
  assignedAdminUserId?: string | null;
  note?: string;
};

type EscalateCaseBody = {
  adminUserId?: string;
  escalatedTo?: CustomerServiceEscalationTarget;
  escalated?: boolean;
  note?: string;
};

type ContactBody = {
  adminUserId?: string;
  customerId?: string;
  phone?: string;
  whatsappPhone?: string;
  defaultAddress?: string;
  orderId?: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  reason?: string;
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
  caseType?: CustomerServiceCaseType;
  priority?: CustomerServicePriority;
  title?: string;
  description?: string | null;
  tags?: string[] | string;
};

@Controller("operations/customer-service")
export class OperationsCustomerServiceController {
  constructor(
    private readonly customerService: OperationsCustomerServiceService,
    private readonly desk: OperationsCustomerServiceDeskService,
    private readonly access: OperationsAccessService
  ) {}

  @Get("summary")
  async summary(@Headers("authorization") authorization?: string) {
    return this.customerService.summary(await this.access.requireAccessToken(authorization));
  }

  /** The dashboard: what is outstanding and what happened today. */
  @Get("dashboard")
  async dashboard(@Headers("authorization") authorization?: string) {
    return this.desk.dashboard(await this.access.requireAccessToken(authorization));
  }

  /** One box: phone, order number or name. */
  @Get("search")
  async search(@Headers("authorization") authorization: string | undefined, @Query("search") search?: string) {
    return this.desk.search({ search, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Get("orders/:orderId/overview")
  async order360(@Headers("authorization") authorization: string | undefined, @Param("orderId") orderId: string) {
    return this.desk.order360(orderId, await this.access.requireAccessToken(authorization));
  }

  @Get("order-number/:orderNumber/overview")
  async order360ByNumber(@Headers("authorization") authorization: string | undefined, @Param("orderNumber") orderNumber: string) {
    return this.desk.order360ByNumber(orderNumber, await this.access.requireAccessToken(authorization));
  }

  @Get("case-options")
  async caseOptions(@Headers("authorization") authorization?: string) {
    return this.customerService.caseOptions(await this.access.requireAccessToken(authorization));
  }

  @Get("assignees")
  async assignees(@Headers("authorization") authorization?: string) {
    return this.customerService.assignees(await this.access.requireAccessToken(authorization));
  }

  @Get("cases/:caseId")
  async caseDetail(@Headers("authorization") authorization: string | undefined, @Param("caseId") caseId: string) {
    return this.customerService.caseDetail(caseId, await this.access.requireAccessToken(authorization));
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
    @Query("caseType") caseType?: CustomerServiceCaseType,
    @Query("priority") priority?: CustomerServicePriority,
    @Query("assignedAdminUserId") assignedAdminUserId?: string,
    @Query("escalatedTo") escalatedTo?: CustomerServiceEscalationTarget,
    @Query("overdue") overdue?: string,
    @Query("unassigned") unassigned?: string,
    @Query("search") search?: string
  ) {
    return this.customerService.listCases({
      queue, issueType, status, caseType, priority, assignedAdminUserId, escalatedTo, overdue, unassigned, search,
      adminUserId: await this.access.requireAccessToken(authorization)
    });
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

  @Post("cases/:caseId/assign")
  async assignCase(@Headers("authorization") authorization: string | undefined, @Param("caseId") caseId: string, @Body() body: AssignCaseBody) {
    return this.customerService.assignCase(caseId, await this.authorizedInput(authorization, body));
  }

  @Post("cases/:caseId/escalate")
  async escalateCase(@Headers("authorization") authorization: string | undefined, @Param("caseId") caseId: string, @Body() body: EscalateCaseBody) {
    return this.customerService.escalateCase(caseId, await this.authorizedInput(authorization, body));
  }

  @Patch("contact")
  async updateContact(@Headers("authorization") authorization: string | undefined, @Body() body: ContactBody) {
    return this.customerService.updateCustomerContact(await this.authorizedInput(authorization, body));
  }

  private async authorizedInput<T extends { adminUserId?: string }>(authorization: string | undefined, input: T): Promise<T> {
    return { ...input, adminUserId: await this.access.requireAccessToken(authorization) };
  }
}
