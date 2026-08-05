# Product Factory employee SOP

This SOP covers one batch of exactly ten unique garments. Keep the ten garments physically separated from every other batch until all labels are attached.

## 1. Create and photograph

1. Open **商品中心 > 新建批次** and create one ten-item batch.
2. Place garment 1 on the measurement board and take the required front photo. Add back, label, defect, or detail photos when available.
3. Open the batch upload task. Upload garment 1, verify every thumbnail, then continue in order through garment 10.
4. Do not crop or replace the original photo. If a photo is wrong, use the retake action for that product.

## 2. Run AI and image processing

1. Return to the batch page and start AI and image processing.
2. Wait until every product has an AI result and an image-processing result.
3. Lightweight OpenCV runs first. A low quality result automatically falls back to rembg + BiRefNet.
4. Open **待处理异常** if a product fails. Retry only that product; do not recreate the batch.

## 3. Calibrate each product

1. Open the batch calibration task.
2. Compare Original, Transparent Cutout, White Background, and Optimized Main.
3. Confirm that pockets, buttons, logos, fabric, defects, and shape still match the original.
4. Select the storefront main image.
5. Confirm or correct title, category, subcategory, audience, color, brand, sizes, measurements, condition, defects, price, and description.
6. Save and continue until all ten products are calibrated.

Use **重跑 lightweight** for a normal retry and **强制 BiRefNet** for light-colored garments or difficult edges. Never approve a generated or materially altered garment image.

## 4. Print and attach Barcode labels

1. Generate Barcodes only after all ten items are calibrated.
2. Review the ten batch/index/product mappings before printing.
3. Print the batch labels or one label at a time.
4. Attach each label to its matching physical garment.
5. Scan every attached label back into the batch. A duplicate or wrong-batch scan must be rejected.

## 5. Review, store, and publish

1. A reviewer checks the complete product and approves, requests rework, or rejects it. Rework and rejection require a reason.
2. When formal Barcodes are generated, the system reserves enabled shelf locations within their remaining capacity.
3. Place the products by the grouped shelf list. Do not select or scan a shelf for each item.
4. Use the single batch confirmation only after every product is at its assigned shelf; the action records stock-in and makes inventory available before publishing.
5. Move the finished batch to **已完成** and start the next batch.

## Stop conditions

Stop and report the product instead of guessing when the original image is missing, the cutout changes the garment, AI and the physical item disagree, the Barcode is duplicated, no shelf capacity is available, or the printed shelf text does not match the batch mapping.
