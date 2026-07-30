import { ProductQueuePage } from "../product-center-client";

export default function WaitingUploadPage() {
  return (
    <ProductQueuePage
      queue="waiting-upload"
      title="待上传"
      description="批次创建后先补齐每件商品的正面照片，照片上传后才能进入 AI 识别。"
    />
  );
}
