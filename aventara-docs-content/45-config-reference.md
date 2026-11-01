---
title: Configuration reference
description: Every AvConfig key (adapter, prebuilt, policy included) and the createPrismaAdapter, describePrismaAdapter and aventara-build options, with type, default, the layers it applies to and an example.
order: 80
section: reference
---

# Configuration reference

A lookup table for everything you can put in the object exported from `src/aventara.config.ts` (the `AvConfig`; the scaffold leaves `adapter` out of it and joins it where the framework is created), plus the options of `describePrismaAdapter` and `createPrismaAdapter`. For a walkthrough with explanations, see [Configuration](/docs/configuration). For how layers combine, see [Contract layers](/docs/contract-layers).

All types below are exported from `@aventara/core` (`AvConfig`, `AvConfigLayer`, `AvConfigResource`, `AvConfigExemptions`, `AvPipeline`, `AvContractLimits`, ...). Keep `as const` on the object you export so TypeScript can check Resource and field names against your schema. `@aventara/core/avz` is a separate entry that holds `AvZ`, the builder for Json shapes and field validators ([JSON fields](/docs/json-fields), [Field validators](/docs/field-validators)). `@aventara/core/internal` exists for Aventara's own packages and is not public API; do not import from it.

## Where a key can go

The object has a root, two overlays, `application` (your server-side code) and `client` (remote callers: HTTP and the generated frontend client), and the `agent` layer (AI agents over MCP), which narrows the layer it `extends`.

| Key | Root | `application` | `client` | `agent` | Combines with the layer above by |
|---|---|---|---|---|---|
| `api` | yes | no | no | no | Required. |
| `mcp` | yes | no | no | no | Root only; optional. Its presence turns MCP on. |
| `adapter` | yes | no | no | no | Required by `createFramework`. |
| `prebuilt` | yes | no | no | no | Root only; optional. Contracts compiled ahead of time. |
| `policy` | yes | no | no | no | Root only; optional. In an overlay it is `CONFIG_UNKNOWN_PROPERTY`. |
| `diagnostics` | yes | no | no | no | Root only. |
| `misuse` | yes | no | no | no | Root only; optional. |
| `extends` | no | no | no | yes | Agent only: `"client"` (default), `"application"` or `"root"`. |
| `exposed` | yes | yes | yes | yes | Overlays only narrow the root's view; `agent` only narrows its parent's. Root default `true`. Required in a layer that sets `exemptions`. |
| `exemptions` | yes | yes | yes | yes | Only narrow. |
| `transactionsStyle` | yes | yes | yes | yes | Override: the layer's value when present, otherwise the root's (for `agent`, its parent's). |
| `limits` | yes | yes | yes | yes | Override per limit. |
| `pipelines` | yes | yes | yes | yes | Additive: root stages, then the overlay's (for `agent`: root, parent overlay, agent). |
| `resources` | yes | yes | yes | yes | Per key, below. A field `definition` is root only. |

A key that is not in this table is refused at startup with `CONFIG_UNKNOWN_PROPERTY`, and a moved key (`entrypoint` at the root; `restrictions`, `fields`, `behaviors`, `transactions` in any layer) with `CONFIG_MOVED_PROPERTY`, whose message names the new location. In a configuration TypeScript checks against your model (inline in `createFramework({ ... })` or `AventaraModule.forRoot`), a misplaced key is a type error at that key first.

An override wins when it is present, not when it is truthy: `false` overrides. An explicit `undefined` is refused (`CONFIG_INVALID_VALUE` or `CONFIG_INVALID_TYPE`); leave the key out instead.

## Root-only keys

### `api`

| | |
|---|---|
| Type | `string` |
| Default | none (required) |
| Layer | root only |

The mount path of the protocol (before rc.1, `entrypoint`; that key is refused with `CONFIG_MOVED_PROPERTY`: "entrypoint moved in rc.1: use api"). Read it back as `framework.api`. It is normalized to one canonical form: one leading slash, no trailing slash, no empty segment. `api`, `/api/` and `//api//` are all `/api`; `""` and `/` mean the root. Everything else that is not a plain path is refused (`CONFIG_INVALID_VALUE`): whitespace, `://`, a query, a fragment, `.` or `..` segments, backslashes, non-ASCII characters, percent-encoding, and characters a path segment may not carry unencoded.

```ts
api: "/api",                   // GET /api/_contract, POST /api/_resources/User/find/many
api: "/v1/data",               // nested paths are fine
```

```text
api: "api/v1?x=1"
-> CONFIG_INVALID_VALUE at "api": api carries a query; a mount path is /-separated segments of ASCII letters, digits and -._~!$&'()*+,;=:@ only
```

`api` alone decides where the protocol is mounted; a Nest global prefix does not move it. See [NestJS host](/docs/nestjs-host#mount-path).

### `mcp`

| | |
|---|---|
| Type | `string \| { path: string; authorization?: { servers: readonly string[]; verify: (token: string) => unknown \| null \| Promise<unknown \| null> } }` |
| Default | none: MCP is off |
| Layer | root only |

Turns MCP on: the mount path of the MCP endpoint, normalized as `api` is. The object form adds OAuth: `servers` lists the authorization servers a caller's token comes from (absolute `https` URLs, at least one), and `verify(token)` resolves the caller for a good token and `null` for a bad one. A `verify` that throws is answered like a bad token (`401`) and also reported to `diagnostics`. The resolved endpoint is `framework.mcp` (`AvMcpEndpoint`), `undefined` when MCP is off. The tools are built from the [`agent` layer](#agent).

```ts
mcp: "/mcp",
mcp: { path: "/mcp", authorization: { servers: ["https://auth.example.com"], verify } },
```

```text
mcp: "/api"
-> CONFIG_INVALID_VALUE at "mcp": mcp is the mount path api already has; mount the MCP endpoint at a path of its own
mcp: { path: "/mcp", authorization: { servers: [], verify } }
-> CONFIG_INVALID_VALUE at "mcp.authorization.servers": mcp.authorization.servers must name at least one authorization server
mcp: { path: "/mcp", authorization: { servers: ["http://auth.example.com"], verify } }
-> CONFIG_INVALID_VALUE at "mcp.authorization.servers[0]": mcp.authorization.servers[0] must be an absolute https URL
```

A path inside the protocol's `_` routes under `api` (`/api/_mcp`) is refused too, and so are an unknown key (`CONFIG_UNKNOWN_PROPERTY`), a missing `path`, `servers` or `verify` (`CONFIG_REQUIRED`) and a `verify` that is not a function (`CONFIG_INVALID_TYPE`).

### `adapter`

| | |
|---|---|
| Type | `AvAdapter<M>` |
| Default | none (required) |
| Layer | root only |

What the framework runs against. For Prisma 7 it is the result of `createPrismaAdapter({ ...description, client })` ([below](#createprismaadapter)). The scaffold does not write it in `src/aventara.config.ts`, which `aventara-build` runs without a database client: `app.module.ts` spreads the configuration and adds `adapter` beside it. A configuration that still builds its adapter inside keeps working; the framework compiles its Contracts at startup. The adapter advertises what it can perform; your configuration can only narrow that. A model whose name starts with `$` is refused (`COMPILER_RESERVED_RESOURCE_NAME`): `$` names belong to the framework.

### `prebuilt`

| | |
|---|---|
| Type | `AvPrebuiltContracts` |
| Default | none: the Contracts are compiled at startup |
| Layer | root only |

The four Contracts compiled ahead of time by `aventara-build`, exported as `aventaraContracts` from `contracts.generated.ts`. For serverless and edge platforms, where every cold start would otherwise compile them ([Deploying](/docs/deploying#build-time-contracts)).

```ts
import { aventaraContracts } from "./generated/aventara/contracts.generated.js";

const framework = await createFramework({
  ...aventaraConfig,
  adapter: await createPrismaAdapter({ ...adapter, client: prisma }),
  prebuilt: aventaraContracts,
});
```

The file is used only when this `@aventara/core` compiled it, for this protocol version, from the same configuration and adapter model. The Contracts, hashes and `GET /api/_contract` bytes are then the ones compiling would give. Any other file is ignored whole: the framework compiles at startup and prints one warning, `AVENTARA_PREBUILT_STALE`, naming the Resources whose configuration or model changed, or the version that differs. A value that is not an object is `CONFIG_INVALID_TYPE`.

### `diagnostics`

| | |
|---|---|
| Type | `(diagnostic: AvDiagnostic) => void \| Promise<void>` |
| Default | none |
| Layer | root only |

A sink for unplanned failures (responses with an `A3xxx` code), so you can log the real error that the response deliberately hides. It receives the original `error` object, which never reaches the response. Besides the unexpected failures of your adapter, pipelines and compute stages, it receives these reports, each with the `A3xxx` code the caller got:

| Report | `error` | Notes |
|---|---|---|
| An `A3xxx` `AvError` you threw on purpose (from a guard, pipe, hook, interceptor, compute stage or adapter, or returned by a filter) | the error you threw, with its message and issues | `deliberate: true` on the diagnostic. A failure the framework did not expect has no `deliberate` field, so a sink can tell the two apart. |
| A result that does not match its Contract (an adapter row with a wrong value, a missing field, a result of the wrong shape) | `AvOutputValidationError` (`error.name`), which names the operation and lists the problems in `error.issues` | The caller gets `A3000`. |
| A compute stage that returns a value its field refuses: a wrong type or format | `AvComputedValueError`, with the issues | The caller gets `A3000`, never the issues. A `create` or `update` value the field's validators refuse answers `A2004` at the field instead. A `read` value is not held to the validators. |
| An MCP `authorization.verify` that throws, or a failure of the MCP endpoint itself | the thrown error, on a diagnostic of `kind: "mcp"` | The caller gets `401` for `verify`, a bare `500` for the endpoint. |
| A pipe, field pipe or transaction pipe whose output the server contract refuses | `AvPipeOutputError`, naming the stage, the operation and the field | The caller gets `A3004`. |
| A transaction interceptor that called `next()` twice, or resolved without calling it | `AvTransactionIntegrityError` (`next-called-twice`, `steps-not-run`) | The caller gets `A3002`. |
| A request for a route your custom host did not mount | `AvUnmountedRouteError` | See [Custom host](/docs/custom-host#a-route-the-host-left-out). |

What the caller receives is unchanged in every case. `A2xxx` and `A4xxx` outcomes are not reported.

```ts
import type { AvDiagnostic } from "@aventara/core";

diagnostics: (d: AvDiagnostic) => {
  logger.error({ code: d.code, requestId: d.requestId, resource: d.kind === "operation" ? d.resource : undefined }, String(d.error));
},
```

```ts
type AvDiagnostic =
  | { kind: "operation";   error: unknown; code: AvOperationErrorCode; origin: "application" | "client";
      resource: string; family: AvOperationFamily; variant: string; requestId: string; operation?: number;
      deliberate?: true }
  | { kind: "transaction"; error: unknown; code: AvOperationErrorCode; origin: "application" | "client";
      requestId: string; operation?: number; deliberate?: never }
  | { kind: "mcp"; error: unknown; code: "A3000"; origin: "agent"; requestId: string };
```

`deliberate` is readable on every diagnostic without checking `kind` first. Only an operation diagnostic ever carries it.

A guard that throws a plain `Error("secret boom")` yields `{"code":"A3000","cause":{"message":"Internal framework error."}}` to the caller and the `Error` to the sink. A pipe that throws `new AvError("A3001", "billing service is down")` gives the caller `{"code":"A3001","cause":{"message":"Adapter execution failed."}}` and the sink a diagnostic with `code: "A3001"`, `deliberate: true` and your `error`, message included.

A message you put in an `AvError` with any code outside `A3xxx` (for example `A4002`) is sent to the caller exactly as written, so it must not carry database text, SQL, a stack, a path or a secret.

### `misuse`

| | |
|---|---|
| Type | `(event: AvMisuseEvent) => void \| Promise<void>` |
| Default | none |
| Layer | root only |

Counts the values server-side calls refused because they could not be read or were not plain data ([Server-side usage](/docs/server-side-usage#what-a-server-side-call-accepts)). It sits beside `diagnostics` and cannot change a response: an error it throws or a promise it rejects is ignored.

```ts
import type { AvMisuseEvent } from "@aventara/core";

misuse: (event: AvMisuseEvent) => metrics.increment("aventara.misuse", { kind: event.kind }),
```

In a configuration written as an `as const` object, the parameter has no contextual type, so annotate it as shown (otherwise TypeScript reports `Parameter 'event' implicitly has an 'any' type`).

```ts
type AvMisuseEvent = {
  kind: "unreadable-value" | "non-plain-value";
  path: readonly (string | number)[];       // the issue path the caller received
  origin?: "application" | "client";
  resource?: string;
  family?: AvOperationFamily;
  variant?: string;
  operation?: number;                        // the step, in a transaction
};
```

One event per refused value, never the value itself. The operation members are present when they could be read. Nothing is reported to both `misuse` and `diagnostics`. A real event, for a revoked Proxy passed as `where`:

```json
{"kind":"unreadable-value","path":["arguments","where"],"origin":"application","resource":"User","family":"find","variant":"unique"}
```

### `policy`

| | |
|---|---|
| Type | `{ engine: AvPolicyEngine; principal: (facts: { $state; $origin }) => unknown }` |
| Default | none: no policy, and nothing below runs |
| Layer | root only |

The policy engine that client and agent requests are checked against, and the function that derives a request's principal from its `ctx.$state`. Core never imports an engine: any object with the right shape satisfies `AvPolicyEngine`. The guide is [Policies](/docs/policies).

```ts
const framework = await createFramework({
  api: "/api",
  adapter,
  policy: {
    engine,                                   // satisfies AvPolicyEngine
    principal: ({ $state }) => $state.user ?? null,   // null: an anonymous caller
  },
});
```

`engine` has three questions, each answered now or as a promise, and three passive lists:

| Member | Meaning |
|---|---|
| `can({ principal, origin, action, resource, row?, exists })` | May the principal run `action` (`"read"`, `"create"`, `"update"`, `"delete"`) on `resource`? Asked without a row before anything runs, and with the row for a create and after an update. Returns a boolean. |
| `scopeOf({ principal, origin, resource, action })` | Which rows: `true` (all), `false` (none) or a `where` fragment (`AvPolicyWhere`) that core adds to the request. `action` is `"read"`, `"update"` or `"delete"`. |
| `fieldsOf({ principal, origin, resource, access })` | Which fields, for `access` `"read"` or `"write"`: `{ always: "all" \| string[], perRow: { field: where } }`. |
| `governed` | `{ [Resource]: string[] }`: fields and relations left out of every default projection. |
| `paths` | `{ [rule]: string[][] }`: the relation paths and operators the rules filter on, each path a list of segments such as `["Note", "campaign", "members", "some", "userId", "equals"]`. |
| `afterChecks` | `{ [Resource]: ["update"] }`: the updates whose grants carry an `after` condition. |

`governed`, `paths` and `afterChecks` are checked against the Core Contract when the framework is constructed. A name or path the Contract does not have is `CONFIG_INVALID_VALUE`, naming the Resource or the rule. A missing `policy.engine` or `policy.principal` is `CONFIG_REQUIRED`. Only `governed` reaches a Contract (a `governed: true` mark on each such field and relation), so the Contract hash changes only when that set changes. Policies never reach the ClientContract.

A refusal answers `403` `A4002` ([Error codes](/docs/error-codes#a4002)).

### `application` and `client`

The two overlays. Each holds the six layer keys below and nothing else: no `api`, `mcp`, `adapter`, `diagnostics`, `misuse` or `extends`. An application call sees the root plus `application`; a remote call the root plus `client`.

### `agent`

The layer an AI agent's calls run under, over MCP. It holds the six layer keys and `extends`:

| | |
|---|---|
| `extends` | `"client"` (default), `"application"` or `"root"`: the layer whose final view the agent narrows. Only the agent layer has this key; elsewhere it is `CONFIG_UNKNOWN_PROPERTY` and a type error. |
| `exposed` + `exemptions` | An Omit or a Pick of the parent's view. It never widens: naming what the parent hid under `exposed: false` is a type error whose message names the key and the parent (`Error: agent cannot expose 'Post.body': hidden by client`), and stops startup (`COMPILER_UNAVAILABLE_CAPABILITY`), the message naming the parent. |
| `pipelines`, `resources` | Additive along the chain: the root's stages, then the parent overlay's (none for `"root"`), then the agent's. Every stage sees `ctx.$origin === "agent"`. |
| `transactionsStyle`, `limits` | The parent's effective values unless the agent sets its own. |

Without an `agent` key the layer is the client's view exactly. It compiles to `framework.contracts.agent`, which carries its own hash; an agent view equal to the client's has the client's hash. `agent` is allowed without `mcp`.

## Layer keys

### `exposed` and `exemptions`

| | |
|---|---|
| Type | `exposed?: boolean`, `exemptions?: AvConfigExemptions` |
| Default | root: `exposed: true`, no exemptions (everything the adapter offers) |
| Layer | root, `application`, `client` (overlays only narrow) |

`exposed: true` exposes everything the layer above offers and `exemptions` lists what to hide; `exposed: false` exposes nothing and `exemptions` lists what to expose. The root's layer above is the adapter's model; an overlay's is the root's final view.

```ts
type AvConfigExemptions = {
  resources?: {
    [Resource]?: boolean | {
      operations?: boolean | AvOperationFamily[] | {
        [family]?: boolean | variant[] | { [variant]?: boolean };
      };
      fields?: {
        [field]?: boolean | capability[] | { [capability]?: boolean | token[] };
      };
    };
  };
};
```

| Value | Under `exposed: true` | Under `exposed: false` |
|---|---|---|
| `true` | hide the entry and everything under it | expose the entry and everything under it |
| `false`, `[]` | nothing (the entry follows `exposed`) | nothing (the entry stays closed) |
| a list | hide the listed entries one level down | expose only the listed entries one level down |
| an object | one level deeper; what it does not name is exposed | one level deeper; what it does not name is closed |

| Field kind | Capabilities | Token lists |
|---|---|---|
| scalar | `select`, `filter`, `order`, `orderNulls`, `create`, `update` | `filter`: operators; `create`, `update`: directives |
| relation | `select`, `include`, `filter`, `order`, `pagination`, `reducers`, `create`, `update` | `filter`: `nested`, `match`, `null`, `some`, `every`, `none`; `pagination`: `limit`, `offset`, `cursor`; `reducers`: `$count`; `create`, `update`: relation directives |

`select`, `include`, `order` and `orderNulls` take only `true` or `false`.

Filter operators: `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`, `mode`, `has`, `hasEvery`, `hasSome`, `isEmpty`, `path`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayContains`, `arrayStartsWith`, `arrayEndsWith`; only the ones the adapter offers for the field's type can be named. Scalar directives: `$increment`, `$decrement`, `$multiply`, `$divide`, `$push`, `$unset`. Relation directives: `$create`, `$connect`, `$connectOrCreate`, `$disconnect`, `$set`, `$update`, `$delete`, `$upsert`.

Which operators a field type offers (SQLite, in the served contract):

| Type | Filter operators |
|---|---|
| `string` | `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`, `mode` |
| `int`, `decimal`, `datetime` | `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte` |
| `boolean` | `equals`, `not` |
| enum | `equals`, `not`, `in`, `notIn` |
| `json` | `equals`, `not`, `mode`, `stringContains`, `stringStartsWith`, `stringEndsWith`, `arrayStartsWith`, `arrayEndsWith`; on PostgreSQL also `path` |

Which `mode` values a field takes (`filterModes`, `pathFilterModes`) is the adapter's fact about the database, not configuration: exempting `mode` removes it, but an exemption cannot name a single mode (`COMPILER_UNAVAILABLE_CAPABILITY`). See [Filtering](/docs/filtering-sorting-paging#case-mode).

Numeric fields offer `$increment`, `$decrement`, `$multiply`, `$divide` on update. Where a relation may be projected or written (at the top of a record, in a bulk write) is the adapter's fact and is not configurable.

Example: write-only `passwordHash` everywhere, no `User` deletes for remote callers:

```ts
exemptions: {
  resources: { User: { fields: { passwordHash: ["select", "filter", "order"] } } },
},
client: {
  exposed: true,
  exemptions: { resources: { User: { operations: { delete: true } } } },
},
```

The client contract then has no `delete` family on `User`, `passwordHash` carries `capabilities: { create: [], update: [] }` (no `select`, `filter` or `order`), and `framework.client.User.find.many({ select: ["id", "passwordHash"] })` answers `A2004` / `V1008`: `Field "passwordHash" is not selectable.` The whole guide: [Exposure](/docs/exposure).

### `transactionsStyle`

| | |
|---|---|
| Type | `"none" \| "interactive"` |
| Default | what the adapter provides (`"interactive"` for the Prisma adapter on SQLite and PostgreSQL, `"none"` with `@prisma/adapter-d1`) |
| Layer | root, `application`, `client` (override) |

`"interactive"` mounts `POST <api>/_transactions` and gives the generated client `avClient.tx` and `avClient.transaction`, and allows `forceTransaction`. `"none"` removes them for that layer. Any other value fails startup: `transactionsStyle must be "none" or "interactive"`. A layer cannot offer transactions the adapter cannot perform.

```ts
client: { transactionsStyle: "none" },   // remote callers cannot run transaction plans
```

See [Transactions](/docs/transactions).

### `limits`

| | |
|---|---|
| Type | `Partial<AvContractLimits>` |
| Default | the table below |
| Layer | root, `application`, `client` (override per limit) |

| Limit | Default | What it bounds | Error when exceeded |
|---|---|---|---|
| `maxRequestBytes` | `1048576` | Decoded size of a request body. | `413 A2010` (HTTP only) |
| `maxNestingDepth` | `12` | Depth of nested projections, relation filters, `NOT`/`not` chains and writes. | `A2009` / `V1013` |
| `maxListLimit` | `250` | The `limit` of a list or of a nested relation. | `A2009` / `V1014` |
| `maxTransactionOperations` | `20` | Steps in one transaction plan. | `A2009` / `V1014` |
| `maxBooleanNodes` | `50` | Nodes in a `where` boolean tree (`AND` / `OR` / `NOT`). | `A2009` / `V1015` |
| `maxJsonDepth` | `64` | Levels of nesting inside a Json field's value. | `A2009` / `V1021` |
| `maxAll` | `10` | Operations in one `POST /_all` ([Operation Sets](/docs/operation-sets)). In-process `all` is not bound by it. | `A2009` / `V1014` at `["operations"]` (HTTP only) |
| `maxAllConcurrency` | `4` | Operations of one Operation Set running at once; the rest wait. Also bounds in-process `all`'s `avLazy` calls. | none |

Each must be a finite non-negative integer (`maxAllConcurrency`: a whole number of at least `1`); otherwise startup fails (`CONFIG_INVALID_VALUE` at `limits.maxListLimit`). An unknown name fails with `CONFIG_UNKNOWN_PROPERTY` (`unknown limit property: foo`).

```ts
limits: { maxListLimit: 100 },
client: { limits: { maxListLimit: 25 } },
```

With this configuration the served contract has `"limits": { ..., "maxListLimit": 25, ... }` and the application layer keeps `100`. Client limits are part of the client contract, so changing them changes the [contract hash](/docs/contract-hash).

### `pipelines`

| | |
|---|---|
| Type | `AvPipeline` |
| Default | none |
| Layer | root, `application`, `client` (additive) |

Stages around every operation of the layer. The same `AvPipeline` shape goes on a Resource, a family and a variant under `resources`. See [Pipelines](#pipelines-reference).

`pipelines.cache` is the one stage that does not add up: `cache({ for, maxAge })` (from `@aventara/core`) on reads, at the root or `client` layer, a Resource, the `find` family or a `find` variant. The most specific level wins, and at one level `client`'s replaces the root's. Anywhere else it is `CONFIG_INVALID_VALUE`. See [Caching reads](/docs/caching-reads).

### `resources`

| | |
|---|---|
| Type | `{ [Resource]?: AvConfigResource }` |
| Default | none |
| Layer | root, `application`, `client` (a field `definition` at the root only) |

Everything about one Resource. Keyed by your model names.

```ts
type AvConfigResource = {
  pipelines?: AvPipeline;                         // every operation of the Resource
  operations?: {
    [family]?: {
      pipelines?: AvPipeline;                     // every variant of the family
      forceTransaction?: boolean;
      [variant]?: { pipelines?: AvPipeline; forceTransaction?: boolean };
    };
  };
  transactions?: { pipelines?: AvTransactionPipeline };   // once per transaction with a top-level step on it
  fields?: {
    [field]?: {
      definition?: AvConfigFieldDefinition;       // root only
      pipelines?: {
        validators?: AvZCheck[];                  // scalar fields
        pipes?: AvFieldPipe[];                    // scalar fields
        compute?: { create?: AvComputeCreate; update?: AvComputeUpdate; read?: AvComputeRead };   // scalar fields
        guards?: AvFieldGuard[];                  // scalar and relation fields
      };
    };
  };
};
```

| Key | Combines across layers by | Notes |
|---|---|---|
| `pipelines` at every level, field `pipes` and `guards`, `transactions.pipelines` | Additive, level by level | See [Pipelines](/docs/pipelines). |
| `forceTransaction` | Any layer forces it | Runs a plain call as a one-step transaction. Refused under an effective `transactionsStyle: "none"` (`CONFIG_INVALID_VALUE`). |
| `fields.<f>.pipelines.validators` | Additive | `AvZ` checks. See [Field validators](/docs/field-validators). |
| `fields.<f>.pipelines.compute` | Chained: the root's stage, then the overlay's with the root's result as `value` | See [Computed fields](/docs/computed-fields). |
| `fields.<f>.definition` | Root only | In an overlay: `CONFIG_FORBIDDEN_IN_OVERLAY`. |

A relation field takes `guards` only: `pipes` or `compute` on one is `COMPILER_RELATION_FIELD_CONFIG_UNSUPPORTED`, `validators` `COMPILER_INVALID_VALIDATOR`. Every name must exist: an unknown Resource (`COMPILER_UNKNOWN_RESOURCE`), family or variant (`COMPILER_UNAVAILABLE_OPERATION`) or field (`COMPILER_UNKNOWN_FIELD`) stops startup. Configuring a level never exposes it.

`defineResource<Model>()(name, rootBlock, { application?, client? })` from `@aventara/core` returns `{ root, application?, client? }`, each `{ [name]: block }`, typed exactly as `resources.<name>` in place at that layer, to spread into each layer's `resources` (`resources: { ...post.root }`, `client: { resources: { ...post.client } }`); a layer given no block is left out ([Configuration](/docs/configuration#one-resource-per-file-defineresource)).

### Fields

`resources.<Resource>.fields.<field>.definition` describes a field. On a field the adapter discovered you may restate its own `type`, `nullable` and `list`, and give a Json field its `json` shape; anything else is refused. A field the adapter did not discover is added, as a virtual scalar field: it must state `type`, `nullable` and `list`, and its `lifecycle` is `["VIRTUAL"]`. Only scalar fields can be added.

| Property | Type | Meaning |
|---|---|---|
| `type` | `{ scalar: string } \| { enum: string }` | A built-in scalar (`string`, `int`, `boolean`, `datetime`, `decimal`, `json`, ...) or an enum of the model. Required for an added field. |
| `nullable` | `boolean` | Required for an added field. |
| `list` | `boolean` | Required for an added field. |
| `lifecycle` | `["VIRTUAL"]` | The field is not stored. Added fields only. |
| `capabilities` | `Partial<AvScalarFieldCapabilities>` | What callers may do with it. Added fields only. |
| `format` | one of zod's named string formats (`"email"`, `"url"`, `"uuid"`, ...) | A fact the contract carries; the server checks computed output against it. Added fields only; any other name is a type error and `CONFIG_INVALID_VALUE`. |
| `json` | an `AvZ` shape | The shape of a `Json` field the adapter discovered ([JSON fields](/docs/json-fields)). |

```ts
import { AvZ } from "@aventara/core/avz";

resources: {
  User: {
    fields: {
      displayName: {
        definition: { type: { scalar: "string" }, nullable: false, list: false, lifecycle: ["VIRTUAL"], capabilities: { select: true } },
        pipelines: { compute: { read: ({ record }: { record: Readonly<Record<string, unknown>> }) => `${record.name ?? "?"} <${record.email}>` } },
      },
    },
  },
  Post: {
    fields: { meta: { definition: { json: AvZ.object({ title: AvZ.string() }) } } },
  },
},
```

`framework.application.User.find.many({ select: ["id", "displayName"], limit: 2 })` then returns `[{"id":1,"displayName":"Ada <ada@example.com>"}, ...]`, and the field appears in the client contract with `lifecycle: ["COMPUTED_ON_READ","VIRTUAL"]`.

### Compute

| Member | Type | When it runs |
|---|---|---|
| `create` | `({ field, value, data, ctx }) => unknown` | On every create (and an upsert's create branch), to compute the value written. |
| `update` | `({ field, value, data, ctx }) => unknown` | On every update (and an upsert's update branch). |
| `read` | `(({ field, value, record, ctx }) => unknown) \| { dependsOn?: field[]; compute: ... }` | When the field is read. `dependsOn` names stored scalar fields of the same Resource the compute needs; they are fetched even if the caller did not select them, and never returned. |

Returning `undefined` keeps the current value. `ctx` is `AvComputeContext`: the `$` facts and read operations only. A stage may be `async`.

## Pipelines reference

```ts
type AvPipeline = {
  guards?:       AvGuard[];
  pipes?:        AvPipe[];
  hooks?:        { before?: AvBeforeHook[]; after?: AvAfterHook[] };
  interceptors?: AvInterceptor[];
  filters?:      AvFilter[];
  cache?:        { for: "user" | "anonymous" | "everyone"; maxAge: number };   // cache({ for, maxAge }), reads only
};

// resources.<R>.transactions.pipelines
type AvTransactionPipeline = {
  guards?:       AvTransactionGuard[];
  pipes?:        AvTransactionPipe[];
  hooks?:        { before?: AvTransactionBeforeHook[]; after?: AvTransactionAfterHook[] };
  interceptors?: AvTransactionInterceptor[];
  filters?:      AvTransactionFilter[];
};
```

`before` and `after` sit under `hooks`; written directly in a `pipelines` object they are refused (`CONFIG_MOVED_PROPERTY`).

| Kind | Signature | Purpose |
|---|---|---|
| Guard | `(ctx) => boolean \| undefined \| Promise<...>` | Return `true` or `undefined` to allow; `false` denies with `A4001`. Throw an `AvError` to choose the code (`A4000`, `A4001`, `A4002`). |
| Pipe | `(args, ctx) => unknown` | Return new arguments (`args` is frozen); `undefined` keeps them. The result is checked against the server's own contract (`A3004`). The only stage that changes the arguments. At a variant, `args` is typed as the operation's arguments with no field required of a create: write compute, which may fill a required field, runs later. |
| Before hook | `(ctx) => void` | Runs after every interceptor has entered, outer to inner. |
| After hook | `(result, ctx) => void` | Runs on success, inner to outer, before any interceptor unwinds. `result` is a frozen copy. |
| Interceptor | `(ctx, next) => Promise<unknown>` | Wraps every hook and the operation; call `next()` once. May return a different result, which is checked like any result. |
| Filter | `(error, ctx) => AvError \| undefined` | Rewrite a thrown error; `undefined` passes it on. Inner to outer; the first that handles it wins. |
| Field pipe | `(value) => unknown` | A pure transform of one sent value. |
| Field guard | `(value, ctx) => boolean \| undefined \| Promise<...>` | Refuse when the caller sends the field (`A4001` on `false`). |

Order: guards (layer, Resource, family, variant, then field write guards, then nested targets' guards), pipes (the operation's, then field pipes), write compute, the re-check (Aventara's own checks on what pipes and compute produced, then the validators on every value, computed ones included), interceptors entering outer to inner, before hooks outer to inner, the adapter call, read compute, after hooks inner to outer, interceptors unwinding inner to outer; filters on a failure. A refusal by a guard, a pipe's output or a validator runs no interceptor or hook. In a transaction, a guard, a pipe or a validator on a literal value no compute changes refuses before it opens; write compute and the re-check of computed and `$ref` values run inside it, and a refusal there rolls it back. At each level the root's stages run, then the overlay's. Full detail: [Pipelines](/docs/pipelines#order).

`AvContext` is what each operation stage receives:

| Member | Type | Meaning |
|---|---|---|
| `$origin` | `"application" \| "client" \| "agent"` | Your own server code (and ctx calls), a remote caller, or an AI agent over MCP. |
| `$operation` | `{ resource; family; variant; nested? }` | The operation. Absent in a Resource transaction stage. |
| `$args` | `unknown` | The arguments, frozen: as sent in a guard, as piped in a pipe, as validated in an interceptor, hook or filter. In a transaction stage: `readonly AvTransactionStep[]`. |
| `$requestId` | `string` | The correlation id. |
| `$contract` | `AvContract` | The contract of the layer. |
| `$state` | `AvState` | The request's state: one writable object shared by every stage of the request and the ctx calls they make. Declare its members by augmenting `AvState` ([The pipeline context](/docs/pipeline-context#request-state)). Read-only in compute. |
| `$transport` | `{ method: "POST" \| "GET"; headers: Record<string, string> } \| undefined` | Present only for remote requests; `"GET"` for a [cached read](/docs/caching-reads). Header names are lower-cased; repeated headers are joined. |
| `$sql` | tagged template | Run SQL now ([The pipeline context](/docs/pipeline-context#ctxsql)). |
| `$transaction` | `(work: (tx) => Promise<T>) => Promise<T>` | Run calls in one transaction. |
| `<Resource>` | `{ <family>: { <variant>(args) } }` | Raw application-origin calls ([The pipeline context](/docs/pipeline-context)). |

```ts
import { AvError, type AvGuard } from "@aventara/core";

const requireSignIn: AvGuard = (ctx) => {
  if (ctx.$operation.family !== "find" && !ctx.$transport?.headers["authorization"]) {
    throw new AvError("A4000", "Sign in first.");
  }
  return true;
};
// client: { pipelines: { guards: [requireSignIn] } }
```

Denial answers (`client` layer): `return false` gives `{"code":"A4001","cause":{"message":"Operation denied by a framework guard."}}`; `throw new AvError("A4002", "Deletes are policy-denied.")` gives `{"code":"A4002","cause":{"message":"Deletes are policy-denied."}}`.

A non-framework error thrown from a stage becomes `A3000` with the generic message `Internal framework error.`; the original goes to `diagnostics`. A pipe that returns arguments the server's own contract refuses becomes `A3004` with the generic message `A server pipeline produced invalid arguments.` ([Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do)). In the Nest host, either one also writes one line to the server log ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log)).

> Annotate a stage with its exported type (`AvGuard`, `AvPipe`, `AvBeforeHook`, `AvAfterHook`, `AvInterceptor`, `AvFilter`, ...), as above, when the configuration is an `as const` object (as the scaffold's is), or the parameter has no contextual type. Details: [Pipelines](/docs/pipelines#typing-a-stage).

## describePrismaAdapter

From `@aventara/prisma7-adapter`. It takes `discovery`, `provider` and `driver` (the same three options as `createPrismaAdapter`, below) and returns the adapter's passive facts: the model, the driver's transaction capability, the referential actions and the computed fields. It takes no client and connects to nothing, so `aventara-build` can compile the Contracts from it. The scaffold's `src/aventara.adapter.ts` default-exports it:

```ts
// src/aventara.adapter.ts
import { describePrismaAdapter } from "@aventara/prisma7-adapter";
import { discovery } from "./generated/aventara/discovery.artifact.js";

export default describePrismaAdapter({
  discovery,
  provider: "postgresql",
  driver: "@prisma/adapter-pg",
});
```

## createPrismaAdapter

From `@aventara/prisma7-adapter`. It is `async` and returns the `adapter`. Spread the description into it: `createPrismaAdapter({ ...description, client })`. It still checks the client against the discovery artifact; the description cannot, because it has no client.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `client` | your `PrismaClient` | required | A client you have already constructed, with a driver adapter. The adapter never builds one or reads the environment. |
| `discovery` | `AvPrismaDiscoveryArtifact` | required | The generated artifact (`src/generated/aventara/discovery.artifact.ts`), produced by `aventara:prepare`. |
| `provider` | `"sqlite" \| "postgresql"` | required | Declared, never sniffed. |
| `driver` | `"@prisma/adapter-better-sqlite3" \| "@prisma/adapter-pg" \| "@prisma/adapter-d1"` | required | Declared, never sniffed. The driver decides whether transactions are offered; `@prisma/adapter-d1` offers none. This release is tested on SQLite (`better-sqlite3`), PostgreSQL (`pg`) and D1 (`@prisma/adapter-d1`, through Miniflare's local D1). On D1 there are no transactions and no `update.first`/`delete.first`, and a nested write is not atomic (Prisma's D1 adapter runs it as separate statements). A `BigInt` must lie within ±(2^53 − 1) on D1; beyond it is `422` `A2004` / `V1004` at the value. |
| `transactionOptions` | `{ maxWait?: number; timeout?: number; isolationLevel?: ... }` | Prisma's defaults (`maxWait` 2000 ms, `timeout` 5000 ms) | Owned by the adapter, not by Aventara's configuration. |

`isolationLevel` values: `"ReadUncommitted"`, `"ReadCommitted"`, `"RepeatableRead"`, `"Snapshot"`, `"Serializable"`. SQLite supports `Serializable` only; PostgreSQL supports all of them except `Snapshot`.

```ts
import adapter from "./aventara.adapter.js";

await createPrismaAdapter({
  ...adapter,                       // discovery, provider, driver and the rest of the description
  client: prisma,
  transactionOptions: { timeout: 10_000, isolationLevel: "Serializable" },
});
```

### aventara-prisma7-generate

The `aventara:prepare` script runs this bin to write the discovery artifact, then runs `aventara-build` ([CLI reference](/docs/cli-reference#aventara-build)). Run it again whenever the Prisma schema changes (the scaffold also runs it on `postinstall`).

| Flag | Meaning |
|---|---|
| `--schema <path>` | The `schema.prisma` file, or a Prisma 7 schema folder. |
| `--client <dir>` | The generated Prisma client's root (your generator block's `output`). |
| `--provider <name>` | `sqlite` or `postgresql`. It must agree with the `provider` of the schema's `datasource` block (PSL's `postgres` counts as `postgresql`). A flag the block contradicts, or a block naming a provider the adapter does not support, is refused (exit 1) before `prisma generate` runs, and the refusal names the flag to pass. A `provider` that is not a string literal is not compared. |
| `--driver <name>` | `@prisma/adapter-better-sqlite3`, `@prisma/adapter-pg` or `@prisma/adapter-d1`. |
| `--out <file>` | Where to write the artifact module (a `.ts` file). It must not be inside `--client`, whose files the next `prisma generate` clears, and must not name a directory; either is refused (exit 1) before Prisma runs. When the file system refuses the file (no permission, a part of the path that is a file, a full or read-only disk), the step says so in one sentence naming the file and why, and leaves no partial file behind. |
| `--config <file>` | Optional: your Aventara configuration module, such as `src/aventara.config.ts`. The step neither reads nor runs it. With it, the artifact imports the computed fields from `computed-fields.generated.ts`, the file `aventara-build` writes beside the artifact, so the types let the stages before compute leave exactly those out of a create. The file must exist; a missing `--config` file is refused. The scaffold passes it. Without it, the artifact states no computed field and the stages before compute may leave any create field out, and startup warns `AVENTARA_STALE_GENERATED_TYPES` when the artifact and the configuration disagree. |
| `-h`, `--help` | Print usage and exit 0. |

It needs a Prisma 7 CLI and `typescript` (below 7) resolvable from your project.

```text
aventara-prisma7-generate --schema prisma/schema.prisma --client src/generated/prisma --provider sqlite --driver @prisma/adapter-better-sqlite3 --out src/generated/aventara/discovery.artifact.ts --config src/aventara.config.ts
resources: User, Category, Post
```

Refusals are one line on stderr:

```text
aventara-prisma7-generate: --provider postgresql contradicts the schema's datasource `db` (/home/you/app/prisma/schema.prisma:6), which names provider "sqlite"; pass --provider sqlite.
aventara-prisma7-generate: the artifact file /app/src/generated/aventara/discovery.artifact.ts (--out) cannot be written: permission denied (EACCES).
```


## Startup diagnostics

Every mistake is thrown as one `AvConstructionError` with `stage` (`"configuration"`, `"discovery"` or `"contract-compilation"`) and `diagnostics`, each `{ code, path, message, docs }`; `docs` is the URL of the code's entry on [Error codes](/docs/error-codes). The complete table of codes, with examples, is on [Error codes](/docs/error-codes#startup-codes). The usual ones:

| Stage | Code | Meaning |
|---|---|---|
| `configuration` | `CONFIG_REQUIRED` | A required key is missing (`api`, `adapter`, a layer's `exposed` when it sets `exemptions`, `mcp.path`, `mcp.authorization.servers` or `verify`). |
| `configuration` | `CONFIG_UNKNOWN_PROPERTY` | A key the configuration does not define. |
| `configuration` | `CONFIG_INVALID_TYPE`, `CONFIG_INVALID_VALUE` | A value of the wrong type or outside what is allowed (a bad `api` or `mcp` path, an `mcp` authorization server that is not https, an unknown `agent.extends`, a negative limit, `forceTransaction` under `transactionsStyle: "none"`). |
| `configuration` | `CONFIG_MOVED_PROPERTY` | A moved key (`entrypoint`, or an rc.0 layer key); the message names where it lives now. |
| `configuration` | `CONFIG_FORBIDDEN_IN_OVERLAY` | A field `definition` in `application`, `client` or `agent`. |
| `contract-compilation` | `COMPILER_UNKNOWN_RESOURCE`, `COMPILER_UNKNOWN_FIELD`, `COMPILER_UNAVAILABLE_OPERATION`, `COMPILER_UNAVAILABLE_CAPABILITY` | A name in `resources` or `exemptions` that does not exist, or an overlay exposing what the root hid. |
| `contract-compilation` | `COMPILER_DANGLING_RELATION`, `COMPILER_MISSING_IDENTIFIER`, `COMPILER_HIDDEN_REQUIRED_FIELD` | Exposure that leaves a relation without its target, a unique operation without an identifier, or a create without a field it requires. |
| `contract-compilation` | `COMPILER_INVALID_VALIDATOR`, `COMPILER_INVALID_JSON_SHAPE` | A validator or Json shape that does not fit its field. |

A stale `prebuilt` file is not an error. It prints one warning, `AVENTARA_PREBUILT_STALE`, and the framework compiles at startup ([`prebuilt`](#prebuilt)).

### Startup safety checks

| Mistake | Startup diagnostic |
|---|---|
| Hiding a Resource while a visible relation still points at it | `COMPILER_DANGLING_RELATION` at `root.resources.User.fields.posts.target`: `relation target "Post" is not present in the active Contract` |
| A unique operation exposed with no complete identifier | `COMPILER_MISSING_IDENTIFIER` at the operation's path, for example `client.exemptions.resources.User.operations.find.unique` |
| A required create field hidden, or not writable on create, while the layer still creates the Resource, with no `compute.create` | `COMPILER_HIDDEN_REQUIRED_FIELD` at the field's path, for example `client.exemptions.resources.Post.fields.title` |
| A Resource that does not exist | `COMPILER_UNKNOWN_RESOURCE`: `resource "Nope" is not present in the canonical adapter model` |
| A field that does not exist | `COMPILER_UNKNOWN_FIELD`: `field "nope" is neither discovered by the adapter nor defined at the root` |
| A capability or token the adapter does not offer | `COMPILER_UNAVAILABLE_CAPABILITY` |
| A `json` shape on a field that is not `Json` (here `Post.title`, a string) | `COMPILER_INVALID_JSON_SHAPE`: `field "Post.title" is a string field; only a Json field the adapter discovered may declare a "json" shape` |
| A `json` that is not an `AvZ` shape (a Zod schema, say) | `COMPILER_INVALID_JSON_SHAPE`: `field "Post.meta": "json" must be a shape built with AvZ from "@aventara/core/avz"; a Zod schema or any other value is not accepted` |
| A shape that admits `null` or absence at its top level | `COMPILER_INVALID_JSON_SHAPE`: `field "Post.meta": a field's shape cannot admit null or absence at its top level; whether the field may be null comes from the adapter model` |
| A validator that does not fit the field (`AvZ.maxLength` on an `int`) | `COMPILER_INVALID_VALIDATOR` at `root.resources.Project.fields.budget.pipelines.validators[0]` |

A compiler diagnostic's path starts with the layer it is about: `root.`, `application.` or `client.`.

## See also

- [Configuration](/docs/configuration): the guided version.
- [Exposure](/docs/exposure), [Pipelines](/docs/pipelines), [Computed fields](/docs/computed-fields), [Field validators](/docs/field-validators)
- [Contract layers](/docs/contract-layers): how the root and overlays combine.
- [Error codes](/docs/error-codes): the codes a caller sees at runtime, and every startup code.
- [NestJS API reference](/docs/nest-api-reference): handing the configuration to `AventaraModule`.
- [Limits and safety](/docs/limits-and-safety)
