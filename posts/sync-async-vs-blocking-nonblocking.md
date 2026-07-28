# Sync vs Async vs Blocking: the distinction interviews love

How can Service A communicate with Service B?

My immediate answer: two ways — **synchronous** or **asynchronous** communication. Google and ChatGPT gave me the same answer, so I thought I was done.

Then the interviewer asked: *“Where does `CompletableFuture` fit? Is it synchronous or asynchronous communication?”*

That’s when I realized there are actually **two different concepts** most developers mix together.

## Two questions, not one

**① Service communication pattern** — how two services talk, over the network.

- Synchronous: REST, SOAP, blocking gRPC
- Asynchronous: Kafka, RabbitMQ, AWS SQS, Google Pub/Sub

**② Programming model** — how *your* application handles the call, on *your* threads.

- Blocking: RestTemplate
- Non-blocking: WebClient
- Async: CompletableFuture

## Here's the interesting part

```
CompletableFuture.supplyAsync(() ->
    restTemplate.getForObject(url, User.class)
);
```

The HTTP call is still **synchronous** (request → response). `CompletableFuture` doesn’t change that — it just hands the blocking call to a worker thread so your calling thread is free. A thread is still parked on that HTTP call; it’s async, but **not truly non-blocking**.

Spring `WebClient` goes one step further: the HTTP is still request-response, but it parks **no** thread at all. That’s true non-blocking I/O.

> Sync vs Async is **between services**. Blocking vs Non-blocking is **inside a service**. Different axes — any combination is valid.

## Then it went one level deeper

*“Service A needs data from B, C and D, combine it, and return it to the user. How — and how does the response get back?”*

**Sequential:** call B (200ms) → call C (200ms) → call D (200ms) = **600ms**

**Parallel** with `CompletableFuture`: all three at once = **200ms** (the slowest one).

```
CompletableFuture<B> bf = CompletableFuture.supplyAsync(() -> callB());
CompletableFuture<C> cf = CompletableFuture.supplyAsync(() -> callC());
CompletableFuture<D> df = CompletableFuture.supplyAsync(() -> callD());

CompletableFuture.allOf(bf, cf, df).join();      // wait for all three
return combine(bf.get(), cf.get(), df.get());    // then respond
```

The real win here is **parallelism** — total time drops from 600ms to ~200ms.

## “If the main thread moved on, how does the response reach the user?”

Here’s the misconception: the main thread does **not** finish and leave. Look at `.join()` — it *parks* right there and waits until B, C, D all complete, then wakes up, combines the results, and writes the response itself.

- Main thread fires 3 async calls → 3 pool threads run B/C/D in parallel
- Main thread blocks at join() — still holding the request
- All three finish → main thread resumes → returns the response

## The deeper insight

> The HTTP connection is a **TCP socket**. It stays open on its own — independent of any thread.

The browser sent one request and is still holding that socket open, waiting for bytes. A thread is just a worker; the *connection* is the socket. So even in the fully-async style:

```
@GetMapping("/dashboard")
public CompletableFuture<Result> dashboard() {
    var bf = supplyAsync(() -> callB());
    var cf = supplyAsync(() -> callC());
    var df = supplyAsync(() -> callD());
    return bf.thenCombine(cf, ...).thenCombine(df, ...);
}
```

Spring **releases the servlet thread but keeps the socket open**. When the future completes, whichever pool thread finished it writes the response to that still-open socket.

PatternMain threadHow the response returns`allOf().join()`waits at join, then resumesit writes the response itselfreturn `CompletableFuture`freed immediatelysocket stays open; the completing pool thread writes it

## Key takeaways

1. Sync vs Async (between services) ≠ Blocking vs Non-blocking (inside a service).
2. CompletableFuture frees your thread; WebClient frees the thread and parks none on I/O.
3. Parallel calls make latency the slowest call, not the sum.
4. The response isn’t tied to a thread — it’s tied to the open socket. The client holds one request the whole time and gets the reply once the aggregation is done.

Small distinctions — but they’re the line between a junior answer and a senior one.