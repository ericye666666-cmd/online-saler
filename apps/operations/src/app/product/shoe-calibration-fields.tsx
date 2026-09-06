"use client";

import { useId } from "react";
import { formatShoeSizeLabel, SHOE_SIZE_SYSTEMS, SHOE_TYPES } from "@online-saler/shared-types";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceForm } from "../operations-workspace-flow";

const SYSTEM_LABELS: Record<string, string> = {
  EU: "EU 欧码", UK: "UK 英码", US_MEN: "US 男鞋", US_WOMEN: "US 女鞋",
  US_KIDS: "US 童鞋", CM: "CM 厘米标签", OTHER: "其他（保留完整原标）"
};
const TYPE_LABELS: Record<string, string> = {
  Sneakers: "休闲运动鞋", "Sports shoes": "运动鞋", "High heels": "高跟鞋", "Leather shoes": "皮鞋",
  Boots: "靴子", Loafers: "乐福鞋", Flats: "平底鞋", Sandals: "凉鞋", Slippers: "拖鞋",
  "Kids' shoes": "童鞋", Other: "其他鞋款"
};

export function ShoeCalibrationFields(props: {
  form: WorkspaceForm;
  disabled?: boolean;
  onChange: (key: "tagSize" | "shoeSizeSystem" | "shoeType" | "shoeConditionNotes" | "insoleLengthCm", value: string) => void;
  onPairConfirmed: (confirmed: boolean) => void;
}) {
  const id = useId();
  const { form, disabled, onChange } = props;
  const sizeLabel = formatShoeSizeLabel(form.tagSize, form.shoeSizeSystem);
  return (
    <FieldSet>
      <FieldLegend>鞋码与成双检查</FieldLegend>
      <FieldDescription>一双鞋对应一个商品和条码。请对照整双、侧面、鞋底及尺码标原图检查。</FieldDescription>
      <FieldGroup>
        <Field data-field-key="shoeSizeSystem" data-invalid={!form.shoeSizeSystem} data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-system`}>鞋码制式 *</FieldLabel>
          <NativeSelect id={`${id}-system`} className="w-full" value={form.shoeSizeSystem} disabled={disabled} aria-invalid={!form.shoeSizeSystem} onChange={(event) => onChange("shoeSizeSystem", event.target.value)}>
            <NativeSelectOption value="">请选择鞋标上的码制</NativeSelectOption>
            {SHOE_SIZE_SYSTEMS.map((system) => <NativeSelectOption key={system} value={system}>{SYSTEM_LABELS[system]}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field data-field-key="tagSize" data-invalid={!sizeLabel} data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-size`}>原标鞋码 *</FieldLabel>
          <Input id={`${id}-size`} value={form.tagSize} disabled={disabled} maxLength={80} aria-invalid={!sizeLabel} placeholder="例如 42、7.5，按实物标签填写" onChange={(event) => onChange("tagSize", event.target.value)} />
          <FieldDescription>{sizeLabel ? `商城显示：${sizeLabel}。` : "鞋标不清楚时保留草稿，核实后再确认。"} 不按年龄、鞋底长度或服装尺码猜测换算。</FieldDescription>
        </Field>
        <Field data-field-key="shoeType" data-invalid={!form.shoeType} data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-type`}>鞋款 *</FieldLabel>
          <NativeSelect id={`${id}-type`} className="w-full" value={form.shoeType} disabled={disabled} aria-invalid={!form.shoeType} onChange={(event) => onChange("shoeType", event.target.value)}>
            <NativeSelectOption value="">请选择鞋款</NativeSelectOption>
            {SHOE_TYPES.map((type) => <NativeSelectOption key={type} value={type}>{TYPE_LABELS[type]}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field orientation="horizontal" data-field-key="shoePairConfirmed" data-invalid={!form.shoePairConfirmed} data-disabled={disabled}>
          <Checkbox id={`${id}-pair`} checked={form.shoePairConfirmed} disabled={disabled} aria-invalid={!form.shoePairConfirmed} onCheckedChange={(checked) => props.onPairConfirmed(checked === true)} />
          <FieldLabel htmlFor={`${id}-pair`}>我已检查：左右鞋同款、同码，完整成双 *</FieldLabel>
        </Field>
        <Field data-field-key="shoeConditionNotes" data-invalid={!form.shoeConditionNotes.trim()} data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-condition`}>鞋况检查 *</FieldLabel>
          <Textarea id={`${id}-condition`} rows={3} value={form.shoeConditionNotes} disabled={disabled} aria-invalid={!form.shoeConditionNotes.trim()} onChange={(event) => onChange("shoeConditionNotes", event.target.value)} placeholder="例如：鞋底轻微磨损，鞋面无裂纹，内里完整，无开胶。" />
          <FieldDescription>人工检查鞋底、鞋面、内里和开胶情况，如实填写；有瑕疵须补特写并填写下方瑕疵。</FieldDescription>
        </Field>
        <Field data-field-key="insoleLengthCm" data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-insole`}>鞋垫实测长度（cm，可选）</FieldLabel>
          <Input id={`${id}-insole`} inputMode="decimal" value={form.insoleLengthCm} disabled={disabled} onChange={(event) => onChange("insoleLengthCm", event.target.value)} />
          <FieldDescription>仅在鞋垫可取出且已人工实测时填写。鞋底长度不等于鞋内长度。</FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
