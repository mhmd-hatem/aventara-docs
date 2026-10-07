---
title: Limits and safety
description: The limits that bound what a caller can ask for, how to change them per layer, and what the framework refuses before your database ever sees a request.
order: 31
section: guides
---

# Limits and safety

An API that accepts a query language needs ceilings, or one request can ask for the whole database, nest forty levels deep, or send a gigabyte. Aventara sets conservative defaults, lets you tune them per layer, and checks every request against the contract **before** it reaches your ORM.

## The limits

| Limit | Default | What it bounds | Refusal |
|---|---|---|---|
| `maxRequestBytes` | `1048576` (1 MiB) | The decoded size of a request body. | `413` `A2010` |
| `maxNestingDepth` | `12` | Levels of nested relations in a `select`/`include`. | `422` `A2009` / `V1013` |
| `maxListLimit` | `250` | The `limit` of a list or of a nested relation. | `422` `A2009` / `V1014` |
| `maxBooleanNodes` | `50` | Nodes in a `where` tree (`AND`/`OR`/`NOT` and conditions). | `422` `A2009` / `V1015` |
| `maxTransactionOperations` | `20` | Steps in one transaction plan. | `422` `A2009` / `V1014` |

All of them are in the contract you can read at `GET /api/_contract` under `limits`:

```json
"limits": {"maxBooleanNodes":50,"maxListLimit":250,"maxNestingDepth":12,"maxRequestBytes":1048576,"maxTransactionOperations":20}
```

## Changing them

`limits` is a root property with optional `application` and `client` overrides. Root supplies defaults; a layer's explicit value wins ([Configuration](/docs/configuration#root-and-layer-overrides)). Define only the limits you change:

```ts
return {
  entrypoint: "/api",
  adapter: /* ... */,
  limits: { maxListLimit: 100, maxNestingDepth: 3 },
  client: { limits: { maxListLimit: 25, maxRequestBytes: 4096, maxBooleanNodes: 5 } },
} as const;
```

Remote callers get the client layer's limits (25 rows, 4 KiB, 5 `where` nodes, depth 3); your own server code gets the root's (100 rows, depth 3). Client limits are part of the client contract, so changing them changes its hash: regenerate the frontend client.

Each limit, as a caller sees it with that configuration:

```json
// Post/find/many {"limit":26}                                  (client layer, maxListLimit 25)
{"data":null,"code":"A2009","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1014","path":["arguments","limit"],"message":"limit exceeds maxListLimit (25)."}]}}

// the same call from your own code: framework.application.Post.find.many({ limit: 101 }) -> maxListLimit 100
{ data: null, code: 'A2009', cause: { issues: [ { code: 'V1014', ... } ] } }

// four levels of relations (posts -> author -> posts -> category) with maxNestingDepth 3
{"data":null,"code":"A2009","cause":{"message":"Operation arguments failed framework validation.","issues":[{"path":["arguments","select"],"code":"V1013","message":"Request nesting exceeds maxNestingDepth (3)."}]}}

// a where with six OR branches, maxBooleanNodes 5
{"data":null,"code":"A2009","cause":{"message":"Operation arguments failed framework validation.","issues":[{"path":["arguments","where"],"code":"V1015","message":"Boolean/filter node count exceeds maxBooleanNodes (5)."}]}}

// a 5 000-character name, maxRequestBytes 4096
{"data":null,"code":"A2010","cause":{"message":"The request body exceeds the maximum request size."}}      // HTTP 413
```

Nesting depth counts relation levels: three levels (`posts` -> `author` -> `posts`) pass with `maxNestingDepth: 3`, a fourth is refused. A plan of 21 steps is refused with `A2009` before anything runs.

`maxRequestBytes` counts **decoded** bytes: a compressed body (`gzip`, `deflate`, `br`) is measured after inflation, so compression does not get around it. See [HTTP protocol](/docs/http-protocol) and [NestJS host](/docs/nestjs-host#requests).

## What is refused by default

The framework validates every operation against the contract of the layer it runs in. Before the ORM runs, these fail with `A2004` (HTTP 422) and a precise issue list in `cause.issues`:

| Request | Issue |
|---|---|
| A field that does not exist or is hidden | `V1005` |
| An operator the field does not offer (`$gt`, `contains` on an `Int`) | `V1006` |
| A value of the wrong type (`"id": "1"`) | `V1001` ("Value must be a 32-bit integer number.") |
| A value outside an enum, or a malformed date, decimal, big integer or base64 | `V1002`, `V1003` |
| `select` together with `include` | `V1008` ("select and include are mutually exclusive.") |
| A field with `select: false`, `filter: false` or `order: false` used where it is not allowed | `V1008`, `V1006` |
| A negative or fractional `limit` | `V1001` |
| A cursor with no explicit, deterministic `orderBy` | `V1009` |
| A relation directive the contract does not offer | `V1006` / `V1012` |

and, before validation even starts:

| Request | Answer |
|---|---|
| An operation the layer does not advertise (`delete` switched off, an unknown family) | `404` `A2002` |
| A Resource that is hidden or does not exist | `404` `A2001` |
| A body that is not a JSON object, or malformed JSON | `400` `A2000` |
| A content type other than `application/json`, or an unsupported `Content-Encoding` | `415` `A2011` |
| A missing `Aventara-Protocol-Version` or `Aventara-Contract-Hash` header | `400` `A2000`, naming the missing header |
| A contract hash that is not the current one (a stale client) | `409` `A2005` |

Example, a stale client:

```json
{"data":null,"code":"A2005","cause":{"message":"Generated client contract does not match the server. Regenerate the client."}}
```

Nothing the caller sends is ever put into a query as raw text: arguments are validated into the framework's own query language and translated by the adapter. There is no raw-SQL operation to switch off.

## Planned failures and unplanned ones

| | Planned | Unplanned |
|---|---|---|
| Examples | validation, not found, conflict, limits, auth | a database failure the framework cannot classify, an error thrown in your own code |
| Caller gets | a specific code and a message you can show | `A3000` / `A3001` / `A3004`: "Internal framework error." / "Adapter execution failed." / "A server pipeline produced invalid arguments." |
| Raw error | none | your [diagnostics reporter](/docs/request-ids-and-diagnostics) only; one log line with the code, operation and request id goes to the server log |

Raw database errors, SQL, connection strings and stack traces are never put in `cause`.

## Rate limiting

The limits above bound **one request**. How many requests a caller may make is a different question, and Aventara does not answer it for you: add a rate limiter at the platform level, or in front of the server (a proxy, an API gateway).

**`@nestjs/throttler` does not protect Aventara's routes.** It is a Nest guard, and no Nest guard, interceptor or pipe runs on Aventara's protocol routes (they are registered on the HTTP platform directly; see [NestJS host](/docs/nestjs-host#what-runs-on-aventara-routes)). Verified: with `ThrottlerGuard` installed as a global guard and a limit of 2, a Nest controller route answered `200 200 429 429 429` and Aventara's `GET /api/_contract` answered `200` five times in a row.

A limiter that is HTTP-platform middleware does run. On Express (what `aventara new` scaffolds), use `express-rate-limit`:

```bash
npm i express-rate-limit
```

```ts
// src/main.ts
import { rateLimit } from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ...
  app.use(rateLimit({ windowMs: 60_000, limit: 100 }));   // 100 requests per minute per IP
  await app.listen(process.env.PORT ?? 3000);
}
```

The scaffold's `main.ts` has these lines commented out, with a link to this section; pick your own limits and uncomment. With `limit: 3`, verified against a running server:

```text
GET /api/_contract  ->  200 200 200 429 429

HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 0
Retry-After: 60
Content-Type: text/html; charset=utf-8

Too many requests, please try again later.
```

The `429` is the limiter's own answer, not an Aventara envelope, so the generated client raises a `TransportError` with `status` `429` (`The response to "User" find.count (HTTP 429) is not an Aventara response envelope.`). Read `Retry-After` from your own fetch, or handle `429` there ([Client errors](/docs/client-errors)).

On Fastify, the equivalent is `@fastify/rate-limit`, registered on the Fastify instance; this page's example was run on Express only. Limits keyed by IP behind a proxy need the proxy's address handled (`trust proxy` on Express): see the limiter's own documentation. Rate limits are per process by default; with several instances, use a shared store or limit at the proxy.

### CORS is not access control

`CORS_ORIGINS` (or any `enableCors` setting) tells **browsers** which origins may read the API's answers. A server, a script, `curl` or a bot ignores it entirely, so it neither authenticates callers nor limits them. [Guards](/docs/authentication-and-guards) decide who may call; rate limiting decides how often.

## Defense in depth

The limits and the validation layer are a floor, not your whole security story:

- **Authenticate.** Nothing is public except what your guards allow. See [Authentication and guards](/docs/authentication-and-guards).
- **Remove what callers should not have.** Hide fields, make fields write-only, switch off operations: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Restricting operations](/docs/restricting-operations).
- **Tighten the client layer.** Defaults suit a trusted frontend. For a public API, lower `maxListLimit` and `maxNestingDepth` under `client`.
- **Rate-limit, and put a proxy in front.** Add a [rate limiter](#rate-limiting). TLS and request timeouts belong to your platform; Aventara's `maxRequestBytes` complements, but does not replace, a proxy's body limit.

## See also

- [Configuration](/docs/configuration#limits)
- [Authentication and guards](/docs/authentication-and-guards)
- [HTTP protocol](/docs/http-protocol#codes)
- [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
