---
title: Several operations in one round trip
description: Calls made together go out as one POST /_all. avClient.all with strict and settle modes, aborting one call or a whole group, streamed answers, grouping false, avLazy, how /_all differs from /_transactions, and avClient.all on the server.
order: 56
section: frontend
---

# Several operations in one round trip

A page often needs several reads at once: a list, a count, the signed-in user. Each one used to be its own request. Since rc.11, the generated client sends the calls you make together as one request, `POST /api/_all`, and each call still resolves or throws on its own. You don't write anything new for it.

The server calls this request an **Operation Set**: several independent operations, run concurrently, each exactly as it would run alone.

## Calls made together share one request

```ts
import avClient from "./api/AvClient";

const [posts, published, me] = await Promise.all([
  avClient.Post.find.many({ where: { published: true }, select: ["id", "title"] }),
  avClient.Post.find.count({ where: { published: true } }),
  avClient.User.find.unique({ where: { id: 1 } }),
]); // one POST /api/_all
```

- **Together** means made before the microtask queue settles: one `Promise.all`, several async functions started together, or `avClient.all` (below). No timer is involved. A call made on its own still goes to its own route, `POST /api/_resources/<Resource>/<family>/<variant>`.
- **Each call runs as alone.** Validation, exposure, policy, limits and pipelines are the same as for its own route, and so is its answer. A call that is refused or fails changes nothing for the others.
- **Not atomic.** The calls run concurrently and in no set order. A write that ran stays written, whatever the other calls answered. When calls must succeed or fail together, or one needs another's result, use a [transaction](#operation-set-or-transaction).
- **Reads and writes mix.** A group can hold any operation the contract advertises.
- **Large groups are split.** A group with more calls than the contract's `limits.maxAll` (10 by default), or bigger than `limits.maxRequestBytes`, goes out as several requests.

Some calls always go alone, on their own route:

| Call | Why |
|---|---|
| A call with `headers` or a `requestId` in its options | Headers and a request id belong to one HTTP request. |
| A call made with `{ grouping: false }`, or any call of a client made with `new AvClient({ grouping: false })` | You asked for it ([below](#turning-grouping-off)). |
| A transaction | It has its own route, `/_transactions`. |
| A [cached read](/docs/caching-reads) | It is a `GET` with its own URL, so the browser or a CDN can keep its answer. |

A server older than rc.11 has no `/_all`. It answers `A2002` (or `A2000`), and the client sends the same calls again one by one and stops grouping for that client. You don't see the difference except in the network tab.

## Calls run when you make them

A call runs when you make it, as `fetch` does: its arguments are checked and encoded at once, and it is queued for the end of the tick. A call you never await still runs. Awaiting it twice does not send it twice. Transactions follow the same rule.

When you want to describe a call now and run it later, wrap it in `avLazy`:

```ts
import avClient, { avLazy } from "./api/AvClient";

const drafts = avLazy(() => avClient.Post.find.many({ where: { published: false } })); // nothing sent yet

const list = await drafts; // sent now, once
```

`avLazy(() => call)` makes the call when it is first awaited (its first `then`, `catch` or `finally`) and settles as that call does. `avLazy` is a named export of the generated client, beside the default `avClient`; on the server it comes from `@aventara/core`. `avClient.all` accepts it like any call.

How often it calls depends on where it runs:

| Where | Awaited again |
|---|---|
| The browser (the generated client) | Keeps its one answer: the call is made once. |
| The server (`avLazy` from `@aventara/core`) | Calls again on every await. It keeps no answer, so one `avLazy` can never hand one request's result to another. |
| Next.js `@/aventara/universal` on the server | Keeps its answer within one request's React render, and only there. |

## `avClient.all`

`Promise.all` already groups, but it gives you a tuple, and the first rejection hides the others. `avClient.all` takes an object of calls and gives you one typed value per key:

```ts
import avClient from "./api/AvClient";

const { posts, published } = await avClient.all({
  posts: avClient.Post.find.many({ select: ["id", "title"] }),
  published: avClient.Post.find.count({ where: { published: true } }),
});
// posts: readonly { id: number; title: string }[], published: number
```

The keys are yours and are never sent: the client makes its own keys for the request.

### Strict by default

The first failure rejects `all` with that call's error and aborts the other calls in it. This is fail-fast, not atomic: a write that already ran stays written.

### `settle: true`

With `{ settle: true }`, every key settles on its own and `all` never rejects because of one key. Each value has the shape `Promise.allSettled` uses:

```ts
import avClient from "./api/AvClient";

const panels = await avClient.all(
  {
    posts: avClient.Post.find.many({ select: ["id", "title"] }),
    published: avClient.Post.find.count({ where: { published: true } }),
  },
  { settle: true },
);

if (panels.posts.status === "rejected") {
  console.error(panels.posts.reason); // show this panel's error, render the others
} else {
  console.log(panels.posts.value.length);
}
```

| | Strict (default) | `settle: true` |
|---|---|---|
| Resolves to | `{ key: value }` | `{ key: { status: "fulfilled", value } \| { status: "rejected", reason } }` |
| One call fails | `all` rejects with that error and aborts the others | that key is `rejected`; the others go on |
| Use it when | the page needs every value to render | each panel can render or fail on its own |

## Aborting

Every call has its own abort. A call's `signal` aborts that call and nothing else; `avClient.all({ ... }, { signal })` aborts every call in that `all`.

```ts
import avClient from "./api/AvClient";

const page = new AbortController();
const search = new AbortController();

const result = avClient.all(
  {
    posts: avClient.Post.find.many({ where: { title: { contains: "rc" } } }, { signal: search.signal }),
    published: avClient.Post.find.count({ where: { published: true } }),
  },
  { signal: page.signal },
);

search.abort(); // only `posts` stops; strict mode then rejects `all` with its AbortError
```

| What you abort | What happens |
|---|---|
| A call's own `signal`, before the request is sent | The call is dropped and never sent. |
| A call's own `signal`, after the request is sent | That call rejects at once with the signal's reason (an `AbortError`). The other calls in the same request go on. |
| The `signal` of `avClient.all(..., { signal })` | Every call in that `all` is aborted, as if by its own signal. A call inside `all` stops on whichever of the two signals fires first. |
| Calls grouped in the same request but not in that `all` | Never touched. |
| Every call in a request | The HTTP request itself is aborted. The server starts none of the operations it had not started yet. |
| A strict `all` whose call failed | Its other calls are aborted. |

The server still finishes an operation it has already started: there is no way to cancel a database query once it runs. A write that started is written.

Nothing is aborted for you: there is no default timeout and no abort on navigation. Pass the signal your data library gives you. TanStack Query and SWR pass one per query, and an effect can abort on cleanup:

```tsx
import { useEffect, useState } from "react";
import avClient from "./api/AvClient";

export function Dashboard() {
  const [count, setCount] = useState<number>();
  useEffect(() => {
    const controller = new AbortController();
    avClient
      .all({ published: avClient.Post.find.count({ where: { published: true } }) }, { signal: controller.signal })
      .then(({ published }) => setCount(published))
      .catch(() => undefined); // aborted on unmount, or failed
    return () => controller.abort();
  }, []);
  return <p>{count ?? "..."}</p>;
}
```

## Streamed answers

The client asks for a streamed answer (`Accept: application/x-ndjson`) wherever the runtime can read a stream, which is every current browser and Node. The server then writes one line per call as soon as that call is done, so a fast count does not wait for a slow list:

```text
{"key":"k1","envelope":{"data":3,"code":"A1000","cause":null}}
{"key":"k0","envelope":{"data":[{"id":1,"title":"Hello"}],"code":"A1000","cause":null}}
```

Each call resolves when its own line arrives. Where the runtime cannot read a stream (React Native, for example), the client reads the one JSON answer instead. Either way each call gets the same result. The wire format is on [HTTP protocol](/docs/http-protocol#operation-sets).

The streamed answer is sent with `Cache-Control: no-store` and `X-Accel-Buffering: no`, so no cache keeps it and a buffering proxy such as nginx passes each line on. If your proxy buffers responses another way, turn that off for `/api/_all`, or the calls simply resolve together at the end.

## Turning grouping off

Grouping is on by default and you rarely need to think about it. Turn it off for one call, or for a whole client:

```ts
import avClient, { AvClient } from "./api/AvClient";

// one call, on its own route
await avClient.Post.find.many({ select: ["id"] }, { grouping: false });

// every call of this client
const plain = new AvClient({ grouping: false });
await plain.Post.find.count({});
```

Reasons to do it:

- **Debugging.** Each call shows up as its own request in the network tab and the server log.
- **Per-route monitoring or rate limits.** Your APM, gateway or rate limiter counts requests per URL, and one `/_all` hides which operations it carried.
- **A proxy or firewall that allows only known routes.** If it lets through `/_resources/...` but not `/_all`, the server never sees the set. (A server that answers `A2002` is handled for you; a proxy that answers something else is not.)

## Operation Set or transaction

`/_all` and [`/_transactions`](/docs/transactions-with-ref) both carry several operations in one request. They answer different questions.

| | `POST /_all` (Operation Set) | `POST /_transactions` (transaction plan) |
|---|---|---|
| From the client | automatic, or `avClient.all({ ... })` | `avClient.transaction([avClient.tx...])` |
| Order | none: the operations run concurrently | in order, one after another |
| Atomic | no: each operation commits on its own | yes: all commit or all roll back |
| One operation uses another's result (`$ref`) | no | yes |
| A failure | answered on its own key; the others go on | the whole plan rolls back and answers the failing step's code |
| Answer | `200 A1000`, each key holding its own envelope | `200 A1009` with an array of results, or the failing step's status |
| Limit | `limits.maxAll` (10) | `limits.maxTransactionOperations` (20) |
| Available | whenever the contract advertises an operation | only with `interactive` transactions |

Use `/_all` (or just `Promise.all`) to load a page. Use a transaction when the writes must hold together: an order and its lines, a transfer between two accounts.

## On the server: `avClient.all` in process

Server code has the same `all`. In a Next.js app, `avClient` from `@/aventara/server` is the client layer in process, and its `all` takes the same object and the same options:

```tsx
// src/app/dashboard/page.tsx
import { avLazy } from "@aventara/core";
import { avClient } from "@/aventara/server";

export default async function Dashboard() {
  const { posts, published } = await avClient.all({
    posts: avClient.Post.find.many({ select: ["id", "title"] }),
    published: avLazy(() => avClient.Post.find.count({ where: { published: true } })),
  });
  return <p>{posts.length} posts, {published} published</p>;
}
```

On the server there is no HTTP request, so a few things differ:

- **Any number of entries.** `limits.maxAll` guards the HTTP route only. A server-side `all` takes as many calls as you give it.
- **`limits.maxAllConcurrency` still applies, to `avLazy` entries.** A plain call has already started when you make it, so `all` can only await it. Wrap a call in `avLazy` to let `all` start it: at most `maxAllConcurrency` (4 by default) run at once, in key order, and no new entry starts after a strict `all` has seen a failure or been aborted. An entry freed in the same tick may still start.
- **`avLazy` comes from `@aventara/core`** on the server; in the browser it is the generated client's export.
- Each call runs with the request's state and principal, exactly as alone.
- **Nothing is grouped on the server.** There is no HTTP request to save, so a server-side call runs on its own as soon as it is made, in the context of the request that made it. In a Next.js app, `@/aventara/universal` groups calls in the browser only; on the server each of its calls runs in process on its own.

Outside Next.js, the same member is `framework.serverClient.all` ([Server-side usage](/docs/server-side-usage#frameworkserverclient-the-client-layer-with-application-values)).

## The limits

| Limit | Default | What it bounds |
|---|---|---|
| `maxAll` | `10` | Operations in one `POST /_all`. More is refused whole with `422 A2009` / `V1014`. The generated client splits a larger group for you. |
| `maxAllConcurrency` | `4` | Operations of one set (over HTTP or in process) running at once. The rest wait their turn, in key order. |

Both are ordinary limits: set them at the root, override them in `client` or `application` ([Limits and safety](/docs/limits-and-safety#operation-sets)). You don't need to grow the database pool for `/_all`: the concurrency limit keeps one request from taking more than its share of it.

## See also

- [Caching reads](/docs/caching-reads): reads that go out as `GET` instead
- [HTTP protocol: Operation Sets](/docs/http-protocol#operation-sets): the wire format
- [Client options](/docs/client-options): `signal`, `grouping`, `headers`
- [Transactions with $ref](/docs/transactions-with-ref)
- [TanStack Query and SWR](/docs/tanstack-query-and-swr)
