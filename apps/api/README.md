# API

Unified backend API for all frontends.

The first implementation should be a modular monolith with separate modules for foundation, product, inventory, transaction, payment, fulfillment, affiliate, and data operations.

Foundation endpoints:

- `GET /health`
- `GET /foundation/rules`

Run locally:

```bash
npm run dev:api
```
