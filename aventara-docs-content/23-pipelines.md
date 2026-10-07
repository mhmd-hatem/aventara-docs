---
title: Pipelines
description: Run your own code around every operation with guards, pipes, hooks, interceptors and filters, in a fixed order and per layer.
order: 23
section: guides
---

# Pipelines

A pipeline is a list of functions you register in the configuration. They run around every operation: before it (to refuse it or change its arguments), around it (to time it or wrap it), after it (to audit it) and when it fails (to reshape the error). They are server-side code only: they never appear in a contract and are never sent to a client.

There are five stages:

| Stage | Registered as | Receives | Returns | Use it to |
|---|---|---|---|---|
| Guard | `guards` | `(context)` | `true`/`undefined` to allow, `false` to deny | Authenticate and authorize. See [Authentication and guards](/docs/authentication-and-guards). |
| Pipe | `pipes` | `(args, context)` | the arguments to continue with | Normalize input, scope a query. |
| Before hook | `hooks.before` | `(context)` | nothing | Observe the operation about to run. |
| Interceptor | `interceptors` | `(context, next)` | the result of `next()` | Wrap execution: timing, tracing, caching. |
| After hook | `hooks.after` | `(result, context)` | nothing | Audit a finished operation. |
| Filter | `filters` | `(error, context)` | a `FrameworkError` to replace the error, or `undefined` | Rewrite or enrich errors. |

## Order

For one operation, in this order:

```text
guards -> pipes -> before hooks -> interceptors( adapter call ) -> after hooks
                                                 \-> on failure: filters
```

Verified with one function per stage logging its name (`root` registered at the top level, `client` under `client.pipelines`), on a remote create:

```text
root guard (client)
client guard (client)
root pipe (client)
root before (client)
client before (client)
root interceptor in (client)
root interceptor out (client)
root after (client)
```

and on a create that fails with a unique-constraint conflict:

```text
root guard (client)
client guard (client)
root pipe (client)
root before (client)
client before (client)
root interceptor in (client)
root filter (client)
```

An after hook does not run when the operation fails. A failure goes to the filters instead.

**Inside a stage, registration order is execution order.** Within a pipe stage, each pipe receives what the previous one returned.

## Scope

Pipelines are the one configuration category that is **concatenated**, not overridden: root pipelines run first for every operation, then the layer's own. A server-side call (`framework.application`) runs the root pipelines and `application.pipelines`; a remote request runs the root pipelines and `client.pipelines`. The context's `scope` says which.

```ts
return {
  entrypoint: "/api",
  adapter: /* ... */,
  pipelines: { /* both layers */ },
  client: { pipelines: { /* remote callers only */ } },
  application: { pipelines: { /* your own server code only */ } },
} as const;
```

Pipelines run once for **every step of a transaction**, each with its own context.

## A worked configuration

One pipe, one hook, one interceptor and one filter at the root, plus a scoping pipe for remote callers:

```ts
import { createFramework, FrameworkError, type PipelineContext } from "@aventara/core";

type Ctx = Pick<PipelineContext, "scope" | "resource" | "family" | "variant" | "requestId">;

return {
  entrypoint: "/api",
  adapter: /* ... */,
  pipelines: {
    pipes: [
      // Transform: normalise e-mail addresses before they are stored.
      (args: unknown, ctx: Ctx) => {
        if (ctx.resource === "User" && ctx.family === "create" && ctx.variant === "one") {
          const a = args as { data: { email: string } };
          return { ...a, data: { ...a.data, email: a.data.email.trim().toLowerCase() } };
        }
        return args;
      },
    ],
    hooks: {
      // Audit: every successful write, with the request id.
      after: [
        (result: unknown, ctx: Ctx) => {
          if (ctx.family === "find") return;
          console.log(JSON.stringify({ audit: `${ctx.resource}.${ctx.family}.${ctx.variant}`, scope: ctx.scope, requestId: ctx.requestId }));
        },
      ],
    },
    interceptors: [
      // Wrap execution: time every operation.
      async (ctx: Ctx, next: () => Promise<unknown>) => {
        const started = performance.now();
        try {
          return await next();
        } finally {
          console.log(`${ctx.resource}.${ctx.family}.${ctx.variant} took ${Math.round(performance.now() - started)} ms`);
        }
      },
    ],
    filters: [
      // Rewrite errors: a friendlier conflict message.
      (error: unknown) =>
        error instanceof FrameworkError && error.code === "A2008"
          ? new FrameworkError("A2008", "That e-mail address is already registered.")
          : undefined,
    ],
  },
  client: {
    pipelines: {
      // Scope: remote callers only ever see published posts.
      pipes: [
        (args: unknown, ctx: Ctx) => {
          if (ctx.resource !== "Post" || ctx.family !== "find") return args;
          const a = (args ?? {}) as { where?: object };
          return { ...a, where: { AND: [a.where ?? {}, { publishedAt: { not: null } }] } };
        },
      ],
    },
  },
} as const;
```

Results:

```bash
# remote caller: Post/find/many {"select":["id","title","publishedAt"]}  -> only published posts
{"data":[{"id":1,"title":"Hello","publishedAt":"2026-01-15T10:00:00.000Z"},
         {"id":2,"title":"Notes on engines","publishedAt":"2026-02-01T00:00:00.000Z"},
         {"id":4,"title":"Navy stories","publishedAt":"2026-03-10T08:30:00.000Z"}],"code":"A1000","cause":null}

# your own code: framework.application.Post.find.many({ select: ["id","title"] })  -> all six posts

# remote caller, with Aventara-Request-Id: signup-1
# User/create/one {"data":{"email":"  Linus@Example.COM "},"select":["id","email"]}
{"data":{"id":4,"email":"linus@example.com"},"code":"A1002","cause":null}
```

```text
User.create.one took 59 ms
{"audit":"User.create.one","scope":"client","requestId":"signup-1"}
```

Creating the same address again answers `409` with the filter's message:

```json
{"data":null,"code":"A2008","cause":{"message":"That e-mail address is already registered."}}
```

## What a pipe may and may not do

- **Pipes run after the framework has validated the caller's arguments, and what a pipe returns is validated again, against the server's own contract** (the Core contract: every field of the Resource, including fields you hide from remote callers). A pipe may therefore use a field a remote caller cannot see, such as scoping by an internal `tenantId`, but it may not return a field the Resource does not have or a value of the wrong type. When it does, the operation fails with `500` `A3004`, whatever the pipe was meant to do:

  ```json
  {"data":null,"code":"A3004","cause":{"message":"A server pipeline produced invalid arguments."}}
  ```

  The caller learns nothing more than that, because the details name your server's internals. They go to the server log, as one line from the `Aventara` logger (verified, for a pipe named `scopeToPublished` that filtered `Post` by a field that does not exist):

  ```text
  ERROR [Aventara] A3004 on Post.find.many (client scope, request 1ba58972-c9df-4f01-bb29-a20a18ffb07a): PipeOutputError — Pipe pipes[0] "scopeToPublished" returned arguments for Post.find.many that the server contract refuses at "where.AND.1.publishedAt" (V1005: Field "publishedAt" is not available on Resource "Post".). The raw error goes to the framework's diagnostics sink.
  ```

  and to your [diagnostics sink](/docs/request-ids-and-diagnostics). Name your pipes (`function scopeToPublished(...)`, not an arrow) so the line names them. See [Error codes](/docs/error-codes).
- Return a new object rather than mutating `args`. A pipe that returns `undefined` passes its current arguments on, so an in-place mutation sticks; a returned value replaces them for the next pipe.
- A pipe can **scope** reads and writes (as above), but it sees only the operation's arguments. It cannot see rows. It is the right place for tenant filters and default values; it is not a replacement for the database's own constraints.
- A guard or pipe that throws a `FrameworkError` ends the operation with that code. Any other thrown error is an unplanned failure: the caller gets a generic `A3000` and the [diagnostics reporter](/docs/request-ids-and-diagnostics) gets the real error.

## What an after hook may and may not do

Outside a transaction, the write is already committed when an after hook runs. Use after hooks to observe (audit, metrics, notifications), not to undo. Inside a transaction plan, per-step pipelines run inside the database transaction, so an error thrown in one (a pipe refusing step 2, say: `A4002` with `operation: 1`) rolls the whole plan back ([Transactions with $ref](/docs/transactions-with-ref)).

## The context

Every stage gets the same `PipelineContext`: `scope`, `resource`, `family`, `variant`, `args`, `requestId`, `contract` and, for remote requests, `transport.headers`. See [Authentication and guards](/docs/authentication-and-guards#what-a-guard-sees). Annotate parameters structurally (`Pick<PipelineContext, ...>`) when you use `as const`, or use the exported `Guard`, `Pipe`, `BeforeHook`, `AfterHook`, `Interceptor` and `Filter` types.

## See also

- [Authentication and guards](/docs/authentication-and-guards)
- [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
- [Computed fields](/docs/computed-fields): field-level behavior that is not a pipeline stage.
- [Configuration](/docs/configuration#pipelines)
