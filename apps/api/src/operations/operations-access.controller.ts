import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AdminUserStatus } from "@online-saler/database";
import { OperationsAccessService } from "./operations-access.service";

type LoginBody = {
  login?: string;
  password?: string;
};

type CreateAdminUserBody = {
  requesterAdminUserId?: string;
  name?: string;
  email?: string;
  loginAccount?: string;
  phone?: string;
  initialPassword?: string;
  roleCodes?: string[];
};

type AdminUserStatusBody = {
  requesterAdminUserId?: string;
  status?: AdminUserStatus;
};

type AdminUserRolesBody = {
  requesterAdminUserId?: string;
  roleCodes?: string[];
};

type RoleBody = {
  requesterAdminUserId?: string;
  code?: string;
  name?: string;
  description?: string;
  permissionCodes?: string[];
};

@Controller("operations/access")
export class OperationsAccessController {
  constructor(private readonly access: OperationsAccessService) {}

  @Post("login")
  login(@Body() body: LoginBody) {
    return this.access.login(body);
  }

  @Get("session")
  session(@Query("adminUserId") adminUserId?: string) {
    return this.access.session(adminUserId);
  }

  @Get("accounts")
  accounts(@Query("adminUserId") adminUserId?: string) {
    return this.access.accounts(adminUserId);
  }

  @Post("accounts")
  createAccount(@Body() body: CreateAdminUserBody) {
    return this.access.createAdminUser(body.requesterAdminUserId, body);
  }

  @Patch("accounts/:id/status")
  updateAccountStatus(@Param("id") id: string, @Body() body: AdminUserStatusBody) {
    return this.access.updateAdminUserStatus(body.requesterAdminUserId, id, body);
  }

  @Patch("accounts/:id/roles")
  updateAccountRoles(@Param("id") id: string, @Body() body: AdminUserRolesBody) {
    return this.access.updateAdminUserRoles(body.requesterAdminUserId, id, body);
  }

  @Get("roles")
  roles(@Query("adminUserId") adminUserId?: string) {
    return this.access.roles(adminUserId);
  }

  @Post("roles")
  createRole(@Body() body: RoleBody) {
    return this.access.createRole(body.requesterAdminUserId, body);
  }

  @Patch("roles/:id")
  updateRole(@Param("id") id: string, @Body() body: RoleBody) {
    return this.access.updateRole(body.requesterAdminUserId, id, body);
  }

  @Get("permissions")
  permissions(@Query("adminUserId") adminUserId?: string) {
    return this.access.permissions(adminUserId);
  }
}
