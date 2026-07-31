# Product Image Pipeline

## Goal

Keep every real product photo unchanged while generating two employee-reviewable derivatives:

1. Pixel-preserving cutout on transparent and white backgrounds.
2. Deterministic Storefront main image.

This pipeline must never redraw the garment or alter pockets, buttons, logos, fabric, defects, proportions, or silhouette.

## Image variants

- `ORIGINAL`: immutable uploaded source image.
- `CUTOUT_TRANSPARENT`: original garment pixels with transparent background.
- `CUTOUT_WHITE`: the transparent cutout composited onto `#FFFFFF`.
- `OPTIMIZED_MAIN`: deterministic crop, centering, padding, exposure and white-balance adjustment based on the cutout.

## Processing operations

- `REMOVE_BACKGROUND`
- `COMPOSE_WHITE_BACKGROUND`
- `OPTIMIZE_MAIN_IMAGE`

Each operation has its own job and independent status:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`

A failed image-processing job must not delete the product, block OpenAI extraction for other batch items, or overwrite the original image. The employee can retry one job without rerunning OpenAI product recognition.

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

## API contract target

- `GET /products/:productId/image-variants`
- `POST /products/:productId/images/:imageId/process`
- `POST /image-processing-jobs/:jobId/retry`
- `POST /products/:productId/main-image`

The shared TypeScript contracts live in `packages/shared-types/src/image-processing.ts`.
