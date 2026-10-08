---
title: Restricting operations
description: Switch operations off per Resource and per layer, so remote callers can read but not delete, and see what that does to the contract and the generated client.
order: 21
section: guides
---

# Restricting operations

Every Resource gets the operations the adapter can perform: `find`, `create`, `update`, `delete` and `upsert`, each with its variants. `restrictions.<Resource>.operations` switches individual variants off. It cannot redefine them, because the semantics of a standard operation belong to the framework.

## Remote callers cannot delete

```ts
// src/aventara.config.ts
return {
  entrypoint: "/api",
  adapter: /* ... */,
  client: {
    restrictions: {
      User: {
        operations: { delete: { unique: false, first: false, count: false } },
      },
    },
  },
} as const;
```

`User` has three delete variants (`delete.first`, `delete.unique`, `delete.count`), and all three are off for the client layer. The application layer is untouched, so your own server code can still delete.

A remote caller that tries:

```bash
curl -i -X POST http://localhost:3000/api/_resources/User/delete/unique ... -d '{"where":{"id":1}}'
```

```json
{"data":null,"code":"A2002","cause":{"message":"Operation arguments failed framework validation.","issues":[{"path":["variant"],"code":"V1006","message":"Operation \"delete.unique\" is not available on Resource \"User\"."}]}}
```

with HTTP status `404`: the route is not mounted. The regenerated frontend client has no `avClient.User.delete`, and a call to it does not compile.

## Variants you can switch off

| Family | Variants |
|---|---|
| `find` | `first`, `unique`, `many`, `count` |
| `create` | `one`, `many`, `count` |
| `update` | `first`, `unique`, `many`, `count` |
| `delete` | `first`, `unique`, `count` |
| `upsert` | `unique` |

Name the variants you want off with `false`. Naming a variant the Resource does not have (for example `delete.many`, which does not exist) stops the application at startup with `COMPILER_UNAVAILABLE_OPERATION`. Setting a whole family to `false` (`delete: false`) has no effect: list its variants.

The result is visible in the contract:

```json
"operations": {
  "create": { "count": {...}, "many": {...}, "one": true },
  "delete": { "count": true, "first": true, "unique": true },
  "find":   { "count": true, "first": true, "many": true, "unique": true },
  "update": { "count": {...}, "first": true, "many": {...}, "unique": true },
  "upsert": { "unique": true }
}
```

A family with no variant left is omitted from the contract (here `delete`, for `User`).

## Root, application and client

Operation restrictions follow the same layering as the rest of the configuration ([Configuration](/docs/configuration#root-and-layer-overrides)): the root applies to both layers, and a layer overrides the root for the variants it names.

```ts
restrictions: {
  Post: { operations: { delete: { count: false } } },          // root: off for both layers
},
client: {
  restrictions: {
    Post: { operations: { delete: { count: true } } },         // client: restored
  },
},
```

With that configuration:

```bash
# application layer, Post.delete.count
{ data: null, code: 'A2002', cause: { ... "Operation \"delete.count\" is not available on Resource \"Post\"." } }
# client layer, Post.delete.count
{ data: 0, code: 'A1007', cause: null }
```

An explicit value in a layer always wins over the root, so you can switch an operation off for everyone and restore it for one layer, or the other way round. This is how you give your own server code more power than a remote caller:

| Goal | Configuration |
|---|---|
| Remote callers read only | `client.restrictions.<R>.operations`: switch off every `create`, `update`, `delete` and `upsert` variant. |
| Nobody deletes | Root: switch off the `delete` variants. |
| Only the server deletes | `client`: switch off the `delete` variants; leave the root alone. |
| Everyone but one operation | Root: switch it off; restore it under the layer that needs it. |

## Hiding a whole Resource

```ts
client: {
  restrictions: {
    Category: { hidden: true },
    Post: { fields: { category: { hidden: true }, categoryId: { hidden: true } } },
  },
},
```

A hidden Resource is not in the contract and not routable (`A2001`, "Resource "Category" is not available in the active Contract."). Every visible relation that pointed at it must be hidden too, or the application refuses to start; see [Exposing and hiding fields](/docs/exposing-and-hiding-fields#safety-rules-at-startup).

## After changing operations

The contract served to remote callers changed, so its hash changed: regenerate the frontend client (`npm run avclient:generate`). A client generated before the change is refused on every call with `A2005` (`ContractMismatchError`, "Generated client contract does not match the server. Regenerate the client.") until you regenerate it.

## Operations are not authorization

Switching an operation off removes it for everyone in that layer. To allow it for some callers and not others (admins may delete, users may not), use a [guard](/docs/authentication-and-guards).

## See also

- [Authentication and guards](/docs/authentication-and-guards)
- [Exposing and hiding fields](/docs/exposing-and-hiding-fields)
- [Server-side usage](/docs/server-side-usage): the application layer from your own code.
- [Configuration](/docs/configuration)
