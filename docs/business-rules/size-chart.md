# Direct Loop size chart v1 · 尺码体系

Single source of truth: [`packages/business-rules/src/size-chart.ts`](../../packages/business-rules/src/size-chart.ts).
Every app reads the chart from there. Do not copy a table into an app.

## The model · 录入模型

Staff confirm **two** facts per garment:

| Field | Stored as | Who enters it |
| --- | --- | --- |
| Fit · 适用人群 | `Product.gender` (`MEN` / `WOMEN` / `UNISEX` / `KIDS`) | staff |
| Standard Size · 标准尺码 | `Product.finalSizeLabel` | staff |
| Label Size · 原标尺码 | `Product.tagSize` | staff, optional — the garment's real label, verbatim |

Everything else is a chart lookup, written by the API, never typed:

| Derived | Stored as |
| --- | --- |
| UK size / UK equivalent | `Product.ukSizeLabel` |
| Recommended height | not stored — looked up on read |
| Recommended weight | not stored — looked up on read |
| Recommended age (kids only) | `Product.kidsAgeRange` |

`ProductCalibrationService` recomputes `ukSizeLabel` and `kidsAgeRange` from Fit + Standard Size
and discards whatever the client sent, so a client cannot write an inconsistent row.

Fit and Standard Size are one row of the chart: changing the Fit drops a size that belongs to
another ladder, and for kids the standard size and the age range always describe the same row.

## MEN

| Standard | UK equivalent | Height | Weight |
| --- | --- | --- | --- |
| S | UK 34-36 | 160-170 cm | 50-65 kg |
| M | UK 38-40 | 165-175 cm | 60-75 kg |
| L | UK 42-44 | 170-180 cm | 70-85 kg |
| XL | UK 46-48 | 175-185 cm | 80-95 kg |
| XXL | UK 50-52 | 175-190 cm | 90-110 kg |
| XXXL | UK 54-56 | 180-195 cm | 105-125 kg |

The UK equivalent is a **tops** reference.

## WOMEN

| Standard | UK size | Height | Weight |
| --- | --- | --- | --- |
| S | UK 6-8 | 150-160 cm | 40-50 kg |
| M | UK 10-12 | 155-165 cm | 48-60 kg |
| L | UK 14 | 160-170 cm | 58-70 kg |
| XL | UK 16 | 160-175 cm | 68-82 kg |
| XXL | UK 18-20 | 165-180 cm | 80-98 kg |
| XXXL | UK 22-24 | 165-185 cm | 95-115 kg |

Women's UK numbers are the only numeric system the chart converts from: UK 6/8 → S,
10/12 → M, 14 → L, 16 → XL, 18/20 → XXL, 22/24 → XXXL. Odd numbers do not resolve.

## UNISEX

Default for hoodies, sweatshirts, T-shirts and jackets with no clear gender cut.

| Standard | UK equivalent | Height | Weight |
| --- | --- | --- | --- |
| S | UK 34-36 | 150-165 cm | 45-60 kg |
| M | UK 38-40 | 155-175 cm | 55-70 kg |
| L | UK 42-44 | 160-180 cm | 65-80 kg |
| XL | UK 46-48 | 165-185 cm | 75-95 kg |
| XXL | UK 50-52 | 170-190 cm | 90-110 kg |
| XXXL | UK 54-56 | 175-195 cm | 105-125 kg |

## KIDS

| Standard | Age | Height | Weight | Stored age code |
| --- | --- | --- | --- | --- |
| Baby | 0-1 Years | 50-75 cm | 3-10 kg | `BABY_0_1Y` |
| XS | 1-3 Years | 75-100 cm | 9-16 kg | `TODDLER_1_3Y` |
| S | 3-5 Years | 95-115 cm | 14-22 kg | `PRESCHOOL_3_5Y` |
| M | 5-8 Years | 110-130 cm | 18-30 kg | `KIDS_5_8Y` |
| L | 8-11 Years | 125-145 cm | 25-42 kg | `KIDS_8_11Y` |
| XL | 11-14 Years | 140-165 cm | 35-60 kg | `KIDS_11_14Y` |

Children's body shapes vary widely, so age is only a helper: read height first, then weight,
then age. Kids sizing has no UK equivalent.

Legacy age codes fold onto these six buckets on read: `NEWBORN` and `BABY_0_12M` → `BABY_0_1Y`,
`KIDS_6_8Y` → `KIDS_5_8Y`, `KIDS_9_12Y` → `KIDS_8_11Y`, `TEEN_13_16Y` → `KIDS_11_14Y`.

## Men's and unisex trousers · 男裤与中性裤

Trouser labels carry a waist in inches (30 / 32 / 34 / 36 / 38). That number is **not** a UK
size and the chart never converts it into a letter size. Those items store `W32` in
`finalSizeLabel`, show as `Waist 32`, and carry no UK size, height or weight guidance.
Women's trousers stay on the women's UK ladder.

## Storefront display · 商城展示

| Fit | Lines |
| --- | --- |
| Women | `Size: L · UK 14` / `Recommended: 160-170 cm · 58-70 kg` |
| Men | `Size: XL · UK 46-48` / `Recommended: 175-185 cm · 80-95 kg` |
| Unisex | `Size: M · Unisex` / `UK equivalent: 38-40` / `Recommended: 155-175 cm · 55-70 kg` |
| Kids | `Size: M · Kids` / `Age: 5-8 Years` / `Recommended: 110-130 cm · 18-30 kg` |
| Men's trousers | `Size: Waist 32` |

Height, weight and age are **fit recommendations**, never an absolute fit range. Second-hand
stock comes from different countries, brands and cuts, so the same size varies in real life.
The disclaimer under the size guidance says exactly that, in English and Chinese.

## Rows the chart cannot resolve · 无法解析的旧数据

A stored label that does not belong to the confirmed Fit is shown as stored and carries no
derived guidance. Old labels are never reinterpreted under the new chart — under the previous
table women's M meant UK 12-14, so silently re-reading it as UK 10-12 would change the claim
made to a shopper.
