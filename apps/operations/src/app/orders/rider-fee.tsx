"use client";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n/runtime";
import { RIDER_FEE_OPTIONS_KSH, type RiderFeeKsh } from "./rider-fee-options";

export { RIDER_FEE_OPTIONS_KSH, riderFeeFromField, type RiderFeeKsh } from "./rider-fee-options";

/**
 * Two big buttons, KSh 50 and KSh 100, with nothing chosen until someone taps
 * one. Every screen that hands a delivery parcel to a rider shows it, and keeps
 * its hand-off button disabled while `value` is null.
 */
export function RiderFeePicker({ value, onChange, disabled, size = "lg" }: {
  value: RiderFeeKsh | null;
  onChange: (fee: RiderFeeKsh) => void;
  disabled?: boolean;
  size?: "lg" | "sm";
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-sm">{t("本单骑手费")}</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("本单骑手费")}>
        {RIDER_FEE_OPTIONS_KSH.map((fee) => (
          <Button
            key={fee}
            type="button"
            role="radio"
            aria-checked={value === fee}
            variant={value === fee ? "default" : "outline"}
            className={size === "lg" ? "h-14 text-lg font-semibold" : "h-10 font-semibold"}
            disabled={disabled}
            onClick={() => onChange(fee)}
          >
            KSh {fee}
          </Button>
        ))}
      </div>
      {value === null ? <p className="text-muted-foreground text-xs">{t("先选骑手费，才能交给骑手。")}</p> : null}
    </div>
  );
}
