const workflows = [
  {
    title: "Digitize",
    body: "Scan barcode, upload item photos, confirm AI extraction, and send approved items to online storage."
  },
  {
    title: "Store",
    body: "Scan location and barcode to check in, move, count, or mark an online inventory exception."
  },
  {
    title: "Fulfill",
    body: "Pick by location, confirm with barcode, pack parcel, and hand off pickup or local delivery."
  },
  {
    title: "Support",
    body: "Look up orders, record WhatsApp issues, and create return requests with evidence."
  }
];

export default function OperationsHome() {
  return (
    <main className="shell">
      <header className="header">
        <div>
          <h1 className="title">Operations App</h1>
          <p className="subtitle">Foundation workspace for employee scanning, warehouse work, and service workflows.</p>
        </div>
        <div className="status">Foundation v0.1</div>
      </header>
      <section className="board" aria-label="Operations foundation workflows">
        {workflows.map((workflow) => (
          <article className="tile" key={workflow.title}>
            <h2>{workflow.title}</h2>
            <p>{workflow.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
