"use client";
import { BAG_STRAPS } from "@online-saler/shared-types";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { t } from "@/i18n/runtime";
export function BagStrapField({ tags, disabled, onChange }: { tags: string[]; disabled?: boolean; onChange: (tags: string[]) => void }) {
  return <Field><FieldLabel>{t("肩带（选填）")}</FieldLabel><NativeSelect value={tags.find((tag) => (BAG_STRAPS as readonly string[]).includes(tag)) ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}>
    <NativeSelectOption value="">{t("未填写")}</NativeSelectOption>
    {BAG_STRAPS.map((value, index) => <NativeSelectOption key={value} value={value}>{[t("可调节"), t("不可调节"), t("无肩带")][index]}</NativeSelectOption>)}
  </NativeSelect></Field>;
}
