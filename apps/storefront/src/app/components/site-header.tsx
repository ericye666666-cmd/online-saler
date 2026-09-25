"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  Menu,
  Search,
  Share2,
  ShoppingBag,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { browseHref, type BrowseSelection, type CatalogDepartment } from "../shop-taxonomy";
import { useShopMenu } from "./use-shop-menu";
import { SellerHeaderAction } from "./seller-header-action";
import { CART_STORAGE_KEY, CART_UPDATED_EVENT, cartItemCount, parseCartSnapshot } from "../storefront-cart";
import { useStorefrontI18n } from "../../i18n/use-storefront-i18n";
import { translateValue } from "../../i18n/dictionary";
import { LanguageSwitcher } from "./language-switcher";

export type { BrowseSelection, CatalogDepartment };

type SiteHeaderProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  sellerRef?: string;
  selectedDepartment?: CatalogDepartment;
  onSelectBrowse?: (selection: BrowseSelection) => void;
  productDetail?: boolean;
  customerIdentity?: {
    displayName?: string | null;
    email: string;
    avatarUrl?: string | null;
  };
};

export function SiteHeader({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  sellerRef,
  selectedDepartment = "All",
  onSelectBrowse,
  productDetail = false,
  customerIdentity,
}: SiteHeaderProps) {
  const { locale, t } = useStorefrontI18n();
  const [localSearch, setLocalSearch] = useState("");
  const [desktopMenuId, setDesktopMenuId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobilePanelId, setMobilePanelId] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const value = searchValue ?? localSearch;
  const homeHref = sellerRef ? `/?ref=${encodeURIComponent(sellerRef)}` : "/";
  const menu = useShopMenu();
  const activeDesktopGroup = useMemo(
    () => menu.find((group) => group.department === desktopMenuId),
    [menu, desktopMenuId],
  );
  const activeMobileGroup = useMemo(
    () => menu.find((group) => group.department === mobilePanelId),
    [menu, mobilePanelId],
  );

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
    } else {
      window.location.assign(browseHref(selection, sellerRef));
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

  async function shareProduct() {
    if (navigator.share) {
      await navigator.share({ title: document.title, url: window.location.href }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
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
          {!productDetail ? (
            <button
              className="depopMobileMenuButton"
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("header.openMenu")}
            >
              <Menu size={24} />
            </button>
          ) : null}
        </div>

        <Link
          href={homeHref}
          className="wordmark depopWordmark"
          aria-label={t("header.homeLabel")}
        >
          Direct Loop
        </Link>

        <form className="headerSearch depopSearch" action="/" onSubmit={handleSubmit}>
          <Search size={20} aria-hidden="true" />
          <input
            name="q"
            value={value}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder={t("header.searchPlaceholder")}
            aria-label={t("header.search")}
          />
        </form>

        <div className="depopHeaderActions">
          <Link className="depopIconButton" href="/saved" aria-label={t("header.saved")}>
            <Heart size={24} />
          </Link>
          <Link className="depopIconButton depopCartIcon" href="/cart" aria-label={`Open cart${cartCount ? `, ${cartCount} items` : ""}`}>
            <ShoppingBag size={23} />
            {cartCount ? <span>{cartCount}</span> : null}
            <small className="depopMiniCart">Cart has {cartCount} {cartCount === 1 ? "item" : "items"}. Review before payment.</small>
          </Link>
          <SellerHeaderAction />
          <LanguageSwitcher compact />
        </div>

        <div className="depopMobileNavRight">
          {productDetail ? (
            <button className="depopMobileSearchButton" type="button" onClick={shareProduct} aria-label="Share">
              <Share2 size={23} />
            </button>
          ) : (
            <button
              className="depopMobileSearchButton"
              type="button"
              onClick={() => setMobileSearchOpen((current) => !current)}
              aria-label={t("header.search")}
              aria-expanded={mobileSearchOpen}
            >
              <Search size={23} />
            </button>
          )}
          <Link className="depopCartIcon mobile" href="/cart" aria-label={`Open cart${cartCount ? `, ${cartCount} items` : ""}`}>
            <ShoppingBag size={23} />
            {cartCount ? <span>{cartCount}</span> : null}
          </Link>
        </div>
      </div>

      {customerIdentity ? (
        <div className="depopCustomerIdentity" aria-label={t("header.signedIn")}>
          {customerIdentity.avatarUrl
            ? <img src={customerIdentity.avatarUrl} alt="" />
            : <span aria-hidden="true">{(customerIdentity.displayName ?? customerIdentity.email).slice(0, 1).toUpperCase()}</span>}
          <strong>{customerIdentity.displayName ?? customerIdentity.email}</strong>
        </div>
      ) : null}

      {mobileSearchOpen ? (
        <form className="depopMobileSearch" action="/" onSubmit={handleSubmit}>
          <Search size={20} />
          <input
            name="q"
            value={value}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder={t("header.searchPlaceholder")}
            aria-label={t("header.search")}
            autoFocus
          />
        </form>
      ) : null}

      <nav className="depopCategoryNav" aria-label={t("header.categories")}>
        <div className="depopCategoryNavInner" role="menubar">
          {menu.map((group) => {
            const open = desktopMenuId === group.department;
            return (
              <button
                type="button"
                role="menuitem"
                key={group.department}
                className={`${selectedDepartment === group.department ? "selected" : ""} ${open ? "open" : ""}`}
                aria-expanded={open}
                aria-controls="depop-category-mega-menu"
                onClick={() => setDesktopMenuId((current) => current === group.department ? null : group.department)}
              >
                {translateValue(locale, group.department)}
              </button>
            );
          })}
          <button
            type="button"
            role="menuitem"
            className="dropNavItem"
            onClick={() => chooseSelection({ department: "All" })}
          >
            {t("header.dailyDrop")}
          </button>
        </div>
      </nav>

      {activeDesktopGroup ? (
        <section
          className="depopMegaMenu"
          id="depop-category-mega-menu"
          aria-label={`${activeDesktopGroup.department} menu`}
        >
          <div className="depopMegaMenuInner">
            {activeDesktopGroup.groups.map((shelf) => (
              <div className="depopMegaColumn depopMegaShop" key={shelf.group}>
                <h2>
                  <button type="button" onClick={() => chooseSelection({ department: activeDesktopGroup.department, group: shelf.group })}>
                    {translateValue(locale, shelf.group)}
                  </button>
                </h2>
                <div className="depopMegaLinks">
                  {shelf.categories.map((item) => (
                    <button type="button" key={item.category} onClick={() => chooseSelection({ department: activeDesktopGroup.department, group: shelf.group, shopCategory: item.category })}>
                      {translateValue(locale, item.category)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="depopMegaColumn">
              <button className="depopSeeAll" type="button" onClick={() => chooseSelection({ department: activeDesktopGroup.department })}>
                {t("header.seeAllIn", { department: translateValue(locale, activeDesktopGroup.department) })}
              </button>
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
                  <strong>{translateValue(locale, activeMobileGroup.department)}</strong>
                  <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close"><X size={25} /></button>
                </div>
                <div className="depopMobilePanelScroll">
                  <button className="depopMobileCategoryLink" type="button" onClick={() => chooseSelection({ department: activeMobileGroup.department })}>
                    <span>{t("header.seeAllIn", { department: translateValue(locale, activeMobileGroup.department) })}</span>
                    <ArrowRight size={20} />
                  </button>
                  {activeMobileGroup.groups.map((shelf) => (
                    <div key={shelf.group}>
                      <h2>{translateValue(locale, shelf.group)}</h2>
                      <button className="depopMobileCategoryLink" type="button" onClick={() => chooseSelection({ department: activeMobileGroup.department, group: shelf.group })}>
                        <span>{t("browse.allInGroup", { group: translateValue(locale, shelf.group) })}</span>
                        <ArrowRight size={20} />
                      </button>
                      {shelf.categories.map((item) => (
                        <button className="depopMobileCategoryLink" type="button" key={item.category} onClick={() => chooseSelection({ department: activeMobileGroup.department, group: shelf.group, shopCategory: item.category })}>
                          <span>{translateValue(locale, item.category)}</span>
                          <ArrowRight size={20} />
                        </button>
                      ))}
                    </div>
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
                  <LanguageSwitcher />
                </div>
                <div className="depopMobileMenuList">
                  {menu.map((group) => (
                    <button type="button" key={group.department} onClick={() => setMobilePanelId(group.department)}>
                      <span>{translateValue(locale, group.department)}</span>
                      <ArrowRight size={23} />
                    </button>
                  ))}
                  <button className="dropNavItem" type="button" onClick={() => chooseSelection({ department: "All" })}>
                    <span>{t("header.dailyDrop")}</span>
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
