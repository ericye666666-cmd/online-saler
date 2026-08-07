import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { ProductTaxonomyGroup } from "../product/product-taxonomy";
import { OperationsProductFactoryAdminService } from "./operations-product-factory-admin.service";

type TaxonomyCreateBody = { adminUserId?: string; group?: ProductTaxonomyGroup; code?: string; displayName?: string; parentCode?: string; sortOrder?: number };
type TaxonomyPatchBody = { adminUserId?: string; displayName?: string; parentCode?: string | null; sortOrder?: number; active?: boolean };

@Controller("operations/product-factory-admin")
export class OperationsProductFactoryAdminController {
  constructor(private readonly service: OperationsProductFactoryAdminService) {}

  @Get("taxonomy")
  taxonomy(@Query("adminUserId") adminUserId?: string) { return this.service.taxonomy(adminUserId); }

  @Post("taxonomy/options")
  createOption(@Body() body: TaxonomyCreateBody) { return this.service.createOption(body); }

  @Patch("taxonomy/:group/:code")
  updateOption(@Param("group") group: ProductTaxonomyGroup, @Param("code") code: string, @Body() body: TaxonomyPatchBody) {
    return this.service.updateOption(group, code, body);
  }

  @Get("configuration")
  configuration(@Query("adminUserId") adminUserId?: string) { return this.service.configuration(adminUserId); }
}
