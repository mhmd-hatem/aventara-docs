---
title: Contract layers
description: The core, application and client contracts compiled from one schema, how root and per-layer configuration combine, and why the frontend only ever sees the client layer.
order: 11
section: concepts
---

# Contract layers

A contract is plain data that says which Resources exist, which of their fields can be read, filtered, ordered or written, and which operations are available. Aventara compiles three of them from the same Prisma schema and your configuration, so one API can show a trusted server job more than it shows a browser.

## The three layers

| Layer | Who uses it | Over HTTP |
|---|---|---|
| Core | The baseline: the schema as the adapter can faithfully perform it, with your root configuration applied. The other two layers start from it. | No |
| Application | Your own server-side code: `framework.application.*`. Trusted code. | No |
| Client | Remote callers: the HTTP protocol and the generated frontend client. | Yes, at `GET <entrypoint>/_contract` |

Only the client contract is ever served. The other two never leave the process. Guards, hooks, pipes and other callbacks are never part of any contract; they run on the server.

The compiled contracts are on the framework instance: `framework.contracts.core`, `.application` and `.client`.

## Root defaults and layer overrides

The root of your configuration is the default for every layer. An `application` or `client` block overrides it for that one layer. For each property, an explicitly present layer value wins; otherwise the root value is used (`false` counts as present). Pipelines are the exception: root pipelines run first, then the layer's own.

```ts
// src/aventara.config.ts
return {
  entrypoint: "/api",
  adapter: /* createPrismaAdapter(...) */,

  // client: remote callers only
  client: {
    restrictions: {
      User: {
        fields: {
          internalNotes: { hidden: true },                    // not in the client layer at all
          passwordHash: {                                      // write-only for the client
            capabilities: { select: false, filter: false, order: false },
          },
        },
        operations: { delete: { unique: false, first: false, count: false } },
      },
    },
    limits: { maxListLimit: 100 },
  },
} as const;
```

The same schema, seen through each layer (the `User` Resource, from `framework.contracts`):

| | Application | Client |
|---|---|---|
| `internalNotes` | readable and writable | absent: no filter, order, projection or write |
| `passwordHash` | readable and writable | write-only: settable, never selected, filtered or ordered |
| `delete` operations | all offered | none |
| `maxListLimit` | 250 (the default) | 100 |

## What the difference looks like

Server-side code runs through the application layer and can read the field the client layer hides:

```ts
const res = await framework.application.User.find.many({
  select: ["id", "email", "internalNotes"],
  limit: 2,
});
// { data: [{ id: 1, email: "ada@example.com", internalNotes: null }, ...], code: "A1000", cause: null }
```

The same request through the client layer is refused before any query runs:

```ts
// the field is not in the client layer's types either, so this needs a cast to compile
const res = await framework.client.User.find.many({ select: ["id", "internalNotes" as never] });
// code "A2004", issue V1005: Field "internalNotes" is not available on Resource "User".
```

A remote caller gets the same answer over HTTP, and the generated frontend client does not offer the field or the operation at all, so it is a compile error before it is a runtime one:

```ts
await avClient.User.find.many({ select: ["passwordHash"] });  // type error; at runtime: A2004 / V1008 "not selectable"
avClient.User.delete.unique;                                  // type error: the operation is not in the client contract
```

Calling a removed operation by hand over HTTP answers `404 A2002`: `Operation "delete.unique" is not available on Resource "User".`

Limits follow the same rule. With the configuration above, `limit: 200` is accepted from application code and refused to a remote caller with `A2009` / `V1014` (`limit exceeds maxListLimit (100)`).

## Hiding and write-only fields

| Setting | Effect in that layer |
|---|---|
| `hidden: true` on a field | The field does not exist: no input, output, filter, ordering, identifier or nested projection. |
| `hidden: true` on a Resource | The Resource does not exist. Relations pointing at it must be hidden too, or the framework refuses to start (`COMPILER_DANGLING_RELATION`). |
| `capabilities: { select: false, filter: false, order: false }` | Write-only: can be written on create and update, never read back. |
| `operations: { <family>: { <variant>: false } }` | Switches an operation off. Operations can only be switched off, never redefined. |

If a hidden field is part of an identifier, that identifier is dropped; if none remains, the `unique` operations that need one disappear. See [Configuration](/docs/configuration#restrictions) for every option.

## Why this matters for the frontend

The client generator reads only the client contract. A restriction therefore removes things from the generated client's types as well as from what the server answers. Hiding a field in the application layer does not change the client; hiding it in the client layer, or at the root, does. Adding a restriction under `client` changes the client contract and its [hash](/docs/contract-hash), so regenerate the client afterwards.

## See also

- [Resources and operations](/docs/resources-and-operations)
- [Contract hash](/docs/contract-hash)
- [Configuration](/docs/configuration)
- [Concepts](/docs/concepts)
- Guides: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Restricting operations](/docs/restricting-operations), [Computed fields](/docs/computed-fields)
