const modules = [
  "Dashboard",
  "Product",
  "Inventory",
  "Orders",
  "Payment",
  "Fulfillment",
  "Affiliate",
  "Customer Service",
  "Analytics",
  "System"
];

const cards = [
  {
    title: "Foundation",
    body: "Employee access, roles, permissions, settings, and audit logs are the first admin layer."
  },
  {
    title: "Middle platform",
    body: "The admin console will operate products, inventory, orders, payments, fulfillment, affiliates, and data."
  },
  {
    title: "Controls",
    body: "High-risk actions such as refunds, commission approval, price edits, and inventory exceptions will be logged."
  }
];

export default function AdminHome() {
  return (
    <main className="layout">
      <aside className="sidebar">
        <div className="brand">Online Saler Admin</div>
        <nav className="menu" aria-label="Admin modules">
          {modules.map((module) => (
            <span key={module}>{module}</span>
          ))}
        </nav>
      </aside>
      <section className="main">
        <h1 className="headline">Management Console Foundation</h1>
        <p className="copy">
          This app is the management surface for exceptions, approvals, reconciliation, access control, and operating
          dashboards. It will call the same middle-platform API as Storefront and Operations.
        </p>
        <section className="grid" aria-label="Admin foundation capabilities">
          {cards.map((card) => (
            <article className="card" key={card.title}>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
