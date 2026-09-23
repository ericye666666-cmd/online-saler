import { Order360Page } from "./order-360-client";

export default async function CustomerServiceOrder360Page({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <Order360Page orderId={orderId} />;
}
