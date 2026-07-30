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
  SITE_URL,
  whatsappShareUrl,
} from "../../data/products";
import {
  getPublishedProduct,
  listPublishedProducts,
} from "../../../db/catalog";

type ProductPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ref?: string }>;
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
  const products = await listPublishedProducts();
  const related = products.filter((item) => item.code !== product.code).slice(0, 4);
  const supportPhone = process.env.DIRECT_LOOP_SUPPORT_WHATSAPP ?? "";

  return (
    <main className="productPage">
      <ReferralTracker sellerRef={sellerRef} productCode={product.code} />
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
              <button className="active" type="button">
                <img src={product.image} alt={`${product.title} front view`} />
              </button>
              <button className="zoomThumb" type="button">
                <img src={product.image} alt={`${product.title} detail view`} />
              </button>
              <button className="codeThumb" type="button">
                <PackageCheck size={26} />
                <span>{product.code.slice(-4)}</span>
              </button>
            </div>
            <div className="mainProductImage">
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

            <CatalogBuyAction product={product} />

            <dl className="attributeList">
              <div><dt>Brand</dt><dd>{product.brand}</dd></div>
              {product.shoeType ? <div><dt>Shoe type</dt><dd>{product.shoeType}</dd></div> : null}
              {product.bagType ? <div><dt>Bag type</dt><dd>{product.bagType}</dd></div> : null}
              {product.textileType ? <div><dt>Textile type</dt><dd>{product.textileType}</dd></div> : null}
              <div><dt>Size</dt><dd>{product.size}</dd></div>
              <div><dt>Material</dt><dd>{product.material}</dd></div>
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
