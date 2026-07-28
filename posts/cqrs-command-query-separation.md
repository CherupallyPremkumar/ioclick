# CQRS: split the write model from the read model

Most services use **one model** for everything — the same entities and tables handle both “change this data” and “show me this data.” That works until reads and writes start pulling in opposite directions. CQRS is the decision to stop sharing that model.

## The core idea

**CQRS — Command Query Responsibility Segregation** — separates the two jobs:

- **Commands** change state. `PlaceOrder`, `CancelOrder`, `UpdateAddress`. They return little or nothing — just success/failure.
- **Queries** read state. `GetOrderSummary`, `ListOpenOrders`. They never change anything.

The insight: the shape of data you need to **write** is rarely the shape you need to **read**. Writes want a normalized, consistent, rule-enforcing model. Reads want a denormalized, fast, screen-shaped model. Forcing both through one model means every read carries the weight of the write rules, and every write is contorted to keep reads convenient.

## Two models, one system

```
          COMMANDS                         QUERIES
        (write side)                      (read side)

  PlaceOrder ──▶ Order aggregate     GetDashboard ──▶ read model
                 enforces rules                        pre-joined,
                 normalized                            denormalized
                     │                                     ▲
                     └────────── events / sync ────────────┘
```

The write side validates and stores. It then **publishes what changed** (often as events). The read side listens and updates its own **read models** — tables (or documents, or a cache) already shaped exactly like the screens that query them. A dashboard query becomes a single-row lookup instead of a five-table join.

## What it buys you

- **Reads scale independently of writes.** Put the read models on replicas, caches, or a search index — without touching write consistency.
- **Each side gets its natural shape.** No more “this join is slow because the write model is normalized.”
- **Clear intent.** A `CancelOrder` command says what the user wants; a pile of `UPDATE` statements does not.

## The cost — be honest about it

CQRS is **not** free, and it is **not** a default:

- **Eventual consistency.** The read side lags the write side by however long the sync takes. A user who just placed an order might not see it for a few hundred milliseconds. If your UX can’t tolerate that, CQRS on that path is a mistake.
- **More moving parts.** Two models, a sync mechanism, and the failure modes in between.
- **Duplication.** The same data lives in the write store and one or more read models.

## When to reach for it

Use CQRS on the **specific parts** of a system where reads and writes genuinely diverge — a reporting dashboard, a high-traffic product listing, an audit view. Do **not** CQRS your entire application because it sounds clean.

> Rule of thumb: reach for CQRS when a single model is actively hurting you — slow reads fighting normalized writes, or read traffic that dwarfs write traffic. Not before.

## CQRS vs Event Sourcing

They travel together but aren’t the same thing:

- **CQRS** = separate read and write **models**.
- **Event Sourcing** = store state as a **log of events** instead of current rows.

You can do CQRS with plain tables and no event sourcing. You can do event sourcing without CQRS. They pair well — events are a natural way to feed read models — but adopting one does not commit you to the other.

## The takeaway

CQRS isn’t “write service and read service.” It’s a deliberate answer to a real problem: **when one model can no longer serve both masters, stop making it try.** Apply it where the pain is, accept the eventual consistency, and keep the rest of your system simple.
