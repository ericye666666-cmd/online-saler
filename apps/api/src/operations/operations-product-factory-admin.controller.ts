import { OperationsRequestIdentity } from "./operations-request-identity";
import { Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import type { ProductTaxonomyGroup } from "../product/product-taxonomy";
import { OperationsProductFactoryAdminService } from "./operations-product-factory-admin.service";

type TaxonomyCreateBody = { adminUserId?: string; group?: ProductTaxonomyGroup; code?: string; displayName?: string; parentCode?: string; sortOrder?: number };
type TaxonomyPatchBody = { adminUserId?: string; displayName?: string; parentCode?: string | null; sortOrder?: number; active?: boolean };

@Controller("operations/product-factory-admin")
export class OperationsProductFactoryAdminController {
  constructor(private readonly service: OperationsProductFactoryAdminService, private readonly identity: OperationsRequestIdentity) {}

  @Get("taxonomy")
  async taxonomy(@Headers("authorization") authorization?: string) { return this.service.taxonomy(await this.identity.adminId(authorization)); }

  @Post("taxonomy/options")
  async createOption(@Headers("authorization") authorization: string | undefined, @Body() body: TaxonomyCreateBody) { return this.service.createOption(await this.identity.adminInput(authorization, body)); }

  @Patch("taxonomy/:group/:code")
  async updateOption(@Headers("authorization") authorization: string | undefined, @Param("group") group: ProductTaxonomyGroup, @Param("code") code: string, @Body() body: TaxonomyPatchBody) {
    return this.service.updateOption(group, code, await this.identity.adminInput(authorization, body));
  }

  @Get("configuration")
  async configuration(@Headers("authorization") authorization?: string) { return this.service.configuration(await this.identity.adminId(authorization)); }
}
