"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  Heart,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  apparelConditions,
  formatPrice,
  Product,
  shoeConditionGrades,
} from "../data/products";
import { catalogSizeOptions, filterCatalogProducts } from "../catalog-filters";
import { stockedMenu } from "../shop-taxonomy";
import { cardImageSrc } from "../storefront-products";
import { ProductCollectionButton } from "./product-share-sheet";
import { ReferralTracker } from "./referral-tracker";
import { BrowseSelection, CatalogDepartment, SiteHeader } from "./site-header";
import { optionalBrandValue, optionalDisplayValue, productDisplayTitle } from "../product-detail-commerce";
import { readSavedCodes, subscribeToSaved, toggleSaved as toggleSavedItem } from "../saved-items";
import { localizedSizeHeadline } from "../product-size-display";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import type { DictionaryKey } from "../../i18n/dictionary";
import { translateValue } from "../../i18n/dictionary";

type FilterMenu = "category" | "subcategory" | "brand" | "price" | "size" | "color" | "material" | "condition" | "store" | null;
type PopularChoice = BrowseSelection & { label: string };

const apparelConditionOptions = ["All", ...apparelConditions];
const shoeConditionOptions = ["All", ...shoeConditionGrades];
const priceOptions = ["All", "Under KSh 500", "KSh 500–799", "KSh 800+"];

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
  const { locale, t } = useStorefrontI18n();
  const detailHref = sellerRef
    ? `/p/${product.code}?${new URLSearchParams({ ref: sellerRef, ...(source ? { source } : {}), ...(placement ? { placement } : {}), ...(campaign ? { campaign } : {}) }).toString()}`
    : `/p/${product.code}`;
  // Brand and size are blank for whole categories (bags carry no apparel size), so each line is optional.
  const title = productDisplayTitle(product.title);
  const brandLabel = optionalBrandValue(product.brand);
  const sizeLabel = optionalDisplayValue(localizedSizeHeadline(locale, product));

  return (
    <article className={`marketCard depopProductCard ${product.status !== "Available" ? "unavailable" : ""}`}>
      <div className="marketImageWrap depopProductImage group relative">
        <Link href={detailHref} aria-label={t("catalog.viewItem", { item: title })}>
          <img
            src={cardImageSrc(product.image)}
            alt={title}
            width={640}
            height={640}
            loading={priority ? "eager" : "lazy"}
          />
        </Link>
        {product.status !== "Available" ? <span className="depopSoldLabel">{translateValue(locale, product.status)}</span> : null}
        <ProductCollectionButton product={product} />
      </div>

      <div className="marketCardBody depopProductBody">
        {/* Brand leads as a small eyebrow so every card opens on the same beat;
            the name still carries the weight. */}
        {brandLabel ? <p className="depopProductBrand">{brandLabel}</p> : null}
        <div className="depopProductTitleRow">
          <Link href={detailHref} className="depopProductTitle">{title}</Link>
          <button
            className={`depopSaveButton ${isSaved ? "saved" : ""}`}
            type="button"
            onClick={() => onToggleSaved(product.code)}
            aria-label={isSaved ? t("catalog.removeSaved", { item: title }) : t("catalog.saveItem", { item: title })}
            aria-pressed={isSaved}
          >
            <Heart size={21} fill={isSaved ? "currentColor" : "none"} />
          </button>
        </div>
        {sizeLabel ? <p className="depopProductMeta">{sizeLabel}</p> : null}
        <strong className="depopProductPrice">{formatPrice(product.price)}</strong>
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
  initialDepartment = "All",
  initialShopCategory = "All",
  sellerRef,
  source,
  placement,
  campaign,
  feed,
}: {
  initialProducts: Product[];
  initialDepartment?: CatalogDepartment;
  initialShopCategory?: string;
  sellerRef?: string;
  source?: string;
  placement?: string;
  campaign?: string;
  /** Home rails, rendered above the grid while nothing is filtered. */
  feed?: ReactNode;
}) {
  const { locale, t } = useStorefrontI18n();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<CatalogDepartment>(initialDepartment);
  const [shopCategory, setShopCategory] = useState(initialShopCategory);
  const [size, setSize] = useState("All");
  const [condition, setCondition] = useState("All");
  const [brand, setBrand] = useState("All");
  const [color, setColor] = useState("All");
  const [material, setMaterial] = useState("All");
  const [store, setStore] = useState("All");
  const [price, setPrice] = useState("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState("Newest first");
  // Seeded after mount so the server render and the hydrated markup agree.
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<FilterMenu>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  const colors = useMemo(
    () => ["All", ...Array.from(new Set(initialProducts.map((product) => product.color))).sort()],
    [initialProducts],
  );
  const brands = useMemo(
    () => ["All", ...Array.from(new Set(initialProducts.map((product) => product.brand))).sort()],
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
  const sizeOptions = useMemo(() => catalogSizeOptions(initialProducts, department, shopCategory), [initialProducts, department, shopCategory]);
  // Only departments and categories with something in them are offered.
  const menu = useMemo(
    () => stockedMenu(initialProducts.filter((product) => product.status === "Available").map((product) => product.placements ?? [])),
    [initialProducts],
  );
  const departmentOptions: CatalogDepartment[] = ["All", ...menu.map((entry) => entry.department)];
  const shopCategoryOptions = ["All", ...(menu.find((entry) => entry.department === department)?.categories.map((entry) => entry.category) ?? [])];

  useEffect(() => {
    const sync = () => setSaved(new Set(readSavedCodes()));
    sync();
    return subscribeToSaved(sync);
  }, []);

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

  const filteredProducts = useMemo(() => filterCatalogProducts(initialProducts, {
    availableOnly, brand, department, shopCategory, color, condition, material, price,
    query, size, sort, store,
  }), [availableOnly, brand, department, shopCategory, color, condition, initialProducts, material, price, query, size, sort, store]);

  const activeFilterCount = [brand, color, material, price, shopCategory, size, condition, store]
    .filter((item) => item !== "All").length + (availableOnly ? 1 : 0);
  const hasSubcategory = department !== "All";
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
  const popularChoices: PopularChoice[] = department === "All"
    ? menu.map((entry) => ({ label: entry.department, department: entry.department }))
    : shopCategoryOptions.slice(1).map((item) => ({ label: item, department, shopCategory: item }));

  function updateSelectionInUrl(nextDepartment: CatalogDepartment, nextShopCategory = "All") {
    const params = new URLSearchParams(window.location.search);
    if (nextDepartment === "All") params.delete("category");
    else params.set("category", nextDepartment);
    if (nextDepartment === "All" || nextShopCategory === "All") params.delete("type");
    else params.set("type", nextShopCategory);
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  function selectDepartment(nextDepartment: CatalogDepartment) {
    setDepartment(nextDepartment);
    setShopCategory("All");
    setSize("All");
    setCondition("All");
    setMaterial("All");
    setStore("All");
    if (nextDepartment !== "Shoes") setBrand("All");
    updateSelectionInUrl(nextDepartment);
  }

  function selectShopCategory(nextShopCategory: string) {
    setShopCategory(nextShopCategory);
    setSize("All");
    updateSelectionInUrl(department, nextShopCategory);
  }

  function applyBrowseSelection(selection: BrowseSelection) {
    setDepartment(selection.department);
    setShopCategory(selection.shopCategory ?? "All");
    setSize("All");
    setCondition("All");
    setColor("All");
    setMaterial("All");
    setStore("All");
    setPrice("All");
    setBrand(selection.brand ?? "All");
    updateSelectionInUrl(selection.department, selection.shopCategory);
  }

  function resetFilters() {
    setQuery("");
    setDepartment("All");
    setShopCategory("All");
    setSize("All");
    setCondition("All");
    setBrand("All");
    setColor("All");
    setMaterial("All");
    setStore("All");
    setPrice("All");
    setAvailableOnly(false);
    setOpenFilter(null);
    updateSelectionInUrl("All");
  }

  function toggleSaved(code: string) {
    toggleSavedItem(code);
    setSaved(new Set(readSavedCodes()));
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
        category: department === "All" ? undefined : shopCategory === "All" ? department : `${department} / ${shopCategory}`
      }),
      keepalive: true
    }).catch(() => undefined);
  }

  function filterLabel(type: Exclude<FilterMenu, null>) {
    if (type === "subcategory") {
      return shopCategory === "All" ? t("filter.subcategory") : translateValue(locale, shopCategory);
    }
    const values = { category: department, brand, price, size, color, material, condition, store };
    const selected = values[type as keyof typeof values];
    const key = `filter.${type}` as DictionaryKey;
    return selected === "All" ? t(key) : translateValue(locale, selected);
  }

  function renderFilterOptions(type: Exclude<FilterMenu, null>) {
    if (type === "category") {
      return (
        <>
          {departmentOptions.map((item) => <OptionButton key={item} label={translateValue(locale, item)} active={department === item} onClick={() => { selectDepartment(item); setOpenFilter(null); }} />)}
        </>
      );
    }
    if (type === "subcategory") {
      return shopCategoryOptions.map((item) => (
        <OptionButton key={item} label={translateValue(locale, item)} active={shopCategory === item} onClick={() => { selectShopCategory(item); setOpenFilter(null); }} />
      ));
    }
    const options = type === "brand" ? brands : type === "price" ? priceOptions : type === "size" ? sizeOptions : type === "color" ? colors : type === "material" ? materials : type === "store" ? stores : (department === "Shoes" ? shoeConditionOptions : apparelConditionOptions);
    const selected = type === "brand" ? brand : type === "price" ? price : type === "size" ? size : type === "color" ? color : type === "material" ? material : type === "store" ? store : condition;
    const setters = { brand: setBrand, price: setPrice, size: setSize, color: setColor, material: setMaterial, condition: setCondition, store: setStore };
    const setter = setters[type as keyof typeof setters];
    return options.map((item) => (
      <OptionButton key={item} label={translateValue(locale, item)} active={selected === item} onClick={() => { setter(item); setOpenFilter(null); }} />
    ));
  }

  const mobileFilterSections = (
    <>
      {filterTypes.map((type) => (
        <section className="depopMobileFilterSection" key={type}>
          <h3>{t(`filter.${type}` as DictionaryKey)}</h3>
          <div>{renderFilterOptions(type)}</div>
        </section>
      ))}
      <section className="depopMobileFilterSection availabilitySection">
        <button type="button" className="depopAvailability" onClick={() => setAvailableOnly((current) => !current)}>
          <span>{t("catalog.availableItemsOnly")}</span>
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
        selectedDepartment={department}
        onSelectBrowse={applyBrowseSelection}
      />

      {/* The rails are a way in, not a filter result: once someone has narrowed
          the catalogue they want the grid, so the feed steps aside. */}
      {feed && department === "All" && !query.trim() && activeFilterCount === 0 ? feed : null}

      <section className="marketShell depopMarketShell" id="catalog">
        <div className="marketResults depopMarketResults">
          <div className="depopCatalogTitle">
            <p>
              <button type="button" onClick={() => applyBrowseSelection({ department: "All" })}>{t("common.home")}</button><span>/</span>
              {department === "All" ? t("catalog.allItems") : shopCategory === "All" ? translateValue(locale, department) : (
                <><button type="button" onClick={() => selectDepartment(department)}>{translateValue(locale, department)}</button><span>/</span>{translateValue(locale, shopCategory)}</>
              )}
            </p>
            <h1>{department === "All" ? t("catalog.explore") : translateValue(locale, shopCategory === "All" ? department : shopCategory)}</h1>
          </div>

          <div className="depopPopularRow" aria-label={t("catalog.popularCategories")}>
            <strong>{t("catalog.popularCategories")}</strong>
            <div>
              {popularChoices.map((choice) => (
                <button
                  type="button"
                  key={`${choice.department}-${choice.shopCategory ?? choice.label}`}
                  className={choice.shopCategory && choice.shopCategory === shopCategory ? "active" : ""}
                  onClick={() => applyBrowseSelection(choice)}
                >
                  {translateValue(locale, choice.label)}
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
                {availableOnly ? <Check size={14} /> : null} {t("catalog.availableOnly")}
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
              <span className="depopMobileControlLabel">{t("catalog.filter")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
            </button>

            <label className="depopSortControl">
              <span className="depopSortPrefix">{t("catalog.sortBy")}</span>
              <span className="depopMobileControlLabel">{sort === "Newest first" ? t("catalog.newest") : sort === "Price: low to high" ? t("catalog.lowestPrice") : t("catalog.highestPrice")}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option>Newest first</option>
                <option>Price: low to high</option>
                <option>Price: high to low</option>
              </select>
              <ChevronDown size={15} />
            </label>
          </div>

          <div className="activeFilterRow depopActiveFilters">
            {department !== "All" ? <button onClick={() => selectDepartment("All")}>{translateValue(locale, department)} <X size={13} /></button> : null}
            {shopCategory !== "All" ? <button onClick={() => selectShopCategory("All")}>{translateValue(locale, shopCategory)} <X size={13} /></button> : null}
            {brand !== "All" ? <button onClick={() => setBrand("All")}>{brand} <X size={13} /></button> : null}
            {price !== "All" ? <button onClick={() => setPrice("All")}>{price} <X size={13} /></button> : null}
            {size !== "All" ? <button onClick={() => setSize("All")}>{size} <X size={13} /></button> : null}
            {color !== "All" ? <button onClick={() => setColor("All")}>{color} <X size={13} /></button> : null}
            {material !== "All" ? <button onClick={() => setMaterial("All")}>{material} <X size={13} /></button> : null}
            {condition !== "All" ? <button onClick={() => setCondition("All")}>{condition} <X size={13} /></button> : null}
            {store !== "All" ? <button onClick={() => setStore("All")}>{store} <X size={13} /></button> : null}
            {availableOnly ? <button onClick={() => setAvailableOnly(false)}>Available <X size={13} /></button> : null}
            {activeFilterCount > 0 || department !== "All" ? <button className="clearAll" type="button" onClick={resetFilters}>Clear all</button> : null}
          </div>

          {filteredProducts.length > 0 ? (
            <div className="marketGrid depopProductGrid">
              {filteredProducts.map((product, index) => (
                <ProductCard product={product} key={product.code} isSaved={saved.has(product.code)} onToggleSaved={toggleSaved} sellerRef={sellerRef} source={source} placement={placement} campaign={campaign} priority={index < 6} />
              ))}
            </div>
          ) : (
            <div className="emptyResults depopEmptyResults">
              <h2>{t("catalog.noMatches")}</h2>
              <p>{t("catalog.noMatchesHint")}</p>
              <button type="button" onClick={resetFilters}>{t("catalog.clearFilters")}</button>
            </div>
          )}
        </div>
      </section>

      {mobileFiltersOpen ? (
        <div className="depopMobileFilterLayer">
          <section id="depop-mobile-filters" className="depopMobileFilters" role="dialog" aria-modal="true" aria-labelledby="mobile-filter-title">
            <div className="depopMobileFilterHeading">
              <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label={t("common.close")}><X size={24} /></button>
              <strong id="mobile-filter-title">{t("catalog.filter")}</strong>
              <button className="textButton" type="button" onClick={resetFilters}><RotateCcw size={15} /> {t("common.clear")}</button>
            </div>
            <div className="depopMobileFilterScroll">{mobileFilterSections}</div>
            <div className="depopMobileFilterFooter">
              <button type="button" onClick={() => setMobileFiltersOpen(false)}>{t("catalog.viewItems", { count: filteredProducts.length })}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
