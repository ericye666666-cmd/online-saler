# Paid product visibility and order display repair

Eric requested these repairs after the live 300 KSh payment acceptance on 2026-09-12.

The public product detail endpoint will keep already published items visible while
reserved, paid, picked, packed or delivered. It will add an availability field
(AVAILABLE, RESERVED or SOLD). Listing and filter endpoints remain restricted to
available stock. Draft, unpublished, archived, lost and returned inventory remain
excluded. No buyer, order or warehouse details are added to public responses.

The storefront maps this field to display-only status and disables purchasing for
unavailable items. Checkout's existing server-side stock validation remains the
authority. No inventory, payment, refund, commission or fulfillment transitions
change. No schema migration or data repair is required.

Related presentation fixes use the order image snapshot with a valid media fallback
and show zero delivery fees as free without changing stored amounts.

Validation: public visibility boundaries, unavailable purchase controls, order image
URL selection and zero/nonzero/unknown delivery fee cases, followed by deployed
checks on the paid order. Physical picking, packing and handoff require actual
staff confirmation and must not be simulated as completed.

Rollout: API and Operations deployment, then the existing manually confirmed
production storefront workflow. Rollback redeploys prior images; paid orders are
preserved. User approval is already provided in this conversation.
