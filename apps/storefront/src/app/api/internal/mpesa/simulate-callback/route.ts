import { NextResponse } from "next/server";
import { PaymentStatus, prisma } from "@online-saler/database";
import { handleMpesaCallback } from "../../../../../payments/payment-service";

type SimulationBody = {
  orderId?: string;
  orderNumber?: string;
  result?: "success" | "cancelled" | "timeout" | "failed";
  receiptNumber?: string;
};

export async function POST(request: Request) {
  if (process.env.MPESA_ENABLE_SANDBOX_SIMULATOR !== "true") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const expected = process.env.INTERNAL_CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as SimulationBody;
  if (!body.orderId && !body.orderNumber) {
    return NextResponse.json({ error: "orderId or orderNumber is required." }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: body.orderId ? { id: body.orderId } : { orderNumber: body.orderNumber },
    include: {
      payments: {
        where: { status: PaymentStatus.PENDING },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  const payment = order?.payments[0] ?? null;
  if (!order || !payment?.providerCheckoutRequestId) {
    return NextResponse.json({ error: "No pending M-Pesa payment with a checkout request was found." }, { status: 409 });
  }

  const result = body.result ?? "success";
  const callbackPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: payment.providerMerchantRequestId ?? `SIM-${payment.id.slice(0, 8)}`,
        CheckoutRequestID: payment.providerCheckoutRequestId,
        ResultCode: resultCode(result),
        ResultDesc: resultDescription(result),
        ...(result === "success" ? {
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: payment.amountKsh },
              { Name: "MpesaReceiptNumber", Value: body.receiptNumber ?? simulatedReceiptNumber() },
              { Name: "TransactionDate", Value: mpesaTransactionDate() },
              { Name: "PhoneNumber", Value: Number(payment.phone) }
            ]
          }
        } : {})
      }
    }
  };

  const outcome = await handleMpesaCallback(callbackPayload);
  return NextResponse.json({ simulated: true, outcome });
}

function resultCode(result: NonNullable<SimulationBody["result"]>): number {
  if (result === "success") return 0;
  if (result === "cancelled") return 1032;
  if (result === "timeout") return 1037;
  return 1;
}

function resultDescription(result: NonNullable<SimulationBody["result"]>): string {
  if (result === "success") return "The service request is processed successfully.";
  if (result === "cancelled") return "Request cancelled by user.";
  if (result === "timeout") return "DS timeout user cannot be reached.";
  return "The balance is insufficient for the transaction.";
}

function simulatedReceiptNumber(): string {
  return `SIM${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

function mpesaTransactionDate(now = new Date()): number {
  const kenyaTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return Number([
    kenyaTime.getUTCFullYear().toString().padStart(4, "0"),
    (kenyaTime.getUTCMonth() + 1).toString().padStart(2, "0"),
    kenyaTime.getUTCDate().toString().padStart(2, "0"),
    kenyaTime.getUTCHours().toString().padStart(2, "0"),
    kenyaTime.getUTCMinutes().toString().padStart(2, "0"),
    kenyaTime.getUTCSeconds().toString().padStart(2, "0")
  ].join(""));
}
