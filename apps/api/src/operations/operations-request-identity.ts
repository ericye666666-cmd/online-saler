import { ForbiddenException, Injectable } from "@nestjs/common";
import { EmployeeStatus, prisma } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";

@Injectable()
export class OperationsRequestIdentity {
  constructor(private readonly access: OperationsAccessService) {}

  adminId(authorization?: string) {
    return this.access.requireAccessToken(authorization);
  }

  async permission(authorization: string | undefined, permissionCode: string) {
    return this.access.requirePermission(await this.adminId(authorization), permissionCode);
  }

  async adminInput<T>(authorization: string | undefined, input: T): Promise<T & { adminUserId: string }> {
    return { ...input, adminUserId: await this.adminId(authorization) };
  }

  async employeeInput<T>(authorization: string | undefined, input: T) {
    const session = await this.access.sessionFromAccessToken(authorization);
    return { ...input, ...await this.employeeActor(session) };
  }

  async employeePermission(authorization: string | undefined, permissionCode: string) {
    const session = await this.permission(authorization, permissionCode);
    return this.employeeActor(session);
  }

  private async employeeActor(session: {
    adminUser: { id: string; linkedEmployeeId: string | null } | null;
  }): Promise<{ adminUserId: string; employeeId: string }> {
    const employeeId = session.adminUser?.linkedEmployeeId;
    const employee = employeeId
      ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, status: true } })
      : null;
    if (!session.adminUser || !employee || employee.status !== EmployeeStatus.ACTIVE) {
      throw new ForbiddenException("Ask an administrator to link this account to an active employee before recording product work.");
    }
    return { adminUserId: session.adminUser.id, employeeId: employee.id };
  }
}
