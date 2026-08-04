import Link from "next/link";
import { MapPin } from "lucide-react";
import type { AffiliateProduct } from "../../affiliate/affiliate-client";
import type { Product } from "../data/products";
import { ProductShareSheet } from "./product-share-sheet";

export function AffiliatePublicProductCard({
  product,
  affiliateCode,
  source,
  campaign,
}: {
  product: AffiliateProduct;
  affiliateCode: string;
  source: string;
  campaign: string;
}) {
  const params = new URLSearchParams({ ref: affiliateCode, source, placement: "product-grid", campaign });
  const fullProduct: Product = {
    code: product.code,
    title: product.title,
    category: "All",
    brand: "Direct Loop",
    price: product.price,
    size: product.size,
    material: "See product details",
    color: "See product photos",
    store: "Kikuyu",
    status: product.status,
    condition: "Very good",
    image: product.image,
    ogImage: product.image,
    description: "A curated one-of-one Direct Loop item.",
  };
  return (
    <article className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      <Link href={`/p/${product.code}?${params.toString()}`} className="block aspect-square overflow-hidden bg-[#ece7df]">
        <img src={product.image} alt={product.title} className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]" />
      </Link>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3"><Link className="font-semibold" href={`/p/${product.code}?${params.toString()}`}>{product.title}</Link><ProductShareSheet product={fullProduct} compact className="rounded-full border p-2 hover:bg-muted" /></div>
        <p className="text-sm text-muted-foreground">Size {product.size}</p>
        <div className="flex items-center justify-between"><strong>KSh {product.price.toLocaleString("en-KE")}</strong><span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={13} /> Kikuyu</span></div>
      </div>
    </article>
  );
}
