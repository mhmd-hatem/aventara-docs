---
title: Request IDs and diagnostics
description: How a request id is adopted or generated and where it appears, and how to receive the real error behind every unplanned failure.
order: 30
section: guides
---

# Request IDs and diagnostics

When something goes wrong in production you need two things: a way to find **this** request in your logs, and the **real** error, which Aventara never sends to the caller. A request id and the diagnostics reporter are those two.

## Request IDs

Every request has a correlation id. The framework adopts the client's `Aventara-Request-Id` header, or generates a UUID when there is none, and returns it in the `Aventara-Request-Id` response header:

```bash
curl -i -X POST http://localhost:3000/api/_resources/User/find/count \
  -H 'Content-Type: application/json' -H 'Aventara-Protocol-Version: 1' -H "Aventara-Contract-Hash: $HASH" \
  -H 'Aventara-Request-Id: checkout-17' -d '{}'
```

```text
HTTP/1.1 200 OK
Content-Type: application/json
Aventara-Request-Id: checkout-17

{"data":3,"code":"A1000","cause":null}
```

Without the header, the response carries a generated one, `Aventara-Request-Id: 0d0061d1-9ead-4308-809e-fbb81d27c822`.

| You send | The request id is |
|---|---|
| 1 to 128 visible ASCII characters | exactly what you sent |
| nothing | a generated UUID |
| an invalid value (spaces, longer than 128 characters, empty) | a generated UUID: the request is **not** refused |

`X-Request-Id` is never copied into it. If a proxy or load balancer assigns `X-Request-Id`, have it set `Aventara-Request-Id` instead.

### Where it appears

- the `Aventara-Request-Id` response header, on every framework response;
- `requestId` in every [pipeline](/docs/pipelines) context: guards, pipes, hooks, interceptors, filters, and computed-field callbacks (`operation.requestId`);
- `requestId` in every diagnostic (below);
- for a [transaction](/docs/transactions-with-ref), every step shares the plan's request id.

It is not in the response body. Branch on `code`; use the id to correlate.

### From the generated client

```ts
await avClient.User.find.count({}, { requestId: "checkout-17" });
await avClient.transaction([a, b], { requestId: "checkout-17" });
```

`requestId` is a per-call option and is sent as the header; see [Frontend client](/docs/client-options#calloptions). Generate one per user action to tie a screen's calls together, or let the framework do it.

### From server-side code

```ts
await this.framework.application.User.find.count({}, { requestId: "job-42" });
```

Omit it and one is generated. See [Server-side usage](/docs/server-side-usage#executionoptions).

## Diagnostics

Callers never see raw database errors, SQL, connection strings or stack traces. A failure you did not plan for answers a sanitized envelope (`A3001` "Adapter execution failed.", `A3000` "Internal framework error."), and two places learn what happened: one line in the server's own log (below), and the `diagnostics` function in your configuration, which receives the real error.

```ts
import { createFramework, type FrameworkDiagnostic } from "@aventara/core";

return {
  entrypoint: "/api",
  adapter: /* ... */,
  diagnostics: (d: FrameworkDiagnostic) => {
    console.error(
      JSON.stringify({
        kind: d.kind,
        code: d.code,
        requestId: d.requestId,
        scope: d.scope,
        ...(d.kind === "operation" ? { name: `${d.resource}.${d.family}.${d.variant}` } : {}),
      }),
      d.error,                                  // the raw error: log it, send it to your error tracker
    );
  },
} as const;
```

A request that fails inside your own code (here, a pipe that throws because a service it calls is down):

```bash
curl -i -X POST .../api/_resources/Counter/find/many -H 'Aventara-Request-Id: checkout-17' ... -d '{}'
```

```text
HTTP/1.1 500 Internal Server Error
Aventara-Request-Id: checkout-17

{"data":null,"code":"A3000","cause":{"message":"Internal framework error."}}
```

Your reporter receives:

```text
{"kind":"operation","code":"A3000","requestId":"checkout-17","scope":"client","name":"Counter.find.many"} Error: audit service unreachable
    at auditTrail (...)
```

`checkout-17` in the log is `checkout-17` in the caller's response header, so a bug report that quotes the header leads straight to the log line. A database failure that the framework cannot classify arrives the same way, with `code: "A3001"` and the database client's own error as `error`.

### Internal failures in the server log

Whether or not you configured a `diagnostics` function, every internal failure (`A3000` to `A3004`) writes **one line** to the server's log, through Nest's `Logger` under the context `Aventara`, so your logger settings govern it. This is the case when `AventaraModule` builds the framework from `config`, the form the scaffold uses; a framework you built yourself reports only to its own `diagnostics`. It says what failed and where, and never repeats the raw error's message, which can hold SQL, a connection string or row data:

```text
ERROR [Aventara] A3000 on Counter.find.many (client scope, request checkout-17): Error. The raw error goes to the framework's diagnostics sink.
```

The line carries the code, the operation (`Resource.family.variant`, or `a transaction`, with the plan step), the scope, the request id and the class name of the error. The one exception is `A3004` (a pipe returned invalid arguments): the line also names the pipe, the operation and the field, because that detail is kept off the wire and the log is where you read it ([Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do)).

### What the reporter receives

| Member | Meaning |
|---|---|
| `kind` | `"operation"` or `"transaction"` (a plan-level failure). |
| `error` | The raw error, exactly as thrown. Server-side only: it is never projected onto the wire. |
| `code` | The code the caller received (`A3000`, `A3001`, ...). |
| `scope` | `"application"` or `"client"`. |
| `requestId` | The request's correlation id. |
| `resource`, `family`, `variant` | The operation (`kind: "operation"` only). |
| `operation` | For a transaction step, its zero-based index. |

A failing transaction step reports with the plan's request id and the step's identity:

```text
{"kind":"operation","code":"A3001","scope":"client","requestId":"tx-9"} PrismaClientKnownRequestError: ...
```

### When it fires

The reporter is for **unplanned** failures: a database error the framework cannot classify, an error thrown by your own pipeline code or computed-field callback (the caller gets `A3000`), an unexpected internal state. It does **not** fire for planned outcomes: a validation failure (`A2004`), a missing record (`A2003`), a unique-constraint conflict (`A2008`), or an `A4xxx` your guard raised on purpose.

A guard that throws an ordinary `Error("boom secret")`, for instance, answers `A3000` ("Internal framework error.", HTTP 500) and your reporter receives `code: "A3000"` with `error` set to the original `Error: boom secret`.

### It cannot hurt a request

The reporter is **not awaited**, and nothing it does can change the response: a sink that throws, or returns a rejected promise, is swallowed and the caller still gets the same envelope. Keep it fast: queue the work instead of doing it inline.

It is configured once at the **root** of the configuration. It is not a pipeline stage and has no `application` or `client` variant, so it cannot be reordered, scoped or switched off per layer.

### Typing

As with pipelines, annotate the parameter: `(d: FrameworkDiagnostic) => ...`. An unannotated parameter inside an `as const` configuration has no contextual type.

## See also

- [Pipelines](/docs/pipelines)
- [Authentication and guards](/docs/authentication-and-guards)
- [HTTP protocol](/docs/http-protocol#headers): the header table.
- [Limits and safety](/docs/limits-and-safety)
