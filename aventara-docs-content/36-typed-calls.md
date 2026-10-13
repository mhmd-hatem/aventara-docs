---
title: Typed calls
description: How avClient.User.find.many and friends are typed - one property per Resource, named types, readonly results, enums, and helpers to name a result type.
order: 52
section: frontend
---

# Typed calls

The generated client has one property per Resource, one per operation family under it, and one per variant: `avClient.<Resource>.<family>.<variant>(args, options?)`. Argument and result types come from the same derivation the server uses, so a call that type-checks is a call the contract accepts.

```ts
import avClient from "./api/AvClient";

const users = await avClient.User.find.many({
  where: { role: "AUTHOR" },
  orderBy: { createdAt: "desc" },
  limit: 20,
});
// users: readonly { id: number; email: string; name: string | null; role: Role; createdAt: Date }[]
```

Only what the contract advertises exists. If your configuration switches off `User.delete.first` and `User.delete.count`, then `avClient.User.delete` has only `unique` (in the type and at runtime, `avClient.User.delete.first` is `undefined`). A Resource named like a client member (`tx`, `transaction`, `then`, `constructor`) is reached as `<name>Model`.

## Results follow the projection

The result type depends on `select` / `include`:

```ts
const rows = await avClient.User.find.many({
  select: ["id", "email", { posts: { select: ["id", "title", "$count"] } }],
});

rows[0].posts.count;          // number
rows[0].posts.data[0].title;  // string
rows[0].name;                 // type error: not selected
```

Real response for that call:

```json
[{"id":1,"email":"ada@example.com","posts":{"data":[{"id":1,"title":"Hello"}],"count":1}}]
```

With no projection you get every readable scalar field. A field the client layer does not expose for reading (for example a write-only `passwordHash`) is not in the type, and selecting it anyway fails validation with `V1008`.

## Values are application values

| Database / wire | In your code |
|---|---|
| `DateTime` | `Date` |
| `BigInt` | `bigint` |
| `Bytes` | `Uint8Array` |
| `Decimal` | the client's own `AvDecimal` (`toString`, `toJSON`) |
| `Json` | as-is, or the type declared with `AvZ` ([JSON fields](/docs/json-fields#in-your-code-and-in-the-client)) |
| enum | a string-literal union |

Arguments are encoded and results revived for you.

## Required create fields

A create's `data` requires what the contract's `createRequirements` lists: every required field, and each required relation written as the relation or through its reference field, not both and not neither. It applies to `create.one`, every `create.many` record, `upsert`'s `create`, and nested `$create`, `$connectOrCreate` and `$upsert` payloads, where the relation the create is nested through comes from its parent. A `$ref` counts as a value.

```ts
await avClient.Post.create.one({ data: { title: "Hello", authorId: 1 } }); // ok
await avClient.Post.create.one({ data: { authorId: 1 } });                 // type error: `title` is missing
await avClient.Post.create.one({ data: { title: "Hello" } });              // type error: `author` or `authorId`
```

See [Relations and nested writes](/docs/relations-and-nested-writes#required-relations-and-fields).

## Named types

Per Resource, each one only when the operation it reads is advertised:

| Type | Is |
|---|---|
| `User` | The default record (what `find.unique` returns with no projection) |
| `UserWhere` | `find.many`'s `where` |
| `UserUniqueWhere` | `find.unique`'s `where` (an identifier) |
| `UserOrderBy` | `find.many`'s `orderBy` |
| `UserCreateData` | `create.one`'s `data` |
| `UserUpdateData` | `update.unique`'s `data` |
| `UserSelect` | `find.many`'s `select` |
| `UserInclude` | `find.many`'s `include` |

```ts
import avClient, { type User, type UserWhere, type PostCreateData } from "./api/AvClient";

const where: UserWhere = { email: { contains: "example.com" } };
const users: readonly User[] = await avClient.User.find.many({ where });

const data: PostCreateData = { title: "Hello", authorId: 1 };
```

Also exported from `AvClient.ts`: `AvClient`, `AvClientOptions`, `AvCallOptions`, `AvFetch`, `AvOperation`, each enum (a union type and a same-named `as const` object), `AvDecimal`, the error classes and the types `AvCause`, `AvValidationIssue`, `AvOperationCode`, `AvValidationCode`.

```ts
import { Role } from "./api/AvClient";

Role.ADMIN;                 // "ADMIN"
const r: Role = "AUTHOR";   // ok
const bad: Role = "ROOT";   // type error
```

A name that would clash is renamed (`User` beside a Resource `UserWhere` becomes `UserModel`), with one warning when you generate. The wire name never changes.

## Readonly results

Result types are `readonly`. Build a new object instead of mutating a result:

```ts
const user = users[0];
user.email = "x";                          // type error
const next = { ...user, name: "Ada L." };  // fine
```

## Naming the type of a projected result

Named types cover the default record and the argument shapes. For the result of a call with a projection, take the type from the call itself:

```tsx
const listCards = () =>
  avClient.Post.find.many({
    select: ["id", "title", { author: { select: ["name"] } }],
    orderBy: { createdAt: "desc" },
    limit: 10,
  });

type PostCard = Awaited<ReturnType<typeof listCards>>[number];

function Card({ post }: { post: PostCard }) {
  return <h3>{post.title} by {post.author.name}</h3>;
}
```

A small generic keeps this tidy:

```ts
type Resolved<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;
type PostCards = Resolved<typeof listCards>;
```

## Misses and first-style operations

| Call | Nothing matches |
|---|---|
| `find.first`, `update.first`, `delete.first` | resolves to `null` |
| `find.unique`, `update.unique`, `delete.unique` | throws `AvNotFoundError` |
| `find.many` | `[]` |
| `find.count` | `0` |

```ts
const maybe: User | null = await avClient.User.find.first({ where: { email: "nobody@example.com" } });
```

Mistakes the compiler catches: an unknown field in `where`, a value of the wrong type, and `select` together with `include`.

## See also

- [Querying](/docs/querying)
- [Results and typing](/docs/results-and-typing)
- [Client errors](/docs/client-errors)
- [Transactions](/docs/transactions)
- Guides: [Filtering, sorting and paging](/docs/filtering-sorting-paging), [Relations and nested writes](/docs/relations-and-nested-writes), [Enums and scalar types](/docs/enums-and-scalars)
