import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AffiliateLinkType, AffiliateStatus } from "@online-saler/database";
import { OperationsAffiliateService, type CommissionQueueKey } from "./operations-affiliate.service";

type AffiliateBody = {
  adminUserId?: string;
  affiliateCode?: string;
  displayName?: string;
  phone?: string;
  email?: string;
  commissionRateBps?: number;
};

type AffiliateUpdateBody = {
  adminUserId?: string;
  status?: AffiliateStatus;
  commissionRateBps?: number | null;
};

type LinkBody = {
  adminUserId?: string;
  affiliateId?: string;
  affiliateCode?: string;
  type?: AffiliateLinkType;
  productId?: string;
  productCode?: string;
  source?: string;
  campaign?: string;
  landingPath?: string;
};

type CommissionActionBody = {
  adminUserId?: string;
  note?: string;
};

@Controller("operations/affiliate")
export class OperationsAffiliateController {
  constructor(private readonly affiliate: OperationsAffiliateService) {}

  @Get("summary")
  summary(@Query("adminUserId") adminUserId?: string) {
    return this.affiliate.summary(adminUserId);
  }

  @Get("affiliates")
  affiliates(@Query("adminUserId") adminUserId?: string) {
    return this.affiliate.listAffiliates(adminUserId);
  }

  @Post("affiliates")
  createAffiliate(@Body() body: AffiliateBody) {
    return this.affiliate.createAffiliate(body);
  }

  @Patch("affiliates/:affiliateId")
  updateAffiliate(@Param("affiliateId") affiliateId: string, @Body() body: AffiliateUpdateBody) {
    return this.affiliate.updateAffiliate(affiliateId, body);
  }

  @Get("links")
  links(@Query("adminUserId") adminUserId?: string) {
    return this.affiliate.listLinks(adminUserId);
  }

  @Post("links")
  createLink(@Body() body: LinkBody) {
    return this.affiliate.createLink(body);
  }

  @Get("clicks")
  clicks(@Query("adminUserId") adminUserId?: string) {
    return this.affiliate.listClicks(adminUserId);
  }

  @Get("attributed-orders")
  attributedOrders(@Query("adminUserId") adminUserId?: string) {
    return this.affiliate.listAttributedOrders(adminUserId);
  }

  @Get("commissions")
  commissions(@Query("queue") queue?: CommissionQueueKey, @Query("adminUserId") adminUserId?: string) {
    return this.affiliate.listCommissions(queue, adminUserId);
  }

  @Post("commissions/:commissionId/confirm")
  confirmCommission(@Param("commissionId") commissionId: string, @Body() body: CommissionActionBody) {
    return this.affiliate.confirmCommission(commissionId, body);
  }

  @Post("commissions/:commissionId/reject")
  rejectCommission(@Param("commissionId") commissionId: string, @Body() body: CommissionActionBody) {
    return this.affiliate.rejectCommission(commissionId, body);
  }

  @Post("commissions/:commissionId/paid")
  markCommissionPaid(@Param("commissionId") commissionId: string, @Body() body: CommissionActionBody) {
    return this.affiliate.markCommissionPaid(commissionId, body);
  }

  @Get("payout-export")
  payoutExport(@Query("adminUserId") adminUserId?: string) {
    return this.affiliate.payoutExport(adminUserId);
  }

  @Get("commission-setting")
  commissionSetting(@Query("adminUserId") adminUserId?: string) {
    return this.affiliate.commissionSetting(adminUserId);
  }
}
