import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ProductImageType, ProductStatus, prisma } from "@online-saler/database";
import { ProductApplicationService } from "./product-application.service";

interface CreateProductBody {
  productCode: string;
  employeeId?: string;
}

interface AddImageBody {
  type: ProductImageType;
  originalUrl: string;
  employeeId?: string;
}

@Controller("products")
export class ProductSetupController {
  constructor(private readonly products: ProductApplicationService) {}

  @Post()
  create(@Body() body: CreateProductBody) {
    if (!body.productCode?.trim()) {
      throw new BadRequestException("productCode is required");
    }

    return this.products.createProductShell({
      productCode: body.productCode.trim(),
      createdByEmployeeId: body.employeeId
    });
  }

  @Post(":id/images")
  async addImage(@Param("id") id: string, @Body() body: AddImageBody) {
    if (!body.originalUrl?.trim() || !body.type) {
      throw new BadRequestException("type and originalUrl are required");
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new BadRequestException("Product not found");

    const image = await prisma.productImage.create({
      data: {
        productId: id,
        type: body.type,
        originalUrl: body.originalUrl.trim(),
        uploadedByEmployeeId: body.employeeId
      }
    });

    if (product.status === ProductStatus.DRAFT) {
      await prisma.product.update({ where: { id }, data: { status: ProductStatus.PHOTOGRAPHED } });
    }

    return image;
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.products.getOperationsProductDetail({ id });
  }
}
