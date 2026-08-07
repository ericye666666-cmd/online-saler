import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

const APPROVED_ASSET_HASHES = {
  BABY_ONESIE: "aee8b5f565d8d140abfadf495704062377538f69c465b475707cdc37d74d1855",
  BODYSUIT_SWIMWEAR: "470c49ef03b61b5f1ae8c85a84d58e218f47c28089a4f48864833a092700f614",
  DRESS_LONG_SLEEVE: "fa5a873491eba94e5f82afcb355ac7711b43a91f5efadb00eb9e4ef1f6f90ad2",
  DRESS_SHORT_SLEEVE: "69ed98c94151aa8f70e8a75b029d0b0bab41a2a28785cb5303b7db3c09d91607",
  DRESS_SLEEVELESS: "9f7be59ab766b03da2b5f8cbbdd5b32556a6a7e02f749b8967dfc2a61ffa021b",
  GENERIC_BOTTOM: "b8056834e2a0cd12e176a5caf014c6133912eeafb347966fbba8fbdc3f9619e3",
  GENERIC_GARMENT: "0a25439ad4d1655ede869bd9951d93549ce9e07efece43bcc857fa3acb7579c0",
  GENERIC_TOP: "8f656c361e0407b61b96e20ec869b11486c108346586a3602344038fdf6e9948",
  JUMPSUIT_ROMPER: "875c9d12dac2a6503bb9bd6e00a28e9de5472d2f3a73f20d4d051b71ad424cb0",
  KIDS_DRESS: "e3fd64f8f12bbba953c331a17908c0e05ffd7b867828f09cf5ed81f2b4d12c44",
  KIDS_OUTERWEAR: "c1e48010f6cf92759307b6d986849df77bdad679955f056823065e5927001c35",
  KIDS_PANTS: "afb12b5288e6b02a942502d94952ece1eb988a380a58c674e7c7c5aae7c98066",
  KIDS_SKIRT: "5459fa6d668c69bbff96bdacbcf1c8f0e4824b2c8a7e3ff43d8b26bd721fc74a",
  KIDS_TOP_LONG_SLEEVE: "bd7922b40d947fc65146a9e8e39854cfc1be983d626aa901fd4c8e2af3b35d66",
  KIDS_TOP_SHORT_SLEEVE: "5d06d5c764c7d24e2a83245db5ecad27f6a56ccb8925e8c6b271f85a622c5bc8",
  LONG_COAT_TRENCH: "fc590ed6fe82325f1d8b5bf608a58b00ac5cfd808e856ccf0178c3b5273ffd6f",
  OUTERWEAR_JACKET: "f56ddf9ff095b31796f74606ff62a7a359ee956b9a28e5bb5b3a8a31d8a24023",
  PANTS: "0937e8b5ac3b1655db9d93fae3704347a07aacaea5e124e20dfe5f3d4cad5a0d",
  SHORTS: "21a3ff5ad7673367985447e2fb366e9b2442a24745473b272aaae22a48ec8c19",
  SKIRT: "984ab36e87f44cffb7f05518532ccf5ee7eaef6741938ed2753a90b459c98c6b",
  TOP_LONG_SLEEVE: "0b5bcb28a470da6b5e584b5ac184b1ada3f87672aeb189945ef869efc4816a93",
  TOP_SHORT_SLEEVE: "60da6f1aef5806c59525a2b2e59d23cc3602a3730899768749326ac9194a5546",
  TOP_SLEEVELESS: "58225e00e7309a2664d9a9e0a9bd6127532727391fe68c916bceb26627bafa79",
  TWO_PIECE_SET: "c35941c8ea2dfda60d26f6c57850894ff6394fbdda98d48b0bf9d539cfd91876"
} as const;

test("locks the exact twenty-four approved measurement diagrams and their aspect ratio", async () => {
  const assetDirectory = join(__dirname, "measurement-guide-assets");
  const expectedFiles = Object.keys(APPROVED_ASSET_HASHES).sort().map((code) => `${code}.png`);
  const actualFiles = (await readdir(assetDirectory)).filter((file) => file.endsWith(".png")).sort();
  assert.deepEqual(actualFiles, expectedFiles);

  await Promise.all(Object.entries(APPROVED_ASSET_HASHES).map(async ([code, expectedHash]) => {
    const buffer = await readFile(join(assetDirectory, `${code}.png`));
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.width, 750, `${code} width changed`);
    assert.equal(metadata.height, 1082, `${code} height changed`);
    assert.equal(createHash("sha256").update(buffer).digest("hex"), expectedHash, `${code} asset changed`);
  }));
});
