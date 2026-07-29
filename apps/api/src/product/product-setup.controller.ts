import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { ProductImageType, ProductStatus, prisma } from "@online-saler/database";
import { ProductApplicationService } from "./product-application.service";
import { ProductImageStorageService } from "./product-image-storage.service";

interface CreateProductBody {
  productCode: string;
  employeeId?: string;
}

interface AddImageBody {
  type: ProductImageType;
  originalUrl: string;
  employeeId?: string;
}

@ observable
class Placeholder {}

@Controller("products")
export class ProductSetupController {
  constructor(
    private readonly products: ProductApplicationService,
    private readonly imageStorage: ProductImageStorageService
  ) {}

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

  @Post(":id/images/upload")
  async uploadImage(
    @Param("id") id: string,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-image-type") imageType: ProductImageType | undefined,
    @Headers("x-employee-id") employeeId: string | undefined,
    @Req() request: AsyncIterable<Buffer>
  ) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new BadRequestException("Product not found");
    if (!imageType || !Object.values(ProductImageType).includes(imageType)) {
      throw new BadRequestException("x-image-type is required");
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > 10 * 1024 * 1024) {
        throw new BadRequestException("Image must not exceed 10 MB");
      }
      chunks.push(buffer);
    }
    const body = Buffer.concat(chunks);
    this.imageStorage.validate(contentType, body.length);

    const imageId = randomUUID();
    const objectName = this.imageStorage.objectName(id, imageId, contentType!);
    await this.imageStorage.upload(objectName, contentType!, body);

    const image = await prisma.productImage.create({
      data: {
        id: imageId,
        productId: id,
        type: imageType,
        originalUrl: `gs://${this.imageStorage.bucket}/${objectName}`,
        publicUrl: `/products/${id}/images/${imageId}/content`,
        uploadedByEmployeeId: employeeId?.trim() || undefined
      }
    });

    if (product.status === ProductStatus.DRAFT) {
      await prisma.product.update({ where: { id }, data: { status: ProductStatus.PHOTOGRAPHED } });
    }

    return image;
  }

  @Get(":id/images/:imageId/content")
  async imageContent(@Param("id") id: string, @Param("imageId") imageId: string, @Res() response: any) {
    const image = await prisma.productImage.findFirst({ where: { id: imageId, productId: id } });
    if (!image?.originalUrl.startsWith(`gs://${this.imageStorage.bucket}/`)) {
      throw new BadRequestException("Stored image not found");
    }
    const objectName = image.originalUrl.slice(`gs://${this.imageStorage.bucket}/`.length);
    const stored = await this.imageStorage.download(objectName);
    response.setHeader("Content-Type", stored.contentType);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.send(Buffer.from(stored.body));
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
