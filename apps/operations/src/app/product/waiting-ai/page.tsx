import { ProductQueuePage } from "../product-center-client";

export default function WaitingAiPage() {
  return (
    <ProductQueuePage
      queue="waiting-ai"
      title="待 AI 识别"
      description="对已上传照片的商品运行 AI 识别，AI 只提取字段，不定价、不发布、不生成 Barcode。"
    />
  );
}
