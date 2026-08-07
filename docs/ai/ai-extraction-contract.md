# AI Extraction Contract v1

## Scope

The first AI version proposes values for:

- Category
- Primary color
- Pattern
- Sleeve type
- Brand label
- Size label
- Product title

The AI does not decide measurements, condition, defects, price, publication, inventory location, or the formal barcode.

Measurements, condition, and defects require explicit employee confirmation. Under CR-001, the formal barcode can only be generated after human calibration is complete.

## Processing flow

```text
Product shell
  -> images registered
  -> AI job PENDING
  -> AI job RUNNING
  -> structured output validated
  -> AI job SUCCEEDED
  -> employee calibration
  -> product CALIBRATED
  -> formal barcode generated
```

A provider failure changes the job to `FAILED`. Retrying creates a new attempt or increments the persisted retry counter; it must not overwrite the previous raw response.

## Output requirements

Providers must return structured data matching `AIExtractionNormalizedOutput` from `@online-saler/shared-types`.

Each proposed field contains:

- normalized value or `null`
- confidence from 0 to 1
- optional evidence image IDs

Unknown values remain `null`. Providers must not invent new enum values.

## Confidence rules

- High: `>= 0.85`
- Medium: `>= 0.60` and `< 0.85`
- Low: `< 0.60`

Brand and size labels always require employee confirmation, regardless of confidence. Other fields require confirmation below 0.85.

## Persistence requirements

Each extraction must retain:

- product ID
- input image IDs
- provider and model
- prompt version
- status
- raw provider response
- normalized response
- field confidence
- latency
- token usage when available
- estimated cost metadata when available
- failure code and reason
- creation, start, and completion timestamps

The system must also retain the employee's final values, who changed them, and when. The original AI proposal must remain available for accuracy and cost analysis.

## Safety boundaries

- AI output cannot publish a product.
- AI output cannot create a formal barcode.
- AI output cannot set condition or defects as final.
- AI output cannot change price or inventory.
- Invalid or unknown enum values are rejected or sent to manual review.
