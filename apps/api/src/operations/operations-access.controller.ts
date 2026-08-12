import { Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
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
  session(@Headers("authorization") authorization?: string) {
    return this.access.sessionFromAccessToken(authorization);
  }

  @Get("accounts")
  async accounts(@Headers("authorization") authorization?: string) {
    return this.access.accounts(await this.access.requireAccessToken(authorization));
  }

  @Post("accounts")
  async createAccount(@Headers("authorization") authorization: string | undefined, @Body() body: CreateAdminUserBody) {
    return this.access.createAdminUser(await this.access.requireAccessToken(authorization), body);
  }

  @Patch("accounts/:id/status")
  async updateAccountStatus(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminUserStatusBody) {
    return this.access.updateAdminUserStatus(await this.access.requireAccessToken(authorization), id, body);
  }

  @Patch("accounts/:id/roles")
  async updateAccountRoles(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: AdminUserRolesBody) {
    return this.access.updateAdminUserRoles(await this.access.requireAccessToken(authorization), id, body);
  }

  @Get("roles")
  async roles(@Headers("authorization") authorization?: string) {
    return this.access.roles(await this.access.requireAccessToken(authorization));
  }

  @Post("roles")
  async createRole(@Headers("authorization") authorization: string | undefined, @Body() body: RoleBody) {
    return this.access.createRole(await this.access.requireAccessToken(authorization), body);
  }

  @Patch("roles/:id")
  async updateRole(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: RoleBody) {
    return this.access.updateRole(await this.access.requireAccessToken(authorization), id, body);
  }

  @Get("permissions")
  async permissions(@Headers("authorization") authorization?: string) {
    return this.access.permissions(await this.access.requireAccessToken(authorization));
  }
}
