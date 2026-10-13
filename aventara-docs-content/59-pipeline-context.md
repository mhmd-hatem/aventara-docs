---
title: The pipeline context (ctx)
description: What a stage's ctx tells it, the request's state (ctx.$state), and how a stage calls the framework through ctx - other Resources, ctx.$sql and ctx.$transaction - with an outbox and a likes-counter recipe.
order: 24
section: guides
---

# The pipeline context (`ctx`)

Every [pipeline stage](/docs/pipelines) receives a `ctx`. It does two jobs:

- It tells the stage about the request: the operation, the arguments, the origin, the request id, the headers, and the request's own state. These members start with `$`.
- It is the framework's executor. Everything on `ctx` that does not start with `$` is one of your Resources: `ctx.<Resource>.<family>.<variant>(args)`, plus `ctx.$sql` and `ctx.$transaction`.

A Resource name can never start with `$` (a model named that way is refused at startup with `COMPILER_RESERVED_RESOURCE_NAME`), so a Resource never shadows a framework member.

## The `$` members

| Member | What it holds |
|---|---|
| `ctx.$operation` | `{ resource, family, variant, nested? }`: the operation the stage wraps, such as `Post`, `create`, `one`. For a nested write's target, `resource` is the target, `variant` is `"one"` and `nested` is `true`. A Resource transaction stage has no `$operation`. |
| `ctx.$args` | The operation's arguments, frozen: as the caller sent them in a guard, as the pipes returned them in a pipe, and as the validators checked them in an interceptor, a hook or a filter. A stage registered on one operation (`operations.<family>.<variant>.pipelines`) sees them typed ([below](#typed-arguments)); elsewhere they are `unknown`. In a Resource transaction stage: the plan, `readonly AvTransactionStep[]`. Only a pipe changes the arguments, by returning new ones ([Read-only data](/docs/pipelines#read-only-data)). |
| `ctx.$origin` | `"application"` (your server code, and ctx calls), `"client"` (a remote caller) or `"agent"` (an AI agent over MCP, see [the agent layer](/docs/configuration#the-agent-layer-and-mcp)). |
| `ctx.$requestId` | The request's correlation id ([Request IDs](/docs/request-ids-and-diagnostics)). |
| `ctx.$transport` | Remote requests only: `{ method: "POST", headers }`. Header names are lower-cased; repeated headers are joined with `", "`. |
| `ctx.$contract` | The active contract (application or client), as passive data. |
| `ctx.$state` | The request's state: one object, shared by every stage of the request, that you read and write ([below](#request-state)). |
| `ctx.$sql` | Run a SQL statement now, as a tagged template ([below](#ctxsql)). |
| `ctx.$transaction(work)` | Run several calls in one transaction ([below](#ctxtransaction)). |

A stage's placement decides what it sees. A stage registered on `resources.Post` only ever runs for `Post`, so it rarely needs to read `ctx.$operation.resource`.

### Typed arguments

A stage registered on one operation knows its arguments. Under `resources.<R>.operations.<family>.<variant>.pipelines`, `ctx.$args` is that operation's arguments type, read-only, and a pipe there takes that type and returns it:

```ts
resources: {
  Post: {
    operations: {
      create: {
        one: {
          pipelines: {
            guards: [(ctx) => ctx.$args.data.title !== ""],   // typed: autocomplete on data, select, include
            pipes: [
              (args) => {
                // string | AvTransactionReference<string> | undefined: narrow it first.
                const title = args.data.title;
                if (typeof title !== "string") return undefined;   // keep the arguments
                return { ...args, data: { ...args.data, slug: slugify(title) } };
              },
            ],
          },
        },
      },
    },
  },
},
```

- Writing to `ctx.$args` is a type error, as it is a `TypeError` at runtime.
- A pipe that returns another shape is a type error; returning `undefined` keeps the arguments.
- A field whose value is `undefined` in the data a pipe returns counts as not sent, the same as leaving the key out: an optional field is omitted, an update leaves the field untouched, and a required create field is missing (`A3004`). The same holds for data you pass to `framework.application`, `framework.client`, `ctx` calls and transaction steps (a required field set to `undefined` answers `A2004` with `V1000`). Filters are different: `where: { id: undefined }` is refused, never read as "no filter".
- The types come from your model with no configuration applied, in the application forms (`Date`, `bigint`, `AvDecimal`): arguments reach every stage validated, whatever the origin. A field you hid from one layer still appears in the type; the server refuses it at runtime.
- In a transaction plan, a step's guards and pipes run before its `$ref` values are resolved, so a field that can take a reference is typed as the value or a `$ref` (`string | AvTransactionReference<string>` for `title`), and a field the caller may leave out also as `undefined`. Narrow it before you use it as a value, as the pipe above does.
- These stages are typed from where they are written: inline in `createFramework({ ... })` or in a [`defineResource`](/docs/configuration#one-resource-per-file-defineresource) block. In a configuration that a function returns `as const` (the shape `aventara init` writes), an inline arrow has no contextual type and TypeScript reports `Parameter 'ctx' implicitly has an 'any' type` (TS7006). Move the stage into a `defineResource` block, or declare it with its stage type first ([Typing a stage](/docs/pipelines#typing-a-stage)).
- Guards, pipes and filters run before write compute, so a create in their arguments may lack the fields a `compute.create` stage fills: those are optional there (`args.data.slug` is `string | undefined` when `slug` is computed), and a pipe may return a create without them. Every other required field stays required. Hooks and interceptors run after compute and see every required field. This covers a create's `data`, an upsert's `create` and a nested create.
- Which fields are computed is read from your configuration when `aventara:prepare` runs (the scaffold passes it `--config src/aventara.config.ts`), and counts the layers whose compute runs for the stage's requests. A root stage counts the root's, `application`'s, `client`'s and `agent`'s compute; a `client` stage the root's and its own (and the agent's when the agent extends `client`); an `application` stage the same with `application`; an `agent` stage the root's, its parent's and its own. Without `--config`, these stages may leave any create field out. When you change a compute stage, run `aventara:prepare` again; the server warns at startup until you do (`generated types are stale: run aventara:prepare`).
- A stage on a layer, a Resource or a family runs for several operations (a family's also for a nested write's target), so its `ctx.$args` stays `unknown`. A pipe typed for any operation (`AvPipe`) still fits on one; the server holds its output to the arguments' rules (`A3004`).

## Request state

`ctx.$state` is the one place a stage can write during a request. Every stage of the request gets the same object: a guard can put the signed-in user there, and the hooks, a nested write's guards, the Resource transaction stages and the ctx calls they make read it.

Declare what it holds once, anywhere in your project:

```ts
declare module "@aventara/core" {
  interface AvState {
    user?: { id: number; role: "member" | "admin" };
  }
}
```

Then every stage reads it typed:

```ts
import type { AvGuard } from "@aventara/core";

const signedIn: AvGuard = (ctx) => ctx.$state.user !== undefined;
const adminOnly: AvGuard = (ctx) => ctx.$state.user?.role === "admin";
```

Where it comes from:

- **A remote request**, through `AventaraModule`'s `state` option: a function called once per request with Express's `req` or Fastify's `request`, so what your auth middleware set there reaches the stages. See [NestJS host](/docs/nestjs-host#request-state-what-your-middleware-found).

  ```ts
  AventaraModule.forRoot({ config, state: (req: Request) => ({ user: req.user }) });
  ```

- **Your server code**, through a call's options, the same second argument that takes a request id:

  ```ts
  await framework.application.Post.create.one({ data }, { state: { user } });
  await framework.transaction([step1, step2], { state: { user } });
  ```

  The object is used as it is, so after the call you can read what the stages wrote into it.
- Otherwise each request starts with `{}`.

How long it lives:

- One request. A transaction's steps and its Resource transaction stages share one state.
- A ctx call, `ctx.$sql` and `ctx.$transaction` inherit the state of the stage that made them.
- Compute gets a read-only view: it can read `ctx.$state`, and writing to it throws a `TypeError`.

## Calling the framework from a stage

```ts
// in a guard, pipe, hook, interceptor or filter
const user = await ctx.User.find.unique({ where: { id: userId }, select: ["id", "role"] });
await ctx.User.update.unique({ where: { id: authorId }, data: { postCount: { $increment: 1 } } });
const open = await ctx.Ticket.find.count({ where: { status: "OPEN" } });
```

A ctx call behaves like this:

- It resolves the data directly: a row, a list, a count, or `null` for a `first`-style miss. It does not return an envelope.
- It throws on failure: the `AvError` subclass of the failure's code (`AvNotFoundError`, `AvValidationError`, `AvConflictError`, ...), with the failure's `code` and `cause`, the same classes `framework.application` and the generated client throw. Inside a transaction an uncaught throw rolls the transaction back. A thrown `AvError` that leaves your stage is that stage's answer to the caller.
- It is application-origin: it is validated against the application contract, so the `application` overlay's exposure limits it and the `client` overlay's does not.
- It is raw: it runs the framework's validation, [field pipes](/docs/pipelines#field-pipes-and-field-write-guards), [field validators](/docs/field-validators) and [compute](/docs/computed-fields), and no developer stage: no guards, pipes, hooks, interceptors or filters at any level, no field write guards, no nested-target guards and no Resource transaction stages. A hook's call therefore never runs the hook that made it.
- It joins the current transaction when there is one: in a transaction step's interceptors and hooks, in a [forced operation](/docs/pipelines#forcetransaction)'s interceptors and hooks, in a Resource transaction stage, and inside `ctx.$transaction`. A step's guards and pipes run before the transaction opens, so their calls run on their own, as every call outside a transaction does. A ctx call to an operation that has `forceTransaction` is not wrapped in a transaction of its own.
- It carries the request id and the `ctx.$state` of the stage that made it, and takes no per-call options.

### Typing ctx calls

The executor is typed from your adapter's model. A stage annotated with a type and no model (`AvGuard`, `AvAfterHook`) names no Resource: `ctx.User` is not typed there. Give the stage type your model:

```ts
import type { AvAfterHook } from "@aventara/core";
import { discovery } from "./generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

const countPost: AvAfterHook<Model> = async (_post, ctx) => {
  await ctx.User.update.unique({ where: { id: 1 }, data: { postCount: { $increment: 1 } } });
};
```

A stage written inline in `createFramework({ ... })`, or in a [`defineResource`](/docs/configuration#one-resource-per-file-defineresource) block, gets the model from where it is written. The executor is typed from the application view of the model with no configuration applied: a call the `application` overlay's exposure removed still type-checks, and is refused at runtime (`A2001` or `A2002`).

## `ctx.$sql`

`ctx.$sql` runs a SQL statement right away. It is written only as a tagged template, and every interpolated value is a bound parameter, never part of the SQL text:

```ts
await ctx.$sql`insert into audit_events (actor, action) values (${actorId}, ${"post.create"})`;

const rows = await ctx.$sql<{ total: bigint }>`select count(*) as total from audit_events where actor = ${actorId}`;
// rows: { total: bigint }[]
```

- It resolves the rows the statement returned, typed by `ctx.$sql<Row>` (`unknown[]` without `Row`).
- Inside a transaction (a step's interceptors and hooks, a forced call's, a Resource transaction stage, a `ctx.$transaction` callback) it runs on that transaction and commits or rolls back with it. Outside one it is a plain statement: no transaction is opened around it. `transactionsStyle: "none"` does not affect it (only `ctx.$transaction` needs transactions).
- A value is a string, number, boolean, `bigint`, `null`, `Date`, `AvDecimal`, bytes or a JSON value (bound as JSON text, so cast it: `${value}::jsonb`). The SQL text is static: a table or column name cannot come from a value. A plain string call is refused.
- It needs an adapter that runs SQL statements (the Prisma 7 adapter does). Otherwise it throws `A2002`.
- Only server code can use it. No contract and no generated client carries it.

The same template is available as a transaction step, [`framework.appTx.$sql`](/docs/transactions#sql-steps-apptxsql), with `$ref` values to earlier steps.

## `ctx.$transaction`

`ctx.$transaction(async (tx) => { ... })` runs the callback in one transaction, with `tx` the ctx bound to it, and resolves what the callback returns:

```ts
await ctx.$transaction(async (tx) => {
  const order = await tx.Order.create.one({ data: { total }, select: ["id"] });
  await tx.OutboxEvent.create.one({ data: { topic: "order.created", payload: { orderId: order.id } } });
});
```

A throw rolls everything back and is rethrown as it was. Inside a transaction that is already open, `ctx.$transaction` opens nothing and joins it. Outside one it needs transactions in the application layer (`transactionsStyle` other than `"none"`); otherwise it throws `A2002`.

## Compute gets a read-only ctx

A [compute stage](/docs/computed-fields) receives `AvComputeContext`: the `$` facts, a read-only view of `ctx.$state`, and the read operations, `ctx.<Resource>.find.first`, `.unique`, `.many` and `.count`. It has no write families, no `$sql` and no `$transaction`, and reaching one at runtime throws (the operation answers `A3000`). Compute derives the row's own value; effects on other rows belong in an after hook, as in the recipes below.

## Recipe: an outbox that commits with the write

An outbox event must be written only when the write it describes commits. Three pieces do it:

- `forceTransaction` turns a plain `Order.create.one` call into a one-step transaction, so the Resource's transaction stages run for it.
- An after hook on `Order`'s transaction pipelines runs inside that transaction, before the commit, and sees every step's result.
- `ctx` stores the event through Aventara and sends only its id to the queue with `ctx.$sql`. The event's content is validated and typed like any other row, it rolls back with the order, and the queue message cannot drift from it: the consumer reads the row by id.

The schema has an `OutboxEvent` model beside `Order`:

```prisma
model OutboxEvent {
  id        Int      @id @default(autoincrement())
  topic     String
  payload   Json
  createdAt DateTime @default(now())
}
```

```ts
// src/aventara.config.ts
import type { AvTransactionAfterHook } from "@aventara/core";
import { discovery } from "./generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

// Runs once per transaction that has a top-level step on Order, after the steps, before COMMIT.
const publishOrderEvents: AvTransactionAfterHook<Model> = async (results, ctx) => {
  const rows = results as readonly unknown[];
  for (const [index, step] of ctx.$args.entries()) {
    if (step.resource !== "Order" || step.family !== "create" || step.variant !== "one") continue;
    const order = rows[index] as { readonly id: number };
    // 1. Store the event's content through Aventara, in this transaction.
    const event = await ctx.OutboxEvent.create.one({
      data: { topic: "order.created", payload: { orderId: order.id } },
      select: ["id"],
    });
    // 2. Send only its id. A failure here rolls back the order and the event.
    await ctx.$sql`select pgmq.send('events', jsonb_build_object('eventId', ${event.id}))`;
  }
};

export async function aventaraConfig(prisma: PrismaService) {
  return {
    api: "/api",
    adapter: /* ... */,
    resources: {
      Order: {
        operations: { create: { forceTransaction: true } },
        transactions: { pipelines: { hooks: { after: [publishOrderEvents] } } },
      },
    },
    client: {
      exposed: true,
      exemptions: {
        resources: {
          OutboxEvent: true,                                   // never reachable from outside
          Order: { operations: { create: true } },             // orders are created by server code
        },
      },
    },
  } as const;
}
```

Your checkout service creates the order through the application layer, and the order and its event commit together or not at all:

```ts
import { AvDecimal } from "@aventara/core";

const res = await framework.application.Order.create.one({ data: { total: new AvDecimal("42.00") }, select: ["id"] });
```

- The hook reads `id` from the step's result, which holds what the caller selected. Here only server code creates orders and always selects `id`.
- The hook also runs when an `Order.create.one` is a step of a larger plan, once for the whole plan.
- `pgmq.send` needs PostgreSQL with the `pgmq` extension. Without a queue, leave out step 2 and have a worker read new `OutboxEvent` rows.
- An `Order` created through a nested `$create` under another Resource does not touch `Order`'s transaction stages. Put the hook on the Resource whose operation creates it.

## Recipe: a likes counter

`Post.likeCount` counts the `Like` rows of a post. The count changes in the same transaction as the like, and every other way to add, remove or move a like is closed, so the count cannot drift:

```prisma
model Post {
  id        Int    @id @default(autoincrement())
  title     String
  likeCount Int    @default(0)
  likes     Like[]
}

model Like {
  id     Int  @id @default(autoincrement())
  post   Post @relation(fields: [postId], references: [id])
  postId Int
  userId Int

  @@unique([postId, userId])
}
```

```ts
import type { AvAfterHook, AvBeforeHook } from "@aventara/core";

const countLike: AvAfterHook<Model> = async (_like, ctx) => {
  const { data } = ctx.$args as { data: { postId: number } };
  await ctx.Post.update.unique({ where: { id: data.postId }, data: { likeCount: { $increment: 1 } } });
};

const uncountLike: AvBeforeHook<Model> = async (ctx) => {
  const { where } = ctx.$args as { where: { id: number } };
  const like = await ctx.Like.find.unique({ where, select: ["postId"] });   // a miss throws A2003
  await ctx.Post.update.unique({ where: { id: like.postId }, data: { likeCount: { $decrement: 1 } } });
};

// in the configuration
resources: {
  Like: {
    operations: {
      create: { one: { forceTransaction: true, pipelines: { hooks: { after: [countLike] } } } },
      delete: { unique: { forceTransaction: true, pipelines: { hooks: { before: [uncountLike] } } } },
    },
  },
},
exemptions: {
  resources: {
    // Every other way to add, remove or move a like, closed for every layer.
    Like: {
      operations: {
        create: ["many", "count"],      // bulk creates run no create.one hook
        delete: ["first", "count"],     // nor do these deletes
        update: true,                   // an update could move a like to another post
        upsert: true,                   // an upsert can create a like
      },
      fields: { post: ["create", "update"] },   // a like names its post by postId, which the hook reads
    },
    Post: { fields: { likes: ["create", "update"] } },   // no likes created, moved or deleted through a post
  },
},
client: {
  exposed: true,
  exemptions: {
    resources: {
      Post: { fields: { likeCount: ["create", "update"] } },     // read-only for remote callers
    },
  },
},
```

- Both operations are forced, so the hook and the write share one transaction: if the counter update fails, the like is not created (or not deleted).
- The `before` hook runs inside the forced transaction too, so decrementing before the delete is safe: a failed delete rolls the decrement back.
- `ctx.Post.update.unique` is an application-origin call, so it may write `likeCount` although the `client` overlay made the field read-only for remote callers.
- The root's exemptions leave `Like.create.one` and `Like.delete.unique` as the only writes to likes, for every layer: the application layer, the `client` layer, the `agent` layer of [MCP](/docs/mcp), and `ctx` calls. Anything else that would add, remove or move a like is refused before it runs: `create.many` and `create.count` (no `create.one` hook runs for them), `delete.first` and `delete.count`, any update of a like (it could change `postId`), `upsert`, a like written through `Like.post`, and every nested write under `Post.likes` (`$create`, `$connectOrCreate`, `$upsert`, `$connect`, `$set`, `$update`, `$delete`).

What it guarantees: as long as likes are written through Aventara, `likeCount` equals the post's number of `Like` rows. It does not cover writes that skip the hooks or Aventara: a `ctx` call (`ctx.Like.create.one()` runs no developer stage, so no counter hook; write likes from a pipeline through the caller's operation, never through `ctx`), `ctx.$sql`, your Prisma client used directly, a migration or a seed script, and a `likeCount` your own server code writes through the application layer. After any of those, recount (`likeCount` = `Like.find.count({ where: { postId } })`).

A counter that only needs to be read can also be a `$count` [reducer](/docs/counting), with no stored column at all.

## See also

- [Pipelines](/docs/pipelines): the stages, their order and `forceTransaction`.
- [Which stage do I use?](/docs/which-stage): common tasks mapped to stages, and the rules for `ctx` calls and `ctx.$state`.
- [Transactions](/docs/transactions): plans, `$ref` and `appTx.$sql`.
- [Computed fields](/docs/computed-fields)
- [Configuration reference](/docs/config-reference#pipelines)
