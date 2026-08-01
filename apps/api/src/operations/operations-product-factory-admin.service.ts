import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ActorType, Prisma, SourceApp, prisma } from "@online-saler/database";
import {
  PRODUCT_TAXONOMY_GROUPS,
  PRODUCT_TAXONOMY_SETTING_KEY,
  loadProductTaxonomy,
  normalizeTaxonomyCode,
  type ProductTaxonomyDocument,
  type ProductTaxonomyGroup,
  type ProductTaxonomyOption
} from "../product/product-taxonomy";
import { OperationsAccessService } from "./operations-access.service";

const PRODUCT_CONTROL_PAGE = "page.product.control";
const PRODUCT_EDIT_ACTION = "action.product.edit";

@Injectable()
export class OperationsProductFactoryAdminService {
  constructor(private readonly access: OperationsAccessService) {}

  async taxonomy(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_CONTROL_PAGE);
    const document = await loadProductTaxonomy();
    const usage = await taxonomyUsageCounts();
    return {
      version: document.version,
      source: PRODUCT_TAXONOMY_SETTING_KEY,
      sharedBy: ["OpenAI recognition", "Operations calibration", "Storefront product filters"],
      groups: Object.fromEntries(PRODUCT_TAXONOMY_GROUPS.map((group) => [group, document.groups[group].map((option) => ({ ...option, productCount: usage[group].get(option.code) ?? 0 }))]))
    };
  }

  async createOption(input: { adminUserId?: string; group?: ProductTaxonomyGroup; code?: string; displayName?: string; parentCode?: string; sortOrder?: number }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const group = requireGroup(input.group);
    const code = normalizeTaxonomyCode(input.code ?? "");
    const displayName = input.displayName?.trim();
    if (!code || !displayName) throw new BadRequestException("Code and display name are required.");
    const document = await loadProductTaxonomy();
    if (document.groups[group].some((option) => option.code === code)) throw new BadRequestException("Taxonomy code already exists in this group.");
    const next: ProductTaxonomyOption = {
      code,
      displayName,
      parentCode: group === "SUBCATEGORY" ? normalizeTaxonomyCode(input.parentCode ?? "") || null : null,
      sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : document.groups[group].length,
      active: true
    };
    document.groups[group].push(next);
    await this.save(document, input.adminUserId, "PRODUCT_TAXONOMY_OPTION_CREATED", null, next);
    return this.taxonomy(input.adminUserId);
  }

  async updateOption(groupInput: ProductTaxonomyGroup, codeInput: string, input: { adminUserId?: string; displayName?: string; parentCode?: string | null; sortOrder?: number; active?: boolean }) {
    await this.access.requirePermission(input.adminUserId, PRODUCT_EDIT_ACTION);
    const group = requireGroup(groupInput);
    const code = normalizeTaxonomyCode(codeInput);
    const document = await loadProductTaxonomy();
    const option = document.groups[group].find((candidate) => candidate.code === code);
    if (!option) throw new NotFoundException("Taxonomy option not found.");
    const before = { ...option };
    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (!displayName) throw new BadRequestException("Display name cannot be empty.");
      option.displayName = displayName;
    }
    if (input.sortOrder !== undefined) {
      if (!Number.isFinite(input.sortOrder)) throw new BadRequestException("Sort order must be a number.");
      option.sortOrder = Number(input.sortOrder);
    }
    if (input.active !== undefined) option.active = input.active;
    if (group === "SUBCATEGORY" && input.parentCode !== undefined) option.parentCode = input.parentCode ? normalizeTaxonomyCode(input.parentCode) : null;
    await this.save(document, input.adminUserId, "PRODUCT_TAXONOMY_OPTION_UPDATED", before, option);
    return this.taxonomy(input.adminUserId);
  }

  async configuration(adminUserId?: string) {
    await this.access.requirePermission(adminUserId, PRODUCT_CONTROL_PAGE);
    const checks = productFactoryConfigurationChecks();
    return { checks, configured: checks.filter((item) => item.status === "CONFIGURED").length, total: checks.length };
  }

  private async save(document: ProductTaxonomyDocument, adminUserId: string | undefined, action: string, before: unknown, after: unknown) {
    await prisma.$transaction([
      prisma.systemSetting.upsert({
        where: { key: PRODUCT_TAXONOMY_SETTING_KEY },
        create: { key: PRODUCT_TAXONOMY_SETTING_KEY, valueJson: document as unknown as Prisma.InputJsonValue },
        update: { valueJson: document as unknown as Prisma.InputJsonValue }
      }),
      prisma.auditLog.create({
        data: {
          actorType: ActorType.EMPLOYEE,
          actorId: adminUserId ?? "unknown",
          sourceApp: SourceApp.OPERATIONS,
          module: "PRODUCT_FACTORY",
          entityType: "SystemSetting",
          entityId: PRODUCT_TAXONOMY_SETTING_KEY,
          action,
          beforeJson: before === null ? Prisma.JsonNull : before as Prisma.InputJsonValue,
          afterJson: after as Prisma.InputJsonValue
        }
      })
    ]);
  }
}

function requireGroup(value?: ProductTaxonomyGroup): ProductTaxonomyGroup {
  if (!value || !PRODUCT_TAXONOMY_GROUPS.includes(value)) throw new BadRequestException("Taxonomy group is not valid.");
  return value;
}

async function taxonomyUsageCounts(): Promise<Record<ProductTaxonomyGroup, Map<string, number>>> {
  const [categories, subcategories, colors, sizes, conditions, defects] = await Promise.all([
    prisma.product.groupBy({ by: ["category"], where: { category: { not: null } }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["subcategory"], where: { subcategory: { not: null } }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["color"], where: { color: { not: null } }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["finalSizeLabel"], where: { finalSizeLabel: { not: null } }, _count: { _all: true } }),
    prisma.product.groupBy({ by: ["conditionGrade"], where: { conditionGrade: { not: null } }, _count: { _all: true } }),
    prisma.productDefect.groupBy({ by: ["defectType"], _count: { _all: true } })
  ]);
  return {
    CATEGORY: countMap(categories, "category"), SUBCATEGORY: countMap(subcategories, "subcategory"), COLOR: countMap(colors, "color"), SIZE: countMap(sizes, "finalSizeLabel"), CONDITION: countMap(conditions, "conditionGrade"), DEFECT: countMap(defects, "defectType")
  };
}

function countMap(rows: Array<Record<string, unknown>>, key: string) {
  return new Map(rows.map((row) => [String(row[key]), Number((row._count as { _all?: number })?._all ?? 0)]));
}

function check(key: string, label: string, ok: boolean, secret: boolean, guidance: string, value?: string) {
  return { key, label, status: ok ? "CONFIGURED" : "MISSING", secret, guidance, value: secret ? null : value?.trim() || null };
}

function validThreshold(value?: string) {
  if (!value?.trim()) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1;
}

export function productFactoryConfigurationChecks(env: NodeJS.ProcessEnv = process.env) {
  return [
    check("OPENAI_API_KEY", "OpenAI API Key", Boolean(env.OPENAI_API_KEY?.trim()), true, "在 GitHub Environment staging 配置 OPENAI_API_KEY_STAGING。"),
    check("OPENAI_VISION_MODEL", "OpenAI 视觉模型", Boolean(env.OPENAI_VISION_MODEL?.trim()), false, "部署工作流应设置 OPENAI_VISION_MODEL。", env.OPENAI_VISION_MODEL),
    check("PRODUCT_IMAGE_BUCKET", "商品原图 Storage Bucket", Boolean(env.PRODUCT_IMAGE_BUCKET?.trim()), false, "部署工作流应设置 PRODUCT_IMAGE_BUCKET。", env.PRODUCT_IMAGE_BUCKET),
    check("BACKGROUND_REMOVAL_PROVIDER", "抠图自动路由", env.BACKGROUND_REMOVAL_PROVIDER === "auto", false, "将 BACKGROUND_REMOVAL_PROVIDER 设为 auto。", env.BACKGROUND_REMOVAL_PROVIDER),
    check("LIGHTWEIGHT_CUTOUT_SERVICE_URL", "lightweight OpenCV 服务", Boolean(env.LIGHTWEIGHT_CUTOUT_SERVICE_URL?.trim()), false, "重新运行 Deploy API to Staging。"),
    check("REMBG_BIREFNET_SERVICE_URL", "rembg + BiRefNet 服务", Boolean(env.REMBG_BIREFNET_SERVICE_URL?.trim()), false, "重新运行 Deploy API to Staging。"),
    check("BACKGROUND_REMOVAL_MIN_QUALITY_SCORE", "自动回退质量阈值", validThreshold(env.BACKGROUND_REMOVAL_MIN_QUALITY_SCORE), false, "设置 0 到 1 之间的质量阈值。", env.BACKGROUND_REMOVAL_MIN_QUALITY_SCORE ?? "0.75"),
    {
      key: "OPERATIONS_API_CHANNEL",
      label: "Operations API 通道",
      status: "CONFIGURED",
      secret: false,
      guidance: "Operations 通过同源 /api-proxy 访问 API，无需浏览器跨域配置。",
      value: "/api-proxy"
    },
    { key: "PRINT_AGENT", label: "Deli 打印代理", status: "CLIENT_CHECK", secret: false, guidance: "本项由浏览器检查员工电脑的 http://127.0.0.1:8719。", value: null },
    { key: "BATCH_SIZE", label: "固定批次大小", status: "CONFIGURED", secret: false, guidance: "第一阶段固定为 10 件。", value: "10" }
  ];
}
