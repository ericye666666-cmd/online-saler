import { existsSync } from "node:fs";
import path from "node:path";

/** The Remotion bundle that `npm run build:remotion` writes next to the app. */
export function resolveRemotionBundle() {
  const candidates = [path.join(process.cwd(), "build", "remotion-release"), path.join(process.cwd(), "apps", "storefront", "build", "remotion-release")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Remotion bundle is missing. Run the Storefront build before rendering video.");
  return found;
}
