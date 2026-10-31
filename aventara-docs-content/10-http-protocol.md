---
title: HTTP protocol
description: Routes, headers, the response envelope, A- and V-codes with HTTP statuses, ETag and 304, a curl walkthrough, Operation Sets (/_all) and their streamed answer, cached reads as GET, and writing a custom host with @aventara/core/protocol.
order: 83
section: reference
---

# HTTP protocol

The generated client speaks this protocol for you. You need this page to call the API from another language, to debug, or to host the framework outside NestJS. Protocol version: 1.

## Routes

All routes are relative to your configured [`api` mount path](/docs/nestjs-host#mount-path) (`/api` below).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/_contract` | The client contract. No identity headers needed. |
| `POST` | `/api/_resources/<Resource>/<family>/<variant>` | One operation, for example `/api/_resources/User/find/many`. Every operation is a `POST`, reads included. |
| `GET` | `/api/_resources/<Resource>/find/<variant>?q=<arguments>&v=<contract hash>` | The same read, cached: present only for a read with a [`cache` stage](/docs/caching-reads). See [Cached reads](#cached-reads). |
| `POST` | `/api/_transactions` | A transaction plan. Present only when transactions are interactive. |
| `POST` | `/api/_all` | An Operation Set: several independent operations in one request. Present whenever the contract advertises an operation. See [Operation Sets](#operation-sets). |

Only advertised operations are routable. The Resource segment is the exact Resource key (the Prisma model name). The `_` prefix is reserved for the protocol; any other `/api/_*` path answers with a protocol error.

The body of every `POST` is a JSON object. An empty operation body is `{}`; an array, a scalar or no body is invalid. The route already names the Resource, family and variant, so the body holds only the operation's arguments (see [Querying](/docs/querying)).

## Headers

Every `POST` to `_resources`, `_transactions` and `_all` must send:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Aventara-Protocol-Version` | `1` |
| `Aventara-Contract-Hash` | The hash of the contract the caller was built from (`sha256:` plus 64 lowercase hex characters), from `/_contract`. |
| `Aventara-Request-Id` | Optional. 1 to 128 visible ASCII characters. Used as the request's correlation id; otherwise one is generated. |

Header names are case-insensitive. A request missing either identity header answers `400 A2000`, and the message names what is missing (see below). A wrong protocol version answers `A2006`; a hash that is not the current one answers `A2005`.

Every framework response carries `Content-Type: application/json` and `Aventara-Request-Id` (the one you sent if it is valid, otherwise a generated one; see [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)). Three answers differ: a streamed `/_all` answer is `application/x-ndjson`, a `304` has no body and no `Content-Type`, and a public cached read carries no `Aventara-Request-Id` ([Cached reads](#cached-reads)).

### All headers at a glance

| Header | Direction | Where | Meaning |
|---|---|---|---|
| `Content-Type` | request | `POST` to `_resources`, `_transactions`, `_all` | Must be `application/json`; otherwise `415 A2011`. |
| `Content-Encoding` | request | `POST` to `_resources`, `_transactions`, `_all` | Optional. `gzip`, `deflate` and `br` are inflated (the size limit counts decoded bytes); any other coding is `415 A2011`; a body that does not decode in the coding it names is `400 A2000`. |
| `Aventara-Protocol-Version` | request | `POST` to `_resources`, `_transactions`, `_all` | `1`. Missing: `400 A2000`. Other value: `400 A2006`. Optional on a cached read's `GET`; checked when sent. |
| `Aventara-Contract-Hash` | request | `POST` to `_resources`, `_transactions`, `_all` | The caller's contract hash. Missing: `400 A2000`. Not current: `409 A2005`. A cached read's `GET` sends it as `v` in the query instead. |
| `Aventara-Request-Id` | request and response | all | Optional on requests (an invalid value is silently replaced by a generated UUID). On every response except a public cached read. |
| `Accept` | request | `_all` | `application/x-ndjson` asks for the [streamed answer](#streamed-answer); anything else, or none, gets one JSON body. |
| `If-None-Match` | request | `_contract`, cached reads | An `ETag` the caller holds; a match answers `304`. |
| `ETag` | response | `_contract`, cached reads | `_contract`: the quoted contract hash. A cached read: the SHA-256 of the body, base64url, quoted. |
| `Cache-Control` | response | `_contract`, cached reads, streamed `_all` | `_contract`: `no-cache`. A cached read: `private` or `public` with `max-age` ([Caching reads](/docs/caching-reads#the-three-audiences)), or `no-store` on any answer but a `200` or `304`. A streamed `_all`: `no-store`. |
| `Vary` | response | cached reads | `Authorization, Cookie`, for `for: "user"` and `for: "anonymous"`. |
| `Referrer-Policy` | response | cached reads | `no-referrer`: the URL holds the arguments. |
| `X-Content-Type-Options` | response | every answer to a `GET` | `nosniff`. |
| `X-Accel-Buffering` | response | streamed `_all` | `no`, so a buffering proxy passes each line on. |
| `Allow` | response | `405` | The permitted methods: `POST` on operations, `_transactions` and `_all`, `GET` on `_contract`, `GET, POST` on a cached read's route. |

`X-Request-Id` is never read. A query string is read only by a cached read's `GET`; on any other route it is ignored.

The `Aventara-` prefix of these header names may still change before 1.0; the generated client picks up a change when you regenerate.

## The envelope

Every operation answers one JSON envelope:

```json
{ "data": ..., "code": "A1000", "cause": null }
```

- `code`: the outcome (`A` code). The HTTP status is a function of the code alone (table below).
- `data`: the result in wire form, or `null`.
- `cause`: `null` on success; on failure, `{ "message": string, "issues"?: [...], "operation"?: number }`. Each issue is `{ "code": "V1005", "path": [...], "message": string }`; `operation` is the zero-based index of the failing transaction step.

Branch on `code`, never on `message`.

## Codes

The full tables with typical causes and fixes are on [Error codes](/docs/error-codes).

### A-codes and HTTP status

| Code | Name | HTTP | Meaning |
|---|---|---|---|
| `A1000` | OK | 200 | Read, count or other success. |
| `A1001` | NO_MATCH | 200 | A first-style operation matched nothing; `data` is `null`. |
| `A1002` | CREATED | 201 | `create.one`. |
| `A1003` | CREATED_MANY | 201 | `create.many`, `create.count`. |
| `A1004` | UPDATED | 200 | `update.first`, `update.unique`. |
| `A1005` | UPDATED_MANY | 200 | `update.many`, `update.count`. |
| `A1006` | DELETED | 200 | `delete.first`, `delete.unique`. |
| `A1007` | DELETED_MANY | 200 | `delete.count`. |
| `A1008` | UPSERTED | 200 | `upsert.unique`. |
| `A1009` | TRANSACTION_COMMITTED | 200 | A whole transaction plan committed. |
| `A2000` | INVALID_REQUEST | 400 | Malformed JSON, envelope or path; missing identity headers. |
| `A2001` | UNKNOWN_RESOURCE | 404 | The Resource is not in the contract. |
| `A2002` | UNKNOWN_OPERATION | 404 | The operation is not available on that Resource. |
| `A2003` | NOT_FOUND | 404 | A `unique` operation matched nothing, or a `$connect` names a record that does not exist. |
| `A2004` | VALIDATION_FAILED | 422 | The arguments break a contract rule; see `cause.issues`. |
| `A2005` | CONTRACT_MISMATCH | 409 | The caller's contract hash is not the current one. Regenerate the client. |
| `A2006` | PROTOCOL_MISMATCH | 400 | Unsupported protocol version. |
| `A2007` | INVALID_REFERENCE | 422 | A transaction `$ref` is invalid. |
| `A2008` | CONFLICT | 409 | A uniqueness or reference constraint. Retrying unchanged fails the same way. |
| `A2009` | LIMIT_EXCEEDED | 422 | A contract limit (nesting, list size, boolean nodes, plan size, Json depth). |
| `A2010` | PAYLOAD_TOO_LARGE | 413 | The decoded body exceeds `maxRequestBytes`. |
| `A2011` | UNSUPPORTED_MEDIA_TYPE | 415 | Not `application/json`, or an unsupported `Content-Encoding`. |
| `A2012` | METHOD_NOT_ALLOWED | 405 | Wrong method; `Allow` header included. |
| `A2013` | CONCURRENT_MODIFICATION | 409 | A competing writer reached the state first; nothing was written. Retryable. |
| `A2014` | STALE_SELECTION | 409 | The selected state changed before the write; nothing was written. Retryable. |
| `A3000` | INTERNAL_ERROR | 500 | Unexpected server failure. |
| `A3001` | ADAPTER_ERROR | 500 | A sanitized database or ORM failure. |
| `A3002` | TRANSACTION_ERROR | 500 | Transaction infrastructure failure (commit or rollback). |
| `A3003` | SERIALIZATION_ERROR | 500 | A result could not be encoded for transport. |
| `A3004` | PIPE_OUTPUT_INVALID | 500 | A server pipe returned arguments the server's own contract refuses. Always the generic message `A server pipeline produced invalid arguments.` |
| `A4000` | UNAUTHENTICATED | 401 | Authentication required or failed. |
| `A4001` | FORBIDDEN | 403 | Not permitted (including a guard that returned `false`). |
| `A4002` | POLICY_DENIED | 403 | The configuration's [policy](/docs/policies) refused the request, or a guard denied it with a policy reason. |

Raw database errors, SQL, connection strings and stack traces are never put in `cause`.

### V-codes (validation issues)

These appear in `cause.issues[].code`, under an `A2004`, `A2007` or `A2009` envelope (and `A2001` / `A2002` for an unknown Resource or operation). An issue is `{ code, path, message }`, plus `check` and `params` when a [field validator](/docs/field-validators) failed.

| Code | Meaning |
|---|---|
| `V1000` | Required value missing. |
| `V1001` | Invalid type. |
| `V1002` | Invalid enum value. |
| `V1003` | Invalid format (UUID, date-time, base64, ...), or a failed pattern or format validator. |
| `V1004` | Value out of range, or a failed range, length or size validator. |
| `V1005` | Unknown or inaccessible field. |
| `V1006` | Unsupported filter, order or mutation directive, or a `mode` the field does not offer; or an operation not available. |
| `V1007` | Invalid unique identifier shape. |
| `V1008` | Invalid select, include or reducer projection (including a field that cannot be selected). |
| `V1009` | Invalid or non-deterministic cursor. |
| `V1010` | Invalid transaction reference path. |
| `V1011` | Transaction reference type mismatch. |
| `V1012` | Invalid relation action or cardinality. |
| `V1013` | Maximum nesting depth exceeded. |
| `V1014` | Configured limit exceeded. |
| `V1015` | Boolean or filter node limit exceeded. |
| `V1016` | Invalid transaction reference index. |
| `V1017` | Transaction fingerprint mismatch. |
| `V1018` | Transaction reference resolved to no value. |
| `V1019` | A transaction step depends on a row removed by an earlier step's cascade. |
| `V1020` | A transaction mixes application and client steps (server-side plans only). |
| `V1021` | A Json value nests deeper than `maxJsonDepth`. |

### Scalars on the wire

| Scalar | JSON form |
|---|---|
| `string`, `int`, `boolean`, `json` | ordinary JSON values |
| `datetime` | string `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `decimal` | decimal string, such as `"10.5"` (the server drops trailing zeros) |
| `bigint` | integer string |
| `bytes` | canonical base64 string |
| enum | the member's name as a string |

## ETag and 304

`GET /_contract` returns the contract as canonical JSON with the quoted hash as its `ETag`, `Cache-Control: no-cache` and `X-Content-Type-Options: nosniff`. Send `If-None-Match` to revalidate cheaply; a match answers `304 Not Modified` with no body (the `ETag` is repeated):

```bash
curl -i http://localhost:3000/api/_contract -H 'If-None-Match: "sha256:0b2afa72..."'
# HTTP/1.1 304 Not Modified
```

`avclient generate` uses this to answer "up to date".

## Walkthrough with curl

Each operation is `POST <api>/_resources/<Resource>/<family>/<variant>`, where `<Resource>` is the model's name exactly as in `prisma/schema.prisma` (`User`, not `users`). Send the two identity headers: `Aventara-Protocol-Version: 1`, and `Aventara-Contract-Hash` with the hash `GET <api>/_contract` serves (its body's `protocol.hash`, and its `ETag`). The JSON body holds the operation's arguments: a create sends `{ "data": … }`.

Fetch the hash, then create a record:

```sh
HASH=$(curl -s http://localhost:3000/api/_contract | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).protocol.hash')
curl -X POST http://localhost:3000/api/_resources/User/create/one \
  -H 'Content-Type: application/json' \
  -H 'Aventara-Protocol-Version: 1' \
  -H "Aventara-Contract-Hash: $HASH" \
  -d '{ "data": { "email": "ada@example.com", "name": "Ada" } }'
```

It answers `201`:

```json
{"data":{"email":"ada@example.com","id":1,"name":"Ada"},"code":"A1002","cause":null}
```

The same command works against a [Next.js app](/docs/nextjs-host) on its own port. The agent skill `aventara new` and `aventara init` write has this example too ([AI agents](/docs/ai-agents)). What each mistake gets:

| Mistake | Answer |
|---|---|
| Either identity header left out | `400` `A2000`, naming the missing header |
| The Resource lower-cased (`/_resources/user/...`) | `404` `A2001` |
| Arguments outside `data` (`{"email": ...}`) | `422` `A2004` |
| An old hash, after a schema or configuration change | `409` `A2005`: fetch the hash again |

Read with a nested count:

```bash
curl -s -X POST http://localhost:3000/api/_resources/User/find/many \
  -H 'Content-Type: application/json' -H 'Aventara-Protocol-Version: 1' -H "Aventara-Contract-Hash: $HASH" \
  -d '{"where":{"name":{"contains":"A"}},"select":["id","email",{"posts":{"select":["id","title","$count"]}}]}'
```

```json
{"data":[{"id":1,"email":"ada@example.com","posts":{"data":[{"id":1,"title":"Hello"}],"count":1}}],"code":"A1000","cause":null}
```

A strict miss, and a first-style miss:

```bash
# find/unique -> HTTP 404
{"data":null,"code":"A2003","cause":{"message":"No record matched the unique selector."}}
# find/first  -> HTTP 200
{"data":null,"code":"A1001","cause":null}
```

A unique-field conflict (HTTP 409):

```json
{"data":null,"code":"A2008","cause":{"message":"The operation conflicts with the current state of the resource."}}
```

An unknown Resource (HTTP 404) and an unavailable operation (HTTP 404). A path is the address in the request, and a single route's `resource`, `family` and `variant` are its URL segments: an unknown Resource is at `["resource"]`, an unavailable operation at `["family"]` (not a standard family, or none of its variants is offered) or `["variant"]` (the family is right), argument issues at `["arguments", ...]`. The second answer below is for `.../User/find/nope`:

```json
{"data":null,"code":"A2001","cause":{"message":"The requested Resource is not available.","issues":[{"code":"V1005","path":["resource"],"message":"Resource \"Nope\" is not available in the active Contract."}]}}
{"data":null,"code":"A2002","cause":{"message":"The requested operation is not available on this Resource.","issues":[{"path":["variant"],"code":"V1006","message":"Operation \"find.nope\" is not available on Resource \"User\"."}]}}
```

Transport-level answers (all carry `Aventara-Request-Id`):

| Request | Answer |
|---|---|
| Body is not JSON, or is an array | `400 A2000` `The request is malformed and cannot be interpreted.` |
| `Content-Type: text/plain` | `415 A2011` `The request content type is not supported; send application/json.` |
| `GET` on an operation route with no `cache` stage (identity headers sent; without them the answer is `400 A2000`) | `405 A2012` with `Allow: POST` |
| `POST` on `/_contract` | `405 A2012` with `Allow: GET` |
| Any other path under `/api/_` (for example `/api/_nope`) | `400 A2000` |
| Body over `maxRequestBytes` | `413 A2010` `The request body exceeds the maximum request size.` |
| `Aventara-Protocol-Version: 2` | `400 A2006` `Aventara protocol version does not match the server.` |

Echoing a request id: send `Aventara-Request-Id: my-req-1` and the response carries the same header.

A validation failure (HTTP 422):

```bash
-d '{"where":{"nope":1}}'
```

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1005","path":["arguments","where","nope"],"message":"Field \"nope\" is not available on Resource \"User\"."}]}}
```

A stale hash (HTTP 409):

```json
{"data":null,"code":"A2005","cause":{"message":"Generated client contract does not match the server. Regenerate the client."}}
```

Missing identity headers (HTTP 400). The message names the missing headers:

```json
{"data":null,"code":"A2000","cause":{"message":"The Aventara-Protocol-Version and Aventara-Contract-Hash headers are missing."}}
```

With only one missing it reads `The Aventara-Contract-Hash header is missing.` (or the `Aventara-Protocol-Version` equivalent).

## Transactions

`POST /api/_transactions` takes one object with an `operations` array. Each step names its Resource, family and variant, carries its `args`, and a `fingerprint`; a later step refers to an earlier result with `$ref`:

```json
{
  "operations": [
    { "resource": "User", "family": "create", "variant": "one",
      "args": { "data": { "email": "tx@example.com" }, "select": ["id"] },
      "fingerprint": "fp1:cL_6_qgZ9cK3r00pXNIuaw" },
    { "resource": "Post", "family": "create", "variant": "one",
      "args": { "data": { "title": "x", "authorId": { "$ref": { "operation": 0, "fingerprint": "fp1:cL_6_qgZ9cK3r00pXNIuaw", "path": ["id"] } } } },
      "fingerprint": "fp1:Gr427Dvdv6WtcpcqgrzaQg" }
  ]
}
```

The fingerprint is a short deterministic hash of the step (`fp1:` plus base64url): SHA-256 of the step's canonical JSON, first 16 bytes. It guards against a reference that points at the wrong step; it is not a security mechanism. Hand-writing plans is error-prone; use the generated client, which computes fingerprints for you. A mismatch answers `A2007` with `V1017`; a `$ref` with no `fingerprint` at all answers `A2004` with `V1000`.

Plan-level errors: an empty `operations` array answers `422 A2004` / `V1004`; a missing `operations` answers `422 A2004` / `V1000` (`Required property "operations" is missing.`); more than `maxTransactionOperations` steps answers `422 A2009` / `V1014`; a wrong fingerprint answers `422 A2007` / `V1017` at `["operations", i, "fingerprint"]` with `cause.operation` set to `i`.

Every error path in a transaction answer is the literal address in the request body: an argument issue is `["operations", i, "args", ...]`; a step's own defects are `["operations", i, "resource"]`, `["operations", i, "family"]`, `["operations", i, "variant"]`, `["operations", i, "fingerprint"]`, `["operations", i, "<key>"]` for an unknown key on the step, or `["operations", i]` for a step that is not an object. For instance, a second step whose `args` is `{ "data": { "title": 5 } }` answers `422 A2004` with `cause.operation` `1` and the issue path `["operations", 1, "args", "data", "title"]`. The full table is in [Error codes](/docs/error-codes#v-codes).

A committed plan answers `200 A1009` with `data` an array of per-step results. A failed plan rolls back and answers the failing step's code and status, with `cause.operation` set.

## Operation Sets

`POST /api/_all` carries several independent operations in one request: any mix of reads and writes the contract advertises. They run concurrently, in no set order, and not atomically; each one runs exactly as it would on its own route. Ordered, all-or-nothing or referencing work stays on [`/_transactions`](#transactions). The generated client sends one for the calls you make together ([Several operations in one round trip](/docs/operation-sets)).

The body is one object with `operations`, an object of entries under keys you choose:

```json
{
  "operations": {
    "posts": { "resource": "Post", "family": "find", "variant": "many", "args": { "select": ["id", "title"] } },
    "drafts": { "resource": "Post", "family": "find", "variant": "count", "args": { "where": { "published": false } } },
    "author": { "resource": "User", "family": "find", "variant": "unique", "args": { "where": { "id": 999 } } },
    "locale": { "resource": "User", "family": "update", "variant": "unique", "args": { "where": { "id": 1 }, "data": { "locale": "fr" }, "select": ["id", "locale"] } }
  }
}
```

- **Keys** are ASCII identifiers (`[A-Za-z_$][A-Za-z0-9_$]*`). `__proto__` and `constructor` are plain keys like any other.
- **Each entry** is exactly `resource`, `family`, `variant` and `args`: a transaction step without its fingerprint. `args` is the body its own route would take.
- **The identity headers and the body are checked once** for the whole request, and every entry runs under the request's id, its state and its principal.

### The answer

`200 A1000`, with `data` holding each key's own envelope, byte for byte what its own route would answer, a refusal or a miss included:

```json
{"data":{"posts":{"data":[{"id":1,"title":"Hello"}],"code":"A1000","cause":null},"drafts":{"data":2,"code":"A1000","cause":null},"author":{"data":null,"code":"A2003","cause":{"message":"No record matched the unique selector."}},"locale":{"data":{"id":1,"locale":"fr"},"code":"A1004","cause":null}},"code":"A1000","cause":null}
```

The status is always `200` when the set ran: read each entry's own `code`. A write that ran stays written whatever the other entries answered.

### Streamed answer

With `Accept: application/x-ndjson`, the answer is `200` with `Content-Type: application/x-ndjson`, `Cache-Control: no-store` and `X-Accel-Buffering: no`, and one line per entry, written as each one finishes:

```text
{"key":"author","envelope":{"data":null,"code":"A2003","cause":{"message":"No record matched the unique selector."}}}
{"key":"drafts","envelope":{"data":2,"code":"A1000","cause":null}}
{"key":"locale","envelope":{"data":{"id":1,"locale":"fr"},"code":"A1004","cause":null}}
{"key":"posts","envelope":{"data":[{"id":1,"title":"Hello"}],"code":"A1000","cause":null}}
```

When the client disconnects, entries not yet started never start and nothing more is written. An entry already running still finishes on the server.

### Concurrency

At most `limits.maxAllConcurrency` entries (4 by default) run at once for one request; the others wait and start in key order. The limit belongs to the contract, so a request cannot take more than its share of your database pool. See [Limits and safety](/docs/limits-and-safety#operation-sets).

### What fails the whole request

Only these answer for the whole request, as plain JSON at their own status even when the caller asked for a stream:

| Request | Answer |
|---|---|
| A missing or stale identity header, a wrong method (`405`, `Allow: POST`), content type or size | as on any route |
| More entries than `limits.maxAll` (10 by default) | `422 A2009`, `V1014` at `["operations"]` |
| No entries | `422 A2004`, `V1004` at `["operations"]` |
| A key that is not an identifier | `422 A2004`, `V1001` at `["operations"]` |
| An entry that is not exactly its four members | `422 A2004`, `V1001` at `["operations", "<key>", "<member>"]` |
| A body member beside `operations` | `422 A2004`, `V1001` at `["<member>"]` |

An entry naming a Resource or an operation the contract does not offer is not one of them: it is answered on its own key, as its own route would answer it (`A2001`, `A2002`). A contract that advertises no operation has no `/_all` route at all.

## Cached reads

A read with a [`cache` stage](/docs/caching-reads) is also served as a `GET` at its own path:

```text
GET /api/_resources/Post/find/many?q=%7B%22where%22%3A%7B%22published%22%3Atrue%7D%7D&v=sha256%3A0b2afa72...
```

- The query holds exactly `q` and `v`, each once and percent-decoded once (`+` is a plus, not a space). Anything else is `400 A2000`.
- `q` is the arguments object as canonical JSON (RFC 8785). It has two forms, told apart by the first character: `{` is the JSON itself, percent-encoded; anything else is base64url (no padding) of the JSON's deflate-raw bytes. The generated client sends the shorter one. The JSON, inflated or not, may be at most `limits.maxRequestBytes` (`413 A2010`); text that is not base64url, deflate-raw, UTF-8 or a JSON object is `400 A2000`.
- `v` is the client contract hash. Another hash is the stale client's `409 A2005`.
- The read needs no other header: the hash names one contract, of one protocol version. An `Aventara-Protocol-Version` you send anyway is checked as on a `POST`.

The read runs exactly as its `POST`. Its `200` carries the `Cache-Control` and `Vary` its `for` asks for, a strong `ETag` (SHA-256 of the body, base64url, quoted), `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. A matching `If-None-Match` (strong, weak `W/"..."`, a list or `*`) is `304` with no body. Every other answer is `Cache-Control: no-store`. A public answer carries no `Aventara-Request-Id`. The full header table per audience is on [Caching reads](/docs/caching-reads#the-headers).

A `GET` of a write, or of a read with no `cache` stage, is `405 A2012` with `Allow: POST`. Any other method on a cached read's route is `405` with `Allow: GET, POST`.

## Custom hosts with @aventara/core/protocol

If you do not use NestJS, `@aventara/core/protocol` is the same protocol as passive data and pure functions. It mounts nothing and imports no HTTP library; you adapt your server to it.

```ts
import { AvProtocol } from "@aventara/core/protocol";

const protocol = AvProtocol.bind(framework);   // bind once, at startup
```

| Member | What it does |
|---|---|
| `protocol.surface()` | The list of routes to mount: each `{ kind: "operation" \| "contract" \| "transactions" \| "all", method, path }`, with `path` relative to the `api` mount path. Only advertised operations appear; `transactions` only when transactions are interactive; `all` (`POST /_all`) whenever at least one operation is advertised; a cached read has a second `operation` entry with `method: "GET"`. |
| `protocol.handleOperation(request)` | Decode, execute and encode one operation request, a cached read's `GET` included. Resolves to `{ status, headers, body }`. Never rejects. |
| `protocol.handleTransaction(request)` | The same for `/_transactions`. |
| `protocol.handleAll(request, { signal })` | The same for `/_all`. Resolves to `{ status, headers, body }`; `body` is a string, or, when the caller sent `Accept: application/x-ndjson`, an async iterable of lines to write as each operation settles. Abort `signal` when the client leaves. |
| `protocol.encodeContract(request)` | The `GET /_contract` answer: ETag, `no-cache`, `nosniff`, and `304` handling. |
| `protocol.answerAbsent(request)` | The answer for any other path under the protocol's `_` namespace (404, 405, 400 ...), or `undefined` for a path outside it, which is yours to answer. |
| `protocol.failure(...)` | A transport-level code (`A2000`, `A2010`, `A2011`, `A2012`) as a complete response, for hosts that parse the body themselves. |
| `protocol.decodeOperation(request)`, `protocol.decodeTransaction(request)` | Decode a `POST` without executing (a cached read's `GET` goes to `handleOperation`). |
| `protocol.encodeOperation(response, requestId)`, `protocol.encodeTransaction(response, requestId)` | Encode a response you obtained yourself. |
| `AvProtocol.headers`, `AvProtocol.httpStatus`, `AvProtocol.scalarFormats`, `AvProtocol.isOperationResponse`, `AvProtocol.normalizeEntrypoint` | The header names, the code to status table, the wire grammars of string-encoded scalars, the envelope check and the mount-path rule, as data and pure functions. |

Every member, with types and examples: [Protocol API reference](/docs/protocol-api-reference).

A request is `{ method, path, query?, headers, body }`, where `path` is relative to the `api` mount path, `query` is the URL's query without its `?` (read only by a cached read's `GET`), and `body` is `{ kind: "raw", content }` (the protocol enforces size, content type and JSON) or `{ kind: "parsed", value }` (your parser already did). The response is `{ status, headers, body }` with `body` a JSON string; `handleAll`'s may be an async iterable of lines instead.

### Express example

```ts
import express, { type Request, type Response } from "express";
import { createFramework } from "@aventara/core";
import { AvProtocol } from "@aventara/core/protocol";

const framework = await createFramework(config);        // your AvConfig
const protocol = AvProtocol.bind(framework);
const base = framework.api;                        // e.g. "/api"

const toRequest = (req: Request) =>
  ({
    method: req.method,
    path: req.path.slice(base.length),                    // relative to the `api` mount path
    query: req.originalUrl.split("?")[1] ?? "",           // a cached read's arguments travel here
    headers: req.headers,
    body: { kind: "raw", content: Buffer.isBuffer(req.body) ? req.body : "" },
  }) as const;

const send = (res: Response, r: { status: number; headers: Readonly<Record<string, string>>; body: string }) =>
  res.status(r.status).set(r.headers).send(r.body);

// Read bodies raw: the protocol enforces size, content type and JSON itself.
const raw = express.raw({ type: () => true, limit: framework.contracts.client.limits.maxRequestBytes });

const app = express();
for (const route of protocol.surface()) {
  const path = base + route.path;
  if (route.kind === "contract") {
    app.get(path, (req, res) => send(res, protocol.encodeContract(toRequest(req))));
  } else if (route.kind === "transactions") {
    app.post(path, raw, async (req, res) => send(res, await protocol.handleTransaction(toRequest(req))));
  } else if (route.kind === "all") {
    // One JSON body; with `Accept: application/x-ndjson`, one line per operation as it settles.
    app.post(path, raw, async (req, res) => {
      const gone = new AbortController();
      res.on("close", () => gone.abort());
      const { status, headers, body } = await protocol.handleAll(toRequest(req), { signal: gone.signal });
      res.status(status).set(headers);
      if (typeof body === "string") return res.send(body);
      res.flushHeaders();
      for await (const line of body) res.write(line);
      res.end();
    });
  } else if (route.method === "GET") {
    // A read with a `cache` stage: also served as a GET, its arguments in the query.
    app.get(path, async (req, res) => send(res, await protocol.handleOperation(toRequest(req))));
  } else {
    app.post(path, raw, async (req, res) => send(res, await protocol.handleOperation(toRequest(req))));
  }
}

// Everything else under <api>/_* gets the protocol's own answers.
app.use(base, (req, res, next) => {
  const answer = protocol.answerAbsent({ ...toRequest(req), path: req.path });  // already relative here
  if (answer === undefined) return next();
  send(res, answer);
});

app.listen(3100);
```

This serves: `GET /api/_contract`, operations, cached reads as `GET`, `/_all` (one body or streamed lines), and the protocol's own `405` (with `Allow`) for a wrong method on a protocol route. Authentication is still an Aventara [pipeline](/docs/configuration#pipelines): pass what it needs through `headers`, and a guard reads `ctx.$transport.headers`.

See also: [Limits and safety](/docs/limits-and-safety), [Authentication and guards](/docs/authentication-and-guards), [Transactions with $ref](/docs/transactions-with-ref).
