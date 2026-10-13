---
title: Contract layers
description: The core, application and client contracts compiled from one schema, how the root and its two overlays combine, and why the frontend only ever sees the client layer.
order: 11
section: concepts
---

# Contract layers

A contract is plain data that says which Resources exist, which of their fields can be read, filtered, ordered or written, and which operations are available. Aventara compiles three of them from the same Prisma schema and your configuration, so one API can show a trusted server job more than it shows a browser.

## The layers

| Layer | Who uses it | Over HTTP |
|---|---|---|
| Core | The baseline: the schema as the adapter can faithfully perform it, with your root configuration applied. The other two layers start from it. | No |
| Application | Your own server-side code: `framework.application.*`. Trusted code. | No |
| Client | Remote callers: the HTTP protocol and the generated frontend client. | Yes, at `GET <api>/_contract` |
| Agent | AI agents, through an MCP server. It narrows the client layer by default, or the application or core layer it `extends`. | To the MCP server that serves it |

Only the client contract is served over the HTTP protocol; the agent contract is what an MCP server builds its tools from. The other two never leave the process. Guards, hooks, pipes and other callbacks are never part of any contract; they run on the server. [Field validators](/docs/field-validators) are declarative data rather than callbacks, so they are part of the contract of each layer that exposes their field.

The compiled contracts are on the framework instance: `framework.contracts.core`, `.application`, `.client` and `.agent`. See [The agent layer and MCP](/docs/configuration#the-agent-layer-and-mcp).

## Root and overlays

The root of your configuration is the core layer, and the starting point of the other two. `application` and `client` are overlays on it: an application call sees the root plus `application`, a remote call the root plus `client`. Each key combines by its own rule ([Configuration](/docs/configuration#root-and-layer-overrides)): exposure only narrows, `limits` and `transactionsStyle` override, pipelines and validators add up.

```ts
// src/aventara.config.ts
return {
  api: "/api",
  adapter: /* createPrismaAdapter(...) */,

  // client: remote callers only
  client: {
    exposed: true,
    exemptions: {
      resources: {
        User: {
          fields: {
            internalNotes: true,                           // not in the client layer at all
            passwordHash: ["select", "filter", "order"],   // write-only for the client
          },
          operations: { delete: true },                    // no deletes
        },
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

An overlay can only take away from what the root exposes. Something only your server code may reach is exposed at the root and hidden in the `client` overlay, as here. Hiding something at the root hides it from both overlays, and no overlay can bring it back. See [Exposure](/docs/exposure).

## What the difference looks like

Server-side code runs through the application layer and can read the field the client layer hides:

```ts
const users = await framework.application.User.find.many({
  select: ["id", "email", "internalNotes"],
  limit: 2,
});
// [{ id: 1, email: "ada@example.com", internalNotes: null }, ...]
```

The same request through the client layer is refused before any query runs:

```ts
// the field is not in the client layer's types either, so this needs a cast to compile
await framework.client.User.find.many({ select: ["id", "internalNotes" as never] });
// throws AvValidationError: code "A2004", issue V1005: Field "internalNotes" is not available on Resource "User".
```

A remote caller gets the same answer over HTTP, and the generated frontend client does not offer the field or the operation at all, so it is a compile error before it is a runtime one:

```ts
await avClient.User.find.many({ select: ["passwordHash"] });  // type error; at runtime: A2004 / V1008 "not selectable"
avClient.User.delete.unique;                                  // type error: the operation is not in the client contract
```

Calling a removed operation by hand over HTTP answers `404 A2002`: `Operation "delete.unique" is not available on Resource "User".`

Limits follow the same rule. With the configuration above, `limit: 200` is accepted from application code and refused to a remote caller with `A2009` / `V1014` (`limit exceeds maxListLimit (100)`).

## Hiding and write-only fields

| Exemption, under `exposed: true` | Effect in that layer |
|---|---|
| `<field>: true` | The field does not exist: no input, output, filter, ordering, identifier or nested projection. |
| `<Resource>: true` | The Resource does not exist. Relations pointing at it must be hidden too, or the framework refuses to start (`COMPILER_DANGLING_RELATION`). |
| `<field>: ["select", "filter", "order"]` | Write-only: can be written on create and update, never read back. |
| `operations: { <family>: true }` or `{ <family>: [<variants>] }` | Switches operations off. Operations can only be switched off, never redefined. |

A unique operation needs a complete identifier: hiding every identifier while `find.unique` stays exposed is refused at startup (`COMPILER_MISSING_IDENTIFIER`). In the same way, a layer that can still create a Resource cannot hide a field every create must write unless a `compute.create` stage fills it (`COMPILER_HIDDEN_REQUIRED_FIELD`). See [Exposure](/docs/exposure) for every option, and the Pick style (`exposed: false`) for exposing only what a frontend calls.

## Why this matters for the frontend

The client generator reads only the client contract. An exemption therefore removes things from the generated client's types as well as from what the server answers. Hiding a field in the application layer does not change the client; hiding it in the client layer, or at the root, does. An exemption under `client` changes the client contract and its [hash](/docs/contract-hash), so regenerate the client afterwards.

## See also

- [Resources and operations](/docs/resources-and-operations)
- [Contract hash](/docs/contract-hash)
- [Configuration](/docs/configuration)
- [Concepts](/docs/concepts)
- Guides: [Exposure](/docs/exposure), [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Computed fields](/docs/computed-fields)
