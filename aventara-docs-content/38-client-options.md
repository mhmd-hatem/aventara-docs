---
title: Client options
description: Configure the generated client - new AvClient with entrypoint and fetch, per-call signal, headers and requestId, authentication through a custom fetch, and aborting.
order: 54
section: frontend
---

# Client options

The default export `avClient` is ready to use against the deployment the client was generated from. When you need another deployment, authentication, or per-call control, there are two levels of options: the **client** (`new AvClient({ ... })`) and the **call** (`CallOptions`).

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

`getToken()` runs on every call, so a refreshed token is picked up. Use a plain `avClient` for public reads and `authedClient` for the rest; a server guard that only guards writes (as in [Example: blog API](/docs/example-blog-api)) answers the plain client with `AuthError` (`A4000`).

For cookies, send credentials in the custom fetch:

```ts
const cookieClient = new AvClient({
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});
```

The server must then allow credentialed CORS for your origin.

## CallOptions

Every call takes optional `CallOptions` as its **last** argument. They are never sent in the body:

```ts
await avClient.User.find.many(
  { limit: 10 },
  { signal: controller.signal, headers: { "x-trace": "abc" }, requestId: "checkout-17" },
);
```

| Option | Meaning |
|---|---|
| `signal` | An `AbortSignal`. An abort rejects with what `fetch` rejected with. |
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
  // e.name === "AbortError" (a DOMException): not a TransportError, not a FrameworkError
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

## See also

- [Client errors](/docs/client-errors)
- [Client setup](/docs/client-setup)
- [Configuration: pipelines](/docs/configuration#pipelines)
- [Express and Fastify](/docs/express-and-fastify#cors)
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
