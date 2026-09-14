# Product Factory employee SOP

Updated 2026-09-14. Follow the five stages shown in the batch workbench.
For shoes, use the **鞋类 · 一双一个商品** batch option and the [shoe intake SOP](shoe-intake-employee-sop.md).
For the first clothing training run, use **one batch of ten unique garments**. Keep them
in positions 1–10 until the matching labels are attached. The first 1,000
online garments must stay separate from store stock.

## 1. Batch capture · 批量采集

1. Select ten garments and keep them in order. Photograph all ten before
   sitting down to upload; do not mix garments or photos from another batch.
2. Lay each garment flat on a clean, plain surface. No measurement/background board is required. Take a clear full front
   photo, then any needed back, label, detail and defect photos. Show defects
   clearly; keep sleeves and hems visible.
3. Open **商品中心 > 新建批次**, choose ten items and open the upload task.
4. Upload the photos to the matching item number, from 1 through 10. Check the
   thumbnails against the physical garment before moving to the next item.
5. Check that all ten items have a front photo. Use the product's retake action
   for a wrong or unclear photo. Do not create a second product for the same
   garment.

## 2. AI processing · AI 自动处理

1. Start the batch processing action. The system reads the uploaded original photos directly to identify
   category/subcategory, visible color, pattern, sleeve and fit features, tags,
   product names and readable brands. No cutout or intermediate white image is created.
   AI does not estimate sizes or centimeters. White display images start in parallel once all required originals are uploaded, while you review and enter product information.
2. Wait for the results. Open **待处理异常** for any failed item and retry the
   failed work. Keep completed items and their photos in the same batch.
3. Continue to confirmation when the results are ready. If repeated processing
   fails, report the batch number and item number to the supervisor.

## 3. Confirm product information and size · 商品信息与尺码

1. **Check each garment.** Compare the original photo and actual
   garment. Correct the title, category, audience, color, condition, defects and price.
   Enter the size manually from the actual garment; no automatic sizing or conversion is applied.
   Centimeter measurements are optional and must be measured by hand if supplied.
   AI suggestions need your confirmation; do not guess an unreadable brand or size.
2. **Save each item.** The image progress panel shows completed and failed images while you type. Once all ten are confirmed, the system prepares sales details and reuses the original-based images already generated.
   Continue to **白底展示图审核**. Barcodes are generated only after image review.

## 4. Review white-background images · 白底展示图审核

1. Compare each original and display image side by side. Click an image to enlarge it.
   Check color, shape, fabric, pattern, pockets, buttons, logos and disclosed defects.
2. If wrong, click **不满意，重新生成**. Only this item is regenerated from its original.
   The previous confirmation is cleared, including if generation fails. Retry and inspect again.
3. Click **图片正确，确认本件** for each correct image. The page advances to the next pending item.
   Approval is saved and survives a page reload. Missing or unconfirmed images block continuation.
4. Images can be reviewed while sales details finish. Once all images are confirmed and sales details are ready, click **继续：生成标签、打印入仓**.

## 5. Print, store and publish · 打印、归位并发布

1. **Print and attach the labels.** Each label includes the barcode, size and
   shelf location. Match the batch item number, photo and garment before
   attaching it. Open **打印标签 / 贴标确认**, detect the shared ERP / Deli 720 helper, inspect the preview and print. Count ten labels on ten matching garments. Mark **确认全部已贴好**
   only after labels actually print; a printer request is not proof that paper
   came out correctly.
2. **Place the garments by the shelf list.** Follow **按货架位分组摆放** and the
   shelf code printed on each label. Count each shelf group and check that the
   total is ten. The normal batch process uses this grouped list and one stock-in
   confirmation; it does not require choosing or scanning a shelf for each item.
3. **Confirm the batch once.** Only after every label is attached, every garment
   is on its assigned shelf and every AI display image has been checked, click
   **Confirm all items stored · 入仓并发布** and confirm the message. This confirms physical placement; image approval was already saved separately. The normal batch
   flow does not need a second, separate approval of every detail page.
4. **Check the result.** Confirm ten items are published and the batch is
   completed. Open the storefront and check the images, price and size. If the
   system reports a partial result, keep the existing batch and resolve the
   listed problem before continuing; do not create new barcodes or duplicate
   products.

## Stop and report

Stop the affected batch when the photo and garment do not match, an AI image
changes the garment, a barcode appears on two garments, labels are unreadable,
the shelf has no room, a printed shelf code differs from the screen, or any
garment is missing. Tell the supervisor the **batch number, item number and
problem**. Do not put the garment on another shelf and confirm the old location.

For a damaged label, reprint the existing label for that item and remove the
damaged copy. Reprinting must keep the same barcode. Keep unfinished batches
separate and tell the next operator exactly which step remains.

For a returned garment, follow the supervisor's individual-product review after
the return has been inspected and restocked. Do not start a second batch or
record stock-in again for that garment. Ask the supervisor to unpublish a live
product before replacing or cancelling its approved main image. These changed
paths require the readiness release to be verified in the working environment.

Background generation continues across item changes and in-app navigation. Refreshing reconstructs work from persisted jobs. Closing the browser can interrupt requests and stops unsent work; reopening the batch resumes checks. This workflow does not use a standalone durable worker. Failed images require an explicit retry on the review page.
