---
title: Exposing and hiding fields
description: Hide fields, make them write-only or read-only, narrow their filters, and set different rules for your server code and for remote callers.
order: 20
section: guides
---

# Exposing and hiding fields

By default every column of your Prisma model is readable and writable. [Exposure](/docs/exposure) narrows that, per field and per layer: the application layer (your server-side code) and the client layer (remote callers, and the generated frontend client). A field you take away from a layer does not exist there: it is refused in inputs, outputs, filters, ordering and nested selections, it is missing from the contract, and the generated client's types do not have it.

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
  api: "/api",
  exposed: true,
  adapter: /* ... */,
  // The root: these apply to your server code and to remote callers.
  exemptions: {
    resources: {
      User: {
        fields: {
          // 1. write-only: can be set, never read back, filtered or sorted on
          passwordHash: ["select", "filter", "order"],
          // 2. read-only after creation, and no substring search
          email: { update: true, filter: ["contains", "startsWith", "endsWith"] },
        },
      },
    },
  },
  client: {
    exposed: true,
    exemptions: {
      resources: {
        // 3. hidden from remote callers only
        User: { fields: { settings: true } },
      },
    },
  },
} as const;
```

Under `exposed: true` an exemption names what to take away: `true` takes the whole field, a list takes those capabilities, and an object goes one level deeper, here into the `filter` capability's operators. Keep the `as const`: it lets TypeScript check Resource, field and capability names, so a misspelled field is a compile error.

### Write-only: no `select`

A write-only field can be sent on create and update, and is never returned. Asking for it is refused:

```bash
curl -X POST http://localhost:3000/api/_resources/User/find/many ... \
  -d '{"select":["id","passwordHash"]}'
```

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1008","path":["arguments","select",1],"message":"Field \"passwordHash\" is not selectable."}]}}
```

Without `filter` and `order` it also cannot be used in `where` or `orderBy`:

```json
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","where","passwordHash"],"message":"Filtering is not available on field \"passwordHash\"."}]}}
```

A plain `find.many({})` simply leaves the field out. A create that includes it works, and the response omits it:

```json
{"data":{"createdAt":"2026-10-06T22:53:19.937Z","email":"ada@example.com","id":1,"name":null,"role":"USER"},"code":"A1002","cause":null}
```

### Read-only: no `update` or no `create`

```bash
-d '{"where":{"id":1},"data":{"email":"x@example.com"}}'      # User/update/unique
```

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1006","path":["arguments","data","email"],"message":"Field \"email\" is not writable during update."}]}}
```

Exempting `create` does the same for create. An object under a capability narrows its tokens: `filter: ["contains", "startsWith", "endsWith"]` removes those three operators and keeps the rest. `{ email: { contains: "ada" } }` then answers `V1006` (`Filter operator "contains" is not available on field "email".`), and is a type error in the generated client and in `framework.client`, while `{ email: "ada@example.com" }` still works. The same works for directives: `views: { update: ["$multiply", "$divide"] }` keeps assignment, `$increment` and `$decrement`.

### Hidden: `true`

`settings: true` removes the field from the layer entirely. Under `client`, a remote caller gets:

```json
{"data":null,"code":"A2004","cause":{"message":"Operation arguments failed framework validation.","issues":[{"code":"V1005","path":["arguments","data","settings"],"message":"Field \"settings\" is not available on Resource \"User\"."}]}}
```

It is the same answer as for a field that never existed: a remote caller cannot tell hidden from absent. When the field is hidden in the `client` overlay (as here, for remote callers only), your own server code on the application layer still sees it. A field hidden at the root is hidden on the application layer too. Here:

```ts
const users = await this.framework.application.User.find.many({ select: ["id", "email", "settings"] });
// [{ id: 1, email: "ada@example.com", settings: null }]
```

Through `framework.client` (the same rules as a remote caller) the same call does not compile: `Type '"settings"' is not assignable to type 'AvProjectionEntry<...>'`. See [Server-side usage](/docs/server-side-usage).

## What the client contract shows

`GET /api/_contract` serves the client layer only. For `passwordHash` above it lists only what is allowed (it may be written, nothing else):

```json
"passwordHash": { "capabilities": { "create": [], "update": [] }, "kind": "scalar", "lifecycle": ["DEFAULTED"], "list": false, "nullable": false, "type": { "scalar": "string" } }
```

and for the read-only `email`, no `update` entry and the remaining filter operators:

```json
"email": { "capabilities": { "create": [], "filter": ["equals", "gt", "gte", "in", "lt", "lte", "not", "notIn"], "order": true, "select": true }, ... }
```

A hidden field (`settings`) is not in the contract at all. The generated frontend client is built from this contract, so its types follow it: hidden fields are not in `User`, `UserCreateData` or `UserSelect`. Regenerate the client after changing exposure ([Keeping in sync](/docs/keeping-in-sync)).

An empty list means "plain assignment only, no directives"; a missing entry means "not allowed".

## Options

Under `exposed: true`, on `exemptions.resources.<Resource>.fields.<field>`:

| Exemption | Effect |
|---|---|
| `true` | The field does not exist in this layer. |
| `["select"]` | Cannot be read. With `"filter"` and `"order"` too, the field is write-only. |
| `["create"]`, `["update"]` | Cannot be written on create, or on update (read-only). |
| `["filter"]`, `["order"]`, `["orderNulls"]` | Cannot be filtered on, sorted by, or given a `nulls` order (`orderNulls` exists on nullable fields only). |
| `{ filter: ["contains", ...] }` | Removes those filter operators and keeps the others. |
| `{ update: ["$multiply", ...] }` | Removes those directives (`$increment`, `$decrement`, `$multiply`, `$divide`, `$push`, `$unset`) and keeps the others. |
| a relation field: `["include"]`, `["pagination"]`, `["reducers"]`, `{ create: ["$connectOrCreate"] }`, ... | Narrows what a relation can do: `select`, `include`, `filter`, `order`, `pagination`, `reducers`, `create`, `update`. |

Exposure narrows what the model offers; it cannot add a capability the adapter does not have, and naming one it does not have stops startup (`COMPILER_UNAVAILABLE_CAPABILITY`).

To expose only a few fields instead of hiding a few, use `exposed: false` in the overlay and list what to expose: `fields: { id: ["select"], name: ["select", "update"] }`. A field you do not list is closed, including a column added to the schema later. See [Exposure](/docs/exposure#exposing-only-what-you-need-the-pick-style).

## Layers: root, application, client

An exemption at the root applies to both overlays. An exemption in `application` or `client` hides more for that origin only. An overlay can never expose what the root hid: to give your server code a field remote callers must not see, expose it at the root and hide it in `client`, as `settings` above. Asking an overlay for a field the root hid is a startup error that says so. See [Exposure](/docs/exposure#layers-overlays-only-narrow).

## Safety rules at startup

The framework refuses to start, with an `AvConstructionError`, when exposure would leave the contract inconsistent.

A hidden Resource with a visible relation to it (`COMPILER_DANGLING_RELATION`):

```ts
client: { exposed: true, exemptions: { resources: { Category: true } } }
// AvConstructionError: relation target "Category" is not present in the active Contract
//   client.resources.Post.fields.category.target
```

Hide the relation fields too:

```ts
client: {
  exposed: true,
  exemptions: {
    resources: {
      Category: true,
      Post: { fields: { category: true, categoryId: true } },
    },
  },
}
```

A hidden identifier: if a hidden field is part of an identifier, that identifier is dropped. The operations that need one (`find.unique`, `update.unique`, `delete.unique`, `upsert.unique`) need at least one complete identifier left, so hiding both `id` and `email` on `User` while they stay exposed is refused (`COMPILER_MISSING_IDENTIFIER`, naming the operation). Hide those operations too: `operations: { find: ["unique"], update: ["unique"], delete: ["unique"], upsert: true }`.

A hidden required field: a layer that still creates a Resource cannot hide a field every create must write (or exempt its `create`), or a required relation together with a field that holds its reference (`author` and `authorId`; for a composite reference, any one of its fields), unless a [`compute.create`](/docs/computed-fields) stage fills it. Hiding `Post.title` from the client while it can still create posts is refused (`COMPILER_HIDDEN_REQUIRED_FIELD`). Keep the field exposed, give it a `compute.create` stage, or hide the create operations too. A pipe that fills it is not enough. See [Exposure](/docs/exposure#creates-need-what-they-require).

## See also

- [Exposure](/docs/exposure): the whole grammar, operations, and the Pick style.
- [Computed fields](/docs/computed-fields): a write-only virtual `password` that fills `passwordHash`.
- [Authentication and guards](/docs/authentication-and-guards): who may call, rather than what they can see.
- [Configuration](/docs/configuration): the whole configuration shape.
