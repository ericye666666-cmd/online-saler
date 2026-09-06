# Product Factory supervisor SOP

Updated 2026-09-06. Use this with the [employee SOP](product-factory-employee-sop.md).
The daily workflow is **批量采集 → AI 自动处理 → 异常确认并发布**. The names of the
capture operator, reviewer, warehouse lead and their backups still need to be
recorded in the duty roster; a system account alone does not establish who is
responsible on site.

## Before work starts

1. Confirm power, internet, the camera/measurement board and the label printer
   work. Print one sample and check barcode readability, size and shelf text.
2. Confirm today's operator can access the batch workbench using their own
   account. Check who will review exceptions and verify physical placement.
3. Check **系统管理 > 商品工厂配置** for readiness. If a service check fails,
   report it to the system administrator; operators should not change service
   settings or choose processing models to get around an error.
4. Check active shelf codes, physical labels and remaining capacity. Clear any
   mismatch before starting a new batch. Keep online stock separate from store
   stock, including the first 1,000-item launch stock.
5. Check unfinished batches from the previous shift. Locate their garments and
   resolve ownership before allowing another operator to continue them.

## Supervise the three-stage batch

1. **Capture:** ten garments and their photos stay in the same numbered order.
   Front images must show the full garment and usable measuring marks. Defect
   photos must be attached to the correct item.
2. **Processing:** retry failed work in the existing batch. Do not recreate
   successful items or repeatedly rerun successful images.
3. **Confirmation/publication:** verify corrected product facts and price,
   required AI display images checked against originals, readable labels with
   barcode and shelf, and physical placement against the grouped shelf list.
   A prepared detail page does not mean the item is stored or on sale. Final
   batch confirmation happens only after all these checks.

The standard path assigns shelves when barcodes are generated. Staff attach
labels, follow the grouped shelf list and confirm the whole batch. Do not add
routine per-item shelf selection, shelf scanning or second detail-page approval
to this path. Inspection must still cover every garment and AI image.

## Handle exceptions

| Problem | Supervisor action |
|---|---|
| Wrong or unclear original | Request a retake on the existing product; keep the garment identified |
| Failed processing or AI result | Retry the affected job/item; if it fails again, record the batch/item and ask for support |
| Missing or inaccurate AI display image | Hold publication, regenerate or request correction, then compare with the original; an original or white-background image alone does not satisfy this requirement |
| Wrong facts, measurements or price | Return the item for correction with a specific reason; do not approve a guessed value |
| Printer fails or label is damaged | Compare the item and existing barcode, reprint only the missing/damaged label, then check the physical print; do not generate a new identity |
| Shelf full, unavailable or different from printed assignment | Hold confirmation; reconcile capacity/assignment and replace obsolete labels before placement |
| Partial stock-in or publication | Read the item-level result and continue the existing batch after fixing the issue; preserve completed work |
| Garment missing or mixed with store stock | Isolate the batch, reconcile physical items and system records, then resolve before sale |

Once a garment is stored, any later move must be recorded in **货架位管理** so the
system and physical shelf stay aligned. A handwritten shelf change is not a
completed system move.

## Returned garments and changes to a live main image

These are operating instructions for the readiness changes. Confirm the deployed
release supports them before training staff; this document does not establish
that they are already active in production.

- After an accepted return is restocked, the product returns to **REVIEW_PENDING**.
  Use its individual product workflow to review the garment, check publication
  readiness and publish. The return workflow has already recorded the physical
  stock as available; do not stock it in again. If its original batch contains
  archived items, continue with the individual product, not the whole old batch.
- Before replacing or cancelling an approved storefront main image on a
  **PUBLISHED** product, unpublish it. Review and confirm the replacement before
  publishing again. A newly generated image awaiting review must not replace the
  currently approved image on a live product automatically.

## Classification changes

Use **商品中心 > 分类与属性** for approved category/attribute changes. Keep stable
codes, rename display text when needed, and disable obsolete options instead of
deleting history. Check the option in staff confirmation and storefront filters
after an approved product uses it. Escalate a new pricing or commercial rule
instead of creating an unofficial workaround.

## End of shift and training acceptance

Record batches started/completed, items published, unfinished items with reasons,
reprints, image retries and the owner of each unresolved issue. Reconcile the
completed batch lists against shelves. Keep operator work time and processing
wait time separately so productivity can be reviewed fairly.

For a new operator or changed workflow, use the
[ten-item field acceptance plan](testing/mvp-field-acceptance.md). Observe a real
batch and record the result. Do not mark training or production readiness as
passed because the screen loads or a software test succeeded.
