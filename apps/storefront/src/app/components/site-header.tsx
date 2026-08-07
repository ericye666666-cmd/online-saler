"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  Menu,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { categories } from "../data/products";
import { SellerHeaderAction } from "./seller-header-action";
import { CART_STORAGE_KEY, CART_UPDATED_EVENT, cartItemCount, parseCartSnapshot } from "../storefront-cart";

type CatalogCategory = (typeof categories)[number];

export type BrowseSelection = {
  category: CatalogCategory;
  shoeType?: string;
  bagType?: string;
  textileType?: string;
  brand?: string;
};

type SiteHeaderProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  sellerRef?: string;
  selectedCategory?: CatalogCategory;
  onSelectCategory?: (category: CatalogCategory) => void;
  onSelectBrowse?: (selection: BrowseSelection) => void;
  productDetail?: boolean;
};

type MenuItem = BrowseSelection & { label: string };

const navigationGroups: Array<{
  id: string;
  label: string;
  items: MenuItem[];
  featuredTitle: string;
  featured: MenuItem[];
  cards: Array<{ label: string; image: string; selection: BrowseSelection }>;
}> = [
  {
    id: "clothing",
    label: "Clothing",
    items: [
      { label: "Dresses", category: "Dresses" },
      { label: "Tops", category: "Tops" },
      { label: "Jackets", category: "Jackets" },
      { label: "Knitwear", category: "Knitwear" },
      { label: "Trousers", category: "Trousers" },
      { label: "Skirts", category: "Skirts" },
    ],
    featuredTitle: "Shop the edit",
    featured: [
      { label: "Office-ready pieces", category: "Jackets" },
      { label: "Weekend dresses", category: "Dresses" },
      { label: "Denim and trousers", category: "Trousers" },
      { label: "Light layers", category: "Knitwear" },
    ],
    cards: [
      { label: "Dresses", image: "/products/920260718001.webp", selection: { category: "Dresses" } },
      { label: "Jackets", image: "/products/920260718002.webp", selection: { category: "Jackets" } },
      { label: "Knitwear", image: "/products/920260718003.webp", selection: { category: "Knitwear" } },
      { label: "Tops", image: "/products/920260718004.webp", selection: { category: "Tops" } },
    ],
  },
  {
    id: "shoes",
    label: "Shoes",
    items: [
      { label: "All shoes", category: "Shoes" },
      { label: "Sneakers", category: "Shoes", shoeType: "Sneakers" },
      { label: "Sports shoes", category: "Shoes", shoeType: "Sports shoes" },
      { label: "High heels", category: "Shoes", shoeType: "High heels" },
      { label: "Leather shoes", category: "Shoes", shoeType: "Leather shoes" },
      { label: "Boots", category: "Shoes", shoeType: "Boots" },
      { label: "Kids' shoes", category: "Shoes", shoeType: "Kids' shoes" },
    ],
    featuredTitle: "Popular brands",
    featured: [
      { label: "Nike", category: "Shoes", brand: "Nike" },
      { label: "Adidas", category: "Shoes", brand: "Adidas" },
      { label: "Jordan", category: "Shoes", brand: "Jordan" },
      { label: "New Balance", category: "Shoes", brand: "New Balance" },
    ],
    cards: [
      { label: "Sneakers", image: "/products/920260718006.webp", selection: { category: "Shoes", shoeType: "Sneakers" } },
      { label: "EU 39", image: "/products/920260718006.webp", selection: { category: "Shoes" } },
      { label: "90% condition", image: "/products/920260718006.webp", selection: { category: "Shoes" } },
      { label: "All shoes", image: "/products/920260718006.webp", selection: { category: "Shoes" } },
    ],
  },
  {
    id: "bags",
    label: "Bags",
    items: [
      { label: "All bags", category: "Bags" },
      { label: "Women's handbags", category: "Bags", bagType: "Women's handbags" },
      { label: "Backpacks", category: "Bags", bagType: "Backpacks" },
      { label: "Laptop bags", category: "Bags", bagType: "Laptop bags" },
      { label: "Tote bags", category: "Bags", bagType: "Tote bags" },
      { label: "Shoulder bags", category: "Bags", bagType: "Shoulder bags" },
      { label: "Crossbody bags", category: "Bags", bagType: "Crossbody bags" },
      { label: "Travel bags", category: "Bags", bagType: "Travel bags" },
    ],
    featuredTitle: "Popular now",
    featured: [
      { label: "Black bags", category: "Bags" },
      { label: "Everyday handbags", category: "Bags", bagType: "Women's handbags" },
      { label: "Work and laptop bags", category: "Bags", bagType: "Laptop bags" },
      { label: "Travel-ready", category: "Bags", bagType: "Travel bags" },
    ],
    cards: [
      { label: "Handbags", image: "/products/920260718005.webp", selection: { category: "Bags", bagType: "Women's handbags" } },
      { label: "Black bags", image: "/products/920260718005.webp", selection: { category: "Bags" } },
      { label: "Work bags", image: "/products/920260718005.webp", selection: { category: "Bags", bagType: "Laptop bags" } },
      { label: "All bags", image: "/products/920260718005.webp", selection: { category: "Bags" } },
    ],
  },
  {
    id: "home",
    label: "Home",
    items: [
      { label: "All home textiles", category: "Home Textiles" },
      { label: "Mattress pads", category: "Home Textiles", textileType: "Mattress pads" },
      { label: "Lightweight blankets", category: "Home Textiles", textileType: "Lightweight blankets" },
      { label: "Heavy blankets", category: "Home Textiles", textileType: "Heavy blankets" },
      { label: "Bed sheets", category: "Home Textiles", textileType: "Bed sheets" },
      { label: "Curtains", category: "Home Textiles", textileType: "Curtains" },
      { label: "Duvets", category: "Home Textiles", textileType: "Duvets" },
      { label: "Towels", category: "Home Textiles", textileType: "Towels" },
    ],
    featuredTitle: "For the home",
    featured: [
      { label: "Bedroom refresh", category: "Home Textiles", textileType: "Bed sheets" },
      { label: "Warm blankets", category: "Home Textiles", textileType: "Heavy blankets" },
      { label: "Curtains", category: "Home Textiles", textileType: "Curtains" },
      { label: "Bath textiles", category: "Home Textiles", textileType: "Towels" },
    ],
    cards: [
      { label: "Bed sheets", image: "/products/920260718003.webp", selection: { category: "Home Textiles", textileType: "Bed sheets" } },
      { label: "Blankets", image: "/products/920260718003.webp", selection: { category: "Home Textiles", textileType: "Heavy blankets" } },
      { label: "Curtains", image: "/products/920260718002.webp", selection: { category: "Home Textiles", textileType: "Curtains" } },
      { label: "All home", image: "/products/920260718004.webp", selection: { category: "Home Textiles" } },
    ],
  },
  {
    id: "brands",
    label: "Brands",
    items: [
      { label: "Nike", category: "All", brand: "Nike" },
      { label: "Adidas", category: "All", brand: "Adidas" },
      { label: "Jordan", category: "All", brand: "Jordan" },
      { label: "Puma", category: "All", brand: "Puma" },
      { label: "New Balance", category: "All", brand: "New Balance" },
      { label: "Reebok", category: "All", brand: "Reebok" },
      { label: "Under Armour", category: "All", brand: "Under Armour" },
      { label: "Fila", category: "All", brand: "Fila" },
    ],
    featuredTitle: "Browse by department",
    featured: [
      { label: "Branded shoes", category: "Shoes" },
      { label: "Clothing", category: "Tops" },
      { label: "Bags", category: "Bags" },
      { label: "Unbranded finds", category: "All", brand: "Unbranded" },
    ],
    cards: [
      { label: "Nike", image: "/products/920260718006.webp", selection: { category: "All", brand: "Nike" } },
      { label: "Adidas", image: "/products/920260718006.webp", selection: { category: "All", brand: "Adidas" } },
      { label: "Shoes", image: "/products/920260718006.webp", selection: { category: "Shoes" } },
      { label: "All brands", image: "/products/920260718002.webp", selection: { category: "All" } },
    ],
  },
  {
    id: "trending",
    label: "Trending",
    items: [
      { label: "All fresh finds", category: "All" },
      { label: "Easy-to-share dresses", category: "Dresses" },
      { label: "Everyday tops", category: "Tops" },
      { label: "Strong-margin shoes", category: "Shoes" },
      { label: "Popular bags", category: "Bags" },
      { label: "Home refresh", category: "Home Textiles" },
    ],
    featuredTitle: "Seller opportunities",
    featured: [
      { label: "Under KSh 500", category: "Tops" },
      { label: "One-of-one clothing", category: "Dresses" },
      { label: "Ready to share", category: "All" },
      { label: "Fresh from Kikuyu", category: "All" },
    ],
    cards: [
      { label: "New today", image: "/products/920260718001.webp", selection: { category: "All" } },
      { label: "Dresses", image: "/products/920260718001.webp", selection: { category: "Dresses" } },
      { label: "Bags", image: "/products/920260718005.webp", selection: { category: "Bags" } },
      { label: "Shoes", image: "/products/920260718006.webp", selection: { category: "Shoes" } },
    ],
  },
] as const;

function groupForCategory(category: CatalogCategory) {
  if (category === "Shoes") return "shoes";
  if (category === "Bags") return "bags";
  if (category === "Home Textiles") return "home";
  if (["Dresses", "Tops", "Jackets", "Knitwear", "Trousers", "Skirts"].includes(category)) return "clothing";
  return "";
}

export function SiteHeader({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  sellerRef,
  selectedCategory = "All",
  onSelectCategory,
  onSelectBrowse,
  productDetail = false,
}: SiteHeaderProps) {
  const [localSearch, setLocalSearch] = useState("");
  const [desktopMenuId, setDesktopMenuId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobilePanelId, setMobilePanelId] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const value = searchValue ?? localSearch;
  const homeHref = sellerRef ? `/?ref=${encodeURIComponent(sellerRef)}` : "/";
  const activeDesktopGroup = useMemo(
    () => navigationGroups.find((group) => group.id === desktopMenuId),
    [desktopMenuId],
  );
  const activeMobileGroup = useMemo(
    () => navigationGroups.find((group) => group.id === mobilePanelId),
    [mobilePanelId],
  );
  const selectedGroupId = groupForCategory(selectedCategory);

  useEffect(() => {
    if (!desktopMenuId) return;

    function handlePointerDown(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setDesktopMenuId(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDesktopMenuId(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopMenuId]);

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.classList.add("dialogOpen");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mobilePanelId) setMobilePanelId(null);
        else setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("dialogOpen");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, mobilePanelId]);

  useEffect(() => {
    function refreshCartCount() {
      setCartCount(cartItemCount(parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY))));
    }
    refreshCartCount();
    window.addEventListener(CART_UPDATED_EVENT, refreshCartCount);
    window.addEventListener("storage", refreshCartCount);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, refreshCartCount);
      window.removeEventListener("storage", refreshCartCount);
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!onSearchChange) return;
    event.preventDefault();
    onSearchSubmit?.(value);
    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" });
  }

  function chooseSelection(selection: BrowseSelection) {
    setDesktopMenuId(null);
    setMobileOpen(false);
    setMobilePanelId(null);
    if (onSelectBrowse) {
      onSelectBrowse(selection);
    } else if (onSelectCategory) {
      onSelectCategory(selection.category);
    } else {
      const params = new URLSearchParams();
      if (selection.category !== "All") params.set("category", selection.category);
      if (sellerRef) params.set("ref", sellerRef);
      window.location.assign(`/${params.size ? `?${params.toString()}` : ""}`);
    }
    requestAnimationFrame(() => {
      document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function updateSearch(nextValue: string) {
    setLocalSearch(nextValue);
    onSearchChange?.(nextValue);
  }

  function handleMobileBack() {
    if (window.history.length > 1) window.history.back();
    else window.location.assign(homeHref);
  }

  return (
    <header className="siteHeader depopHeader" ref={headerRef}>
      <div className={`depopHeaderMain ${productDetail ? "productDetailHeaderMain" : ""}`}>
        <div className="depopMobileNavLeft">
          {productDetail ? (
            <button type="button" onClick={handleMobileBack} aria-label="Go back">
              <ArrowLeft size={24} />
            </button>
          ) : null}
          <button
            className="depopMobileMenuButton"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
        </div>

        <Link
          href={homeHref}
          className="wordmark depopWordmark"
          aria-label="Direct Loop home"
        >
          Direct Loop
        </Link>

        <form className="headerSearch depopSearch" action="/" onSubmit={handleSubmit}>
          <Search size={20} aria-hidden="true" />
          <input
            name="q"
            value={value}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search for items, brands or styles"
            aria-label="Search catalog"
          />
        </form>

        <div className="depopHeaderActions">
          <button className="depopIconButton" type="button" aria-label="Saved items">
            <Heart size={24} />
          </button>
          <Link className="depopIconButton depopCartIcon" href="/cart" aria-label={`Open cart${cartCount ? `, ${cartCount} items` : ""}`}>
            <ShoppingBag size={23} />
            {cartCount ? <span>{cartCount}</span> : null}
            <small className="depopMiniCart">Cart has {cartCount} {cartCount === 1 ? "item" : "items"}. Review before payment.</small>
          </Link>
          <SellerHeaderAction />
        </div>

        <div className="depopMobileNavRight">
          <button
            className="depopMobileSearchButton"
            type="button"
            onClick={() => setMobileSearchOpen((current) => !current)}
            aria-label="Search"
            aria-expanded={mobileSearchOpen}
          >
            <Search size={23} />
          </button>
          <Link className="depopCartIcon mobile" href="/cart" aria-label={`Open cart${cartCount ? `, ${cartCount} items` : ""}`}>
            <ShoppingBag size={23} />
            {cartCount ? <span>{cartCount}</span> : null}
          </Link>
        </div>
      </div>

      {mobileSearchOpen ? (
        <form className="depopMobileSearch" action="/" onSubmit={handleSubmit}>
          <Search size={20} />
          <input
            value={value}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search for anything"
            aria-label="Search catalog"
            autoFocus
          />
        </form>
      ) : null}

      <nav className="depopCategoryNav" aria-label="Main categories">
        <div className="depopCategoryNavInner" role="menubar">
          {navigationGroups.map((group) => {
            const open = desktopMenuId === group.id;
            return (
              <button
                type="button"
                role="menuitem"
                key={group.id}
                className={`${selectedGroupId === group.id ? "selected" : ""} ${open ? "open" : ""}`}
                aria-expanded={open}
                aria-controls="depop-category-mega-menu"
                onClick={() => setDesktopMenuId((current) => current === group.id ? null : group.id)}
              >
                {group.label}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            className="dropNavItem"
            onClick={() => chooseSelection({ category: "All" })}
          >
            Daily drop
          </button>
        </div>
      </nav>

      {activeDesktopGroup ? (
        <section
          className="depopMegaMenu"
          id="depop-category-mega-menu"
          aria-label={`${activeDesktopGroup.label} menu`}
        >
          <div className="depopMegaMenuInner">
            <div className="depopMegaColumn depopMegaShop">
              <h2>Shop by category</h2>
              <div className="depopMegaLinks twoColumns">
                {activeDesktopGroup.items.map((item) => (
                  <button type="button" key={`${item.label}-${item.shoeType ?? item.bagType ?? item.textileType ?? "all"}`} onClick={() => chooseSelection(item)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <button className="depopSeeAll" type="button" onClick={() => chooseSelection(activeDesktopGroup.items[0])}>
                See all {activeDesktopGroup.label.toLowerCase()}
              </button>
            </div>

            <div className="depopMegaColumn depopMegaFeatured">
              <h2>{activeDesktopGroup.featuredTitle}</h2>
              <div className="depopMegaLinks">
                {activeDesktopGroup.featured.map((item) => (
                  <button type="button" key={`${item.label}-${item.brand ?? "feature"}`} onClick={() => chooseSelection(item)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="depopMegaCards" aria-label="Featured edits">
              {activeDesktopGroup.cards.map((card) => (
                <button type="button" key={card.label} onClick={() => chooseSelection(card.selection)}>
                  <img src={card.image} alt="" />
                  <span>{card.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {mobileOpen ? (
        <div className="depopMobileMenuLayer">
          <button className="depopMobileMenuBackdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <section className="depopMobileMenu" role="dialog" aria-modal="true" aria-label="Main menu">
            {activeMobileGroup ? (
              <>
                <div className="depopMobileMenuTop subpage">
                  <button type="button" onClick={() => setMobilePanelId(null)} aria-label="Back"><ArrowLeft size={24} /></button>
                  <strong>{activeMobileGroup.label}</strong>
                  <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close"><X size={25} /></button>
                </div>
                <div className="depopMobilePanelScroll">
                  <h2>Shop by category</h2>
                  {activeMobileGroup.items.map((item) => (
                    <button className="depopMobileCategoryLink" type="button" key={`${item.label}-${item.shoeType ?? item.bagType ?? item.textileType ?? "all"}`} onClick={() => chooseSelection(item)}>
                      <span>{item.label}</span>
                      <ArrowRight size={20} />
                    </button>
                  ))}
                  <h2>{activeMobileGroup.featuredTitle}</h2>
                  {activeMobileGroup.featured.map((item) => (
                    <button className="depopMobileCategoryLink" type="button" key={`${item.label}-${item.brand ?? "feature"}`} onClick={() => chooseSelection(item)}>
                      <span>{item.label}</span>
                      <ArrowRight size={20} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="depopMobileMenuTop">
                  <Link href={sellerRef ? `/?ref=${encodeURIComponent(sellerRef)}` : "/"} className="depopWordmark">Direct Loop</Link>
                  <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close"><X size={25} /></button>
                </div>
                <div className="depopMobileMenuActions">
                  <SellerHeaderAction variant="mobile-menu" />
                </div>
                <div className="depopMobileMenuList">
                  {navigationGroups.map((group) => (
                    <button type="button" key={group.id} onClick={() => setMobilePanelId(group.id)}>
                      <span>{group.label}</span>
                      <ArrowRight size={23} />
                    </button>
                  ))}
                  <button className="dropNavItem" type="button" onClick={() => chooseSelection({ category: "All" })}>
                    <span>Daily drop</span>
                    <ArrowRight size={23} />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </header>
  );
}
