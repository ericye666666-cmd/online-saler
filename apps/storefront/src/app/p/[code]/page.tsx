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
  const galleryAssets = detail?.assets.filter((asset) => ["FRONT_MAIN", "BACK_MAIN", "MODEL_DISPLAY"].includes(asset.type)).slice(0, 3) ?? [];
  const backAsset = detail?.assets.find((asset) => asset.type === "BACK_MAIN") ?? null;
  const modelAsset = detail?.assets.find((asset) => asset.type === "MODEL_DISPLAY") ?? null;
  const measurementAsset = detail?.assets.find((asset) => asset.type === "MEASUREMENT_GUIDE") ?? null;
  const deliveryAsset = detail?.assets.find((asset) => asset.type === "DELIVERY_GUIDE") ?? null;
  const detailPhotos = detail?.sourceImages.filter((image) => ["DETAIL", "DEFECT"].includes(image.type)) ?? [];

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
          <section className="structuredDetailSection simpleDetailPages" aria-labelledby="verified-product-details">
            <div className="structuredDetailHeading">
              <div>
                <p>Product details</p>
                <h2 id="verified-product-details">Six simple pages</h2>
              </div>
              <span>Actual item photos and flat measurements</span>
            </div>

            <DetailImagePage number={2} title="Back view" asset={backAsset} productTitle={product.title} />
            <DetailImagePage number={3} title="Model view" asset={modelAsset} productTitle={product.title} />

            <section className="simpleDetailPage" id="detail-asset-measurement_guide">
              <header><span>4</span><div><p>Size explanation</p><h3>Flat garment measurements</h3></div></header>
              <div className="measurementPageLayout">
                {measurementAsset ? <img src={measurementAsset.image} alt={`${product.title} measurement guide`} loading="lazy" /> : null}
                <div>
                  <p>{detail.measurementSummary}</p>
                  <dl className="measurementList">
                    {detail.measurements.map((measurement) => (
                      <div key={measurement.type}><dt>{measurementLabel(measurement.type)}</dt><dd>{measurement.valueCm ? `${measurement.valueCm} cm` : "Not confirmed"}</dd></div>
                    ))}
                  </dl>
                  <p className="detailMuted">These are flat garment measurements, not body or age recommendations. Compare them with an item that fits you well.</p>
                </div>
              </div>
            </section>

            <section className="simpleDetailPage" id="detail-asset-detail_gallery">
              <header><span>5</span><div><p>Detail photos</p><h3>Original item details and disclosed defects</h3></div></header>
              {detailPhotos.length ? (
                <div className="mobileDetailPhotoGrid">
                  {detailPhotos.map((image) => (
                    <figure key={image.id}>
                      <img src={image.image} alt={`${product.title} ${sourceImageLabel(image.type)}`} loading="lazy" />
                      <figcaption>{sourceImageLabel(image.type)}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : <p className="detailMuted">No additional detail photos were supplied.</p>}
              <div className="defectSummary">
                <strong>Condition: {product.condition}</strong>
                {detail.defects.length ? <ul>{detail.defects.map((defect, index) => <li key={`${defect.type}-${index}`}>{defect.description || displayValue(defect.type)}</li>)}</ul> : <p>No defects were recorded during calibration.</p>}
              </div>
            </section>

            <section className="simpleDetailPage" id="detail-asset-delivery_guide">
              <header><span>6</span><div><p>Delivery information</p><h3>Collection, delivery and support</h3></div></header>
              <div className="deliveryPageLayout">
                {deliveryAsset ? <img src={deliveryAsset.image} alt="Delivery information" loading="lazy" /> : null}
                <ul>
                  <li>Collection or delivery options are confirmed during checkout.</li>
                  <li>This is a unique second-hand item. Review the original photos and measurements before purchase.</li>
                  <li>Contact Direct Loop support promptly if the received item does not match the approved listing.</li>
                </ul>
              </div>
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

function DetailImagePage({ number, title, asset, productTitle }: { number: number; title: string; asset: { type: string; image: string } | null; productTitle: string }) {
  return (
    <section className="simpleDetailPage" id={`detail-asset-${asset?.type.toLowerCase() ?? title.toLowerCase().replaceAll(" ", "-")}`}>
      <header><span>{number}</span><div><p>{title}</p><h3>{productTitle}</h3></div></header>
      {asset ? <img className="simpleDetailHero" src={asset.image} alt={`${productTitle} ${title.toLowerCase()}`} loading="lazy" /> : <p className="detailMuted">This image is not available.</p>}
    </section>
  );
}

function detailAssetLabel(type: string) {
  return ({ FRONT_MAIN: "front view", BACK_MAIN: "back view", MODEL_DISPLAY: "model view", MEASUREMENT_GUIDE: "measurement guide", DETAIL_GALLERY: "detail photos", DELIVERY_GUIDE: "delivery guide" } as Record<string, string>)[type] ?? displayValue(type);
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
