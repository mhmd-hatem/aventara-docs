---
title: Resources and operations
description: Every operation family and variant Aventara offers on a Resource, what each selects by and returns, which are not offered, with an example of each.
order: 12
section: concepts
---

# Resources and operations

A Resource is a thing your API serves: one per Prisma model, keyed by the model name as written (`User`, `Post`, `Category`). A Resource has fields (scalars with a type and the filters, ordering and writes each supports; relations, one or many, pointing at another Resource), identifiers (the unique selectors, such as `id` or `email`, that `unique` operations accept) and operations.

Operations come from a fixed set of five families, each with variants. The meaning of an operation is set by the protocol; configuration can switch an operation off for a Resource or a layer, never redefine it. Only what the contract advertises exists.

The examples use the generated client on this schema: a `User` with `email` (unique), `name?`, `role`, `createdAt` and many `posts`; a `Post` with `title`, `views`, `published`, `meta` (JSON) and an author; and a `Category`.

## Families and variants

| Family | `first` | `unique` | `many` | `count` | `one` |
|---|---|---|---|---|---|
| `find` | yes | yes | yes | yes | |
| `create` | | | yes | yes | yes |
| `update` | yes | yes | yes | yes | |
| `delete` | yes | yes | not offered | yes | |
| `upsert` | | yes | | | |

| Variant | Selects by | Returns |
|---|---|---|
| `first` | a general `where`, with an optional `orderBy` that decides which | the record, or `null` when nothing matches |
| `unique` | an identifier | the record; a miss is an error (`A2003`) |
| `many` | a general `where` | a list (possibly empty) |
| `count` | a general `where` | a number |
| `one` | one `data` object | the created record |

Reads and writes both take an optional projection: `select` (exactly these fields) or `include` (default fields plus these relations), never both. `count` variants take none. See [Results and typing](/docs/results-and-typing) for what the types do with it, and [Querying](/docs/querying) for the full argument tables.

## find

```ts
// first: a miss is null, not an error
const maybe = await avClient.User.find.first({ where: { email: "nobody@example.com" } });   // null

// unique: by identifier; a miss throws NotFoundError (A2003)
const ada = await avClient.User.find.unique({
  where: { email: "ada@example.com" },
  select: ["id", "email", "role"],
});
// { id: 1, email: "ada@example.com", role: "USER" }

// many: a list
const admins = await avClient.User.find.many({
  where: { role: "ADMIN" },
  orderBy: { id: "desc" },
  limit: 20,
  select: ["id", "email"],
});

// count: a number
const total = await avClient.User.find.count({ where: { role: "USER" } });   // 2
```

## create

```ts
// one
const user = await avClient.User.create.one({
  data: { email: "ada@example.com", name: "Ada", passwordHash: "..." },
  select: ["id", "email", "createdAt"],
});
// { id: 1, email: "ada@example.com", createdAt: Date }

// many: returns the created records
const created = await avClient.User.create.many({
  data: [
    { email: "b@example.com", passwordHash: "..." },
    { email: "c@example.com", passwordHash: "...", role: "ADMIN" },
  ],
  select: ["id", "email"],
});
// [{ id: 2, email: "b@example.com" }, { id: 3, email: "c@example.com" }]

// count: creates and returns only how many
const n = await avClient.Category.create.count({ data: [{ name: "news" }, { name: "tips" }] });   // 2
```

A relation can be written inline with a nested directive:

```ts
await avClient.Post.create.one({
  data: { title: "Hello", author: { $connect: { id: 1 } }, categories: { $connect: [{ name: "news" }] } },
});
await avClient.User.create.one({
  data: { email: "n@example.com", passwordHash: "...", posts: { $create: { title: "first post" } } },
  select: ["id", { posts: { select: ["title"] } }],
});
// { id: 6, posts: [{ title: "first post" }] }
```

## update

```ts
// first: a miss is null. `orderBy` decides which match is "first"
await avClient.User.update.first({
  where: { role: "USER" }, orderBy: { id: "asc" },
  data: { name: "First user" }, select: ["id", "name"],
});
// { id: 1, name: "First user" }

// unique: by identifier; a miss is NotFoundError
await avClient.User.update.unique({ where: { id: 1 }, data: { name: "Ada L." }, select: ["id", "name"] });

// many: updates every match, returns the updated records
await avClient.Post.update.many({
  where: { published: true },
  data: { views: { $increment: 1 } },
  select: ["id", "views"],
});
// [{ id: 1, views: 1 }]

// count: returns how many were updated
const updated = await avClient.Post.update.count({ where: { published: true }, data: { views: { $multiply: 2 } } });   // 1
```

A plain value in `data` assigns. An object with a `$` key acts on the current value: `$increment`, `$decrement`, `$multiply`, `$divide` on numbers, `$push` on lists where the database allows it.

## delete

```ts
// first: deletes the first match, returns it, or null
await avClient.Category.delete.first({ where: { name: "tips" }, select: ["id", "name"] });   // { id: 2, name: "tips" }

// unique: by identifier; a miss is NotFoundError
await avClient.Category.delete.unique({ where: { name: "news" } });

// count: deletes every match, returns how many
const removed = await avClient.Category.delete.count({ where: { name: "zzz" } });            // 0
```

## upsert

`upsert.unique` finds a record by identifier, updates it if it exists, and creates it otherwise:

```ts
await avClient.User.upsert.unique({
  where: { email: "d@example.com" },
  create: { email: "d@example.com", passwordHash: "..." },
  update: { name: "D" },
  select: ["id", "email", "name"],
});
// { id: 4, email: "d@example.com", name: null }
```

## What is not offered, and why

| Not offered | Why, and what to use |
|---|---|
| `delete.many` | The Prisma 7 adapter cannot return the deleted rows, and Aventara does not emulate it. Use `delete.count` to delete a filtered set. |
| A to-many relation or `$count` at the top level of the projection of `update.many` or `create.many` | At the top level these variants project scalars and to-one relations only; a to-many nested inside an included to-one relation is allowed ([Bulk variants differ](/docs/operations-reference#bulk-variants-differ)). The request fails with `A2004` (`V1008`: `Relation "posts" is not available for select.`; `include` is refused the same way, while a to-one relation such as `author` works in either). Read to-many relations with a separate `find`. |

Two behaviors to keep in mind:

- `update.first` and `delete.first` run as a read followed by a write inside one transaction. The record written is one the read selected, or nothing is written and you get `A2014`. If correctness depends on the record still being the first match at the instant of the write, select it yourself and use `update.unique` or `delete.unique`.
- Whether a variant is available is decided in two steps: the adapter advertises what it can perform faithfully, then your `restrictions.<Resource>.operations` switch some off. The result is in the contract:

```json
"operations": {
  "create": { "count": {"write":"bulkWrite"}, "many": {"projection":"bulkWrite","write":"bulkWrite"}, "one": true },
  "delete": { "count": true, "first": true, "unique": true },
  "find":   { "count": true, "first": true, "many": true, "unique": true },
  "update": { "count": {"write":"bulkWrite"}, "first": true, "many": {"projection":"bulkWrite","write":"bulkWrite"}, "unique": true },
  "upsert": { "unique": true }
}
```

## Success codes

| Family and variant | Code | HTTP |
|---|---|---|
| `find.*` | `A1000` (`A1001` when a `first` finds nothing) | 200 |
| `create.one` | `A1002` | 201 |
| `create.many`, `create.count` | `A1003` | 201 |
| `update.first`, `update.unique` | `A1004` | 200 |
| `update.many`, `update.count` | `A1005` | 200 |
| `delete.first`, `delete.unique` | `A1006` | 200 |
| `delete.count` | `A1007` | 200 |
| `upsert.unique` | `A1008` | 200 |

See the [HTTP protocol](/docs/http-protocol#codes) for the failure codes.

## See also

- [Results and typing](/docs/results-and-typing)
- [Querying](/docs/querying)
- [Transactions](/docs/transactions)
- [Contract layers](/docs/contract-layers)
- Guides: [Restricting operations](/docs/restricting-operations), [Filtering, sorting and paging](/docs/filtering-sorting-paging), [Relations and nested writes](/docs/relations-and-nested-writes), [Counting](/docs/counting)
