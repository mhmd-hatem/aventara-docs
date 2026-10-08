---
title: Querying
description: Filters, select and include, ordering, pagination, counts, nested writes and readonly results - from the frontend client or from server-side code.
order: 6
section: guides
---

# Querying

The query language is the same in the generated client, over HTTP and in server-side code. The examples use the frontend client (`avClient`) on a schema with `User` and `Post` (a user has many posts). Over HTTP the arguments are the JSON body of the request. See [HTTP protocol](/docs/http-protocol).

The task guides go deeper than this page:

| Topic | Guide |
|---|---|
| Operators, `AND`/`OR`/`NOT`, relation filters, `orderBy`, `limit`/`offset`/`cursor` | [Filtering, sorting and paging](/docs/filtering-sorting-paging) |
| `select`, `include`, nested writes | [Relations and nested writes](/docs/relations-and-nested-writes) |
| `find.count`, `$count` | [Counting](/docs/counting) |
| Calling operations from Nest services | [Server-side usage](/docs/server-side-usage) |
| Dates, big integers, decimals, enums | [Enums and scalar types](/docs/enums-and-scalars) |


## Operation arguments

| Operation | Arguments |
|---|---|
| `find.first` | `where?`, `orderBy?`, `select?` or `include?` |
| `find.unique` | `where` (an identifier), `select?` or `include?` |
| `find.many` | `where?`, `orderBy?`, `limit?`, `offset?`, `cursor?`, `select?` or `include?` |
| `find.count` | `where?` |
| `create.one` | `data`, `select?` or `include?` |
| `create.many` | `data` (an array), `select?` or `include?` |
| `create.count` | `data` (an array) |
| `update.first` | `where?`, `orderBy?`, `data`, `select?` or `include?` |
| `update.unique` | `where` (an identifier), `data`, `select?` or `include?` |
| `update.many` | `where?`, `data`, `select?` or `include?` |
| `update.count` | `where?`, `data` |
| `delete.first` | `where?`, `orderBy?`, `select?` or `include?` |
| `delete.unique` | `where` (an identifier), `select?` or `include?` |
| `delete.count` | `where?` |
| `upsert.unique` | `where` (an identifier), `create`, `update`, `select?` or `include?` |

`select` and `include` are mutually exclusive. `count` variants take no projection. `create.many` and `update.many` accept `select` and `include` for scalars and to-one relations only; a to-many relation at the top level there answers `V1008` (a to-many nested inside an included to-one relation is allowed; see [Bulk variants differ](/docs/operations-reference#bulk-variants-differ)). Reads (`find.first`, `find.unique`, `find.many`) accept both for to-one and to-many relations. A call with no arguments is `{}` over HTTP.

## where

A plain value is equality. Keys at one level are ANDed. `AND`, `OR` and `NOT` nest.

```ts
await avClient.User.find.many({ where: { email: "ada@example.com" } });          // equality
await avClient.User.find.many({ where: { name: null } });                        // IS NULL
await avClient.Post.find.many({ where: { views: { gte: 3, lte: 5 } } });         // operators
await avClient.User.find.many({
  where: {
    OR: [
      { id: { in: [1, 2] } },
      { posts: { some: { title: { startsWith: "n" } } } },                     // relation filter
    ],
  },
});
```

Filter operators depend on the field's type, and only advertised ones are accepted. Common ones: `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`. A restriction can remove operators from a field ([Configuration](/docs/configuration#restrictions)).

Relation filters: a to-one relation takes a nested `where` directly (`{ author: { name: { contains: "A" } } }`) or `null`; a to-many relation takes `some`, `every` or `none`.

`find.unique`, `update.unique`, `delete.unique` and `upsert.unique` take an identifier as `where`: `{ id: 1 }` or `{ email: "ada@example.com" }`.

## select and include

With neither, you get every readable scalar field and no relations.

```ts
await avClient.User.find.many({ select: ["id", "email"] });                       // only these
await avClient.User.find.many({ include: ["posts"] });                            // default scalars + posts
await avClient.User.find.many({
  select: [
    "id",
    { posts: { select: ["id", "title"], orderBy: { id: "desc" }, limit: 3 } },    // customized relation
  ],
});
```

A relation named as a string uses the target's default projection. A customized relation must use object form (`{ posts: { select: [...] } }`); `posts: ["id"]` is not valid.

### $count

`$count` is a reducer on a to-many relation, not a field. It changes the shape of the relation's result:

| Nested `select` | Result |
|---|---|
| `["id", "title"]` | `{ id, title }[]` |
| `["$count"]` | `{ count: number }` |
| `["id", "title", "$count"]` | `{ data: { id, title }[]; count: number }` |

```ts
const users = await avClient.User.find.many({
  where: { name: { contains: "A" } },
  select: ["id", "email", { posts: { select: ["id", "title", "$count"] } }],
});
// [{ id: 1, email: "ada@example.com", posts: { data: [{ id: 1, title: "Hello" }], count: 1 } }]
```

When the nested relation has a `where` and pagination, `count` is the total matching rows before `limit`/`offset`; `data` is the page. See [Counting](/docs/counting).

## orderBy

```ts
orderBy: { name: "asc" }
orderBy: [{ name: "asc" }, { id: "desc" }]                      // array order is precedence
orderBy: { name: { sort: "asc", nulls: "last" } }               // nullable fields only
```

## Pagination

`limit` and `offset` page through results (`offset = (page - 1) * limit`). The server caps `limit` at `maxListLimit` (250 by default; `A2009` when exceeded).

For cursor pagination, give `cursor` and an explicit `orderBy` that includes a unique tie-breaker (a complete identifier). Aventara does not add one for you:

```ts
await avClient.User.find.many({ orderBy: [{ id: "asc" }], limit: 2, cursor: { id: 1 }, select: ["id"] });
// [ { id: 1 }, { id: 2 } ]   the cursor row itself is included
```

Nested to-many pagination is applied per parent row. More in [Filtering, sorting and paging](/docs/filtering-sorting-paging#paging).

## Counting

```ts
const total = await avClient.User.find.count({ where: { name: { contains: "A" } } });  // number
```

## Writing

```ts
const user = await avClient.User.create.one({ data: { email: "ada@example.com", name: "Ada" } });

await avClient.User.update.unique({ where: { id: 1 }, data: { name: "Ada L." } });

// Scalar directives: a plain value assigns; an object with a $-key acts on the current value.
await avClient.Post.update.many({ where: { authorId: 1 }, data: { views: { $increment: 1 } } });

await avClient.User.upsert.unique({
  where: { email: "b@example.com" },
  create: { email: "b@example.com" },
  update: { name: "B" },
});

const deleted = await avClient.Post.delete.unique({ where: { id: 1 } });
const n = await avClient.Post.update.count({ where: { views: { gte: 0 } }, data: { views: { $increment: 1 } } });  // number
```

Scalar directives: `$increment`, `$decrement`, `$multiply`, `$divide` on numbers, `$push` on lists (provider permitting).

### Nested writes

Inside `create` and `update` data, a relation takes directives:

| Directive | Meaning |
|---|---|
| `$create` | Create related records and link them. |
| `$connect` | Link existing records, by identifier. |
| `$connectOrCreate` | Link if found, otherwise create. |
| `$disconnect` | Unlink without deleting. |
| `$set` | Make the relation exactly this set. |
| `$update` / `$delete` | Update / delete every related record matching a `where` (to-many requires `where`). |
| `$upsert` | Update the match, otherwise create. |

```ts
// create a Post and link it to an existing User
await avClient.Post.create.one({ data: { title: "Hello", author: { $connect: { id: 1 } } } });

// create a related Post while updating a User, and read it back
await avClient.User.update.unique({
  where: { id: 1 },
  data: { posts: { $create: { title: "nested" } } },
  select: ["id", { posts: { select: ["title"], orderBy: { id: "desc" }, limit: 1 } }],
});
```

Which directives a relation accepts is part of the contract, and can be narrowed with restrictions. Directives never apply to reads. See [Relations and nested writes](/docs/relations-and-nested-writes).

### Strict versus first-style misses

| Operation | When nothing matches |
|---|---|
| `find.first`, `update.first`, `delete.first` | Resolves to `null` (`A1001`). |
| `find.unique`, `update.unique`, `delete.unique` | Throws `NotFoundError` (`A2003`). |
| `find.many` | `[]`. |
| `find.count` | `0`. |

## Readonly results

Result types are `readonly`: a record returned by the client or by server-side calls cannot be mutated in place without a TypeScript error. Build a new object instead.

## Running operations on the server

Inside your NestJS code you can run the same operations directly, with no HTTP. Inject the framework ([NestJS host](/docs/nestjs-host#injecting-the-framework)) and call it through one of two layers:

- `framework.application.<Resource>.<family>.<variant>(args, options?)` runs as application code (trusted; the application layer's configuration).
- `framework.client.<Resource>.<family>.<variant>(args, options?)` runs under the client layer's rules (the same restrictions and limits a remote caller gets).

```ts
const result = await framework.application.User.find.many(
  { select: ["id", "email"] },
  { requestId: "job-42" },
);

result.code;   // "A1000"
result.data;   // [{ id: 1, email: "..." }, ...]
result.cause;  // null, or { message, issues? } on failure
```

Unlike the generated client, server-side calls return the envelope (`{ data, code, cause }`) and do not throw for operation failures. Check `code`.

`ExecutionOptions` has one member, `requestId`: the correlation id the operation runs under (it reaches pipelines and diagnostics). When omitted, one is generated. See [Server-side usage](/docs/server-side-usage).

Pipelines run for both layers: root pipelines for every call, `application.pipelines` or `client.pipelines` for their own layer.

## See also

- [Filtering, sorting and paging](/docs/filtering-sorting-paging)
- [Relations and nested writes](/docs/relations-and-nested-writes)
- [Counting](/docs/counting)
- [Server-side usage](/docs/server-side-usage)
- [Transactions](/docs/transactions)
