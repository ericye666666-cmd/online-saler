"use client";

import { useId } from "react";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { APPAREL_LETTER_SIZES, isSelectableApparelSize, normalizeApparelSize, usesApparelSizing } from "./apparel-size";

export function ApparelSizeField({ value, category, disabled, onChange }: {
  value: string;
  category: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const normalized = normalizeApparelSize(value);
  const uk = /^UK(?:\s|$)/i.test(value.trimStart()) && !(APPAREL_LETTER_SIZES as readonly string[]).includes(normalized);
  const legacy = normalized && !uk && !(APPAREL_LETTER_SIZES as readonly string[]).includes(normalized);
  const valid = isSelectableApparelSize(value);
  if (!usesApparelSizing(category)) {
    return <Field data-field-key="sizeLabel" data-invalid={!value.trim()} data-disabled={disabled}>
      <FieldLabel htmlFor={`${id}-size`}>尺寸／规格 *</FieldLabel>
      <Input id={`${id}-size`} value={value} disabled={disabled} aria-invalid={!value.trim()} onChange={(event) => onChange(event.target.value)} />
    </Field>;
  }
  return (
    <FieldGroup className="sm:col-span-2">
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${id}-system`}>尺码类型</FieldLabel>
        <NativeSelect id={`${id}-system`} className="w-full" value={uk ? "UK" : "LETTER"} disabled={disabled}
          onChange={(event) => onChange(event.target.value === "UK" ? "UK " : "")}>
          <NativeSelectOption value="UK">UK 英码</NativeSelectOption>
          <NativeSelectOption value="LETTER">字母码 S / M / L / XL / XXL</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field data-field-key="sizeLabel" data-invalid={!valid} data-disabled={disabled}>
        <FieldLabel htmlFor={`${id}-size`}>{uk ? "UK 尺码" : "字母尺码"} *</FieldLabel>
        {uk ? (
          <Input id={`${id}-size`} value={value.trimStart().replace(/^UK\s*/i, "")} disabled={disabled} maxLength={30}
            aria-invalid={!valid} placeholder="例如 12、14、W32、6-8Y"
            onChange={(event) => onChange(`UK ${event.target.value.replace(/^UK\s*/i, "")}`)} />
        ) : (
          <NativeSelect id={`${id}-size`} className="w-full" value={normalized} disabled={disabled} aria-invalid={!valid}
            onChange={(event) => onChange(event.target.value)}>
            <NativeSelectOption value="">请选择尺码</NativeSelectOption>
            {legacy ? <NativeSelectOption value={normalized} disabled>{value}（原值，请重新选择）</NativeSelectOption> : null}
            {APPAREL_LETTER_SIZES.map((size) => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <FieldDescription>{valid ? `商城显示：${normalized}。` : "请选择字母码，或填写已核实的 UK 尺码。"} 按实物确认；不同品牌的数字码不自动换算。</FieldDescription>
      </Field>
    </FieldGroup>
  );
}
