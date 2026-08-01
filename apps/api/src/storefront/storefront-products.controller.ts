import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { InventoryItemStatus, Prisma, ProductGender, ProductStatus, prisma } from "@online-saler/database";

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

    return products.map(publicProduct);
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

    return publicProduct(product);
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
      OR: ["title", "brand", "category", "subcategory", "color"].map((field) => ({
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
};

function publicProduct(product: ProductWithPublicRelations) {
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
    size: product.finalSizeLabel ?? product.tagSize,
    conditionGrade: product.conditionGrade,
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
    }))
  };
}
