import { Controller, Get } from "@nestjs/common";
import {
  AFFILIATE_ATTRIBUTION_DAYS,
  COMMISSION_CONFIRMATION_HOURS,
  KIKUYU_DELIVERY_FEE_KSH,
  MAX_ACTIVE_RESERVATIONS_PER_PHONE,
  RESERVATION_MINUTES,
  RETURN_REQUEST_WINDOW_HOURS,
  SIGNIFICANT_MEASUREMENT_ERROR_CM
} from "@online-saler/business-rules";

@Controller("foundation")
export class FoundationController {
  @Get("rules")
  getRules() {
    return {
      reservationMinutes: RESERVATION_MINUTES,
      maxActiveReservationsPerPhone: MAX_ACTIVE_RESERVATIONS_PER_PHONE,
      kikuyuDeliveryFeeKsh: KIKUYU_DELIVERY_FEE_KSH,
      affiliateAttributionDays: AFFILIATE_ATTRIBUTION_DAYS,
      commissionConfirmationHours: COMMISSION_CONFIRMATION_HOURS,
      returnRequestWindowHours: RETURN_REQUEST_WINDOW_HOURS,
      significantMeasurementErrorCm: SIGNIFICANT_MEASUREMENT_ERROR_CM
    };
  }
}
