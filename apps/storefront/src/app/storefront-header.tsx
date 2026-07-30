import Link from "next/link";

type StorefrontHeaderProps = {
  searchValue?: string;
};

const categoryLinks = [
  { label: "Daily drop", href: "/" },
  { label: "Dresses", href: "/?category=DRESS" },
  { label: "Tops", href: "/?category=TOP" },
  { label: "Kids", href: "/?audience=KIDS" },
  { label: "Pickup", href: "/?q=pickup" }
];

export function StorefrontHeader({ searchValue = "" }: StorefrontHeaderProps) {
  return (
    <header className="site-header">
      <div className="header-main">
        <Link className="wordmark" href="/" aria-label="Online Saler home">
          Online Saler
        </Link>

        <form className="header-search" action="/" method="get">
          <span aria-hidden="true">Search</span>
          <input
            aria-label="Search items"
            defaultValue={searchValue}
            name="q"
            placeholder="Search items, brands or styles"
          />
        </form>

        <nav className="header-actions" aria-label="Storefront actions">
          <Link href="/cart">Cart</Link>
          <a href="#catalog">Browse</a>
        </nav>
      </div>

      <nav className="category-nav" aria-label="Main categories">
        {categoryLinks.map((item) => (
          <Link href={item.href} key={item.label}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
