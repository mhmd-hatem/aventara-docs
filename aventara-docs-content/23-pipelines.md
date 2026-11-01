---
title: Pipelines
description: Run your own code around every operation with guards, pipes, hooks, interceptors and filters, at the layer, Resource, family, variant and field levels, in a fixed order, inside transactions when you need it.
order: 23
section: guides
---

# Pipelines

A pipeline is a set of functions you register in the configuration. They run around operations: before one (to refuse it or change its arguments), around it (to time or wrap it), after it (to audit it or write related rows) and when it fails (to reshape the error). They are server-side code only: they never appear in a contract and are never sent to a client.

Not sure which stage a task belongs in? [Which stage do I use?](/docs/which-stage) maps common tasks to stages.

## The stages

An operation has five kinds of stage:

| Stage | Registered as | Receives | Returns | Use it to |
|---|---|---|---|---|
| Guard | `guards` | `(ctx)` | `true`/`undefined` to allow, `false` to deny (`A4001`) | Authenticate and authorize. See [Authentication and guards](/docs/authentication-and-guards). |
| Pipe | `pipes` | `(args, ctx)` | new arguments to continue with, or `undefined` to keep them | Normalize input, scope a query. The only stage that changes the arguments. |
| Hook | `hooks.before`, `hooks.after` | `(ctx)`; after: `(result, ctx)` | nothing | The operation's lifecycle: prepare, audit, write related rows. |
| Interceptor | `interceptors` | `(ctx, next)` | the result of `next()` | Wrap execution: timing, tracing, caching. |
| Filter | `filters` | `(error, ctx)` | an `AvError` to answer with, or `undefined` | Rewrite or enrich errors. |

A field has its own stages, registered under `resources.<Resource>.fields.<field>.pipelines`:

| Stage | Key | What it does |
|---|---|---|
| Validators | `validators` | Declarative `AvZ` checks on the value. See [Field validators](/docs/field-validators). |
| Field pipes | `pipes` | `(value) => value`: a pure transform of the value the caller sent. |
| Compute | `compute` | `create`, `update` and `read` stages that derive the field's value. See [Computed fields](/docs/computed-fields). |
| Field write guards | `guards` | `(value, ctx)`: refuse the operation when the caller sends the field. |

A relation field takes write guards only.

Every stage receives a `ctx` that describes the request, carries the request's state (`ctx.$state`) and can call the framework (`ctx.<Resource>...`, `ctx.$sql`, `ctx.$transaction`). See [The pipeline context](/docs/pipeline-context).

## Where stages go

A stage's place in the configuration is its whole scope. There is no "which Resource am I" flag to check:

| Level | Key | Runs for |
|---|---|---|
| Layer | `pipelines` | every operation of the layer |
| Resource | `resources.<R>.pipelines` | every operation of Resource R |
| Family | `resources.<R>.operations.<family>.pipelines` | every variant of that family |
| Variant | `resources.<R>.operations.<family>.<variant>.pipelines` | that one operation |
| Field | `resources.<R>.fields.<f>.pipelines` | field f's value |
| Resource transactions | `resources.<R>.transactions.pipelines` | once per transaction with a top-level step on R |

```ts
export const aventaraConfig = {
  api: "/api",
  // Layer: every operation of both origins.
  pipelines: { interceptors: [traceInterceptor], filters: [domainErrorFilter] },

  resources: {
    Post: {
      pipelines: { guards: [postReadPolicy] },                          // every Post operation
      operations: {
        create: {
          pipelines: { guards: [mustBeAuthor] },                        // every create variant
          one: { pipelines: { hooks: { after: [notifyFollowers] } } },  // create.one only
        },
      },
      transactions: { pipelines: { guards: [postPlanPolicy] } },        // once per transaction with a Post step
      fields: {
        title: { pipelines: { pipes: [trimTitle], validators: [AvZ.maxLength(200)] } },
        status: { pipelines: { guards: [onlyEditorsSetStatus] } },
        category: { pipelines: { guards: [onlyEditorsRecategorize] } },   // a relation: write guards only
      },
    },
  },

  application: { pipelines: { guards: [applicationPolicyGuard] } },     // server code only
  client: {
    pipelines: { guards: [clientAuthorizationGuard] },                  // remote callers only
    resources: { Post: { operations: { delete: { pipelines: { guards: [adminOnly] } } } } },
  },
} as const;
```

One more key fits in `pipelines` on reads: `cache`, written `cache({ for: "user", maxAge: 60 })`. It is not a function that runs but a promise about who may share the answer, and it lets the browser or a CDN keep it. Unlike the other stages it does not add up: the most specific level wins. See [Caching reads](/docs/caching-reads).

Registering a stage on an operation does not expose it. What exists is decided by [exposure](/docs/exposure); a stage on an operation a layer does not expose never runs for that origin.

## Which requests a pipeline sees

- The root's stages run for every origin. An overlay's stages run only for its own origin: `application` for your server code (`framework.application`, `appTx`), `client` for remote callers (HTTP, the generated client, `framework.client`, `clientTx`). `ctx.$origin` says which: `"application"` or `"client"`, or `"agent"` for an AI agent over [MCP](/docs/mcp), whose calls run the `agent` layer's stages after its parent's ([The agent layer](/docs/configuration#the-agent-layer-and-mcp)).
- Stages add up. At each level the root's registrations run, then the overlay's. A lower level never removes or skips a stage above it, and an overlay never removes the root's. There is no way to turn a stage off from below.
- A stage is told the level it sits at: a stage on `resources.Post` sees `ctx.$operation.resource === "Post"`, a family stage the family, a variant stage the variant.
- Register a stage once, at the outermost level it applies to. A root stage copied into an overlay runs twice.

The stage kinds are norms. The framework does not check what a callback does: an authorization check in an interceptor works, but only guards run before pipes have changed the arguments, and a refusal in a guard runs no interceptor or hook, so admission belongs in guards.

## Order

Every operation runs its stages in one order:

```text
framework validation (with required fields) -> policy admission (when a policy is configured) -> guards -> pipes -> write compute -> re-check (validators) -> policy write check (when a policy is configured) -> interceptors (before) -> hooks.before -> operation -> hooks.after -> interceptors (after) -> filters
```

In full, with every level listed root first, then the operation's overlay:

```text
validate the arguments against the contract: types, unknown fields, structure, and every
                          required create field (less those a compute.create fills), top level and nested
-> policy admission      only when a policy is configured: may this action run, on which rows and
                          fields; runs before any guard, so a guard cannot supply its principal
-> guards                 layer -> Resource -> family -> variant, then each sent field's write guards,
                          then each nested target's Resource and family guards and field write guards
-> pipes                  layer -> Resource -> family -> variant, then each sent field's field pipes
                          (root then overlay), then nested targets'
-> compute (write)        create, update, or an upsert's two branches; then nested targets'
                          (a compute.create that leaves its required field missing answers A3000)
-> re-check               Aventara's own checks on what the pipes and compute produced
                          (A3004, or A3000 for a computed value); then the validators on every
                          value, computed ones included (A2004); then nested targets'
-> policy write check     only when a policy is configured: the checks on what a write is about to
                          write (see Policies)
   (a refusal so far runs no interceptor and no hook)
-> interceptors enter     every level, outer to inner
-> hooks.before           every level, outer to inner
-> the adapter call (one call), then compute (read) on the returned rows
-> hooks.after            every level, inner to outer
-> interceptors unwind    every level, inner to outer
-> output validation, then the response

on a failure after validation:
-> filters, inner to outer: overlay variant, root variant, overlay family, root family,
   overlay Resource, root Resource, overlay layer, root layer; the first that handles it wins
```

Each stage finishes before the next starts, and inside a stage, registration order is execution order. Within the pipes, each pipe receives what the previous one returned.

### Every interceptor wraps every hook

As in NestJS, all interceptors enter before the first `before` hook runs, and every `after` hook has run before the first interceptor unwinds. An overlay's `after` hooks run before the root's.

With a guard, a pipe, a `before` hook, an interceptor, an `after` hook and a filter at the root, and a guard, a `before` and an `after` hook under `client.pipelines`, a remote create runs:

```text
root guard
client guard
root pipe
root interceptor in
root before
client before
  (the adapter call)
client after
root after
root interceptor out
```

and a create that fails with a unique-constraint conflict runs:

```text
root guard
client guard
root pipe
root interceptor in
root before
client before
  (the adapter call fails)
root interceptor out   (the error passes back through it)
root filter
```

and a create that the client guard refuses runs:

```text
root guard
client guard           (returns false: 403 A4001)
```

An `after` hook does not run when the operation fails; the failure goes to the filters. A guard, a pipe or a validator that refuses the operation runs no interceptor and no hook; a thrown error still goes to the filters. A failure the framework's own validation finds (an unknown field, a bad type, a required create field the caller left out) never reaches the stages or the filters.

### A unique operation that finds no row

`find.unique`, `update.unique` and `delete.unique` fail when no row matches, and they fail at the operation, like a failing adapter call. No `after` hook runs, each interceptor's `next()` throws an `AvNotFoundError` (code `A2003`), and the filters see it. A filter may answer something else for it, a `403` instead of the `404` for instance; otherwise the caller gets `404 A2003`, and an in-process call throws the `AvNotFoundError`. Inside a transaction or a forced call, the miss rolls back.

```text
root guard
root interceptor in
root before
  (the adapter call matches no row)
root interceptor out   (next() threw AvNotFoundError)
root filter            (told the AvNotFoundError)
```

A `first` that matches no row is not a failure: it resolves `null`, and the `after` hooks run, told `null`.

## Read-only data

Once a stage has nothing left to change, it reads frozen data:

- A guard gets `ctx.$args` as the caller sent it, frozen.
- A pipe gets frozen arguments and returns new ones. Pipes are the only stage that changes the arguments.
- The validators check what the pipes and write compute produced, and that is exactly what the adapter writes. No later stage can change it.
- Interceptors, hooks and filters get the validated arguments, frozen. An `after` hook gets a frozen copy of the result; an interceptor may still return a different result after `next()`, and the framework checks it against the contract like any result. What your code receives from a call is never frozen.
- Writing to frozen data throws a `TypeError` (ES modules run in strict mode), which answers `A3000` unless you catch it.
- `Date` and `Uint8Array` values cannot be frozen, so every stage gets its own copy, guards and pipes included; changing one in place changes nothing a later stage sees, what is written or what the caller receives.

```ts
// In rc.0 a pipe could change args in place. Now it returns new arguments.
// (`user` is declared on AvState: see The pipeline context.)
const stampOwner: AvPipe = (args, ctx) => {
  const a = args as { data: Record<string, unknown> };
  return { ...a, data: { ...a.data, ownerId: ctx.$state.user?.id } };
};
```

`ctx.$args` and an `after` hook's result are typed `unknown`. To read them typed, claim a read-only shape: `ctx.$args as AvDeepReadonly<{ data: { title: string } }>`.

## Field pipes and field write guards

A field pipe is a pure function of one value: value in, value out, no `ctx`, no I/O. It runs on each value the caller sent for the field in top-level `create`, `update` or `upsert` data, right after the operation's pipes and before write compute, so the validators see the piped and computed value. Guards run earlier and see the value as sent. Returning `undefined` keeps the value.

```ts
resources: {
  User: {
    fields: {
      email: { pipelines: { pipes: [(value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : value)] } },
    },
  },
},
```

A field write guard refuses the operation when the caller sends the field, in `create`, `update` or `upsert` data, nested data included. It receives the sent value and `ctx`. Returning `false` answers `A4001`. On a relation field it covers every write through the relation, `$connect`, `$disconnect` and `$set` included:

```ts
import type { AvFieldGuard } from "@aventara/core";

const onlyEditorsSetStatus: AvFieldGuard = (_value, ctx) =>
  ctx.$origin === "application" || ctx.$transport?.headers["x-role"] === "editor";

// resources: { Post: { fields: { status: { pipelines: { guards: [onlyEditorsSetStatus] } } } } }
```

(Read the role from your verified session, not from a header the caller controls; the header keeps the example short.) There are no read guards. To hide a field from a layer, use [exposure](/docs/exposure).

What a field pipe returns is held to the server's own contract, like an operation pipe's output (a wrong type answers `A3004`). Then the field's validators check it, a Json field's shape included: a value that breaks one answers `A2004`, as the caller's. A computed value is judged the same way. A relation field takes no field pipes (`COMPILER_RELATION_FIELD_CONFIG_UNSUPPORTED`).

## Nested writes run the target's stages

When a `create`, `update` or `upsert` reaches another Resource through a relation directive, the target Resource's own guards and field stages run on the nested data, before the single adapter call. A client cannot create a `Category` through `Post.create({ data: { category: { $create: ... } } })` past a guard that refuses `Category.create`: that call answers `A4001`.

| Directive | The target's stages that run |
|---|---|
| `$create`, `$connectOrCreate` | Resource and `create` guards; field stages on the created data |
| `$update`, `$upsert` | Resource and `update` guards; field stages (an `$upsert`'s `create` branch gets the create stages and `compute.create`, its `update` branch the update ones) |
| `$delete` | Resource and `delete` guards |
| `$connect`, `$disconnect`, `$set` on a to-one whose key the parent holds | none: the parent's write guard on that relation field covers it |
| `$connect`, `$disconnect`, `$set` on a to-many, or a to-one whose key the target holds | Resource and `update` guards |

- The field stages are the target's field pipes, validators, write guards and write compute. Each kind runs after the top-level operation's stages of the same kind.
- A target's stage sees `ctx.$operation` as `{ resource: <target>, family: <the directive's family>, variant: "one", nested: true }`, and `ctx.$args` is the directive's entry (the `$create` data, or a `$connect`'s identifier).
- A target does not run its layer and variant stages, operation pipes, hooks, interceptors, filters or Resource transaction stages: a nested write is part of its parent's operation. An error a target's guard throws goes through the parent operation's filters.

## Transactions

Each step of a [transaction plan](/docs/transactions) runs its own operation stages. Before the transaction opens, every step in order runs its guards, its pipes and its validators. A pipe sees a `$ref` value as the reference it is, unresolved, and may move it (wrap the caller's `where` in an `AND` with its own scope, copy a data value into another field): it is resolved where the pipe put it, held to the rules a `$ref` written there is held to; one placed where no `$ref` may stand is the server's `A3004`. The validators check only the literal values that no write compute changes. If any step is refused there, nothing is opened. Then, inside the database transaction, each step resolves its `$ref`s, runs the field pipes and write compute on the values it resolved, has the validators judge every value, and runs its interceptors and hooks around its adapter call. An error thrown there in step 2 rolls back step 1 too.

A step's guards and pipes run outside the transaction, so their `ctx` calls do not join it. The interceptors' and hooks' calls do.

### Resource transaction stages

`resources.<R>.transactions.pipelines` gives a transaction its own lifecycle for Resource R, with every stage kind. They run once per transaction that has a top-level step on R, however many steps there are:

```text
validate the whole plan
-> every step, in order: guards -> pipes -> validators (the literal values no write compute changes; $refs unresolved)
-> BEGIN
-> guards, then pipes, of each touched Resource (they see the whole plan, $refs unresolved)
-> every touched Resource's interceptors enter, then every touched Resource's hooks.before
     -> the steps, in order, each: resolve $refs -> field pipes of the resolved values -> write compute -> validators on every value
        -> interceptors -> hooks.before -> the adapter call -> hooks.after -> interceptors
   every touched Resource's hooks.after, the last touched Resource's first (they see every step's result), then the interceptors unwind
-> COMMIT

On an exception: the step's own filters, inner to outer; if none handles it, the touched Resources'
interceptors unwind, then their transaction filters run, the last-touched Resource's first; then ROLLBACK
and the answer.
```

- `ctx.$args` is the plan, frozen: `readonly AvTransactionStep[]`, each an operation step `{ resource, family, variant, args }` or a SQL step `{ sql }`. There is no `ctx.$operation`.
- Touched Resources run in the order their first top-level step appears. A Resource reached only through a nested write is not touched, and a SQL step touches nothing.
- The `after` hooks run before the commit, so they can write related rows with `ctx`, and a throw rolls everything back.
- A transaction pipe returns a new plan to change a step's `args`; it must keep the same steps on the same operations. Anything else answers `A3004`. A changed step is checked again, validators included, at its step.
- An interceptor's `next()` runs the steps once. Calling it twice, or resolving without calling it, rolls the transaction back and answers `A3002`.
- When a step fails, `next()` throws that step's error, the same `AvError` subclass a direct call throws for it: `AvNotFoundError` for a unique miss, the error a step filter answered with, and an error no filter handled as the caller would get it (`AvInternalError`, with the generic message). `instanceof`, `code` and `cause` work as usual. Catching it does not commit the failed step: the transaction rolls back either way.

```ts
interceptors: [
  async (ctx, next) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof AvNotFoundError) metrics.count("tx.not-found");
      throw error;
    }
  },
],
```
- Transaction filters are the transaction's outer layer, and they run last. An error a step throws inside the transaction goes through that step's own filters first; when none of them handles it, the transaction interceptors unwind (their `next()` throws), then it goes to the transaction filters of the Resources the plan touches (the last-touched Resource's first), and only then is answered. A step filter that handles it ends there, and the interceptors still unwind. An error a transaction stage throws goes to the transaction filters alone, also after the interceptors have unwound. The transaction rolls back after the filters. A step's guards and pipes run before the transaction opens, so what they throw meets the step's own filters only.

This is where a rule over the whole request belongs: an operation guard sees one step, a transaction guard sees them all.

```ts
import type { AvTransactionGuard } from "@aventara/core";

// A client plan may delete at most one project.
const oneProjectDeletePerPlan: AvTransactionGuard = (ctx) =>
  ctx.$origin === "application" ||
  ctx.$args.filter((step) => step.resource === "Project" && step.family === "delete").length <= 1;

// resources: { Project: { transactions: { pipelines: { guards: [oneProjectDeletePerPlan] } } } }
```

### `forceTransaction`

Outside a transaction, a write is already committed when its `after` hook runs. `forceTransaction: true` on a family or a variant makes a plain call of that operation a one-step transaction:

```text
validate -> guards -> pipes -> validators (the literal values no write compute changes) -> BEGIN -> the Resource's transaction stages
-> write compute -> re-check (computed values included) -> interceptors -> hooks.before -> the adapter call -> hooks.after -> interceptors -> COMMIT
```

A guard, pipe or validator that refuses the call opens no transaction. A computed value the validators refuse is judged inside it and rolls the transaction back.

```ts
resources: {
  Order: {
    operations: {
      create: {
        forceTransaction: true,
        one: { pipelines: { hooks: { after: [writeOutboxEvent] } } },
      },
    },
  },
},
```

- The after hook's `ctx` calls and `ctx.$sql` join the transaction, so a side effect on other rows (an outbox event, a counter on another Resource) commits with the write or not at all. See the [recipes](/docs/pipeline-context#recipe-an-outbox-that-commits-with-the-write).
- The operation is forced when any layer sets it, the root or the operation's overlay. Nothing below unforces it.
- As a step of a plan, a forced operation is just a step: the plan's transaction already wraps it.
- It needs transactions. Under an effective `transactionsStyle: "none"` it is a startup error (`CONFIG_INVALID_VALUE`), and a type error where the types know the style is `"none"`.
- Operations without it stay unwrapped. Force only the operations whose hooks write.

### One origin per plan

A plan has one origin. `framework.transaction` refuses a list that mixes `framework.appTx` and `framework.clientTx` steps before anything runs: `A2004` with one `V1020` issue (`Transaction mixes application and client steps.`) at the first step of the other origin. An `appTx.$sql` step is application-origin. Run each origin's steps as their own transaction.

## A worked configuration

An audit hook, a timing interceptor, a filter and a field pipe, plus a scoping pipe for remote callers. The stages are declared with their exported types so the parameters are typed in an `as const` configuration:

```ts
import { AvError, type AvAfterHook, type AvFilter, type AvInterceptor, type AvPipe } from "@aventara/core";

const audit: AvAfterHook = (_result, ctx) => {
  const { resource, family, variant } = ctx.$operation;
  if (family === "find") return;
  console.log(JSON.stringify({ audit: `${resource}.${family}.${variant}`, origin: ctx.$origin, requestId: ctx.$requestId }));
};

const timing: AvInterceptor = async (ctx, next) => {
  const started = performance.now();
  try {
    return await next();
  } finally {
    const { resource, family, variant } = ctx.$operation;
    console.log(`${resource}.${family}.${variant} took ${Math.round(performance.now() - started)} ms`);
  }
};

const friendlyConflict: AvFilter = (error) =>
  error instanceof AvError && error.code === "A2008"
    ? new AvError("A2008", "That e-mail address is already registered.")
    : undefined;

const onlyPublished: AvPipe = function onlyPublished(args) {
  const a = (args ?? {}) as { where?: object };
  return { ...a, where: { AND: [a.where ?? {}, { publishedAt: { not: null } }] } };
};

export const aventaraConfig = {
  api: "/api",
  pipelines: { hooks: { after: [audit] }, interceptors: [timing] },
  resources: {
    User: {
      pipelines: { filters: [friendlyConflict] },
      fields: { email: { pipelines: { pipes: [(value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : value)] } } },
    },
  },
  client: {
    // Remote callers only ever see published posts.
    resources: { Post: { operations: { find: { pipelines: { pipes: [onlyPublished] } } } } },
  },
} as const;
```

Results:

```bash
# remote caller: Post/find/many {"select":["id","title","publishedAt"]}  -> only published posts
{"data":[{"id":1,"title":"Hello","publishedAt":"2026-01-15T10:00:00.000Z"},
         {"id":2,"title":"Notes on engines","publishedAt":"2026-02-01T00:00:00.000Z"}],"code":"A1000","cause":null}

# your own code: framework.application.Post.find.many({ select: ["id","title"] })  -> every post

# remote caller, with Aventara-Request-Id: signup-1
# User/create/one {"data":{"email":"  Linus@Example.COM "},"select":["id","email"]}
{"data":{"id":4,"email":"linus@example.com"},"code":"A1002","cause":null}
```

```text
User.create.one took 59 ms
{"audit":"User.create.one","origin":"client","requestId":"signup-1"}
```

Creating the same address again answers `409` with the filter's message:

```json
{"data":null,"code":"A2008","cause":{"message":"That e-mail address is already registered."}}
```

## What a pipe may and may not do

- Pipes run after the framework has validated the caller's arguments, and what a pipe returns is validated again against the server's own contract (the core contract: every field of the Resource, including fields you hide from remote callers). A pipe may therefore use a field a remote caller cannot see, such as scoping by an internal `tenantId`, but it may not return a field the Resource does not have or a value of the wrong type. When it does, the operation fails with `500` `A3004`, whatever the pipe was meant to do:

  ```json
  {"data":null,"code":"A3004","cause":{"message":"A server pipeline produced invalid arguments."}}
  ```

  The caller learns nothing more than that, because the details name your server's internals. They go to the server log, as one line from the `Aventara` logger (for a pipe named `scopeToPublished` that filtered `Post` by a field that does not exist):

  ```text
  ERROR [Aventara] A3004 on Post.find.many (client origin, request 1ba58972-c9df-4f01-bb29-a20a18ffb07a): AvPipeOutputError — Pipe pipes[0] "scopeToPublished" returned arguments for Post.find.many that the server contract refuses at "where.AND.1.publishedAt" (V1005: Field "publishedAt" is not available on Resource "Post".). The raw error goes to the framework's diagnostics sink.
  ```

  and to your [diagnostics sink](/docs/request-ids-and-diagnostics). `pipes[0]` is the pipe's position in the operation's effective list, outer levels first. Name your pipes (`function scopeToPublished(...)`, not an arrow) so the line names them. See [Error codes](/docs/error-codes).
- Return a new object. The arguments a pipe receives are frozen, so changing them in place throws a `TypeError`. A pipe that returns `undefined` passes its current arguments on; a returned value replaces them for the next pipe.
- A pipe can scope reads and writes (as above), but it sees only the operation's arguments. It cannot see rows. It is the right place for tenant filters and default values; it is not a replacement for the database's own constraints.
- A pipe cannot fill a required field the caller left out: the framework's validation refuses the create (`A2004`, `V1000` at the field) before the first guard runs, so the pipe never sees it. Create calls are typed by the contract's `createRequirements`, which knows nothing of your pipes. Fill such a field with a [`compute.create`](/docs/computed-fields) stage (or a database default) so callers may leave it out; that field stays optional until compute runs. In exchange, every guard and pipe is told a create that holds every other required field, as its types say. A pipe that drops a required field the caller sent, or that writes a reference together with its relation, is your bug, not the caller's: the caller gets `A3004` and your `diagnostics` sink gets an `AvPipeOutputError` naming the field. Hiding it from the callers' layer while that layer can still create the Resource is refused at startup (`COMPILER_HIDDEN_REQUIRED_FIELD`): the compiler cannot see that a pipe fills it.
- A guard or pipe that throws an `AvError` ends the operation with that code. Any other thrown error is an unplanned failure: the caller gets a generic `A3000` and the [diagnostics reporter](/docs/request-ids-and-diagnostics) gets the real error.

To show the caller more than one message, or to point at a field, throw issues:

```ts
throw new AvError("A2004", {
  message: "Operation arguments failed framework validation.",
  issues: [{ path: ["arguments", "data", "email"], code: "V1001", message: "Use your work email address." }],
});
```

Each issue's `message` reaches the caller as written, standalone, inside a transaction and over HTTP, provided it has a visible character and is at most 1,000 characters; otherwise the caller gets the standard text for the code and your message goes to the `diagnostics` sink. An issue whose `code` is not a validation code (`V1000` and up) is dropped, and so is one whose `path` does not name a member of the request's own arguments (it starts with `"arguments"`). An `A3xxx` error carries no issues.

An issue keeps its `path` inside a transaction. In a transaction step you can write the path as `["arguments", ...]` or as `["operations", i, "args", ...]`; the caller always receives `["operations", i, "args", ...]`, the address of that argument in the request body, with `cause.operation` set to the step's index `i`. A standalone call keeps `["arguments", ...]`.

## What an after hook may and may not do

Outside a transaction, the write is already committed when an `after` hook runs, so an unwrapped operation's after hooks should observe (audit, metrics, notifications), not undo. To make a hook's writes commit with the operation, set [`forceTransaction`](#forcetransaction) on it. Inside a transaction plan, a step's interceptors and hooks run inside the database transaction, so an error thrown in one (a `before` hook refusing step 2, say: `A4002` with `operation: 1`) rolls the whole plan back ([Transactions with $ref](/docs/transactions-with-ref)). A step that a guard or a pipe refuses is refused before the transaction opens.

An `after` hook cannot change the result: it gets a frozen copy. To return something else, use an interceptor.

An interceptor's `next()` runs everything below it once. A second call is refused and the operation answers `A3000`.

## The context

Every stage gets a `ctx`: `$operation`, `$args`, `$origin`, `$requestId`, `$contract`, `$state`, for remote requests `$transport`, and the executor. `ctx.$state` is the request's one writable object: a guard can put the signed-in user there and every later stage reads it. See [The pipeline context](/docs/pipeline-context#request-state).

### Typing a stage

Annotate a stage with its exported type: `AvGuard`, `AvPipe`, `AvBeforeHook`, `AvAfterHook`, `AvInterceptor`, `AvFilter`; for fields `AvFieldPipe` and `AvFieldGuard`; for Resource transaction stages `AvTransactionGuard`, `AvTransactionPipe`, `AvTransactionBeforeHook`, `AvTransactionAfterHook`, `AvTransactionInterceptor` and `AvTransactionFilter`. Without a type argument they need no model, and a stage annotated with one type-checks in an `as const` configuration (the shape `aventara init` writes), in `client` and `application`, and next to stages written for your own model in the same list:

```ts
import { AvError, type AvGuard } from "@aventara/core";

const requireSignIn: AvGuard = (ctx) => {
  if (ctx.$operation.family !== "find" && !ctx.$transport?.headers["authorization"]) {
    throw new AvError("A4000", "Sign in first.");
  }
  return true;
};

export const aventaraConfig = {
  api: "/api",
  client: { pipelines: { guards: [requireSignIn] } },
} as const;
```

Inline, a stage registered on one operation (`operations.<family>.<variant>.pipelines`) gets that operation's arguments typed: `ctx.$args` read-only, a pipe's arguments and return checked ([Typed arguments](/docs/pipeline-context#typed-arguments)). The exported types leave them `unknown`.

An inline arrow in a configuration that is an `as const` object (the scaffold's `aventaraConfig`) has no contextual type, and TypeScript reports `Parameter 'ctx' implicitly has an 'any' type`. Annotate it, or declare it with the stage type first, as above. A stage that calls other Resources through `ctx` needs your model as the type argument (`AvAfterHook<Model>`); see [Typing ctx calls](/docs/pipeline-context#typing-ctx-calls). Inline in `createFramework({ ... })` and in a [`defineResource`](/docs/configuration#one-resource-per-file-defineresource) block, stages are typed from where they are written.

## See also

- [Which stage do I use?](/docs/which-stage): common tasks mapped to stages.
- [The pipeline context](/docs/pipeline-context): `ctx`, calling other Resources, `ctx.$sql`, recipes.
- [Authentication and guards](/docs/authentication-and-guards)
- [Field validators](/docs/field-validators) and [Computed fields](/docs/computed-fields)
- [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
- [Configuration](/docs/configuration#pipelines)
