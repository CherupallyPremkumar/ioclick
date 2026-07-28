# Idempotency: the payment bug that never shows up in testing

Here’s a bug that passes every test you write, sails through code review, and then quietly charges your reputation in production: **the duplicate order.** It comes from one wrong assumption — that a webhook fires exactly once.

## The problem

Your payment gateway (Razorpay, Stripe, whoever) calls your webhook when a payment succeeds:

```java
void onPaymentCaptured(WebhookEvent e) {
    createOrder(e);
    reduceStock(e);
    sendConfirmationEmail(e);
}
```

Looks fine. Passes tests. But gateways guarantee **at-least-once** delivery, not exactly-once. If your server is slow, times out, or the network blips, the gateway **retries** — sending the *same* event again, sometimes three or four times.

So one payment becomes:

```
delivery  → order #1001, stock −1, email sent
RETRY     → order #1002, stock −1, email sent   ← duplicate
RETRY     → order #1003, stock −1, email sent   ← duplicate
```

And it works perfectly in every test — because in a test the webhook fires **once**. That’s exactly why it survives to production.

## The fix: make it idempotent

Idempotent means: **processing the same event ten times leaves the system exactly as if you processed it once.**

Every webhook carries a unique event id. Record the ones you’ve handled, and refuse to handle any id twice — inside a single transaction:

```java
void onPaymentCaptured(WebhookEvent e) {
    if (processed.exists(e.id())) return;   // ① seen it? stop.

    try (Transaction tx = db.begin()) {     // ② one atomic unit
        createOrder(e);
        reduceStock(e);
        processed.insert(e.id());           // ③ record the id
        tx.commit();
    }
}
```

## The real hero is the database

The `if`-check alone is not enough — two retries can arrive at the same millisecond and both pass the check before either inserts. The guarantee has to live in the **data layer**:

```sql
CREATE TABLE processed_events (
    event_id   VARCHAR(64) PRIMARY KEY,   -- duplicates physically impossible
    handled_at TIMESTAMP DEFAULT now()
);
```

With `event_id` as the primary key, even under a race the database rejects the second insert. The `if`-check is an optimization; the **unique constraint** is the correctness.

## Spotting the next one before it happens

The fix is easy once you see the bug. The skill is smelling it in code that *looks* fine:

> **Any endpoint an external system can call — webhook, queue, retry, a user’s double-click — must be safe to run twice.** If something else decides how often my code runs, I assume it runs more than once.

Three habits that catch it early:

- **Ask of every write:** “What happens if this runs twice?” If the answer is *duplicate data, double charge, wrong stock* — you’ve found a future incident.
- **Put the guard in the database,** not just in an `if`. A `UNIQUE` constraint or upsert makes the duplicate impossible, not merely unlikely.
- **Write the test almost nobody writes:** fire the same event twice, assert only one order exists.

```java
@Test
void duplicateWebhook_createsExactlyOneOrder() {
    WebhookEvent e = paymentCaptured("evt_9f3a");
    handler.onPaymentCaptured(e);
    handler.onPaymentCaptured(e);   // the retry
    handler.onPaymentCaptured(e);   // and again
    assertThat(orders.count()).isEqualTo(1);
}
```

## The takeaway

The same instinct prevents duplicate refunds, inventory oversell, and double-sent notifications — anywhere “exactly once” is assumed but not enforced. Idempotency isn’t a payment feature; it’s how you survive a world that retries.
