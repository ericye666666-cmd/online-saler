import { productShareMetadata } from "../../product-sharing";
import { getPublicRecommenderName } from "../../../affiliate/affiliate-platform-service";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ProductGallery } from "../../components/product-gallery";
import { ProductShareSheet } from "../../components/product-share-sheet";
import { ProductSaveButton } from "../../components/product-save-button";
import { RailCard } from "../../components/rail-card";
import { ReferralTracker } from "../../components/referral-tracker";
import { SiteHeader } from "../../components/site-header";
import { CatalogBuyAction } from "../../catalog-buy-action";
import {
  formatPrice,
  customerServiceUrl,
  normalizeSellerRef,
  normalizeTrackingParam,
} from "../../data/products";
import {
  buildProductGallery,
  formatMeasurement,
  optionalBrandValue,
  optionalDisplayValue,
  productDisplayTitle,
  visibleMeasurements,
} from "../../product-detail-commerce";
import { localizedSizeHeadline, productSizeDisplay } from "../../product-size-display";
import { browseHref } from "../../shop-taxonomy";
import { similarItemsHref } from "../../similar-items";
import { getPublishedProduct, listPublishedProducts } from "../../../db/catalog";
import { getStorefrontI18n } from "../../../i18n/server";
import { translateValue, type StorefrontLocale } from "../../../i18n/dictionary";

type ProductPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{
    ref?: string;
    source?: string;
    placement?: string;
    campaign?: string;
    utm_source?: string;
    utm_campaign?: string;
  }>;
};

export const dynamic = "force-dynamic";

const RELATED_LENGTH = 8;

export async function generateMetadata({ params, searchParams }: ProductPageProps): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const product = await getPublishedProduct(code);
  if (!product) return {};
  const ref = normalizeSellerRef(query.ref);
  const recommender = ref ? await getPublicRecommenderName(ref) : null;
  return productShareMetadata(product, ref, recommender);
}

/**
 * Laid out as Vestiaire's product page: photos, then brand, name, size and
 * price, then everything else folded into sections the shopper opens as
 * needed — description first and open. Buying stays pinned to the bottom
 * edge on phones.
 */
export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const { locale, t } = await getStorefrontI18n();
  const [product, products] = await Promise.all([
    getPublishedProduct(code),
    listPublishedProducts(),
  ]);
  if (!product) notFound();

  const sellerRef = normalizeSellerRef(query.ref);
  const source = normalizeTrackingParam(query.source ?? query.utm_source);
  const placement = normalizeTrackingParam(query.placement);
  const campaign = normalizeTrackingParam(query.campaign ?? query.utm_campaign);
  const value = (text: string | null | undefined) => (text ? translateValue(locale, text) : null);

  const shelf = product.placements?.[0] ?? null;
  // Same shelf first, then the same department, then anything else in stock.
  const rank = (item: typeof product) =>
    item.placements?.some((spot) => spot.department === shelf?.department && spot.category === shelf?.category) ? 0
      : item.placements?.some((spot) => spot.department === shelf?.department) ? 1 : 2;
  const related = products
    .filter((item) => item.code !== product.code && item.status === "Available")
    .sort((left, right) => rank(left) - rank(right))
    .slice(0, RELATED_LENGTH);

  const detail = product.detail;
  const isShoe = product.category === "Shoes";
  const gallery = buildProductGallery(product).map((item) => ({ ...item, label: galleryLabel(locale, item.label) }));
  const measurements = visibleMeasurements(detail?.measurements ?? [], product.category);
  const measurementAsset = isShoe ? null : detail?.assets.find((asset) => asset.type === "MEASUREMENT_GUIDE") ?? null;
  const fit = isShoe ? null : optionalDisplayValue(detail?.fitType);
  const stretch = isShoe ? null : optionalDisplayValue(detail?.stretchLevel);
  const fabricWeight = isShoe ? null : optionalDisplayValue(detail?.fabricWeight);
  const displayTitle = productDisplayTitle(product.title);
  const brandLabel = optionalBrandValue(product.brand);
  const sizeDisplay = productSizeDisplay(product);
  const sizeLabel = product.size
    ? (product.size === "Size not confirmed" ? t("product.sizeNotConfirmed") : localizedSizeHeadline(locale, product))
    : null;
  const color = optionalDisplayValue(product.color);
  const material = optionalDisplayValue(product.material === "Not specified" ? null : product.material);
  const conditionSummary = optionalDisplayValue(detail?.conditionSummary);
  const description = optionalDisplayValue(product.description);
  const sellingPoints = detail?.sellingPoints.filter((point) => optionalDisplayValue(point)).slice(0, 3) ?? [];
  const defects = detail?.defects.filter((defect) => optionalDisplayValue(defect.description) || optionalDisplayValue(defect.type)) ?? [];
  const status = t(product.status === "Sold" ? "product.sold" : product.status === "Reserved" ? "product.reserved" : isShoe ? "product.onlyOnePair" : "product.onlyOne");
  const productHref = (itemCode: string) => (sellerRef ? `/p/${itemCode}?ref=${sellerRef}` : `/p/${itemCode}`);

  return (
    <main className="productPage pdPage">
      <ReferralTracker sellerRef={sellerRef} productCode={product.code} source={source} placement={placement} campaign={campaign} />
      <SiteHeader sellerRef={sellerRef} productDetail />

      <div className="pdShell">
        <nav className="pdBreadcrumbs" aria-label="Breadcrumb">
          <Link href={sellerRef ? `/?ref=${sellerRef}` : "/"}>{t("common.home")}</Link>
          {shelf ? (
            <>
              <span aria-hidden="true">/</span>
              <Link href={browseHref({ department: shelf.department }, sellerRef)}>{translateValue(locale, shelf.department)}</Link>
              <span aria-hidden="true">/</span>
              <Link href={browseHref({ department: shelf.department, group: shelf.group }, sellerRef)}>{translateValue(locale, shelf.group)}</Link>
              <span aria-hidden="true">/</span>
              <Link href={browseHref({ department: shelf.department, group: shelf.group, shopCategory: shelf.category }, sellerRef)}>{translateValue(locale, shelf.category)}</Link>
            </>
          ) : null}
        </nav>

        <section className="pdTop">
          <div className="pdMedia">
            <ProductGallery items={gallery} productTitle={displayTitle} />
          </div>

          <div className="pdSide">
            <div className="pdSummary">
              <div className="pdHeadline">
                {brandLabel ? <p className="pdBrand">{brandLabel}</p> : null}
                <h1 className="pdTitle">{displayTitle}</h1>
                {sizeLabel ? <p className="pdSize">{sizeLabel}</p> : null}
                <ProductSaveButton productCode={product.code} productTitle={displayTitle} />
              </div>
              <p className="pdPrice">{formatPrice(product.price)}</p>
              <p className={`pdStatus ${product.status !== "Available" ? "unavailable" : ""}`}>{status}</p>

              <CatalogBuyAction
                product={product}
                chatHref={customerServiceUrl(product, sellerRef)}
                chatLabel={t("pd.chat")}
                similarHref={product.status === "Available" ? undefined : similarItemsHref(product, products, sellerRef)}
              />
              <ProductShareSheet product={product} className="pdShareButton" />
            </div>

            <div className="pdSections">
              {description || sellingPoints.length || conditionSummary || defects.length ? (
                <Fold title={t("pd.description")} open>
                  {description ? <p>{description}</p> : null}
                  {sellingPoints.length ? <ul>{sellingPoints.map((point) => <li key={point}>{point}</li>)}</ul> : null}
                  {conditionSummary ? <p>{conditionSummary}</p> : null}
                  {defects.length ? (
                    <>
                      <h3>{t("product.visibleWear")}</h3>
                      <ul>
                        {defects.map((defect, index) => (
                          <li key={`${defect.type}-${index}`}>{optionalDisplayValue(defect.description) ?? displayValue(defect.type)}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </Fold>
              ) : null}

              <Fold title={t("pd.details")}>
                <dl className="pdFacts">
                  {shelf ? <Fact label={t("pd.category")}>{translateValue(locale, shelf.category)}</Fact> : null}
                  {sizeLabel ? <Fact label={t("product.size")}>{sizeLabel}</Fact> : null}
                  {sizeDisplay.ukEquivalent ? <Fact label={t("product.ukEquivalent")}>{sizeDisplay.ukEquivalent}</Fact> : null}
                  {sizeDisplay.age ? <Fact label={t("product.recommendedAge")}>{sizeDisplay.age}</Fact> : null}
                  {sizeDisplay.recommendation ? <Fact label={t("product.recommended")}>{sizeDisplay.recommendation}</Fact> : null}
                  {isShoe && product.shoeType ? <Fact label={t("filter.shoeType")}>{value(product.shoeType)}</Fact> : null}
                  {isShoe && product.tagSize ? <Fact label={t("product.originalSizeLabel")}>{product.tagSize}</Fact> : null}
                  {fit ? <Fact label={t("product.fit")}>{value(fit)}</Fact> : null}
                  {stretch ? <Fact label={t("product.stretch")}>{value(stretch)}</Fact> : null}
                  {fabricWeight ? <Fact label={t("product.fabricWeight")}>{value(fabricWeight)}</Fact> : null}
                  <Fact label={t("product.condition")}>{value(product.condition)}</Fact>
                  {color ? <Fact label={t("product.colour")}>{value(color)}</Fact> : null}
                  {material ? <Fact label={t("pd.material")}>{value(material)}</Fact> : null}
                  <Fact label={t("product.location")}>{product.store}</Fact>
                </dl>
                <p className="pdNote">{t(isShoe ? "product.shoeSizeHelp" : "product.sizeChartDisclaimer")}</p>
              </Fold>

              {measurements.length ? (
                <Fold title={t("pd.measurements")}>
                  {measurementAsset ? <img className="pdMeasureGuide" src={measurementAsset.image} alt={`${displayTitle} measurement guide`} loading="lazy" /> : null}
                  <dl className="pdFacts">
                    {measurements.map((measurement) => (
                      <Fact key={measurement.type} label={translateValue(locale, measurement.label)}>{formatMeasurement(measurement.valueCm)}</Fact>
                    ))}
                  </dl>
                  <p className="pdNote">{t(isShoe ? "product.shoeMeasurementHelp" : "product.measurementHelp")}</p>
                </Fold>
              ) : null}

              <Fold title={t("pd.checked")}>
                <p>{t("pd.checkedBody")}</p>
              </Fold>

              <Fold title={t("pd.delivery")}>
                <p>{t("pd.deliveryPickup")}</p>
                <p>{t("pd.deliveryLocal")}</p>
                <p>{t("pd.deliverySupport")}</p>
              </Fold>

              <Fold title={t("pd.returns")}>
                <p>{t("pd.returnsIntro")}</p>
                <p>{t("pd.returnsHow")}</p>
              </Fold>

              <Fold title={t("pd.payment")}>
                <p>{t("pd.paymentBody")}</p>
              </Fold>
            </div>
          </div>
        </section>

        {related.length ? (
          <section className="homeFeedSection pdRelated">
            <div className="homeFeedHeading">
              <h2>{t("product.related")}</h2>
            </div>
            <div className="homeRail homeProductRail">
              {related.map((item) => <RailCard key={item.code} product={item} locale={locale} href={productHref(item.code)} />)}
            </div>
            <Link className="homeSeeAllButton" href={shelf ? browseHref({ department: shelf.department, group: shelf.group, shopCategory: shelf.category }, sellerRef) : "/"}>
              {t("home.seeAll")}
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}

/** One of the page's fold-away sections; native <details>, so it works before scripts load. */
function Fold({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="pdFold" open={open}>
      <summary>
        <span>{title}</span>
        <ChevronDown size={22} strokeWidth={1.6} aria-hidden="true" />
      </summary>
      <div className="pdFoldBody">{children}</div>
    </details>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** "Detail 2" → "细节 2": translate the word, keep the number. */
function galleryLabel(locale: StorefrontLocale, label: string) {
  const match = /^(.*?)(\s+\d+)?$/.exec(label);
  return match ? `${translateValue(locale, match[1] ?? label)}${match[2] ?? ""}` : label;
}

function displayValue(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
