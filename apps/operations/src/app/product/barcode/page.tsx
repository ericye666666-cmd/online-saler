import { ProductQueuePage } from "../product-center-client";

export default function BarcodePage() {
  return (
    <ProductQueuePage
      queue="barcode"
      title="Barcode"
      description="校准完成后批量生成正式 Barcode，打印、贴码，再扫码入库。"
    />
  );
}
