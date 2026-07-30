import { ProductQueuePage } from "../product-center-client";

export default function CalibrationPage() {
  return (
    <ProductQueuePage
      queue="calibration"
      title="待人工校准"
      description="员工逐件确认 AI 结果，并补充实测尺寸、成色和瑕疵。校准完成后才允许生成正式 Barcode。"
    />
  );
}
