---
title: Policies
description: Check rows, fields and writes per caller with a policy engine - the policy key, what the engine answers, governed fields and $defaults, how creates, updates, deletes and nested writes are checked, and the A4002 refusal.
order: 23
section: guides
---

# Policies

A guard answers one question: may this request run at all. A policy answers three, per Resource and per caller: may this action run, on which rows, and on which fields. Aventara asks them for you on every client and agent request and enforces the answers. You do not write the checks into each operation.

Aventara does not ship an authentication product or a rules language. It hosts a policy engine you provide, through a seam: any object with the right shape (`AvPolicyEngine`). Core never imports it. Without a `policy` key, none of this runs and the Contracts are the same bytes they were.

This page is for people writing or wiring an engine. For plain sign-in checks, a [guard](/docs/authentication-and-guards) is enough.

## Wire it up

Put `policy` in the configuration, root only. It holds the engine and a function that turns a request's `ctx.$state` (and `$origin`, the layer the request runs under) into a principal: the user, or `null` for an anonymous caller:

```ts
// src/aventara.config.ts
import { aventaraResources } from "./generated/aventara/resources.generated.js";
import { policyEngine, principalOfState } from "./policy.engine.js";

export const aventaraConfig = {
  api: "/api",
  exposed: true,
  resources: aventaraResources.root,
  policy: { engine: policyEngine, principal: principalOfState },
} as const;
```

The function may also be `async`, for a lookup that needs the database: `async ({ $state }) => (await users.find($state.userId)) ?? null`. One lookup can serve HTTP and MCP, because both seed `$state`. A rejected promise answers `500` `A3000`, as a throw does.

The principal function is a named, annotated function here because an inline arrow in an `as const` object has no contextual type ([Typing a stage](/docs/pipelines#typing-a-stage)). It reads what your host put in `$state` before the request started ([The pipeline context](/docs/pipeline-context#request-state)):

```ts
// src/policy.engine.ts
import type { AvState } from "@aventara/core";

export type Principal = {
  readonly id: number;
  readonly role: "READER" | "AUTHOR" | "ADMIN";
};

declare module "@aventara/core" {
  interface AvState {
    user?: Principal;
  }
}

export const principalOfState = ({ $state }: { readonly $state: AvState }) => $state.user ?? null;
```

Keep `policy` in the configuration, not only where the framework is created. If you use [build-time Contracts](/docs/deploying#build-time-contracts), `aventara-build` has to see it: a `policy` added only in `createFramework` makes the prebuilt file read as stale (`AVENTARA_PREBUILT_STALE`) and the Contracts compile at startup. The engine is imported by the build too, so its module must have no side effects.

### Where the principal comes from

The principal has to be in `$state` before the policy runs, because policy admission runs before your guards ([the order](/docs/pipelines#order)). Fill it from the host's `state` option, which reads what your auth middleware (Passport, for example) found on the platform request, or name the principal on the call with `{ as }`. A guard that writes `ctx.$state.user` is too late: the policy has already read an empty `$state` and refused the request as an anonymous caller.

This guard is too late. Policy admission has already run and refused the request as an anonymous caller:

```text
// Wrong: the guard runs after policy admission, so the policy never sees this user.
pipelines: {
  guards: [(ctx) => { ctx.$state.user = signedInUser; return true; }],
}
```

In NestJS, let the host fill `$state` from the request, before the policy runs:

```text
// Right: the host seeds ctx.$state from the platform request.
AventaraModule.forRoot({
  config: aventaraConfig,
  state: (req: Request) => ({ user: req.user }),
});
```

In server code, name the principal on the call with `{ as }` ([Who is checked](#who-is-checked)).

With an [access provider](#an-access-provider) there is no `principal` function: the provider's `state` seeds `ctx.$state.me`, and that is the principal.

A guard can still read `ctx.$state.user`, and verifying the token stays your middleware's job.

## An access provider

`access` takes the engine and the request state from one object, an `AvAccessProvider` (a type exported from `@aventara/core`). It replaces both the `policy` key and the host's `state` option. Aventara Access provides one, and you can write your own. It has two required members:

| Member | What it is |
|---|---|
| `policy` | The engine, as `policy.engine` takes it. |
| `state({ headers, request })` | Seeds each request's `ctx.$state`. Its `me` is the principal the engine is asked about, `null` for an anonymous caller. It may answer with a promise. A throw is answered like any failure of your code: a thrown `AvError` as its own code, anything else as `500` `A3000`. |

A third member, `client`, is optional. Aventara Access fills it, and its own documentation covers it. A provider written by hand leaves it out.

A point-of-sale till with its own PIN sign-in, written by hand:

```ts
import { createFramework, type AvAccessProvider } from "@aventara/core";

type Cashier = { id: string; role: "cashier" | "manager" };

declare module "@aventara/core" {
  interface AvState {
    me?: Cashier | null;
  }
}

// Stand-in for your own lookup.
async function cashierByPin(pin: string | null): Promise<Cashier | null> {
  return pin === "1234" ? { id: "c1", role: "cashier" } : null;
}

export const tillAccess = {
  // The till sends the PIN the cashier typed as `x-pos-pin`.
  state: async ({ headers }) => ({ me: await cashierByPin(headers.get("x-pos-pin")) }),
  policy: {
    can: ({ principal, resource, action }) => {
      const me = principal as Cashier | null;
      if (me === null) return false; // no PIN, no till
      if (resource === "Refund" && action !== "read") return me.role === "manager";
      return true;
    },
    scopeOf: () => true,
    fieldsOf: () => ({ always: "all", perRow: {} }),
  },
} satisfies AvAccessProvider;

const framework = await createFramework({ api: "/api", adapter, access: tillAccess });
```

Every stage reads the cashier as `ctx.$state.me`, typed by the `AvState` declaration. A PIN has few digits, so `cashierByPin` must limit attempts: count failures per till (or per cashier) and lock out after a few, or anyone on the network can try every PIN.

The host calls `state` once per request:

| Host | `headers` | `request` |
|---|---|---|
| [NestJS](/docs/nestjs-host#request-state-what-your-middleware-found) | the platform request's headers, as `Headers` | Express's `req`, or Fastify's `request` |
| [Next.js](/docs/nextjs-host#request-state), through `handlers` | the request's headers | the route's `Request` |
| Next.js, `avClient` and `@/aventara/universal` on the server | the headers of `next/headers` | none |

Server code that calls the framework directly passes the state itself: `{ state: await tillAccess.state({ headers }) }`.

Rules:

- `access` together with `policy` is refused at startup (`CONFIG_INVALID_VALUE` at `policy`), and is a type error at `policy`.
- `access` together with the host's own `state` option is refused (NestJS while it builds the application, Next.js when `Aventara()` is called), and is a type error where the configuration's type shows both.
- A provider whose `policy` is not an engine, or whose `state` is not a function, is refused at startup, member by member. The engine's `governed`, `paths`, `afterChecks` and `unheld` are checked as under `policy`, and reported under `access.policy`.
- A field the engine governs is left out of the default projection's type, as with `policy`.
- Keep `access` in the configuration if you use [build-time Contracts](/docs/deploying#build-time-contracts), as with `policy`: the prebuilt file records the engine's governed fields.

## What the engine answers

An engine has three questions. Each may answer now or as a promise. Every question tells you the `principal`, the request's `origin` (`"client"`, `"agent"` or `"application"`) and the `resource`.

| Question | Answers | Used for |
|---|---|---|
| `can({ action, row?, exists })` | `true` or `false` | May the principal run `action` (`"read"`, `"create"`, `"update"`, `"delete"`) on this Resource? Asked once with no row before anything runs. Asked again with the row for each created row and each updated row. For an update `afterChecks` lists, that question also carries `before` (see [Before and after](#before-and-after-the-row-as-it-was)). |
| `scopeOf({ action })` | `true`, `false` or a `where` | Which rows. `action` is `"read"`, `"update"` or `"delete"`. `true` is every row, `false` none. A `where` is a fragment of [Aventara's own filter grammar](/docs/filtering-sorting-paging), and core adds it to the request. |
| `fieldsOf({ access, action? })` | `{ always, perRow }` | Which fields, for `access` `"read"` or `"write"`. A write question also carries `action`, `"create"` or `"update"`; a read question's `action` is `undefined`, so an engine can destructure it from either question. `always` is `"all"` (every field that is not governed) or a list of names. `perRow` maps a field the principal may use on some rows only to the `where` those rows meet. |

And three lists the engine states, which core checks against the Core Contract when the framework starts (`CONFIG_INVALID_VALUE`, naming the Resource or the rule):

| Member | Meaning |
|---|---|
| `governed` | `{ [Resource]: string[] }`. Fields and relations left out of every default projection. See [Governed fields](#governed-fields-and-defaults). |
| `paths` | `{ [rule]: string[][] }`. The paths and operators your rules filter on, each path a list of segments: `["Note", "campaign", "members", "some", "userId", "equals"]`. A path the Contract cannot filter fails startup and names the rule. |
| `afterChecks` | `{ [Resource]: ["update"] }`. The updates whose grants carry a condition the changed row must still meet. See [Moving a row out](#moving-a-row-out-and-after-conditions). |

An engine may also list `unheld`: the Resources its rules read in conditions and decide no read of, such as a Resource another service owns that your rules filter through and never grant on. `scopeOf({ action: "read" })` answers `false` for those, for every caller, so a write that sends a reference to one would always be refused. For a Resource `unheld` lists, core does not hold a written reference to the read scope: a reference field written as a value, and a `$connect` or `$set` that links a row of it by the reference's own values (`{ id }`) where the writing row holds the reference. A `$connect` by another unique key (`{ email }`) is still held, since the reference it writes would tell the caller that row's identifier. The engine's own answers decide which row may be linked: `can` on the row a create inserts, and the after check of an update `afterChecks` lists (see [Moving a row out](#moving-a-row-out-and-after-conditions)). A rule that checks nothing through that relation lets the caller link any row of it by its identifier. Nothing else changes: every read of that Resource is still decided by `scopeOf`, and a link that changes a row of it is still held to its update scope. `unheld` is read once at startup: a value that is not a list of strings fails with `CONFIG_INVALID_TYPE`, and a name your data source's model does not have with `CONFIG_INVALID_VALUE`. It does not reach the Contracts.

```ts
const engine = {
  // ...the three questions, governed, paths, afterChecks
  unheld: ["Campaign"],
} as const satisfies AvPolicyEngine;
```

Only list a Resource whose reads your engine never allows. A Resource it does decide reads of, listed here, lets a write link a row of it the caller cannot read.

A reference to an `unheld` Resource is written as sent, with no lookup by core. A row that is not there fails on the database's own constraint (`A2008` on the Prisma adapter), not with `A4002`.

An engine may also have `hosted({ held })`. Core calls it once, when the framework is built and every startup check has passed. `held` lists the Resources a written reference is held to: every Resource of the Core Contract but those `unheld` lists, so none your root `exemptions` hide. A write that sends a reference to a row of one of them is refused unless the caller may read that row (see [Nested writes](#nested-writes)). Use it to check your rules and warn; it changes nothing the engine answers. It may answer with a promise, which startup awaits. A throw or a rejection fails startup. A `hosted` that is not a function fails startup (`CONFIG_INVALID_TYPE`).

A scope or a grant that does not validate against the Core Contract is a defect in your engine, not the caller's mistake: the request answers `500` `A3000`. The Core Contract is the server's own, so a scope may name a field the caller cannot see (`authorId`). A typed value in a scope or grant may be written as the application value (`Date`, `AvDecimal`, `bigint`, `Uint8Array`) or in its wire form (an ISO-8601 string, a decimal string, a digit string, base64), so rules read from JSON work as they are.

`exists(resource, where)` is a callback `can` receives. It answers a boolean and nothing else: does any row of that Resource match this `where`. Use it for a fact the row does not carry, such as "is the caller a member of this campaign". It runs unscoped, through the adapter, and is never exposed to callers.

Here is a complete engine for the blog in [Example: a blog API](/docs/example-blog-api). Anyone reads published posts. An author reads their own drafts, writes their own posts and edits only those. A user's email is readable on their own row only. It compiles against the current packages:

```ts
// src/policy.engine.ts (continued)
import type { AvPolicyEngine, AvPolicyWhere } from "@aventara/core";

// `principal` reaches every question as `unknown`: narrow it once.
function principalOf(value: unknown): Principal | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "role" in value &&
    (value.role === "READER" || value.role === "AUTHOR" || value.role === "ADMIN")
  ) {
    return { id: value.id, role: value.role };
  }
  return null;
}

export const policyEngine = {
  // Left out of every default projection. A caller names it to get it.
  governed: { User: ["email"] },
  // The paths the rules below filter on. Checked against the Contract at startup.
  paths: {
    "post.read": [
      ["Post", "published", "equals"],
      ["Post", "authorId", "equals"],
    ],
    "user.email": [["User", "id", "equals"]],
    "post.create": [
      ["User", "id", "equals"],
      ["User", "role", "in"],
    ],
  },

  async can({ principal, resource, action, row, exists }) {
    const user = principalOf(principal);
    if (user === null) return resource === "Post" && action === "read";
    if (resource === "Post" && action === "create") {
      if (row === undefined) return true; // admission: the row is checked next
      // A fact the row does not carry, asked of the database: is this still an author?
      return (
        row.authorId === user.id &&
        (await exists("User", { id: { equals: user.id }, role: { in: ["AUTHOR", "ADMIN"] } }))
      );
    }
    return true; // everything else: scopeOf narrows the rows
  },

  scopeOf({ principal, resource, action }) {
    const user = principalOf(principal);
    if (user?.role === "ADMIN") return true;
    if (resource === "Post") {
      if (action === "read") {
        const published: AvPolicyWhere = { published: { equals: true } };
        return user === null ? published : { OR: [published, { authorId: { equals: user.id } }] };
      }
      return user === null ? false : { authorId: { equals: user.id } };
    }
    if (resource === "User") {
      if (action === "read") return true;
      return user === null ? false : { id: { equals: user.id } };
    }
    return action === "read"; // Category: read only
  },

  fieldsOf({ principal, resource, access }) {
    const user = principalOf(principal);
    if (resource === "User") {
      // A caller may write only their own name; email is readable on their own row only.
      if (access === "write") return { always: ["name"], perRow: {} };
      return {
        always: "all",
        perRow: user === null ? {} : { email: { id: { equals: user.id } } },
      };
    }
    return { always: "all", perRow: {} };
  },
} as const satisfies AvPolicyEngine;
```

Keep `as const satisfies AvPolicyEngine`: `as const` is what lets the types leave governed fields out of default results, and `satisfies` checks the shape.

The rest of this page uses that engine in its examples.

## Who is checked

| Call | Checked? |
|---|---|
| A client request (HTTP, the generated client, `framework.client`, `framework.serverClient`) | Yes, as the principal `policy.principal` derives from the request's `ctx.$state`. |
| An agent request (an [MCP](/docs/mcp) tool call is one) | Yes, with `origin: "agent"`. The principal comes from the `$state` the MCP endpoint seeded. |
| `framework.application` | No, unless the call names a principal: `{ as: user }`. |
| `framework.client` or `framework.serverClient` with `{ as: user }` | Yes, and `as` replaces the principal `policy.principal` would have derived. |
| Each step of a transaction plan | Yes, under its own origin. A plan takes `{ as }` too. |
| A call a stage makes through `ctx` (`ctx.Post.find.many(...)`), and `ctx.$sql` | Never. It is server code. |

```ts
await framework.application.Post.find.many({});                // server code: not checked
await framework.application.Post.find.many({}, { as: user });  // checked as `user`
await framework.application.Post.find.many({}, { as: null });  // checked as an anonymous caller
```

`{ as }` is the second argument, the same one that takes `requestId` and `state` ([Server-side usage](/docs/server-side-usage#avexecutionoptions)).

A refusal is `403` `A4002`. A request is checked in this order: [framework validation](/docs/pipelines#order), then the policy's admission checks, then your guards, pipes and the rest. Your guards can assume the policy already admitted the request. The scope is added to the adapter's arguments after every stage of yours, so no stage can drop it.

### One principal per request

A [`POST /_all`](/docs/operation-sets) request carries several operations. Its state is seeded once and the principal is derived once, and every operation runs as that principal. Each operation is still decided on its own, exactly as on its own route: one refused with `A4002` changes nothing for the others. If the principal function throws or rejects, the whole request answers `500` `A3000`.

A read [cached](/docs/caching-reads) `for: "anonymous"` asks the policy who is anonymous: a caller whose principal is `null` or `undefined`. With an access provider, that principal is `ctx.$state.me`. The principal derived for that decision is the one the read runs as.

## Reads

### What is refused before the query runs

`can({ action: "read" })` is asked with no row. `false` answers `A4002`.

Then every field and relation the request names or receives is held to `fieldsOf({ access: "read" })`: the projection, the default projection it gets, its filters at every level, relation filters into other Resources, the sort and the cursor. A field that is in neither `always` nor `perRow` answers `A4002`.

### Rows: the scope

`scopeOf({ action: "read" })` is added to the request with `AND`, at every level that reads the Resource:

- the root `where`;
- every to-many `include` or `select` of a relation, and its `$count`;
- every relation filter (`some`, `every`, `none`), so a filter cannot reveal that out-of-scope rows exist.

Here Ada (an author) lists posts, and an anonymous caller does the same:

```ts
await framework.client.Post.find.many({ select: ["id", "title"] }, { state: { user: ada } });
// [{ id: 10, title: "Ada public" }, { id: 11, title: "Ada draft" }, { id: 13, title: "Bob public" }]
// Bob's draft (id 12) is not in her read scope.

await framework.client.Post.find.many({ select: ["id", "title"] });
// [{ id: 10, title: "Ada public" }, { id: 13, title: "Bob public" }]   published posts only
```

A to-one relation has no `where` to add a scope to. Core checks the included rows after the query instead: if one is outside the read scope, the whole request answers `A4002`. It is never turned into `null`. A unique read of a row outside the scope is a miss (`A2003`), the same as a row that does not exist. Sorting through a relation whose target has a scope is refused (`A4002`).

A cursor that names a row the caller cannot read answers exactly as a cursor that names a missing row, at the root and in a to-many relation, whatever else the cursor holds. The page never starts at the hidden row. On the Prisma adapter, a scoped cursor reads its row under the read scope first: one extra lookup for a readable row, and only that lookup for an unreadable one.

A scope of `false` is never put in a `where`: a read that can reach no row answers without calling the adapter.

### Governed fields and `$defaults`

Some fields are too sensitive to return unless a caller asks for them by name. List them in the engine's `governed` set: fields or relations, by Resource. A governed field:

- is left out of every default projection, for every caller, including callers allowed to read it and including `framework.application`;
- carries `governed: true` in the Contracts, the only trace a policy leaves there (the Contract hash changes only when that set changes);
- is typed as present, never optional or nullable, wherever a `select` names it.

A caller names it in `select`. `"$defaults"` is a `select` entry that stands for the level's default projection, so you do not list every field to add one:

```ts
await framework.client.User.find.many({ where: { id: { equals: 1 } }, select: ["$defaults", "email"] }, { state: { user: ada } });
// [{ id: 1, name: "Ada", role: "AUTHOR", createdAt: "…", email: "ada@x.io" }]
```

`$defaults` works at every nesting level. A `select` without it returns exactly what it lists. It is only valid in `select`; in `include` it is refused (`V1008`, "$defaults is a select entry: include already returns the default fields."). It is not specific to policies: it works on any Resource.

If the principal may not read the field on every row the request returns, the whole request is refused, never partly filled:

```ts
await framework.client.User.find.many({ select: ["$defaults", "email"] }, { state: { user: ada } });
// A4002: The policy does not allow reading every row or field this request returns.
```

Ada reads her own email because the engine grants it on the row where `id` is hers (`perRow`). Asking for everyone's email is refused. A request whose rows all meet the grant works, such as the one above with `where: { id: { equals: 1 } }`.

A governed field is also checked when it is only used to filter, sort or page. Otherwise `where: { email: { equals: "bob@x.io" } }` would reveal whether an address exists. Core runs one `exists` before the query: is there a row in the read scope, matching the caller's `where` without the governed conditions, that does not meet the field's grant? If so, the query never runs:

```ts
await framework.client.User.find.many({ where: { email: { equals: "bob@x.io" } }, select: ["id"] }, { state: { user: ada } });
// A4002: The policy does not allow filtering, sorting or paging by "email" of Resource "User" on every row this request reaches.
```

`"all"` in `always` covers every field that is not governed. A governed field needs a grant even for an admin: with `scopeOf` answering `true` for everything, an admin who selects `email` is still refused until `fieldsOf` grants it. List it in `always` (`always: ["id", "name", "email", ...]`) or give it a `perRow` condition.

## Writes

Every create, update, delete and upsert a client or agent makes (or an application call made `{ as }` a principal) is checked.

### The fields a write sends

Before any guard, each field of the write's data is held to `fieldsOf({ access: "write" })`. A field outside it answers `A4002`:

```ts
await framework.client.User.update.unique({ where: { id: 1 }, data: { role: "ADMIN" } }, { state: { user: ada } });
// A4002: The policy does not allow writing field "role" of Resource "User".
```

A write question names the action that writes the record, `action: "create" | "update"` (each branch of an upsert is its own, and a nested record takes its directive's). An engine can use it to lock a field once the row exists:

```text
// A post's authorId is set when it is created and never changed after.
fieldsOf({ resource, access, action }) {
  if (resource === "Post" && access === "write") {
    return { always: action === "create" ? ["title", "authorId"] : ["title"], perRow: {} };
  }
  return { always: "all", perRow: {} };
}
// Post.create.one({ data: { title: "x", authorId: 1 } })       allowed
// Post.update.unique({ where: { id: 10 }, data: { authorId: 2 } })
// A4002: The policy does not allow writing field "authorId" of Resource "Post".
```

An engine that ignores `action` keeps working.

A field writable on some rows only (`perRow`) is checked against every row an update reaches, and against the row a create inserts, after the insert. Pipe and compute output is server code and is not checked.

The fields a write returns only so the after check can read them are dropped as soon as it has. A `compute.read` stage on the answer is told the row the request asked for, not every scalar field.

### Creates

A create asks `can({ action: "create", row })` about each new row, on its final data. Rules can look rows up through `exists`.

```ts
await framework.client.Post.create.one({ data: { title: "x", authorId: 2 } }, { state: { user: ada } });
// A4002: The policy does not allow creating this row of Resource "Post".   (Ada is not Bob)
```

A create whose row reaches another Resource through a relation can be checked on that other row. The Core Contract and the adapter's discovery model state, on the end of the relation that holds the reference, which of the target's fields the reference fields name, pair by pair (`Note.campaign`: `referenceFields: ["campaignId"]`, `references: ["id"]`). An engine reads them from the model it is built from or from `framework.contracts.core` (its Resources and fields are typed `AvCoreResource`, `AvCoreField` and `AvCoreRelationField`, exported by `@aventara/core`, so a helper that returns one compiles with declarations), and asks one `exists` about the row they name: "a player creates a note only in a campaign they play in".

```text
// Note.campaign: referenceFields ["campaignId"], references ["id"]
exists("Campaign", { id: { equals: row.campaignId }, members: { some: { userId: { equals: user.id } } } })
```

Only the Core Contract and the discovery model carry `references`. The client, agent and application Contracts, `/_contract` and the MCP tools never do.

A create checks, then inserts. It runs no transaction around the two. Say the rule asks "is the caller a member of this campaign?". A membership revoked after the lookup and before the insert still lets that create through. A transaction would not close the gap: at a database's default isolation level, a plain lookup inside a transaction takes no lock. So none is used, and the check costs no BEGIN and COMMIT. Inside a [transaction plan](/docs/transactions), the lookups run in the plan's transaction and see the rows its earlier steps wrote.

### Updates and deletes

An update or delete acts only on rows the caller may both change (`scopeOf` for the action) and read. A single-row one carries the scopes inside its own statement. When it matches nothing, core asks one question to choose the answer:

| The row | Answer |
|---|---|
| The caller can read it, but not change it | `403` `A4002` |
| The caller cannot read it, or it does not exist | `404` `A2003` |

```ts
await framework.client.Post.update.unique({ where: { id: 13 }, data: { title: "x" } }, { state: { user: ada } });
// A4002: Bob's published post. Ada can read it, not change it.

await framework.client.Post.update.unique({ where: { id: 12 }, data: { title: "x" } }, { state: { user: ada } });
// A2003: Bob's draft. The answer does not reveal that it exists.
```

The many-row operations act on the caller's rows only, like row-level security in a database. `update.many` returns the changed rows and `update.count` and `delete.count` return how many rows changed. (`delete.many` is not offered with the Prisma adapter; use `delete.count`, see [Operations reference](/docs/operations-reference#deletemany).) An `update.many` with an empty `where` by Ada changes her own posts and leaves everyone else's alone, with no error.

An upsert is checked as an update when its row exists within the update and read scopes. When the row exists outside them it answers `A4002`, which reveals that the row exists, as a unique conflict would. Otherwise its create branch is checked as a create.

### Moving a row out and after conditions

An update that moves a row out of what the caller reads is rolled back with `A4002`:

```ts
await framework.client.Post.update.unique({ where: { id: 11 }, data: { authorId: 2 } }, { state: { user: ada } });
// A4002: The policy does not allow this change: it moves a row of Resource "Post" out of what the caller may read.
```

Core re-reads the changed rows under the read scope, but only when the update writes a field the read scope reads. An unscoped caller (`scopeOf` answers `true`) passes.

Inside the same transaction, every checked update also asks `can({ action: "update", row })` about each changed row, with the row as the update returned it. That is where a grant's `after` condition goes: `false` rolls the write back with `A4002`.

`afterChecks` decides what happens when the database cannot run that transaction (below). List `{ Post: ["update"] }` for an update whose grants carry an after condition. `"update"` is the only action it takes: any other fails startup (`CONFIG_INVALID_VALUE`).

### Before and after: the row as it was

For an update `afterChecks` lists, and only then, the after check's `can` question also carries `before`: the changed row as it was before the update, with the same fields as `row` (its identifier and every scalar field). Core reads it inside the update's transaction, before your interceptors and hooks run. With both rows, an engine can require that one grant covers the row before and after, so an update cannot move a row from the rows one grant reaches to another's.

The write is held to the row as it was read. If another write changes the row between that read and the update, the update misses it instead of passing a check on a stale `before`. A root `update.unique` then answers as any miss does ([Updates and deletes](#updates-and-deletes)). An `update.many` or `update.count` that changes fewer rows than it read is refused with `A4002` and rolled back.

A rule whose grant reads a relation through `exists` should not decide `before` in the after check: by then, `exists` sees what the same request wrote. Answer `grantsOf` instead. It is optional:

| Question | Answers | Used for |
|---|---|---|
| `grantsOf({ action: "update", row, exists })` | a list of strings | The engine's own keys for the grants that cover `row` as it is before the write. Asked once per row of an update `afterChecks` lists, after core reads the row and before any interceptor, hook or the write itself, so its `exists` sees nothing the request writes. |

Core never reads the keys. It hands them back on the after check of the same row as `beforeGrants`, so the engine can require the grant that covers `row` to be one of them. An engine that answers `grantsOf` and finds `before` without `beforeGrants` should answer `false`, not decide `before` after the write. An answer that is not a list of strings answers `500` `A3000`, and nothing is written. A `grantsOf` that is not a function fails startup (`CONFIG_INVALID_TYPE`).

The read takes no lock. A related row another transaction changes between `grantsOf`'s `exists` and the write is not held, the same race a create's lookups have ([Creates](#creates)).

### Nested writes

A write whose data writes a relation through a directive (`$create`, `$connect`, `$connectOrCreate`, `$update`, `$upsert`, `$delete`, `$disconnect`, `$set`) is checked too. It still runs as one adapter call inside the write's transaction, and one failed check rolls the whole write back with `A4002`.

- The fields a nested record sends are held to its own Resource's `fieldsOf({ access: "write" })`. A relation written through a directive is held to the parent's grant, its reference fields with it. In the engine above, a user may write only `name`, so `data: { posts: { $create: [...] } }` on a user is refused.
- Every row the nested write creates is read back as stored (its parent's reference filled, database defaults present) and asked `can({ action: "create", row })`. Its `exists` lookups see the rows the same call wrote.
- A row a directive links or unlinks is held to the scope of the row that changes. A linked row that holds the reference (a to-many relation's rows, the back end of a one-to-one, a many-to-many relation's rows) must be in its update scope. A linked row whose parent holds the reference (a to-one relation's target) must be in its read scope. A linked row that changes then gets the after check and the move-out re-read, as an update does.
- A unique update with a nested write on a row the caller can read but not change answers `A4002`, as the same update without one does. A row the caller cannot read, or that does not exist, answers `A2003`.
- A to-many nested `$update` or `$delete` acts only on the rows within the update (or delete) scope, as `update.many` does, and leaves the others alone. A to-one one refuses the write when its row is outside the scope.

### References a write sends

Writing a reference field (`data: { campaignId: 2 }`) links a row as a `$connect` does, and is held to the same rule: the row it names must be in the caller's read scope of its Resource, or the write is refused with `A4002`. That covers every record a write sends: a create's rows, an update's data, both branches of an upsert, and the records of its nested writes.

- A reference written `null` names no row and is not asked about.
- Where the target's read scope is `true`, nothing is asked. A row that is not there then fails on the database's own constraint.
- A reference the write does not state as a value (part of a composite reference, say) is refused where the target's read scope is not `true`.
- A reference to a Resource the engine lists in `unheld` is not held (see [What the engine answers](#what-the-engine-answers)).

Where the adapter can link the row inside the write, the check runs there. The Prisma adapter can for most writes, with one cost: a `$connect` makes one lookup before the write (a plain reference value, such as `authorId`, makes none); a bulk write (`create.many`, `update.many`) asks one lookup per target Resource first.

### Transactions: what runs where

When the operation's `transactionsStyle` is `"interactive"` (PostgreSQL and SQLite), a write that has a check after it runs in a transaction of its own: an update (its after check and move-out re-read), an upsert, a created row held to a write grant, a nested write, or returned rows checked by `exists`. A plain checked create or delete is one statement, and its interceptors and hooks run outside any transaction.

Where it is `"none"` (Cloudflare D1), a write that can only be checked after it runs is refused before it runs, with `A4002` saying the change cannot be verified on this database. That covers a move-out, an update that `afterChecks` lists, a created row held to a write grant, returned rows checked by `exists`, and any nested write. Every other write runs: a create looks up before it inserts, and an update `afterChecks` does not list runs without the after check.

On PostgreSQL, the round trips of a checked write:

| Operation | Round trips |
|---|---|
| `create.one` | 1 (2 when its rule asks one `exists`) |
| `delete.unique` | 1 |
| `update.unique` | 3 (4 when it writes a field the read scope reads) |
| `update.many`, `update.count` | 3 |

An update `afterChecks` lists reads its rows as they were first, one round trip more: `update.unique` 4 (5), `update.many` and `update.count` 4. With `grantsOf`, add the `exists` lookups its rules ask.

Reads and a Framework without a policy are unchanged.

## What a refusal looks like

Every refusal the policy makes answers `A4002`, HTTP `403`, and the client throws `AvAuthError`. The message names what was refused. The main ones are below:

| `cause.message` | Refused because |
|---|---|
| `The policy does not allow read on Resource "User".` | `can` said no to the operation. |
| `The policy does not allow creating this row of Resource "Post".` | `can` said no to a created row. |
| `The policy does not allow update on this row of Resource "Post".` | A single-row update missed, on a row the caller can read. A single-row delete says `delete` in the same place: `The policy does not allow delete on this row of Resource "Post".` |
| `The policy does not allow writing field "role" of Resource "User".` | A field outside `fieldsOf({ access: "write" })`. |
| `The policy does not allow reading every row or field this request returns.` | A field or relation the caller may not read on every returned row. |
| `The policy does not allow filtering, sorting or paging by "email" of Resource "User" on every row this request reaches.` | A governed field used to filter, sort or page. |
| `The policy does not allow this change: it moves a row of Resource "Post" out of what the caller may read.` | A move-out, rolled back. |
| `The policy does not allow this change: a changed row of Resource "Post" does not meet the condition its update grant sets.` | A changed row failed its grant's `after` condition, rolled back. |
| `The policy does not allow this nested write to link or unlink a row of Resource "Campaign" outside what the caller may change or read.` | A `$connect`, `$disconnect` or `$set` that reaches a row outside the scope described in [Nested writes](#nested-writes). |
| `The policy does not allow this nested write to change a row of Resource "Post" outside what the caller may change.` | A to-one nested `$update` whose row is outside the update scope. |
| `The policy does not allow this nested write to delete a row of Resource "Post" outside what the caller may delete.` | A to-one nested `$delete` whose row is outside the delete scope. |
| `The policy does not allow this nested write to write a field of Resource "Post" on every row it reaches.` | A nested write sends a field the caller may write only on some of the rows it reaches. |
| `The policy does not allow writing a field of Resource "Post" on the row this request creates.` | A row a nested write creates holds a field the caller's write grant does not allow for that row. A root create names the fields: `The policy does not allow writing "title" of Resource "Post" on the row this request creates.` |
| `The policy does not allow this write to link a row of Resource "User" outside what the caller may read.` | A reference the write sends names a row outside the caller's read scope, or a row that is not there ([References a write sends](#references-a-write-sends)). When the database refuses the link inside the write, the message names no Resource: `The policy does not allow this write to link a row outside what the caller may read.` |
| `The policy checks this update on Resource "Post" against the rows as they were before it, and 1 of the 3 rows it read changed before it ran (a concurrent write), so it was not applied.` | Another write changed a row between the `before` read and an `update.many` or `update.count` that `afterChecks` lists. Retry it. |
| `The policy does not allow writing "title" of Resource "Post" on every row this request reaches.` | A write to fields the caller may write only on some of the rows it reaches. |
| `The policy does not allow reading field "email" of Resource "User".` | The request names a field the caller may never read. |
| `The policy does not allow sorting by relation "campaign" of Resource "Note": it reaches rows of "Campaign" this request may not read.` | An `orderBy` through a relation to rows the caller may not read. |
| `The policy checks this update on Resource "Post" after it runs (whether it moves a row out of what the caller may read), which cannot be verified on this database: it has no interactive transaction to roll the write back in.` | A write that can only be checked after it runs, on a database whose `transactionsStyle` is `"none"` (see [Transactions: what runs where](#transactions-what-runs-where)). Other writes of that kind say what they check in the same place, for example `The policy checks the nested writes of this update on Resource "Post" inside its transaction, which cannot be verified ...`. |

Compare `A4001`, which stays the code of a guard's denial. A stage may also throw `new AvError("A4002", ...)` itself ([Error codes](/docs/error-codes#a4002)).

## What a policy does not do

- It does not check `framework.application` calls that name no principal, calls a stage makes through `ctx`, or `ctx.$sql`. They are server code.
- A create or upsert that hits a unique constraint on a row the caller may not read still reveals that the row exists. That is a documented limit.
- A write that names a row by reference does not reveal whether that row exists. A reference to a row that does not exist and a reference to a row the caller cannot read both answer `A4002`:

```text
// Note belongs to a Campaign. Ada can read Campaign 1 but not Campaign 2.
Note.update.unique({ where: { id: 1 }, data: { campaign: { $connect: { id: 999 } } } })
// A4002: no Campaign 999 that Ada may read.

Note.update.unique({ where: { id: 1 }, data: { campaignId: 2 } })
// A4002: the same answer. Campaign 2 exists, but Ada cannot read it.
```

  A `$connectOrCreate` still reveals it: it creates a row only when no row matches. So does a reference to a Resource whose read scope is `true` for the caller, or one the engine lists in `unheld`: nothing is held there, and a missing row fails on the database's own constraint.
- It is not authentication. It trusts the principal your function derives, and your middleware has to verify the token first.
- The rules never reach the ClientContract. The Contract carries one mark, `governed: true`, on the governed fields and relations.

## See also

- [Authentication and guards](/docs/authentication-and-guards): sign-in and request-level checks.
- [Exposure](/docs/exposure): what a layer offers at all, which is a different question from what a caller may read.
- [Configuration reference](/docs/config-reference#policy): the `policy` key.
- [Error codes](/docs/error-codes#a4002): `A4002`.
- [MCP](/docs/mcp): agent requests are checked as `origin: "agent"`.
