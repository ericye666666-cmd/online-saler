/**
 * Which stores a store screen offers, and whether it offers a choice at all.
 *
 * An account whose home store (归属门店) is a store is locked to it: the screen
 * shows the store's name and no picker. The API enforces the same thing, so
 * this is what the person sees, not what protects the data.
 *
 * An account with no home store (不限（仓库 / 总部）) picks from the list. The
 * phone console lists stores only — the warehouse hands parcels over on the
 * spot and never receives one — while the desktop desk keeps the warehouse for
 * head office, who hand over warehouse pickups there.
 */
export type StoreConsoleNode = { id: string; name: string; type: "WAREHOUSE" | "STORE" };

export function storeConsoleNodes<T extends StoreConsoleNode>(
  nodes: T[],
  homeNodeId: string | null | undefined,
  options: { includeWarehouse?: boolean } = {}
): { options: T[]; locked: T | null } {
  const home = homeNodeId ? nodes.find((node) => node.id === homeNodeId && node.type === "STORE") ?? null : null;
  if (home) return { options: [home], locked: home };
  return {
    options: options.includeWarehouse ? nodes : nodes.filter((node) => node.type === "STORE"),
    locked: null
  };
}
