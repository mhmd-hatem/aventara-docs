---
title: Results and typing
description: How the generated client types results exactly from select, include and $count, why results are readonly, and how first misses, counts and errors behave.
order: 13
section: concepts
---

# Results and typing

The generated client types every result from the arguments you pass, not from the model. A `select` of two fields gives a record with exactly two fields; add a relation and the relation's shape follows its own `select`. The types are derived from the same contract the server enforces, so what compiles is what the server accepts.

## select: only the selected fields exist

```ts
const users = await avClient.User.find.many({ select: ["id", "email"] });
// readonly { readonly id: number; readonly email: string }[]

users[0].email;   // string
users[0].name;    // error TS2339: Property 'name' does not exist on type ...
```

With neither `select` nor `include`, a record has every readable scalar field and no relations. Scalars map to their natural types: `Int` to `number`, a nullable `String?` to `string | null`, an enum to the union of its values (`"USER" | "ADMIN"`), `DateTime` to `Date`, `Boolean` to `boolean`.

```ts
const ada = await avClient.User.find.unique({ where: { id: 1 } });
// { readonly id: number; readonly email: string; readonly name: string | null;
//   readonly role: "USER" | "ADMIN"; readonly createdAt: Date }
```

A field the client layer hides or makes write-only is not in these types, and is not a valid `select` entry:

```ts
await avClient.User.find.many({ select: ["passwordHash"] });   // compile error
```

## include and nested select

`include` adds relations to the default scalars. `select` can nest a relation with its own `select`, `where`, `orderBy` and paging:

```ts
const withPosts = await avClient.User.find.unique({ where: { id: 1 }, include: ["posts"] });
// default User fields plus: readonly posts: readonly { id, title, body, views, published, meta, authorId }[]

const posts = await avClient.Post.find.many({
  select: ["id", "title", { author: { select: ["id", "name"] } }],
  limit: 10,
});
// readonly { readonly id: number; readonly title: string;
//            readonly author: { readonly id: number; readonly name: string | null } }[]
```

A to-one relation is an object (or `null` when the relation is optional); a to-many relation is a readonly array. A relation named as a bare string uses the target's default projection; a customized one uses object form.

## $count

`$count` is a reducer on a to-many relation, not a field. It changes the shape of that relation's result:

| Nested `select` | Result type |
|---|---|
| `["id", "title"]` | `readonly { id; title }[]` |
| `["$count"]` | `{ readonly count: number }` |
| `["id", "title", "$count"]` | `{ readonly data: readonly { id; title }[]; readonly count: number }` |

```ts
const users = await avClient.User.find.many({
  select: ["id", { posts: { select: ["id", "title", "$count"] } }],
});
// readonly { readonly id: number;
//            readonly posts: { readonly data: readonly { readonly id: number; readonly title: string }[];
//                              readonly count: number } }[]
// at runtime: [{ id: 1, posts: { data: [{ id: 1, title: "Hello" }], count: 1 } }, { id: 2, posts: { data: [], count: 0 } }]

const counts = await avClient.User.find.many({ select: ["id", { posts: { select: ["$count"] } }], limit: 1 });
// [{ id: 1, posts: { count: 1 } }]
```

When the nested relation has a `where` and paging, `count` is the number of matching rows before `limit` and `offset`, and `data` is the page.

## Results are readonly

Every result type is `readonly`, arrays included, so a returned record cannot be mutated in place. Copy it into a new object, or type a variable as `readonly User[]`:

```ts
users[0].id = 5;        // error TS2540: Cannot assign to 'id' because it is a read-only property.
users.push(users[0]);   // error TS2339: Property 'push' does not exist on type 'readonly ...[]'.

const list: readonly User[] = await avClient.User.find.many({});   // `User` is a named type from the generated client
```

## first returns null, unique throws, count is a number

| Call | Result | When nothing matches |
|---|---|---|
| `find.first`, `update.first`, `delete.first` | `Record \| null` | `null` |
| `find.unique`, `update.unique`, `delete.unique` | `Record` | throws `NotFoundError` (`A2003`) |
| `find.many` | `readonly Record[]` | `[]` |
| `find.count`, `create.count`, `update.count`, `delete.count` | `number` | `0` |
| `create.one`, `upsert.unique` | `Record` | not applicable |
| `create.many`, `update.many` | `readonly Record[]` | `[]` |

The type system follows: a `first` result must be checked before use, a `unique` result need not.

```ts
const first = await avClient.User.find.first({ select: ["id"] });
first.id;          // error TS18047: 'first' is possibly 'null'.
first?.id;         // number | undefined

const n: number = await avClient.User.find.count();
```

## Failures are typed errors

The client resolves to the operation's `data` and throws on every failure. Branch on the error class or its `code`, never on the message:

| Class | Typical codes |
|---|---|
| `ValidationError` | `A2004`, `A2007`, `A2009` (with `cause.issues`, each with a `V` code and a `path`) |
| `NotFoundError` | `A2003` |
| `ConflictError` | `A2008`, `A2013`, `A2014` |
| `ContractMismatchError` | `A2005` |
| `AuthError` | `A4000`, `A4001`, `A4002` |
| `InternalError` | `A3000`, `A3001`, `A3002`, `A3003`, `A3004` |
| `ProtocolError` | `A2000`, `A2001`, `A2002`, `A2006`, `A2010`, `A2011`, `A2012` (a request the server could not route or interpret) |
| `TransportError` | no response, or a response that is not a framework envelope (not a `FrameworkError`; it has no `code`) |

```ts
import avClient, { ConflictError } from "./api/AvClient";

try {
  await avClient.User.create.one({ data: { email: "ada@example.com", passwordHash: "..." } });
} catch (e) {
  if (e instanceof ConflictError) {
    e.code;   // "A2008": the email already exists
  }
}
```

## On the server, results are envelopes

Server-side calls through `framework.application.*` and `framework.client.*` return the envelope instead of throwing: `{ data, code, cause }`. `data` has the typed result, and `code` tells you whether it is valid.

The types of `framework.application` and `framework.client` follow your restrictions layer by layer, exactly as the generated client's do. A hidden field is not in the types. A field whose `select`, `filter`, `order`, `create` or `update` capability you turned off is refused in that position and left out of the result types. A disabled operation is not on the object, and a unique operation disappears when its only identifier is hidden. `framework.client` reads the root restrictions with `client.restrictions` over them; `framework.application` reads the root restrictions with `application.restrictions` over them, so a field hidden at the root is hidden on `framework.application` too. `framework.appTx` and `framework.clientTx` follow the same rules.

> Known issue: filter operator narrowing is not reflected in any types. A filter operator the field does not offer compiles, and the runtime refuses it with `V1006`.

```ts
const res = await framework.application.User.find.count({});
res.code;   // "A1000"
res.data;   // number
```

## See also

- [Resources and operations](/docs/resources-and-operations)
- [Querying](/docs/querying)
- [Frontend client](/docs/client-errors)
- [HTTP protocol](/docs/http-protocol#codes)
- Guides: [Relations and nested writes](/docs/relations-and-nested-writes), [Enums and scalar types](/docs/enums-and-scalars), [Counting](/docs/counting)
