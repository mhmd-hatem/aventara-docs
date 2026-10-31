---
title: Caching reads
description: Let a browser or a CDN keep a read's answer with the cache({ for, maxAge }) stage. The three audiences, where the stage goes and which one wins, the GET URL, the headers, and what to set on a CDN.
order: 32
section: guides
---

# Caching reads

Every operation is a `POST` by default, reads included, and nothing caches a `POST`. To let the browser, or a CDN in front of your API, keep a read's answer, give the read a `cache` stage. The generated client then sends it as a `GET`, and the server answers it with the caching headers the stage asks for.

```ts
import { cache } from "@aventara/core";

resources: {
  Category: { pipelines: { cache: cache({ for: "everyone", maxAge: 300 }) } },   // every find of Category
  Post: {
    operations: {
      find: { many: { pipelines: { cache: cache({ for: "anonymous", maxAge: 60 }) } } },   // Post.find.many only
    },
  },
  User: { pipelines: { cache: cache({ for: "user", maxAge: 30 }) } },
},
```

`cache({ for, maxAge })` is plain data, not a function that runs: the server reads it when it builds the contract.

- `maxAge`: how long an answer may be kept, in whole seconds (`max-age`).
- `for`: who may share one answer. See [the three audiences](#the-three-audiences).

**Always write `for`, and write it first**, even for the default `"user"`. The audience is the promise this read makes about its answer, and a reviewer should see it without knowing the default. Aventara does not check the promise: it sends the headers you asked for.

## The three audiences

| `for` | The promise | What a `200` carries |
|---|---|---|
| `"user"` (default) | The answer is this caller's own. | `Cache-Control: private, max-age=<maxAge>`, `Vary: Authorization, Cookie`. Only the caller's browser keeps it. |
| `"anonymous"` | Every anonymous caller gets the same answer. | To an anonymous caller: `Cache-Control: public, max-age=<maxAge>`, so a CDN may keep it. To a signed-in caller: `private, max-age=<maxAge>`. Both with `Vary: Authorization, Cookie`. |
| `"everyone"` | Every caller gets the same answer. | `Cache-Control: public, max-age=<maxAge>`. A CDN may hand it to anyone. |

Aventara adds its `Vary` names to whatever `Vary` your CORS setup or middleware already set, so with CORS on, a `"user"` or `"anonymous"` answer carries `Vary: Origin, Authorization, Cookie` and an `"everyone"` answer keeps `Vary: Origin`.

Pick the narrowest one that is true:

- `"user"` fits anything a signed-in user reads about themselves: their orders, their drafts, their settings. It still saves requests, in that user's browser.
- `"anonymous"` fits pages that look the same to every visitor who is not signed in, and may differ once they are: a product list with member prices, a feed that hides drafts from strangers.
- `"everyone"` fits data that never depends on who asks: categories, a public price list, a published article. Use it only where nothing makes the answer differ by caller: no guard or pipe that reads the caller, no [computed field](/docs/computed-fields) that does, no [policy](/docs/policies) that scopes the rows or fields. If one does, a CDN serves one caller's answer to everybody.

### Who counts as anonymous

- **With a policy** (the `policy` key, or an access provider's), a caller is anonymous when the principal the policy derives from the request's state is `null` or `undefined`.
- **Without a policy**, a request that sends no `Cookie` and no `Authorization` header is anonymous.

If your callers sign in with a header of your own (`X-Api-Key`, `X-Session`), Aventara cannot see it without a policy. Configure a [policy](/docs/policies) that reads it, or don't use `"anonymous"` or `"everyone"` for reads that depend on it.

## Where the stage goes

`pipelines.cache` can go at five levels, and only on reads:

| Level | Example | Applies to |
|---|---|---|
| The root, or the `client` layer | `pipelines: { cache: cache({ for: "user", maxAge: 10 }) }` | every `find` of every Resource |
| A Resource | `resources.Post.pipelines.cache` | every `find` of `Post` |
| The `find` family | `resources.Post.operations.find.pipelines.cache` | every `find` variant of `Post` |
| One `find` variant | `resources.Post.operations.find.many.pipelines.cache` | `Post.find.many` only |

Other pipeline stages add up across levels. `cache` does not, because one read has one cache policy:

- **The most specific level wins**: the variant's stage, then the family's, then the Resource's, then the layer's.
- **At one level, the `client` layer's stage replaces the root's**, the same way a scoped `limits` value wins over the root one.

```ts
import { cache } from "@aventara/core";

resources: {
  Post: {
    pipelines: { cache: cache({ for: "user", maxAge: 30 }) },          // Post.find.unique, .first, .count
    operations: {
      find: { many: { pipelines: { cache: cache({ for: "anonymous", maxAge: 60 }) } } },   // Post.find.many
    },
  },
},
```

The server refuses to start (`CONFIG_INVALID_VALUE` at the stage's path) when `cache` sits on a write family or variant, on a Resource's `transactions`, or in the `application` or `agent` layer: none of those is ever a `GET`. A malformed stage is refused at its path with `CONFIG_INVALID_TYPE`, `CONFIG_REQUIRED`, `CONFIG_INVALID_VALUE` or `CONFIG_UNKNOWN_PROPERTY` ([Error codes](/docs/error-codes)).

In a Next.js app, React also exports a `cache`. When one module needs both, import Aventara's under another name: see [Next.js host](/docs/nextjs-host#caching-reads).

## What changes on the wire

A cached read's operation is served on a second route, a `GET` at the same path:

```text
GET /api/_resources/Post/find/many?q=%7B%22where%22%3A%7B%22published%22%3Atrue%7D%7D&v=sha256%3A0b2afa72...
```

- `q` holds the arguments as canonical JSON (keys sorted, so the same read is always the same URL), percent-encoded. When it is shorter, the client sends that JSON compressed instead (deflate-raw, then base64url).
- `v` is the client contract's hash. A deploy that changes the contract changes every URL, so nothing cached before the deploy is served after it, even by a CDN that ignores `Vary`.
- The `POST` route stays. The generated client sends the `GET`; any client may still `POST`.

The generated client does this for you, from the contract:

- A cached read goes out alone, never in an [Operation Set](/docs/operation-sets), so it keeps its own URL and its own cache entry.
- It sends only your own headers (`headers`, `requestId`) and no other Aventara header. A `requestId` goes out as `Aventara-Request-Id`, which makes a cross-origin read send a CORS preflight; leave it off a cached read to avoid one.
- A URL longer than 4096 characters is sent as a `POST` to the same route instead, and is not cached.

The read runs exactly as its `POST` would: validation, exposure, policy, limits and every pipeline stage. A stage can tell the two apart: `ctx.$transport.method` is `"GET"` or `"POST"`.

## The headers

Every answer to a cached read's `GET`:

| Answer | Headers |
|---|---|
| `200` | `Cache-Control` and `Vary` as [its audience](#the-three-audiences) says, a strong `ETag`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` |
| `304` | When `If-None-Match` names the current `ETag` (also a weak `W/"..."`, a list, or `*`): no body, the same `Cache-Control`, `Vary` and `ETag` |
| Anything else (a refusal, a stale client's `409 A2005`, a strict miss's `404 A2003`) | `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` |

A public answer (`"everyone"`, and `"anonymous"` to an anonymous caller) carries no `Aventara-Request-Id`: a CDN serves it to every caller of that URL, and the first caller's id would reach the others. Private answers echo it as usual.

What the `GET` route refuses:

| Request | Answer |
|---|---|
| A query parameter other than `q` and `v`, a missing or repeated one, or a `q` that is not a JSON object | `400 A2000` |
| `q` larger than `maxRequestBytes` once decoded or inflated | `413 A2010` |
| A `v` that is not the current contract hash | `409 A2005` (regenerate the client) |
| `GET` on a write, or on a read with no `cache` stage | `405 A2012`, `Allow: POST` |
| `PUT`, `DELETE`, ... on a cached read's route | `405 A2012`, `Allow: GET, POST` |

## Behind a CDN

A CDN keeps what a `public` answer allows and nothing marked `private` or `no-store`. A few settings decide whether that stays safe:

- **Honor `Vary`, or bypass on credentials.** `"anonymous"` relies on `Vary: Authorization, Cookie`. A CDN that ignores `Vary` may hand the anonymous answer to a signed-in caller of the same URL (never the reverse: a signed-in caller's answer is `private`, so it is never stored). If your CDN ignores `Vary`, add a rule that bypasses the cache for requests that carry a `Cookie` or an `Authorization` header.
- **Custom sign-in headers need a policy.** A CDN only varies on the headers `Vary` names. If callers sign in with a header of your own, configure a policy so Aventara knows who is anonymous, and keep your CDN from caching requests that carry that header, or don't use `"anonymous"` and `"everyone"`.
- **No `Set-Cookie` on public answers.** A middleware in your host that adds `Set-Cookie` to every response (a session refresh, an A/B test) would put it on a public answer, and the CDN would keep it with the answer. Skip that middleware on `GET /api/_resources/...`, or let the CDN strip it.
- **Deploys bust the cache.** The contract hash is in the URL, so you don't need to purge the CDN when you deploy.

## Things to know

- **The URL holds the arguments.** A cached read's arguments land in server logs, proxy logs and browser history. `Referrer-Policy: no-referrer` keeps them out of the `Referer` header of the pages you link to. Don't cache reads whose arguments are secret.
- **Prefetches are GETs too.** A browser or a framework that prefetches a URL runs the read, and every pipeline stage on it.
- **No server-side cache.** Aventara does not store answers on the server. The stage only sets HTTP headers for the browser and any CDN in front of it.
- **The stage changes the contract.** The client contract marks each cached read (its `cache` section), so adding, changing or removing a stage changes the [contract hash](/docs/contract-hash): regenerate the frontend client.

## See also

- [Several operations in one round trip](/docs/operation-sets)
- [HTTP protocol: cached reads](/docs/http-protocol#cached-reads)
- [Pipelines](/docs/pipelines)
- [Configuration reference: `pipelines`](/docs/config-reference#pipelines)
- [Deploying](/docs/deploying)
