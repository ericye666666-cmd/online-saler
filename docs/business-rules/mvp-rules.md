# MVP Business Rules

These rules define the first 1,000-item Kikuyu MVP.

## Inventory

- Each second-hand clothing item is unique.
- The first 1,000 online items are fully isolated from store inventory.
- The cart does not reserve inventory.
- Inventory is reserved only after payment is initiated.
- Reservation duration is 15 minutes.
- One phone number may reserve at most 5 items at the same time.

## Payment

- Customers pay the platform, not the affiliate.
- M-Pesa is the first payment method.
- Payment callbacks must be idempotent.
- Payment status and order status are separate.

## Fulfillment

- Kikuyu warehouse pickup is free.
- Delivery inside the designated Kikuyu zone is 50 KSh.
- If delivery fails due to customer contact, address, or refusal, a second delivery costs another 50 KSh.

## Returns

Returns are accepted only when:

- The wrong item was delivered.
- The received item is materially different from the photos.
- A major defect was not disclosed.
- A key measurement differs by more than 3 cm.
- The item was seriously damaged during delivery.

Return requests must be submitted within 24 hours after delivery.

## Affiliate

- Affiliate distribution is single-level in the MVP.
- Attribution uses the last valid referral source.
- Attribution expires after 7 days.
- Commission is estimated after payment.
- Commission is confirmed 24 hours after delivery if no valid return request exists.
- Commission is paid weekly.
- Refunded items revoke the related commission.

## Explicitly Out of Scope

- Multi-vendor marketplace.
- Multi-level distribution.
- Native app.
- AI recommendation.
- Nationwide delivery automation.
- General merchandise agency model.
