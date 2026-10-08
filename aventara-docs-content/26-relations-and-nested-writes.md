---
title: Relations and nested writes
description: Read related records with select and include, and create, link, update and unlink them in one call with nested directives.
order: 26
section: guides
---

# Relations and nested writes

A Prisma relation (`User.posts`, `Post.author`, `Post.category`) is a field of its Resource. You read it by naming it in `select` or `include`, and write it with directives such as `$create` and `$connect`. The examples use `User` (has many `Post`), `Post` (belongs to a `User`, optionally to a `Category`) and `Category`.

## Reading relations

With neither `select` nor `include`, a call returns every readable scalar field and no relations.

### include

`include` adds relations to the default scalars:

```ts
await avClient.User.find.first({ where: { id: 3 }, include: ["posts"] });
// {
//   avatar: null, createdAt: 2026-10-06T22:58:25.885Z, email: 'alan@example.com', id: 3, name: null,
//   passwordHash: '', role: 'USER', settings: null,
//   posts: [ { authorId: 3, bigViews: 0n, body: null, categoryId: 1, id: 6, price: Decimal {},
//             publishedAt: null, title: 'Enigma', views: 100 } ]
// }
```

### select

`select` names exactly what you want, scalars and relations mixed. A relation named as a string uses the target's default scalars; to customize it, use the object form:

```ts
await avClient.Post.find.first({
  where: { id: 1 },
  select: ["id", "title", { category: { select: ["name"] } }],
});
// { id: 1, title: 'Hello', category: { name: 'News' } }

await avClient.User.find.many({
  select: [
    "id",
    "name",
    { posts: { select: ["id", "title"], where: { views: { gt: 5 } }, orderBy: { views: "desc" }, limit: 2 } },
  ],
});
// [ { id: 1, name: 'Ada Lovelace', posts: [ { id: 1, title: 'Hello' } ] },
//   { id: 2, name: 'Grace Hopper', posts: [ { id: 3, title: 'Compilers' }, { id: 4, title: 'Navy stories' } ] },
//   { id: 3, name: null, posts: [ { id: 6, title: 'Enigma' } ] } ]
```

A to-many relation accepts its own `where`, `orderBy`, `limit`, `offset` and `cursor`, applied per parent row. A to-one relation that is empty reads as `null`:

```ts
await avClient.Post.find.unique({ where: { id: 4 }, select: ["title", { category: { select: ["name"] } }] });
// { title: 'Navy stories', category: null }
```

`select` and `include` cannot be used together. A customized relation must be an object: `{ posts: ["id"] }` is refused with `V1008` ("Customized relation projection must be an object.").

### Going deeper

Relations nest, up to `maxNestingDepth` (12 by default):

```ts
await avClient.Category.find.many({
  select: ["name", { posts: { select: ["title", { author: { select: ["email"] } }] } }],
});
// [ { name: 'News',      posts: [ { title: 'Hello', author: { email: 'ada@example.com' } },
//                                 { title: 'Enigma', author: { email: 'alan@example.com' } } ] },
//   { name: 'Tutorials', posts: [ { title: 'Notes on engines', author: { email: 'ada@example.com' } },
//                                 { title: 'Compilers', author: { email: 'grace@example.com' } } ] } ]
```

To count related rows instead of loading them, use `$count` ([Counting](/docs/counting)). To filter or order parents by their relations, see [Filtering, sorting and paging](/docs/filtering-sorting-paging#filtering-through-relations).

A restriction can hide a relation, forbid including it, or narrow its pagination: [Exposing and hiding fields](/docs/exposing-and-hiding-fields).

## Writing relations

Inside `data` of a `create` or `update`, a relation field takes directives. You may also set the foreign key directly (`authorId: 1`), which is simpler when you have it. Two limits apply:

- Not together with the same relation: setting `authorId` and `author: { $connect: … }` in one record names the reference twice and is refused before the database is asked: `422` `A2004` with a `V1012` issue at the relation, `Set "authorId" or "author", not both.` It holds for required and optional relations, for `create`, `update` and `upsert`, for nested writes at any depth and for each step of a transaction. Either one alone is fine.
- Not beside another relation's write (Prisma): a record that writes one relation through its field and another relation directly, such as `authorId` beside `category: { $connect: … }`, is refused with `V1012`: `Use relation fields only, or reference fields only, in one record: "authorId" is a reference field and "category" is a relation.` Write all the record's relations as relations, or all through their fields. A field beside a relation that holds no reference on that side (`mentorId` beside `posts: { $create: … }` on an author) is accepted.

| Directive | Meaning | On create | On update |
|---|---|---|---|
| `$create` | Create related records and link them. | yes | yes |
| `$connect` | Link existing records, by identifier. | yes | yes |
| `$connectOrCreate` | Link if found, otherwise create. | yes | yes |
| `$update` | Update the related record(s); on a to-many, every record matching a `where` (required). | | yes |
| `$upsert` | Update the match, otherwise create. | | yes |
| `$delete` | Delete the related record(s); on a to-many, those matching a `where` (required). | | optional to-one, to-many |
| `$disconnect` | Unlink without deleting: `true` on an optional to-one, identifiers on a to-many. | | optional to-one, to-many |
| `$set` | Make the relation exactly this set. | | to-many |

The directives a relation accepts are in the contract (`capabilities.create` / `update`), and a restriction can narrow them. Directives are only valid in writes: in a `where` they answer `V1006`.

### Create and link

```ts
// a Post linked to existing records
await avClient.Post.create.one({
  data: { title: "Connected", author: { $connect: { id: 1 } }, category: { $connect: { id: 2 } } },
  select: ["id", "title", "authorId", "categoryId"],
});
// { id: 7, title: 'Connected', authorId: 1, categoryId: 2 }

// a User and their Posts in one call
await avClient.User.create.one({
  data: { email: "linus@example.com", name: "Linus", posts: { $create: [{ title: "Kernel" }, { title: "Git" }] } },
  select: ["id", "email", { posts: { select: ["id", "title"], orderBy: { id: "asc" } } }],
});
// { id: 4, email: 'linus@example.com', posts: [ { id: 8, title: 'Kernel' }, { id: 9, title: 'Git' } ] }

// link a category, creating it when it does not exist yet
await avClient.Post.create.one({
  data: {
    title: "CoC",
    author: { $connect: { email: "ada@example.com" } },
    category: { $connectOrCreate: { where: { name: "Opinion" }, create: { name: "Opinion" } } },
  },
  select: ["id", "categoryId"],
});
// { id: 10, categoryId: 3 }
```

`$connect` takes an identifier: the primary key or any unique column (`{ email: "..." }`).

### Update, unlink, replace

```ts
// add a related record while updating the parent
await avClient.User.update.unique({
  where: { id: 1 },
  data: { posts: { $create: { title: "Nested" } } },
  select: ["id", { posts: { select: ["title"], orderBy: { id: "desc" }, limit: 1 } }],
});
// { id: 1, posts: [ { title: 'Nested' } ] }

// change related records matching a where
await avClient.User.update.unique({
  where: { id: 1 },
  data: { posts: { $update: { where: { title: "Nested" }, data: { views: { $increment: 5 } } } } },
  select: ["id", { posts: { select: ["title", "views"], where: { title: "Nested" } } }],
});
// { id: 1, posts: [ { title: 'Nested', views: 5 } ] }

// unlink an optional to-one
await avClient.Post.update.unique({ where: { id: 1 }, data: { category: { $disconnect: true } }, select: ["id", "categoryId"] });
// { id: 1, categoryId: null }

// replace a to-many with exactly this set; $disconnect unlinks given members only
await avClient.Category.update.unique({ where: { id: 1 }, data: { posts: { $set: [{ id: 1 }, { id: 3 }] } }, select: ["id", { posts: { select: ["id"], orderBy: { id: "asc" } } }] });
// { id: 1, posts: [ { id: 1 }, { id: 3 } ] }
await avClient.Category.update.unique({ where: { id: 1 }, data: { posts: { $disconnect: [{ id: 3 }] } }, select: ["id", { posts: { select: ["id"] } }] });
// { id: 1, posts: [ { id: 1 } ] }

// delete related records matching a where
await avClient.User.update.unique({ where: { id: 1 }, data: { posts: { $delete: { where: { title: "Nested" } } } }, select: ["id"] });
```

A to-many `$update` or `$delete` without a `where` is refused: `V1012` ("To-many $update requires where.").

### Upsert

`upsert.unique` creates the record when the identifier does not match, and updates it when it does:

```ts
await avClient.User.upsert.unique({
  where: { email: "new@example.com" },
  create: { email: "new@example.com", name: "New" },
  update: { name: "Renamed" },
  select: ["id", "name"],
});
// first call:  { id: 4, name: 'New' }          (HTTP 200, A1008)
// second call: { id: 4, name: 'Renamed' }
```

### What fails, and how

| Mistake | Result |
|---|---|
| `$connect` to a record that does not exist | `ValidationError`, `A2004` ("The operation's arguments referenced a record that does not exist.") |
| A foreign key that does not exist (`authorId: 999`) | `ConflictError`, `A2008` |
| `$update` / `$delete` on a to-many without `where` | `ValidationError`, `A2004` / `V1012` |
| A reference field and its own relation in one record (`authorId` with `author: { $connect: … }`) | `ValidationError`, `A2004` / `V1012`: `Set "authorId" or "author", not both.` |
| One relation written through its reference field and another written directly, on Prisma (`authorId` with `category: { $connect: … }`) | `ValidationError`, `A2004` / `V1012`: `Use relation fields only, or reference fields only, in one record: …` |
| A directive the contract does not offer on that relation | `ValidationError`, `A2004` / `V1006` |
| A relation filter in the `where` of a to-many nested `$update` or `$delete` (at any depth, under `AND`, `OR` or `NOT` too) | `ValidationError`, `A2004` / `V1006` (below) |

On a required relation, a directive that would leave a child with no parent (for example `$set` that drops a `Post` from its `User`) is refused by the database and answers `ConflictError`, `409` `A2008` ("The operation conflicts with the current state of the resource."). Nothing is written. This applies to `User.update.unique` with `posts: { $disconnect: [{ id: 1 }] }` or `posts: { $set: [] }` where `Post.authorId` is required.

### The `where` of a nested `$update` or `$delete`

Through a to-many relation, a nested `$update` or `$delete` filters plain fields only on Prisma 7. A relation filter in its `where` is refused before the database is asked, with `A2004` and `V1006`, and it is a type error in the typed calls:

```ts
await avClient.User.update.unique({
  where: { id: 1 },
  data: { posts: { $update: { where: { category: { name: "News" } }, data: { views: 1 } } } },
});
// ValidationError A2004 (422): { path: ["arguments","data","posts","$update","where","category"], code: "V1006",
//   message: 'Relation filter "category" is not available here: a nested $update or $delete filter on this relation takes scalar fields only.' }
```

The refusal covers any depth and the `AND`, `OR` and `NOT` wrappers: `{ AND: [{ NOT: { comments: { some: { text: "x" } } } }] }` is refused at `["arguments","data","posts","$update","where","AND",0,"NOT","comments"]`. Filter the nested rows by their own fields (`{ title: "Nested" }`, `{ id: 3 }`), or find the ids first and name them. A to-one relation's nested `$update` keeps relation filters. The limit belongs to the adapter and is stated in the contract, so a client generated before it was declared must be regenerated.

## Scalar directives

On a number field, an object with one `$`-key acts on the current value instead of assigning:

```ts
await avClient.Post.update.unique({ where: { id: 1 }, data: { views: { $increment: 5 } }, select: ["id", "views"] });
// { id: 1, views: 15 }
await avClient.Post.update.many({ where: { views: { gt: 50 } }, data: { views: { $multiply: 2 } }, select: ["id", "views"] });
// [ { id: 6, views: 200 } ]
```

`$increment`, `$decrement`, `$multiply` and `$divide` apply to numeric fields (`Int`, `BigInt`, `Decimal`). A required to-one relation such as `Post.author` has no `$disconnect` or `$delete`.

## See also

- [Counting](/docs/counting)
- [Filtering, sorting and paging](/docs/filtering-sorting-paging)
- [Transactions with $ref](/docs/transactions-with-ref): when a later step needs an id from an earlier one.
- [Querying](/docs/querying)
