import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ProductDetailAssetType,
  ProductDetailStatus,
  ImageProcessingStatus,
  ProductImageType,
  ProductImageVariant,
  prisma
} from "@online-saler/database";
import { ProductImageJobRunnerService } from "./product-image-job-runner.service";
import { ProductImageProcessingService } from "./product-image-processing.service";
import { SelectedBackgroundRemovalProvider } from "./selected-background-removal.provider";
import {
  PRODUCT_DETAIL_TEMPLATE_VERSION,
  ProductDetailCardRendererService,
  selectMeasurementTemplate
} from "./product-detail-card-renderer.service";
import { ProductImageStorageService } from "./product-image-storage.service";
import { ProductImageTransformerService } from "./product-image-transformer.service";

const DETAIL_LOCALE = "en";

@Injectable()
export class ProductDetailAssetService {
  constructor(
    private readonly renderer: ProductDetailCardRendererService,
    private readonly storage: ProductImageStorageService,
    private readonly backgroundRemoval: SelectedBackgroundRemovalProvider,
    private readonly transformer: ProductImageTransformerService,
    private readonly imageProcessing: ProductImageProcessingService,
    private readonly imageJobs: ProductImageJobRunnerService
  ) {}

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
    }

    const back = profile.product.images.find((image) => image.type === ProductImageType.BACK);
    assets.push(
      back
        ? await this.generateBackMain(profile.id, profile.productId, profile.sourceDataVersion, back)
        : await this.persistRendered(
            profile.id,
            profile.productId,
            profile.sourceDataVersion,
            ProductDetailAssetType.BACK_MAIN,
            await this.renderer.informationCard({
              eyebrow: "Back photo",
              title: "Back photo not supplied",
              rows: [],
              note: "Upload a back photo before publication when the reverse differs from the front.",
              accent: "#666666"
            })
          )
    );

    const modelDisplay = await this.ensureModelDisplay(profile.productId);
    assets.push(
      await this.persistReference(
        profile.id,
        profile.productId,
        profile.sourceDataVersion,
        ProductDetailAssetType.MODEL_DISPLAY,
        modelDisplay.storageUrl,
        modelDisplay.publicUrl,
        modelDisplay.mimeType
      )
    );

    assets.push(
      await this.persistRendered(
        profile.id,
        profile.productId,
        profile.sourceDataVersion,
        ProductDetailAssetType.MEASUREMENT_GUIDE,
        await this.renderer.measurementCard({
          template: selectMeasurementTemplate(profile.product.category, profile.product.subcategory),
          title,
          measurements
        })
      )
    );

    const detailImage = profile.product.images.find((image) =>
      image.type === ProductImageType.DETAIL || image.type === ProductImageType.DEFECT
    );
    assets.push(
      detailImage
        ? await this.persistReference(
            profile.id,
            profile.productId,
            profile.sourceDataVersion,
            ProductDetailAssetType.DETAIL_GALLERY,
            detailImage.originalUrl,
            detailImage.publicUrl,
            mimeFromUrl(detailImage.originalUrl)
          )
        : await this.persistRendered(
            profile.id,
            profile.productId,
            profile.sourceDataVersion,
            ProductDetailAssetType.DETAIL_GALLERY,
            await this.renderer.informationCard({
              eyebrow: "Item details",
              title: "No additional detail photos supplied",
              rows: [],
              note: "The front, back and measurement images remain available for review.",
              accent: "#666666"
            })
          )
    );

    assets.push(
      await this.persistRendered(
        profile.id,
        profile.productId,
        profile.sourceDataVersion,
        ProductDetailAssetType.DELIVERY_GUIDE,
        await this.renderer.informationCard({
          eyebrow: "Delivery information",
          title: "Delivery and collection",
          rows: [
            { label: "Availability", value: "One unique second-hand item" },
            { label: "Options", value: "Confirmed during checkout" },
            { label: "Before purchase", value: "Review measurements and item photos" }
          ],
          note: "Contact Direct Loop support promptly if the received item does not match the approved listing.",
          accent: "#1f6f5f"
        })
      )
    );

    await prisma.productDetailAsset.updateMany({
      where: {
        detailProfileId: profile.id,
        type: {
          in: [
            ProductDetailAssetType.FIT_GUIDE,
            ProductDetailAssetType.CONDITION_GUIDE,
            ProductDetailAssetType.SHARE_CARD
          ]
        }
      },
      data: {
        status: ProductDetailStatus.OUTDATED,
        outdatedReason: "REPLACED_BY_SIMPLE_SIX_PAGE_TEMPLATE",
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

  private async ensureModelDisplay(productId: string) {
    const existing = await prisma.productImageVariantAsset.findFirst({
      where: { productId, variant: ProductImageVariant.AI_DISPLAY_MAIN },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return existing;

    const white = await prisma.productImageVariantAsset.findFirst({
      where: { productId, variant: ProductImageVariant.CUTOUT_WHITE },
      orderBy: { createdAt: "desc" }
    });
    if (!white) throw new BadRequestException("A white-background cutout is required before generating the model display image");

    const job = await this.imageProcessing.start({
      productId,
      sourceImageId: white.id,
      operation: "GENERATE_AI_DISPLAY_MAIN_IMAGE"
    });
    const completed = await this.imageJobs.run(job.id);
    if (completed.status !== ImageProcessingStatus.SUCCEEDED || !completed.outputImageId) {
      throw new BadRequestException(completed.errorMessage || "Model display image generation failed");
    }
    const generated = await prisma.productImageVariantAsset.findUnique({ where: { id: completed.outputImageId } });
    if (!generated) throw new BadRequestException("Generated model display image was not saved");
    return generated;
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
    heightPx = 1200
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
        templateVersion: PRODUCT_DETAIL_TEMPLATE_VERSION,
        sourceDataVersion
      },
      update: {
        status: ProductDetailStatus.READY,
        storageUrl: `gs://${this.storage.bucket}/${storageObject}`,
        mimeType,
        widthPx,
        heightPx,
        templateVersion: PRODUCT_DETAIL_TEMPLATE_VERSION,
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
        templateVersion: PRODUCT_DETAIL_TEMPLATE_VERSION,
        sourceDataVersion
      },
      update: {
        status: ProductDetailStatus.READY,
        storageUrl,
        publicUrl,
        mimeType,
        templateVersion: PRODUCT_DETAIL_TEMPLATE_VERSION,
        sourceDataVersion,
        failureCode: null,
        errorMessage: null,
        outdatedReason: null,
        outdatedAt: null
      }
    });
  }

  private objectName(url: string): string {
    const prefix = `gs://${this.storage.bucket}/`;
    if (!url.startsWith(prefix)) throw new BadRequestException("Original image is not available in product storage");
    return url.slice(prefix.length);
  }
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
