import { listPublishedProducts } from "../../../db/catalog";
import { stockedMenu } from "../../shop-taxonomy";

export const dynamic = "force-dynamic";

/** Departments and categories that have something available, for the header menu. */
export async function GET(): Promise<Response> {
  const products = await listPublishedProducts();
  const menu = stockedMenu(products.filter((product) => product.status === "Available").map((product) => product.placements ?? []));
  return Response.json(menu, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
