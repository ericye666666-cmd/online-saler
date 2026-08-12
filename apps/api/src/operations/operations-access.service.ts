import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  AdminUserStatus,
  PermissionScope,
  prisma,
  type AdminUser,
  type Employee,
  type Permission,
  type Role
} from "@online-saler/database";
import {
  OPERATIONS_PERMISSIONS,
  OPERATIONS_ROLE_BLUEPRINTS,
  STAGING_SUPER_ADMIN,
  bearerOperationsAccessToken,
  hashPassword,
  issueOperationsAccessToken,
  normalizeLogin,
  operationsAccessTokenSubject,
  uniquePermissionCodes,
  verifyOperationsAccessToken,
  verifyPassword
} from "./operations-access-policy";

type AdminUserWithAccess = AdminUser & {
  linkedEmployee: Employee | null;
  roles: Array<{
    role: Role & {
      permissions: Array<{
        permission: Permission;
      }>;
    };
  }>;
};

type CreateAdminUserInput = {
  name?: string;
  email?: string;
  loginAccount?: string;
  phone?: string;
  initialPassword?: string;
  roleCodes?: string[];
};

type UpdateAdminUserStatusInput = {
  status?: AdminUserStatus;
};

type UpdateAdminUserRolesInput = {
  roleCodes?: string[];
};

type UpsertRoleInput = {
  code?: string;
  name?: string;
  description?: string;
  permissionCodes?: string[];
};

@Injectable()
export class OperationsAccessService {
  async bootstrap() {
    for (const permission of OPERATIONS_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        update: {
          module: permission.module,
          scope: permission.scope as PermissionScope,
          page: permission.page,
          action: permission.action,
          description: permission.description
        },
        create: {
          code: permission.code,
          module: permission.module,
          scope: permission.scope as PermissionScope,
          page: permission.page,
          action: permission.action,
          description: permission.description
        }
      });
    }

    for (const role of OPERATIONS_ROLE_BLUEPRINTS) {
      const savedRole = await prisma.role.upsert({
        where: { code: role.code },
        update: {
          name: role.name,
          description: role.description
        },
        create: {
          code: role.code,
          name: role.name,
          description: role.description
        }
      });

      await this.replaceRolePermissions(savedRole.id, role.permissions);
    }

    const linkedEmployee = await prisma.employee.upsert({
      where: { employeeCode: STAGING_SUPER_ADMIN.linkedEmployee.employeeCode },
      update: {
        name: STAGING_SUPER_ADMIN.linkedEmployee.name,
        status: STAGING_SUPER_ADMIN.linkedEmployee.status
      },
      create: STAGING_SUPER_ADMIN.linkedEmployee
    });

    const adminUser = await prisma.adminUser.upsert({
      where: { loginAccount: STAGING_SUPER_ADMIN.loginAccount },
      update: {
        name: STAGING_SUPER_ADMIN.name,
        email: STAGING_SUPER_ADMIN.email,
        phone: STAGING_SUPER_ADMIN.phone,
        status: STAGING_SUPER_ADMIN.status,
        linkedEmployeeId: linkedEmployee.id
      },
      create: {
        id: STAGING_SUPER_ADMIN.id,
        name: STAGING_SUPER_ADMIN.name,
        email: STAGING_SUPER_ADMIN.email,
        loginAccount: STAGING_SUPER_ADMIN.loginAccount,
        phone: STAGING_SUPER_ADMIN.phone,
        passwordHash: hashPassword(process.env.OPERATIONS_SUPER_ADMIN_PASSWORD || STAGING_SUPER_ADMIN.defaultPassword),
        status: STAGING_SUPER_ADMIN.status,
        linkedEmployeeId: linkedEmployee.id
      }
    });

    const superRole = await prisma.role.findUnique({ where: { code: STAGING_SUPER_ADMIN.roleCode } });
    if (superRole) {
      await prisma.userRole.upsert({
        where: {
          adminUserId_roleId: {
            adminUserId: adminUser.id,
            roleId: superRole.id
          }
        },
        update: {},
        create: {
          adminUserId: adminUser.id,
          roleId: superRole.id
        }
      });
    }

    return { adminUserId: adminUser.id, loginAccount: adminUser.loginAccount, roleCode: STAGING_SUPER_ADMIN.roleCode };
  }

  async login(input: { login?: string; password?: string }) {
    await this.bootstrap();
    const login = normalizeLogin(input.login ?? "");
    if (!login || !input.password) {
      throw new BadRequestException("Login and password are required.");
    }

    const adminUser = await prisma.adminUser.findFirst({
      where: {
        OR: [{ loginAccount: login }, { email: login }]
      },
      include: this.accessInclude()
    });
    if (!adminUser || !verifyPassword(input.password, adminUser.passwordHash)) {
      throw new UnauthorizedException("Login or password is not valid.");
    }
    if (adminUser.status !== AdminUserStatus.ACTIVE) {
      throw new ForbiddenException("This admin account is not active.");
    }

    const updated = await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { lastLoginAt: new Date() },
      include: this.accessInclude()
    });

    return {
      ...this.serializeAdminUser(updated),
      ...issueOperationsAccessToken(updated.id, updated.passwordHash!)
    };
  }

  async sessionFromAccessToken(authorization?: string) {
    const { accessToken, adminUser, expiresAt } = await this.authenticatedAdminUser(authorization);
    return {
      ...this.serializeAdminUser(adminUser),
      accessToken,
      accessTokenExpiresAt: expiresAt.toISOString()
    };
  }

  async requireAccessToken(authorization?: string) {
    const { adminUser } = await this.authenticatedAdminUser(authorization);
    return adminUser.id;
  }

  async session(adminUserId?: string) {
    const id = adminUserId?.trim();
    if (!id) return this.emptySession();

    const adminUser = await this.findAdminUserWithAccess({ id });
    if (!adminUser || adminUser.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException("Admin session is not valid.");
    }

    return this.serializeAdminUser(adminUser);
  }

  async accounts(requesterAdminUserId?: string) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-users");
    const adminUsers = await prisma.adminUser.findMany({
      include: this.accessInclude(),
      orderBy: [{ status: "asc" }, { name: "asc" }]
    });
    return adminUsers.map((adminUser) => this.serializeAdminUser(adminUser));
  }

  async roles(requesterAdminUserId?: string) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-roles");
    return this.listRoles();
  }

  async permissions(requesterAdminUserId?: string) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-roles");
    return prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { scope: "asc" }, { code: "asc" }]
    });
  }

  async createAdminUser(requesterAdminUserId: string | undefined, input: CreateAdminUserInput) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-users");
    const name = input.name?.trim();
    const loginAccount = normalizeLogin(input.loginAccount ?? input.email ?? "");
    const email = input.email ? normalizeLogin(input.email) : null;
    const phone = input.phone?.trim() || null;
    if (!name || !loginAccount) {
      throw new BadRequestException("Name and login account are required.");
    }

    const created = await prisma.adminUser.create({
      data: {
        name,
        loginAccount,
        email,
        phone,
        passwordHash: input.initialPassword ? hashPassword(input.initialPassword) : null,
        status: AdminUserStatus.ACTIVE
      },
      include: this.accessInclude()
    });

    await this.replaceUserRoles(created.id, input.roleCodes ?? []);
    return this.session(created.id);
  }

  async updateAdminUserStatus(requesterAdminUserId: string | undefined, adminUserId: string, input: UpdateAdminUserStatusInput) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-users");
    if (!input.status || !Object.values(AdminUserStatus).includes(input.status)) {
      throw new BadRequestException("Admin user status is not valid.");
    }
    const now = new Date();
    const updated = await prisma.adminUser.update({
      where: { id: adminUserId },
      data: {
        status: input.status,
        disabledAt: input.status === AdminUserStatus.DISABLED ? now : null,
        lockedAt: input.status === AdminUserStatus.LOCKED ? now : null
      },
      include: this.accessInclude()
    });
    return this.serializeAdminUser(updated);
  }

  async updateAdminUserRoles(requesterAdminUserId: string | undefined, adminUserId: string, input: UpdateAdminUserRolesInput) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-users");
    await this.replaceUserRoles(adminUserId, input.roleCodes ?? []);
    return this.session(adminUserId);
  }

  async createRole(requesterAdminUserId: string | undefined, input: UpsertRoleInput) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-roles");
    const code = normalizeRoleCode(input.code ?? "");
    if (!code || !input.name?.trim()) {
      throw new BadRequestException("Role code and name are required.");
    }
    const role = await prisma.role.create({
      data: {
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null
      }
    });
    await this.replaceRolePermissions(role.id, input.permissionCodes ?? []);
    return this.listRoles();
  }

  async updateRole(requesterAdminUserId: string | undefined, roleId: string, input: UpsertRoleInput) {
    await this.requirePermission(requesterAdminUserId, "action.system.manage-roles");
    const role = await prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name?.trim(),
        description: input.description?.trim() || null
      }
    });
    if (input.permissionCodes) {
      await this.replaceRolePermissions(role.id, input.permissionCodes);
    }
    return this.listRoles();
  }

  async requirePermission(adminUserId: string | undefined, permissionCode: string) {
    const session = await this.session(adminUserId);
    if (!session.adminUser || !session.permissions.includes(permissionCode)) {
      throw new ForbiddenException("This admin account does not have permission for this operation.");
    }
    return session;
  }

  private async listRoles() {
    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { code: "asc" } }
        }
      },
      orderBy: { code: "asc" }
    });
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map(({ permission }) => this.serializePermission(permission))
    }));
  }

  private async replaceUserRoles(adminUserId: string, roleCodes: string[]) {
    const codes = uniquePermissionCodes(roleCodes.map(normalizeRoleCode));
    const roles = codes.length ? await prisma.role.findMany({ where: { code: { in: codes } } }) : [];
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { adminUserId } }),
      ...roles.map((role) =>
        prisma.userRole.create({
          data: {
            adminUserId,
            roleId: role.id
          }
        })
      )
    ]);
  }

  private async replaceRolePermissions(roleId: string, permissionCodes: string[]) {
    const codes = uniquePermissionCodes(permissionCodes);
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId } }),
      ...permissions.map((permission) =>
        prisma.rolePermission.create({
          data: {
            roleId,
            permissionId: permission.id
          }
        })
      )
    ]);
  }

  private async findAdminUserWithAccess(where: { id?: string; loginAccount?: string }) {
    return prisma.adminUser.findFirst({
      where,
      include: this.accessInclude()
    });
  }

  private async authenticatedAdminUser(authorization?: string) {
    const accessToken = bearerOperationsAccessToken(authorization);
    const adminUserId = accessToken ? operationsAccessTokenSubject(accessToken) : null;
    if (!accessToken || !adminUserId) {
      throw new UnauthorizedException("Employee session token is required.");
    }

    const adminUser = await this.findAdminUserWithAccess({ id: adminUserId });
    const payload = adminUser?.passwordHash
      ? verifyOperationsAccessToken(accessToken, adminUser.passwordHash)
      : null;
    if (!adminUser || adminUser.status !== AdminUserStatus.ACTIVE || !payload || payload.sub !== adminUser.id) {
      throw new UnauthorizedException("Employee session token is invalid or expired.");
    }

    return {
      accessToken,
      adminUser,
      expiresAt: new Date(payload.exp * 1000)
    };
  }

  private accessInclude() {
    return {
      linkedEmployee: true,
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
                orderBy: { permission: { code: "asc" } }
              }
            }
          }
        },
        orderBy: { role: { code: "asc" } }
      }
    } as const;
  }

  private serializeAdminUser(adminUser: AdminUserWithAccess) {
    const roles = adminUser.roles.map(({ role }) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map(({ permission }) => this.serializePermission(permission))
    }));
    const permissions = uniquePermissionCodes(roles.flatMap((role) => role.permissions.map((permission) => permission.code)));

    return {
      adminUser: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        loginAccount: adminUser.loginAccount,
        phone: adminUser.phone,
        status: adminUser.status,
        linkedEmployeeId: adminUser.linkedEmployeeId,
        linkedEmployee: adminUser.linkedEmployee
          ? {
              id: adminUser.linkedEmployee.id,
              employeeCode: adminUser.linkedEmployee.employeeCode,
              name: adminUser.linkedEmployee.name
            }
          : null,
        lastLoginAt: adminUser.lastLoginAt?.toISOString() ?? null
      },
      roles,
      permissions
    };
  }

  private serializePermission(permission: Permission) {
    return {
      id: permission.id,
      code: permission.code,
      module: permission.module,
      scope: permission.scope,
      page: permission.page,
      action: permission.action,
      description: permission.description
    };
  }

  private emptySession() {
    return {
      adminUser: null,
      roles: [],
      permissions: []
    };
  }
}

function normalizeRoleCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
