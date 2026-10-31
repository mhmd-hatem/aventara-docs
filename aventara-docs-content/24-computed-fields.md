---
title: Computed fields
description: Add virtual fields and compute values on read, create and update with compute stages - chained across layers, with a read-only ctx - and accept write-only input such as a password that is hashed before it is stored.
order: 24
section: guides
---

# Computed fields

A computed field gets its value from your code. Two parts of a field's configuration work together, both under `resources.<Resource>.fields.<field>`:

- `definition` adds a scalar field your database does not have (a *virtual* field), at the root only.
- `pipelines.compute` attaches code that computes the field's value when a record is created (`create`), updated (`update`) or read (`read`).

The result is part of the contract like any other field (callers see and type `displayName` as a string), while the code stays on the server. The contract records only that the field is computed: adding or removing a phase changes the client contract, changing the function never does.

Three recipes, all from one configuration. They use a `User` with `name`, `email` and `passwordHash`, and a `Post` with a nullable `slug String?` column.

## The configuration

The `User` block is written with [`defineResource`](/docs/configuration#one-resource-per-file-defineresource), which types the compute stages for the Resource, so they need no annotations:

```ts
// src/resources/user.resource.ts
import { createHash } from "node:crypto";
import { defineResource } from "@aventara/core";
import { discovery } from "../generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");   // use bcrypt or argon2 in real code

export const user = defineResource<Model>()("User", {
  fields: {
    // 1. Read-only, computed on every read.
    displayName: {
      definition: {
        type: { scalar: "string" }, nullable: false, list: false,
        lifecycle: ["VIRTUAL"], capabilities: { select: true },
      },
      pipelines: {
        compute: {
          read: {
            dependsOn: ["name", "email"],
            compute: ({ record }) => (record.name as string | null) ?? String(record.email).split("@")[0],
          },
        },
      },
    },
    // 2. Write-only input: accepted, never stored, never returned.
    password: {
      definition: {
        type: { scalar: "string" }, nullable: true, list: false,
        lifecycle: ["VIRTUAL"], capabilities: { select: false, create: [], update: [] },
      },
    },
    // 3. Stored, filled from `password`.
    passwordHash: {
      pipelines: {
        compute: {
          create: ({ data }) => (typeof data.password === "string" ? digest(data.password) : undefined),
          update: ({ data }) => (typeof data.password === "string" ? digest(data.password) : undefined),
        },
      },
    },
  },
});
```

```ts
// src/resources/post.resource.ts (same imports and Model as above)
const slugify = (text: string) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const post = defineResource<Model>()("Post", {
  fields: {
    slug: {
      pipelines: {
        compute: {
          create: ({ data }) => slugify(String(data.title)),
          update: ({ data, value }) => (data.title === undefined ? value : slugify(String(data.title))),
        },
      },
    },
  },
});
```

```ts
// src/aventara.config.ts
import { aventaraResources } from "./generated/aventara/resources.generated.js";

export const aventaraConfig = {
  api: "/api",
  exposed: true,
  // aventara-build gathers user.root and post.root from src/resources/.
  resources: aventaraResources.root,
  // Nobody may read or write the hash directly.
  exemptions: {
    resources: {
      User: { fields: { passwordHash: ["select", "filter", "order", "create", "update"] } },
    },
  },
} as const;
```

An added field must spell out `type`, `nullable` and `list`. `lifecycle: ["VIRTUAL"]` says it has no database column. The `type` is `{ scalar: "string" }` or another scalar, or `{ enum: "Role" }`. A field `definition` is root-only: an overlay can add compute stages to a field but never define it.

Written inline in a configuration that is an `as const` object, the same stages need their parameters annotated (`({ record }: { record: Readonly<Record<string, unknown>> }) => ...`), because nothing gives them a contextual type there.

Written inline in `createFramework({ ... })`, the stages need no annotation, and a `compute.create` there takes its field out of the create types as it does in a `defineResource` block. A `create` or `update` stage's `field` and `data` are keyed by `string`; their values are `unknown`, as everywhere.

## Recipe 1: a field computed on read

`displayName` is derived from `name` and `email`:

```bash
curl -X POST http://localhost:3000/api/_resources/User/create/one ... -d '{"data":{"email":"ada@example.com"}}'
```

```json
{"data":{"createdAt":"2026-10-06T22:56:40.874Z","displayName":"ada","email":"ada@example.com","id":1,"role":"USER","settings":null},"code":"A1002","cause":null}
```

```json
// User/find/many {"select":["id","displayName"]}
{"data":[{"id":1,"displayName":"ada"}],"code":"A1000","cause":null}
```

In the contract it appears as a selectable, read-only field:

```json
"displayName": { "capabilities": { "select": true }, "kind": "scalar", "lifecycle": ["COMPUTED_ON_READ", "VIRTUAL"], "list": false, "nullable": false, "type": { "scalar": "string" } }
```

A virtual field is not in the database, so it cannot be filtered or ordered on, and cannot be written:

```json
// User/find/many {"where":{"displayName":"x"}}
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","where","displayName"],"message":"Filtering is not available on field \"displayName\"."}]}}
// User/create/one {"data":{"email":"z@example.com","displayName":"Zed"}}
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","data","displayName"],"message":"Field \"displayName\" is not writable during create."}]}}
```

A configured field may also carry a `format` (one of zod's named string formats, such as `"url"`, `"email"` or `"uuid"`). It is a fact the contract carries, and the server checks the computed value against it before the value leaves: a value that breaks it is the server's error (`A3000`, the issue in your `diagnostics` sink). A relative path is not a `url`: compute an absolute one (`` `https://example.com/p/${record.slug}` ``) or leave `format` out.

### `dependsOn`

A read stage may name the stored fields it needs. When a caller selects `displayName` but not `name` or `email`, the framework reads them for you, computes the value, and removes them again, so they do not leak into the response. This holds even when the caller cannot see those fields at all: with `name` hidden for remote callers, `{"select":["id","displayName"]}` still answers `{"id":1,"displayName":"ada"}`. A field hidden at the root can be a dependency too: it is read for the compute and never returned.

`dependsOn` takes scalar fields the adapter stores on the same Resource; anything else stops startup with `COMPILER_INVALID_COMPUTE_DEPENDENCY`. Write the stage as a plain function when it needs nothing else: `read: ({ record }) => ...`. A read stage with no `dependsOn` computes from the same inputs for every row, so its value usually belongs in response metadata or `ctx.$state` rather than a field.

## Recipe 2: a stored value computed on write

`Post.slug` is a real column, filled by your code when a post is created and refreshed when its title changes:

```json
// Post/create/one {"data":{"title":"Hello, World! It works","authorId":1},"select":["id","title","slug"]}
{"data":{"id":1,"title":"Hello, World! It works","slug":"hello-world-it-works"},"code":"A1002","cause":null}
```

A `create` or `update` stage runs on every create or update, whether or not the caller sent the field. What it returns becomes the value, so sending your own `slug` on create is overridden:

```json
// Post/create/one {"data":{"title":"A","slug":"mine","authorId":1}}
{"data":{"id":2,"title":"A","slug":"a"},"code":"A1002","cause":null}
```

To keep a value the caller sent and derive one otherwise, return it: `create: ({ value, data }) => value ?? slugify(String(data.title))`. Returning `undefined` keeps the current value.

A stage receives one object:

| Member | `create` / `update` | `read` |
|---|---|---|
| `field` | the field's name | the same |
| `value` | the value after pipes, or `undefined` when the caller did not send it (in a chain, the previous stage's result) | the stored value, or `undefined` for a virtual field |
| `data` | the operation's data after pipes, frozen (for an upsert, one branch) | |
| `record` | | the row as read, as the stage's own frozen copy (writing into it throws: `A3000`) |
| `ctx` | a read-only ctx ([below](#compute-reads-but-never-writes)) | the same |

A stage may return a promise. An upsert has no compute phase of its own: its `create` branch is filled by `compute.create` and its `update` branch by `compute.update`, both before the one database call.

## Recipe 3: write-only input that fills another field

The `password` field above is accepted on create and update and is not stored or returned (`select: false`, and the framework strips virtual fields before the database call). Its value reaches the `passwordHash` compute stages through `data`:

```json
// User/create/one {"data":{"email":"ada@example.com","password":"s3cret"}}
{"data":{"createdAt":"...","displayName":"ada","email":"ada@example.com","id":1,"role":"USER","settings":null},"code":"A1002","cause":null}
```

The row now holds `passwordHash = sha256("s3cret")`; updating with `{"password":"n3w"}` stores the hash of `n3w`. The root's exemptions close `passwordHash` to every caller: it is neither writable nor readable, so nobody can plant a hash directly:

```json
// User/create/one {"data":{"email":"pw2@example.com","passwordHash":"abc"}}
{"code":"A2004","cause":{"issues":[{"code":"V1006","path":["arguments","data","passwordHash"],"message":"Field \"passwordHash\" is not writable during create."}]}}
```

## Compute reads, but never writes

A compute stage gets a read-only `ctx` (`AvComputeContext`): the `$` facts (`$origin`, `$operation`, `$requestId`, ...), a read-only view of the request's `ctx.$state` (a write to it throws a `TypeError`), and the read operations of your Resources. It can look something up, inside the current transaction if there is one:

```ts
locale: {
  pipelines: {
    compute: {
      // A new document defaults to its owner's locale.
      create: async ({ value, data, ctx }) =>
        value ?? (await ctx.User.find.unique({ where: { id: data.ownerId as number }, select: ["locale"] })).locale,
    },
  },
},
```

It has no write operations, no `$sql` and no `$transaction`; reaching one throws and the operation answers `A3000`. Compute derives the row's own value. A change to other rows (a counter on another Resource, an outbox event) belongs in an after hook under `forceTransaction` ([The pipeline context](/docs/pipeline-context#recipe-a-likes-counter)).

## Across layers: stages chain

The root's compute stages run for both origins. An overlay can add a stage to the same phase, and then both run: the root's first, then the overlay's, which receives the root's result as `value`:

```ts
// in the configuration, beside the root's Post.slug stages
client: {
  resources: {
    Post: { fields: { slug: { pipelines: { compute: { create: ({ value }: { value: unknown }) => `c-${String(value)}` } } } } },
  },
},
```

A client create gets `c-<slug>`; an application create gets `<slug>`. A stage cannot be turned off from below. To stop remote callers from sending `slug` by hand, take its `update` away in the `client` overlay's exemptions ([Exposing and hiding fields](/docs/exposing-and-hiding-fields)).

## What to know

- A selectable virtual field needs a `read` stage: without one, startup fails with `COMPILER_MISSING_READ_COMPUTE`. A write-only virtual field must say `select: false`.
- Compute is not a pipeline stage. A [pipe](/docs/pipelines) transforms the whole arguments; a compute stage owns one field. Pipes run before write compute, so compute sees normalized input.
- A relation field takes no compute (`COMPILER_RELATION_FIELD_CONFIG_UNSUPPORTED`).
- A ctx call from a stage (`ctx.Post.create.one(...)`) runs compute too: raw calls skip guards and hooks, not compute.
- A `read` stage that returns a value of the wrong type fails after the write. On `create` the caller is answered `500` `A3000`, but the row is already committed, and every later list that selects the field answers `500` too until the stage is fixed. The failure is reported to the `diagnostics` function as an `AvComputedValueError` ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics)). Test a read stage against real rows before you ship it.
- Compute stages run on the server for both layers and never appear in the contract. Only the resulting lifecycle (`COMPUTED_ON_READ`, `COMPUTED_ON_CREATE`, `COMPUTED_ON_UPDATE`) is visible.
- A field with a `create` stage is not required on create, even when the database column has no default: the contract leaves it out of `createRequirements`, so callers may omit it. This is the way to fill a required field on the server. A [pipe](/docs/pipelines) cannot: a create missing a required field is refused by the framework's validation (`A2004`, `V1000`) before the first guard or pipe runs, unless a `create` stage fills that field, which keeps it optional until compute. It is also what lets a layer hide a required field and still create the Resource: without a `create` stage, that is refused at startup (`COMPILER_HIDDEN_REQUIRED_FIELD`).
- A `create` stage on a required field must return a value whenever the caller did not send one. If it returns `undefined` and the field is still missing, the create fails before the database: the caller gets `500` `A3000`, and the `diagnostics` function gets an `AvComputedValueError` reading `compute.create on Post.slug returned undefined for a required field`. This holds for `create.one`, every record of `create.many`, an upsert's `create` branch and a nested create. A foreign-key field counts as missing only when the record writes neither the relation nor the key, and a nested create's key that the parent supplies is never missing. An `update` stage may return `undefined` freely: nothing is required of an update.
- Guards, pipes and filters at a variant run before write compute, so their typed arguments let a create leave out the fields your `compute.create` stages fill, and only those ([Pipeline context](/docs/pipeline-context#typed-arguments)). `aventara-build` reads which fields they are from your configuration's type when `aventara:prepare` runs, and writes them to `computed-fields.generated.ts`, which the discovery artifact imports. After you add, move or remove a `create` or `update` stage, run `aventara:prepare` again; until you do, the server warns at startup that the generated types are stale.

## See also

- [Exposing and hiding fields](/docs/exposing-and-hiding-fields)
- [Field validators](/docs/field-validators)
- [Pipelines](/docs/pipelines)
- [Configuration](/docs/configuration)
- [Enums and scalar types](/docs/enums-and-scalars)
