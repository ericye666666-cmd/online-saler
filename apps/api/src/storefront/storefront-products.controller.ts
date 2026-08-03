import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import {
  InventoryItemStatus,
  Prisma,
  ProductDetailStatus,
  ProductGender,
  ProductStatus,
  prisma
} from "@online-saler/database";

type ProductListQuery = {
  category?: string;
  color?: string;
  size?: string;
  audience?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  q?: string;
};

@Controller("public/products")
export class StorefrontProductsController {
  @Get()
  async list(@Query() query: ProductListQuery) {
    const products = await prisma.product.findMany({
      where: productWhere(query),
      include: productInclude(),
      orderBy: productOrder(query.sort),
      take: 60
    });

    return products.map(publicProduct).filter(Boolean);
  }

  @Get("filters")
  async filters() {
    const products = await prisma.product.findMany({
      where: basePublicWhere(),
      select: {
        category: true,
        color: true,
        gender: true,
        finalSizeLabel: true,
        tagSize: true,
        priceKsh: true
      },
      take: 1000
    });

    const prices = products
      .map((product) => product.priceKsh)
      .filter((price): price is number => typeof price === "number" && price > 0);

    return {
      categories: unique(products.map((product) => product.category)),
      colors: unique(products.map((product) => product.color)),
      sizes: unique(products.flatMap((product) => [product.finalSizeLabel, product.tagSize])),
      audiences: unique(products.map((product) => product.gender)),
      price: {
        min: prices.length ? Math.min(...prices) : null,
        max: prices.length ? Math.max(...prices) : null
      },
      total: products.length
    };
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const product = await prisma.product.findFirst({
      where: {
        ...basePublicWhere(),
        id
      },
      include: productInclude()
    });

    if (!product) {
      throw new NotFoundException("Product is not available.");
    }

    const result = publicProduct(product);
    if (!result) throw new NotFoundException("Product details are not approved for publication.");
    return result;
  }
}

function productInclude() {
  return {
    images: {
      orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }]
    },
    measurements: {
      orderBy: { measurementType: "asc" as const }
    },
    defects: {
      orderBy: { createdAt: "asc" as const }
    },
    detailProfiles: {
      where: { status: ProductDetailStatus.APPROVED },
      orderBy: { sourceDataVersion: "desc" as const },
      take: 1,
      include: {
        assets: {
          where: { status: ProductDetailStatus.READY },
          orderBy: { type: "asc" as const }
        }
      }
    }
  };
}

function basePublicWhere(): Prisma.ProductWhereInput {
  return {
    status: ProductStatus.PUBLISHED,
    inventoryItem: {
      is: {
        status: InventoryItemStatus.AVAILABLE
      }
    },
    detailProfiles: {
      some: { status: ProductDetailStatus.APPROVED }
    }
  };
}

function productWhere(query: ProductListQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = basePublicWhere();
  const filters: Prisma.ProductWhereInput[] = [];
  const category = clean(query.category);
  const color = clean(query.color);
  const size = clean(query.size);
  const audience = clean(query.audience);
  const q = clean(query.q);
  const minPrice = positiveInt(query.minPrice);
  const maxPrice = positiveInt(query.maxPrice);

  if (category) where.category = category;
  if (color) where.color = color;
  if (size) filters.push({ OR: [{ finalSizeLabel: size }, { tagSize: size }] });
  if (isProductGender(audience)) where.gender = audience;
  if (minPrice || maxPrice) {
    where.priceKsh = {
      ...(minPrice ? { gte: minPrice } : {}),
      ...(maxPrice ? { lte: maxPrice } : {})
    };
  }
  if (q) {
    filters.push({
      OR: ["title", "brand", "category", "subcategory", "color", "material"].map((field) => ({
        [field]: {
          contains: q,
          mode: "insensitive"
        }
      }))
    } as Prisma.ProductWhereInput);
  }
  if (filters.length) where.AND = filters;

  return where;
}

function productOrder(sort?: string): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "price_low") return [{ priceKsh: "asc" }, { publishedAt: "desc" }];
  if (sort === "price_high") return [{ priceKsh: "desc" }, { publishedAt: "desc" }];
  return [{ publishedAt: "desc" }];
}

function clean(value?: string): string {
  return value?.trim() ?? "";
}

function positiveInt(value?: string): number | null {
  if (!value?.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isProductGender(value: string): value is ProductGender {
  return Object.values(ProductGender).includes(value as ProductGender);
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .sort((left, right) => left.localeCompare(right));
}

type ProductWithPublicRelations = Awaited<ReturnType<typeof prisma.product.findMany>>[number] & {
  images: Array<{
    id: string;
    type: string;
    publicUrl: string | null;
  }>;
  measurements: Array<{
    measurementType: string;
    finalValueCm: unknown;
  }>;
  defects: Array<{
    defectType: string;
    severity: string;
    description: string;
    customerSafeDescription: string | null;
  }>;
  detailProfiles: Array<{
    id: string;
    status: ProductDetailStatus;
    sourceDataVersion: number;
    fitType: string | null;
    stretchLevel: string | null;
    fabricWeight: string | null;
    bodyChestMinCm: unknown;
    bodyChestMaxCm: unknown;
    bodyWaistMinCm: unknown;
    bodyWaistMaxCm: unknown;
    bodyHipMinCm: unknown;
    bodyHipMaxCm: unknown;
    heightMinCm: unknown;
    heightMaxCm: unknown;
    weightMinKg: unknown;
    weightMaxKg: unknown;
    expectedFit: string | null;
    recommendationConfidence: unknown;
    recommendationBasis: unknown;
    recommendationWarnings: unknown;
    sizeDisclaimer: string | null;
    finalOutputJson: unknown;
    assets: Array<{
      id: string;
      type: string;
      publicUrl: string | null;
    }>;
  }>;
};

function publicProduct(product: ProductWithPublicRelations) {
  const detailProfile = product.detailProfiles.find(
    (profile) => profile.sourceDataVersion === product.detailSourceVersion
  );
  if (!detailProfile) return null;
  const images = product.images
    .filter((image) => image.publicUrl)
    .map((image) => ({
      id: image.id,
      type: image.type,
      url: image.publicUrl
    }));

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category,
    subcategory: product.subcategory,
    color: product.color,
    audience: product.gender,
    kidsAgeRange: product.kidsAgeRange,
    brand: product.brand,
    material: product.material,
    tags: product.tags,
    size: product.finalSizeLabel ?? product.tagSize,
    conditionGrade: product.conditionGrade,
    fitType: product.fitType,
    stretchLevel: product.stretchLevel,
    fabricWeight: product.fabricWeight,
    priceKsh: product.priceKsh,
    publishedAt: product.publishedAt,
    onlyOneAvailable: true,
    images,
    measurements: product.measurements.map((measurement) => ({
      type: measurement.measurementType,
      valueCm: measurement.finalValueCm?.toString() ?? null
    })),
    defects: product.defects.map((defect) => ({
      type: defect.defectType,
      severity: defect.severity,
      description: defect.customerSafeDescription ?? defect.description
    })),
    detail: publicDetail(detailProfile)
  };
}

export function publicDetail(profile: ProductWithPublicRelations["detailProfiles"][number]) {
  const output = isRecord(profile.finalOutputJson) ? profile.finalOutputJson : {};
  return {
    profileId: profile.id,
    title: stringValue(output.title),
    sellingPoints: stringArray(output.sellingPoints),
    shortDescription: stringValue(output.shortDescription),
    measurementSummary: stringValue(output.measurementSummary),
    conditionSummary: stringValue(output.conditionSummary),
    styleTags: stringArray(output.styleTags),
    missingInformation: stringArray(output.missingInformation),
    warnings: stringArray(output.warnings),
    fitType: profile.fitType,
    stretchLevel: profile.stretchLevel,
    fabricWeight: profile.fabricWeight,
    assets: profile.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      url: asset.publicUrl ?? `/product-detail-assets/${asset.id}/content`
    }))
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
