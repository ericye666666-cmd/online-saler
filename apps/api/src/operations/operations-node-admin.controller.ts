import { Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import { NotificationStatus, prisma } from "@online-saler/database";
import { nextNotificationAttemptAt } from "@online-saler/business-rules";
import { OperationsAccessService } from "./operations-access.service";
import { OperationsNodeAdminService, type NodeInput, type NodeStaffInput } from "./operations-node-admin.service";

@Controller("operations/nodes")
export class OperationsNodeAdminController {
  constructor(
    private readonly nodes: OperationsNodeAdminService,
    private readonly access: OperationsAccessService
  ) {}

  @Get()
  async list(@Headers("authorization") authorization?: string) {
    return this.nodes.list(await this.access.requireAccessToken(authorization));
  }

  @Get("staff")
  async staff(@Headers("authorization") authorization?: string) {
    return this.nodes.staff(await this.access.requireAccessToken(authorization));
  }

  @Post()
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: NodeInput) {
    return this.nodes.create({ ...body, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Patch(":nodeId")
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("nodeId") nodeId: string,
    @Body() body: NodeInput
  ) {
    return this.nodes.update(nodeId, { ...body, adminUserId: await this.access.requireAccessToken(authorization) });
  }

  @Post("staff")
  async assignStaff(@Headers("authorization") authorization: string | undefined, @Body() body: NodeStaffInput) {
    return this.nodes.assignStaff({ ...body, adminUserId: await this.access.requireAccessToken(authorization) });
  }
}

/**
 * The outbox, so a queue that stops moving — a missing SMS credential, a
 * rejected number — is visible instead of looking like silence.
 */
@Controller("operations/notifications")
export class OperationsNotificationsController {
  constructor(private readonly access: OperationsAccessService) {}

  @Get()
  async list(@Headers("authorization") authorization?: string) {
    await this.access.requirePermission(await this.access.requireAccessToken(authorization), "notifications.view");
    const [rows, counts] = await Promise.all([
      prisma.notification.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { order: { select: { orderNumber: true } }, fulfillmentNode: { select: { name: true } } }
      }),
      prisma.notification.groupBy({ by: ["status"], _count: true })
    ]);
    return {
      counts: Object.fromEntries(counts.map((row) => [row.status, row._count])),
      notifications: rows.map((row) => ({
        id: row.id,
        topic: row.topic,
        audience: row.audience,
        channel: row.channel,
        status: row.status,
        recipientPhone: row.recipientPhone,
        recipientLabel: row.recipientLabel,
        body: row.body,
        attempts: row.attempts,
        nextAttemptAt: row.nextAttemptAt,
        lastError: row.lastError,
        provider: row.provider,
        sentAt: row.sentAt,
        createdAt: row.createdAt,
        orderNumber: row.order?.orderNumber ?? null,
        nodeName: row.fulfillmentNode?.name ?? null
      }))
    };
  }

  @Post(":notificationId/retry")
  async retry(@Headers("authorization") authorization: string | undefined, @Param("notificationId") notificationId: string) {
    await this.access.requirePermission(await this.access.requireAccessToken(authorization), "notifications.retry");
    await prisma.notification.updateMany({
      where: { id: notificationId, status: NotificationStatus.FAILED },
      data: { status: NotificationStatus.PENDING, attempts: 0, nextAttemptAt: nextNotificationAttemptAt(0), lastError: null }
    });
    return { ok: true };
  }

  @Post(":notificationId/cancel")
  async cancel(@Headers("authorization") authorization: string | undefined, @Param("notificationId") notificationId: string) {
    await this.access.requirePermission(await this.access.requireAccessToken(authorization), "notifications.retry");
    await prisma.notification.updateMany({
      where: { id: notificationId, status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] } },
      data: { status: NotificationStatus.CANCELLED, cancelledAt: new Date() }
    });
    return { ok: true };
  }
}
