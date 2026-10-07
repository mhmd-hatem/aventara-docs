---
title: Filtering, sorting and paging
description: The where operators, equality shorthand, AND/OR/NOT, relation filters, orderBy including relations, and limit, offset and cursor paging.
order: 25
section: guides
---

# Filtering, sorting and paging

Reads take `where`, `orderBy` and, for lists, `limit`, `offset` and `cursor`. The language is the same in the generated client, over HTTP and in server-side code. The examples use the frontend client on this data:

```text
User:  1 Ada Lovelace (ADMIN)   2 Grace Hopper   3 (no name)
Post:  1 Hello (views 10, published)        2 Notes on engines (3, published)
       3 Compilers (42)                     4 Navy stories (7, published)
       5 Draft (0)                          6 Enigma (100)
```

Arguments are validated against the contract before anything reaches the database: an operator the field does not offer is refused with `A2004`, never passed on.

## where

A plain value is **equality**. Keys at one level are ANDed.

```ts
await avClient.User.find.many({ where: { email: "ada@example.com" }, select: ["id", "email"] });
// [ { id: 1, email: 'ada@example.com' } ]

await avClient.User.find.many({ where: { name: null }, select: ["id", "email"] });          // IS NULL
// [ { id: 3, email: 'alan@example.com' } ]
```

### Operators

An object value uses operators. Which operators exist depends on the field's type, and only advertised ones are accepted:

| Field type | Operators |
|---|---|
| `Int`, `BigInt`, `Decimal`, `DateTime` | `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte` |
| `String` | the above plus `contains`, `startsWith`, `endsWith` |
| enum | `equals`, `not`, `in`, `notIn` |
| `Json` | `equals`, `not`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayStartsWith`, `arrayEndsWith`, `mode` |

The contract's `fields.<name>.capabilities.filter` lists the exact set for each field. A [restriction](/docs/exposing-and-hiding-fields) can shrink it.

```ts
await avClient.Post.find.many({ where: { views: { gte: 3, lte: 10 } }, select: ["id", "title", "views"] });
// [ { id: 1, title: 'Hello', views: 10 }, { id: 2, title: 'Notes on engines', views: 3 }, { id: 4, title: 'Navy stories', views: 7 } ]

await avClient.Post.find.many({ where: { id: { in: [1, 2] } }, select: ["id"] });
// [ { id: 1 }, { id: 2 } ]

await avClient.Post.find.many({ where: { views: { not: 0 } }, select: ["id", "views"] });   // five rows: Draft is out
```

An operator the field does not have:

```ts
await avClient.Post.find.many({ where: { views: { contains: "x" } } });
// ValidationError A2004: { path: ["arguments","where","views","contains"], code: "V1006",
//   message: 'Filter operator "contains" is not available on field "views".' }
```

String matching (`contains`, `startsWith`, `endsWith`) uses the database's own comparison. On SQLite it is case-insensitive for ASCII (`contains: "NOTES"` finds "Notes on engines"); on PostgreSQL it is case-sensitive. Test the behavior on the database you deploy to.

### Dates, decimals and big integers

Filter with the application values; the client encodes them. **A plain `Date` is equality**, the same shorthand as any other scalar:

```ts
await avClient.Post.find.many({ where: { publishedAt: new Date("2026-01-15T10:00:00.000Z") }, select: ["id", "publishedAt"] });
// [ { id: 1, publishedAt: 2026-01-15T10:00:00.000Z } ]

await avClient.Post.find.many({ where: { publishedAt: { gte: new Date("2026-02-01T00:00:00.000Z") } }, select: ["id"] });
// ids 2 and 4

await avClient.Post.find.many({ where: { publishedAt: null }, select: ["id", "title"] });   // ids 3, 5, 6
await avClient.Post.find.many({ where: { price: { gt: "5" } }, select: ["id"] });           // ids 1, 2, 6
await avClient.Post.find.many({ where: { bigViews: 9007199254740993n }, select: ["id"] });  // id 1
```

Over HTTP the same values are strings: `{"publishedAt":"2026-01-15T10:00:00.000Z"}`, `{"price":{"gt":"5"}}`, `{"bigViews":"9007199254740993"}`. A date must be canonical UTC (`2026-01-15T10:00:00.000Z`): `"2026-01-15"` answers `V1003` ("Value must use canonical ISO-8601 UTC encoding."). See [Enums and scalar types](/docs/enums-and-scalars).

### Enums

```ts
await avClient.User.find.many({ where: { role: "ADMIN" }, select: ["id", "role"] });
// [ { id: 1, role: 'ADMIN' } ]
await avClient.User.find.many({ where: { role: { in: ["ADMIN", "USER"] } }, select: ["id"] });   // all three
```

### AND, OR, NOT

`AND` and `OR` take an array of conditions; `NOT` takes one condition object. They nest, and may sit beside ordinary keys.

```ts
await avClient.Post.find.many({
  where: {
    AND: [{ views: { gt: 0 } }, { NOT: { title: { startsWith: "N" } } }],
    OR: [{ publishedAt: null }, { views: { gte: 40 } }],
  },
  select: ["id", "title", "views"],
});
// [ { id: 3, title: 'Compilers', views: 42 }, { id: 6, title: 'Enigma', views: 100 } ]
```

A `where` tree has a limit on its nodes (`maxBooleanNodes`, 50 by default): over it the call fails with `A2009` / `V1015`. See [Limits and safety](/docs/limits-and-safety).

### Filtering through relations

A **to-one** relation takes a nested `where` directly, or `null` for "has none". A **to-many** relation takes `some`, `every` or `none`.

```ts
await avClient.Post.find.many({ where: { author: { name: { contains: "Grace" } } }, select: ["id", "title"] });
// Compilers, Navy stories, Draft

await avClient.Post.find.many({ where: { category: null }, select: ["id", "title"] });
// Navy stories, Draft

await avClient.User.find.many({ where: { posts: { some: { views: { gt: 40 } } } }, select: ["id", "email"] });
// [ { id: 3, email: 'alan@example.com' }, { id: 2, email: 'grace@example.com' } ]

await avClient.User.find.many({ where: { posts: { every: { views: { gt: 5 } } } }, select: ["id"] });
// [ { id: 3 } ]
```

### Identifiers

`find.unique`, `update.unique`, `delete.unique` and `upsert.unique` take an **identifier** as `where`: the primary key (`{ id: 1 }`) or a unique column (`{ email: "ada@example.com" }`), not a filter. A miss throws `NotFoundError` (`A2003`).

## orderBy

```ts
await avClient.Post.find.many({ orderBy: [{ views: "desc" }, { id: "asc" }], select: ["id", "views"], limit: 3 });
// [ { id: 6, views: 100 }, { id: 3, views: 42 }, { id: 1, views: 10 } ]
```

An array is precedence order. A nullable field can say where nulls go:

```ts
await avClient.User.find.many({ orderBy: { name: { sort: "asc", nulls: "last" } }, select: ["id", "name"] });
// [ { id: 1, name: 'Ada Lovelace' }, { id: 2, name: 'Grace Hopper' }, { id: 3, name: null } ]
```

### Ordering by a relation

By a field of a to-one relation, or by the **count** of a to-many relation:

```ts
await avClient.Post.find.many({ orderBy: [{ author: { email: "desc" } }, { id: "asc" }], select: ["id", "title"] });
// ids 3, 4, 5 (Grace), 6 (alan), 1, 2 (Ada)

await avClient.User.find.many({ orderBy: { posts: { $count: "desc" } }, select: ["id", "email"] });
// [ { id: 2, ... grace }, { id: 1, ... ada }, { id: 3, ... alan } ]
```

A field that a restriction marked `order: false` is refused with `V1006` ("Ordering is not available on field ...").

## Paging

| Argument | Meaning |
|---|---|
| `limit` | How many rows to return. Capped by `maxListLimit` (250 by default). |
| `offset` | How many rows to skip. |
| `cursor` | Start at this row (an identifier), inclusive. Needs an explicit `orderBy`. |

`find.many` has no default `limit`: ask for what you need. Over the cap the call fails with `A2009` / `V1014`:

```ts
await avClient.Post.find.many({ limit: 1000 });
// ValidationError A2009: { path: ["arguments","limit"], code: "V1014", message: "limit exceeds maxListLimit (250)." }
```

### limit and offset

```ts
await avClient.Post.find.many({ orderBy: { id: "asc" }, limit: 2, offset: 2, select: ["id"] });
// [ { id: 3 }, { id: 4 } ]        page = (offset / limit) + 1
```

Always give an `orderBy` when you page: without one the database may return rows in any order.

### Cursor paging

`cursor` starts at a row identified by its unique key, **including** that row. Combine it with an `orderBy` that ends in a **unique tie-breaker** (a complete identifier such as `id`). Aventara does not add one for you, and refuses a cursor without an explicit order:

```ts
await avClient.Post.find.many({ orderBy: [{ id: "asc" }], limit: 2, cursor: { id: 3 }, select: ["id"] });
// [ { id: 3 }, { id: 4 } ]

await avClient.Post.find.many({ limit: 2, cursor: { id: 3 }, select: ["id"] });
// ValidationError A2004: { path: ["arguments","cursor"], code: "V1009",
//   message: "Cursor pagination requires an object cursor and explicit deterministic orderBy." }
```

To fetch the next page, ask for one extra row (`limit: pageSize + 1`) and use its id as the next cursor, or start after the last row with `offset: 1`:

```ts
await avClient.Post.find.many({ orderBy: [{ id: "asc" }], limit: 2, cursor: { id: 3 }, offset: 1, select: ["id"] });
// [ { id: 4 }, { id: 5 } ]
```

Nested to-many relations page too (`limit`, `offset` inside the relation's selection), applied **per parent row**. See [Relations and nested writes](/docs/relations-and-nested-writes).

## First, unique and many

| Call | When nothing matches |
|---|---|
| `find.many` | `[]` |
| `find.first` | `null` |
| `find.unique` | throws `NotFoundError` (`A2003`) |

`find.first` takes `where` and `orderBy`, and returns the first match: `find.first({ where: { views: { gt: 5 } }, orderBy: { views: "desc" }, select: ["id", "views"] })` returns `{ id: 6, views: 100 }`.

## Counting

To count what a filter matches, use `find.count` with the same `where` ([Counting](/docs/counting)).

## See also

- [Counting](/docs/counting)
- [Relations and nested writes](/docs/relations-and-nested-writes)
- [Limits and safety](/docs/limits-and-safety)
- [Querying](/docs/querying): the argument reference for every operation.
