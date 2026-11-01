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

A plain value is equality. Keys at one level are ANDed.

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
| `String` | the above plus `contains`, `startsWith`, `endsWith`, `mode` |
| enum | `equals`, `not`, `in`, `notIn` |
| `Json` | `equals`, `not`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayStartsWith`, `arrayEndsWith`, `mode`, and `path` where the adapter offers it |

The contract's `fields.<name>.capabilities.filter` lists the exact set for each field. [Exposure](/docs/exposing-and-hiding-fields) can shrink it, and the types follow: in the generated client and in server-side calls, an operator the field does not offer is a compile error.

```ts
await avClient.Post.find.many({ where: { views: { gte: 3, lte: 10 } }, select: ["id", "title", "views"] });
// [ { id: 1, title: 'Hello', views: 10 }, { id: 2, title: 'Notes on engines', views: 3 }, { id: 4, title: 'Navy stories', views: 7 } ]

await avClient.Post.find.many({ where: { id: { in: [1, 2] } }, select: ["id"] });
// [ { id: 1 }, { id: 2 } ]

await avClient.Post.find.many({ where: { views: { not: 0 } }, select: ["id", "views"] });   // five rows: Draft is out
```

### `not` with operators

`not` takes a value (`not: 0`, `not: null`: equality negated) or an object of operators, which it negates as a whole:

```ts
await avClient.Post.find.many({ where: { views: { not: { gt: 2, lte: 5 } } } });          // views outside (2, 5]
await avClient.Post.find.many({ where: { title: { not: { contains: "draft", mode: "insensitive" } } } });
await avClient.Post.find.many({ where: { meta: { not: { equals: { label: "Draft" } } } } });   // a Json object under not needs equals
```

A row where the object cannot be decided (a `NULL` column, a missing Json `path`, a Json value of another kind) matches neither the object nor its `not`, the way SQL's `NOT` works. So `not: { contains: "x" }` leaves out rows whose title is `NULL`; add `{ title: null }` in an `OR` if you want them.

Each filter object stands alone: a `mode` or `path` applies only to the operators beside it in the same object. Inside a `not`, write them inside the `not`. A `mode` or `path` with no operator beside it, or next to only a `not`, is refused with `A2004` and `V1001` at that key and is a type error:

```ts
await avClient.Post.find.many({ where: { title: { mode: "insensitive", not: { contains: "x" } } } });
// AvValidationError A2004: { path: ["arguments","where","title","mode"], code: "V1001",
//   message: 'mode on field "title" qualifies no operator: write it next to the operator it applies to (inside "not" to apply to a negated one).' }
await avClient.Post.find.many({ where: { title: { not: { contains: "x", mode: "insensitive" } } } });   // the rewrite
```

An operator the field does not have:

```ts
await avClient.Post.find.many({ where: { views: { contains: "x" } } });
// type error; at runtime: AvValidationError A2004: { path: ["arguments","where","views","contains"], code: "V1006",
//   message: 'Filter operator "contains" is not available on field "views".' }
```

### `undefined` in a filter

A filter never leaves a value out. `undefined` anywhere in a `where` (at any depth, in `AND`/`OR`/`NOT`, a relation filter or an operator such as `equals`), in a unique selector or in a `cursor` is refused with `A2004` and `V1001` at that path (a server-side call says `Value must not be undefined: it would be left out, and the request would reach more rows.`; the generated client says the same, `sent as JSON it would be left out`), and so is a `where`, `cursor`, `limit` or `offset` key whose value is `undefined` (`V1007` for the `where` of a `.unique` variant, `V1009` for a `cursor`). The generated client refuses it before sending, so the request never reaches the server; server-side calls refuse it the same way. Without this, `where: { id: user?.id }` with no user would match every row. Leave the `where` key out when you mean every row.

```ts
await avClient.Post.update.many({ where: { id: undefined }, data: { views: 0 } });
// AvValidationError A2004, nothing sent: { path: ["arguments","where","id"], code: "V1001" }
```

In write `data`, `undefined` means the opposite: the field is not sent ([Pipeline context](/docs/pipeline-context#typed-arguments)).

### `null` in a filter

Only equality takes a `null`: `equals: null` and `not: null` (and the plain `field: null` shorthand) match the rows where a nullable field is unset or set. Every other operator has no `null` meaning, so a literal `null` there (`gt`, `lt`, `contains`, `in`, `has`, `mode`, `isEmpty`, `path`, a JSON `string*` operator and the rest) is refused before the database is asked, with `A2004` and `V1001` at that operator, and it is a type error in the typed calls. On a field that is not nullable, `equals: null` is refused the same way:

```ts
await avClient.Post.find.many({ where: { views: { gt: null } } });
// AvValidationError A2004 (422): { path: ["arguments","where","views","gt"], code: "V1001", message: "Value must be non-null." }
await avClient.Post.find.many({ where: { title: { contains: null } } });   // the same, at ["arguments","where","title","contains"]
await avClient.Post.find.many({ where: { id: { in: null } } });            // the same, at ["arguments","where","id","in"]
await avClient.Post.find.many({ where: { categoryId: { not: null } }, select: ["id"] });   // fine: categoryId is nullable
```

A `NULL` row matches neither a filter nor its `not`, except `equals: null` and `not: null`, which test for it. (A `Json` field's `array*` operators take a JSON `null` as a value to look for.) On a `Json?` field, `field: null` and `equals: null` match every row that reads back `null`, whether the database holds `NULL` or a JSON `null`. With a `path` beside it, `equals: null` matches documents whose value at that path is a JSON `null`, and `not: null` matches documents where the path is set and not `null`; a document without the path matches neither. Without that up-front refusal, the same request would reach the database and answer `500 A3001`.

### Case: `mode`

String matching (`contains`, `startsWith`, `endsWith`, `equals` and the rest) takes a `mode` next to the operator:

| `mode` | Means |
|---|---|
| `"default"` (or no `mode`) | The database's own comparison. On SQLite it is case-insensitive for ASCII only (`contains: "NOTES"` finds "Notes on engines", but `"ä"` does not find `"Ä"`); on PostgreSQL it is case-sensitive. |
| `"sensitive"` | Case-sensitive, promised. |
| `"insensitive"` | Case-insensitive, promised, including non-ASCII letters. |

```ts
await avClient.User.find.many({ where: { email: { contains: "ada", mode: "insensitive" } } });
```

Not every database can keep every promise, so each field lists the modes it offers in the contract, `capabilities.filterModes` (and `pathFilterModes` for a `Json` field filtered at a `path`). `"default"` is always offered. With the Prisma 7 adapter, PostgreSQL offers all three on string fields and on `Json` at a `path`; a whole `Json` document offers `"default"` and `"sensitive"`. SQLite offers `"default"` only. A mode the field does not offer is a type error in the typed calls and is refused at runtime with `A2004` and `V1006` at the `mode` (`Filter mode "insensitive" is not available on field "email"`), before the database is asked. On PostgreSQL, `"sensitive"` relies on the column's collation: a `citext` column or a nondeterministic collation compares without case whatever the mode says.

### Operand types

Besides values, four operands take a fixed form: `mode` is one of `"default"`, `"sensitive"`, `"insensitive"`; `isEmpty` is a boolean; `path` is an array of strings (`["settings", "theme"]`); a `Json` field's `stringContains`, `stringStartsWith` and `stringEndsWith` take a string. Anything else is refused with `A2004` and `V1001` at that operand, and is a type error in the typed calls.

Text matching and the values you compare with are passed to the ORM as you wrote them; what they match is the database's own behavior. With Prisma 7, `%` and `_` in `contains`, `startsWith` and `endsWith` act as SQL wildcards on both databases, and a `Json` field's `string*` operators compare the JSON text of the value. When the database refuses a value (out of range, a NUL character on PostgreSQL), the call is answered `A2004` with the database's reason, not `500`.

#### Wildcards in `contains`, `startsWith` and `endsWith`

Filters pass through to Prisma unchanged, and Prisma does not escape them. In `contains`, `startsWith` and `endsWith`, `%` matches any run of characters and `_` matches any one character, so `contains: "50%"` also finds "500" and `contains: "a_b"` also finds "axb".

On PostgreSQL `\` is the escape character. To match `%` or `_` literally, write `\%` and `\_` (in a JavaScript string, `"50\\%"`); a literal backslash is `\\`. A pattern that ends in a lone `\` is refused with `A2004` and `V1001` (`The database refused this value: a text match cannot end with the escape character \.`). SQLite's `LIKE` has no escape character: there `\` is an ordinary character, and `%` and `_` cannot be escaped.

SQLite's `LIKE` also ignores ASCII case, so `contains: "abc"` matches "ABC" there but not on PostgreSQL. Use `mode` (above) when the case rule matters.

### Dates, decimals and big integers

Filter with the application values; the client encodes them. A plain `Date` is equality, the same shorthand as any other scalar:

```ts
await avClient.Post.find.many({ where: { publishedAt: new Date("2026-01-15T10:00:00.000Z") }, select: ["id", "publishedAt"] });
// [ { id: 1, publishedAt: 2026-01-15T10:00:00.000Z } ]

await avClient.Post.find.many({ where: { publishedAt: { gte: new Date("2026-02-01T00:00:00.000Z") } }, select: ["id"] });
// ids 2 and 4

await avClient.Post.find.many({ where: { publishedAt: null }, select: ["id", "title"] });   // ids 3, 5, 6
await avClient.Post.find.many({ where: { price: { gt: new AvDecimal("5") } }, select: ["id"] });   // ids 1, 2, 6
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

In a read, empty conditions keep the ORM's meaning, which can surprise: with Prisma 7, `NOT: {}` and `NOT: { AND: [] }` are no condition and match every row, `OR: []` matches nothing at the top level, and `{ AND: [{ OR: [] }] }` matches every row. Build `where` objects so an empty list or object never stands for "nothing".

A write refuses them, because there an empty node would change more rows than you asked for. In the `where` of `update.many`, `update.count`, `update.first`, `delete.count` and `delete.first`, and of a to-many `$update` or `$delete`, an empty `NOT: {}`, `AND: {}` or `AND: []`, `OR: []`, or an `AND`/`OR` entry `{}`, at any depth, is refused with `A2004` and a `V1001` issue at that node, and nothing runs:

```ts
await avClient.Post.delete.count({ where: { NOT: {} } });
// AvValidationError A2004, nothing deleted: { path: ["arguments","where","NOT"], code: "V1001" }
```

The issue's message is `A boolean node must hold a condition here: an empty one matches every row, and the write would reach more rows.`

A `where` that is `{}` itself still means every row, and so does leaving `where` out.

A `where` tree has a limit on its nodes (`maxBooleanNodes`, 50 by default): over it the call fails with `A2009` / `V1015`. See [Limits and safety](/docs/limits-and-safety).

### Filter types

`@aventara/core` exports the types of a `where`, so a helper can name them: `AvWhereInput` for a whole `where`, and `AvScalarFilterOperands` for one field's operators (`equals`, `contains`, `not`, ...), which a `not` holds again. [Server-side usage](/docs/server-side-usage#a-helper-that-takes-or-returns-arguments) shows how to use them in a helper.

### Filtering through relations

A to-one relation takes a nested `where` directly, or `null` for "has none". An empty nested `where`, such as `{ author: {} }`, matches the rows that have one, and its `NOT` the rows that have none. That is a real condition, so a write takes it too. A to-many relation takes `some`, `every` or `none`.

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

`find.unique`, `update.unique`, `delete.unique` and `upsert.unique` take an identifier as `where`: the primary key (`{ id: 1 }`) or a unique column (`{ email: "ada@example.com" }`), not a filter. A miss throws `AvNotFoundError` (`A2003`).

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

By a field of a to-one relation, or by the count of a to-many relation:

```ts
await avClient.Post.find.many({ orderBy: [{ author: { email: "desc" } }, { id: "asc" }], select: ["id", "title"] });
// ids 3, 4, 5 (Grace), 6 (alan), 1, 2 (Ada)

await avClient.User.find.many({ orderBy: { posts: { $count: "desc" } }, select: ["id", "email"] });
// [ { id: 2, ... grace }, { id: 1, ... ada }, { id: 3, ... alan } ]
```

A field whose `order` capability was taken away by [exposure](/docs/exposure) is refused with `V1006` ("Ordering is not available on field ...").

## Paging

| Argument | Meaning |
|---|---|
| `limit` | How many rows to return. Capped by `maxListLimit` (250 by default). |
| `offset` | How many rows to skip. |
| `cursor` | Start at this row (an identifier), inclusive. Needs an explicit `orderBy`. |

`find.many` has no default `limit`: ask for what you need. Over the cap the call fails with `A2009` / `V1014`:

```ts
await avClient.Post.find.many({ limit: 1000 });
// AvValidationError A2009: { path: ["arguments","limit"], code: "V1014", message: "limit exceeds maxListLimit (250)." }
```

### limit and offset

```ts
await avClient.Post.find.many({ orderBy: { id: "asc" }, limit: 2, offset: 2, select: ["id"] });
// [ { id: 3 }, { id: 4 } ]        page = (offset / limit) + 1
```

Always give an `orderBy` when you page: without one the database may return rows in any order.

### Cursor paging

`cursor` starts at a row, including that row. It holds exactly the fields you order by, with that row's values: order by `id` and the cursor is `{ id }`; order by `createdAt` then `id` and it is `{ createdAt, id }`. Combine it with an `orderBy` that ends in a unique tie-breaker (a complete identifier such as `id`). Aventara does not add one for you, and refuses a cursor without an explicit order:

```ts
await avClient.Post.find.many({ orderBy: [{ id: "asc" }], limit: 2, cursor: { id: 3 }, select: ["id"] });
// [ { id: 3 }, { id: 4 } ]

await avClient.Post.find.many({ limit: 2, cursor: { id: 3 }, select: ["id"] });
// AvValidationError A2004: { path: ["arguments","cursor"], code: "V1009",
//   message: "Cursor pagination requires an object cursor and explicit deterministic orderBy." }
```

To fetch the next page, ask for one extra row (`limit: pageSize + 1`) and use its id as the next cursor, or start after the last row with `offset: 1`:

```ts
await avClient.Post.find.many({ orderBy: [{ id: "asc" }], limit: 2, cursor: { id: 3 }, offset: 1, select: ["id"] });
// [ { id: 4 }, { id: 5 } ]
```

Nested to-many relations page too (`limit`, `offset` inside the relation's selection), applied per parent row. See [Relations and nested writes](/docs/relations-and-nested-writes).

## First, unique and many

| Call | When nothing matches |
|---|---|
| `find.many` | `[]` |
| `find.first` | `null` |
| `find.unique` | throws `AvNotFoundError` (`A2003`) |

`find.first` takes `where` and `orderBy`, and returns the first match: `find.first({ where: { views: { gt: 5 } }, orderBy: { views: "desc" }, select: ["id", "views"] })` returns `{ id: 6, views: 100 }`.

## Counting

To count what a filter matches, use `find.count` with the same `where` ([Counting](/docs/counting)).

## See also

- [Counting](/docs/counting)
- [Relations and nested writes](/docs/relations-and-nested-writes)
- [Limits and safety](/docs/limits-and-safety)
- [Querying](/docs/querying): the argument reference for every operation.
