---
title: Configuration reference
description: Every FrameworkConfig option and createPrismaAdapter option with its type, default, the layers it applies to and an example.
order: 80
section: reference
---

# Configuration reference

A lookup table for everything you can put in the object returned from `src/aventara.config.ts` (the `FrameworkConfig`), plus the options of `createPrismaAdapter`. For a walkthrough with explanations, see [Configuration](/docs/configuration). For how layers combine, see [Contract layers](/docs/contract-layers).

All types below are exported from `@aventara/core` (`FrameworkConfig`, `FrameworkScopeConfig`, `FrameworkRestrictionsConfig`, `PipelineConfig`, `ContractLimits`, ...). Keep `as const` on the object you return so TypeScript can check Resource and field names against your schema.

## Where an option can go

The object has a **root** and two **layer blocks**, `application` (your server-side code) and `client` (remote callers: HTTP and the generated frontend client).

| Option | Root | `application` | `client` | Notes |
|---|---|---|---|---|
| `entrypoint` | yes | no | no | Required. |
| `adapter` | yes | no | no | Required. |
| `diagnostics` | yes | no | no | Root only; not overridable. |
| `fields` | yes | yes | yes | |
| `behaviors` | yes | yes | yes | |
| `restrictions` | yes | yes | yes | |
| `limits` | yes | yes | yes | |
| `pipelines` | yes | yes | yes | Concatenated, not overridden. |
| `transactions` | yes | yes | yes | |

**Resolution rule.** The root is the default for every layer. For each property, if a layer block sets it explicitly, that value wins; otherwise the root value is used. `false` counts as explicitly set. **Pipelines are the exception:** root pipelines run first, then the layer's own. A property you leave out is not "unset to default"; it simply inherits.

Any property that is not in this table is refused at startup with `CONFIG_UNKNOWN_PROPERTY`.

## Top-level options

### `entrypoint`

| | |
|---|---|
| Type | `string` |
| Default | none (required) |
| Layer | root only |

The mount path of the protocol. It is normalized to one canonical form: one leading slash, no trailing slash, no empty segment. `api`, `/api/` and `//api//` are all `/api`; `""` and `/` mean the root. Everything else that is not a plain path is refused (`CONFIG_INVALID_VALUE`): whitespace, `://`, a query, a fragment, `.` or `..` segments, backslashes, non-ASCII characters, percent-encoding, and characters a path segment may not carry unencoded.

```ts
entrypoint: "/api",            // GET /api/_contract, POST /api/_resources/User/find/many
entrypoint: "/v1/data",        // nested paths are fine
```

```text
entrypoint: "api/v1?x=1"
-> CONFIG_INVALID_VALUE at "entrypoint": entrypoint carries a query; a mount path is /-separated segments of ASCII letters, digits and -._~!$&'()*+,;=:@ only
```

The entrypoint alone decides where the protocol is mounted; a Nest global prefix does not move it. See [NestJS host](/docs/nestjs-host#entrypoint).

### `adapter`

| | |
|---|---|
| Type | `Adapter<M>` |
| Default | none (required) |
| Layer | root only |

What the framework runs against. For Prisma 7 it is the result of `createPrismaAdapter(...)` ([below](#createprismaadapter)). The adapter advertises what it can perform; your configuration can only narrow that.

### `diagnostics`

| | |
|---|---|
| Type | `(diagnostic: FrameworkDiagnostic) => void \| Promise<void>` |
| Default | none |
| Layer | root only |

A sink for **unplanned failures** (responses with an `A3xxx` code), so you can log the real error that the response deliberately hides. It receives the original `error` object, which never reaches the response.

```ts
diagnostics: (d) => {
  logger.error({ code: d.code, requestId: d.requestId, resource: d.kind === "operation" ? d.resource : undefined }, String(d.error));
},
```

```ts
type FrameworkDiagnostic =
  | { kind: "operation";   error: unknown; code: OperationErrorCode; scope: "application" | "client";
      resource: string; family: OperationFamily; variant: string; requestId: string; operation?: number }
  | { kind: "transaction"; error: unknown; code: OperationErrorCode; scope: "application" | "client";
      requestId: string; operation?: number };
```

Verified: a guard that throws a plain `Error("secret boom")` yields `{"code":"A3000","cause":{"message":"Internal framework error."}}` to the caller and `DIAG A3000 Error: secret boom` to the sink.

### `fields`

| | |
|---|---|
| Type | `{ [Resource]?: { [fieldName]: FrameworkScalarFieldConfig } }` |
| Default | none |
| Layer | root, `application`, `client` |

Adds **virtual scalar fields** to a Resource. A virtual field has no column; its value comes from a [`behaviors` read callback](#behaviors). Only scalar fields can be added (there is no way to add a relation).

| Property | Type | Meaning |
|---|---|---|
| `type` | `{ scalar: string } \| { enum: string }` | The field's type: a built-in scalar (`string`, `int`, `boolean`, `datetime`, `decimal`, `json`, ...) or an enum of the model. Required for an added field. |
| `nullable` | `boolean` | Required for an added field. |
| `list` | `boolean` | Required for an added field. |
| `format` | `string` | Optional format name carried in the contract. |
| `lifecycle` | `readonly ["VIRTUAL"][]` | Mark the field virtual (not stored). |
| `capabilities` | `Partial<ScalarFieldCapabilities>` | What callers may do with it. |

```ts
fields: {
  User: {
    displayName: { type: { scalar: "string" }, nullable: false, list: false, lifecycle: ["VIRTUAL"] },
  },
},
behaviors: {
  User: { fields: { displayName: { read: ({ record }) => `${record.name ?? "?"} <${record.email}>` } } },
},
```

`defineFields(model, fields)` from `@aventara/core` checks a `fields` block against your model when you want to define it outside the config object.

Result, verified: `framework.application.User.find.many({ select: ["id", "displayName"], limit: 2 })` returns `[{"id":1,"displayName":"Ada <ada@example.com>"}, ...]`, and the field appears in the client contract with `lifecycle: ["COMPUTED_ON_READ","VIRTUAL"]`.

### `behaviors`

| | |
|---|---|
| Type | `{ [Resource]?: { fields: { [field]?: { create?, update?, read? } } } }` |
| Default | none |
| Layer | root, `application`, `client` |

Server-side callbacks that compute a field's value. They never appear in a contract; the contract only records that the field is computed (`lifecycle`).

| Member | Type | When it runs |
|---|---|---|
| `create` | `false \| (ctx) => unknown` | On `create`, to compute the value written. Context: `scope`, `resource`, `field`, `value`, `data`, `operation`. |
| `update` | `false \| (ctx) => unknown` | On `update`, same context. |
| `read` | `false \| ((ctx) => unknown) \| { dependsOn?: field[]; compute: (ctx) => unknown }` | When the field is read. Context: `scope`, `resource`, `field`, `value`, `record`, `operation`. `dependsOn` names fields the compute needs, which are fetched even if the caller did not select them. |

`operation` is the [pipeline context](#pipelines) of the running operation. A callback may be `async`.

```ts
behaviors: {
  User: {
    fields: {
      passwordHash: { create: ({ value }) => hash(String(value)), update: ({ value }) => hash(String(value)) },
    },
  },
},
```

### `restrictions`

| | |
|---|---|
| Type | `{ [Resource]?: ResourceRestrictions }` |
| Default | none (everything the adapter supports is offered) |
| Layer | root, `application`, `client` |

Removes or narrows what a Resource exposes in a layer. It can only narrow; it cannot add an operation or capability the adapter does not advertise. Details in [Restrictions](#restrictions-reference).

### `limits`

| | |
|---|---|
| Type | `Partial<ContractLimits>` |
| Default | the table below |
| Layer | root, `application`, `client` |

| Limit | Default | What it bounds | Error when exceeded |
|---|---|---|---|
| `maxRequestBytes` | `1048576` | Decoded size of a request body. | `413 A2010` (HTTP only) |
| `maxNestingDepth` | `12` | Depth of nested projections, relation filters and writes. | `A2009` / `V1013` |
| `maxListLimit` | `250` | The `limit` of a list or of a nested relation. | `A2009` / `V1014` |
| `maxTransactionOperations` | `20` | Steps in one transaction plan. | `A2009` / `V1014` |
| `maxBooleanNodes` | `50` | Nodes in a `where` boolean tree (`AND` / `OR` / `NOT`). | `A2009` / `V1015` |

Each must be a finite non-negative integer; otherwise startup fails (`CONFIG_INVALID_VALUE` at `limits.maxListLimit`). An unknown name fails with `CONFIG_UNKNOWN_PROPERTY` (`unknown limit property: foo`).

```ts
limits: { maxListLimit: 100 },
client: { limits: { maxListLimit: 25 } },
```

Verified: with the config above the served contract has `"limits": { ..., "maxListLimit": 25, ... }` and the application layer keeps `100`. Client limits are part of the client contract, so changing them changes the [contract hash](/docs/contract-hash).

### `pipelines`

| | |
|---|---|
| Type | `PipelineConfig` |
| Default | none |
| Layer | root, `application`, `client` (concatenated) |

Server-side callbacks around every operation. See [Pipelines](#pipelines).

### `transactions`

| | |
|---|---|
| Type | `"none" \| "interactive"` |
| Default | what the adapter provides (`"interactive"` for the Prisma adapter on SQLite and PostgreSQL) |
| Layer | root, `application`, `client` |

`"interactive"` mounts `POST <entrypoint>/_transactions` and gives the generated client `avClient.tx` and `avClient.transaction`. `"none"` removes them for that layer. Any other value fails startup: `transactions must be "none" or "interactive"`. A layer cannot offer transactions the adapter cannot perform; the adapter's capability is validated against the configuration at startup.

```ts
client: { transactions: "none" },   // remote callers cannot run transaction plans
```

See [Transactions](/docs/transactions).

### `application` and `client`

Layer blocks with the same shape as the root's scope options: `fields`, `behaviors`, `restrictions`, `limits`, `pipelines`, `transactions`. They have no `entrypoint`, `adapter` or `diagnostics`.

## Restrictions reference

```ts
type FrameworkRestrictionsConfig = {
  [Resource]?: {
    hidden?: boolean;
    fields?: { [field]?: ScalarFieldRestrictions | RelationFieldRestrictions };
    operations?: ResourceOperationRestrictions;
  };
};
```

### Resource level

| Option | Type | Effect |
|---|---|---|
| `hidden` | `boolean` | `true` removes the Resource from the layer: no routes, no relations to it. |
| `operations` | `{ [family]?: { [variant]?: boolean } }` | `false` switches one operation off. See below. |
| `fields` | map | Per-field restrictions. |

`operations` accepts exactly these keys; a `false` removes the route and the client method, and `true` leaves the baseline in place (it cannot add an operation):

| Family | Variants |
|---|---|
| `find` | `first`, `unique`, `many`, `count` |
| `create` | `one`, `many`, `count` |
| `update` | `first`, `unique`, `many`, `count` |
| `delete` | `first`, `unique`, `many`, `count` |
| `upsert` | `unique` |

With the Prisma adapter `delete.many` is not offered at all (use `delete.count`).

### Field level

| Option | Applies to | Effect |
|---|---|---|
| `hidden: true` | any field | The field does not exist in this layer: no input, output, filter, order, identifier or nested projection. |
| `capabilities` | any field | Narrows what callers can do. Members depend on the field kind (below). |

### Scalar field `capabilities`

| Member | Type | Effect |
|---|---|---|
| `select` | `boolean` | `false` makes the field write-only: never returned. Selecting it answers `A2004` / `V1008`. |
| `filter` | `boolean \| operator[]` | `false` forbids filtering; a list keeps only those operators. |
| `order` | `boolean` | `false` forbids ordering by it. |
| `orderNulls` | `boolean` | `false` forbids the `nulls` option. |
| `create` | `boolean \| directive[]` | Allowed scalar directives on create. |
| `update` | `boolean \| directive[]` | Allowed scalar directives on update (`$increment`, ...). |

Filter operators: `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`, `mode`, `has`, `hasEvery`, `hasSome`, `isEmpty`, `path`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayContains`, `arrayStartsWith`, `arrayEndsWith`. Only the operators the adapter advertises for that field's type can be kept. Naming one that is not advertised stops startup with `COMPILER_UNAVAILABLE_CAPABILITY` (for example `filter: ["regex"]`: `capability "filter" requested unavailable values: regex`).

Scalar directives: `$increment`, `$decrement`, `$multiply`, `$divide`, `$push`, `$unset` (what is available depends on the field's type and the provider).

Which operators a field type offers (SQLite, verified in the served contract):

| Type | Filter operators |
|---|---|
| `string` | `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith` |
| `int`, `decimal`, `datetime` | `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte` |
| `boolean` | `equals`, `not` |
| enum | `equals`, `not`, `in`, `notIn` |
| `json` | `equals`, `not`, `mode`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayStartsWith`, `arrayEndsWith` |

Numeric fields offer `$increment`, `$decrement`, `$multiply`, `$divide` on update.

### Relation field `capabilities`

| Member | Type | Effect |
|---|---|---|
| `select` | `boolean \| ("record" \| "bulkWrite")[]` | Whether the relation can be selected, and in which argument positions. |
| `include` | `boolean \| ("record" \| "bulkWrite")[]` | Same, for `include`. |
| `filter` | `boolean \| ("nested" \| "match" \| "null" \| "some" \| "every" \| "none")[]` | Relation filter forms. |
| `order` | `boolean` | Whether the relation's own rows can be ordered. |
| `pagination` | `boolean \| ("limit" \| "offset" \| "cursor")[]` | Nested pagination arguments. |
| `reducers` | `boolean \| "$count"[] \| { reducers?: "$count"[]; scopes?: ("record" \| "bulkWrite")[] }` | Whether `$count` is offered. |
| `create` | `boolean \| directive[] \| { directives?; scopes? }` | Nested-write directives on create (`$create`, `$connect`, `$connectOrCreate`). |
| `update` | `boolean \| directive[] \| { directives?; scopes? }` | Nested-write directives on update (`$create`, `$connect`, `$connectOrCreate`, `$disconnect`, `$set`, `$update`, `$delete`, `$upsert`). |

The `bulkWrite` position governs only the top level of `create.many` / `update.many` projections: a to-many relation nested inside an admitted to-one relation is not affected by it (see [Bulk variants differ](/docs/operations-reference#bulk-variants-differ)).

Narrowing rules: `false` denies the capability; a list removes values or positions the baseline offers; `true` restores the baseline. An empty projection or reducer list denies the member. For writes, `directives: []` leaves the member present with no directive (distinct from `scopes: []`, which denies it). Positions: projection scopes are `record` and `bulkWrite`; write scopes are `nested` and `bulkWrite`. You can only name positions the baseline already offers.

### Startup safety checks

| Mistake | Startup diagnostic |
|---|---|
| Hiding a Resource while a visible relation still points at it | `COMPILER_DANGLING_RELATION` at `root.resources.User.fields.posts.target`: `relation target "Post" is not present in the active Contract` |
| A Resource that does not exist | `COMPILER_UNKNOWN_RESOURCE`: `resource "Nope" is not present in the canonical compilation baseline` |
| A field that does not exist | `COMPILER_UNKNOWN_FIELD` |
| A capability value the adapter does not advertise | `COMPILER_UNAVAILABLE_CAPABILITY` |

They are thrown as one `FrameworkConstructionError` with `stage` (`"configuration"`, `"discovery"` or `"contract-compilation"`) and `diagnostics` (each `{ code, path, message }`). Every layer is compiled, so the same mistake is reported once per layer (`root.`, `application.`, `client.` paths).

To hide a Resource, hide the relations that point at it too:

```ts
restrictions: {
  Post: { hidden: true },
  User:     { fields: { posts: { hidden: true } } },
  Category: { fields: { posts: { hidden: true } } },
},
```

A hidden field that is part of an identifier drops that identifier; if none remains, the `unique` operations disappear.

### Example: write-only field and removed deletes for remote callers

```ts
restrictions: {
  User: { fields: { passwordHash: { capabilities: { select: false, filter: false, order: false } } } },
},
client: {
  restrictions: { User: { operations: { delete: { first: false, unique: false, count: false } } } },
},
```

Verified: the client contract then has no `delete` family on `User`, `passwordHash` carries `capabilities: { create: [], update: [] }` (no `select`, `filter` or `order`), and `framework.client.User.find.many({ select: ["id", "passwordHash"] })` answers `A2004` / `V1008`: `Field "passwordHash" is not selectable.`

## Pipelines

```ts
type PipelineConfig = {
  guards?:       Guard[];
  pipes?:        Pipe[];
  hooks?:        { before?: BeforeHook[]; after?: AfterHook[] };
  interceptors?: Interceptor[];
  filters?:      Filter[];
};
```

| Kind | Signature | Purpose |
|---|---|---|
| Guard | `(ctx) => boolean \| undefined \| Promise<...>` | Return `true` or `undefined` to allow; `false` denies with `A4001`. Throw a `FrameworkError` to choose the code (`A4000`, `A4001`, `A4002`). |
| Pipe | `(args, ctx) => unknown` | Transform the arguments before validation of the rest of the pipeline continues. |
| Before hook | `(ctx) => void` | Runs before execution. |
| After hook | `(result, ctx) => void` | Runs after a successful execution. |
| Interceptor | `(ctx, next) => Promise<unknown>` | Wraps execution; call `next()` to run it. |
| Filter | `(error, ctx) => FrameworkError \| undefined` | Rewrite a thrown error; `undefined` keeps it. |

**Order**, verified with all five kinds registered: guards, pipes, before hooks, interceptors (around execution), after hooks. Root pipelines of a kind run before the layer's own. `application` and `client` pipelines only run for that layer's operations.

**`PipelineContext`** (what each callback receives):

| Member | Type | Meaning |
|---|---|---|
| `scope` | `"application" \| "client"` | The layer the operation runs in. |
| `resource` | `string` | The Resource key. |
| `family`, `variant` | `string` | The operation. |
| `args` | `unknown` | The operation's arguments. |
| `requestId` | `string` | The correlation id. |
| `contract` | `Contract` | The contract of the layer. |
| `transport` | `{ method: "POST"; headers: Record<string, string> } \| undefined` | Present only for remote requests. Header names are lower-cased; repeated headers are joined. |

```ts
import { FrameworkError, type PipelineContext } from "@aventara/core";

const requireSignIn = (ctx: Pick<PipelineContext, "family" | "transport">) => {
  if (ctx.family !== "find" && !ctx.transport?.headers["authorization"]) {
    throw new FrameworkError("A4000", "Sign in first.");
  }
  return true;
};
// client: { pipelines: { guards: [requireSignIn] } }
```

Verified denial answers (`client` layer): `return false` gives `{"code":"A4001","cause":{"message":"Operation denied by a framework guard."}}`; `throw new FrameworkError("A4002", "Deletes are policy-denied.")` gives `{"code":"A4002","cause":{"message":"Deletes are policy-denied."}}`.

A non-framework error thrown from a pipeline becomes `A3000` with the generic message `Internal framework error.`; the original goes to `diagnostics`. A pipe that returns arguments the server's own contract refuses becomes `A3004` with the generic message `A server pipeline produced invalid arguments.` ([Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do)). In the Nest host, either one also writes one line to the server log ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log)).

> Annotate a pipeline's parameter structurally (as above) when the config object uses `as const`, or the parameter has no contextual type.

## createPrismaAdapter

From `@aventara/prisma7-adapter`. It is `async` and returns the `adapter`.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `client` | your `PrismaClient` | required | A client you have already constructed, with a driver adapter. The adapter never builds one or reads the environment. |
| `discovery` | `PrismaDiscoveryArtifact` | required | The generated artifact (`src/generated/aventara/discovery.artifact.ts`), produced by `aventara:prepare`. |
| `provider` | `"sqlite" \| "postgresql"` | required | Declared, never sniffed. |
| `driver` | `"@prisma/adapter-better-sqlite3" \| "@prisma/adapter-pg" \| "@prisma/adapter-d1"` | required | Declared, never sniffed. The driver decides whether transactions are offered; `@prisma/adapter-d1` offers none. This release is tested on SQLite (`better-sqlite3`) and PostgreSQL (`pg`). |
| `transactionOptions` | `{ maxWait?: number; timeout?: number; isolationLevel?: ... }` | Prisma's defaults (`maxWait` 2000 ms, `timeout` 5000 ms) | Owned by the adapter, not by Aventara's configuration. |

`isolationLevel` values: `"ReadUncommitted"`, `"ReadCommitted"`, `"RepeatableRead"`, `"Snapshot"`, `"Serializable"`. SQLite supports `Serializable` only; PostgreSQL supports the first four except `Snapshot`.

```ts
await createPrismaAdapter({
  client: prisma,
  discovery,
  provider: "postgresql",
  driver: "@prisma/adapter-pg",
  transactionOptions: { timeout: 10_000, isolationLevel: "Serializable" },
});
```

### aventara-prisma7-generate

The `aventara:prepare` script runs this bin to write the discovery artifact. Run it again whenever the Prisma schema changes (the scaffold also runs it on `postinstall`).

| Flag | Meaning |
|---|---|
| `--schema <path>` | The `schema.prisma` file, or a Prisma 7 schema folder. |
| `--client <dir>` | The generated Prisma client's root (your generator block's `output`). |
| `--provider <name>` | `sqlite` or `postgresql`. |
| `--driver <name>` | `@prisma/adapter-better-sqlite3`, `@prisma/adapter-pg` or `@prisma/adapter-d1`. |
| `--out <file>` | Where to write the artifact module (a `.ts` file). It must not be inside `--client`. |
| `-h`, `--help` | Print usage and exit 0. |

It needs a Prisma 7 CLI and `typescript` (below 7) resolvable from your project.

```text
aventara-prisma7-generate --schema prisma/schema.prisma --client src/generated/prisma --provider sqlite --driver @prisma/adapter-better-sqlite3 --out src/generated/aventara/discovery.artifact.ts
resources: User, Category, Post
```

## Startup diagnostics

| Stage | Code | Meaning |
|---|---|---|
| `configuration` | `CONFIG_REQUIRED` | A required property is missing. |
| `configuration` | `CONFIG_UNKNOWN_PROPERTY` | A property the configuration does not define. |
| `configuration` | `CONFIG_INVALID_TYPE` | A property has the wrong type. |
| `configuration` | `CONFIG_INVALID_VALUE` | A value outside what is allowed (a bad entrypoint, a negative limit, an unknown transaction mode). |
| `discovery` | `DISCOVERY_TRANSACTION_CAPABILITY_MISMATCH` | The configuration asks for transactions the adapter cannot perform. |
| `contract-compilation` | `COMPILER_UNKNOWN_RESOURCE`, `COMPILER_UNKNOWN_FIELD` | A restriction or field names something that does not exist. |
| `contract-compilation` | `COMPILER_DANGLING_RELATION` | A visible relation points at a hidden Resource. |
| `contract-compilation` | `COMPILER_UNAVAILABLE_OPERATION`, `COMPILER_UNAVAILABLE_CAPABILITY` | Asking for an operation or capability the adapter does not offer. |
| `contract-compilation` | `COMPILER_RELATION_FIELD_CONFIG_UNSUPPORTED`, `COMPILER_INCOMPLETE_FIELD`, `COMPILER_STRUCTURAL_FIELD_OVERRIDE`, `COMPILER_MISSING_SCALAR`, `COMPILER_MISSING_ENUM` | An added or overridden field is not valid (a relation cannot be configured as an added field, a required property is missing, structure cannot be overridden, a type does not exist). |
| `contract-compilation` | `COMPILER_INVALID_LIFECYCLE`, `COMPILER_MISSING_READ_BEHAVIOR`, `COMPILER_INVALID_BEHAVIOR_DEPENDENCY` | A `lifecycle` or `behaviors` entry is inconsistent. |
| `contract-compilation` | `COMPILER_INVALID_CLIENT_CONTRACT` | The compiled client contract failed its own structural check. |

## See also

- [Configuration](/docs/configuration): the guided version.
- [Contract layers](/docs/contract-layers): how root and layer blocks combine.
- [Error codes](/docs/error-codes): the codes a caller sees at runtime.
- [NestJS API reference](/docs/nest-api-reference): handing the config to `AventaraModule`.
- Guides: [Exposing and hiding fields](/docs/exposing-and-hiding-fields), [Restricting operations](/docs/restricting-operations), [Pipelines](/docs/pipelines), [Limits and safety](/docs/limits-and-safety)
