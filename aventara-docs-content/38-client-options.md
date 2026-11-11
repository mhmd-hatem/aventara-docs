---
title: Client options
description: Configure the generated client - new AvClient with entrypoint and fetch, per-call signal, headers and requestId, authentication through a custom fetch, and aborting.
order: 54
section: frontend
---

# Client options

The default export `avClient` is ready to use against the deployment the client was generated from. When you need another deployment, authentication, or per-call control, there are two levels of options: the client (`new AvClient({ ... })`) and the call (`AvCallOptions`).

## new AvClient({ entrypoint, fetch })

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
| `fetch` | A custom `fetch`. This is how you add authentication: the client adds no headers of its own beyond the protocol's. |

Both are optional. The platform `fetch` is read when a call is made, not on import, so importing the client never fails where there is no `fetch`; a call does, saying why.

`fetch` is typed as your platform's own `fetch` when your `lib` declares one (DOM, `@types/node`), so a function wrapping `fetch` needs no cast.

## Authentication through a custom fetch

Aventara authenticates with [pipeline guards](/docs/configuration#pipelines) on the server, which read request headers. On the client, add the header in a custom `fetch`:

```ts
import { AvClient } from "./api/AvClient";

export const authedClient = new AvClient({
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${getToken()}` },
    }),
});
```

`getToken()` runs on every call, so a refreshed token is picked up. Use a plain `avClient` for public reads and `authedClient` for the rest; a server guard that only guards writes (as in [Example: blog API](/docs/example-blog-api)) answers the plain client with `AvAuthError` (`A4000`).

For cookies, send credentials in the custom fetch:

```ts
const cookieClient = new AvClient({
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
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

`avClient.transaction([...], options)` takes the same options. Per-call `headers` are merged with whatever your custom `fetch` adds.

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

## Recipe: send the same headers on every call

Headers that every request needs, such as an auth token, belong in a custom `fetch` that you set once when you create the client. Every request goes through it, the grouped `POST /_all` included, so every call carries the headers and calls still group.

Per-call `headers` are for one-offs. A call with `headers` is sent alone, never in a `POST /_all` with the calls beside it, so putting the token there on every call turns grouping off.

```ts
import { AvClient } from "./api/AvClient";

const appFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const token = localStorage.getItem("token");
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) window.location.assign("/sign-in");
  return response;
};

export const appClient = new AvClient({
  entrypoint: "https://api.example.com/api",
  fetch: appFetch,
});

// A timeout is per call, and aborts that call only.
const posts = await appClient.Post.find.many({}, { signal: AbortSignal.timeout(5000) });
```

The wrapper adds to what the client sends and leaves the rest alone: it keeps the client's own headers (its identity headers among them; never overwrite those), passes method, body and signal through, returns the `Response` without reading its body (read a `response.clone()` if you must), and lets a failed `fetch` throw, which the client turns into an `AvTransportError` or the abort reason. It reads the token on every request, so a token stored after sign-in is sent from the next call on. `entrypoint` is only needed when the client calls a deployment other than the one it was generated from.

The wrapper sees the status of the whole request. A `POST /_all` is answered `200` even when one of its calls is refused; that call rejects with `AvAuthError` (`A4000`) on its own. To react to every refused call, also catch `AvAuthError` where you make the call.

A call that runs out of time rejects with the signal's reason, a `TimeoutError` (a `DOMException`), whether it went out alone or in a `POST /_all`. The other calls in that request go on.

In a native shell such as Capacitor, the same wrapper can send the request through the platform's native HTTP instead of `fetch`, as long as it returns a `Response`.

## See also

- [Client errors](/docs/client-errors)
- [Client setup](/docs/client-setup)
- [Configuration: pipelines](/docs/configuration#pipelines)
- [Express and Fastify](/docs/express-and-fastify#cors)
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
