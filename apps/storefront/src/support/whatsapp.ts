export const CUSTOMER_SERVICE_WHATSAPP = "254717834529";
export const CUSTOMER_SERVICE_PHONE_LABEL = "0717 834 529";

export function supportWhatsAppUrl(message = "Hello Direct Loop, I need help with my shopping."): string {
  return `https://wa.me/${CUSTOMER_SERVICE_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
