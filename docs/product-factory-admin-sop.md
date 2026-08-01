# Product Factory administrator SOP

## Daily opening check

1. Open **系统管理 > 商品工厂配置**.
2. Confirm API configuration, OpenAI, storage, auto routing, lightweight OpenCV, rembg + BiRefNet, quality threshold, Operations origin, and batch size are ready.
3. Confirm the operator account is active, has a linked employee, and has the Product Factory role.
4. On the operator workstation, start the Deli print agent and verify the configured printer and physical label size.
5. Confirm active warehouse locations have scannable codes.

## Taxonomy administration

1. Open **商品中心 > 分类与属性**.
2. Add only a stable code and employee-facing display name that the business will keep.
3. Do not repurpose an existing code. Rename its display name if wording changes.
4. Disable an obsolete option instead of deleting it. Historical products retain their saved value.
5. Verify the new option in batch calibration and in Storefront filters after a product using it is published.

## Exception handling

- Failed image processing: retry lightweight, then force BiRefNet. If both fail, request a retake.
- Wrong garment image: keep the original record, mark retake, and upload the replacement as a new original record.
- Failed AI: retry that product. Do not rerun successful products.
- Barcode mismatch: stop label application, compare batch index and product code, and reprint only the affected label.
- Review rework: enter a concrete reason and return the product to calibration.
- Location scan failure: verify the physical label and location status; never bypass with random assignment.

## Reprinting

Use single-label reprint after comparing the on-screen batch code, item index, short title, and Barcode. Reprinting does not create a new Barcode. Record label application again only against the matching product.

## Deployment verification

After a merge to `develop`, verify the API and Operations staging workflows are green. Then open the configuration checker and run one product through original upload, auto cutout, fallback when required, calibration, Barcode, review, storage, and publish. A health endpoint alone is not acceptance evidence.
