---
title: Transactions
description: Run several operations atomically with $ref between steps, on the server and from the frontend; rollback behavior and cascade refusal.
order: 7
section: guides
---

# Transactions

A transaction runs a list of operations atomically: either every step is committed, or none is. A step can use a value produced by an earlier step with `$ref`.

For worked recipes (parent and child, preconditions, conditional steps, rollback) see [Transactions with $ref](/docs/transactions-with-ref).

Transactions are available when the contract advertises `transactions: "interactive"` (the default with the Prisma adapter). If a layer is configured with `transactions: "none"`, the transaction builders and the `POST /_transactions` route do not exist for it.

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
- Null: a nullable source is accepted only by an equality (`field: ref`, `equals`, `not`) on a nullable field, where a `null` matches the rows where the field is unset, as a literal `null` does. Comparison and text operators, `in`, a unique key and a `cursor` refuse a nullable source.
- Two mistakes are refused before anything is sent: the same step listed twice (`ValidationError`, `A2004`) and a `$ref` to a step that is not in the list (`ValidationError`, `A2007`).

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
  // e is ConflictError, e.code === "A2008"
  // e.cause: { message: "The operation conflicts with the current state of the resource.", operation: 1 }
}

await avClient.User.find.first({ where: { email: "rb@example.com" } });   // null: step 0 was rolled back
```

When a step fails, the error carries that step's own code (for example `A2008` or `A2003`). `A3002` is reserved for transaction infrastructure failures (commit or rollback problems).

### Cascade refusal

If an earlier step deletes a row whose deletion cascades in the database to rows a later step depends on, the plan is refused before any statement runs, with `A2004` and the validation issue `V1019`:

```ts
const del = avClient.tx.User.delete.unique({ where: { id: 7 }, select: ["id"] });
const upd = avClient.tx.Post.update.many({ where: { authorId: 7 }, data: { title: "y" } });
// Post rows are removed by the User delete's cascade, so step 1 depends on removed rows.

await avClient.transaction([del, upd]);
// throws ValidationError: code A2004,
// cause.issues[0] = { code: "V1019", path: ["operations", 1, "resource"],
//   message: "Transaction step depends on a row removed by an earlier step's cascade" }
// cause.operation = 1
```

This is the case when your Prisma relation has `onDelete: Cascade`. Reorder the steps, or drop the dependent step.

### Limits

A plan may hold at most `limits.maxTransactionOperations` steps (20 by default; `A2009`).

## From the server

On the server, build steps with `framework.appTx` (application layer) or `framework.clientTx` (client layer) and run them with `framework.transaction([...], options?)`:

```ts
const user = framework.appTx.User.create.one({ data: { email: "srv@example.com" }, select: ["id"] });
const post = framework.appTx.Post.create.one({ data: { title: "srv", authorId: user.$ref("id") } });

const result = await framework.transaction([user, post], { requestId: "tx-1" });

result.code;   // "A1009" (TRANSACTION_COMMITTED)
result.data;   // [{ id: 3 }, { authorId: 3, body: null, id: 2, title: "srv", views: 0 }]
```

Like other server-side calls, `framework.transaction` returns an envelope and does not throw for a failed plan; on failure `result.code` is the failing step's code and `result.cause.operation` is its index.

## Over HTTP

The frontend client sends the plan as one `POST <entrypoint>/_transactions`. See [HTTP protocol](/docs/http-protocol#transactions) for the request shape. A committed plan answers `200 A1009`; a rolled-back plan answers the failing step's code and status.

## What runs inside a transaction

Every step of a plan runs inside one database transaction, in order, so `$ref` values are available to later steps. With the Prisma adapter this is Prisma's interactive transaction. `maxWait`, `timeout` and `isolationLevel` are set on the adapter ([Configuration](/docs/configuration#adapter)). SQLite supports `Serializable` only.

## See also

- [Transactions with $ref](/docs/transactions-with-ref): recipes.
- [Server-side usage](/docs/server-side-usage)
- [Limits and safety](/docs/limits-and-safety)
