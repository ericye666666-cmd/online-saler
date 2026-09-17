"use client";

import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  apparelSizeOptions,
  apparelSizeSummary,
  isSelectableApparelSize,
  normalizeApparelSize,
  usesApparelSizing,
  usesWaistSizing
} from "./apparel-size";

export function ApparelSizeField({ value, category, audience, disabled, onChange }: {
  value: string;
  category: string;
  audience: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();

  if (!usesApparelSizing(category)) {
    return <Field data-field-key="sizeLabel" data-invalid={!value.trim()} data-disabled={disabled}>
      <FieldLabel htmlFor={`${id}-size`}>尺寸／规格 *</FieldLabel>
      <Input id={`${id}-size`} value={value} disabled={disabled} aria-invalid={!value.trim()} onChange={(event) => onChange(event.target.value)} />
    </Field>;
  }

  const valid = isSelectableApparelSize(value, category, audience);
  const summary = apparelSizeSummary(value, category, audience);

  if (usesWaistSizing(category, audience)) {
    return (
      <Field className="sm:col-span-2" data-field-key="sizeLabel" data-invalid={!valid} data-disabled={disabled}>
        <FieldLabel htmlFor={`${id}-size`}>腰围（英寸，按裤标） *</FieldLabel>
        <Input id={`${id}-size`} inputMode="numeric" maxLength={2} disabled={disabled} aria-invalid={!valid}
          placeholder="例如 32" value={value.trim().replace(/^(UK\s*)?W?/i, "")}
          onChange={(event) => onChange(`W${event.target.value.replace(/\D/g, "").slice(0, 2)}`)} />
        <FieldDescription>
          {summary || "男裤／中性裤按裤标腰围英寸填写 30–38 一类的数字。"} 腰围英寸不是 UK 尺码，系统不会换算成字母码。
        </FieldDescription>
      </Field>
    );
  }

  const normalized = normalizeApparelSize(value, audience);
  const options = apparelSizeOptions(category, audience);
  const legacy = Boolean(normalized) && !options.some((option) => option.value === normalized);

  return (
    <Field className="sm:col-span-2" data-field-key="sizeLabel" data-invalid={!valid} data-disabled={disabled}>
      <FieldLabel htmlFor={`${id}-size`}>标准尺码 *</FieldLabel>
      <NativeSelect id={`${id}-size`} className="w-full" value={legacy ? "" : normalized} disabled={disabled} aria-invalid={!valid}
        onChange={(event) => onChange(event.target.value)}>
        <NativeSelectOption value="">请选择尺码</NativeSelectOption>
        {legacy ? <NativeSelectOption value="" disabled>{value}（原值，请重新选择）</NativeSelectOption> : null}
        {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
      </NativeSelect>
      <FieldDescription>
        {summary || "先确认适用人群，再按实物选择标准尺码。"} UK 码、建议身高体重与儿童年龄由系统按尺码表推出，不需要手填。
      </FieldDescription>
    </Field>
  );
}
