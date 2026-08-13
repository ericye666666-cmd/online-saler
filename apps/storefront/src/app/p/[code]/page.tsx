import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductGallery } from "../../components/product-gallery";
import { ProductShareSheet } from "../../components/product-share-sheet";
import { ProductSaveButton } from "../../components/product-save-button";
import { ReferralTracker } from "../../components/referral-tracker";
import { SiteHeader } from "../../components/site-header";
import { CatalogBuyAction } from "../../catalog-buy-action";
import {
  formatPrice,
  normalizeSellerRef,
  normalizeTrackingParam,
  SITE_URL,
} from "../../data/products";
import {
  buildProductGallery,
  formatMeasurement,
  optionalDisplayValue,
  visibleMeasurements,
} from "../../product-detail-commerce";
import { getPublishedProduct, listPublishedProducts } from "../../../db/catalog";
import { getStorefrontI18n } from "../../../i18n/server";

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

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { code } = await params;
  const product = await getPublishedProduct(code);
  if (!product) return {};

  const title = `${product.title} · ${formatPrice(product.price)}`;
  const productType = product.shoeType ?? product.bagType ?? product.textileType;
  const description = [product.title, productType, product.size, product.condition, product.store]
    .filter(Boolean)
    .join(", ");

  return {
    title,
    description,
    alternates: { canonical: `/p/${product.code}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/p/${product.code}`,
      siteName: "Direct Loop Catalog",
      type: "website",
      images: product.ogImage ? [{
        url: product.ogImage,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: `${product.title} product card`,
      }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: product.ogImage ? [product.ogImage] : [],
    },
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const { t } = await getStorefrontI18n();
  const [product, products] = await Promise.all([
    getPublishedProduct(code),
    listPublishedProducts(),
  ]);
  if (!product) notFound();

  const sellerRef = normalizeSellerRef(query.ref);
  const source = normalizeTrackingParam(query.source ?? query.utm_source);
  const placement = normalizeTrackingParam(query.placement);
  const campaign = normalizeTrackingParam(query.campaign ?? query.utm_campaign);
  const related = products
    .filter((item) => item.code !== product.code)
    .sort((left, right) => Number(right.category === product.category) - Number(left.category === product.category))
    .slice(0, 4);
  const detail = product.detail;
  const gallery = buildProductGallery(product);
  const measurements = visibleMeasurements(detail?.measurements ?? [], product.category);
  const measurementAsset = detail?.assets.find((asset) => asset.type === "MEASUREMENT_GUIDE") ?? null;
  const fit = optionalDisplayValue(detail?.fitType);
  const stretch = optionalDisplayValue(detail?.stretchLevel);
  const fabricWeight = optionalDisplayValue(detail?.fabricWeight);
  const color = optionalDisplayValue(product.color);
  const conditionSummary = optionalDisplayValue(detail?.conditionSummary);
  const description = optionalDisplayValue(product.description);
  const sellingPoints = detail?.sellingPoints.filter((point) => optionalDisplayValue(point)).slice(0, 3) ?? [];
  const defects = detail?.defects.filter((defect) => optionalDisplayValue(defect.description) || optionalDisplayValue(defect.type)) ?? [];

  return (
    <main className="productPage">
      <ReferralTracker sellerRef={sellerRef} productCode={product.code} source={source} placement={placement} campaign={campaign} />
      <SiteHeader sellerRef={sellerRef} productDetail />

      <div className="productPageShell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href={sellerRef ? `/?ref=${sellerRef}` : "/"}>{t("common.home")}</Link>
          <ChevronRight size={14} />
          <Link href={`/?category=${encodeURIComponent(product.category)}${sellerRef ? `&ref=${sellerRef}` : ""}`}>
            {product.category}
          </Link>
          <ChevronRight size={14} />
          <span>{product.title}</span>
        </nav>

        <aside className="productAvailabilityNotice">{t("product.availabilityNotice")}</aside>

        <section className="productDetailGrid">
          <ProductGallery items={gallery} productTitle={product.title} />

          <div className="productPurchasePanel">
            <p className="productDetailBrand">{product.brand}</p>
            <h1>{product.title}</h1>
            <ProductSaveButton productTitle={product.title} />
            <div className="commercePriceRow">
              <strong>{formatPrice(product.price)}</strong>
              <span>{t("product.onlyOne")}</span>
            </div>

            <dl className="quickFacts" aria-label="Item summary">
              <div><dt>{t("product.size")}</dt><dd>{product.size}</dd></div>
              {fit ? <div><dt>{t("product.fit")}</dt><dd>{fit}</dd></div> : null}
              {stretch ? <div><dt>{t("product.stretch")}</dt><dd>{stretch}</dd></div> : null}
              {fabricWeight ? <div><dt>{t("product.fabricWeight")}</dt><dd>{fabricWeight}</dd></div> : null}
              <div><dt>{t("product.condition")}</dt><dd>{product.condition}</dd></div>
              {color ? <div><dt>{t("product.colour")}</dt><dd>{color}</dd></div> : null}
              <div><dt>{t("product.location")}</dt><dd><MapPin size={14} /> {product.store}</dd></div>
            </dl>

            <CatalogBuyAction product={product} />
            <ProductShareSheet product={product} />
          </div>
        </section>

        {measurements.length ? (
          <section className="commerceDetailSection measurementSection" aria-labelledby="measurements-heading">
            <div className="commerceSectionHeading">
              <p>{t("product.measurements")}</p>
              <h2 id="measurements-heading">{t("product.flatMeasurements")}</h2>
            </div>
            <dl className="measurementSummaryGrid">
              {measurements.slice(0, 4).map((measurement) => (
                <div key={measurement.type}>
                  <dt>{measurement.label}</dt>
                  <dd>{formatMeasurement(measurement.valueCm)}</dd>
                </div>
              ))}
            </dl>
            <details className="measurementGuide">
              <summary>{t("product.fullMeasurementGuide")}</summary>
              <div className={measurementAsset ? "measurementGuideLayout" : "measurementGuideLayout textOnly"}>
                {measurementAsset ? (
                  <img src={measurementAsset.image} alt={`${product.title} measurement guide`} loading="lazy" />
                ) : null}
                <div>
                  <dl className="measurementList">
                    {measurements.map((measurement) => (
                      <div key={measurement.type}>
                        <dt>{measurement.label}</dt>
                        <dd>{formatMeasurement(measurement.valueCm)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p>{t("product.measurementHelp")}</p>
                </div>
              </div>
            </details>
          </section>
        ) : null}

        {fit || stretch || fabricWeight ? (
          <section className="commerceDetailSection" aria-labelledby="fit-heading">
            <div className="commerceSectionHeading">
              <p>{t("product.sizeAndFit")}</p>
              <h2 id="fit-heading">{t("product.fitHeading")}</h2>
            </div>
            <dl className="fitFacts">
              {fit ? <div><dt>Fit</dt><dd>{fit}</dd></div> : null}
              {stretch ? <div><dt>Stretch</dt><dd>{stretch}</dd></div> : null}
              {fabricWeight ? <div><dt>Fabric weight</dt><dd>{fabricWeight}</dd></div> : null}
            </dl>
            <p className="fitDisclaimer">{t("product.fitDisclaimer")}</p>
          </section>
        ) : null}

        <section className="commerceDetailSection" aria-labelledby="condition-heading">
          <div className="commerceSectionHeading">
            <p>{t("product.condition")}</p>
            <h2 id="condition-heading">{t("product.condition")}: {product.condition}</h2>
          </div>
          {conditionSummary ? <p className="commerceBodyCopy">{conditionSummary}</p> : null}
          {defects.length ? (
            <div className="visibleWear">
              <h3>{t("product.visibleWear")}</h3>
              <ul>
                {defects.map((defect, index) => (
                  <li key={`${defect.type}-${index}`}>
                    {optionalDisplayValue(defect.description) ?? displayValue(defect.type)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {description || sellingPoints.length ? (
          <section className="commerceDetailSection" aria-labelledby="description-heading">
            <div className="commerceSectionHeading">
              <p>{t("product.itemDetails")}</p>
              <h2 id="description-heading">{t("product.about")}</h2>
            </div>
            {description ? <p className="commerceBodyCopy">{description}</p> : null}
            {sellingPoints.length ? <ul className="commerceSellingPoints">
              {sellingPoints.map((point) => <li key={point}>{point}</li>)}
            </ul> : null}
          </section>
        ) : null}

        <section className="commerceDetailSection" aria-labelledby="delivery-heading">
          <div className="commerceSectionHeading">
            <p>{t("product.handoff")}</p>
            <h2 id="delivery-heading">{t("product.handoffHeading")}</h2>
          </div>
          <div className="deliveryOptions">
            <section>
              <h3>{t("product.collection")}</h3>
              <p>{t("product.collectionBody")}</p>
            </section>
            <section>
              <h3>{t("product.localDelivery")}</h3>
              <p>{t("product.localDeliveryBody")}</p>
            </section>
            <section>
              <h3>{t("product.support")}</h3>
              <p>{t("product.supportBody")}</p>
            </section>
          </div>
          <p className="deliveryFootnote">{t("product.footnote")}</p>
        </section>

        {related.length ? (
          <section className="relatedSection">
            <div className="relatedHeading">
              <h2>{t("product.related")}</h2>
              <Link href={sellerRef ? `/?ref=${sellerRef}` : "/"}>{t("product.seeAll")}</Link>
            </div>
            <div className="relatedGrid">
              {related.map((item) => (
                <article key={item.code}>
                  <Link href={sellerRef ? `/p/${item.code}?ref=${sellerRef}` : `/p/${item.code}`}>
                    {item.image ? <img src={item.image} alt={item.title} loading="lazy" /> : null}
                    <strong>{item.title}</strong>
                    <span>{formatPrice(item.price)}</span>
                    <small>Size {item.size}{item.condition ? ` · ${item.condition}` : ""}</small>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function displayValue(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
