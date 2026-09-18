# Operations App

Employee-facing workflow app.

Planned capabilities:

- Barcode scan.
- Product photo upload.
- AI extraction review.
- Manual measurement calibration.
- Product approval.
- Warehouse check-in and movement.
- Picking, packing, pickup, delivery handoff.
- Customer service and return intake.

Foundation command:

```bash
npm run dev:operations
```

## Language (中文 / English)

The workspace ships in Chinese and English. Staff switch with the globe button in the header (and
on the sign-in screen), and the choice is remembered in the `operations-locale` cookie.

Chinese is the source language, so **the Chinese copy itself is the translation key**:

```tsx
import { t } from "@/i18n/runtime";

<Button>{t("上架")}</Button>
<p>{t("本批必须包含 {targetCount} 件商品。", { targetCount: 10 })}</p>
```

- `src/i18n/en.ts` maps each Chinese string to its English copy. A key that is missing from it
  renders its Chinese source rather than a blank, so the dictionary can grow safely.
- Placeholders are `{name}` and must match between the two languages — `dictionary.test.ts`
  fails the build otherwise.
- `t()` is a module-level function, so plain helper modules can translate without a hook. Text
  that is server-rendered must use `useOperationsI18n()` instead.
- **Never call `t()` in a module-level constant.** It runs once at import time and freezes that
  language. Keep the Chinese string in the constant and wrap it where it renders
  (`t(PRODUCT_STATUS_LABELS[status])`), or build the map in a function.
