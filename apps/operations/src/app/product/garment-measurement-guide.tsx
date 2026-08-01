type GuideMeasurement = {
  key: string;
  label: string;
  value: string;
  aiValue?: string;
};

type GuideLine = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
};

const UPPER_BODY_LINES: GuideLine[] = [
  { key: "shoulderWidthCm", x1: 34, y1: 24, x2: 66, y2: 24, labelX: 50, labelY: 20 },
  { key: "chestWidthCm", x1: 27, y1: 39, x2: 73, y2: 39, labelX: 50, labelY: 35 },
  { key: "lengthCm", x1: 51, y1: 19, x2: 51, y2: 88, labelX: 55, labelY: 57 },
  { key: "sleeveLengthCm", x1: 66, y1: 25, x2: 87, y2: 58, labelX: 80, labelY: 39 },
  { key: "waistCm", x1: 34, y1: 57, x2: 66, y2: 57, labelX: 50, labelY: 53 },
  { key: "hipCm", x1: 30, y1: 68, x2: 70, y2: 68, labelX: 50, labelY: 64 }
];

const PANTS_LINES: GuideLine[] = [
  { key: "waistCm", x1: 32, y1: 18, x2: 68, y2: 18, labelX: 50, labelY: 14 },
  { key: "hipCm", x1: 27, y1: 34, x2: 73, y2: 34, labelX: 50, labelY: 30 },
  { key: "lengthCm", x1: 76, y1: 18, x2: 76, y2: 90, labelX: 81, labelY: 56 },
  { key: "thighWidthCm", x1: 29, y1: 47, x2: 51, y2: 47, labelX: 40, labelY: 43 },
  { key: "legOpeningCm", x1: 34, y1: 89, x2: 50, y2: 89, labelX: 42, labelY: 85 },
  { key: "inseamCm", x1: 52, y1: 43, x2: 52, y2: 89, labelX: 57, labelY: 68 }
];

export function GarmentMeasurementGuide(props: {
  category: string;
  subcategory: string;
  imageUrl: string;
  measurements: GuideMeasurement[];
}) {
  const isPants = props.category === "PANTS" || props.category === "SHORT" || props.subcategory === "KIDS_PANTS";
  const lines = (isPants ? PANTS_LINES : UPPER_BODY_LINES).filter((line) =>
    props.measurements.some((measurement) => measurement.key === line.key)
  );
  const values = new Map(props.measurements.map((measurement) => [measurement.key, measurement]));

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">尺寸位置示意</h4>
          <p className="text-xs text-muted-foreground">虚线表示平铺测量位置；请对照原图和刻度确认 AI 数值。</p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-blue-700">虚线 = 测量线</span>
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded border bg-white">
        {props.imageUrl ? <img src={props.imageUrl} alt="尺寸位置参考商品图" className="absolute inset-0 size-full object-contain opacity-55" /> : null}
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" role="img" aria-label="服装平铺尺寸测量位置示意">
          {lines.map((line) => {
            const measurement = values.get(line.key);
            const value = measurement?.value || measurement?.aiValue || "?";
            return (
              <g key={line.key}>
                <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#1d4ed8" strokeWidth="0.9" strokeDasharray="2 1.5" />
                <circle cx={line.x1} cy={line.y1} r="1.1" fill="#ffffff" stroke="#1d4ed8" strokeWidth="0.7" />
                <circle cx={line.x2} cy={line.y2} r="1.1" fill="#ffffff" stroke="#1d4ed8" strokeWidth="0.7" />
                <text x={line.labelX} y={line.labelY} textAnchor="middle" fontSize="3.2" fontWeight="700" fill="#1e3a8a" paintOrder="stroke" stroke="#ffffff" strokeWidth="1.4">
                  {measurement?.label ?? line.key} {value} cm
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
        {props.measurements.map((measurement) => (
          <div key={measurement.key} className="flex justify-between gap-2 border-b py-1">
            <span className="text-muted-foreground">{measurement.label}</span>
            <span className="font-medium tabular-nums">{measurement.value || measurement.aiValue || "待确认"}{measurement.value || measurement.aiValue ? " cm" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
