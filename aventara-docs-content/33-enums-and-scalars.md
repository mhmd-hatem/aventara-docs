---
title: Enums and scalar types
description: How Prisma enums appear in the generated client, and how DateTime, BigInt, Decimal, Bytes and Json travel over the wire and come back as real values.
order: 33
section: guides
---

# Enums and scalar types

JSON has strings, numbers, booleans, `null`, arrays and objects. A Prisma model also has dates, 64-bit integers, exact decimals and byte arrays. Aventara carries each of them as a defined JSON form on the wire and **revives** them into real values on the other side, so your code works with `Date`, `bigint`, `Decimal` and `Uint8Array`, and never with a half-parsed string.

The examples use this schema:

```prisma
enum Role { USER ADMIN }

model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  role         Role     @default(USER)
  settings     Json?
  avatar       Bytes?
  createdAt    DateTime @default(now())
  posts        Post[]
}

model Post {
  id          Int       @id @default(autoincrement())
  title       String
  views       Int       @default(0)
  price       Decimal   @default(0)
  bigViews    BigInt    @default(0)
  publishedAt DateTime?
  author      User      @relation(fields: [authorId], references: [id])
  authorId    Int
}
```

## Enums

A Prisma enum is part of the contract (`"enums": { "Role": { "values": ["USER", "ADMIN"] } }`) and a field of that enum accepts exactly its members. The generated client emits each enum as **a type and a constant of the same name** in `generated/enums.ts`, re-exported from `AvClient.ts`:

```ts
export type Role = "USER" | "ADMIN";
export const Role = { USER: "USER", ADMIN: "ADMIN" } as const;
```

Use whichever reads better:

```ts
import avClient, { Role } from "./api/AvClient";

await avClient.User.create.one({ data: { email: "ada@example.com", role: Role.ADMIN } });
await avClient.User.find.many({ where: { role: { in: [Role.ADMIN] } }, select: ["id"] });
await avClient.User.find.many({ where: { role: "ADMIN" } });          // a string literal works too

const r: Role = "ADMIN";
const bad: Role = "ROOT";                                              // compile error
Object.values(Role);                                                   // [ 'USER', 'ADMIN' ]
```

Because `Role` is a constant, you can build option lists from it (`Object.values(Role)`) without a second copy of the values. An unknown member sent anyway (from a stale client or another language) is refused:

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1002","path":["arguments","data","role"],"message":"Value is not a member of enum \"Role\"."}]}}
```

Enum fields support `equals`, `not`, `in` and `notIn` in `where`. Adding a member to a Prisma enum changes the contract: regenerate the client ([Keeping in sync](/docs/keeping-in-sync)).

## Scalar types at a glance

| Prisma type | In your code (client and application layer) | On the wire (JSON) |
|---|---|---|
| `String` | `string` | string |
| `Int`, `Float` | `number` | number |
| `Boolean` | `boolean` | `true` / `false` |
| `DateTime` | `Date` | string, canonical UTC ISO-8601: `2026-01-15T10:00:00.000Z` |
| `BigInt` | `bigint` | string of decimal digits: `"9007199254740993"` |
| `Decimal` | `Decimal` (the client's own, see below) | string: `"12.5"` |
| `Bytes` | `Uint8Array` | string, RFC 4648 base64: `"AQID"` |
| `Json` | any JSON value | the same JSON |
| any optional (`?`) | the type or `null` | the type or `null` |

The wire form of a field is in the contract (`type: { scalar: "datetime" }`), and the generated client decodes and encodes by it. Calls resolve to revived values, **including inside nested relations**:

```ts
import avClient, { Role, Decimal } from "./api/AvClient";

const u = await avClient.User.create.one({
  data: { email: "typed@example.com", role: Role.ADMIN, avatar: new Uint8Array([1, 2, 3]), settings: { theme: "dark" } },
});
u.role;                        // 'ADMIN'
u.avatar;                      // Uint8Array(3) [ 1, 2, 3 ]
u.createdAt instanceof Date;   // true
u.settings;                    // { theme: 'dark' }

const p = await avClient.Post.create.one({
  data: {
    title: "Typed",
    authorId: u.id,
    price: new Decimal("12.50"),
    bigViews: 9007199254740993n,
    publishedAt: new Date("2026-05-01T12:00:00Z"),
  },
});
typeof p.bigViews;             // 'bigint'   (9007199254740993n: past Number.MAX_SAFE_INTEGER, exact)
p.price.toString();            // '12.5'
p.price instanceof Decimal;    // true
p.publishedAt;                 // 2026-05-01T12:00:00.000Z
```

## DateTime

On the wire a date is **always** `YYYY-MM-DDTHH:mm:ss.sssZ`. Responses use it, and requests must too. Anything else is refused, including offsets and a missing millisecond part:

```json
// "publishedAt": "2026-05-01T12:00:00+02:00"   or   "2026-05-01"   or   "2026-05-01T12:00:00Z"
{"data":null,"code":"A2004","cause":{"issues":[{"code":"V1003","path":["arguments","data","publishedAt"],"message":"Value must use canonical ISO-8601 UTC encoding."}]}}
```

With the generated client you never write this: pass a `Date`. Calling the HTTP API directly from another language, use `toISOString()`-style output. A `Date` is also the equality shorthand in `where` ([Filtering, sorting and paging](/docs/filtering-sorting-paging#dates-decimals-and-big-integers)).

## BigInt

`BigInt` fields are 64-bit signed integers. JSON numbers cannot hold them exactly, so the wire form is a base-10 string, and a JSON number is refused:

```json
// "bigViews": 123
{"code":"A2004","cause":{"issues":[{"code":"V1001","path":["arguments","data","bigViews"],"message":"Value must be a base-10 bigint string."}]}}
```

```json
// "bigViews": "-9223372036854775808"   (the smallest 64-bit value)
{"data":{"bigViews":"-9223372036854775808"},"code":"A1002","cause":null}
```

Keep values within the signed 64-bit range (`-9223372036854775808` to `9223372036854775807`). A plain `Int` is checked against 32 bits: `3000000000` is refused with `V1004` ("Integer value is outside signed 32-bit range.") and `1.5` with `V1001`.

## Decimal

`Decimal` is exact, so it is a string on the wire and an object in your code. The generated client ships a minimal `Decimal` class (exported from `AvClient.ts`):

```ts
import { Decimal } from "./api/AvClient";

const price = new Decimal("12.50");
price.toString();            // "12.50" exactly as given
JSON.stringify({ price });   // {"price":"12.50"}
new Decimal("abc");          // TypeError: Decimal value must be a valid decimal string.
```

It **does no arithmetic**: it holds the digits. To calculate, hand the string to the decimal library you prefer (`decimal.js`, `big.js`), or use the update directives (`{ $increment: 1 }`) and let the database do it.

The server normalizes what it stores and returns: `"12.50"` is read back as `"12.5"`, `"0.30"` as `"0.3"`, `"1e3"` as `"1000"`. A value that is not a decimal string is refused (`V1001` / `V1003`).

## Bytes

`Bytes` is a `Uint8Array` in your code and RFC 4648 base64 on the wire:

```json
// create: "avatar": "AQID"
{"data":{"id":4,"avatar":"AQID"},"code":"A1002","cause":null}
// "avatar": "not base64!"
{"code":"A2004","cause":{"issues":[{"code":"V1003","path":["arguments","data","avatar"],"message":"Value must use RFC 4648 base64 encoding."}]}}
```

Do not store large files in a `Bytes` column behind this API: they travel inside JSON, bounded by `maxRequestBytes` ([Limits and safety](/docs/limits-and-safety)).

## Json

A `Json` field carries any JSON value untouched: objects, arrays, strings, numbers, booleans. `null` means the field's optional `null`.

```json
// create: "settings": {"a":[1,2,{"b":null}]}
{"data":{"id":5,"settings":{"a":[1,2,{"b":null}]}},"code":"A1002","cause":null}
```

Filter operators for `Json` depend on the database; read `fields.settings.capabilities.filter` in the contract (on SQLite: `equals`, `not`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayStartsWith`, `arrayEndsWith`, `mode`). Json values do not get types from the schema: narrow them in your code, or validate them in a [pipe](/docs/pipelines).

## On the server

Inside your NestJS code the forms differ by layer ([Server-side usage](/docs/server-side-usage)):

| Call | Input | Result |
|---|---|---|
| `framework.application.*` | application values: `Date`, `bigint`, `Decimal` (exported from `@aventara/core`), `Uint8Array` | the same application values |
| `framework.client.*` | **wire** values: ISO strings, decimal strings, base64 | application values |

`bigint` and `Date` are not JSON-serializable by themselves, so a server-side result cannot be returned as a JSON response unchanged: a controller that returns `res.data` with a `bigint` in it fails (Nest answers `500`). Convert first (`value.toString()`, `date.toISOString()`), or go through the HTTP protocol, which encodes for you.

## See also

- [Filtering, sorting and paging](/docs/filtering-sorting-paging)
- [Results and typing](/docs/results-and-typing)
- [Exposing and hiding fields](/docs/exposing-and-hiding-fields)
- [HTTP protocol](/docs/http-protocol)
