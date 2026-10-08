---
title: Request IDs and diagnostics
description: How a request id is adopted or generated and where it appears, and how to receive the real error behind every unplanned failure.
order: 30
section: guides
---

# Request IDs and diagnostics

When something goes wrong in production you need to find this request in your logs and read the real error, which Aventara never sends to the caller. The request id and the diagnostics reporter cover those two jobs.

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
| an invalid value (spaces, longer than 128 characters, empty) | a generated UUID: the request is not refused |

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
        origin: d.origin,
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
{"kind":"operation","code":"A3000","requestId":"checkout-17","origin":"client","name":"Counter.find.many"} Error: audit service unreachable
    at auditTrail (...)
```

`checkout-17` in the log is `checkout-17` in the caller's response header, so a bug report that quotes the header leads straight to the log line. A database failure that the framework cannot classify arrives the same way, with `code: "A3001"` and the database client's own error as `error`.

### Internal failures in the server log

Whether or not you configured a `diagnostics` function, every internal failure (`A3000` to `A3004`) writes one line to the server's log, through Nest's `Logger` under the context `Aventara`, so your logger settings govern it. This is the case when `AventaraModule` builds the framework from `config`, the form the scaffold uses; a framework you built yourself reports only to its own `diagnostics`. It says what failed and where, and never repeats the raw error's message, which can hold SQL, a connection string or row data:

```text
ERROR [Aventara] A3000 on Counter.find.many (client origin, request checkout-17): Error. The raw error goes to the framework's diagnostics sink.
```

The line carries the code, the operation (`Resource.family.variant`, or `a transaction`, with the plan step), the origin (`application` or `client`), the request id and the class name of the error. The one exception is `A3004` (a pipe returned invalid arguments): the line also names the pipe, the operation and the field, because that detail is kept off the wire and the log is where you read it ([Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do)).

### What the reporter receives

| Member | Meaning |
|---|---|
| `kind` | `"operation"` or `"transaction"` (a plan-level failure). |
| `error` | The raw error, exactly as thrown. Server-side only: it is never projected onto the wire. |
| `code` | The code the caller received (`A3000`, `A3001`, ...). |
| `origin` | `"application"` (your own server code) or `"client"` (a remote request). |
| `requestId` | The request's correlation id. |
| `resource`, `family`, `variant` | The operation (`kind: "operation"` only). |
| `operation` | For a transaction step, its zero-based index. |
| `deliberate` | Readable on every diagnostic, but only an operation diagnostic (`kind: "operation"`) ever carries it; a transaction diagnostic declares it and never sets it. `true` when `error` is a `FrameworkError` with an `A3xxx` code that your own code threw on purpose (below). Absent for a failure the framework did not expect. |

A failing transaction step reports with the plan's request id and the step's identity:

```text
{"kind":"operation","code":"A3001","origin":"client","requestId":"tx-9"} PrismaClientKnownRequestError: ...
```

### When it fires

The reporter is for unplanned failures: a database error the framework cannot classify, an error thrown by your own pipeline code or computed-field callback (the caller gets `A3000`), an unexpected internal state. It does not fire for planned outcomes: a validation failure (`A2004`), a missing record (`A2003`), a unique-constraint conflict (`A2008`), or an `A4xxx` your guard raised on purpose. A deliberate `A3xxx` error you threw, though, is reported ([below](#what-else-reaches-it)).

A guard that throws an ordinary `Error("boom secret")`, for instance, answers `A3000` ("Internal framework error.", HTTP 500) and your reporter receives `code: "A3000"` with `error` set to the original `Error: boom secret`.

### What else reaches it

Besides unexpected failures, the reporter also receives four kinds of report. In each the caller's answer is unchanged.

A deliberate internal error. A `FrameworkError` you throw on purpose with an `A3xxx` code (from a guard, pipe, hook, interceptor, computed field or adapter, or returned by a filter) reaches the reporter once, as the error you threw, under its code, with `deliberate: true`. The caller still gets the generic `A3000` or `A3001` envelope, so your message and issues are visible nowhere else. A pipe that does `throw new FrameworkError("A3001", "billing service is down")`:

```text
caller:   {"data":null,"code":"A3001","cause":{"message":"Adapter execution failed."}}
reporter: { kind: "operation", code: "A3001", origin: "application", resource: "Category", family: "create",
            variant: "one", deliberate: true, error: FrameworkError: billing service is down }
```

A result that does not match its Contract. An adapter row with a wrong value, a missing field, a result of the wrong shape: one `A3000` diagnostic whose `error` is an `OutputValidationError` that names the operation and lists the problems in `error.issues`:

```text
error.name:     OutputValidationError
error.message:  The result of Post.find.many does not satisfy its Contract at "data.0.title" (V1001: Value must be a string.)
error.issues:   [ { code: "V1001", path: ["data", 0, "title"], message: "Value must be a string." } ]
```

A computed field that returns the wrong thing. A read or write behavior that returns a value its field refuses is reported as a `ComputedValueError`, with the issues:

```text
error.name:     ComputedValueError
error.message:  The read behavior of Post.shout returned a value its Contract refuses (V1001: Value must be a string.)
```

A route your own host did not mount. If a [custom host](/docs/custom-host#a-route-the-host-left-out) mounts only some of `protocol.surface()` and a request reaches `protocol.answerAbsent` for a route it left out, you get one `A3000` diagnostic naming the route, with the error `UnmountedRouteError`:

```text
error.name:     UnmountedRouteError
error.message:  The ClientContract advertises Post.find.many, but the host mounted no route for POST /_resources/Post/find/many, so protocol.answerAbsent answered it 500 A3000. Mount every protocol.surface() entry.
```

A diagnostic for `/_transactions` has `kind: "transaction"`. The caller's answer is `500 A3000` as before, and a route your ClientContract does not offer is still answered without a report. `@aventara/nest` mounts every route, so a Nest application never sees this.

A [filter](/docs/pipelines) that inspects an error sees the original error in these cases (an `OutputValidationError`, say), not a `FrameworkError` with the code `A3000`.

The message you put in a `FrameworkError` is yours to read in the reporter, and it is sent to the caller as written for every code outside `A3xxx` (such as `A4002`), so such a message must not carry database text, SQL, a stack, a path or a secret.

### Misuse reports

A server-side call that passes something that cannot be read or is not plain data is refused as the caller's mistake (`A2004` / `V1001`, [Server-side usage](/docs/server-side-usage#what-a-server-side-call-accepts)). That is a planned outcome, so it does not reach `diagnostics`. To count those, set `misuse` beside `diagnostics`: it receives one event per refused value (`kind`, `path`, and the operation's `origin`, `resource`, `family`, `variant` and step), never the value ([Configuration reference](/docs/config-reference#misuse)). Nothing is reported to both.

### It cannot hurt a request

The reporter (and `misuse`) is not awaited, and nothing it does can change the response: a sink that throws, or returns a rejected promise, is swallowed and the caller still gets the same envelope. Keep it fast: queue the work instead of doing it inline.

It is configured once at the root of the configuration. It is not a pipeline stage and has no `application` or `client` variant, so it cannot be reordered, scoped or switched off per layer.

### Typing

As with pipelines, annotate the parameter: `(d: FrameworkDiagnostic) => ...`. An unannotated parameter inside an `as const` configuration has no contextual type.

## See also

- [Pipelines](/docs/pipelines)
- [Authentication and guards](/docs/authentication-and-guards)
- [HTTP protocol](/docs/http-protocol#headers): the header table.
- [Limits and safety](/docs/limits-and-safety)
