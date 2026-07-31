# Product Image Pipeline

## Goal

Keep every real product photo unchanged while generating two employee-reviewable derivatives:

1. Pixel-preserving cutout on transparent and white backgrounds.
2. Deterministic Storefront main image.

This pipeline must never redraw the garment or alter pockets, buttons, logos, fabric, defects, proportions, or silhouette.

## Image variants

- `ORIGINAL`: immutable uploaded source image stored by the existing `ProductImage` model.
- `CUTOUT_TRANSPARENT`: original garment pixels with transparent background.
- `CUTOUT_WHITE`: the transparent cutout composited onto `#FFFFFF`.
- `OPTIMIZED_MAIN`: deterministic crop, centering, padding, exposure and white-balance adjustment based on the cutout.

Derived files are persisted as `ProductImageVariantAsset` records. The original upload remains in the existing product-image storage path and is never overwritten.

## Processing operations

- `REMOVE_BACKGROUND`: requires an original FRONT image and targets `CUTOUT_TRANSPARENT`.
- `COMPOSE_WHITE_BACKGROUND`: requires `CUTOUT_TRANSPARENT` and targets `CUTOUT_WHITE`.
- `OPTIMIZE_MAIN_IMAGE`: requires `CUTOUT_WHITE` and targets `OPTIMIZED_MAIN`.

Each operation has its own `ProductImageProcessingJob` and independent status:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`

A failed image-processing job must not delete the product, block OpenAI extraction for other batch items, or overwrite the original image. A failed job can be retried independently up to the configured retry limit.

## Main-image selection

`ProductMainImageSelection` stores the employee-selected Storefront image without changing the original product photo.

Allowed main-image variants:

- `ORIGINAL`
- `CUTOUT_WHITE`
- `OPTIMIZED_MAIN`

`CUTOUT_TRANSPARENT` cannot be selected directly as a customer-facing main image.

## Employee review

The existing calibration page will eventually display:

- Original
- Transparent cutout
- White-background cutout
- Optimized main image

The employee selects the final Storefront main image and confirms that the garment has not changed before approving the product.

## First-version guardrails

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
- Changing color, texture, logo, shape, or proportions
- Automatically publishing an unreviewed derivative

## API foundation

- `POST /products/:productId/images/:imageId/processing-jobs`
  - Creates an idempotent pending job for one supported operation.
  - Rejects the request when the source image variant does not match the operation.
- `GET /products/:productId/image-comparison`
  - Returns the latest original, cutout and optimized variants, current selection and processing jobs.
- `POST /image-processing-jobs/:jobId/retry`
  - Resets an eligible failed job to `PENDING` without rerunning OpenAI extraction.
- `POST /products/:productId/main-image`
  - Records the employee-selected customer-facing image.

The shared TypeScript contracts live in `packages/shared-types/src/image-processing.ts`.

## Deferred to the processor PR

This persistence/API foundation does not yet call a background-removal provider or write output image files. The processor implementation must claim pending jobs, create derived files, persist `ProductImageVariantAsset`, and mark each job succeeded or failed without touching the original upload.
