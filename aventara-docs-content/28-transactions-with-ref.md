---
title: Transactions with $ref
description: Recipes for atomic multi-step writes - parent and child, preconditions, conditional steps, rollback, client versus server transactions, and cascade refusal.
order: 28
section: guides
---

# Transactions with $ref

A transaction runs a list of operations in **one database transaction**: either every step commits or none does. A later step can use a value an earlier step produced with `$ref`. [Transactions](/docs/transactions) explains the model; this page is a set of recipes. They use the frontend client; every recipe works the same from server-side code ([below](#from-server-side-code)).

```ts
const step = avClient.tx.User.create.one({ ... });        // builds a step, sends nothing
const results = await avClient.transaction([stepA, stepB]);   // one request; one typed result per step, in order
```

## What `$ref` can point at

- `step.$ref("field")` names one top-level field of an **earlier** step's projected result. The step must `select` it (or return it by default). Asking for a field the step did not select is a compile error.
- Use it as a **value in `data`**: a scalar foreign key (`authorId: user.$ref("id")`) or any other scalar field. It is not accepted in `where`, in a `$connect` identifier or other nested directives; those answer `A2004` (`V1006` / `V1001`).
- Its type must fit the destination. The plan is checked **before any statement runs**: a mismatch answers `A2007` with `V1011` ("Transaction reference source type is not assignable to its destination.") and nothing is written.
- Mistakes refused before anything runs: the same step listed twice (`A2004`), a `$ref` to a step that is not in the list (`A2007` / `V1010`), more than `maxTransactionOperations` steps (`A2009`, 20 by default), an empty list (`A2004`).

## Create a parent and its child

```ts
const user = avClient.tx.User.create.one({ data: { email: "tx@example.com", name: "Tx" }, select: ["id"] });
const post = avClient.tx.Post.create.one({
  data: { title: "From tx", authorId: user.$ref("id") },
  select: ["id", "title", "authorId"],
});

const [createdUser, createdPost] = await avClient.transaction([user, post]);
// createdUser: { id: 4 }
// createdPost: { id: 7, title: 'From tx', authorId: 4 }
```

When the child can be created **through** the parent, a nested write does the same in a single operation ([Relations and nested writes](/docs/relations-and-nested-writes)). Use a transaction when the steps are different Resources, different operations, or the second needs a value only the first knows.

## Several writes that must succeed together

```ts
const a = avClient.tx.Post.update.unique({ where: { id: 1 }, data: { views: { $increment: 1 } }, select: ["id", "views"] });
const b = avClient.tx.Post.update.unique({ where: { id: 2 }, data: { views: { $decrement: 1 } }, select: ["id", "views"] });
await avClient.transaction([a, b]);
// [ { id: 1, views: 11 }, { id: 2, views: 2 } ]
```

The steps may mix operations and Resources: a `delete.unique` and a `create.one` in one plan return `[ { id: 5, title: 'Draft' }, { id: 4 } ]`.

## Rollback

If any step fails, everything is rolled back and `avClient.transaction` throws that step's own error. `cause.operation` is the zero-based index of the failing step:

```ts
const first = avClient.tx.User.create.one({ data: { email: "rb@example.com" }, select: ["id"] });
const dup = avClient.tx.User.create.one({ data: { email: "ada@example.com" } });   // already exists

try {
  await avClient.transaction([first, dup]);
} catch (e) {
  // ConflictError, e.code === "A2008"
  // e.cause: { message: "The operation conflicts with the current state of the resource.", operation: 1 }
}

await avClient.User.find.first({ where: { email: "rb@example.com" } });   // null: step 0 was rolled back
```

The failing step's code is reported as it is (`A2008`, `A2003`, ...). `A3002` is reserved for transaction infrastructure failures (commit or rollback problems). Errors thrown by a guard or pipe on a later step roll the plan back too: with a pipe that refuses `Category` named "boom" on step 1, the plan throws `A4002 { message: 'boom denied', operation: 1 }` and step 0's category does not exist afterwards.

## Preconditions: make a step abort the plan

A strict (`unique`) read throws when nothing matches, and that aborts the plan. Use one as a **precondition**, and use its result with `$ref`:

```ts
const owner = avClient.tx.User.find.unique({ where: { email: "ada@example.com" }, select: ["id"] });
const post = avClient.tx.Post.create.one({
  data: { title: "after precondition", authorId: owner.$ref("id") },
  select: ["id", "authorId"],
});
await avClient.transaction([owner, post]);
// [ { id: 1 }, { id: 8, authorId: 1 } ]
```

If the owner does not exist, the first step throws and nothing is created:

```ts
// where: { email: "ghost@example.com" }
// NotFoundError A2003 { message: "No record matched the unique selector.", operation: 0 }
```

## Conditional steps

A **first-style** step (`find.first`, `update.first`, `delete.first`) that matches nothing is not an error: it resolves to `null`, and the plan carries on.

```ts
const claim = avClient.tx.Post.update.first({ where: { title: "Nope" }, data: { views: { $increment: 1 } }, select: ["id"] });
const log = avClient.tx.Category.create.one({ data: { name: "claimed" }, select: ["id"] });
await avClient.transaction([claim, log]);
// [ null, { id: 3 } ]       both steps ran; the claim simply matched nothing
```

To make the rest of the plan **depend** on that match, reference it. A `$ref` to a step that resolved to `null` fails and rolls the plan back:

```ts
const first = avClient.tx.User.find.first({ where: { email: "ghost@example.com" }, select: ["id"] });
const post = avClient.tx.Post.create.one({ data: { title: "never", authorId: first.$ref("id") } });
await avClient.transaction([first, post]);
// ValidationError A2007: { path: ["operations", 1, "args", "data", "authorId", "$ref", "path"],
//   code: "V1018", message: "Transaction reference resolved to no value." }, operation: 1
```

| You want | Use |
|---|---|
| Abort if the record is missing | a `unique` step (`NotFoundError`, `A2003`) |
| Continue if it is missing | a `first` step, and no `$ref` to it |
| Abort if it is missing, and use a value from it | a `first` step with a `$ref` (`A2007` / `V1018`) |

## Cascade refusal

If an earlier step deletes a row whose deletion cascades in the database to rows a later step depends on, the plan is refused **before any statement runs**, with `A2004` and the issue `V1019`:

```ts
const del = tx.User.delete.unique({ where: { id: 2 }, select: ["id"] });
const upd = tx.Post.update.many({ where: { authorId: 2 }, data: { title: "y" } });
// Post rows are removed by the User delete's cascade (onDelete: Cascade), so step 1 depends on removed rows.

await avClient.transaction([del, upd]);
// ValidationError A2004: { message: "Transaction plan failed framework validation.",
//   issues: [ { code: "V1019", path: ["operations", 1, "resource"],
//     message: "Transaction step depends on a row removed by an earlier step's cascade" } ], operation: 1 }
```

Reorder the steps (update first, then delete), or drop the dependent step.

## Client or application transactions

The **same plan runs under one layer's rules**:

| Builder | Runs under | Used from |
|---|---|---|
| `avClient.tx` + `avClient.transaction([...])` | the client layer, over HTTP | the frontend |
| `framework.clientTx` + `framework.transaction([...])` | the client layer, in process | your server code, when it should be limited like a remote caller |
| `framework.appTx` + `framework.transaction([...])` | the application layer, in process | trusted server code |

The client layer's restrictions and limits apply to a client plan. Pipelines run for **every step**, with that step's own context: a guard that requires a token is evaluated per step, and a failure carries `operation: <index>`.

## From server-side code

```ts
const user = this.framework.appTx.User.create.one({ data: { email: "srv@example.com" }, select: ["id"] });
const post = this.framework.appTx.Post.create.one({ data: { title: "srv", authorId: user.$ref("id") } });

const result = await this.framework.transaction([user, post], { requestId: "tx-1" });

result.code;   // "A1009" (TRANSACTION_COMMITTED)
result.data;   // [ { id: 5 }, { authorId: 5, bigViews: 0n, body: null, categoryId: null, id: 9, price: Decimal {}, publishedAt: null, title: 'srv', views: 0 } ]
```

Server-side, `framework.transaction` **returns an envelope** and does not throw for a failed plan. A failure answers the failing step's code with `cause.operation`:

```ts
// create "srv2" then a duplicate:
// { data: null, code: 'A2008', cause: { message: 'The operation conflicts with the current state of the resource.', operation: 1 } }
```

See [Server-side usage](/docs/server-side-usage).

## When not to use a transaction

- A single operation is already atomic.
- A transaction holds a database transaction open for its whole run. Keep plans short, and do not call slow external services from a pipeline inside one.
- `transactions: "none"` switches the feature off for a layer ([Configuration](/docs/configuration#transactions)).
- Isolation level, `maxWait` and `timeout` are set on the adapter ([Configuration](/docs/configuration#adapter)). SQLite supports `Serializable` only.

## See also

- [Transactions](/docs/transactions)
- [Relations and nested writes](/docs/relations-and-nested-writes)
- [HTTP protocol](/docs/http-protocol#transactions): the request shape.
- [Limits and safety](/docs/limits-and-safety)
