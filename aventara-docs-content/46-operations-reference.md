---
title: Operations reference
description: Every operation family and variant with its accepted arguments, result shape, success code, HTTP status and the errors it can return.
order: 81
section: reference
---

# Operations reference

Fifteen standard operations exist per Resource: five families (`find`, `create`, `update`, `delete`, `upsert`) times their variants. Which of them a given Resource and layer offers is part of its contract; the server only routes what the contract advertises. For the query language itself see [Querying](/docs/querying); for the codes see [Error codes](/docs/error-codes).

Over HTTP every operation is `POST <entrypoint>/_resources/<Resource>/<family>/<variant>` with a JSON object body of arguments. In the generated client it is `avClient.<Resource>.<family>.<variant>(args, options?)`. Examples below use the schema `User` (id, email, name, role, passwordHash, createdAt, balance, meta, posts), `Post` (id, title, views, published, author, category) and `Category`.

## Overview

| Operation | Arguments | `data` on success | Code, HTTP | Nothing matched |
|---|---|---|---|---|
| `find.first` | `where?`, `orderBy?`, `select?`/`include?` | record | `A1000`, 200 | `null`, `A1001`, 200 |
| `find.unique` | `where` (identifier), `select?`/`include?` | record | `A1000`, 200 | `A2003`, 404 |
| `find.many` | `where?`, `orderBy?`, `limit?`, `offset?`, `cursor?`, `select?`/`include?` | record list | `A1000`, 200 | `[]`, `A1000` |
| `find.count` | `where?` | number | `A1000`, 200 | `0` |
| `create.one` | `data`, `select?`/`include?` | the created record | `A1002`, 201 | n/a |
| `create.many` | `data` (array), `select?`/`include?` (to-one relations only at the top level) | list of created records | `A1003`, 201 | n/a |
| `create.count` | `data` (array) | number created | `A1003`, 201 | n/a |
| `update.first` | `where?`, `orderBy?`, `data`, `select?`/`include?` | the updated record | `A1004`, 200 | `null`, `A1001`, 200 |
| `update.unique` | `where` (identifier), `data`, `select?`/`include?` | the updated record | `A1004`, 200 | `A2003`, 404 |
| `update.many` | `where?`, `data`, `select?`/`include?` (to-one relations only at the top level) | list of updated records | `A1005`, 200 | `[]`, `A1005` |
| `update.count` | `where?`, `data` | number updated | `A1005`, 200 | `0` |
| `delete.first` | `where?`, `orderBy?`, `select?`/`include?` | the deleted record | `A1006`, 200 | `null`, `A1001`, 200 |
| `delete.unique` | `where` (identifier), `select?`/`include?` | the deleted record | `A1006`, 200 | `A2003`, 404 |
| `delete.many` | not offered with the Prisma adapter | | | `A2002`, 404 |
| `delete.count` | `where?` | number deleted | `A1007`, 200 | `0` |
| `upsert.unique` | `where` (identifier), `create`, `update`, `select?`/`include?` | the created or updated record | `A1008`, 200 | n/a |

`select` and `include` are mutually exclusive (`V1008`). `count` variants take no projection. An operation with no arguments is `{}`. There is no `take`, `skip` or `distinct`: pagination is `limit`, `offset` and `cursor`.

Response success codes are the same in the envelope and in the HTTP status: `create` answers 201, everything else 200. The generated client resolves to `data` (and `null` for `A1001`); every other code throws. Server-side calls (`framework.application...`) return the envelope.

## Argument grammar

| Argument | Shape | Notes |
|---|---|---|
| `where` | `{ field: value \| operators, AND?: [], OR?: [], NOT?: ... }` | A plain value is equality; `null` is `IS NULL`; keys at one level are ANDed. Relation filters: a to-one takes a nested `where` or `null`; a to-many takes `some`, `every`, `none`. |
| `where` (unique variants) | an identifier: `{ id: 1 }` or `{ email: "..." }` | Must match exactly one active identifier of the Resource, else `V1007`. |
| `select` | `["id", "name", { posts: { select: [...], where?, orderBy?, limit?, offset?, cursor? } }]` | Fields, and relations in object form to customize them. A nested `"$count"` reducer on a to-many relation changes its result shape. |
| `include` | `["posts", "author"]` | Default scalars plus the named relations (default projection). |
| `orderBy` | `{ field: "asc" \| "desc" }`, an array of those, or `{ field: { sort, nulls: "first" \| "last" } }` | `nulls` only on nullable fields that allow it. |
| `limit` | non-negative integer | At most `maxListLimit` (default 250). |
| `offset` | non-negative integer | |
| `cursor` | an object holding exactly the ordered scalar fields | Needs an explicit `orderBy` ending in a unique tie-breaker. |
| `data` (create) | `{ field: value, relation: { $create \| $connect \| $connectOrCreate } }` | Scalar assignments plus nested relation directives. |
| `data` (update) | `{ field: value \| { $increment \| $decrement \| $multiply \| $divide \| $push \| $unset: ... }, relation: { $create \| $connect \| $connectOrCreate \| $disconnect \| $set \| $update \| $delete \| $upsert } }` | |
| `create` / `update` (upsert) | the `data` shapes above | `create` is used if no record matches `where`, else `update`. |

Which operators, directives and relation forms a field accepts is in the [contract](/docs/contract-layers) and can be narrowed with [restrictions](/docs/config-reference#restrictions-reference).

Wire forms of scalars: `datetime` is `YYYY-MM-DDTHH:mm:ss.sssZ`, `decimal` a decimal string (`"10.5"`), `bigint` an integer string, `bytes` base64; `json` is JSON as is. The generated client converts these to `Date`, `Decimal`, `bigint` and `Uint8Array`.

## Bulk variants differ

`create.many`, `create.count`, `update.many` and `update.count` are bulk writes. With the Prisma adapter, verified:

- No relation writes. `{ author: { $connect: ... } }` in `create.many` answers `V1006`: `Relation "author" is not writable during create.` Use the foreign-key scalar (`authorId`) instead. In `update.many` / `update.count` relation directives answer `V1006` (`not writable during update`).
- Projection. `select` and `include` on `create.many` / `update.many` may name scalars and to-one relations (`include: ["author"]` answers `201` / `200` with the author embedded). A to-many relation at the top level is refused in either form: `V1008` with `Relation "posts" is not available for select.` or, for `include`, `include accepts only relations with include capability.` (`Relation "posts" is not available for include.` in the object form). `find.many`, `find.first` and `find.unique` have no such limit: they accept `include` and `select` of to-one and to-many relations.
- Nested to-many is allowed one level inside an admitted to-one relation. The `bulkWrite` restriction applies to the top level only; beneath an admitted to-one relation the full projection is available at any depth. `include: [{ "author": { "include": ["posts"] } }]` (or `select: ["id", { "author": { "select": ["id", { "posts": { "select": ["id", "title"] } }] } }]`) is accepted, and the nested rows are read after the write, so rows created or updated by the call appear in them. A to-many at the top level stays refused.

```bash
curl -X POST $BASE/_resources/Post/create/many -d '{"data":[{"title":"h2","authorId":15}],"select":["id",{"author":{"select":["id",{"posts":{"select":["id","title"]}}]}}]}'
```

```json
{"data":[{"id":25,"author":{"id":15,"posts":[{"id":24,"title":"h1"},{"id":25,"title":"h2"}]}}],"code":"A1003","cause":null}
```

- `create.count` and `update.count` take no projection and return a number.

## find

### find.first

```bash
curl -X POST $BASE/_resources/User/find/first -d '{"where":{"name":{"startsWith":"A"}},"select":["id","name"]}'
```

```json
{"data":{"id":1,"name":"Ada"},"code":"A1000","cause":null}
```

No match: `{"data":null,"code":"A1001","cause":null}`, HTTP 200 (the client resolves to `null`).

Errors: `A2004` (`V1005` unknown field, `V1006` unsupported operator or order, `V1008` bad projection), `A2009` (`V1013` nesting, `V1015` too many boolean nodes).

### find.unique

```json
{"where":{"email":"ada@example.com"},"select":["id","email"]}
```

```json
{"data":{"id":1,"email":"ada@example.com"},"code":"A1000","cause":null}
```

A miss is an error: `404 A2003` `"No record matched the unique selector."` (client: `NotFoundError`). A `where` that is not an identifier (`{"name":"Ada"}`) is `422 A2004` / `V1007`: `Unique selector must exactly match one active identifier on Resource "User".`

### find.many

```json
{"where":{"role":"USER"},"orderBy":{"id":"desc"},"limit":2,"offset":1,"select":["id","email"]}
```

```json
{"data":[{"id":5,"email":"e@example.com"},{"id":4,"email":"d@example.com"}],"code":"A1000","cause":null}
```

Cursor pagination:

```json
{"orderBy":[{"id":"asc"}],"limit":2,"cursor":{"id":2},"select":["id"]}
```

```json
{"data":[{"id":2},{"id":3}],"code":"A1000","cause":null}
```

A nested to-many relation with a count:

```json
{"where":{"id":1},"select":["id",{"posts":{"select":["id","$count"],"where":{"views":{"gt":1}}}}]}
```

```json
{"data":[{"id":1,"posts":{"data":[{"id":2}],"count":1}}],"code":"A1000","cause":null}
```

| Nested `select` | Result for that relation |
|---|---|
| `["id","title"]` | `{ id, title }[]` |
| `["$count"]` | `{ count: number }` |
| `["id","title","$count"]` | `{ data: { id, title }[]; count: number }` |

Errors: `A2009` / `V1014` (`limit exceeds maxListLimit (250).`), `A2004` / `V1001` (`limit must be a non-negative integer.`), `V1009` (`Cursor pagination requires an object cursor and explicit deterministic orderBy.` or `Cursor keys must exactly match the active ordered scalar fields.`), `V1005`, `V1006`, `V1008`.

### find.count

```json
{"where":{"role":"USER"}}
```

```json
{"data":5,"code":"A1000","cause":null}
```

## create

### create.one

```json
{"data":{"email":"ada@example.com","name":"Ada","role":"ADMIN","balance":"10.50","meta":{"a":1}}}
```

```json
{"data":{"balance":"10.5","createdAt":"2026-10-06T22:42:46.119Z","email":"ada@example.com","id":1,"meta":{"a":1},"name":"Ada","passwordHash":"","role":"ADMIN"},"code":"A1002","cause":null}
```

With a nested relation: `{"data":{"title":"Hello","author":{"$connect":{"id":1}},"category":{"$connect":{"id":1}}}}` on `Post/create/one`.

Errors: `A2004` (`V1001` wrong type, `V1002` not an enum member, `V1003` bad format such as `createdAt: "yesterday"`, `V1006` directive not available, `V1012` bad relation action), `A2008` conflict (a unique constraint: `The operation conflicts with the current state of the resource.`).

Omitting a required field that has no default is a validation error, one issue per missing field, at the field's path (verified, `User` with `email` and `passwordHash` required):

```json
// User/create/one {"data":{"name":"x"}}   -> HTTP 422
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1000","path":["arguments","data","email"],"message":"Field \"email\" is required to create User."},{"code":"V1000","path":["arguments","data","passwordHash"],"message":"Field \"passwordHash\" is required to create User."}]}}
```

A `BigInt` outside the signed 64-bit range is `V1004`, also `422` `A2004`: `"BigInt value is outside signed 64-bit range."` (`9223372036854775807` is accepted, `9223372036854775808` is not).

### create.many

```json
{"data":[{"email":"d@example.com"}],"select":["id","email"]}
```

```json
{"data":[{"id":4,"email":"d@example.com"}],"code":"A1003","cause":null}
```

Without a projection each element is the full default record. See [Bulk variants differ](#bulk-variants-differ).

### create.count

```json
{"data":[{"email":"e@example.com"}]}
```

```json
{"data":1,"code":"A1003","cause":null}
```

## update

### update.first

Updates the first match (in `orderBy` order) and returns it.

```json
{"where":{"name":null},"orderBy":{"id":"asc"},"data":{"name":"First null"},"select":["id","name"]}
```

```json
{"data":{"id":2,"name":"First null"},"code":"A1004","cause":null}
```

No match: `A1001`, `data: null`, 200.

### update.unique

```json
{"where":{"id":1},"data":{"balance":{"$increment":"1.25"}},"select":["id","balance"]}
```

```json
{"data":{"id":1,"balance":"11.75"},"code":"A1004","cause":null}
```

No match: `404 A2003`. Applying a directive to a field that does not offer it (`{"name":{"$increment":1}}`) is `V1006`: `Mutation directive "$increment" is not available on field "name".`

Nested writes and read-back in one call:

```json
{"where":{"id":1},"data":{"posts":{"$create":{"title":"nested"}}},"select":["id",{"posts":{"select":["title"],"orderBy":{"id":"desc"},"limit":1}}]}
```

```json
{"data":{"id":1,"posts":[{"title":"nested"}]},"code":"A1004","cause":null}
```

### update.many

```json
{"where":{"authorId":1},"data":{"views":{"$increment":1}},"select":["id","views"]}
```

```json
{"data":[{"id":1,"views":1},{"id":2,"views":6}],"code":"A1005","cause":null}
```

### update.count

```json
{"where":{"authorId":1},"data":{"published":true}}
```

```json
{"data":2,"code":"A1005","cause":null}
```

## delete

### delete.first

```json
{"where":{"title":"Second"},"select":["id","title"]}
```

```json
{"data":{"id":2,"title":"Second"},"code":"A1006","cause":null}
```

No match: `A1001`, `data: null`, 200.

### delete.unique

```json
{"where":{"id":1}}
```

Returns the deleted record with `A1006`. Deleting it again: `404 A2003`.

### delete.many

Not offered with the Prisma adapter, because Prisma cannot return the deleted rows. Calling it answers `404 A2002` with `V1006` at `["variant"]`: `Operation "delete.many" is not available on Resource "User".` Use `delete.count`.

### delete.count

```json
{"where":{"email":{"startsWith":"zz"}}}
```

```json
{"data":0,"code":"A1007","cause":null}
```

Database cascades (a `Post` removed with its `User`) happen in the database as your schema says; they are not reported separately.

## upsert

### upsert.unique

```json
{"where":{"email":"z@example.com"},"create":{"email":"z@example.com"},"update":{"name":"Z"},"select":["id","name"]}
```

```json
{"data":{"id":6,"name":"Z"},"code":"A1008","cause":null}
```

The same code (`A1008`, 200) whether it created or updated. `where` must be an identifier.

## Errors every operation can return

| Code | HTTP | When |
|---|---|---|
| `A2000` | 400 | Malformed JSON, non-object body, missing identity headers. |
| `A2001` | 404 | The Resource is not in the contract (`V1005` at `["resource"]`; on an HTTP route, `resource`, `family` and `variant` name the URL segments). |
| `A2002` | 404 | The operation is not available on that Resource (including switched off by a restriction, or `delete.many`). `V1006` at `["family"]` or `["variant"]` of the request. |
| `A2004` | 422 | The arguments break a contract rule; see `cause.issues`. |
| `A2005` | 409 | The caller's contract hash is stale. |
| `A2006` | 400 | Unsupported protocol version. |
| `A2009` | 422 | A limit was exceeded. |
| `A2010` / `A2011` / `A2012` | 413 / 415 / 405 | Body too large, wrong media type, wrong method. |
| `A3000`, `A3001`, `A3004` | 500 | Unexpected failure, a database failure that is not a caller error, or a server pipe that returned invalid arguments. |
| `A4000`, `A4001`, `A4002` | 401, 403, 403 | A pipeline guard refused. |

Writes can additionally return `A2008` (409, a uniqueness or reference conflict), `A2013` and `A2014` (409, retryable concurrency outcomes: nothing was written). Full table with causes and fixes: [Error codes](/docs/error-codes).

## See also

- [Querying](/docs/querying), [Transactions](/docs/transactions)
- [Error codes](/docs/error-codes), [HTTP protocol](/docs/http-protocol)
- [Resources and operations](/docs/resources-and-operations)
- Guides: [Filtering, sorting and paging](/docs/filtering-sorting-paging), [Relations and nested writes](/docs/relations-and-nested-writes), [Counting](/docs/counting), [Transactions with $ref](/docs/transactions-with-ref)
