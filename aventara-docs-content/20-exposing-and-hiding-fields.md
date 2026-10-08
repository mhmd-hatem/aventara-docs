---
title: Exposing and hiding fields
description: Hide fields, make them write-only or read-only, and set different rules for the server and for remote callers.
order: 20
section: guides
---

# Exposing and hiding fields

By default every column of your Prisma model is readable and writable. `restrictions` narrows that, per field, and per layer: the application layer (your server-side code) and the client layer (remote callers, and the generated frontend client). A field you take away from a layer does not exist there: it is refused in inputs, outputs, filters, ordering and nested selections, it is missing from the contract, and the generated client's types do not have it.

The examples use this schema (the `User` model of a project created with `aventara new`, extended):

```prisma
model User {
  id           Int      @id @default(autoincrement())
  email        String   @unique
  name         String?
  passwordHash String   @default("")
  role         Role     @default(USER)
  settings     Json?
  createdAt    DateTime @default(now())
  posts        Post[]
}
```

## Three things you can do to a field

```ts
// src/aventara.config.ts
return {
  entrypoint: "/api",
  adapter: /* ... */,
  restrictions: {
    User: {
      fields: {
        // 1. write-only: can be set, never read back, filtered or sorted on
        passwordHash: { capabilities: { select: false, filter: false, order: false } },
        // 2. read-only after creation
        email: { capabilities: { update: false, filter: ["equals"] } },
      },
    },
  },
  client: {
    restrictions: {
      // 3. hidden from remote callers only
      User: { fields: { settings: { hidden: true } } },
    },
  },
} as const;
```

Keep the `as const`: it lets TypeScript check Resource and field names, so a misspelled field is a compile error.

### Write-only: `select: false`

A write-only field can be sent on create and update, and is never returned. Asking for it is refused:

```bash
curl -X POST http://localhost:3000/api/_resources/User/find/many ... \
  -d '{"select":["id","passwordHash"]}'
```

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1008","path":["arguments","select",1],"message":"Field \"passwordHash\" is not selectable."}]}}
```

With `filter: false` and `order: false` it also cannot be used in `where` or `orderBy`:

```json
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","where","passwordHash"],"message":"Filtering is not available on field \"passwordHash\"."}]}}
```

A plain `find.many({})` simply leaves the field out. A create that includes it works, and the response omits it:

```json
{"data":{"avatar":null,"createdAt":"2026-10-06T22:53:19.937Z","email":"ada@example.com","id":1,"name":null,"role":"USER"},"code":"A1002","cause":null}
```

### Read-only: `update: false` or `create: false`

```bash
-d '{"where":{"id":1},"data":{"email":"x@example.com"}}'      # User/update/unique
```

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1006","path":["arguments","data","email"],"message":"Field \"email\" is not writable during update."}]}}
```

`create: false` does the same for create. Restricting `filter` to a list narrows the operators: with `filter: ["equals"]`, `{ email: { contains: "ada" } }` answers `V1006` ("Filter operator "contains" is not available on field "email""), while `{ email: "ada@example.com" }` still works.

### Hidden: `hidden: true`

`hidden: true` removes the field from the layer entirely. Under `client`, a remote caller gets:

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1005","path":["arguments","data","settings"],"message":"Field \"settings\" is not available on Resource \"User\"."}]}}
```

It is the same answer as for a field that never existed: a remote caller cannot tell hidden from absent. When the field is hidden by `client.restrictions` (as here, for remote callers only), your own server code on the application layer still sees it. A field hidden at the root is hidden on the application layer too. Here:

```ts
const res = await this.framework.application.User.find.many({ select: ["id", "email", "settings"] });
// res.data -> [{ id: 1, email: "ada@example.com", settings: null }]
```

Through `framework.client` (the same rules as a remote caller) the same call does not compile: `Type '"settings"' is not assignable to type 'ProjectionEntry<...>'`. See [Server-side usage](/docs/server-side-usage).

## What the client contract shows

`GET /api/_contract` serves the client layer only. For `passwordHash` above it lists only what is allowed (it may be written, nothing else):

```json
"passwordHash": { "capabilities": { "create": [], "update": [] }, "kind": "scalar", "lifecycle": ["DEFAULTED"], "list": false, "nullable": false, "type": { "scalar": "string" } }
```

and for the read-only `email`, no `update` entry and a single filter operator:

```json
"email": { "capabilities": { "create": [], "filter": ["equals"], "order": true, "select": true }, ... }
```

A hidden field (`settings`) is not in the contract at all. The generated frontend client is built from this contract, so its types follow it: hidden fields are not in `User`, `UserCreateData` or `UserSelect`. Regenerate the client after changing restrictions ([Frontend client](/docs/keeping-in-sync)).

An empty list means "plain assignment only, no directives"; a missing entry means "not allowed".

## Options

| Where | Option | Effect |
|---|---|---|
| Field | `hidden: true` | The field does not exist in this layer. |
| Scalar field | `capabilities.select: false` | Cannot be read (write-only). |
| Scalar field | `capabilities.filter` | `false`, or a list of allowed operators (`["equals", "in"]`). |
| Scalar field | `capabilities.order` / `orderNulls` | `false` forbids sorting. |
| Scalar field | `capabilities.create` / `update` | `false`, or a list of allowed directives (`"$increment"`, `"$decrement"`, `"$multiply"`, `"$divide"`). |
| Relation field | `capabilities.select` / `include` / `filter` / `order` / `pagination` / `reducers` / `create` / `update` | Narrow what a relation can do. |

Restrictions narrow what the model offers; they cannot add a capability it does not have.

## Layers: root, application, client

`restrictions` at the root applies to both layers. `application.restrictions` and `client.restrictions` override the root for one layer. For a given field property, a value set at the layer wins; otherwise the root value is used. `false` counts as set, so a layer can narrow what the root allows. See [Configuration](/docs/configuration#root-and-layer-overrides).

## Safety rules at startup

The framework refuses to start, with a `FrameworkConstructionError`, when a restriction would leave the contract inconsistent.

A hidden Resource with a visible relation to it (`COMPILER_DANGLING_RELATION`):

```ts
client: { restrictions: { Category: { hidden: true } } }
// FrameworkConstructionError: relation target "Category" is not present in the active Contract
//   client.resources.Post.fields.category.target
```

Hide the relation fields too:

```ts
client: {
  restrictions: {
    Category: { hidden: true },
    Post: { fields: { category: { hidden: true }, categoryId: { hidden: true } } },
  },
}
```

A hidden identifier: if a hidden field is part of an identifier, that identifier is dropped. If no identifier is left, the operations that need one (`find.unique`, `update.unique`, `delete.unique`, `upsert.unique`) disappear from that Resource. Hiding both `id` and `email` on `User` for remote callers leaves `identifiers: []` and only `find.first`, `find.many`, `find.count`, the `create` family, `update.first`/`many`/`count` and `delete.first`/`count`.

## See also

- [Restricting operations](/docs/restricting-operations): switch operations off per layer.
- [Computed fields](/docs/computed-fields): a write-only virtual `password` that fills `passwordHash`.
- [Authentication and guards](/docs/authentication-and-guards): who may call, rather than what they can see.
- [Configuration](/docs/configuration): the whole config shape.
