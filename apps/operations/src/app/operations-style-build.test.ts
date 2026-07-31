import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const cssDir = join(process.cwd(), ".next", "static", "chunks");

if (!existsSync(cssDir)) {
  console.warn("Skipping Operations CSS build smoke: .next/static/chunks does not exist. Run next build first.");
  process.exit(0);
}

const cssFiles = readdirSync(cssDir)
  .filter((file) => file.endsWith(".css"))
  .map((file) => join(cssDir, file));

assert.ok(cssFiles.length > 0, "Operations build should emit at least one CSS file.");

const css = cssFiles.map((file) => readFileSync(file, "utf8")).join("\n");

assert.ok(css.includes(".flex"), "Operations CSS should include Tailwind utilities such as .flex.");
assert.ok(css.includes(".min-h-screen"), "Operations CSS should include layout utilities used by the login shell.");
assert.ok(css.includes(".rounded-xl"), "Operations CSS should include shadcn layout utilities.");
assert.equal(css.includes("@apply"), false, "Operations CSS should not contain unresolved Tailwind @apply directives.");
