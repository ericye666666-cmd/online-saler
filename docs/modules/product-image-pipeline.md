# Product Image Pipeline

## Goal

Keep every real product photo unchanged while generating employee-reviewable derivatives:

1. Pixel-preserving cutout on transparent and white backgrounds.
2. Deterministic Storefront main images.
3. An optional generated catalog-display candidate that is visibly labeled and never auto-selected.

Originals and pixel-preserving derivatives must never redraw the garment. The generated display candidate is a separate, auditable version and must be compared with the original before an employee can select it.

## Image variants

- `ORIGINAL`: immutable uploaded source image stored by the existing `ProductImage` model.
- `CUTOUT_TRANSPARENT`: original garment pixels with transparent background.
- `CUTOUT_WHITE`: the transparent cutout composited onto `#FFFFFF`.
- `OPTIMIZED_MAIN`: deterministic crop, centering, padding, exposure and white-balance adjustment based on the cutout.
- `OPTIMIZED_BALANCED_MAIN`: deterministic positioning of the original cutout pixels on a white Storefront canvas.
- `AI_DISPLAY_MAIN`: optional generated catalog-display candidate based on `CUTOUT_WHITE`.

Derived files are persisted as `ProductImageVariantAsset` records. The original upload remains in the existing product-image storage path and is never overwritten.

## Processing operations

- `REMOVE_BACKGROUND`: requires an original FRONT image and targets `CUTOUT_TRANSPARENT`.
- `COMPOSE_WHITE_BACKGROUND`: requires `CUTOUT_TRANSPARENT` and targets `CUTOUT_WHITE`.
- `OPTIMIZE_MAIN_IMAGE`: requires `CUTOUT_WHITE` and targets `OPTIMIZED_MAIN`.
- `OPTIMIZE_BALANCED_MAIN_IMAGE`: requires `CUTOUT_TRANSPARENT` and targets `OPTIMIZED_BALANCED_MAIN`.
- `GENERATE_AI_DISPLAY_MAIN_IMAGE`: requires `CUTOUT_WHITE` and targets `AI_DISPLAY_MAIN`.

Each operation has its own `ProductImageProcessingJob` and independent status:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`

A failed image-processing job must not delete the product, block OpenAI extraction for other batch items, or overwrite the original image. A failed job can be retried independently up to the configured retry limit.

`REMOVE_BACKGROUND` stores processor metadata on the job:

- `provider`: the processor that produced the selected output.
- `processorVersion`: the processor or model version.
- `qualityScore`: the provider quality score when available.
- `qualityIssues`: provider quality issue codes when available.
- `fallbackFrom`: the first provider when the output came from fallback routing.
- `fallbackReason`: the quality or failure reason that triggered fallback.

## Background-removal routing

The default background-removal provider is `auto`.

`auto` routing uses the lightweight OpenCV service first. If the lightweight output has a quality score below `BACKGROUND_REMOVAL_MIN_QUALITY_SCORE` (default `0.75`) or reports a blocking issue, the API reruns the same source image through the self-hosted rembg BiRefNet service and stores the BiRefNet output as `CUTOUT_TRANSPARENT`.

Default blocking issues:

- `SUBJECT_TOUCHES_EDGE`
- `EDGE_FRAGMENTED`

The blocking list can be overridden with `BACKGROUND_REMOVAL_BLOCKING_QUALITY_ISSUES` as a comma-separated list.

Manual provider modes remain supported:

- `BACKGROUND_REMOVAL_PROVIDER=lightweight`
- `BACKGROUND_REMOVAL_PROVIDER=rembg_birefnet`
- `BACKGROUND_REMOVAL_PROVIDER=remove_bg`
- `BACKGROUND_REMOVAL_PROVIDER=auto`

The routing layer never invokes a generative image model. Fallback reprocesses the original source bytes with another pixel-preserving background-removal engine.

## Main-image selection

`ProductMainImageSelection` stores the employee-selected Storefront image without changing the original product photo.

Allowed main-image variants:

- `ORIGINAL`
- `CUTOUT_WHITE`
- `OPTIMIZED_MAIN`
- `OPTIMIZED_BALANCED_MAIN`
- `AI_DISPLAY_MAIN`

`CUTOUT_TRANSPARENT` cannot be selected directly as a customer-facing main image.

## Employee review

The existing calibration page will eventually display:

- Original
- Transparent cutout
- White-background cutout
- Optimized main image
- Deterministic balanced main image
- AI display image, clearly marked as generated

The employee selects the final Storefront main image and confirms that the garment has not changed before approving the product.

## First-version guardrails

Allowed:

- Background removal
- White-background composition
- Automatic crop and centering
- Fixed canvas padding
- Small exposure and white-balance adjustments
- Format conversion and resizing

Not allowed for originals and pixel-preserving derivatives:

- Generative redraw
- Generative wrinkle removal
- Adding or removing garment details
- Hiding real defects
- Changing color, texture, logo, shape, or proportions
- Automatically publishing an unreviewed derivative

The optional `AI_DISPLAY_MAIN` operation may arrange sleeves, hoods, legs and hems and reduce large accidental bunching, but its prompt must preserve all factual garment details and defects. It remains unselected after generation. Employees must compare logos, prints, pockets, fasteners, drawstrings, texture, wear and defects with the original before choosing it as the Storefront main image.

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

## Processor implementation

`POST /image-processing-jobs/:jobId/run` claims a pending `REMOVE_BACKGROUND` job, downloads the immutable FRONT source image, calls the configured provider routing layer, uploads the transparent PNG derivative, persists `ProductImageVariantAsset`, and marks the job succeeded or failed without touching the original upload.
