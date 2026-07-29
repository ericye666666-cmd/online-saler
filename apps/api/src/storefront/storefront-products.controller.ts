import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { InventoryItemStatus, ProductStatus, prisma } from "@online-saler/database";

@Controller("public/products")
export class StorefrontProductsController {
  @Get()
  async list(@Query("category") category?: string) {
    const where = {
      status: ProductStatus.PUBLISHED,
      ...(category?.trim() ? { category: category.trim() } : {}),
      inventoryItem: {
        is: {
          status: InventoryItemStatus.AVAILABLE
        }
      }
    };

    const products = await prisma.product.findMany({
      where,
      include: productInclude(),
      orderBy: { publishedAt: "desc" },
      take: 60
    });

    return products.map(publicProduct);
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const product = await prisma.product.findFirst({
      where: {
        id,
        status: ProductStatus.PUBLISHED,
        inventoryItem: {
          is: {
            status: InventoryItemStatus.AVAILABLE
          }
        }
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
