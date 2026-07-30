import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AdminUserStatus, prisma } from "@online-saler/database";

export const ADMIN_USER_HEADER = "x-admin-user-id";

export async function requireAdminPermission(adminUserId: string | undefined, permissionCode: string) {
  const id = adminUserId?.trim();
  if (!id) {
    throw new UnauthorizedException("Admin user session is required.");
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { id },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true }
              }
            }
          }
        }
      }
    }
  });

  if (!adminUser || adminUser.status !== AdminUserStatus.ACTIVE) {
    throw new UnauthorizedException("Admin user session is not active.");
  }

  const permissions = new Set(
    adminUser.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.code))
  );
  if (!permissions.has(permissionCode)) {
    throw new ForbiddenException("This admin account does not have permission for this operation.");
  }

  return adminUser;
}
