import { KIKUYU_DELIVERY_FEE_KSH, RESERVATION_MINUTES } from "@online-saler/business-rules";

const capabilities = [
  {
    title: "Real item cards",
    body: "Each product will show real photos, exact measurements, condition, price, and one-piece availability."
  },
  {
    title: "Simple checkout",
    body: `Payment initiation will reserve one item for ${RESERVATION_MINUTES} minutes before M-Pesa confirmation.`
  },
  {
    title: "Kikuyu fulfillment",
    body: `Pickup is free. Local delivery starts at ${KIKUYU_DELIVERY_FEE_KSH} KSh inside the defined Kikuyu zone.`
  }
];

export default function StorefrontHome() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">Online Saler</div>
        <nav className="nav">
          <span>New arrivals</span>
          <span>Sizes</span>
          <span>Pickup</span>
        </nav>
      </header>
      <section className="hero">
        <p className="badge">Customer Storefront Foundation</p>
        <h1 className="headline">Browse real second-hand clothes from Kikuyu.</h1>
        <p className="copy">
          This foundation page confirms the Storefront app is running. Product listing, item detail, checkout,
          M-Pesa, order tracking, and affiliate-aware links will attach to the middle-platform API.
        </p>
      </section>
      <section className="grid" aria-label="Foundation capabilities">
        {capabilities.map((capability) => (
          <article className="card" key={capability.title}>
            <h2>{capability.title}</h2>
            <p>{capability.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
