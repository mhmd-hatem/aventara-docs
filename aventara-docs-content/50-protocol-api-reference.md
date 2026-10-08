---
title: Protocol API reference
description: The @aventara/core/protocol entry point - AvProtocol.bind and its members, request and response types, headers, httpStatus, scalarFormats, isOperationResponse and normalizeEntrypoint.
order: 84
section: reference
---

# Protocol API reference

`@aventara/core/protocol` is Aventara's HTTP protocol as passive data and pure functions. It mounts nothing and imports no HTTP library; a host adapts its server to it. `@aventara/nest` is such a host. Use this entry point to write another one (Hono, Koa, a serverless handler), or to test the protocol in process. For the wire format itself see [HTTP protocol](/docs/http-protocol).

```ts
import { AvProtocol } from "@aventara/core/protocol";
import type { AvProtocolRequest, AvProtocolResponse, AvProtocolBinding } from "@aventara/core/protocol";
```

The main `@aventara/core` entry exports no protocol names. `AvProtocol` is a namespace with exactly these members (verified): `bind`, `headers`, `httpStatus`, `isOperationResponse`, `normalizeEntrypoint`, `scalarFormats`.

## Types

### AvProtocolRequest

What a host hands the protocol. `path` is relative to the entrypoint (`/_contract`, `/_resources/User/find/many`).

```ts
type AvProtocolRequest = {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly body:
    | { readonly kind: "raw"; readonly content: string | Uint8Array }   // the protocol enforces size, content type and JSON
    | { readonly kind: "parsed"; readonly value: unknown };            // your parser already did
};
```

Header names are matched case-insensitively. A query string is not part of `path`.

### AvProtocolResponse

```ts
type AvProtocolResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;     // a JSON string; "" for 304
};
```

Every framework response carries `Content-Type: application/json` (not on `304`) and `Aventara-Request-Id`. A `405` adds `Allow`. A contract response adds `ETag` and `Cache-Control: no-cache`.

## AvProtocol.bind(framework)

```ts
const protocol: AvProtocolBinding = AvProtocol.bind(framework);   // once, at startup
```

`bind` takes the `Framework` from `createFramework` and returns a binding derived from its client contract.

```ts
type AvProtocolBinding = {
  surface():                 readonly SurfaceRoute[];
  handleOperation(request):  Promise<AvProtocolResponse>;
  handleTransaction(request): Promise<AvProtocolResponse>;
  encodeContract(request):   AvProtocolResponse;
  answerAbsent(request):     AvProtocolResponse | undefined;
  decodeOperation(request):  DecodedOperation;
  decodeTransaction(request): DecodedTransaction;
  encodeOperation(response, requestId, decoded?): AvProtocolResponse;
  encodeTransaction(response, requestId): AvProtocolResponse;
  failure: /* transport-level failure builder, below */;
};
```

| Member | Use it to | Notes |
|---|---|---|
| `surface()` | List the routes to mount. | Each entry is `{ kind: "operation", method: "POST", path: "/_resources/<Resource>/<family>/<variant>", resource, family, variant }`, then `{ kind: "contract", method: "GET", path: "/_contract" }`, then `{ kind: "transactions", method: "POST", path: "/_transactions" }` only when the client contract is `interactive`. Only advertised operations appear, so a hidden Resource has no route. Paths are relative to the entrypoint. Frozen. |
| `handleOperation(request)` | Decode, execute and encode one operation request. | Resolves to a response; never rejects. |
| `handleTransaction(request)` | The same for `/_transactions`. | |
| `encodeContract(request)` | Answer `GET /_contract`. | Synchronous. Handles `If-None-Match`: a matching ETag answers `304` with no body. |
| `answerAbsent(request)` | Answer any other path under the protocol's `_` namespace (`400 A2000` for an unknown `/_*` path, `405` with `Allow` for a wrong method on a protocol route). | Returns `undefined` for a path outside the namespace; that one is yours to answer. |
| `decodeOperation(request)` / `decodeTransaction(request)` | Decode without executing. | `{ ok: true, request, requestId } \| { ok: false, response, requestId }`. For hosts that run their own steps between decoding and execution. |
| `encodeOperation(response, requestId, decoded?)` / `encodeTransaction(response, requestId)` | Encode an `OperationResponse` / `TransactionResponse` you obtained yourself (for example from `framework.execute`). | |
| `failure(code, requestId?, allow?)` | Build a complete response for a transport-level failure your host detects itself. | Codes: `"A2000"`, `"A2010"`, `"A2011"` and `"A2012"` (which requires `allow`, the permitted methods). |

Verified, in process:

```ts
const protocol = AvProtocol.bind(framework);
protocol.surface().length;          // 47 = 45 operations + _contract + _transactions
await protocol.handleOperation({
  method: "POST",
  path: "/_resources/User/find/count",
  headers: { "content-type": "application/json", "aventara-protocol-version": "1", "aventara-contract-hash": hash },
  body: { kind: "raw", content: "{}" },
});
// { status: 200, headers: { "Content-Type": "application/json", "Aventara-Request-Id": "26253298-..." }, body: '{"data":10,"code":"A1000","cause":null}' }

protocol.encodeContract({ method: "GET", path: "/_contract", headers: { "if-none-match": `"${hash}"` }, body: { kind: "raw", content: "" } });
// { status: 304, headers: { ETag: '"sha256:..."', "Cache-Control": "no-cache", "Aventara-Request-Id": "..." }, body: "" }

protocol.answerAbsent({ method: "POST", path: "/_nope", headers: {}, body: { kind: "raw", content: "" } });
// { status: 400, ... body: '{"data":null,"code":"A2000","cause":{"message":"The request is malformed and cannot be interpreted."}}' }
protocol.answerAbsent({ method: "GET", path: "/health", headers: {}, body: { kind: "raw", content: "" } });   // undefined

protocol.failure("A2012", "rid-1", ["POST"]);
// { status: 405, headers: { "Content-Type": "application/json", "Aventara-Request-Id": "rid-1", Allow: "POST" }, body: '{"data":null,"code":"A2012","cause":{"message":"The HTTP method is not allowed on this framework route."}}' }
```

Authentication stays a pipeline: pass what it needs through `headers`; a guard reads `transport.headers`.

A complete Express host is in [HTTP protocol](/docs/http-protocol#custom-hosts-with-aventaracoreprotocol).

## AvProtocol.headers

The protocol's header names, as data.

```ts
AvProtocol.headers;
// { protocolVersion: "Aventara-Protocol-Version",
//   contractHash:    "Aventara-Contract-Hash",
//   requestId:       "Aventara-Request-Id" }
```

| Key | Header | Required on `_resources` and `_transactions` | Value |
|---|---|---|---|
| `protocolVersion` | `Aventara-Protocol-Version` | yes | `1` |
| `contractHash` | `Aventara-Contract-Hash` | yes | `sha256:` plus 64 lowercase hex characters, from `/_contract` (`protocol.hash`). |
| `requestId` | `Aventara-Request-Id` | no | 1 to 128 visible ASCII characters. Becomes the correlation id; otherwise one is minted. An invalid value is replaced by a minted one (verified). |

## AvProtocol.httpStatus

The status each A-code carries, as frozen data. The status is a function of the code alone, and a rolled-back transaction answers its failing step's status.

```ts
AvProtocol.httpStatus.A2013;   // 409
```

| Status | Codes |
|---|---|
| 200 | `A1000` `A1001` `A1004` `A1005` `A1006` `A1007` `A1008` `A1009` |
| 201 | `A1002` `A1003` |
| 400 | `A2000` `A2006` |
| 401 | `A4000` |
| 403 | `A4001` `A4002` |
| 404 | `A2001` `A2002` `A2003` |
| 405 | `A2012` |
| 409 | `A2005` `A2008` `A2013` `A2014` |
| 413 | `A2010` |
| 415 | `A2011` |
| 422 | `A2004` `A2007` `A2009` |
| 500 | `A3000` `A3001` `A3002` `A3003` `A3004` |

Total over all 33 codes. Meanings: [Error codes](/docs/error-codes).

## AvProtocol.scalarFormats

The wire grammar of every scalar whose JSON form is a string, as anchored regular-expression source strings (so they survive JSON and can be emitted into a client). Frozen.

| Scalar | Pattern source | Wire example |
|---|---|---|
| `bigint` | `^-?(?:0\|[1-9]\d*)$` | `"9007199254740993"` |
| `decimal` | `^-?(?:0\|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$` | `"10.5"` |
| `datetime` | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` | `"2026-10-06T22:42:46.119Z"` |
| `bytes` | `^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==\|[A-Za-z0-9+/]{3}=)?$` | `"AAEC"` |

A grammar is the shape only: a `datetime` must also round-trip `toISOString()` exactly, and `bytes` must be canonical base64 (unused bits zero). `int`, `boolean`, `string` and `json` travel as ordinary JSON values.

```ts
new RegExp(AvProtocol.scalarFormats.datetime).test("2026-10-06T22:42:46.119Z");   // true
```

## AvProtocol.isOperationResponse

```ts
isOperationResponse(value: unknown): value is OperationResponse
```

Whether a parsed response body is a framework envelope. HTTP status plays no part. A value is an envelope when it is an object with an own `data` and an allocated `code`; for an `A1xxx` code `cause` is exactly `null` (and `data` is `null` for `A1001`); for every other code `data` is `null` and `cause` is an object with a string `message`, optional `issues` (each with an allocated V-code, a string `message`, an optional `path` of strings and integers) and optional non-negative integer `operation`. Members the protocol does not define are ignored.

```ts
AvProtocol.isOperationResponse({ data: 1, code: "A1000", cause: null });   // true
AvProtocol.isOperationResponse({ data: 1, code: "A1000" });               // false (no cause)
AvProtocol.isOperationResponse("x");                                      // false
```

A client resolves an envelope's `A1xxx` and throws its other codes; anything that is not an envelope is a transport error.

## AvProtocol.normalizeEntrypoint

```ts
normalizeEntrypoint(value: string):
  | { ok: true; path: "" | `/${string}` }
  | { ok: false; reason: EntrypointRefusalReason; message: string }
```

The rule the server applies to `entrypoint` and the generator applies to the mount path of a URL. Only the slash spelling is coerced; anything else that is not canonical is refused, naming the defect and never echoing the value.

| Input | Result |
|---|---|
| `"api"`, `"/api/"` | `{ ok: true, path: "/api" }` |
| `"//api//v1/"` | `{ ok: true, path: "/api/v1" }` |
| `""`, `"/"` | `{ ok: true, path: "" }` (the root) |
| `"api?x=1"` | `{ ok: false, reason: "query", ... }` |
| `"/a b"` | `{ ok: false, reason: "whitespace", ... }` |
| `"/a/../b"` | `{ ok: false, reason: "dot-dot-segment", ... }` |
| `"/é"` | `{ ok: false, reason: "non-ascii", ... }` |

Refusal reasons: `whitespace`, `scheme`, `query`, `fragment`, `dot-dot-segment`, `dot-segment`, `backslash`, `non-ascii`, `percent-encoding`, `character`. They are checked in that order, so each value has one reason. The message always ends `a mount path is /-separated segments of ASCII letters, digits and -._~!$&'()*+,;=:@ only`.

## See also

- [HTTP protocol](/docs/http-protocol): routes, envelope, headers, walkthrough, Express host.
- [Error codes](/docs/error-codes), [Contract hash](/docs/contract-hash)
- [NestJS API reference](/docs/nest-api-reference): the host built on this.
- Guides: [Limits and safety](/docs/limits-and-safety), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
