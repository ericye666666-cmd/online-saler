# System Overview

The MVP has three frontends and one modular backend.

```text
Customers / affiliates / employees / managers
        |
        v
+-------------------+  +-------------------+  +-------------------+
| Storefront        |  | Operations App    |  | Admin Console     |
| Customer shopping |  | Employee work     |  | Management        |
+---------+---------+  +---------+---------+  +---------+---------+
          \                     |                      /
           \                    |                     /
            v                   v                    v
                  Unified Backend API
                         |
                         v
+------------------------------------------------------------------+
| Middle-platform modules                                           |
| Foundation | Product | Inventory | Transaction | Payment          |
| Fulfillment and Returns | Affiliate and Commission | Data Ops      |
+------------------------------------------------------------------+
                         |
                         v
      PostgreSQL + Cloud Storage + M-Pesa + Social Links
```

## Frontends

- Storefront: browse, filter, buy, pay, track order, request support.
- Operations App: scan, upload, review, store, pick, pack, hand off, support.
- Admin Console: monitor, configure, approve, reconcile, audit, export.

## Backend Principle

The first version is a modular monolith, not microservices. Each middle-platform module owns its rules, tables, APIs, and tests, but all modules deploy together through the unified API.
