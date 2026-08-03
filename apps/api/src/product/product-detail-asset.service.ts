import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import {
  PRODUCT_DETAIL_MEASUREMENT_TEMPLATES,
  selectProductDetailMeasurementTemplate,
  type ProductDetailMeasurementTemplate
} from "@online-saler/business-rules";
import { randomUUID } from "node:crypto";
import {
  ProductDetailAssetType,
  ProductDetailStatus,
  ProductImageType,
  ProductImageVariant,
  Prisma,
  prisma
} from "@online-saler/database";
import { SelectedBackgroundRemovalProvider } from "./selected-background-removal.provider";
import {
  ProductDetailCardRendererService
} from "./product-detail-card-renderer.service";
import { ProductImageStorageService } from "./product-image-storage.service";
import { ProductImageTransformerService } from "./product-image-transformer.service";

const DETAIL_LOCALE = "en";

@Injectable()
export class ProductDetailAssetService implements OnModuleInit {
  constructor(
    private readonly renderer: ProductDetailCardRendererService,
    private readonly storage: ProductImageStorageService,
    private readonly backgroundRemoval: SelectedBackgroundRemovalProvider,
    private readonly transformer: ProductImageTransformerService
  ) {}

  async onModuleInit() {
    await this.syncTemplateCatalog();
  }

  async generateForProfile(profileId: string) {
    const profile = await prisma.productDetailProfile.findUnique({
      where: { id: profileId },
      include: {
        product: {
          include: {
            images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            measurements: { orderBy: { measurementType: "asc" } },
            defects: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });
    if (!profile) throw new NotFoundException("Product detail profile not found");
    if (profile.status === ProductDetailStatus.OUTDATED) {
      throw new BadRequestException("Outdated product detail profiles cannot generate assets");
    }
    if (profile.product.detailSourceVersion !== profile.sourceDataVersion) {
      throw new BadRequestException("Product facts changed before detail asset generation");
    }

    const measurements = Object.fromEntries(
      profile.product.measurements
        .filter((measurement) => measurement.finalValueCm !== null)
        .map((measurement) => [measurement.measurementType, Number(measurement.finalValueCm)])
    );
    const finalCopy = asRecord(profile.finalOutputJson);
    const title = stringValue(finalCopy.title) ?? profile.product.title ?? "Product details";
    const measurementTemplate = selectProductDetailMeasurementTemplate(
      profile.product.category,
      profile.product.subcategory
    );
    await this.syncMeasurementTemplates(profile.id, measurementTemplate);
    const assets = [];

    const front = await this.resolveFrontMain(profile.productId, profile.product.images);
    if (front) {
      assets.push(
        await this.persistReference(
          profile.id,
          profile.productId,
          profile.sourceDataVersion,
          ProductDetailAssetType.FRONT_MAIN,
          front.storageUrl,
          front.publicUrl,
          front.mimeType
        )
      );
    } else {
      await this.markUnavailable(profile.id, ProductDetailAssetType.FRONT_MAIN, "FRONT_IMAGE_NOT_AVAILABLE");
    }

    const back = profile.product.images.find((image) => image.type === ProductImageType.BACK);
    if (back) {
      assets.push(await this.generateBackMain(profile.id, profile.productId, profile.sourceDataVersion, back));
    } else {
      await this.markUnavailable(profile.id, ProductDetailAssetType.BACK_MAIN, "BACK_IMAGE_NOT_AVAILABLE");
    }

    assets.push(
      await this.persistRendered(
        profile.id,
        profile.productId,
        profile.sourceDataVersion,
        ProductDetailAssetType.MEASUREMENT_GUIDE,
        await this.renderer.measurementCard({
          template: measurementTemplate.code,
          title,
          measurements
        }),
        "image/webp",
        1200,
        1200,
        { code: measurementTemplate.code, version: measurementTemplate.version }
      )
    );

    const detailImage = profile.product.images.find((image) =>
      image.type === ProductImageType.DETAIL || image.type === ProductImageType.DEFECT
    );
    if (detailImage) {
      assets.push(
        await this.persistReference(
          profile.id,
          profile.productId,
          profile.sourceDataVersion,
          ProductDetailAssetType.DETAIL_GALLERY,
          detailImage.originalUrl,
          detailImage.publicUrl,
          mimeFromUrl(detailImage.originalUrl)
        )
      );
    } else {
      await this.markUnavailable(profile.id, ProductDetailAssetType.DETAIL_GALLERY, "DETAIL_IMAGE_NOT_AVAILABLE");
    }

    await prisma.productDetailAsset.updateMany({
      where: {
        detailProfileId: profile.id,
        type: {
          in: [
            ProductDetailAssetType.MODEL_DISPLAY,
            ProductDetailAssetType.DELIVERY_GUIDE,
            ProductDetailAssetType.FIT_GUIDE,
            ProductDetailAssetType.CONDITION_GUIDE,
            ProductDetailAssetType.SHARE_CARD
          ]
        }
      },
      data: {
        status: ProductDetailStatus.OUTDATED,
        outdatedReason: "REMOVED_FROM_COMMERCE_PRODUCT_DETAIL",
        outdatedAt: new Date()
      }
    });

    const current = await prisma.product.findUnique({
      where: { id: profile.productId },
      select: { detailSourceVersion: true }
    });
    if (!current || current.detailSourceVersion !== profile.sourceDataVersion) {
      await prisma.productDetailAsset.updateMany({
        where: { detailProfileId: profile.id },
        data: {
          status: ProductDetailStatus.OUTDATED,
          outdatedReason: "SOURCE_VERSION_CHANGED_DURING_ASSET_GENERATION",
          outdatedAt: new Date()
        }
      });
      throw new BadRequestException("Product facts changed while detail assets were generated");
    }

    return assets;
  }

  private async resolveFrontMain(productId: string, images: Array<{ id: string; type: ProductImageType; originalUrl: string; publicUrl: string | null }>) {
    const selection = await prisma.productMainImageSelection.findUnique({ where: { productId } });
    if (selection?.variant === ProductImageVariant.ORIGINAL) {
      const image = images.find((item) => item.id === selection.selectedImageId);
      if (image) return { storageUrl: image.originalUrl, publicUrl: image.publicUrl, mimeType: mimeFromUrl(image.originalUrl) };
    }
    if (selection && selection.variant !== ProductImageVariant.ORIGINAL) {
      const selected = await prisma.productImageVariantAsset.findFirst({
        where: { id: selection.selectedImageId, productId }
      });
      if (selected) return { storageUrl: selected.storageUrl, publicUrl: selected.publicUrl, mimeType: selected.mimeType };
    }
    const optimized = await prisma.productImageVariantAsset.findFirst({
      where: {
        productId,
        variant: { in: [ProductImageVariant.OPTIMIZED_BALANCED_MAIN, ProductImageVariant.OPTIMIZED_MAIN] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (optimized) return { storageUrl: optimized.storageUrl, publicUrl: optimized.publicUrl, mimeType: optimized.mimeType };
    const front = images.find((image) => image.type === ProductImageType.FRONT);
    return front ? { storageUrl: front.originalUrl, publicUrl: front.publicUrl, mimeType: mimeFromUrl(front.originalUrl) } : null;
  }

  private async generateBackMain(
    profileId: string,
    productId: string,
    sourceDataVersion: number,
    image: { id: string; originalUrl: string }
  ) {
    const objectName = this.objectName(image.originalUrl);
    const source = await this.storage.download(objectName);
    const cutout = await this.backgroundRemoval.removeBackground({
      body: Buffer.from(source.body),
      contentType: source.contentType,
      filename: `${image.id}.${extension(source.contentType)}`
    });
    const white = await this.transformer.composeWhiteBackground(cutout.body);
    return this.persistRendered(
      profileId,
      productId,
      sourceDataVersion,
      ProductDetailAssetType.BACK_MAIN,
      white.body,
      white.contentType,
      white.widthPx,
      white.heightPx
    );
  }

  private async persistRendered(
    profileId: string,
    productId: string,
    sourceDataVersion: number,
    type: ProductDetailAssetType,
    body: Buffer,
    mimeType = "image/webp",
    widthPx = 1200,
    heightPx = 1200,
    template?: { code: string; version: string }
  ) {
    const existing = await prisma.productDetailAsset.findUnique({
      where: { detailProfileId_type_locale: { detailProfileId: profileId, type, locale: DETAIL_LOCALE } }
    });
    const id = existing?.id ?? randomUUID();
    const storageObject = this.storage.derivedObjectName(
      productId,
      id,
      `detail-${type.toLowerCase()}-${sourceDataVersion}`,
      mimeType
    );
    await this.storage.upload(storageObject, mimeType, body);
    return prisma.productDetailAsset.upsert({
      where: { detailProfileId_type_locale: { detailProfileId: profileId, type, locale: DETAIL_LOCALE } },
      create: {
        id,
        productId,
        detailProfileId: profileId,
        type,
        status: ProductDetailStatus.READY,
        storageUrl: `gs://${this.storage.bucket}/${storageObject}`,
        mimeType,
        widthPx,
        heightPx,
        locale: DETAIL_LOCALE,
        templateCode: template?.code,
        templateVersion: template?.version,
        storageKey: storageObject,
        sourceDataVersion
      },
      update: {
        status: ProductDetailStatus.READY,
        storageUrl: `gs://${this.storage.bucket}/${storageObject}`,
        mimeType,
        widthPx,
        heightPx,
        templateCode: template?.code ?? null,
        templateVersion: template?.version ?? null,
        storageKey: storageObject,
        sourceDataVersion,
        failureCode: null,
        errorMessage: null,
        outdatedReason: null,
        outdatedAt: null
      }
    });
  }

  private async persistReference(
    profileId: string,
    productId: string,
    sourceDataVersion: number,
    type: ProductDetailAssetType,
    storageUrl: string,
    publicUrl: string | null,
    mimeType: string | null
  ) {
    return prisma.productDetailAsset.upsert({
      where: { detailProfileId_type_locale: { detailProfileId: profileId, type, locale: DETAIL_LOCALE } },
      create: {
        productId,
        detailProfileId: profileId,
        type,
        status: ProductDetailStatus.READY,
        storageUrl,
        publicUrl,
        mimeType,
        locale: DETAIL_LOCALE,
        templateCode: null,
        templateVersion: null,
        storageKey: storageKey(storageUrl, this.storage.bucket),
        sourceDataVersion
      },
      update: {
        status: ProductDetailStatus.READY,
        storageUrl,
        publicUrl,
        mimeType,
        templateCode: null,
        templateVersion: null,
        storageKey: storageKey(storageUrl, this.storage.bucket),
        sourceDataVersion,
        failureCode: null,
        errorMessage: null,
        outdatedReason: null,
        outdatedAt: null
      }
    });
  }

  private async syncMeasurementTemplates(
    profileId: string,
    selectedTemplate: ProductDetailMeasurementTemplate
  ) {
    await this.syncTemplateCatalog();
    await prisma.productDetailAsset.updateMany({
      where: {
        detailProfileId: profileId,
        type: ProductDetailAssetType.MEASUREMENT_GUIDE,
        status: { not: ProductDetailStatus.OUTDATED },
        OR: [
          { templateCode: null },
          { templateCode: { not: selectedTemplate.code } },
          { templateVersion: null },
          { templateVersion: { not: selectedTemplate.version } }
        ]
      },
      data: {
        status: ProductDetailStatus.OUTDATED,
        outdatedReason: "MEASUREMENT_TEMPLATE_CHANGED",
        outdatedAt: new Date()
      }
    });
  }

  private async syncTemplateCatalog() {
    await prisma.$transaction(Object.values(PRODUCT_DETAIL_MEASUREMENT_TEMPLATES).map((template) =>
      prisma.productDetailTemplate.upsert({
        where: { code: template.code },
        create: {
          code: template.code,
          name: template.name,
          garmentType: template.garmentType,
          version: template.version,
          svgSource: template.svgSource,
          measurementFieldsJson: template.measurementFields as unknown as Prisma.InputJsonValue,
          isActive: true
        },
        update: {
          name: template.name,
          garmentType: template.garmentType,
          version: template.version,
          svgSource: template.svgSource,
          measurementFieldsJson: template.measurementFields as unknown as Prisma.InputJsonValue,
          isActive: true
        }
      })
    ));
  }

  private async markUnavailable(profileId: string, type: ProductDetailAssetType, reason: string) {
    await prisma.productDetailAsset.updateMany({
      where: { detailProfileId: profileId, type, status: { not: ProductDetailStatus.OUTDATED } },
      data: { status: ProductDetailStatus.OUTDATED, outdatedReason: reason, outdatedAt: new Date() }
    });
  }

  private objectName(url: string): string {
    const prefix = `gs://${this.storage.bucket}/`;
    if (!url.startsWith(prefix)) throw new BadRequestException("Original image is not available in product storage");
    return url.slice(prefix.length);
  }
}

function storageKey(storageUrl: string, bucket: string): string | null {
  const prefix = `gs://${bucket}/`;
  return storageUrl.startsWith(prefix) ? storageUrl.slice(prefix.length) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mimeFromUrl(url: string): string {
  return url.toLowerCase().endsWith(".png") ? "image/png" : url.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
}

function extension(contentType: string): string {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}
