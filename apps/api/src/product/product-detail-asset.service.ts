import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ProductDetailAssetType,
  ProductDetailStatus,
  ProductImageType,
  ProductImageVariant,
  prisma
} from "@online-saler/database";
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
    private readonly transformer: ProductImageTransformerService
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
    if (back) {
      assets.push(await this.generateBackMain(profile.id, profile.productId, profile.sourceDataVersion, back));
    }

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

    assets.push(
      await this.persistRendered(
        profile.id,
        profile.productId,
        profile.sourceDataVersion,
        ProductDetailAssetType.FIT_GUIDE,
        await this.renderer.informationCard({
          eyebrow: "Fit guide",
          title: stringValue(finalCopy.fitSummary) ?? "Fit and size guidance",
          rows: fitRows(profile),
          note: profile.sizeDisclaimer,
          accent: "#1f6f5f"
        })
      )
    );

    assets.push(
      await this.persistRendered(
        profile.id,
        profile.productId,
        profile.sourceDataVersion,
        ProductDetailAssetType.CONDITION_GUIDE,
        await this.renderer.informationCard({
          eyebrow: "Condition",
          title: stringValue(finalCopy.conditionSummary) ?? "Condition and disclosed defects",
          rows: conditionRows(profile.product.conditionGrade, profile.product.defects),
          note: "Second-hand item. Review all original, detail and defect photos before purchase.",
          accent: "#9a5d00"
        })
      )
    );

    assets.push(
      await this.persistRendered(
        profile.id,
        profile.productId,
        profile.sourceDataVersion,
        ProductDetailAssetType.SHARE_CARD,
        await this.renderer.informationCard({
          eyebrow: "Second-hand, one item only",
          title,
          rows: [
            { label: "Platform size", value: profile.product.finalSizeLabel ?? "Not confirmed" },
            { label: "Condition", value: profile.product.conditionGrade ?? "Not confirmed" },
            { label: "Price", value: profile.product.priceKsh ? `KSh ${profile.product.priceKsh.toLocaleString("en-KE")}` : "Not set" }
          ],
          note: stringValue(finalCopy.shortDescription),
          accent: "#b42318"
        })
      )
    );

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
      where: { productId, variant: ProductImageVariant.OPTIMIZED_MAIN },
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

function fitRows(profile: {
  fitType: unknown;
  stretchLevel: unknown;
  fabricWeight: unknown;
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
  recommendationConfidence: unknown;
}) {
  return [
    row("Fit", profile.fitType),
    row("Stretch", profile.stretchLevel),
    row("Fabric weight", profile.fabricWeight),
    rangeRow("Suggested body chest", profile.bodyChestMinCm, profile.bodyChestMaxCm, "cm"),
    rangeRow("Suggested body waist", profile.bodyWaistMinCm, profile.bodyWaistMaxCm, "cm"),
    rangeRow("Suggested body hip", profile.bodyHipMinCm, profile.bodyHipMaxCm, "cm"),
    rangeRow("Height reference", profile.heightMinCm, profile.heightMaxCm, "cm"),
    rangeRow("Weight reference", profile.weightMinKg, profile.weightMaxKg, "kg"),
    row("Confidence", profile.recommendationConfidence === null ? null : `${Math.round(Number(profile.recommendationConfidence) * 100)}%`)
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

function conditionRows(condition: unknown, defects: Array<{ defectType: string; customerSafeDescription: string | null; description: string }>) {
  const rows = [row("Condition grade", condition)];
  for (const defect of defects.slice(0, 5)) {
    rows.push({ label: defect.defectType, value: defect.customerSafeDescription ?? defect.description });
  }
  if (defects.length === 0) rows.push({ label: "Disclosed defects", value: "None recorded" });
  return rows.filter((item): item is { label: string; value: string } => Boolean(item));
}

function row(label: string, value: unknown): { label: string; value: string } | null {
  if (value === null || value === undefined || value === "") return null;
  return { label, value: String(value).replaceAll("_", " ") };
}

function rangeRow(label: string, min: unknown, max: unknown, unit: string) {
  if (min === null || min === undefined || max === null || max === undefined) return null;
  return { label, value: `${Number(min)}-${Number(max)} ${unit}` };
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
