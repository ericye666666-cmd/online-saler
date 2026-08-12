"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  Heart,
  MapPin,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  adultShoeSizes,
  apparelConditions,
  apparelSizes,
  bagTypes,
  categories,
  extendedShoeSizes,
  featuredShoeBrands,
  formatPrice,
  kidsShoeSizes,
  Product,
  shoeConditionGrades,
  shoeTypes,
  textileTypes,
} from "../data/products";
import { ProductCollectionButton, ProductShareSheet } from "./product-share-sheet";
import { ReferralTracker } from "./referral-tracker";
import { BrowseSelection, SiteHeader } from "./site-header";
import {
  CART_STORAGE_KEY,
  addCartItem,
  catalogProductToCartItem,
  notifyCartUpdated,
  parseCartSnapshot
} from "../storefront-cart";

type CatalogCategory = (typeof categories)[number];
type FilterMenu = "category" | "subcategory" | "brand" | "price" | "size" | "color" | "material" | "condition" | "store" | null;
type PopularChoice = BrowseSelection & { label: string };

const apparelConditionOptions = ["All", ...apparelConditions];
const shoeConditionOptions = ["All", ...shoeConditionGrades];
const priceOptions = ["All", "Under KSh 500", "KSh 500–799", "KSh 800+"];

const clothingCategories: CatalogCategory[] = ["Dresses", "Tops", "Jackets", "Knitwear", "Trousers", "Skirts"];

type ProductCardProps = {
  product: Product;
  isSaved: boolean;
  onToggleSaved: (code: string) => void;
  sellerRef?: string;
  source?: string;
  placement?: string;
  campaign?: string;
  priority?: boolean;
};

function ProductCard({ product, isSaved, onToggleSaved, sellerRef, source, placement, campaign, priority = false }: ProductCardProps) {
  const detailHref = sellerRef
    ? `/p/${product.code}?${new URLSearchParams({ ref: sellerRef, ...(source ? { source } : {}), ...(placement ? { placement } : {}), ...(campaign ? { campaign } : {}) }).toString()}`
    : `/p/${product.code}`;
  const [cartMessage, setCartMessage] = useState("");

  function addToCart() {
    if (product.status !== "Available") return;
    const snapshot = parseCartSnapshot(window.localStorage.getItem(CART_STORAGE_KEY));
    const nextSnapshot = addCartItem(snapshot, catalogProductToCartItem(product));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextSnapshot));
    notifyCartUpdated();
    setCartMessage(nextSnapshot.items.length === snapshot?.items.length ? "In cart" : "Added");
    window.setTimeout(() => setCartMessage(""), 1200);
  }

  return (
    <article className={`marketCard depopProductCard ${product.status !== "Available" ? "unavailable" : ""}`}>
      <div className="marketImageWrap depopProductImage group relative">
        <Link href={detailHref} aria-label={`View ${product.title}`}>
          <img
            src={product.image}
            alt={product.title}
            width={640}
            height={640}
            loading={priority ? "eager" : "lazy"}
          />
        </Link>
        {product.status !== "Available" ? <span className="depopSoldLabel">{product.status}</span> : null}
        <ProductCollectionButton product={product} />
      </div>

      <div className="marketCardBody depopProductBody">
        <div className="depopProductBrandRow">
          <p className="depopProductBrand">{product.brand}</p>
          <button
            className={`depopSaveButton ${isSaved ? "saved" : ""}`}
            type="button"
            onClick={() => onToggleSaved(product.code)}
            aria-label={isSaved ? `Remove ${product.title} from saved` : `Save ${product.title}`}
            aria-pressed={isSaved}
          >
            <Heart size={21} fill={isSaved ? "currentColor" : "none"} />
          </button>
        </div>
        <Link href={detailHref} className="depopProductTitle">{product.title}</Link>
        <p className="depopProductMeta">{product.size}</p>
        <strong className="depopProductPrice">{formatPrice(product.price)}</strong>
        <div className="depopProductBottom">
          <span className="depopProductLocation"><MapPin size={13} strokeWidth={1.6} /> {product.store}</span>
          <button
            className="depopCartButton"
            disabled={product.status !== "Available"}
            type="button"
            onClick={addToCart}
            aria-label={`Add ${product.title} to cart`}
          >
            <ShoppingBag size={16} />
            <span>{cartMessage || "Cart"}</span>
          </button>
          <ProductShareSheet
            className="whatsappIconButton depopShareButton"
            product={product}
            compact
          />
        </div>
      </div>
    </article>
  );
}

function OptionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`depopFilterOption ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <span>{active ? <Check size={14} /> : null}</span>
      {label}
    </button>
  );
}

export function CatalogApp({
  initialProducts,
  initialCategory = "All",
  sellerRef,
  source,
  placement,
  campaign,
}: {
  initialProducts: Product[];
  initialCategory?: CatalogCategory;
  sellerRef?: string;
  source?: string;
  placement?: string;
  campaign?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategory>(initialCategory);
  const [size, setSize] = useState("All");
  const [condition, setCondition] = useState("All");
  const [brand, setBrand] = useState("All");
  const [color, setColor] = useState("All");
  const [material, setMaterial] = useState("All");
  const [store, setStore] = useState("All");
  const [price, setPrice] = useState("All");
  const [shoeType, setShoeType] = useState("All");
  const [bagType, setBagType] = useState("All");
  const [textileType, setTextileType] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState("Newest first");
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<FilterMenu>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  const colors = useMemo(
    () => ["All", ...Array.from(new Set(initialProducts.map((product) => product.color))).sort()],
    [initialProducts],
  );
  const brands = useMemo(
    () => ["All", ...Array.from(new Set([...featuredShoeBrands, ...initialProducts.map((product) => product.brand)]))],
    [initialProducts],
  );
  const materials = useMemo(
    () => ["All", ...Array.from(new Set(initialProducts.map((product) => product.material))).sort()],
    [initialProducts],
  );
  const stores = useMemo(
    () => ["All", ...Array.from(new Set(initialProducts.map((product) => product.store))).sort()],
    [initialProducts],
  );
  const sizeOptions = category === "Shoes"
    ? ["All", ...kidsShoeSizes, ...adultShoeSizes, ...extendedShoeSizes]
    : apparelSizes;

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    document.body.classList.add("dialogOpen");
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("dialogOpen");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileFiltersOpen]);

  useEffect(() => {
    if (!openFilter) return;
    function closeOutside(event: MouseEvent) {
      if (!filterBarRef.current?.contains(event.target as Node)) setOpenFilter(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenFilter(null);
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openFilter]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = initialProducts.filter((product) => {
      const matchesQuery = !normalizedQuery || [
        product.title,
        product.category,
        product.brand,
        product.bagType,
        product.textileType,
        product.shoeType,
        product.size,
        product.material,
        product.color,
        product.code,
      ].join(" ").toLowerCase().includes(normalizedQuery);
      const matchesPrice =
        price === "All" ||
        (price === "Under KSh 500" && product.price < 500) ||
        (price === "KSh 500–799" && product.price >= 500 && product.price < 800) ||
        (price === "KSh 800+" && product.price >= 800);

      return matchesQuery &&
        (category === "All" || product.category === category) &&
        (brand === "All" || product.brand === brand) &&
        (color === "All" || product.color === color) &&
        (material === "All" || product.material === material) &&
        (store === "All" || product.store === store) &&
        (shoeType === "All" || product.shoeType === shoeType) &&
        (bagType === "All" || product.bagType === bagType) &&
        (textileType === "All" || product.textileType === textileType) &&
        (size === "All" || product.size === size) &&
        (condition === "All" || product.condition === condition) &&
        matchesPrice &&
        (!availableOnly || product.status === "Available");
    });

    const statusRank = (product: Product) => product.status === "Available" ? 0 : product.status === "Reserved" ? 1 : 2;
    if (sort === "Price: low to high") return [...matches].sort((a, b) => statusRank(a) - statusRank(b) || a.price - b.price);
    if (sort === "Price: high to low") return [...matches].sort((a, b) => statusRank(a) - statusRank(b) || b.price - a.price);
    return [...matches].sort((a, b) => statusRank(a) - statusRank(b));
  }, [availableOnly, bagType, brand, category, color, condition, initialProducts, material, price, query, shoeType, size, sort, store, textileType]);

  const activeFilterCount = [brand, color, material, price, shoeType, bagType, textileType, size, condition, store]
    .filter((item) => item !== "All").length + (availableOnly ? 1 : 0);
  const hasSubcategory = category === "Shoes" || category === "Bags" || category === "Home Textiles";
  const filterTypes: Array<Exclude<FilterMenu, null>> = [
    "category",
    ...(hasSubcategory ? ["subcategory" as const] : []),
    "brand",
    "price",
    "size",
    "color",
    "material",
    "condition",
    "store",
  ];
  const popularChoices: PopularChoice[] = category === "Shoes"
    ? featuredShoeBrands.slice(0, 5).map((item) => ({ label: item, category: "Shoes", brand: item }))
    : category === "Bags"
      ? bagTypes.slice(0, 5).map((item) => ({ label: item, category: "Bags", bagType: item }))
      : category === "Home Textiles"
        ? textileTypes.slice(0, 5).map((item) => ({ label: item, category: "Home Textiles", textileType: item }))
        : clothingCategories.map((item) => ({ label: item, category: item }));

  function updateCategoryInUrl(nextCategory: CatalogCategory) {
    const params = new URLSearchParams(window.location.search);
    if (nextCategory === "All") params.delete("category");
    else params.set("category", nextCategory);
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  function selectCategory(nextCategory: CatalogCategory) {
    setCategory(nextCategory);
    setSize("All");
    setCondition("All");
    setMaterial("All");
    setStore("All");
    setShoeType("All");
    setBagType("All");
    setTextileType("All");
    if (nextCategory !== "Shoes") setBrand("All");
    updateCategoryInUrl(nextCategory);
  }

  function applyBrowseSelection(selection: BrowseSelection) {
    setCategory(selection.category);
    setSize("All");
    setCondition("All");
    setColor("All");
    setMaterial("All");
    setStore("All");
    setPrice("All");
    setBrand(selection.brand ?? "All");
    setShoeType(selection.shoeType ?? "All");
    setBagType(selection.bagType ?? "All");
    setTextileType(selection.textileType ?? "All");
    updateCategoryInUrl(selection.category);
  }

  function resetFilters() {
    setQuery("");
    setCategory("All");
    setSize("All");
    setCondition("All");
    setBrand("All");
    setColor("All");
    setMaterial("All");
    setStore("All");
    setPrice("All");
    setShoeType("All");
    setBagType("All");
    setTextileType("All");
    setAvailableOnly(false);
    setOpenFilter(null);
    updateCategoryInUrl("All");
  }

  function toggleSaved(code: string) {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function recordSearch(submittedQuery: string) {
    const normalizedQuery = submittedQuery.trim();
    if (normalizedQuery.length < 2) return;

    void fetch("/api-proxy/public/analytics/searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: normalizedQuery,
        resultCount: filteredProducts.length,
        category: category === "All" ? undefined : category
      }),
      keepalive: true
    }).catch(() => undefined);
  }

  function filterLabel(type: Exclude<FilterMenu, null>) {
    if (type === "subcategory") {
      const selected = category === "Shoes" ? shoeType : category === "Bags" ? bagType : textileType;
      return selected === "All" ? "Subcategory" : selected;
    }
    const values = { category, brand, price, size, color, material, condition, store };
    const selected = values[type as keyof typeof values];
    return selected === "All" ? type[0].toUpperCase() + type.slice(1) : selected;
  }

  function renderFilterOptions(type: Exclude<FilterMenu, null>) {
    if (type === "category") {
      return (
        <>
          {categories.map((item) => <OptionButton key={item} label={item} active={category === item} onClick={() => { selectCategory(item); setOpenFilter(null); }} />)}
          {category === "Shoes" ? <div className="depopSubFilter"><strong>Shoe type</strong>{["All", ...shoeTypes].map((item) => <OptionButton key={item} label={item} active={shoeType === item} onClick={() => setShoeType(item)} />)}</div> : null}
          {category === "Bags" ? <div className="depopSubFilter"><strong>Bag type</strong>{["All", ...bagTypes].map((item) => <OptionButton key={item} label={item} active={bagType === item} onClick={() => setBagType(item)} />)}</div> : null}
          {category === "Home Textiles" ? <div className="depopSubFilter"><strong>Textile type</strong>{["All", ...textileTypes].map((item) => <OptionButton key={item} label={item} active={textileType === item} onClick={() => setTextileType(item)} />)}</div> : null}
        </>
      );
    }
    if (type === "subcategory") {
      const options = category === "Shoes"
        ? ["All", ...shoeTypes]
        : category === "Bags"
          ? ["All", ...bagTypes]
          : ["All", ...textileTypes];
      const selected = category === "Shoes" ? shoeType : category === "Bags" ? bagType : textileType;
      const setter = category === "Shoes" ? setShoeType : category === "Bags" ? setBagType : setTextileType;
      return options.map((item) => (
        <OptionButton key={item} label={item} active={selected === item} onClick={() => { setter(item); setOpenFilter(null); }} />
      ));
    }
    const options = type === "brand" ? brands : type === "price" ? priceOptions : type === "size" ? sizeOptions : type === "color" ? colors : type === "material" ? materials : type === "store" ? stores : (category === "Shoes" ? shoeConditionOptions : apparelConditionOptions);
    const selected = type === "brand" ? brand : type === "price" ? price : type === "size" ? size : type === "color" ? color : type === "material" ? material : type === "store" ? store : condition;
    const setters = { brand: setBrand, price: setPrice, size: setSize, color: setColor, material: setMaterial, condition: setCondition, store: setStore };
    const setter = setters[type as keyof typeof setters];
    return options.map((item) => (
      <OptionButton key={item} label={item} active={selected === item} onClick={() => { setter(item); setOpenFilter(null); }} />
    ));
  }

  const mobileFilterSections = (
    <>
      {filterTypes.map((type) => (
        <section className="depopMobileFilterSection" key={type}>
          <h3>{type[0].toUpperCase() + type.slice(1)}</h3>
          <div>{renderFilterOptions(type)}</div>
        </section>
      ))}
      <section className="depopMobileFilterSection availabilitySection">
        <button type="button" className="depopAvailability" onClick={() => setAvailableOnly((current) => !current)}>
          <span>Available items only</span>
          <i className={availableOnly ? "active" : ""}><b /></i>
        </button>
      </section>
    </>
  );

  return (
    <main className="catalogPage depopCatalogPage">
      <ReferralTracker sellerRef={sellerRef} source={source} placement={placement} campaign={campaign} />
      <SiteHeader
        searchValue={query}
        onSearchChange={setQuery}
        onSearchSubmit={recordSearch}
        sellerRef={sellerRef}
        selectedCategory={category}
        onSelectCategory={selectCategory}
        onSelectBrowse={applyBrowseSelection}
      />

      <section className="marketShell depopMarketShell" id="catalog">
        <div className="marketResults depopMarketResults">
          <div className="depopCatalogTitle">
            <p><button type="button" onClick={() => applyBrowseSelection({ category: "All" })}>Home</button><span>/</span>{category === "All" ? "All items" : category}</p>
            <h1>{category === "All" ? "Explore today's finds" : category}</h1>
          </div>

          <div className="depopPopularRow" aria-label={category === "Shoes" ? "Popular brands" : "Popular categories"}>
            <strong>{category === "Shoes" ? "Popular brands" : "Popular categories"}</strong>
            <div>
              {popularChoices.map((choice) => (
                <button
                  type="button"
                  key={`${choice.label}-${choice.brand ?? choice.bagType ?? choice.textileType ?? choice.category}`}
                  onClick={() => applyBrowseSelection(choice)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          <div className="depopFilterBar" ref={filterBarRef}>
            <div className="depopDesktopFilters">
              {filterTypes.map((type) => (
                <div className="depopFilterControl" key={type}>
                  <button
                    type="button"
                    className={filterLabel(type) !== type[0].toUpperCase() + type.slice(1) ? "active" : ""}
                    onClick={() => setOpenFilter((current) => current === type ? null : type)}
                    aria-expanded={openFilter === type}
                  >
                    {filterLabel(type)} <ChevronDown size={15} />
                  </button>
                  {openFilter === type ? <div className="depopFilterPopover">{renderFilterOptions(type)}</div> : null}
                </div>
              ))}
              <button className={`depopAvailableChip ${availableOnly ? "active" : ""}`} type="button" onClick={() => setAvailableOnly((current) => !current)}>
                {availableOnly ? <Check size={14} /> : null} Available only
              </button>
            </div>

            <button
              className="depopMobileFilterButton"
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              aria-controls="depop-mobile-filters"
              aria-expanded={mobileFiltersOpen}
            >
              <SlidersHorizontal size={18} />
              <span className="depopMobileControlLabel">Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
            </button>

            <label className="depopSortControl">
              <span className="depopSortPrefix">Sort by</span>
              <span className="depopMobileControlLabel">{sort === "Newest first" ? "Newest" : sort === "Price: low to high" ? "Lowest price" : "Highest price"}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option>Newest first</option>
                <option>Price: low to high</option>
                <option>Price: high to low</option>
              </select>
              <ChevronDown size={15} />
            </label>
          </div>

          <div className="activeFilterRow depopActiveFilters">
            {category !== "All" ? <button onClick={() => selectCategory("All")}>{category} <X size={13} /></button> : null}
            {brand !== "All" ? <button onClick={() => setBrand("All")}>{brand} <X size={13} /></button> : null}
            {shoeType !== "All" ? <button onClick={() => setShoeType("All")}>{shoeType} <X size={13} /></button> : null}
            {bagType !== "All" ? <button onClick={() => setBagType("All")}>{bagType} <X size={13} /></button> : null}
            {textileType !== "All" ? <button onClick={() => setTextileType("All")}>{textileType} <X size={13} /></button> : null}
            {price !== "All" ? <button onClick={() => setPrice("All")}>{price} <X size={13} /></button> : null}
            {size !== "All" ? <button onClick={() => setSize("All")}>{size} <X size={13} /></button> : null}
            {color !== "All" ? <button onClick={() => setColor("All")}>{color} <X size={13} /></button> : null}
            {material !== "All" ? <button onClick={() => setMaterial("All")}>{material} <X size={13} /></button> : null}
            {condition !== "All" ? <button onClick={() => setCondition("All")}>{condition} <X size={13} /></button> : null}
            {store !== "All" ? <button onClick={() => setStore("All")}>{store} <X size={13} /></button> : null}
            {availableOnly ? <button onClick={() => setAvailableOnly(false)}>Available <X size={13} /></button> : null}
            {activeFilterCount > 0 || category !== "All" ? <button className="clearAll" type="button" onClick={resetFilters}>Clear all</button> : null}
          </div>

          {filteredProducts.length > 0 ? (
            <div className="marketGrid depopProductGrid">
              {filteredProducts.map((product, index) => (
                <ProductCard product={product} key={product.code} isSaved={saved.has(product.code)} onToggleSaved={toggleSaved} sellerRef={sellerRef} source={source} placement={placement} campaign={campaign} priority={index < 6} />
              ))}
            </div>
          ) : (
            <div className="emptyResults depopEmptyResults">
              <h2>No items match these filters.</h2>
              <p>Try clearing one or two filters to see more one-of-one finds.</p>
              <button type="button" onClick={resetFilters}>Clear filters</button>
            </div>
          )}
        </div>
      </section>

      {mobileFiltersOpen ? (
        <div className="depopMobileFilterLayer">
          <section id="depop-mobile-filters" className="depopMobileFilters" role="dialog" aria-modal="true" aria-labelledby="mobile-filter-title">
            <div className="depopMobileFilterHeading">
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters"><X size={24} /></button>
              <strong id="mobile-filter-title">Filter</strong>
              <button className="textButton" type="button" onClick={resetFilters}><RotateCcw size={15} /> Clear</button>
            </div>
            <div className="depopMobileFilterScroll">{mobileFilterSections}</div>
            <div className="depopMobileFilterFooter">
              <button type="button" onClick={() => setMobileFiltersOpen(false)}>View {filteredProducts.length} items</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
