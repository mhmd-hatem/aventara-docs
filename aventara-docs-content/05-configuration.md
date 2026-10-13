---
title: Configuration
description: Configure the framework in src/aventara.config.ts - the root-only keys, the six layer keys, the resources tree, exposure, pipelines, limits, transactions, and the agent layer for MCP.
order: 5
section: guides
---

# Configuration

Aventara is configured by one object, usually returned from `src/aventara.config.ts`. Start from the generated file and add to it:

```ts
import { createPrismaAdapter } from '@aventara/prisma7-adapter';
import { discovery } from './generated/aventara/discovery.artifact.js';
import type { PrismaService } from './prisma.service.js';

export async function aventaraConfig(prisma: PrismaService) {
  return {
    api: '/api',
    // Everything the adapter offers is exposed. List what to hide under
    // `exemptions`, or set `exposed: false` and list what to expose instead.
    // See: https://aventara-framework.vercel.app/docs/exposure
    exposed: true,
    adapter: await createPrismaAdapter({
      client: prisma,
      discovery,
      provider: 'sqlite',
      driver: '@prisma/adapter-better-sqlite3',
    }),
  } as const;
}
```

Keep the `as const`: it keeps your Resource, field and operation names as literals, so TypeScript can check them against your model. A misspelled Resource or field name is a compile error.

Each part has a task guide:

| To... | Read |
|---|---|
| Decide what each layer exposes | [Exposure](/docs/exposure) |
| Hide a field, make it write-only or read-only | [Exposing and hiding fields](/docs/exposing-and-hiding-fields) |
| Require sign-in, answer `A4000`/`A4001` | [Authentication and guards](/docs/authentication-and-guards) |
| Transform, audit, wrap or rewrite errors | [Pipelines](/docs/pipelines) |
| Call other Resources, run SQL, write an outbox from a hook | [The pipeline context](/docs/pipeline-context) |
| Check a value's length, range or format | [Field validators](/docs/field-validators) |
| Add virtual fields, hash a password, compute a slug | [Computed fields](/docs/computed-fields) |
| Give a `Json` field a type that is checked on every write | [JSON fields](/docs/json-fields) |
| Tune limits | [Limits and safety](/docs/limits-and-safety) |
| Receive the real error behind a failure | [Request IDs and diagnostics](/docs/request-ids-and-diagnostics) |
| Ship it | [Deploying](/docs/deploying) |

## The shape

The root holds the keys only it can hold, and six layer keys. `application` and `client` are overlays that hold the same six layer keys and nothing else. `agent` holds them plus `extends` ([below](#the-agent-layer-and-mcp)).

```ts
type AvConfig = {
  // Root only
  api: string;                           // where the protocol is mounted, e.g. "/api"
  mcp?: string | { path: string; authorization?: { servers: string[]; verify } };  // turns MCP on
  adapter: AvAdapter;                    // from createPrismaAdapter(...)
  diagnostics?: AvDiagnosticsSink;       // the real error behind every A3xxx answer
  misuse?: AvMisuseSink;                 // server-side calls refused as unreadable or not plain data
  application?: Layer;                   // overlay for your server-side code
  client?: Layer;                        // overlay for remote callers
  agent?: Layer & { extends?: "client" | "application" | "root" };  // AI agents over MCP

  // The six layer keys: at the root, in application, in client and in agent
  exposed?: boolean;                     // true: exemptions hide; false: exemptions are all that is exposed
  exemptions?: AvConfigExemptions;
  transactionsStyle?: "none" | "interactive";
  limits?: Partial<AvContractLimits>;
  pipelines?: AvPipeline;                // stages around every operation of the layer
  resources?: { [Resource: string]: AvConfigResource };   // everything per Resource
};
```

Everything about one Resource lives under `resources.<Resource>`:

```ts
resources: {
  Post: {
    pipelines: { /* every Post operation */ },
    operations: {
      create: {
        pipelines: { /* every create variant */ },
        forceTransaction: true,                    // a plain create runs as a one-step transaction
        one: { pipelines: { /* create.one only */ } },
      },
    },
    transactions: { pipelines: { /* once per transaction with a top-level Post step */ } },
    fields: {
      title: {
        definition: { /* root only: describe or add the field */ },
        pipelines: { validators: [], pipes: [], compute: {}, guards: [] },
      },
    },
  },
},
```

Every name in the tree must exist: a Resource the model does not have (`COMPILER_UNKNOWN_RESOURCE`), an operation the adapter does not offer (`COMPILER_UNAVAILABLE_OPERATION`) or a field that is neither in the schema nor defined at the root (`COMPILER_UNKNOWN_FIELD`) stops startup with its path. Configuring a level does not expose it: what exists is decided by [exposure](/docs/exposure) alone.

### Root and layer overrides

The root is the core layer. `application` and `client` are overlays on it: an application call sees the root plus `application`, a remote call the root plus `client`, never both. Each layer key combines with the root by its own rule:

| Key | Root and overlay |
|---|---|
| `exposed` + `exemptions` | Narrowing only. The overlay starts from the root's view and can hide more; it can never bring back what the root hid. See [Exposure](/docs/exposure#layers-overlays-only-narrow). |
| `transactionsStyle` | Override: the overlay's value when it sets one, otherwise the root's. |
| `limits` | Override per limit: each limit the overlay sets wins; the others come from the root. |
| `pipelines`, and `pipelines` at every level of `resources` | Additive: at each level the root's stages run, then the overlay's. Nothing removes a stage. |
| field `validators` | Additive: the root's checks and the overlay's both apply to that origin. |
| field `compute` | Chained: the root's stage runs, then the overlay's, which receives the root's result. |
| field `definition` | Root only. In an overlay it is refused (`CONFIG_FORBIDDEN_IN_OVERLAY`). |
| `forceTransaction` | Any layer: the operation is forced when the root or the operation's overlay sets it. |

The `agent` layer follows the same rules with the layer it `extends` in the root's place: it narrows that layer's view, and its stages run after that layer's chain.

An override wins when it is present, not when it is truthy: `false` overrides. An explicit `undefined` is refused; leave the key out instead.

### Keys that moved

Configuration written for `1.0.0-rc.0` is refused at startup, with a `CONFIG_MOVED_PROPERTY` message that names the new location. In a configuration TypeScript checks against your model, the old key is a type error first:

| Before | Now |
|---|---|
| `restrictions` | `exposed` + `exemptions` |
| `fields: { Post: { url: { ... } } }` | `resources: { Post: { fields: { url: { definition: { ... } } } } }` |
| `behaviors: { Post: { fields: { slug: { create } } } }` | `resources: { Post: { fields: { slug: { pipelines: { compute: { create } } } } } }` |
| `transactions: "none"` | `transactionsStyle: "none"` |
| `entrypoint: "/api"` | `api: "/api"` |
| `pipelines: { before, after }` | `pipelines: { hooks: { before, after } }` |

The full migration is in [Upgrading](/docs/upgrading#from-100-rc0-to-100-rc1).

## Adapter

`createPrismaAdapter` takes a Prisma client you construct (with a driver adapter) and the `discovery` artifact generated by `aventara:prepare`:

```ts
await createPrismaAdapter({
  client: prisma,
  discovery,
  provider: "postgresql",              // "sqlite" | "postgresql", declared, never sniffed
  driver: "@prisma/adapter-pg",        // or "@prisma/adapter-better-sqlite3"
  transactionOptions: { timeout: 10_000, isolationLevel: "Serializable" }, // optional
});
```

`transactionOptions` (`maxWait`, `timeout`, `isolationLevel`) belong to the adapter and are not part of Aventara's public configuration. The `discovery` artifact is regenerated by `npm run aventara:prepare`; run that whenever your schema changes.

## Mount path: `api`

`api` is where the protocol is mounted (`"/api"`, `"/v1/data"`). Routes are relative to it: `GET /api/_contract`, `POST /api/_resources/User/find/many`. It alone decides the mount point; Nest's global prefix does not move it. See [NestJS host](/docs/nestjs-host#mount-path). Before rc.1 the key was `entrypoint`; that name is now refused with `CONFIG_MOVED_PROPERTY` ("entrypoint moved in rc.1: use api"). A frontend's `entrypoint` in `framework.client.ts` is a different setting, the server's full URL, and keeps its name.

## The agent layer and MCP

`mcp` turns MCP on. Give it the path the MCP endpoint is mounted at, written like `api`:

```ts
api: "/api",
mcp: "/mcp",
```

To require OAuth, give the path and an `authorization`: the authorization servers your callers get a token from (absolute `https` URLs, at least one), and `verify`, which checks one bearer token and resolves the caller, or `null` for a bad token:

```ts
mcp: {
  path: "/mcp",
  authorization: {
    servers: ["https://auth.example.com"],
    verify: async (token: string) => (await sessions.find(token)) ?? null,
  },
},
```

The path cannot be `api` itself or sit inside its `_` routes. Each mistake stops startup with its path (`mcp.path`, `mcp.authorization.servers[0]`, ...). The resolved endpoint is `framework.mcp`. `@aventara/mcp` serves it, mounted by `AventaraModule`: see [MCP](/docs/mcp) for the tools, the contract resource, authorization and connecting a client.

The tools an agent sees come from the `agent` layer. It holds the six layer keys, plus `extends`, the layer it starts from: `"client"` (the default), `"application"` or `"root"`. Without an `agent` key, agents see exactly what the client layer exposes.

```ts
agent: {
  extends: "client",             // the default
  exposed: true,
  exemptions: {
    resources: { User: { operations: { delete: true } } },   // agents never delete users
  },
  pipelines: { guards: [(ctx: AvContext) => ctx.$state.user !== undefined] },
},
```

The guard is annotated (`import type { AvContext } from "@aventara/core"`) because an inline stage in the `as const` configuration that `aventara init` writes has no contextual type (TS7006, see [The pipeline context](/docs/pipeline-context)).

- **It only narrows.** The agent starts from the view of the layer it extends and can hide more, never less. With `exposed: false` it lists what to keep, and naming something its parent hid stops startup, naming the parent: `field "User.passwordHash" is hidden by client, the layer agent extends, and the agent layer only narrows that view; expose it in client, or extend a layer that exposes it`.
- **Stages add up along the chain.** For an agent call the root's stages run, then those of the layer it extends (none for `"root"`), then the agent's, level by level. Every stage sees `ctx.$origin === "agent"`.
- **`limits` and `transactionsStyle`** are the parent's unless the agent sets its own.
- **Its own contract.** The layer compiles to `framework.contracts.agent`, with its own hash. An agent that exposes exactly what the client exposes has the client's hash.

`agent` works without `mcp`: the layer and its contract exist, and nothing serves them until MCP is on. To serve it, see [MCP](/docs/mcp).

## Exposure

`exposed` and `exemptions` decide what each layer exposes. With `exposed: true` (the root's default) everything the adapter offers is exposed and `exemptions` lists what to hide; with `exposed: false` nothing is exposed and `exemptions` lists what to expose:

```ts
// Root: hidden from every origin.
exemptions: {
  resources: {
    User: { fields: { passwordHash: ["select", "filter", "order"] } },     // write-only
  },
},
// Remote callers: no deletes on User, no internal notes.
client: {
  exposed: true,
  exemptions: {
    resources: {
      User: { operations: { delete: true }, fields: { internalNotes: true } },
    },
  },
},
```

A hidden field disappears everywhere in that layer: inputs, outputs, filters, ordering, identifiers and nested projections. The served contract is the client layer, so a client exemption also removes the field or method from the generated frontend client; regenerate it afterwards. The whole grammar, the startup checks and the Pick style are on [Exposure](/docs/exposure).

## One Resource per file: `defineResource`

A Resource's configuration can live in its own module, its root block and its overlay blocks together, and be spread into each layer's `resources` tree, the way route modules split a router. `defineResource<Model>()(name, rootBlock, { application?, client? })` returns `{ root, application?, client? }`, each `{ [name]: block }`. The root block is typed exactly as `resources.<name>` is typed in place: field names are checked against your model, stages are typed for the Resource, and a key that has no place there is a type error at the key. Each overlay block is typed as `application.resources.<name>` or `client.resources.<name>` is in place, against the root block: it can name a field the root block defines, it takes no `definition`, and a key that has no place in an overlay is a type error.

```ts
// src/resources/post.resource.ts
import { defineResource } from "@aventara/core";
import { AvZ } from "@aventara/core/avz";
import { discovery } from "../generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

export const post = defineResource<Model>()(
  "Post",
  {
    fields: {
      title: {
        pipelines: {
          pipes: [(value) => (typeof value === "string" ? value.trim() : value)],
          // /\S/ rather than minLength(1): the client checks "   " before the trim, the server after it.
          validators: [AvZ.regex(/\S/), AvZ.maxLength(200)],
        },
      },
    },
  },
  {
    // Remote callers only: they must send a token.
    client: { pipelines: { guards: [(ctx) => Boolean(ctx.$transport?.headers["authorization"])] } },
  },
);
```

The `title` validators are chosen to give the same answer before and after the trim, because the generated client checks the value as written and the server checks it after the pipe. See [Pipes that normalize](/docs/field-validators#pipes-that-normalize).

```ts
// src/aventara.config.ts
import { post } from "./resources/post.resource.js";
import { user } from "./resources/user.resource.js";

export async function aventaraConfig(prisma: PrismaService) {
  return {
    api: "/api",
    exposed: true,
    adapter: await createPrismaAdapter({ /* ... */ }),
    resources: { ...post.root, ...user.root },
    client: { resources: { ...post.client } },
  } as const;
}
```

A layer you gave no block is left out of the result, so there is nothing to spread for it (`user` above has only `root`). Spread, the configuration is the same as written inline: the same contracts and the same ClientContract hash. Stages written inside a `defineResource` block need no type annotation.

## Pipelines

Pipelines are server-side stages that run around operations: guards (allow or refuse), pipes (transform arguments), hooks (`before` / `after`), interceptors (wrap execution) and filters (rewrite errors). They go at the layer (`pipelines`), on a Resource, a family or a variant, and a field has its own validators, pipes, compute and write guards. They never appear in a contract. Every operation runs them in one order: guards, pipes, validators, interceptors, `before` hooks, the operation, `after` hooks, then the interceptors unwind; filters handle a failure ([Pipelines](/docs/pipelines#order)).

```ts
import { AvError, type AvGuard } from "@aventara/core";

// Refuse every write from remote callers that carries no Authorization header.
const requireSignIn: AvGuard = (ctx) => {
  if (ctx.$operation.family !== "find" && !ctx.$transport?.headers["authorization"]) {
    throw new AvError("A4000", "Sign in first.");
  }
  return true;
};

export async function aventaraConfig(prisma: PrismaService) {
  return {
    api: "/api",
    adapter: /* ... */,
    client: {
      pipelines: { guards: [requireSignIn] },   // remote callers only
    },
  } as const;
}
```

A caller that sends no `Authorization` header gets `A4000` (HTTP 401); the generated client throws `AvAuthError`.

A stage receives a `ctx` with `$operation` (`{ resource, family, variant }`), `$args` (frozen: only a pipe changes the arguments, by returning new ones), `$origin` (`"application"`, `"client"` or `"agent"`), `$requestId`, `$contract`, `$state` (the request's own writable object, such as the signed-in user) and, for remote requests, `$transport.headers` (lower-cased names; repeated headers joined). The rest of `ctx` calls the framework: `ctx.<Resource>.<family>.<variant>(args)`, `ctx.$sql` and `ctx.$transaction` ([The pipeline context](/docs/pipeline-context)). Guards return `true`/`undefined` to allow, `false` to deny with `A4001` (`FORBIDDEN`), or throw an `AvError` with the code you choose (`A4000` unauthenticated, `A4001` forbidden, `A4002` policy denied). A thrown `A2004` may carry `issues` (`{ path, code, message }`); the path must name a member of the request's arguments, such as `["arguments", "data", "email"]`, and each message reaches the caller as written when it is non-blank and at most 1,000 characters ([Pipelines](/docs/pipelines)).

Authentication and authorization belong in pipelines. Nest guards, interceptors and pipes never run on Aventara routes. See [Authentication and guards](/docs/authentication-and-guards), [Pipelines](/docs/pipelines) and [NestJS host](/docs/nestjs-host#what-runs-on-aventara-routes).

> Typing note: annotate a stage with its exported type (`AvGuard`, `AvPipe`, ... as above) when you write it in a configuration that a function returns `as const`, or the parameter has no contextual type (`Parameter 'ctx' implicitly has an 'any' type`). The same goes for the `diagnostics` function: annotate it `(d: AvDiagnostic)`. Stages written inline in `createFramework({ ... })` or in a `defineResource` block are typed from where they sit. See [Pipelines](/docs/pipelines#typing-a-stage).

## Limits

Limits bound what a caller may ask for:

| Limit | Default | What it bounds |
|---|---|---|
| `maxRequestBytes` | `1048576` | Decoded request body size (`A2010`). |
| `maxNestingDepth` | `12` | Nested projection, filter and relation depth (`A2009` / `V1013`). |
| `maxListLimit` | `250` | The `limit` of a list or nested relation (`A2009` / `V1014`). |
| `maxTransactionOperations` | `20` | Steps in one transaction plan (`A2009` / `V1014`). |
| `maxBooleanNodes` | `50` | Nodes in a `where` boolean tree (`A2009` / `V1015`). |
| `maxJsonDepth` | `64` | Levels of nesting inside a Json field's value (`A2009` / `V1021`). |

```ts
limits: { maxListLimit: 100 },
client: { limits: { maxListLimit: 25 } },
```

Client limits are part of the client contract, so changing them changes its hash. See [Limits and safety](/docs/limits-and-safety).

## Transactions

`transactionsStyle: "interactive"` (what the Prisma adapter offers by default) turns on `POST /_transactions`, the client's `avClient.tx` / `avClient.transaction`, and `forceTransaction`. `"none"` turns them off for a layer:

```ts
client: { transactionsStyle: "none" },
```

`forceTransaction: true` on an operation family or variant runs a plain call of it as a one-step transaction, so its after hooks commit with the write ([Pipelines](/docs/pipelines#forcetransaction)). Under an effective `transactionsStyle: "none"` it is a startup error. See [Transactions](/docs/transactions).

## Fields: definitions and compute

`resources.<Resource>.fields.<field>.definition` describes a field, at the root only. It adds a scalar field your database does not have (a virtual field, with `type`, `nullable`, `list`, `lifecycle: ["VIRTUAL"]`, `capabilities` and optionally a `format`), or gives a `Json` field the adapter discovered its shape (`json`). On a field the adapter discovered you may restate its own `type`, `nullable` and `list`, nothing else.

`pipelines.compute` attaches server-side code that computes a field's value on create, update or read: a hashed password, a slug, a display name. See [Computed fields](/docs/computed-fields), [Field validators](/docs/field-validators) and [JSON fields](/docs/json-fields).

## Diagnostics

`diagnostics` is root-only: one function that receives the raw error behind every unplanned failure, with the request id. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics). Its companion `misuse`, also root-only and optional, receives one event for every server-side call refused because its input could not be read or was not plain data ([Server-side usage](/docs/server-side-usage#what-a-server-side-call-accepts)).

## See also

- [Exposure](/docs/exposure) and [Exposing and hiding fields](/docs/exposing-and-hiding-fields)
- [Authentication and guards](/docs/authentication-and-guards), [Pipelines](/docs/pipelines) and [The pipeline context](/docs/pipeline-context)
- [Computed fields](/docs/computed-fields) and [Field validators](/docs/field-validators)
- [Configuration reference](/docs/config-reference)
- [Limits and safety](/docs/limits-and-safety)
