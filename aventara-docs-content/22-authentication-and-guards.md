---
title: Authentication and guards
description: Require a signed-in caller with a pipeline guard that reads the request headers, answer A4000, A4001 and A4002, and send credentials from the generated client.
order: 22
section: guides
---

# Authentication and guards

Aventara has no built-in notion of users or sessions. You decide who may call, in a guard: a function in a [pipeline](/docs/pipelines) that runs before every operation and either lets it through or refuses it. A guard can read the HTTP headers of a remote request, so a bearer token or a cookie is checked there.

Nest guards, interceptors and pipes never run on Aventara routes. The protocol's routes are registered on the HTTP platform directly, so `@UseGuards`, `APP_GUARD` and Passport guards have no effect on them. Put authentication into Aventara guards. See [NestJS host](/docs/nestjs-host#what-runs-on-aventara-routes). The same holds for `@nestjs/throttler`: it is a Nest guard ([Rate limiting](/docs/limits-and-safety#rate-limiting)). CORS is not authentication either: it tells browsers which origins may read answers, while servers and bots ignore it, so only your guards decide who may call.

## A guard that requires a token

This guard lets everyone read, and requires a known bearer token for everything else. Admins only may delete:

```ts
// src/aventara.config.ts
import { AvError, type AvGuard } from "@aventara/core";

// Stand-in for your real session or JWT verification.
const sessions = new Map([
  ["ada-token", { userId: 1, role: "ADMIN" }],
  ["grace-token", { userId: 2, role: "USER" }],
]);

// Annotate the guard with the exported `AvGuard` type: inside an `as const` config it has no contextual type.
const authenticate: AvGuard = async (ctx) => {
  if (ctx.$operation.family === "find") return true;            // reads are public

  const token = ctx.$transport?.headers["authorization"]?.replace(/^Bearer /, "");
  if (!token) throw new AvError("A4000", "Sign in first.");

  const session = sessions.get(token);
  if (!session) throw new AvError("A4000", "Your session is not valid.");

  if (ctx.$operation.family === "delete" && session.role !== "ADMIN") {
    throw new AvError("A4002", "Only admins can delete.");
  }
  return true;
};

export async function aventaraConfig(prisma: PrismaService) {
  return {
    api: "/api",
    adapter: /* ... */,
    client: {
      pipelines: { guards: [authenticate] },                   // remote callers only
    },
  } as const;
}
```

`client.pipelines` runs for remote callers; your own server-side calls (`framework.application`) do not pass through it. Use root `pipelines` to guard both origins. A guard can also sit on one Resource, family or variant (`resources.Post.operations.delete.pipelines.guards`), so it does not need to check which operation it is guarding ([Pipelines](/docs/pipelines#where-stages-go)).

## What callers get

```bash
# no header
{"data":null,"code":"A4000","cause":{"message":"Sign in first."}}                      # HTTP 401
# unknown token
{"data":null,"code":"A4000","cause":{"message":"Your session is not valid."}}          # HTTP 401
# valid token, ordinary user, create
{"data":{"id":1,"name":"X9415"},"code":"A1002","cause":null}                           # HTTP 201
# valid token, ordinary user, delete
{"data":null,"code":"A4002","cause":{"message":"Only admins can delete."}}             # HTTP 403
# admin token, delete
{"data":{"id":1,"name":"X9415"},"code":"A1006","cause":null}                           # HTTP 200
```

A guard's outcome:

| The guard | Result | HTTP |
|---|---|---|
| returns `true` (or `undefined`) | the operation runs | |
| returns `false` | `A4001` FORBIDDEN, message "Operation denied by a framework guard." | 403 |
| throws `AvError("A4000", message)` | `A4000` UNAUTHENTICATED, your message | 401 |
| throws `AvError("A4001", message)` | `A4001` FORBIDDEN, your message | 403 |
| throws `AvError("A4002", message)` | `A4002` POLICY_DENIED, your message | 403 |

Your message reaches the caller, so keep it free of secrets. A guard can also throw `AvError("A2004", { message, issues })` with issues whose paths name request arguments (for example `["arguments", "data", "email"]`); each issue's message is sent as written, if it is non-blank and at most 1,000 characters ([Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do)). Any other thrown error is an unplanned failure: the caller gets a generic `A3000` ("Internal framework error.", HTTP 500) and your [diagnostics reporter](/docs/request-ids-and-diagnostics) receives the real error.

## From the generated client

The client adds no headers of its own beyond the protocol's. Add the token with a custom `fetch`:

```ts
import avClient, { AvClient, AvAuthError } from "./api/AvClient";

try {
  await avClient.Category.create.one({ data: { name: "Anon" } });
} catch (e) {
  if (e instanceof AvAuthError) console.log(e.code, e.cause);   // A4000 { message: 'Sign in first.' }
}

const asGrace = new AvClient({
  fetch: (input, init) =>
    fetch(input, { ...init, headers: { ...init?.headers, Authorization: "Bearer grace-token" } }),
});

await asGrace.Category.create.one({ data: { name: "Grace's" } });   // { id: 3, name: "Grace's" }

try {
  await asGrace.Category.delete.unique({ where: { id: 2 } });
} catch (e) {
  // AvAuthError, e.code === "A4002", e.cause === { message: "Only admins can delete." }
}
```

Every refusal (`A4000`, `A4001`, `A4002`) throws `AvAuthError`. The `fetch` function runs on every call, so it can read the current token each time.

Guards run for every step of a transaction as well, with the transaction request's headers. An unauthenticated plan is refused at its first step, and the error carries `operation: 0`:

```ts
await avClient.transaction([avClient.tx.Category.create.one({ data: { name: "tx-anon" } })]);
// AvAuthError A4000 { message: 'Sign in first.', operation: 0 }
```

## What a guard sees

A guard receives a `ctx` ([The pipeline context](/docs/pipeline-context)):

| Member | Meaning |
|---|---|
| `$origin` | `"application"` (your own server code), `"client"` (a remote request) or `"agent"` (an AI agent over [MCP](/docs/mcp)). |
| `$operation` | Which operation: `{ resource: "User", family: "delete", variant: "unique" }`. For a nested write's target, `nested: true`. |
| `$args` | The operation's arguments. |
| `$requestId` | The request's correlation id ([Request IDs](/docs/request-ids-and-diagnostics)). |
| `$contract` | The active contract, as passive data. |
| `$transport` | Remote requests only: `{ method: "POST", headers }`. Header names are lower-cased; repeated headers are joined with `", "`. Server-side calls have no `$transport`. |
| `ctx.<Resource>...`, `$sql`, `$transaction` | Calls to the framework, for example to read the row a rule depends on. |

## More places a guard can go

- On a field: a field write guard (`resources.<R>.fields.<f>.pipelines.guards`) gets the sent value and `ctx`, and refuses the operation when the caller sends that field: only editors may set `status`. On a relation field it covers `$connect`, `$disconnect` and `$set` too. See [Pipelines](/docs/pipelines#field-pipes-and-field-write-guards).
- On nested writes: a `Post.create` with a nested `category: { $create: ... }` runs `Category`'s own Resource and `create` guards on the nested data, so a guard that refuses `Category.create` also refuses the nested create (`A4001`). See [Nested writes run the target's stages](/docs/pipelines#nested-writes-run-the-targets-stages).
- On a whole transaction: `resources.<R>.transactions.pipelines.guards` sees every step of a plan at once (`ctx.$args` is the plan): "a client plan deletes at most one project".

## Typing a guard

Annotate a guard with the exported `AvGuard` type. It needs no model type, and it type-checks in an `as const` configuration, in `client.pipelines` and `application.pipelines`, and next to guards written for your own model in the same list:

```ts
import type { AvGuard } from "@aventara/core";

const onlyReads: AvGuard = (ctx) => ctx.$operation.family === "find";
```

A guard written inline in a configuration that a function returns `as const` has no contextual type, and TypeScript reports `Parameter 'ctx' implicitly has an 'any' type`; annotate it as above. The same applies to pipes, hooks, interceptors, filters and the `diagnostics` sink. A guard that reads other Resources through `ctx` needs your model: `AvGuard<Model>` ([Typing ctx calls](/docs/pipeline-context#typing-ctx-calls)). [Pipelines](/docs/pipelines#typing-a-stage) has the details.

## Tips

- Reject early, verify properly: check the token's signature and expiry in the guard. Do not trust a header because it is present.
- Authorization needs data as well as a token: a guard may call your own services (the session store, a user service). It is the right place to look up the current user.
- Row-level rules: a guard sees the operation's arguments. It can read a row it needs through `ctx` (`await ctx.Post.find.unique({ where, select: ["authorId"] })`, a raw read that runs no guards). To limit a user to their own records in a list, add a pipe that rewrites `where` ([Pipelines](/docs/pipelines)).
- Passport, or any middleware that finds the user: run it with `app.use(...)` and hand what it found to the stages with `AventaraModule`'s `state` option, `state: (req) => ({ user: req.user })`. A guard then reads `ctx.$state.user` ([NestJS host](/docs/nestjs-host#request-state-what-your-middleware-found)). A guard can also put the user it verified into `ctx.$state` itself, for the later stages of the request.

## See also

- [Pipelines](/docs/pipelines): pipes, hooks, interceptors and filters.
- [Exposure](/docs/exposure#operations): remove an operation for everyone in a layer.
- [HTTP protocol](/docs/http-protocol#codes): the full code table.
- [NestJS host](/docs/nestjs-host#what-runs-on-aventara-routes)
