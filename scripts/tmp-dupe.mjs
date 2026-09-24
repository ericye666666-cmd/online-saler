import { readFileSync } from "node:fs";
const lines = readFileSync("apps/operations/src/i18n/en.ts", "utf8").split("\n");
const pattern = /^\s*"((?:[^"\]|\.)*)":/;
const seen = new Map();
for (const [i, line] of lines.entries()) {
  const m = pattern.exec(line);
  if (!m) continue;
  if (seen.has(m[1])) console.log(`dup "${m[1]}" lines ${seen.get(m[1])} and ${i + 1}`);
  else seen.set(m[1], i + 1);
}
