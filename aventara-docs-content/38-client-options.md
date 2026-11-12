---
title: Client options
description: Configure the generated client - new AvClient with entrypoint, fetch and the onCall, onSuccess and onError hooks, per-call signal, headers and requestId, authentication through onCall, and aborting.
order: 54
section: frontend
---

# Client options

The default export `avClient` is ready to use against the deployment the client was generated from. When you need another deployment, authentication, or per-call control, there are two levels of options: the client (`new AvClient({ ... })`) and the call (`AvCallOptions`).

## new AvClient({ ... })

```ts
import { AvClient } from "./api/AvClient";

const client = new AvClient({
  entrypoint: "https://staging.example.com/api",
  fetch: myFetch,
});
```

| Option | Meaning |
|---|---|
| `entrypoint` | Another deployment to call: one absolute `http(s)` URL (a trailing slash is fine). It must serve exactly the same contract; the contract hash still decides whether it accepts the client. Credentials in the URL are refused. |
| `fetch` | Swaps the transport and nothing else (a test's fake, a runtime's own fetch). It must return the `Response` unread: the client reads the body itself, an Operation Set's line by line as it streams. |
| `grouping` | `false` sends every call of this client alone, on its own route ([Operation Sets](/docs/operation-sets#turning-grouping-off)). |
| `onCall`, `onSuccess`, `onError` | Hooks that see every call the client makes. Headers and credentials for every call go in `onCall`. See [Hooks](#hooks-oncall-onsuccess-onerror). |

All are optional. The platform `fetch` is read when a call is made, not on import, so importing the client never fails where there is no `fetch`; a call does, saying why.

`fetch` is typed as your platform's own `fetch` when your `lib` declares one (DOM, `@types/node`), so the platform `fetch` is accepted without a cast.

## Authentication through onCall

Aventara authenticates with [pipeline guards](/docs/configuration#pipelines) on the server, which read request headers. On the client, add the header in `onCall`:

```ts
import { AvClient } from "./api/AvClient";

export const authedClient = new AvClient({
  onCall: () => ({ headers: { Authorization: `Bearer ${getToken()}` } }),
});
```

`getToken()` runs on every call, so a refreshed token is picked up. Use a plain `avClient` for public reads and `authedClient` for the rest; a server guard that only guards writes (as in [Example: blog API](/docs/example-blog-api)) answers the plain client with `AvAuthError` (`A4000`).

For cookies, return `credentials` from `onCall`:

```ts
const cookieClient = new AvClient({
  onCall: () => ({ credentials: "include" }),
});
```

The server must then allow credentialed CORS for your origin.

## AvCallOptions

Every call takes optional `AvCallOptions` as its last argument. They are never sent in the body:

```ts
await avClient.User.find.many(
  { limit: 10 },
  { signal: controller.signal, headers: { "x-trace": "abc" }, requestId: "checkout-17" },
);
```

| Option | Meaning |
|---|---|
| `signal` | An `AbortSignal`. Aborts this call only, with the signal's reason (an `AbortError`). |
| `grouping` | `false` sends this call alone, on its own route, instead of in a `POST /_all` with the calls made beside it ([Operation Sets](/docs/operation-sets#turning-grouping-off)). `new AvClient({ grouping: false })` does it for every call of that client. |
| `headers` | Extra request headers. The framework's own identity headers cannot be set here. |
| `requestId` | Sent as `Aventara-Request-Id` (1 to 128 visible ASCII characters); wins over that header in `headers`. The server uses it as the correlation id for logs and pipelines. |

`avClient.transaction([...], options)` takes the same options. Per-call `headers` win over a header `onCall` adds.

## Aborting

```ts
const controller = new AbortController();
const pending = avClient.User.find.many({}, { signal: controller.signal });

controller.abort();

try {
  await pending;
} catch (e) {
  // e.name === "AbortError" (a DOMException): not a AvTransportError, not a AvError
}
```

A typical use is cancelling the previous request when an input changes, or when a component unmounts:

```tsx
useEffect(() => {
  const controller = new AbortController();
  avClient.Post.find
    .many({ where: { title: { contains: term } } }, { signal: controller.signal })
    .then(setPosts)
    .catch((e) => { if (!controller.signal.aborted) throw e; });
  return () => controller.abort();
}, [term]);
```

Aborting stops waiting for the answer. A write that already reached the server may still have been applied.

Each call has its own abort, also when it went out in one `POST /_all` with other calls: aborted before it is sent, it is never sent; aborted after, it rejects at once and the others go on, and the request itself is aborted only once every call in it has been. `avClient.all({ ... }, { signal })` aborts every call in that `all`. The full table: [Several operations in one round trip](/docs/operation-sets#aborting).

## Hooks: onCall, onSuccess, onError

Three options of `new AvClient(…)` see every call the client makes: an operation, a cached read, a transaction (once, whatever its steps) and a `$access` call. Each takes the call as an `AvCall`: its `kind` (`"operation"`, `"transaction"`, `"access"`), its `label` (`"Post" find.many`), the `resource`, `family` and `variant` of an operation, the `verb` of a `$access` call, and its `requestId` when it sends one. Never its arguments.

- `onCall(call)` runs when the call is made, before it is sent and before the calls made with it are grouped. It may return, or resolve to, `AvCallAdditions` for that call's request: `headers`, `credentials`, `cache`, `keepalive`, `priority` and `referrerPolicy`. Calls share one `POST /_all` only when their additions are equal (in any order).
- What the request sends, in order: `onCall`'s additions, then the call's own `headers` option, which wins over them, then the client's own headers (`Content-Type`, `Accept` and the `Aventara-*` headers), which always win. Setting one of the client's own headers in `onCall`, or `method`, `body`, `signal`, `redirect` or `mode`, is a type error. At runtime such a header is dropped with a warning (`AVENTARA_CLIENT_HOOK_HEADER_DROPPED`).
- `onSuccess(call, result)` and `onError(call, error)` are sinks, for side effects only (log, report, navigate). What they return is ignored and an async one is not awaited, so they never delay the caller, and they cannot swallow, change or retry a call. `onError` sees every rejection (a refusal, a validation error, a transport failure, an abort), sent alone or inside a `POST /_all`, and the caller still gets the same rejection.
- A hook that throws or rejects is reported once as a warning (`AVENTARA_CLIENT_HOOK_THREW`) and skipped: the call goes on, with no additions when it was `onCall`.

### How onCall affects grouping

An async `onCall` holds back its own call and no other. The calls made together are sent once a microtask passes with no new call; a call whose `onCall` has not settled by then is sent when it settles, together with the calls queued at that moment. So calls group when their `onCall` settles together with equal additions.

An `onCall` that does its own I/O for each call (reads the token again for every call) settles each call at its own time and sends each in its own request. To keep grouping, have `onCall` await one shared in-flight promise, cleared once it settles, as in the recipe below.

## Recipe: send the same headers on every call

Headers that every call needs, such as an auth token, go in `onCall`, set once when you create the client. Every request carries them, the grouped `POST /_all` included, and the calls still group.

Per-call `headers` are for one-offs. A call with `headers` is sent alone, never in a `POST /_all` with the calls beside it, so putting the token there on every call turns grouping off.

```ts
import { AvAuthError, AvClient } from "./api/AvClient";

// One read of the token for every call made while it is in flight, so those calls still group.
let inFlight: Promise<string> | undefined;
const token = (): Promise<string> =>
  (inFlight ??= fetch("/session/token")
    .then((response) => response.text())
    .finally(() => {
      inFlight = undefined;
    }));

export const appClient = new AvClient({
  onCall: async () => ({ headers: { Authorization: `Bearer ${await token()}` } }),
  onError: (_call, error) => {
    if (error instanceof AvAuthError) window.location.assign("/sign-in");
  },
});

// A timeout is per call, and aborts that call only.
const posts = await appClient.Post.find.many({}, { signal: AbortSignal.timeout(5000) });
```

Every call made while `token()` is in flight awaits the same promise, so they settle together with equal additions and share one `POST /_all`. If `token()` rejects, `onCall` rejects: it is reported as a warning and the call goes on with no additions, so without `Authorization`; a guarded call then likely fails with `AvAuthError` and reaches `onError`.

`onError` sees an `AvAuthError` (`A4000`, a 401) for every refused call, a call inside a `POST /_all` included: the `/_all` itself is answered `200`, and each call is refused on its own.

A call that runs out of time rejects with the signal's reason, a `TimeoutError` (a `DOMException`), whether it went out alone or in a `POST /_all`. The other calls in that request go on. `onError` sees that rejection too.

`fetch` is only for swapping the transport. In a native shell such as Capacitor, a custom `fetch` can send the request through the platform's native HTTP, as long as it returns the `Response` unread.

### In a Next.js app

The hooks for `@/aventara/client` and `@/aventara/universal` go in `src/aventara/client-options.ts` (or `.js`), whose default export `aventara-build --client` gives every client it writes (run `aventara:prepare`):

```ts
import type { AvClientOptions } from "@/aventara/client";

export default {
  onCall: () => ({ headers: { "X-Tenant": "acme" } }),
  onError: (call, error) => console.warn(call.label, error),
} satisfies Pick<AvClientOptions, "onCall" | "onSuccess" | "onError">;
```

- The file is bundled into the browser too: import nothing server-only into it and keep no secret there. Branch on `typeof window` when a hook must act differently on the server.
- The hooks read the default export when they run, so the file may import from `@/aventara/client` (an error class for `instanceof`).
- If the file has no default export, or its default export is not an object, the clients run without hooks, and the first call prints one `AVENTARA_CLIENT_OPTIONS_NO_DEFAULT` warning ([Error codes: client warnings](/docs/error-codes#client-warnings)).
- `fetch`, `grouping` and `entrypoint` in the file are type errors: the entries keep their own.
- On the server, `@/aventara/universal` calls the app in process: `onCall`'s headers reach that request, but its state is seeded from the request being served, so a header added there signs no one in.
- `@/aventara/server`'s `avClient` is the Framework's own in-process client, not an `AvClient`, and takes no hooks.

## See also

- [Client errors](/docs/client-errors)
- [Client setup](/docs/client-setup)
- [Configuration: pipelines](/docs/configuration#pipelines)
- [Express and Fastify](/docs/express-and-fastify#cors)
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
