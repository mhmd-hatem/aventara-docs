---
title: Exposure
description: Decide what each layer exposes with exposed and exemptions - hide Resources, fields, operations, capabilities and single operators, in Omit or Pick style, with overlays that only narrow.
order: 19
section: guides
---

# Exposure: `exposed` and `exemptions`

Every layer of the configuration (the root, `application` and `client`) says what it exposes with two keys:

- `exposed` is the layer's default: `true` exposes everything the layer above offers, `false` exposes nothing.
- `exemptions` lists the entries that are the opposite of that default.

So under `exposed: true` the exemptions are what you hide (an Omit), and under `exposed: false` they are the only things you expose (a Pick). Exposure decides which Resources, operations, fields, field capabilities and single operators or directives end up in each [contract](/docs/contract-layers). It only takes away from what the adapter offers, and never adds an operation or a capability the adapter lacks.

A project made by `aventara new` or `aventara init` sets no `exposed` and no exemptions. `exposed` defaults to `true`, so everything Prisma offers is exposed:

```ts
// src/aventara.config.ts
import type { AvDiagnostic } from '@aventara/core';
import { Logger } from '@nestjs/common';
import { aventaraResources } from './generated/aventara/resources.generated.js';

const logger = new Logger('Aventara');

export const aventaraConfig = {
  api: '/api',
  // Everything the adapter offers is exposed. List what to hide under
  // `exemptions`, or set `exposed: false` and list what to expose instead.
  // See: https://aventara.razor34.dev/framework/docs/exposure
  // Every Resource you define with defineResource() in its own file under
  // src/resources/ (named <name>.resource.ts), gathered by aventara-build in
  // the aventara:prepare script: a new Resource file needs no line here. When
  // a Resource gives a layer a block, that layer takes its tree once, e.g.
  //   client: { resources: aventaraResources.client },
  resources: aventaraResources.root,
  // When something fails inside the server, the caller gets a plain 500 and
  // Aventara logs one line naming the request. This logs the error itself,
  // with its stack, through Nest's logger.
  diagnostics: (diagnostic: AvDiagnostic) => {
    const { error } = diagnostic;
    logger.error(
      `${diagnostic.code} (request ${diagnostic.requestId}): raw error`,
      (error instanceof Error && error.stack) || String(error),
    );
  },
} as const;
```

## The two styles

| | `exposed: true` (Omit) | `exposed: false` (Pick) |
|---|---|---|
| Starts from | everything the layer above offers | nothing |
| `exemptions` lists | what to hide | what to expose |
| A Resource or column added to the schema later | exposed | closed until you exempt it |
| Good for | a server that exposes most of its schema | a public client that should reach only what the frontend calls |

The root's `exposed` defaults to `true`. An overlay (`application` or `client`) that sets `exemptions` must also set its own `exposed`.

## Reading an exemption

The same four values work at every level, and each is read relative to the layer's `exposed`:

| Value | Under `exposed: true` | Under `exposed: false` |
|---|---|---|
| `true` | Hide this entry and everything under it. | Expose this entry and everything the layer above offers under it. |
| `false` | Nothing: the entry follows `exposed`. Same as leaving it out. | Nothing: the entry stays closed. Same as leaving it out. |
| a list | Hide the listed entries one level down. | Expose only the listed entries one level down. |
| an object | Go one level deeper; anything it does not name is exposed. | Go one level deeper; anything it does not name is closed. |
| `"read"` (a field, or a Resource's `fields`) | Hide every read capability of the field; its writes stay. | Expose every read capability the layer above offers, and no write. |

An empty list exempts nothing. A list always means "exempt these", relative to `exposed`.

`"read"` names the capabilities a caller reads with: a scalar's `select`, `filter`, `order` and `orderNulls`, and a relation's `select`, `include`, `filter`, `order`, `pagination` and `reducers`, whichever the field has. On a Resource's `fields` it means the same for every field. It is shorthand: it compiles to the same contract as the list it stands for, so the hash does not change when you switch between them.

## The shape

```ts
exemptions: {
  resources: {
    <Resource>: true | false | {
      operations?: true | false | <family>[] | {
        <family>?: true | false | <variant>[] | { <variant>?: true | false },
      },
      fields?: "read" | {
        <field>?: true | false | "read" | <capability>[] | {
          <capability>?: true | false | <token>[],
        },
      },
    },
  },
}
```

A Resource takes `true`, `false` or an object; there is no list directly on a Resource. Operations use the same nesting as `resources.<Resource>.operations`: `{ find: ["many"], update: { unique: true } }`. There are no `"family.variant"` strings.

| Level | Names you can list |
|---|---|
| `operations` | the families `find`, `create`, `update`, `delete`, `upsert` |
| a family | its variants (`find`: `first`, `unique`, `many`, `count`; `create`: `one`, `many`, `count`; `update`: `first`, `unique`, `many`, `count`; `delete`: `first`, `unique`, `count`; `upsert`: `unique`) |
| a scalar field | the capabilities `select`, `filter`, `order`, `orderNulls`, `create`, `update` |
| a relation field | the capabilities `select`, `include`, `filter`, `order`, `pagination`, `reducers`, `create`, `update` |
| a capability that takes tokens | scalar `filter`: operators (`equals`, `in`, `contains`, ...); scalar `create`/`update`: directives (`$increment`, `$push`, ...); relation `filter`: `nested`, `match`, `null`, `some`, `every`, `none`; `pagination`: `limit`, `offset`, `cursor`; `reducers`: `$count`; relation `create`/`update`: `$create`, `$connect`, `$connectOrCreate`, `$disconnect`, `$set`, `$update`, `$delete`, `$upsert` |

`select`, `include`, `order` and `orderNulls` are on or off, so they take `true` or `false`, not a token list. With the Prisma 7 adapter there is no `delete.many`; naming it is a startup error.

Exemptions only work with what is there. Plain assignment comes with the `create` or `update` capability itself: a token list under `update` narrows the directives (`$increment`, ...), never assignment.

## Hiding things: the Omit style

```ts
export const aventaraConfig = {
  api: "/api",
  // Root: exposed defaults to true, so these are hidden from every origin.
  exemptions: {
    resources: {
      User: {
        fields: {
          passwordHash: "read",                             // write-only
          email: { filter: ["contains", "startsWith", "endsWith"] }, // fewer operators
        },
      },
    },
  },
  client: {
    exposed: true,
    exemptions: {
      resources: {
        AuditLog: true,                                      // remote callers never see it
        User: {
          operations: { delete: true, update: ["many", "count"] },
          fields: { internalNotes: true },
        },
      },
    },
  },
} as const;
```

What each layer gets:

| | Application (your server code) | Client (remote callers, generated client) |
|---|---|---|
| `User.passwordHash` | write-only | write-only |
| `User.email` filters | `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte` | the same |
| `User.internalNotes` | readable and writable | absent |
| `User` deletes, `update.many`, `update.count` | offered | absent |
| `AuditLog` | offered | absent |

## Exposing only what you need: the Pick style

Under `exposed: false`, nothing is exposed until an exemption names it. This is a good default for the `client` overlay of a public frontend, because a Resource or a column added to the schema later stays closed until you add it:

```ts
client: {
  exposed: false,
  exemptions: {
    resources: {
      Post: {
        operations: { find: ["many", "unique"], create: ["one"] },
        fields: {
          id: ["select", "filter", "order"],
          title: ["select", "create", "filter"],
          body: ["select", "create"],
          createdAt: ["select", "order"],
          author: { select: true, create: ["$connect"] },
        },
      },
      User: { fields: { id: ["select"], name: ["select"] } },
    },
  },
},
```

The client contract then has `Post` with `find.many`, `find.unique` and `create.one`, and five fields with exactly those capabilities. `Post.id` has `filter` because `find.unique` looks a post up by it. `User` has no operations: it is there only as the target of `Post.author`, with `id` and `name` readable through it. `Post.author` can be selected and written with `$connect` only.

Under `exposed: false`, an object that grants nothing (`{}`, `{ select: false }`, `{ create: [] }`, or a Resource object that grants no field and no operation) is the same as leaving the entry out: the name does not reach the contract, and the hash is the same either way.

### A read-only Resource: `fields: "read"`

To let remote callers read a Resource whole without listing every field, give it `fields: "read"`:

```ts
client: {
  exposed: false,
  exemptions: {
    resources: {
      Category: { operations: { find: true }, fields: "read" },
      Post: {
        operations: { find: true },
        fields: { id: "read", title: "read", category: "read" },
      },
    },
  },
},
```

Every field of `Category` can be selected, filtered on, sorted by and, for a relation, included and paged, as far as the root allows; none can be written. A field the root hid stays hidden, and a capability the root took away (a filter, say) does not come back: `"read"` only asks for what the layer above offers. A field whose every read capability the root hid (a write-only `passwordHash`) is left out.

`fields: "read"` names every field, relations included. A relation into a Resource the layer does not expose then has no target, and startup fails with `COMPILER_DANGLING_RELATION`, as it would for `true` on that relation. Expose the target too, or list the fields one by one. A read-only Resource takes no nested write either: a relation into it that still offers `$create` is refused at startup (`COMPILER_READ_ONLY_NESTED_WRITE`, see [Read-only means no nested write](#read-only-means-no-nested-write)), so grant that relation `create: ["$connect"]`.

## Layers: overlays only narrow

| Layer | Its starting point | What its `exposed` decides |
|---|---|---|
| Root | the adapter's model | Omit or Pick over everything the adapter offers. The result is the core contract. |
| `application` | the root's final view | Omit or Pick over what the root exposes. |
| `client` | the root's final view | Omit or Pick over what the root exposes. |

- An overlay never widens. Exposing in an overlay what the root hid is a startup error, and the message names the other overlay as the place to hide it instead. With `internalNotes: true` in the root's exemptions and a `client` overlay under `exposed: false` that grants `internalNotes: ["select"]`, `createFramework` throws an `AvConstructionError` shaped like this:

  ```ts
  {
    stage: "contract-compilation",
    diagnostics: [
      {
        code: "COMPILER_UNAVAILABLE_CAPABILITY",
        path: "client.exemptions.resources.User.fields.internalNotes",
        message:
          'field "User.internalNotes" is hidden by the root, and an overlay only narrows the root\'s view; expose it at the root and hide it in application instead',
      },
    ],
  }
  ```

  This page writes each diagnostic in short, as its stage, code and path, then its message:

  ```text
  contract-compilation  COMPILER_UNAVAILABLE_CAPABILITY  client.exemptions.resources.User.fields.internalNotes
    field "User.internalNotes" is hidden by the root, and an overlay only narrows the root's view; expose it at the root and hide it in application instead
  ```

  The root is therefore the union of what both origins need. Something only the server may reach is exposed at the root and hidden in the `client` overlay.

  TypeScript catches it first. A Resource, field, operation or capability that an overlay under `exposed: false` names after the root hid it is typed as a sentence that says so. When the configuration is built in a function and handed to `AventaraModule.forRootAsync`, as the scaffold's `aventaraConfig` is (spread into `useFactory`'s result), TypeScript reports a chain of types from `useFactory` down to the key, and the chain ends with that sentence:

  ```text
  The types of 'client.exemptions.resources.User.fields.internalNotes' are incompatible between these types.
    Property '"Error: client cannot expose 'User.internalNotes': hidden by root"' is missing in type 'readonly ["select"]' but required in type '{ readonly "Error: client cannot expose 'User.internalNotes': hidden by root": true; }'.
  ```

  The agent layer's sentence names the layer it extends: `Error: agent cannot expose 'Post.body': hidden by client`. In a configuration written inline in `createFramework({ ... })` or `AventaraModule.forRoot`, the error sits on the entry itself and its last line names the same sentence: `Property '"Error: client cannot expose 'User.internalNotes': hidden by root"' is missing in type '["select"]' but required in type '{ readonly "Error: client cannot expose 'User.internalNotes': hidden by root": true; }'`. An entry written `true` names it too: through `aventaraConfig` the chain ends at `Type 'boolean' is not assignable to type 'readonly ["Error: client cannot expose 'Comment': hidden by root"]'`, and inline the error on the entry carries it: `Type 'true' is not assignable to type 'true & (readonly ["Error: client cannot expose 'Comment': hidden by root"] & …`.
- An overlay with no exposure keys, or with `exposed: true` alone, has the root's view.
- An overlay with `exposed: false` alone exposes nothing.
- An overlay that sets `exemptions` without `exposed` is refused (`CONFIG_REQUIRED` at `client.exposed`: `client.exposed is required when client.exemptions is set: true makes the exemptions hide, false makes them the only entries exposed`).
- Under `exposed: true`, hiding in an overlay something the root already hid does nothing, and is not an error.

`application` and `client` are separate: an application call only sees the `application` overlay, a remote call only the `client` overlay.

## Operations

To switch operations off for remote callers, exempt them in the `client` overlay:

```ts
client: {
  exposed: true,
  exemptions: {
    resources: {
      User: { operations: { delete: true } },                     // the whole family
      Post: { operations: { update: ["many", "count"] } },        // two variants
    },
  },
},
```

The application layer is untouched, so your own server code can still delete users. A remote caller that tries gets `404`:

```json
{"data":null,"code":"A2002","cause":{"message":"The requested operation is not available on this Resource.","issues":[{"path":["family"],"code":"V1006","message":"Operation \"delete.unique\" is not available on Resource \"User\"."}]}}
```

The route is not mounted, and the regenerated frontend client has no `avClient.User.delete`, so a call to it does not compile. A family with no variant left is omitted from the contract. A relation into `User` loses its nested `$delete` in that layer too, so no client deletes a user through another Resource (see [No nested `$delete` without a delete operation](#no-nested-delete-without-a-delete-operation)).

| Goal | Configuration |
|---|---|
| Remote callers read only | `client`, `exposed: true`: `operations: ["create", "update", "delete", "upsert"]` on each Resource; or `exposed: false` and grant only `find` variants. |
| Nobody deletes | Root: `operations: { delete: true }`. The relations into the Resource lose `$delete` with it. |
| Only the server deletes | `client`, `exposed: true`: `operations: { delete: true }`; leave the root alone. |
| The server may not bulk-update | `application`, `exposed: true`: `operations: { update: ["many", "count"] }`. |

An operation the root removed cannot be given back to one overlay. Expose it at the root and remove it from the overlay that must not have it.

## Hiding a whole Resource

```ts
client: {
  exposed: true,
  exemptions: {
    resources: {
      Category: true,
      Post: { fields: { category: true, categoryId: true } },
    },
  },
},
```

A hidden Resource is not in the contract and not routable (`404 A2001`, issue `Resource "Category" is not available in the active Contract.`). Every relation that still points at it must be hidden too, or the framework refuses to start:

```text
contract-compilation  COMPILER_DANGLING_RELATION  client.resources.Post.fields.category.target
  relation target "Category" is not present in the active Contract
```

Under `exposed: false` the same rule holds: a relation you grant needs its target Resource exposed (at least one of its fields).

## Unique operations need an identifier

`find.unique`, `update.unique`, `delete.unique` and `upsert.unique` address a record by an identifier, so a layer that exposes one must also expose a complete identifier of the Resource. Picking a unique variant without the identifier's fields, or hiding every identifier while a unique variant stays exposed, is refused at startup:

```text
contract-compilation  COMPILER_MISSING_IDENTIFIER  client.exemptions.resources.User.operations.find.unique
  client.exemptions.resources.User.operations.find.unique needs an identifier field; pick `id` (or another complete identifier) too
```

An identifier field counts only where the layer can filter on it: a Pick of `id: ["select"]` without `"filter"` leaves no identifier, and a unique field with its `filter` exempted is refused as a selector (`V1007`). Under `exposed: true` the message says to keep an identifier exposed, or to exempt the operation too. A hidden field that is part of one identifier only removes that identifier; the unique operations stay as long as another complete identifier is left.

## Creates need what they require

A layer that still creates a Resource must let callers write each of its [create requirements](/docs/resources-and-operations#what-a-create-requires), or fill it on the server with a [`compute.create`](/docs/computed-fields) stage. "Still creates" means any `create` or `upsert` operation of the Resource, or a nested create into it (`$create`, `$connectOrCreate`, `$upsert`) through a relation of a Resource the layer writes. A requirement no caller of the layer can write is refused at startup: a required field you hide, or keep visible but exempt from `create` (`title: ["create"]`), and a required relation you hide (or make unwritable on create) together with a field that holds its reference. A composite reference (`editionPublisher` and `editionCode`) is written whole, so hiding the relation and only one of its fields is enough to be refused:

```ts
client: { exposed: true, exemptions: { resources: { Post: { fields: { author: true, authorId: true } } } } }
```

```text
contract-compilation  COMPILER_HIDDEN_REQUIRED_FIELD  client.exemptions.resources.Post.fields.author
  the client layer still creates resource "Post" (create.count, create.many, create.one, upsert.unique; nested through "Category.posts") but hides its required relation "author" and its reference field "authorId", which every create must write; expose "author" or "authorId", give "authorId" a compute.create, or exempt the create operation
```

The message lists every way the layer still creates the Resource, and says "hides" for a hidden field and "cannot be written on create" for one whose `create` you exempted. Any one fix is enough:

- expose one side: hide `author` or `authorId`, not both;
- fill a hidden field with a `compute.create` stage, at the root or in that layer (a relation itself takes no compute, so give its reference field one; for a composite reference, every field you hide needs one);
- exempt the create operations, `operations: { create: true, upsert: true }`, and the nested creates the message names.

### Bulk creates need the reference field

A `create.many` or `create.count` record cannot write a relation, only the fields that hold its reference. So a layer that keeps those variants cannot hide `authorId`, even while `author` stays exposed for `create.one`:

```ts
client: { exposed: true, exemptions: { resources: { Post: { fields: { authorId: true } } } } }
```

```text
contract-compilation  COMPILER_HIDDEN_REQUIRED_FIELD  client.exemptions.resources.Post.fields.authorId
  the client layer still creates resource "Post" in bulk (create.count, create.many) but hides its reference field "authorId", which every bulk create must write: a bulk record cannot write the relation "author"; expose "authorId", give "authorId" a compute.create, or exempt create.count and create.many
```

Keep `authorId` exposed, give it a `compute.create`, or exempt the bulk variants in that layer: `Post: { fields: { authorId: true }, operations: { create: ["many", "count"] } }`. The client's `create.one` then takes `author`, and its bulk creates are gone. For a composite reference, every field you hide needs the same fix.

A [pipe](/docs/pipelines) that fills the hidden field does not count: the compiler cannot see what a pipe writes. A nested create gets the relation it is nested through from its parent, so hiding `author` and `authorId` does not stop `User.posts.$create`. Under `exposed: false`, a required field you do not pick is hidden the same way. The layer that hides the field reports it, once: when the root hides it, the overlays do not repeat the error.

## Read-only means no nested write

A Resource a layer lets no caller create (no `create` or `upsert` operation, and no field writable on create) cannot be created through a relation either. A relation that still offers `$create`, `$connectOrCreate` or `$upsert` into it, in a layer that creates or updates the other side, is refused at startup. It does not matter how the Resource became read-only (`fields: "read"`, capability lists, or exempted operations), or whether it has required fields: without this rule a nested `category: { $create: {} }` into a Resource with no required field would create a row the layer never lets anyone write.

```ts
client: {
  exposed: false,
  exemptions: {
    resources: {
      Category: { operations: { find: true }, fields: "read" },
      Post: {
        operations: { create: ["one"] },
        fields: { title: true, authorId: true, category: ["select", "create"] },
      },
    },
  },
},
```

```text
contract-compilation  COMPILER_READ_ONLY_NESTED_WRITE  client.exemptions.resources.Post.fields.category
  the client layer lets relation "Post.category" write rows of resource "Category" ($create, $connectOrCreate), but "Category" is read-only in that layer: it has no create operation and no field writable on create; take $create and $connectOrCreate off "Post.category" (keep only the directives it may use, such as $connect), or give "Category" a create operation or a field writable on create
```

Let the relation only link to existing rows, `category: { select: true, create: ["$connect"] }`, or give the target a create operation or a field writable on create in that layer. The same rule holds on the update side: a relation that offers `$update` or `$upsert` into a Resource the layer gives no `update` or `upsert` operation and no field writable on update is refused with the same code. Linking (`$connect`, `$disconnect`, `$set`) stays allowed. The layer that makes the Resource read-only reports it, once, and such a create is not also reported as a hidden required field.

### No nested `$delete` without a delete operation

A relation's `$delete` deletes rows of the Resource it points at, so a layer that gives that Resource no `delete` operation does not offer it through a relation either. What happens depends on the style of the layer that leaves the delete out. Each layer goes by its own `exposed`, never by its parent's.

- **`exposed: true`.** A relation inherits every directive the layer above offers, so you never chose `$delete` for it. The framework drops `$delete` from each relation into the Resource, and startup succeeds. The contract the layer serves lists one directive fewer on those relations, so a client-side change moves the ClientContract hash: regenerate the frontend client. A call that sends `$delete` there anyway gets `A2004` with `V1006` at the directive. When `$delete` was the relation's only update directive, its update goes with it, and the call gets `V1006` `Relation "posts" is not writable during update.` at the relation. If that leaves a Resource with nothing writable on update, the nested `$update` and `$upsert` into it go the same way, so the layer still starts. A layer below with `exposed: false` that names one of those (`author: { update: ["$update"] }`) is refused at startup with `COMPILER_READ_ONLY_NESTED_WRITE`: the message says the target updates nothing in the layer above. Give the target an update operation or a field writable on update there, or leave the directive out.
- **`exposed: false`.** A relation carries only what you grant it: `true` on the Resource or the field, the relation's `update`, or `$delete` by name. Granting `$delete` into a Resource with no delete operation, on a relation callers can reach, is refused at startup with the same `COMPILER_READ_ONLY_NESTED_WRITE`.

```ts
client: {
  exposed: false,
  exemptions: {
    resources: {
      User: {
        operations: { find: ["unique"], update: ["unique"] },
        fields: { id: ["select", "filter"], posts: { select: true, update: ["$connect", "$delete"] } },
      },
      Post: { operations: { find: ["many"] }, fields: { id: ["select", "filter"], title: ["select"] } },
    },
  },
},
```

```text
contract-compilation  COMPILER_READ_ONLY_NESTED_WRITE  client.exemptions.resources.User.fields.posts
  the client layer lets relation "User.posts" delete rows of resource "Post" ($delete), but "Post" has no delete operation in that layer; take $delete off "User.posts" (keep only the directives it may use, such as $connect), or give "Post" a delete operation
```

Grant the relation only what links rows, `posts: { select: true, update: ["$connect", "$disconnect", "$set"] }`, or give `Post` a delete operation in that layer.

A layer starts from what the layer above it serves. Under a root with `exposed: true` that dropped `$delete`, a client with `exposed: false` that grants `posts: ["select", "update"]` gets the relation's update directives without `$delete`, and starts. Naming `$delete` there is refused with `COMPILER_READ_ONLY_NESTED_WRITE`, not as a widening, since the root left `$delete` out only because it deletes no posts. The same holds further down, for an agent that extends that client. If `$delete` was the relation's only update directive, there is no update left to grant, and `posts: ["select", "update"]` is refused the same way: grant `posts: ["select"]`. A `$delete` the root hid on purpose (`posts: { update: ["$delete"] }` under `exposed: true`) is a widening, as for any other hidden token.

## Every name must exist

Every Resource, field, family, variant, capability and token in `exemptions` must exist in your model and be something the adapter offers, in both styles. A typo, or a real capability the adapter does not have, is a startup error with the path of the entry:

| Mistake | Code |
|---|---|
| A Resource the model does not have | `COMPILER_UNKNOWN_RESOURCE` |
| A field the Resource does not have | `COMPILER_UNKNOWN_FIELD` |
| An operation the adapter does not offer (`delete.many` with Prisma) | `COMPILER_UNAVAILABLE_OPERATION` |
| A capability or token the field does not offer (`orderNulls` on a required field, `contains` on an `Int`) | `COMPILER_UNAVAILABLE_CAPABILITY` |
| An rc.0 `hidden` key, or a `capabilities` key inside an exemption | `CONFIG_MOVED_PROPERTY` |

In a configuration TypeScript checks against your model (written inline in `createFramework({ ... })` or `AventaraModule.forRoot`), each of these is a type error at the key first.

## What it changes

Exposure is compiled into each contract, so it changes:

- what the server accepts and returns in that layer: a hidden field is refused in inputs, outputs, filters, ordering and nested selections, with the same answer as a field that never existed (`V1005`);
- the types of `framework.application`, `framework.client`, `appTx` and `clientTx` ([Server-side usage](/docs/server-side-usage));
- for the `client` layer, the served contract, its [hash](/docs/contract-hash) and the generated client's types. Regenerate the client after a change (`npm run avclient:generate`); an old client is answered `A2005` until you do.

Exposure is not authorization. It removes something for everyone in a layer. To allow an operation for some callers and not others (admins may delete, users may not), use a [guard](/docs/authentication-and-guards).

## Coming from `restrictions`

`restrictions` is gone; a configuration that still has it is refused at startup with `CONFIG_MOVED_PROPERTY`, naming `exposed` + `exemptions`. Two things read differently:

- rc.0's `filter: ["equals"]` meant "keep only `equals`". A list now always means "exempt these", so under `exposed: true` write the operators to remove.
- rc.0 let an overlay bring back what the root hid (`hidden: false`). That is now refused: expose it at the root and hide it in the other overlay.

The full mapping is in [Upgrading](/docs/upgrading#from-100-rc0-to-100-rc1).

## See also

- [Exposing and hiding fields](/docs/exposing-and-hiding-fields): write-only, read-only and hidden fields, step by step.
- [Contract layers](/docs/contract-layers): what each layer is for.
- [Configuration reference](/docs/config-reference#exposed-and-exemptions)
- [Authentication and guards](/docs/authentication-and-guards)
