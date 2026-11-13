---
title: Transactions
description: Run several operations atomically with $ref between steps, on the server and from the frontend; SQL steps, rollback behavior, cascade refusal and what runs inside a transaction.
order: 7
section: guides
---

# Transactions

A transaction runs a list of operations atomically: either every step is committed, or none is. A step can use a value produced by an earlier step with `$ref`.

For worked recipes (parent and child, preconditions, conditional steps, rollback) see [Transactions with $ref](/docs/transactions-with-ref).

Transaction plans are available when the contract advertises `transactions: "interactive"` (the default with the Prisma adapter). If a layer is configured with `transactionsStyle: "server"` or `"none"`, the `POST /_transactions` route does not exist for it, and the generated client has no transaction builders. On the server, `framework.clientTx`, `framework.transaction` and Next's `avClient.tx` are still typed as plan builders under a client `"server"` or `"none"`, but every plan they run is refused with `A2002`. Under `"server"` the server still opens transactions of its own: a [`forceTransaction`](/docs/pipelines#forcetransaction) call, a write a policy checks after it runs, and `ctx.$transaction` ([Configuration](/docs/configuration#transactions)).

## From the frontend

`avClient.tx.<Resource>.<family>.<variant>(args)` builds a step and sends nothing. `avClient.transaction([...])` sends the whole plan in one request and resolves one result per step, typed, in order.

```ts
const user = avClient.tx.User.create.one({
  data: { email: "tx@example.com" },
  select: ["id"],
});
const post = avClient.tx.Post.create.one({
  data: { title: "From tx", authorId: user.$ref("id") },
});

const [createdUser, createdPost] = await avClient.transaction([user, post]);
// createdUser: { id: 4 }
// createdPost: { authorId: 4, body: null, id: 2, title: "From tx", views: 0 }
```

### $ref

`step.$ref("field")` refers to a field of an earlier step's projected result (so the step must `select` it, or return it by default). Rules:

- A reference may point only to an earlier step in the same list, and that step must produce one row (not a `many` or a `count`).
- It names one top-level field of that step's result.
- It can stand almost anywhere a value does: a value in `data` (a foreign key, any scalar), a relation identifier (`$connect`, `$disconnect`, `$set`, the `where` of `$connectOrCreate`), a unique `where`, a `cursor`, any filter operator at any depth (`AND`, `OR`, `NOT` and relation filters included), and nested writes (`$create`, `$update`, `$upsert` data and the `where` of nested `$update`, `$delete`, `$upsert`). It is not accepted in an `orderBy` or in the `where` of a projection.
- The type of that field must fit where you use it. The plan is checked before anything runs: a mismatch answers `A2007` with `V1011` and nothing is written. TypeScript checks that the field name was selected by the step and that the type fits.
- Json: a `$ref` can be a Json field's whole value only when its source is another Json field; from any other type it answers `A2007` with `V1011`. Inside a Json value nothing is read as a reference: a `$ref` nested in it is stored as the reference object (`{ "$ref": { "operation", "fingerprint", "path" } }`), unresolved. TypeScript does not catch either case yet. A Json value also cannot have `$ref` as its own root key, in any call: `{ "$ref": "#/$defs/x" }` as the whole value is read as a `$ref` directive and refused with `A2004` (`V1006`, or `V1001` for other shapes); one level down it is data. To put an earlier step's value into Json, write the `$ref` into a `VIRTUAL` input field and build the Json in the Json field's `compute.create` or `compute.update` stage, which runs after references resolve.
- Null: a nullable source is accepted only by an equality (`field: ref`, `equals`, `not`) on a nullable field, where a `null` matches the rows where the field is unset, as a literal `null` does. Comparison and text operators, `in`, a unique key and a `cursor` refuse a nullable source.
- Two mistakes are refused before anything is sent: the same step listed twice (`AvValidationError`, `A2004`) and a `$ref` to a step that is not in the list (`AvValidationError`, `A2007`).
- [Field validators](/docs/field-validators) are checked on every step's values before the plan is sent, and again by the server before the transaction opens, so a bad value in the last step refuses the plan before the first step writes. A `$ref` value, and a value a write compute stage fills, is checked by the server at its step.

[Transactions with $ref](/docs/transactions-with-ref) has a recipe for each position, with the real answers.

A step is plain data, so any client of the same generated tree can run it.

### Rollback

If any step fails, everything is rolled back and `avClient.transaction` throws the failing step's error. `cause.operation` is the zero-based index of the failing step:

```ts
const first = avClient.tx.User.create.one({ data: { email: "rb@example.com" }, select: ["id"] });
const dup = avClient.tx.User.create.one({ data: { email: "tx@example.com" } });   // email already exists

try {
  await avClient.transaction([first, dup]);
} catch (e) {
  // e is AvConflictError, e.code === "A2008"
  // e.cause: { message: "The operation conflicts with the current state of the resource.", operation: 1 }
}

await avClient.User.find.first({ where: { email: "rb@example.com" } });   // null: step 0 was rolled back
```

When a step fails, the error carries that step's own code (for example `A2008` or `A2003`). `A3002` is reserved for transaction infrastructure failures (commit or rollback problems, a transaction that expired under a step, or a transaction interceptor that broke the plan).

### Cascade refusal

If an earlier step deletes a row whose deletion cascades in the database to rows a later step depends on, the plan is refused before any statement runs, with `A2004` and the validation issue `V1019`:

```ts
const del = avClient.tx.User.delete.unique({ where: { id: 7 }, select: ["id"] });
const upd = avClient.tx.Post.update.many({ where: { authorId: 7 }, data: { title: "y" } });
// Post rows are removed by the User delete's cascade, so step 1 depends on removed rows.

await avClient.transaction([del, upd]);
// throws AvValidationError: code A2004,
// cause.issues[0] = { code: "V1019", path: ["operations", 1, "resource"],
//   message: "Transaction step depends on a row removed by an earlier step's cascade" }
// cause.operation = 1
```

This is the case when your Prisma relation has `onDelete: Cascade`. Reorder the steps, or drop the dependent step.

### Limits

A plan may hold at most `limits.maxTransactionOperations` steps (20 by default; `A2009`), reads and `$sql` steps included, and at most `limits.maxTransactionWrites` write steps (20 by default; `A2009`): each `create`, `update`, `upsert` and `delete` step, and each `$sql` step, which counts as a write because a statement cannot be classed as a read. Both are checked before anything runs.

## From the server

On the server, build steps with `framework.appTx` (application layer) or `framework.clientTx` (client layer) and run them with `framework.transaction([...], options?)`:

```ts
const user = framework.appTx.User.create.one({ data: { email: "srv@example.com" }, select: ["id"] });
const post = framework.appTx.Post.create.one({ data: { title: "srv", authorId: user.$ref("id") } });

const [created, written] = await framework.transaction([user, post], { requestId: "tx-1" });
// created: { id: 3 }
// written: { authorId: 3, body: null, id: 2, title: "srv", views: 0 }
```

Like other server-side calls, `framework.transaction` resolves the committed results and throws a failed plan's error, as the generated client does: the `AvError` subclass of the failing step's code, with `cause.operation` its index.

A plan has one origin. A list that mixes `appTx` and `clientTx` steps is a type error: each handle carries its builder's origin. A list that gets past the types (a handle typed `AvOperation<Row>` with no origin, say) is refused before anything runs, with `A2004` and one `V1020` issue at the first step of the other origin. Run each origin's steps as their own transaction.

### SQL steps: `appTx.$sql`

`framework.appTx.$sql` adds a SQL statement to an application transaction, as a tagged template. Every interpolated value is a bound parameter, never part of the SQL text, and a value can be a `$ref` to an earlier step's field:

```ts
const post = framework.appTx.Post.create.one({ data: { title, authorId }, select: ["id"] });
const job = framework.appTx.$sql<{ msg_id: bigint }>`
  select pgmq.send('jobs', jsonb_build_object('postId', ${post.$ref("id")}))`;

const [created, rows] = await framework.transaction([post, job]);
// rows is { msg_id: bigint }[]; without <Row> it is unknown[]
```

- The statement runs in plan order, in the same database transaction as the other steps. If it fails, or a later step fails, everything rolls back.
- A value is a string, number, boolean, `bigint`, `null`, `Date`, `AvDecimal`, `Uint8Array`, a JSON value (a plain object or array, bound as JSON text, so cast it: `${value}::jsonb`), or a `$ref` to a field of an earlier single-row step, read after that step ran.
- The SQL text is static: a table or column name cannot come from a value. A plain string call is refused (`A2004` / `V1001`).
- A later step cannot `$ref` a SQL step's rows (`A2007` / `V1010`). The rows still appear in the result.
- No guard, pipe, hook, interceptor or filter runs around a SQL step, and it touches no Resource's transaction stages. A SQL error is answered as the adapter classifies it: with Prisma 7, a uniqueness or reference violation is `A2008`, anything else `A3001`.
- `framework.appTx.$sql` is typed `AvSqlStatementBuilder`, and the values it binds are `AvSqlStatementValue`, both exported from `@aventara/core`. A method that returns `framework.appTx.$sql` needs no return type annotation.
- It exists only on `framework.appTx`. `clientTx` has none, the client contract carries nothing of it, and `/_transactions` cannot express it. An adapter that cannot run SQL statements refuses a plan with one (`A2002`); the Prisma 7 adapter runs them.

A stage that needs SQL inside its own operation's transaction uses `ctx.$sql`, the same template run at once ([The pipeline context](/docs/pipeline-context#ctxsql)). Outside a transaction `ctx.$sql` is a plain statement: no transaction is opened around it. The exception is SQLite with better-sqlite3, where it runs in a transaction of its own that holds only that statement ([SQLite: one connection](#sqlite-one-connection)). `transactionsStyle: "none"` does not affect it.

## Request state

`framework.transaction(steps, { state })` gives the whole plan one `ctx.$state`: every step's stages and the Resource transaction stages share it. Over HTTP the Nest host seeds it from the request ([The pipeline context](/docs/pipeline-context#request-state)).

## Over HTTP

The frontend client sends the plan as one `POST <api>/_transactions`. See [HTTP protocol](/docs/http-protocol#transactions) for the request shape. A committed plan answers `200 A1009`; a rolled-back plan answers the failing step's code and status.

## What runs inside a transaction

Every step of a plan runs inside one database transaction, in order, so `$ref` values are available to later steps. With the Prisma adapter this is Prisma's interactive transaction. `maxWait`, `timeout` and `isolationLevel` are set on the adapter ([Configuration](/docs/configuration#adapter)). SQLite supports `Serializable` only.

Before the transaction opens, every step in order runs its guards, its pipes and its field validators on every literal value it sent, a field with a compute stage included. A `$ref` value is still the reference there; it is checked when it is resolved, at its step. A step refused at this point opens nothing and writes nothing, and the answer names the step (`cause.operation`).

Then, inside the transaction, each step resolves its `$ref`s and runs its interceptors and hooks around its adapter call, so an error one of them throws rolls the plan back. Such an error goes through the step's own filters first; if none of them handles it, it continues to the transaction filters of the Resources the plan touches, and only then is answered. Two more things run inside it ([Pipelines](/docs/pipelines#transactions)):

- A Resource's transaction stages (`resources.<R>.transactions.pipelines`) run once per plan that has a top-level step on it, after BEGIN and before COMMIT, and see the whole plan: a guard there can refuse "more than one delete per plan", and an after hook can write an outbox row that commits with the plan.
- An operation with `forceTransaction` runs as a one-step transaction even when called on its own, so its after hooks commit with it. As a step of a plan it is just a step.

### SQLite: one connection

The better-sqlite3 driver (`@prisma/adapter-better-sqlite3`) has one connection to the database file, and an open transaction holds it. Prisma runs a plain statement on that same connection, so on its own a plain call made while another request's transaction is open would run inside that transaction: it would see its uncommitted rows and roll back with it.

So with SQLite through better-sqlite3, the Prisma adapter runs each operation that is not part of a transaction, and each `ctx.$sql` that is not, in a transaction of its own that holds only that call. It waits until the open transaction ends, then runs on its own. It never sees another request's uncommitted rows and never rolls back with it. D1 runs no transactions and PostgreSQL uses a pool, so neither is affected.

What this means for you:

- Operations and transactions queue for the connection and run one at a time. A long transaction (a slow hook, an external call inside it) holds up every other operation until it ends.
- `maxWait` on the adapter is how long an operation waits for the connection; unset, Prisma waits 2000 ms. Past it, the operation answers `A3002`.
- `timeout` on the adapter (Prisma's default is 5000 ms) limits a single plain operation too, not only a transaction.
- Calls you make on your Prisma client directly are outside Aventara: Prisma runs them inside whatever transaction is open. Make them through the Framework, or wrap them in `prisma.$transaction`.

#### A call from inside a transaction joins it

A call made from inside a transaction's own stages, through the Framework instead of `ctx`, cannot wait for that transaction to end: it would wait on itself. So it joins the transaction instead and commits or rolls back with it. Inside a stage, prefer `ctx`. A call to the root Framework there is allowed, and it warns.

The adapter tells which transaction a call belongs to by its async context (Node's `AsyncLocalStorage`): a call made anywhere in the async work a transaction started belongs to it. The first time a given Resource and operation joins this way, the process warns once (and once for `ctx.$sql`):

```text
(node:1234) [AVENTARA_PRISMA_SQLITE_TRANSACTION_JOINED] AventaraWarning: User create.many ran inside an open SQLite transaction (better-sqlite3) instead of waiting for it: it was called from that transaction's async context, so it joined the transaction and commits or rolls back with it. ...
```

If you meant the join, the warning is expected and you can leave it. If you did not, look for a helper shared across requests that keeps the async context it was first called in: a batcher, a queue, or a timer first scheduled from inside a transaction. Here request A's after hook schedules the flush, and request B adds to the batch before it runs:

```ts
let pending: { email: string }[] = [];
let flushing: ReturnType<typeof setTimeout> | undefined;

export function addUser(email: string) {
  pending.push({ email });
  // Scheduled inside request A's transaction, the timer keeps A's context:
  // B's user is written inside A's transaction and rolls back if A does.
  flushing ??= setTimeout(() => {
    const data = pending;
    pending = [];
    flushing = undefined;
    void framework.application.User.create.many({ data });
  }, 50);
}
```

Give the helper a context of its own. Bind its callback with `AsyncResource.bind` from `node:async_hooks` where the helper is created, outside any transaction:

```ts
import { AsyncResource } from "node:async_hooks";

let pending: { email: string }[] = [];
let flushing: ReturnType<typeof setTimeout> | undefined;

const flush = AsyncResource.bind(() => {
  const data = pending;
  pending = [];
  flushing = undefined;
  void framework.application.User.create.many({ data });
});

export function addUser(email: string) {
  pending.push({ email });
  flushing ??= setTimeout(flush, 50);
}
```

The bound flush waits for A like any other call, and B's user commits on its own. Scheduling the helper's timers from outside a transaction works too.

PostgreSQL uses a pool: each transaction gets its own connection, and plain operations run beside it as plain statements. Nothing joins there, and nothing warns.

## See also

- [Transactions with $ref](/docs/transactions-with-ref): recipes.
- [Server-side usage](/docs/server-side-usage)
- [Limits and safety](/docs/limits-and-safety)
