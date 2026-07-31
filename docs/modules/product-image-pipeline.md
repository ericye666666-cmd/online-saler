# Product Image Pipeline

## Goal

Keep every real product photo unchanged while generating employee-reviewable derivatives:

1. Pixel-preserving cutout on transparent and white backgrounds.
2. Deterministic Storefront main image.

The pipeline must never redraw the garment or alter pockets, buttons, logos, fabric, defects, proportions or silhouette.

## Image variants

- `ORIGINAL`: immutable uploaded source image stored by the existing `ProductImage` model.
- `CUTOUT_TRANSPARENT`: original garment RGB pixels with a generated alpha channel.
- `CUTOUT_WHITE`: the transparent cutout composited onto `#FFFFFF`.
- `OPTIMIZED_MAIN`: deterministic crop, centering, padding, exposure and white-balance adjustment based on the cutout.

Derived files are persisted as `ProductImageVariantAsset` records. The original upload remains in the existing product-image storage path and is never overwritten.

## Processing operations

- `REMOVE_BACKGROUND`: requires an original FRONT image and targets `CUTOUT_TRANSPARENT`.
- `COMPOSE_WHITE_BACKGROUND`: requires `CUTOUT_TRANSPARENT` and targets `CUTOUT_WHITE`.
- `OPTIMIZE_MAIN_IMAGE`: requires `CUTOUT_WHITE` and targets `OPTIMIZED_MAIN`.

Each operation has an independent `ProductImageProcessingJob` status:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`

A failed image job must not delete the product, block OpenAI extraction for other batch items, overwrite the original image or require OpenAI recognition to run again.

## Background-removal providers

The API uses a selectable provider layer controlled by `BACKGROUND_REMOVAL_PROVIDER`.

### Lightweight OpenCV provider

Default mode: `lightweight`.

The CPU-only service in `services/lightweight-cutout` performs:

1. EXIF-safe decoding of the original image.
2. Empty-board template difference when `LIGHTWEIGHT_BACKGROUND_TEMPLATE_OBJECT` is configured.
3. Border-derived background estimation when no template is configured.
4. Morphological removal of thin board marks and isolated noise.
5. GrabCut foreground refinement.
6. Alpha-channel generation while preserving the original subject RGB pixels.
7. Simple quality scoring for size, frame contact and fragmentation.

Runtime configuration:

- `LIGHTWEIGHT_CUTOUT_SERVICE_URL`
- `LIGHTWEIGHT_CUTOUT_AUTH_MODE=google_identity`
- `LIGHTWEIGHT_BACKGROUND_TEMPLATE_OBJECT` optional Cloud Storage object name

The Staging processor runs as a private Cloud Run service with CPU-only scale-to-zero configuration.

### remove.bg provider

Mode: `remove_bg`.

This remains available as an optional paid fallback but is not the default. It requires `REMOVE_BG_API_KEY`.

### Automatic provider mode

Mode: `auto` currently prefers the lightweight provider and uses remove.bg only when the lightweight service is unavailable and remove.bg is configured.

A later PR will add the self-hosted `rembg + BiRefNet` provider and quality-based fallback:

```text
lightweight OpenCV
→ quality check
→ rembg + BiRefNet when the lightweight result is not acceptable
→ employee review when both engines fail
```

## Main-image selection

`ProductMainImageSelection` stores the employee-selected Storefront image without changing the original product photo.

Allowed customer-facing variants:

- `ORIGINAL`
- `CUTOUT_WHITE`
- `OPTIMIZED_MAIN`

`CUTOUT_TRANSPARENT` cannot be selected directly as a Storefront main image.

## Employee review

The calibration workspace will display:

- Original
- Transparent cutout
- White-background cutout
- Optimized main image

The employee selects the final Storefront main image and confirms that the garment has not changed before approval.

## Guardrails

Allowed:

- Background removal
- White-background composition
- Automatic crop and centering
- Fixed canvas padding
- Small exposure and white-balance adjustments
- Format conversion and resizing

Not allowed:

- Generative redraw
- Generative wrinkle removal
- Adding or removing garment details
- Hiding real defects
- Changing color, texture, logo, shape or proportions
- Automatically publishing an unreviewed derivative

## API

- `POST /products/:productId/images/:imageId/processing-jobs`
- `POST /image-processing-jobs/:jobId/run`
- `POST /image-processing-jobs/:jobId/retry`
- `GET /products/:productId/image-comparison`
- `GET /products/:productId/image-assets/:assetId/content`
- `POST /products/:productId/main-image`

The shared TypeScript contracts live in `packages/shared-types/src/image-processing.ts`.
