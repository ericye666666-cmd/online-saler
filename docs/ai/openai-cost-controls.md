# OpenAI cost controls — 2026-09-14

Status: code and mocked request tests prepared. Production configuration,
account-level model access, actual image quality, and billed costs are not
verified by these tests. The September 14 fidelity update follows an employee-reported print/shape mismatch and a user-approved conversational sample. That sample does not prove the API uses the same model or reproduces the same result.

## Configuration

| Purpose | Default | Runtime override |
| --- | --- | --- |
| Clothing information recognition (sizes entered manually) | `gpt-4o-mini` | `OPENAI_VISION_MODEL` |
| Copy from employee-confirmed facts | `gpt-4o-mini` | `OPENAI_DETAIL_MODEL` |
| Required catalog display image | `gpt-image-2.5-sunburst`, `high`, 1024 square | `OPENAI_IMAGE_EDIT_MODEL`, `OPENAI_IMAGE_EDIT_QUALITY` |

`OPENAI_API_KEY` is read from the Secret Manager secret `STAGING_OPENAI_API_KEY`,
not from a plaintext Cloud Run environment variable. The runtime service account
needs `roles/secretmanager.secretAccessor` on it.

The staging workflow sets all three models explicitly. Elsewhere, an existing
runtime override continues to take precedence over the code default. For
backward compatibility, an unset detail model still falls back to the configured
vision model. Set the detail model explicitly to keep its cost independent.

Recognition retains the full JSON field budget and employee calibration rules.
Mini requests omit reasoning and verbosity parameters. An explicitly retained
`gpt-5.6-sol` recognition model keeps its previous no-reasoning settings.
Display generation remains enabled, preserves the original pose, folds, print placement and visible defects, and
accepts explicit `low`, `medium`, `high`, or `auto` quality overrides. Generated
images still need the normal comparison and human review before publication.

OpenAI documents image input, Responses API and structured output support for
[GPT-4o Mini](https://developers.openai.com/api/docs/models/gpt-4o-mini).
The [image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
documents GPT Image 2.5 Sunburst, the multipart image edits endpoint, high quality
and 1024-square PNG output. The provider sends the original bytes directly, with
no intermediate cutout or rearrangement instructions. It retains supports that
intersect the garment to avoid fabricating hidden details.

High-quality image editing costs more than the former mini/low configuration.
Actual billing includes both input and output tokens. Do not reuse the old mini
price estimate for this configuration. There is no automatic lower-quality fallback
on model-access errors; the employee sees the failure and can report it.

## Where the money actually goes — measured 2026-09-24

Seven days (Sep 17-24), `online-saler-staging` key, USD 24.72 total:

| Line item | Cost | Share |
| --- | --- | --- |
| `gpt-image-2.5-sunburst` (text input + image input + image output) | 23.02 | 93% |
| `gpt-4o-mini` (recognition + copy) | 1.62 | 6.6% |
| Other | 0.08 | 0.3% |

Cloud Run request logs for the same window separate real generations from cache
hits by latency, and the split is cleanly bimodal: 218 calls under one second
(an existing job read back) against 325 calls of 15 seconds or more (an actual
OpenAI image edit). Those 325 generations cover **325 distinct products — exactly
1.00 generation per product, with no regeneration at all.**

Per digitized item: USD 0.0708 display image + USD 0.0050 recognition and copy =
**USD 0.076, about KSh 10** against a KSh 500-900 sale price, roughly 1.5% of revenue.

Two conclusions follow, and they should be rechecked before anyone "optimizes"
this again:

- The spend is proportional to items processed, not wasted. Employees accepted
  every generated image on the first try, so lowering quality has no rework to
  save and would only risk the print/shape fidelity that the September 14 update
  was made to fix.
- The `Images` card on the OpenAI usage page reads zero for this model. GPT Image
  2.5 Sunburst bills as tokens across three line items, not per image, so it does
  not appear in the per-image counter. Read the `Group by -> Line Item` breakdown
  instead; the zero is a counter that does not apply, not an absence of spend.

## Avoiding routine deployment charges

Push deployments and ordinary manual deployments skip the live recognition
smoke step. A manual deployment can explicitly enable `run_live_openai_smoke` to
run that billable connectivity check. Other deployment checks remain in place.
Its synthetic image checks connectivity, not garment recognition quality.
Existing credential sources and secret references are unchanged.

## Cost reporting limits

The example and staging detail rates are USD 0.15 input and USD 0.60 output per
million tokens, matching the linked GPT-4o Mini pricing when checked. They are
operator configuration, not an automatically refreshed price feed. Update both
rates whenever changing the detail model. Missing rates or missing usage now
produce an unknown estimate instead of a misleading zero or partial total.

`estimatedCostUsd` on a detail result covers that detail response only. It is not
a full product cost, does not include recognition or display-image requests, and
does not reconcile discounts, retries, failed billable attempts, or hosting.
No claim of achieved savings can be made until actual usage is reconciled.

## Rollout and quality acceptance

1. Run the provider tests, API build/typecheck, and repository CI using mocked
   responses; these require no live OpenAI calls.
2. Deploy to a verified isolated test environment; a service name containing
   `staging` does not prove isolation. Follow the
   [readiness rollout plan](../deployment/mvp-readiness-rollout.md). Check effective
   model and quality settings without displaying secrets; confirm model access.
3. Process a real ten-item batch covering prints, defects, dark/light garments,
   and different garment shapes. Compare source and display images, verify
   employee corrections and measurements, and record processing time, retries,
   accepted items, token usage, and actual API cost.
4. Proceed to the production release only after this batch meets the existing
   product review rules. A failed quality check must not remove the required
   display image or bypass review.

Rollback uses the previous known-good runtime image and recorded model/quality
configuration. There are no schema migrations in this change. Already approved
images and product records are not regenerated by changing the defaults.
