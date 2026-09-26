import { browseHref, onChosenShelf, type BrowseSelection, type Placement } from "./shop-taxonomy";

type SimilarCandidate = {
  code: string;
  size?: string | null;
  status: string;
  placements?: Placement[];
};

const NO_SIZE = new Set(["", "Size not confirmed"]);

/**
 * Where "See similar items" goes from a piece that is sold or reserved: the
 * catalogue list narrowed to the shelf the piece sat on, and to its size when
 * something in that size is still for sale. Each step widens only when the
 * narrower list would be empty — shelf + size, shelf, group, department,
 * then the whole catalogue.
 */
export function similarItemsHref(product: SimilarCandidate, catalogue: SimilarCandidate[], sellerRef?: string): string {
  const shelf = product.placements?.[0];
  const forSale = catalogue.filter((item) => item.code !== product.code && item.status === "Available");
  const size = product.size?.trim() ?? "";
  const steps: Array<BrowseSelection & { size?: string }> = shelf
    ? [
      ...(NO_SIZE.has(size) ? [] : [{ department: shelf.department, group: shelf.group, shopCategory: shelf.category, size }]),
      { department: shelf.department, group: shelf.group, shopCategory: shelf.category },
      { department: shelf.department, group: shelf.group },
      { department: shelf.department }
    ]
    : [];
  const step = steps.find((selection) => forSale.some((item) =>
    onChosenShelf(item.placements, selection.department, selection.group ?? "All", selection.shopCategory ?? "All")
      && (!selection.size || item.size === selection.size)));
  return browseHref(step ?? { department: "All" }, sellerRef);
}
