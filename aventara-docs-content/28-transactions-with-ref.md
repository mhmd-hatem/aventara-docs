---
title: Transactions with $ref
description: Recipes for atomic multi-step writes - parent and child, preconditions, conditional steps, rollback, client versus server transactions, and cascade refusal.
order: 28
section: guides
---

# Transactions with $ref

A transaction runs a list of operations in one database transaction: either every step commits or none does. A later step can use a value an earlier step produced with `$ref`. [Transactions](/docs/transactions) explains the model; this page is a set of recipes. They use the frontend client; every recipe works the same from server-side code ([below](#from-server-side-code)).

```ts
const step = avClient.tx.User.create.one({ ... });        // builds a step, sends nothing
const results = await avClient.transaction([stepA, stepB]);   // one request; one typed result per step, in order
```

## What `$ref` can point at

`step.$ref("field")` names one top-level field of an earlier step's projected result.

- The step must `select` the field (or return it by default). Asking for a field the step did not select is a compile error.
- The source step must produce one row: a `unique`, `first` or `create.one`. A `many` or a `count` step has no single row to refer to, and a `$ref` to one is refused (`A2007` / `V1010`: "Transaction reference source has no addressable single-row projection.").
- The reference must point to an earlier step in the list. A step that is not in the list is `A2007` / `V1010`, and a step that comes later is `A2007` / `V1016` ("Transaction reference operation index is invalid.").
- Its type must fit the destination, and the plan is checked before any statement runs: a mismatch answers `A2007` with `V1011` ("Transaction reference source type is not assignable to its destination.") and nothing is written ([Types and null](#types-and-null)).
- Other mistakes refused before anything runs: the same step listed twice (`A2004`), more than `maxTransactionOperations` steps (`A2009`, 20 by default), an empty list (`A2004`).

### Where a `$ref` can go

| Position | Example |
|---|---|
| A value in `data` (a foreign key or any scalar) | `authorId: user.$ref("id")` |
| A relation identifier: `$connect`, `$disconnect`, `$set`, and the `where` of `$connectOrCreate` | `category: { $connect: { id: cat.$ref("id") } }` |
| A unique `where` (`find.unique`, `update.unique`, `delete.unique`, `upsert.unique`) | `where: { id: post.$ref("id") }` |
| A `cursor` | `cursor: { id: start.$ref("id") }` |
| A filter, in any operator, at any depth: `AND`, `OR`, `NOT`, relation filters (`some`, `every`, `none`, a to-one relation) | `where: { views: { gt: post.$ref("views") } }` |
| Nested writes, at any depth: the values and keys of nested `$create`, `$update` and `$upsert` data, and the `where` of nested `$update`, `$delete` and `$upsert` | `posts: { $update: { where: { id: post.$ref("id") }, data: { ... } } }` |

A `$ref` is still refused in an `orderBy` and in the `where` of a projection (a nested `select` or `include`): both answer `A2004`.

### Types and null

A reference must fit the place it is used; TypeScript checks it as you write the step (the generated client and `framework.appTx` / `framework.clientTx` type each position the same way), and the server checks the same rule before anything runs and refuses a mismatch with `A2007` / `V1011`.

| Where the reference goes | The source must be |
|---|---|
| a field's value (`field: ref`), `equals`, `not` | the field's own type; nullable only where the destination field is nullable ([null sources](#null-sources)) |
| a comparison operator (`gt`, `gte`, `lt`, `lte`) or a text operator (`contains`, `startsWith`, `endsWith`) | the field's own type, never null |
| `in`, `notIn` (and, on a list field, `hasEvery`, `hasSome`) | a list field |
| `has` (on a list field) | one value of the list's type |
| a unique key, a `cursor` | the key's type, never null |

List fields (PostgreSQL scalar lists such as `tags String[]`) take list sources where an operator wants a list. On PostgreSQL, with posts tagged `["x","y"]`, `["x"]` and `["z"]`:

```ts
const entry = framework.appTx.Post.find.unique({ where: { id: 1 }, select: ["id", "tags", "scores"] });   // tags ["x","y"]
const some = framework.appTx.Post.find.many({ where: { tags: { hasSome: entry.$ref("tags") } }, select: ["title"], orderBy: { id: "asc" } });
const every = framework.appTx.Post.find.many({ where: { tags: { hasEvery: entry.$ref("tags") } }, select: ["title"], orderBy: { id: "asc" } });
const notIn = framework.appTx.Post.find.many({ where: { views: { notIn: entry.$ref("scores") } }, select: ["title"] });   // scores is an Int[]
const result = await framework.transaction([entry, some, every, notIn]);
// result.code === "A1009"; result.data is the array, one entry per step:
// [ { id: 1, tags: ['x', 'y'], scores: [1, 2] }, [ { title: 'one' }, { title: 'two' } ], [ { title: 'one' } ], [ ...posts whose views are not in [1, 2] ] ]
```

`has` takes one value of the list's type: a `title` source works, and a list source is refused (`A2007` / `V1011`).

An `in` with a plain (non-list) source is a mistake the plan refuses:

```ts
// where: { categoryId: { in: post.$ref("categoryId") } }
// ValidationError A2007: { path: ["operations", 1, "args", "where", "categoryId", "in", "$ref", "path"],
//   code: "V1011", message: "Transaction reference source type is not assignable to its destination." }, operation: 1
```

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

When the child can be created through the parent, a nested write does the same in a single operation ([Relations and nested writes](/docs/relations-and-nested-writes)). Use a transaction when the steps are different Resources, different operations, or the second needs a value only the first knows.

## Act on a row an earlier step made or found

A reference can be a unique `where`, so a later step can read, update or delete the very row an earlier step produced:

```ts
const created = avClient.tx.Post.create.one({ data: { title: "Draft", authorId: 1 }, select: ["id"] });
const bumped = avClient.tx.Post.update.unique({
  where: { id: created.$ref("id") },
  data: { views: { $increment: 1 } },
  select: ["id", "title", "views"],
});
await avClient.transaction([created, bumped]);
// [ { id: 58 }, { id: 58, title: 'Draft', views: 1 } ]
```

## Link with `$connect`, `$disconnect` and `$set`

A relation directive takes its identifiers from earlier steps the same way:

```ts
const cat = avClient.tx.Category.create.one({ data: { name: "Fresh" }, select: ["id"] });
const post = avClient.tx.Post.create.one({
  data: { title: "Linked", author: { $connect: { id: 1 } }, category: { $connect: { id: cat.$ref("id") } } },
  select: ["id", "categoryId"],
});
await avClient.transaction([cat, post]);
// [ { id: 11 }, { id: 59, categoryId: 11 } ]
```

`$connectOrCreate` takes a reference in its `where`:

```ts
const cat = avClient.tx.Category.create.one({ data: { name: "Coc" }, select: ["id", "name"] });
const post = avClient.tx.Post.create.one({
  data: {
    title: "COC",
    author: { $connect: { id: 1 } },
    category: { $connectOrCreate: { where: { name: cat.$ref("name") }, create: { name: "unused" } } },
  },
  select: ["id", "categoryId"],
});
// [ { id: 12, name: 'Coc' }, { id: 60, categoryId: 12 } ]   found the category the first step created
```

A to-many relation takes whole sets: `$set` replaces the members with the referenced rows, and `$disconnect` unlinks only the ones named:

```ts
const a = avClient.tx.Post.find.unique({ where: { id: 55 }, select: ["id"] });
const c = avClient.tx.Post.find.unique({ where: { id: 57 }, select: ["id"] });
const set = avClient.tx.Category.update.unique({
  where: { name: "News" },
  data: { posts: { $set: [{ id: a.$ref("id") }, { id: c.$ref("id") }] } },
  select: ["id", { posts: { select: ["title"], orderBy: { id: "asc" } } }],
});
const drop = avClient.tx.Category.update.unique({
  where: { name: "News" },
  data: { posts: { $disconnect: [{ id: c.$ref("id") }] } },
  select: [{ posts: { select: ["title"], orderBy: { id: "asc" } } }],
});
await avClient.transaction([a, c, set, drop]);
// [ { id: 55 }, { id: 57 },
//   { id: 10, posts: [ { title: 'Hello' }, { title: 'Compilers' } ] },
//   { posts: [ { title: 'Hello' } ] } ]
```

## Filter by an earlier result

A reference works in any filter operator, at any depth: under `AND`, `OR` and `NOT`, and through relations (a to-one relation's nested `where`, or `some`, `every` and `none` on a to-many). The posts that earn more than a given post, that share its author but are not that post, and the users who wrote it:

```ts
const post = avClient.tx.Post.find.unique({ where: { id: 56 }, select: ["id", "views", "authorId"] });

const more = avClient.tx.Post.find.many({
  where: { views: { gt: post.$ref("views") } },
  select: ["title", "views"],
});
const sameAuthor = avClient.tx.Post.find.many({
  where: { AND: [{ authorId: post.$ref("authorId") }, { NOT: { id: post.$ref("id") } }] },
  select: ["title"],
  orderBy: { id: "asc" },
});
const writers = avClient.tx.User.find.many({
  where: { posts: { some: { id: post.$ref("id") } } },
  select: ["email"],
});

await avClient.transaction([post, more, sameAuthor, writers]);
// [ { id: 56, views: 20, authorId: 23 },
//   [ { title: 'Compilers', views: 30 } ],
//   [ { title: 'Hello' }, { title: 'Draft' }, { title: 'Linked' } ],
//   [ { email: 'ada@example.com' } ] ]
```

A reference in a `cursor` continues a list from a row an earlier step found. The cursor is a unique key, so its source must not be null, and the list needs an explicit `orderBy` as always ([Filtering, sorting and paging](/docs/filtering-sorting-paging#paging)):

```ts
const start = avClient.tx.Post.find.unique({ where: { id: 56 }, select: ["id"] });
const page = avClient.tx.Post.find.many({
  orderBy: [{ id: "asc" }],
  cursor: { id: start.$ref("id") },
  limit: 2,
  select: ["title"],
});
await avClient.transaction([start, page]);
// [ { id: 56 }, [ { title: 'Notes' }, { title: 'Compilers' } ] ]
```

## Nested writes

Inside a nested write a reference works at any depth, in the values and keys of nested `$create`, `$update` and `$upsert` data and in the `where` of a nested `$update`, `$delete` or `$upsert`:

```ts
const author = avClient.tx.User.find.unique({ where: { email: "ada@example.com" }, select: ["id"] });
const post = avClient.tx.Post.find.unique({ where: { id: 55 }, select: ["id"] });

const bump = avClient.tx.User.update.unique({
  where: { id: author.$ref("id") },
  data: { posts: { $update: { where: { id: post.$ref("id") }, data: { views: { $increment: 5 } } } } },
  select: [{ posts: { select: ["title", "views"], orderBy: { id: "asc" } } }],
});
const remove = avClient.tx.User.update.unique({
  where: { id: author.$ref("id") },
  data: { posts: { $delete: { where: { id: post.$ref("id") } } } },
  select: ["id"],
});
await avClient.transaction([author, post, bump]);
// [ { id: 23 }, { id: 55 }, { posts: [ { title: 'Hello', views: 15 }, { title: 'Notes', views: 20 }, ... ] } ]
await avClient.transaction([author, post, remove]);
// [ { id: 23 }, { id: 55 }, { id: 23 } ]
```

The `where` of a nested `$update` or `$delete` through a to-many relation names plain fields only (as `id` above), whatever it holds; see [Relations and nested writes](/docs/relations-and-nested-writes#what-fails-and-how).

## Null sources

A source field can be nullable (`Post.categoryId`, for a post with no category). What a reference to it means depends on where it goes:

- Equality (`field: ref`, `equals`, `not`) against a nullable field accepts a nullable source. A `null` source then matches the rows where the field is unset, exactly as a literal `null` does.
- Every other position refuses a nullable source: the comparison and text operators, `in`, `notIn`, a unique key and a `cursor`. TypeScript says so as you write it, and the server refuses it before anything runs, `A2007` / `V1011`.

```ts
const open = avClient.tx.Post.find.unique({ where: { id: 56 }, select: ["id", "categoryId"] });   // no category: null
const same = avClient.tx.Post.find.many({
  where: { categoryId: open.$ref("categoryId") },
  select: ["title"],
  orderBy: { id: "asc" },
});
await avClient.transaction([open, same]);
// [ { id: 56, categoryId: null }, [ { title: 'Notes' }, { title: 'Compilers' }, { title: 'Draft' } ] ]
```

> A `null` source matches every row where the field is unset, which can be many rows. The three posts above are all the posts without a category, not "the posts that share this post's category". If you mean "the posts in this post's category", handle the unset case yourself rather than relying on this.

```ts
// where: { categoryId: { gt: open.$ref("categoryId") } }
// ValidationError A2007: { path: ["operations", 1, "args", "where", "categoryId", "gt", "$ref", "path"],
//   code: "V1011", message: "Transaction reference source type is not assignable to its destination." }, operation: 1
// where: { id: open.$ref("categoryId") }          (a unique key)       -> the same A2007 / V1011
```

A non-null source into an equality on a nullable field is always fine.

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

A strict (`unique`) read throws when nothing matches, and that aborts the plan. Use one as a precondition, and use its result with `$ref`:

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

A first-style step (`find.first`, `update.first`, `delete.first`) that matches nothing is not an error: it resolves to `null`, and the plan carries on.

```ts
const claim = avClient.tx.Post.update.first({ where: { title: "Nope" }, data: { views: { $increment: 1 } }, select: ["id"] });
const log = avClient.tx.Category.create.one({ data: { name: "claimed" }, select: ["id"] });
await avClient.transaction([claim, log]);
// [ null, { id: 3 } ]       both steps ran; the claim simply matched nothing
```

To make the rest of the plan depend on that match, reference it. A `$ref` to a step that resolved to `null` fails and rolls the plan back:

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

If an earlier step deletes a row whose deletion cascades in the database to rows a later step depends on, the plan is refused before any statement runs, with `A2004` and the issue `V1019`:

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

The same plan runs under one layer's rules, chosen by the builder:

| Builder | Runs under | Used from |
|---|---|---|
| `avClient.tx` + `avClient.transaction([...])` | the client layer, over HTTP | the frontend |
| `framework.clientTx` + `framework.transaction([...])` | the client layer, in process | your server code, when it should be limited like a remote caller |
| `framework.appTx` + `framework.transaction([...])` | the application layer, in process | trusted server code |

The client layer's restrictions and limits apply to a client plan. Pipelines run for every step, with that step's own context: a guard that requires a token is evaluated per step, and a failure carries `operation: <index>`.

## From server-side code

```ts
const user = this.framework.appTx.User.create.one({ data: { email: "srv@example.com" }, select: ["id"] });
const post = this.framework.appTx.Post.create.one({ data: { title: "srv", authorId: user.$ref("id") } });

const result = await this.framework.transaction([user, post], { requestId: "tx-1" });

result.code;   // "A1009" (TRANSACTION_COMMITTED)
result.data;   // [ { id: 5 }, { authorId: 5, bigViews: 0n, body: null, categoryId: null, id: 9, price: Decimal {}, publishedAt: null, title: 'srv', views: 0 } ]
```

Server-side, `framework.transaction` returns an envelope and does not throw for a failed plan. A failure answers the failing step's code with `cause.operation`:

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
