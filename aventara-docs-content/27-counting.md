---
title: Counting
description: Count matching rows with find.count, count what a bulk write touched, and count or page related rows with the $count reducer.
order: 27
section: guides
---

# Counting

There are two kinds of count. **Count variants** (`find.count`, `create.count`, `update.count`, `delete.count`) return a number instead of rows. The **`$count` reducer** counts the related rows of a to-many relation inside a normal read.

## Count variants

Every count variant takes no `select` or `include`; it returns a plain number.

| Call | Takes | Returns |
|---|---|---|
| `find.count({ where? })` | a filter | how many rows match |
| `create.count({ data: [...] })` | an array of records | how many were created |
| `update.count({ where?, data })` | a filter and the change | how many were updated |
| `delete.count({ where? })` | a filter | how many were deleted |

```ts
await avClient.User.find.count({ where: { role: "USER" } });
// 2     (of 3 users)

await avClient.Category.create.count({ data: [{ name: "A1" }, { name: "A2" }] });
// 2

await avClient.Post.update.count({ where: { views: { lt: 5 } }, data: { views: { $increment: 1 } } });
// 2      (the number of rows matched and updated)

await avClient.Category.delete.count({ where: { name: { startsWith: "A" } } });
// 2
```

Use them instead of `*.many` when you only need the number: nothing is loaded and no rows travel. Over HTTP the number is the envelope's `data`:

```json
{"data":3,"code":"A1000","cause":null}
```

Their codes follow the family: `find.count` answers `A1000`, `create.count` `A1003`, `update.count` `A1005`, `delete.count` `A1007`. With no match, `find.count` is `0`, and so are the bulk writes.

A count variant is a separate operation: a [restriction](/docs/restricting-operations) can switch it off independently (`find: { count: false }`), and `update.count` can fail like any update (a unique-constraint conflict is `A2008`).

## The `$count` reducer

`$count` is **not a field**: it is a reducer you list in a to-many relation's `select`. Its presence changes the shape of that relation's result:

| Nested `select` | Result |
|---|---|
| `["id", "title"]` | `{ id, title }[]` |
| `["$count"]` | `{ count: number }` |
| `["id", "title", "$count"]` | `{ data: { id, title }[]; count: number }` |

```ts
await avClient.User.find.many({
  select: ["id", { posts: { select: ["$count"] } }],
  orderBy: { id: "asc" },
});
// [ { id: 1, posts: { count: 2 } }, { id: 2, posts: { count: 3 } }, { id: 3, posts: { count: 1 } } ]
```

Combine rows and total in one round trip. When the relation has a `where` and pagination, `count` is the **total matching rows before `limit` and `offset`**, and `data` is the page. That is what a "showing 1 of N" list needs:

```ts
await avClient.User.find.many({
  select: ["id", { posts: { select: ["id", "$count"], where: { views: { gt: 5 } }, limit: 1, orderBy: { id: "asc" } } }],
  orderBy: { id: "asc" },
});
// [ { id: 1, posts: { data: [ { id: 1 } ], count: 1 } },
//   { id: 2, posts: { data: [ { id: 3 } ], count: 2 } },       // 2 posts match, 1 returned
//   { id: 3, posts: { data: [ { id: 6 } ], count: 1 } } ]
```

With `include`, a relation can be given the reducer in the same object form; the parent still returns its default scalars:

```ts
await avClient.User.find.many({ include: [{ posts: { select: ["$count"] } }], limit: 1 });
// [ { ..., id: 1, posts: { count: 2 } } ]
```

### Order by a count

To sort parents by how many related rows they have, use `orderBy` with `$count` ([Filtering, sorting and paging](/docs/filtering-sorting-paging#ordering-by-a-relation)):

```ts
await avClient.User.find.many({ orderBy: { posts: { $count: "desc" } }, select: ["id"] });
```

### Availability

`$count` is advertised per relation in the contract, under `capabilities.reducers`. It applies to to-many relations, and a restriction can remove it (`restrictions.<Resource>.fields.<relation>.capabilities.reducers`).

## See also

- [Relations and nested writes](/docs/relations-and-nested-writes)
- [Filtering, sorting and paging](/docs/filtering-sorting-paging)
- [Querying](/docs/querying): the argument reference.
