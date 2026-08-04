# Measurement guide v4 direct-replacement QA

> The code-redrawn contact sheets are superseded. Production now uses the exact 24 approved Measurement Studio diagram assets as the geometry source; no garment outline is redrawn or non-uniformly scaled.

- Approved source: the user-approved 24-template Measurement Studio preview set.
- Checked-in replacements: `apps/api/src/product/measurement-guide-assets/*.png`.
- Local QA generated a 24-template contact sheet, an approved-vs-replacement comparison, and a full-size sleeveless-dress render.
- Output: 1200 x 1200 px per template
- Version: `measurement-guides-v4.0.0`

## Root cause and correction

1. The rejected implementation rebuilt the silhouettes in code and then applied `scale(.93, 1.4)` to every category, distorting each garment vertically.
2. The approved 24 source assets already contained the correct category-specific proportions, construction details, and measurement positions.
3. The correction directly extracts the approved left-hand diagrams, converts only the teal visual token to storefront coral, and preserves their original aspect ratio with `preserveAspectRatio="xMidYMid meet"`.
4. The API renderer overlays the current storefront header and a database-driven measurement table. Sample values from the source artwork are never used as product data.
5. Optional missing values render as an explicit dash so the fixed A-H diagram code order remains aligned and no value is fabricated.

## Asset and runtime boundary

- All 24 approved diagram assets are versioned under `apps/api/src/product/measurement-guide-assets`.
- The API build copies them into `dist/product/measurement-guide-assets`; the production Docker image already copies the complete API `dist` directory.
- The renderer loads the asset matching the selected template code and embeds it into the generated SVG before Sharp produces the final WebP.
- Activating v4 does not rewrite existing `ProductDetailAsset` rows. Only future generation uses the direct-replacement assets.

## Visual comparison

- Garment proportions and line construction: identical to the approved asset set.
- Measurement lines and A-H badge positions: identical to the approved asset set.
- Color change only: approved teal becomes storefront coral `#e84c35`.
- UI treatment: white surface, charcoal type, warm-neutral dividers, current Measurement Studio header and database-driven table.

## Verification

- Business-rules tests cover safe asset embedding, data-driven values, missing-value disclosure, and default standalone SVG behavior.
- API build verifies the 24 assets are copied into runtime output.
- A checksum regression test locks all 24 approved files at 750 x 1082 px so the selected drawings and their aspect ratio cannot drift silently.
- API renderer and existing-data boundary tests pass.
- Full repository CI and GitHub repository checks pass.
- The API staging deployment passed all image-processing, Operations API, public-storefront, OpenAI-recognition, and cleanup checks.
- Browser QA used only the new batch `BATCH-1785813567011`; existing product detail assets were not regenerated.
- All 3 new products completed detail generation: 3 `READY`, 0 failed. Their AI display images were selected as the default main images.
- The short-sleeve dress rendered `DRESS_SHORT_SLEEVE · measurement-guides-v4.0.0` with A-F markers and its actual 38/46/37/50/110/22 cm measurements.
- The approved reference and staging result were reviewed side by side. Garment geometry, proportions, construction lines, and marker positions align; only the intentional teal-to-coral token and live product values differ.
- The detail-factory first step performs the batch AI display-image workflow, and the Model View placeholder remains absent.

final result: direct replacement passed local, GitHub CI, API staging deployment, and staging browser QA
