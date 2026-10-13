---
title: Enums and scalar types
description: How Prisma enums appear in the generated client, and how DateTime, BigInt, Decimal, Bytes and Json travel over the wire and come back as real values.
order: 33
section: guides
---

# Enums and scalar types

JSON has strings, numbers, booleans, `null`, arrays and objects. A Prisma model also has dates, 64-bit integers, exact decimals and byte arrays. Aventara carries each of them as a defined JSON form on the wire and revives them into real values on the other side, so your code works with `Date`, `bigint`, `AvDecimal` and `Uint8Array`, and never with a half-parsed string.

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

A Prisma enum is part of the contract (`"enums": { "Role": { "values": ["USER", "ADMIN"] } }`) and a field of that enum accepts exactly its members. The generated client emits each enum as a type and a constant of the same name in `generated/enums.ts`, re-exported from `AvClient.ts`:

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
| `Decimal` | `AvDecimal` (the client's own, see below) | string: `"12.5"` |
| `Bytes` | `Uint8Array` | string, RFC 4648 base64: `"AQID"` |
| `Json` | any JSON value, or the type you declare with `AvZ` ([JSON fields](/docs/json-fields)) | the same JSON |
| any optional (`?`) | the type or `null` | the type or `null` |

The wire form of a field is in the contract (`type: { scalar: "datetime" }`), and the generated client decodes and encodes by it. Calls resolve to revived values, including inside nested relations:

```ts
import avClient, { Role, AvDecimal } from "./api/AvClient";

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
    price: new AvDecimal("12.50"),
    bigViews: 9007199254740993n,
    publishedAt: new Date("2026-05-01T12:00:00Z"),
  },
});
typeof p.bigViews;             // 'bigint'   (9007199254740993n: past Number.MAX_SAFE_INTEGER, exact)
p.price.toString();            // '12.5'
p.price instanceof AvDecimal;  // true
p.publishedAt;                 // 2026-05-01T12:00:00.000Z
```

## DateTime

On the wire a date is always `YYYY-MM-DDTHH:mm:ss.sssZ`. Responses use it, and requests must too. Anything else is refused, including offsets and a missing millisecond part:

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

A `Decimal` is exact on the wire: it is a string on the wire and an object in your code, and Aventara never rounds it. Whether the database keeps every digit is up to the database ([What the database keeps](#what-the-database-keeps)). The generated client ships a minimal `AvDecimal` class (exported from `AvClient.ts`):

```ts
import { AvDecimal } from "./api/AvClient";

const price = new AvDecimal("12.50");
price.toString();            // "12.50" exactly as given
JSON.stringify({ price });   // {"price":"12.50"}
new AvDecimal("abc");        // TypeError: Decimal value must be a valid decimal string.
```

It does no arithmetic: it holds the digits. To calculate, hand the string to the decimal library you prefer (`decimal.js`, `big.js`), or use the update directives (`{ $increment: 1 }`) and let the database do it.

The server normalizes what it stores and returns: `"12.50"` is read back as `"12.5"`, `"0.30"` as `"0.3"`, `"1e3"` as `"1000"`. A value that is not a decimal string is refused (`V1001` / `V1003`).

## What the database keeps

Aventara passes every value to the ORM as you send it; how it is stored is the database's behavior. With Prisma 7:

- SQLite stores a `Decimal` as a 64-bit float: up to 15 significant digits are kept exactly, more are rounded. Use PostgreSQL when you need more.
- PostgreSQL stores a `Decimal` in its column's digits (`numeric(65,30)` by default, or `@db.Decimal(p, s)`), rounding extra places after the point.
- Arithmetic directives (`$increment`, `$decrement`, `$multiply`, `$divide`) are computed by the database, so their result follows the column like any SQL `UPDATE`: on a `@db.Decimal(10, 2)` column, `{ $divide: 3 }` on `1.00` stores `0.33`.
- A `Float` holds what JavaScript's `number` holds. SQLite stores `Number.MAX_VALUE` as infinity, which JSON cannot carry, so a later read of that field fails; keep `Float`s inside the finite range you need.

When the database refuses a value (a number out of the column's range, a NUL character in PostgreSQL text, a string longer than a `VarChar` allows, a division by zero), the call is answered `422` `A2004` with the database's reason, not `500`:

```text
{"code":"A2004","cause":{"message":"The database refused a value in the arguments: it cannot store or compare it as written.", ...}}
```

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

A `Json` field carries any JSON value untouched: objects, arrays, strings, numbers, booleans. `null` means the field's optional `null`. On a `Json?` field, writing `null` stores the database `NULL`, as on any nullable field. In a filter, `field: null` and `equals: null` match every row that reads back `null`, and `not: null` matches the rest. A `null` inside a value, or compared at a `path`, is a JSON `null`. An `undefined` inside a value becomes what JSON makes of it, on every surface: a key holding it is left out, and an array element holding it (or a hole) is `null`. So `{ a: undefined, b: [undefined] }` is stored as `{"b":[null]}`.

```json
// create: "settings": {"a":[1,2,{"b":null}]}
{"data":{"id":5,"settings":{"a":[1,2,{"b":null}]}},"code":"A1002","cause":null}
```

Filter operators for `Json` depend on the database; read `fields.settings.capabilities.filter` in the contract (on SQLite: `equals`, `not`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayStartsWith`, `arrayEndsWith`, `mode`; PostgreSQL adds `path`). A Prisma schema cannot say what is inside a `Json` column, so by default a `Json` field is any JSON. To give it a type that is checked on every write and known to `framework.application`, `framework.client` and the generated client, declare a shape with `AvZ`: [JSON fields](/docs/json-fields).

## On the server

Inside your NestJS code the forms differ by layer ([Server-side usage](/docs/server-side-usage)):

| Call | Input | Result |
|---|---|---|
| `framework.application.*` | application values: `Date`, `bigint`, `AvDecimal` (exported from `@aventara/core`), `Uint8Array` | the same application values |
| `framework.client.*` | wire values: ISO strings, decimal strings, base64 | application values |

`bigint` and `Date` are not JSON-serializable by themselves, so a server-side result cannot be returned as a JSON response unchanged: a controller that returns a result with a `bigint` in it fails (Nest answers `500`). Convert first (`value.toString()`, `date.toISOString()`), or go through the HTTP protocol, which encodes for you.

## See also

- [Filtering, sorting and paging](/docs/filtering-sorting-paging)
- [Results and typing](/docs/results-and-typing)
- [Exposing and hiding fields](/docs/exposing-and-hiding-fields)
- [HTTP protocol](/docs/http-protocol)
