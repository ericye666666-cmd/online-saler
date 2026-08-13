# Storefront Vestiaire-style UI design QA

- source visual truth: `/workspace/scratch/54a01ce071e7/upload/04-9f9fb2acaec792a69c17296cd3a96f96.jpg` (account layout) and `/workspace/scratch/54a01ce071e7/upload/09-83a6828c72b228aa2ecc33e075a5a1f1.jpg` through `/workspace/scratch/54a01ce071e7/upload/11-7758d3877c657c6f3f41547dd2b6a0e2.jpg` (product detail layout)
- implementation: `http://terminal.local:4173/login` and locally rendered `/p/[code]`
- browser-rendered implementation evidence: Cloud Browser viewport screenshot emitted during QA
- browser viewport: 1363 × 936 CSS px, device scale 1
- source pixels: 945 × 2048 (account), 945 × 2048 (product detail); reference is a mobile-density capture, so comparison was normalized by content proportions rather than raw pixel density
- implementation pixels: 1363 × 936 at 1×; responsive mobile rules are applied below 900 CSS px
- state: signed out; English and Simplified Chinese; product detail with development-only fixture while production API was unavailable locally

## Full-view comparison evidence

- Account screen preserves the reference hierarchy: minimal back/title header, large intentional whitespace, centered account decision, full-width black primary action, divider, outlined secondary action.
- Product detail preserves the reference hierarchy: minimal product navigation on mobile, one-of-one notice, large 4:5 product image, gallery progress, compact metadata, save action, recommendation grid, fixed purchase actions.
- Existing catalog grid remains intact; the Filter/Newest controls continue to share the same typography and proportions.

## Focused-region comparison evidence

- Typography: neutral sans-serif, bold black primary actions, restrained labels, compact metadata. Direct Loop brand wordmark remains the product’s existing serif asset rather than copying the reference brand.
- Spacing: account content is vertically centered with broad negative space; product image is promoted to the dominant mobile region; purchase actions stay within thumb reach.
- Colors: white, near-black and neutral grey dominate. Existing semantic payment-success green is retained only where status meaning requires it.
- Image quality: existing catalog and detail assets use `object-fit: contain` with no stretching or screenshot-derived placeholders.
- Copy: redundant checkout steps and explanatory blocks were removed from the cart entry; payment success leads with confirmation, next action and service contact. Global English/Simplified Chinese interface copy is provided by a centralized dictionary.

## Comparison history

1. P1 — language toggle changed the cookie but not the rendered language. Fixed by adding a server route with same-origin relative redirect and a root i18n provider seeded by the cookie. Post-fix evidence: `/login` changed from `Join Direct Loop`, `lang=en` to `加入 Direct Loop`, `lang=zh-CN` and preserved the route.
2. P1 — translated server page contained English client labels after hydration. Fixed by replacing document reads with a server-seeded context provider. Post-fix evidence: product actions and search placeholder render in Simplified Chinese when `lang=zh-CN`.
3. P2 — product header showed both back and menu actions. Fixed by using back-only navigation and share/bag actions in product-detail mode.
4. P2 — product image and purchasing hierarchy were too small and card-heavy. Fixed with a 4:5 mobile gallery, linear facts, compact status treatment and fixed bottom actions.

## Primary interactions tested

- English → Simplified Chinese switch on `/login`, including cookie persistence and same-route redirect.
- Product detail rendering with real repository product imagery and localized client/server copy.
- Add-to-bag button enabled state and cart update handler reached without a framework error overlay.

## Console errors checked

- No application or Next.js errors found.
- Cloud Browser extension reported its own `chrome-extension://` metadata errors; these are unrelated to the storefront.

## Remaining P3 polish

- The supplied reference includes a Google brand mark. It is intentionally not approximated with text or a hand-made asset; the current button uses typography only until an approved official asset is added.
- Brand names and live product data remain untranslated by design.

final result: passed
