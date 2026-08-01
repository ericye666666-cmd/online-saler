import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin, MessageCircle, PackageCheck, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { BrandLogo } from "../../components/brand-logo";
import { ShareActions } from "../../components/share-actions";
import { ReferralTracker } from "../../components/referral-tracker";
import { SiteHeader } from "../../components/site-header";
import { CatalogBuyAction } from "../../catalog-buy-action";
import {
  formatPrice,
  normalizeSellerRef,
  normalizeTrackingParam,
  SITE_URL,
  whatsappShareUrl,
} from "../../data/products";
import {
  getPublishedProduct,
  listPublishedProducts,
} from "../../../db/catalog";

type ProductPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ref?: string; source?: string; campaign?: string; utm_source?: string; utm_campaign?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { code } = await params;
  const product = await getPublishedProduct(code);
  if (!product) return {};

  const brandedTitle = product.brand === "Unbranded" ? product.title : `${product.brand} ${product.title}`;
  const title = `${brandedTitle} · ${formatPrice(product.price)}`;
  const productType = product.shoeType ?? product.bagType ?? product.textileType;
  const description = `${product.brand}${productType ? `, ${productType}` : ""}, ${product.size}, ${product.condition}. Available from ${product.store}.`;

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
      images: [
        {
          url: product.ogImage,
          width: 1200,
          height: 630,
          type: "image/jpeg",
          alt: `${product.title} product card`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [product.ogImage],
    },
  };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const product = await getPublishedProduct(code);
  if (!product) notFound();

  const sellerRef = normalizeSellerRef(query.ref);
  const source = normalizeTrackingParam(query.source ?? query.utm_source);
  const campaign = normalizeTrackingParam(query.campaign ?? query.utm_campaign);
  const products = await listPublishedProducts();
  const related = products.filter((item) => item.code !== product.code).slice(0, 4);
  const supportPhone = process.env.DIRECT_LOOP_SUPPORT_WHATSAPP ?? "";
  const detail = product.detail;
  const galleryAssets = detail?.assets.filter((asset) => ["FRONT_MAIN", "BACK_MAIN", "MEASUREMENT_GUIDE"].includes(asset.type)).slice(0, 3) ?? [];
  const detailAssets = detail?.assets.filter((asset) => ["BACK_MAIN", "MEASUREMENT_GUIDE", "FIT_GUIDE", "CONDITION_GUIDE"].includes(asset.type)) ?? [];

  return (
    <main className="productPage">
      <ReferralTracker sellerRef={sellerRef} productCode={product.code} source={source} campaign={campaign} />
      <SiteHeader sellerRef={sellerRef} />

      <div className="productPageShell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href={sellerRef ? `/?ref=${sellerRef}` : "/"}>Home</Link>
          <ChevronRight size={14} />
          <Link href={`/?category=${product.category}${sellerRef ? `&ref=${sellerRef}` : ""}`}>
            {product.category}
          </Link>
          <ChevronRight size={14} />
          <span>{product.title}</span>
        </nav>

        <section className="productDetailGrid">
          <div className="productGallery">
            <div className="thumbnailRail" aria-label="Product image thumbnails">
              {galleryAssets.map((asset, index) => (
                <a key={asset.id} className={index === 0 ? "active" : ""} href={index === 0 ? "#product-main-image" : `#detail-asset-${asset.type.toLowerCase()}`}>
                  <img src={asset.image} alt={`${product.title} ${detailAssetLabel(asset.type)}`} />
                </a>
              ))}
            </div>
            <div id="product-main-image" className="mainProductImage">
              <img src={product.image} alt={product.title} width={620} height={826} />
            </div>
          </div>

          <div className="productPurchasePanel">
            <div className="titleAndStatus">
              <div>
                <p className="detailBrand"><BrandLogo brand={product.brand} /> {product.brand}</p>
                <h1>{product.title}</h1>
                <strong>{formatPrice(product.price)}</strong>
              </div>
              <span className={`detailStatus ${product.status.toLowerCase()}`}>
                <i /> {product.status}
              </span>
            </div>

            <p className="productDescription">{product.description}</p>

            {detail?.sellingPoints.length ? (
              <ul className="sellingPointList">
                {detail.sellingPoints.map((point) => <li key={point}>{point}</li>)}
              </ul>
            ) : null}

            <CatalogBuyAction product={product} />

            <dl className="attributeList">
              <div><dt>Brand</dt><dd>{product.brand}</dd></div>
              {product.shoeType ? <div><dt>Shoe type</dt><dd>{product.shoeType}</dd></div> : null}
              {product.bagType ? <div><dt>Bag type</dt><dd>{product.bagType}</dd></div> : null}
              {product.textileType ? <div><dt>Textile type</dt><dd>{product.textileType}</dd></div> : null}
              <div><dt>Size</dt><dd>{product.size}</dd></div>
              {!detail ? <div><dt>Material</dt><dd>{product.material}</dd></div> : null}
              {detail ? <div><dt>Fit</dt><dd>{detail.fitType}</dd></div> : null}
              {detail ? <div><dt>Stretch</dt><dd>{detail.stretchLevel}</dd></div> : null}
              {detail ? <div><dt>Fabric weight</dt><dd>{detail.fabricWeight}</dd></div> : null}
              <div><dt>Condition</dt><dd>{product.condition}</dd></div>
              <div><dt>Colour</dt><dd>{product.color}</dd></div>
              <div>
                <dt>Location</dt>
                <dd><MapPin size={15} /> {product.store}</dd>
              </div>
              <div><dt>Item code</dt><dd>{product.code}</dd></div>
              {sellerRef ? <div><dt>Seller reference</dt><dd>{sellerRef}</dd></div> : null}
            </dl>

            <ShareActions
              product={product}
              sellerRef={sellerRef}
              supportPhone={supportPhone}
            />

            <div className="sharingSteps">
              <h2>How sharing works</h2>
              <ol>
                <li><MessageCircle size={20} /> Tap Share clickable card and choose WhatsApp.</li>
                <li><Send size={20} /> Send the link by itself—WhatsApp builds the image card.</li>
                <li><PackageCheck size={20} /> The customer taps the card to open the live product page.</li>
              </ol>
            </div>
          </div>
        </section>

        {detail ? (
          <section className="structuredDetailSection" aria-labelledby="verified-product-details">
            <div className="structuredDetailHeading">
              <div>
                <p>Verified item details</p>
                <h2 id="verified-product-details">Measurements, fit and condition</h2>
              </div>
              <span>Measured flat · one item only</span>
            </div>

            {detailAssets.length ? (
              <div className="detailAssetGrid">
                {detailAssets.map((asset) => (
                  <figure key={asset.id} id={`detail-asset-${asset.type.toLowerCase()}`}>
                    <img src={asset.image} alt={`${product.title} ${detailAssetLabel(asset.type)}`} loading="lazy" />
                    <figcaption>{detailAssetLabel(asset.type)}</figcaption>
                  </figure>
                ))}
              </div>
            ) : null}

            <div className="detailFactsGrid">
              <section>
                <h3>Garment measurements</h3>
                <p>{detail.measurementSummary}</p>
                <dl>
                  {detail.measurements.map((measurement) => (
                    <div key={measurement.type}><dt>{measurementLabel(measurement.type)}</dt><dd>{measurement.valueCm ? `${measurement.valueCm} cm` : "Not confirmed"}</dd></div>
                  ))}
                </dl>
              </section>

              <section>
                <h3>Fit guidance</h3>
                <p>{detail.fitSummary}</p>
                <dl>
                  <DetailRange label="Suggested body chest" range={detail.bodyRanges.chest} unit="cm" />
                  <DetailRange label="Suggested body waist" range={detail.bodyRanges.waist} unit="cm" />
                  <DetailRange label="Suggested body hip" range={detail.bodyRanges.hip} unit="cm" />
                  <DetailRange label="Height reference" range={detail.bodyRanges.height} unit="cm" />
                  <DetailRange label="Weight reference" range={detail.bodyRanges.weight} unit="kg" />
                  {detail.expectedFit ? <div><dt>Expected fit</dt><dd>{detail.expectedFit}</dd></div> : null}
                </dl>
              </section>

              <section>
                <h3>Condition disclosure</h3>
                <p>{detail.conditionSummary}</p>
                {detail.defects.length ? (
                  <ul>{detail.defects.map((defect, index) => <li key={`${defect.type}-${index}`}>{defect.description || displayValue(defect.type)}</li>)}</ul>
                ) : <p className="detailMuted">No defects were recorded during calibration.</p>}
              </section>

              <section>
                <h3>Style and checks</h3>
                {detail.styleTags.length ? <div className="detailTags">{detail.styleTags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                {detail.warnings.length ? <ul>{detail.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="detailMuted">No additional warnings.</p>}
                {detail.missingInformation.length ? <p className="detailMuted">Not confirmed: {detail.missingInformation.join(", ")}</p> : null}
              </section>
            </div>

            {detail.sourceImages.length ? (
              <section className="sourceImageSection" aria-labelledby="source-item-images">
                <div>
                  <p>Original item evidence</p>
                  <h3 id="source-item-images">Label, detail and defect photos</h3>
                </div>
                <div className="sourceImageGrid">
                  {detail.sourceImages.map((image) => (
                    <figure key={image.id}>
                      <img src={image.image} alt={`${product.title} ${sourceImageLabel(image.type)}`} loading="lazy" />
                      <figcaption>{sourceImageLabel(image.type)}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.sizeDisclaimer ? <p className="sizeDisclaimer">{detail.sizeDisclaimer}</p> : null}

            <section className="fulfilmentNotice" aria-labelledby="delivery-and-support">
              <h3 id="delivery-and-support">Delivery and after-sales</h3>
              <ul>
                <li>Collection or delivery options are confirmed during checkout.</li>
                <li>This is a unique second-hand item; review the measurements, condition and defect photos before purchase.</li>
                <li>Contact Direct Loop support promptly if the received item does not match the approved listing.</li>
              </ul>
            </section>
          </section>
        ) : null}

        <section className="relatedSection">
          <div className="relatedHeading">
            <h2>You might also like</h2>
            <Link href={sellerRef ? `/?ref=${sellerRef}` : "/"}>See all items</Link>
          </div>
          <div className="relatedGrid">
            {related.map((item) => (
              <article key={item.code}>
                <Link href={sellerRef ? `/p/${item.code}?ref=${sellerRef}` : `/p/${item.code}`}>
                  <img src={item.image} alt={item.title} width={260} height={346} loading="lazy" />
                  <strong>{item.title}</strong>
                  <span>{formatPrice(item.price)}</span>
                  <small>{item.brand}{item.shoeType || item.bagType || item.textileType ? ` · ${item.shoeType ?? item.bagType ?? item.textileType}` : ""} · {item.size}</small>
                </Link>
                <a
                  className="relatedShare"
                  href={whatsappShareUrl(item, sellerRef)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Share ${item.title} on WhatsApp`}
                >
                  <MessageCircle size={18} fill="currentColor" />
                </a>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function DetailRange({ label, range, unit }: { label: string; range: { min: number | null; max: number | null }; unit: string }) {
  if (range.min === null || range.max === null) return null;
  return <div><dt>{label}</dt><dd>{range.min}–{range.max} {unit}</dd></div>;
}

function detailAssetLabel(type: string) {
  return ({ FRONT_MAIN: "front view", BACK_MAIN: "back view", MEASUREMENT_GUIDE: "measurement guide", FIT_GUIDE: "fit guide", CONDITION_GUIDE: "condition guide", SHARE_CARD: "share card" } as Record<string, string>)[type] ?? displayValue(type);
}

function sourceImageLabel(type: string) {
  return ({ LABEL: "original label photo", DETAIL: "original detail photo", DEFECT: "original defect photo" } as Record<string, string>)[type] ?? displayValue(type);
}

function measurementLabel(type: string) {
  return ({ LENGTH: "Length", CHEST_WIDTH: "Chest width", SHOULDER_WIDTH: "Shoulder width", SLEEVE_LENGTH: "Sleeve length", WAIST: "Waist width", HIP: "Hip width", INSEAM: "Inseam", OUTSEAM: "Outseam", LEG_OPENING: "Leg opening", THIGH_WIDTH: "Thigh width" } as Record<string, string>)[type] ?? displayValue(type);
}

function displayValue(value: string) {
  return value.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ");
}
