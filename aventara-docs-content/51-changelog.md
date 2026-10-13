---
title: Changelog
description: User-facing changes in each Aventara release, newest first.
order: 90
section: about
---

# Changelog

`1.0.0-rc.0` was the first release candidate, `1.0.0-rc.1` the second and `1.0.0-rc.2` is the third; the releases before them are pilots, and a pilot's API could change. A release candidate changes the API only to fix what testing finds. Pin exact versions. All `@aventara/*` packages are released together at one version. Each package also ships this history for itself as a `CHANGELOG.md` beside its README.

## 1.0.0-rc.2

The current release, published under the `rc` dist-tag (install with `@rc`). Upgrading from rc.1: see [Upgrading](/docs/upgrading#from-100-rc1-to-100-rc2).

**Smaller declarations**

- The discovery artifact exports the model's type by name, `AvModel`, and declares `model` with it. A project that emits declarations (Nest's default) writes the name instead of the whole model: over 50 models, the scaffold's `aventara.config.d.ts` goes from about 485 KB to under 1 KB, and a `buildFramework` / `AppFramework` module from about 930 KB to under 1 KB. Run `aventara:prepare` to regenerate the artifact.

**Types**

- A variant's guards, pipes and filters run before write compute, so their typed arguments no longer require any field of a create (create data, an upsert's `create`, nested creates): a pipe may return a create without a field `compute.create` fills. Hooks and interceptors keep the requirements.
- A `client` or `agent` layer under `exposed: false` that names what its parent hid is a type error that now ends with a sentence naming the key and who hid it, such as `Error: client cannot expose 'User.internalNotes': hidden by root`.

**Computed values**

- `compute.create` and `compute.update` values must pass the field's validators. One that does not is answered `A2004` at the field, like any refusal; a value of the wrong type stays `A3000`, with the details on an `AvComputedValueError` in the `diagnostics` sink. `compute.read` values are not judged.
- Validators now run after write compute, on every value that is written, so they see the piped and computed value. A call judges once.
- A pipe's output that fails Aventara's own checks (a wrong type, an unknown key, a required field it dropped, a reference written twice) answers `500` `A3004`, and so does a reference a compute stage wrote twice. A compute stage returning a value of the wrong type stays `A3000`.

**`undefined` values**

- An explicit `undefined` in write data counts as not sent, the same as leaving the key out: an optional field is omitted, an update leaves the field untouched, and a required create field is missing (`A2004`, `V1000`). This holds for server-side calls, `ctx` calls, pipe output and transaction steps. Before, it was refused with `V1001`.
- The generated client refuses `undefined` in a filter, a unique selector or a cursor (and a `where`, `cursor`, `limit` or `offset` key set to `undefined`; leaving the key out still means no filter) before anything is sent, with `AvValidationError` `A2004` / `V1001` at the same path the server uses. Before, JSON dropped the value and the request matched every row: `update.many({ where: { id: undefined } })` updated the whole table. Regenerate the client to get the check.
- `undefined` inside a `json` value becomes what JSON makes of it on every surface: a key holding it is left out, and an array element holding it is `null`. In rc.1 server-side calls refused the key with `V1001`, and a hole in an array was dropped, shifting the elements after it. Regenerate the client.

**Writes**

- One scalar action object holds one directive: `{ score: { $increment: 1, $decrement: 2 } }` is a type error and is refused with `A2004` / `V1001` at the field. In rc.1 the ORM refused it with `500` `A3001`.
- A `$divide` by zero is answered `422` `A2004` / `V1004` with the database's reason. In rc.1 it answered `500` `A3001`.
- A Json value whose top level is an object of `$` keys answers `A2004` / `V1006` in a plan step too. Before, it answered `A2007` / `V1016` there.
- A relation written together with its reference field (`V1012`) is refused before any guard, pipe or compute stage runs, and in a plan before the transaction opens. In rc.1 the developer's stages ran first.

**Filters**

- `mode` takes `"default"`, `"sensitive"` or `"insensitive"`, and each field lists the modes it offers in the contract (`filterModes`, `pathFilterModes`). An unoffered mode is a type error and is refused with `A2004` / `V1006` before the database is asked. With Prisma 7: PostgreSQL offers all three (a whole `Json` document not `"insensitive"`, which PostgreSQL could not run and answered `A3001`); SQLite offers `"default"`. Run `aventara:prepare` and regenerate the client.
- `mode`, `isEmpty`, `path` and a `Json` field's `string*` operands of the wrong type (`isEmpty: 3`, `mode: "loud"`, `path: "a.b"`) are refused with `A2004` / `V1001` at the operand. Before, they reached the ORM and answered `A3001`.
- `not` holding operators negates the whole object, with SQL's rule for unknown rows (a `NULL` or missing value matches neither). In rc.1 the Prisma adapter matched every row for a `Json` field's `not` with operators (updates and deletes included), matched no row for `not` with two operators, and answered `500` for `mode` inside `not`.
- Each filter object stands alone: a `mode` or `path` with no operator beside it is refused with `A2004` / `V1001` and is a type error.
- A value the database refuses (out of range, a NUL character in PostgreSQL text, too long for its column, an invalid character) is answered `422` `A2004` with the database's reason instead of `500` `A3001`.
- `AvProtocol.handleTransaction` copies a parsed plan when it is called, and a `$sql` step never runs a getter inside an object carrying `$ref`.
- A server-side `appTx` builder never runs a getter inside an object carrying `$ref`, and `AvProtocol.handleOperation` copies a parsed body when it is called, as documented.
- Clearer `orderBy` refusals: a `$ref` in `orderBy`, and a malformed null ordering, say what is wrong.
- `AvJsonValue` admits a property holding `undefined`.
- On a `Json?` field, writing `null` stores the database `NULL`, and `field: null` / `equals: null` match every row that reads back `null`. In rc.1 the Prisma adapter stored a JSON `null`, `equals: null` matched only JSON `null`s, and `field: null` answered `500` `A3001`.
- An empty to-one relation filter (`{ author: {} }`) matches the rows that have one. In rc.1 the Prisma adapter matched every row, and its `NOT` did too, so `delete.count({ where: { NOT: { author: {} } } })` deleted every row.
- In a filter, `mode`, `isEmpty` and `path` set to `undefined` are refused (`A2004`, `V1001`), like every other operator. Before, they reached the database as no condition.

**MCP**

- A request with no bearer token, or with another scheme, gets `401` with `WWW-Authenticate: Bearer resource_metadata="..."` and no `error` code. A bad bearer token keeps `error="invalid_token"`.
- A `verify` that throws is answered `401` and reported to the `diagnostics` sink (`kind: "mcp"`).
- With `mcp` configured and `@aventara/mcp` missing, the startup error prints `npm install --save-exact @aventara/mcp@<version>` with your `@aventara/core` version.

## 1.0.0-rc.1

Published under the `rc` dist-tag before rc.2. Upgrading from rc.0: see [Upgrading](/docs/upgrading#from-100-rc0-to-100-rc1). Every application's client contract hash changes (the contract now lists `maxJsonDepth`), so regenerate the frontend client.

**Breaking: the configuration has a new shape**

- The mount path's key is `api` (it was `entrypoint`), read back as `framework.api`. `entrypoint` is refused with `CONFIG_MOVED_PROPERTY`. The frontend's `entrypoint` (the server's URL in `framework.client.ts`) keeps its name.
- Every layer (the root, `application` and `client`) holds the same six keys: `exposed`, `exemptions`, `transactionsStyle`, `limits`, `pipelines` and `resources`. Everything about one Resource lives under `resources.<Resource>`: stages per Resource, family and variant, its transaction stages, and its fields with their `definition` and `pipelines`. See [Configuration](/docs/configuration).
- The rc.0 keys are refused at startup with `CONFIG_MOVED_PROPERTY`, naming the new place: `restrictions` (now `exposed` + `exemptions`), `fields` (now `resources.<R>.fields.<f>.definition`), `behaviors` (now `resources.<R>.fields.<f>.pipelines.compute`), `transactions` (now `transactionsStyle`), and `before`/`after` directly in `pipelines` (now `pipelines.hooks`). In a configuration TypeScript checks against your model, each is a type error at the key first, and so is any key that has no place where it is written.
- A field is defined at the root only. A `definition` in `application` or `client` is refused (`CONFIG_FORBIDDEN_IN_OVERLAY`). On a discovered field you may restate the adapter's `type`, `nullable` and `list`, and give a Json field its shape; a configured field's `format` must be one of zod's named string formats.
- `@aventara/core/json` is now `@aventara/core/avz`. `AvZ` is the same.
- `defineFields` is gone. `defineResource<Model>()("Post", rootBlock, { application?, client? })` defines one Resource's configuration in its own module, its root block and its overlay blocks, each typed as it is in place. It returns `{ root, application?, client? }`, to spread as `resources: { ...post.root }` and `client: { resources: { ...post.client } }`.

**Breaking: exposure replaces restrictions**

- `exposed` is a layer's default and `exemptions` lists the entries that are its opposite: with `exposed: true` they are what to hide, with `exposed: false` the only things exposed. A list always means "exempt these" (rc.0's `filter: ["equals"]` meant "keep only `equals`"). See [Exposure](/docs/exposure).
- Overlays only narrow. An overlay can no longer bring back what the root hid; that is refused, and the message names the other overlay to hide it in instead. An overlay that sets `exemptions` must set its own `exposed`.
- Every name in `exemptions` must exist and be offered by the adapter. A unique operation left without an identifier is refused (`COMPILER_MISSING_IDENTIFIER`) instead of disappearing. Where a relation is projected or written is the adapter's and cannot be narrowed.
- `aventara init` and `aventara new` write `exposed: true` into `src/aventara.config.ts`, with a comment linking the exposure page.

**Breaking: required create fields are typed**

- Each Resource's contract states what a create requires (`createRequirements`: `required` fields, `oneOf` required relations with their reference fields, and `parentSupplies` for nested creates), per layer. The generated client, `framework.application`, `framework.client`, the transaction builders and a stage's `ctx` require it: leaving out a required field, or writing a required relation neither way or both ways (`author` and `authorId`), is a type error. The runtime answers what it answered before (`A2004` with `V1000`, or `V1012` for both). See [Relations and nested writes](/docs/relations-and-nested-writes#required-relations-and-fields).
- The Prisma discovery artifact carries the requirements in its model (format 3): regenerate it with `npm run aventara:prepare`. The client contract hash changes for every schema with a required field.
- A field a pipe fills on the server is now required of callers. Give it a `compute.create` stage or a database default, or have callers send it.
- A layer that can still create a Resource can no longer hide a required field (or exempt its `create`), or a required relation together with a field that holds its reference (any one field of a composite reference), unless a `compute.create` stage fills it. Startup refuses it with `COMPILER_HIDDEN_REQUIRED_FIELD`, naming the layer, the Resource and the field. Keep the field exposed, move the pipe's value into a `compute.create` stage, or exempt the create operations. See [Exposure](/docs/exposure#creates-need-what-they-require).
- A `create.many` or `create.count` record cannot write a relation, so each record needs the reference field (`authorId`), in the types and at runtime (`V1000` at `data.<n>.authorId`). A layer that hides `authorId` while it keeps those variants is refused at startup, even with `author` exposed: keep `authorId`, give it a `compute.create`, or exempt `create.many` and `create.count` there. See [Exposure](/docs/exposure#bulk-creates-need-the-reference-field).
- A `compute.create` written inline in `createFramework({ ... })` counts in the create types without annotations, at the root and in an overlay. A `create` or `update` stage's `field` and `data` are keyed by `string`.

**Breaking: `Av` names**

- Every public type and class is `Av` plus what it is: `AvError`, `AvConfig`, `AvFramework`, `AvGuard`, `AvContext`, `AvConstructionError`, `AvDecimal`, `AvContractClient`, ... The generated client's names follow (`AvValidationError`, `AvNotFoundError`, `AvTransportError`, `AvCallOptions`, ...), as do `@aventara/client`'s, `@aventara/testing`'s and the Prisma adapter's. `PipelineContext` is `AvContext`, and `ComputeContext` is `AvComputeContext`, a compute stage's read-only `ctx`. Functions keep their names. No aliases.

**Breaking: server-side calls return data and throw**

- `framework.application`, `framework.client` and `framework.transaction` settle like the generated client: they resolve the data (a committed transaction its steps' results in order) and throw every failure as an `AvError` subclass, `AvValidationError`, `AvNotFoundError`, `AvConflictError`, `AvAuthError`, `AvInternalError`, `AvProtocolError` or `AvContractMismatchError`, now exported from `@aventara/core`, by the same code table as the generated client. A stage's `ctx` calls throw them too. `error.code` and `error.cause` are what the envelope carried. `framework.execute` and `framework.executeTransaction` still answer the envelope. See [Server-side usage](/docs/server-side-usage#errors).

**Breaking: pipelines**

- Every framework member of `ctx` starts with `$`: `ctx.$operation` (`{ resource, family, variant, nested }`), `ctx.$args`, `ctx.$origin`, `ctx.$requestId`, `ctx.$transport`, `ctx.$contract`, and the new `ctx.$state`. A model whose name starts with `$` is refused (`COMPILER_RESERVED_RESOURCE_NAME`).
- One stage order: guards, pipes, validators, interceptors, `before` hooks, the operation, `after` hooks, interceptors unwinding, filters. Every interceptor wraps every hook (in rc.0 every `before` hook ran ahead of every interceptor), and an overlay's `after` hooks run before the root's. A guard, a pipe's output or a validator that refuses a call runs no interceptor and no hook. In a transaction, every step's guards, pipes and validators run before it opens, so a refused step opens nothing. See [Pipelines](/docs/pipelines#order).
- Data is read-only once final. Only a pipe changes the arguments, by returning new ones; changing `args` or `ctx.$args` in place throws a `TypeError`. What the validators checked is what the adapter writes. An `after` hook gets a frozen copy of the result. See [Read-only data](/docs/pipelines#read-only-data).
- Nested writes run the target Resource's own guards and field stages. A nested `$create` of a `Category` under `Post.create` is refused when `Category`'s create guard refuses it (`A4001`).
- A transaction has one origin. A list that mixes `appTx` and `clientTx` steps is a type error, and `framework.transaction` refuses one that gets past the types: `A2004` with the new issue code `V1020`.
- A Json field's shape is one of its validators. It is checked where validators run, after every pipe (in rc.0 it was checked before the pipes), and its issues come in the order the call wrote the fields, with the other validators'. Before the pipes the framework only checks that the value is plain JSON. A field or operation pipe whose Json output breaks the shape is answered `A2004`, not `A3004`.
- A Resource's transaction filters are the transaction's outer layer: an error a step throws that its own filters leave unhandled continues to them before it is answered. A transaction interceptor's `next()` throws the failed step's `AvError` (`AvNotFoundError` for a unique miss), and catching it still rolls back. See [Pipelines](/docs/pipelines#resource-transaction-stages).
- A compute stage receives `{ field, value, data, ctx }` (`record` on read); its `ctx` is read-only (`AvComputeContext`). Compute stages chain across layers (the root's runs first, the overlay's gets its result); `false` no longer turns a stage off. An upsert computes its branches with `compute.create` and `compute.update`.

**New**

- The `agent` layer, for AI agents served over MCP: the six layer keys plus `extends` (`"client"` by default, `"application"` or `"root"`). It narrows that layer's view, its stages run after that layer's, and each stage sees `ctx.$origin === "agent"`. It compiles to `framework.contracts.agent`, with its own hash. `AvProtocol.bind(framework, { origin: "agent" })` runs agent calls through the same validation as HTTP calls. See [The agent layer and MCP](/docs/configuration#the-agent-layer-and-mcp).
- `mcp` turns MCP on: a mount path, or `{ path, authorization: { servers, verify } }` for OAuth. The resolved endpoint is `framework.mcp`. `@aventara/mcp` serves it: install it beside `@aventara/nest`, which mounts it. See [MCP](/docs/mcp).
- Stages at every level: `resources.<R>.pipelines`, `.operations.<family>.pipelines`, `.operations.<family>.<variant>.pipelines`.
- Field stages: [validators](/docs/field-validators), pure field `pipes`, field write `guards` (a relation field's guard covers `$connect` and friends).
- Field validators, written with `AvZ` in zod's check vocabulary (`AvZ.maxLength(80)`, `AvZ.gte(0)`, `AvZ.email()`, `AvZ.maxItems(5)`, ...). They are part of the contract, the server checks them after the guards and pipes, before any interceptor or hook and before a transaction opens, and the generated client checks them before it sends. A failure is `A2004` with `V1003` or `V1004`, and each issue carries `check` and `params`. Json shapes take the same checks: `AvZ.string().check(AvZ.maxLength(80))`.
- Resource transaction stages, `resources.<R>.transactions.pipelines`: once per transaction with a step on R, inside it, seeing the whole plan.
- `forceTransaction` on a family or a variant: a plain call runs as a one-step transaction, so its after hooks commit with the write or not at all.
- `ctx.$state`: one writable object per request, shared by every stage, a transaction's steps and the ctx calls they make. Declare its members by augmenting `AvState`. Seed it with `AventaraModule.forRoot({ state: (req) => ({ user: req.user }) })`, or per call with `{ state }` beside `requestId`. See [The pipeline context](/docs/pipeline-context#request-state).
- `ctx` is the framework's executor: `ctx.<Resource>.<family>.<variant>(args)` (raw, application-origin, joins the current transaction), `ctx.$sql` (outside a transaction, a plain statement with no transaction around it) and `ctx.$transaction(async (tx) => ...)`. See [The pipeline context](/docs/pipeline-context), with an outbox and a likes-counter recipe.
- A stage registered on one operation (`operations.<family>.<variant>.pipelines`) gets `ctx.$args` typed as that operation's arguments, read-only, and a pipe there takes and returns that type. See [Typed arguments](/docs/pipeline-context#typed-arguments).
- `framework.appTx.$sql`, a bound tagged-template SQL step in an application transaction. See [Transactions](/docs/transactions#sql-steps-apptxsql).
- A new limit, `maxJsonDepth` (default 64), for the depth of a Json value: `A2009` with the new code `V1021`.
- A `where` offers each field only the filter operators that field allows, in `framework.client`, `framework.application`, the transaction builders and the generated client.
- A project made by `aventara new` or `aventara init` has a `diagnostics` sink: it logs the raw error of a server failure, with its stack, through Nest's `Logger`.
- A server method that returns a call's result without a return type compiles in a project that emits declarations (Nest's default), Json shapes and transaction handles included. The new type exports `AvZShapedSchema` (`@aventara/core/avz`) and `AvOperationHandle` (`@aventara/core`) are what such a declaration names.

**Fixes and behaviour changes**

- A `$connect` to a record that does not exist answers `404 A2003` (it was `422 A2004`), also inside a transaction. On `update.first` it was `A2014`; a duplicate value through `update.first` is now `409 A2008` (it was `A3001`).
- `A2001` says `The requested Resource is not available.` and `A2002` says `The requested operation is not available on this Resource.` A transaction step with an unknown operation carries the same issue message as a single call.
- A `$ref` with no `fingerprint` is `A2004` / `V1000` (it was `A2007` / `V1017`).
- Operators inside `not` are checked against the field's allowed operators at every depth, and each object `not` counts toward `maxNestingDepth`.
- A forced operation no longer commits a failed step when a transaction interceptor catches the rollback. A transaction interceptor that calls `next()` twice or never rolls back with `A3002`.
- A `compute.read` dependency may be a field the root hides; it is read for the compute and never returned. The renamed compiler codes are `COMPILER_MISSING_READ_COMPUTE` and `COMPILER_INVALID_COMPUTE_DEPENDENCY`.
- Field write guards and field pipes are dispatched from lists planned at startup: a call to a Resource with none does no field-stage work, and a `create.many` reads its records for guards only when a guarded field is registered.

## 1.0.0-rc.0

Upgrading from pilot.4: see [Upgrading](/docs/upgrading#from-010-pilot4-to-100-rc0). The renames and behaviour changes are marked **Breaking** or **Behaviour change**; nothing sent over HTTP changes.

**Breaking**

- `scope` is now `origin`. Where a request came from (`"application"` or `"client"`) is `ctx.origin` in every guard, pipe, hook, interceptor and filter, in the context a computed field's behavior receives, in every diagnostic your `diagnostics` function receives, and in the request objects `framework.execute` and `framework.executeTransaction` take. There is no alias: replace `scope` with `origin`. The deprecated type `OperationScope` is gone; use `RequestOrigin`. The Nest log line for an internal failure now reads `(client origin, request ...)`.
- `@aventara/core` exports fewer names. Every name removed was undocumented, and every documented name is still exported. What Aventara's own packages need moved to `@aventara/core/internal`, which is not public API: it has no stability promise and may change or disappear in any release. Applications import from `@aventara/core`.

**Transactions**

- `$ref` works almost anywhere a value does. A step can use an earlier step's result in `$connect`, `$disconnect`, `$set` and the `where` of `$connectOrCreate`; in a `cursor`; in a unique `where`; in any filter operator at any depth, `AND`, `OR`, `NOT` and relation filters included; and at any depth of nested writes (the data of `$create`, `$update` and `$upsert`, and the `where` of `$update`, `$delete` and `$upsert`). The typed builders and the generated client accept a reference exactly where the server does: of the field's own type, nullable only for an equality on a nullable field, a list field for `in`, `notIn`, `hasEvery` and `hasSome`. An equality with a nullable source matches the rows where the field is unset, which can be many rows; comparison and text operators, unique keys and cursors refuse a nullable source (`A2007` / `V1011`). A reference in an `orderBy` or in a projection's `where` is still refused. See [Transactions with $ref](/docs/transactions-with-ref).

**Typed JSON**

- A `Json` field can have a type. Build a shape with `AvZ` from the new entry `@aventara/core/json` and declare it under `fields`. Server code and the generated client read and write the field as that type, and every write is checked before the database is asked, with one issue per problem at its exact path (`V1000`, `V1001`, `V1002`, `V1004`, `V1005`). Shapes are types only, with closed objects; reads and filters are never checked. The shape is part of the client contract, so declaring one changes the hash: regenerate the client. See [JSON fields](/docs/json-fields).

**Type-checking and validation**

- Pipeline callbacks type-check in an `as const` configuration. A guard, pipe, hook, interceptor or filter annotated with `Guard`, `Pipe`, `BeforeHook`, `AfterHook`, `Interceptor` or `Filter`, with no model type, is accepted wherever one typed for your model is, so the `Pick<PipelineContext, ...>` workaround is no longer needed (it keeps working). See [Pipelines](/docs/pipelines#typing-a-stage).
- A `null` in an operator that cannot take it is a `422`, not a `500`. `gt: null`, `contains: null`, `in: null` and the rest answer `A2004` / `V1001` at that operator, and are type errors. `equals: null` and `not: null` are unchanged.
- A relation filter in a nested `$update` or `$delete` is a `422`. Through a to-many relation on Prisma 7, the nested `where` takes plain fields only; a relation filter there answers `A2004` / `V1006` before the database is asked (it was `500` `A3001`), and is a type error. A to-one relation keeps relation filters. The contract states the limit, so the hash changes for a schema with a to-many relation: regenerate the client.

**Fixes**

- `framework.client` and `framework.application` types follow your restrictions. Hidden fields, turned-off `select`, `filter`, `order`, `create` and `update` capabilities, and disabled operations are now reflected per layer, like the generated client. A field hidden at the root is hidden on `framework.application` too. Filter operator narrowing is still not reflected in types.
- A pipeline stage's issue keeps its path inside a transaction. It arrives at `["operations", i, "args", ...]`.
- Every transaction error path is the literal address in the request body. Argument issues are at `["operations", i, "args", ...]`; a step's own defects are at `["operations", i, "resource"]`, `"family"`, `"variant"`, `"fingerprint"`, an unknown key, or `["operations", i]`. See [Error codes](/docs/error-codes#v-codes).
- An unavailable operation points at `["family"]` or `["variant"]` (`A2002` / `V1006`), never `["operation"]`.
- `deliberate` is readable on every diagnostic your `diagnostics` function receives; only operation diagnostics ever set it.

**Server-side calls**

- Behaviour change: server-side calls copy what you pass. `framework.application`, `framework.client`, `framework.execute`, `framework.executeTransaction` and the `appTx` / `clientTx` builders read your arguments once, when you call them. Changing or revoking your object afterwards (an Immer draft after `produce`) no longer affects the operation; a live Proxy still works. A value that cannot be read or is not plain data (a revoked Proxy, a throwing getter, a class instance, a `Map`) is refused as `422 A2004` / `V1001` at its path, where it used to be `A3000`, a `TypeError` from a builder, or accepted. Inherited, non-enumerable and symbol keys are dropped. See [Server-side usage](/docs/server-side-usage#what-a-server-side-call-accepts).
- A `misuse` hook counts those refusals. The optional root setting `misuse` receives a `FrameworkMisuseEvent` (`kind`, `path`, and the operation's `origin`, `resource`, `family`, `variant` and step), never the value. See [Configuration reference](/docs/config-reference#misuse).
- The generated client guards its arguments too. A value it cannot read is refused with a `TypeError` that names where, before anything is sent.

**Fixes found in testing**

- Root pipelines keep the framework typed. A guard, pipe, hook, interceptor or filter with a bare stage type in the root `pipelines` no longer turns `framework.application`, `framework.client`, `framework.appTx` and `framework.clientTx` into untyped objects.
- A reference field and its relation in one record is a `422`. `authorId` with `author: { $connect: … }` (required or optional relation) answers `A2004` / `V1012`, `Set "authorId" or "author", not both.`, where it used to be `500 A3001`. With Prisma, a record that writes one relation through its field and another directly is refused the same way, and the Contract states it as `referenceWrites: "uniform"`. Regenerate the discovery artifact (`npm run aventara:prepare`) and the client (`avclient generate`): the artifact format is now 2 and the Contract hash of a Prisma-backed application changed.
- Your issue messages reach the caller. A `FrameworkError("A2004", { message, issues })` you throw from a pipeline or computed behavior sends each issue's message as written (non-blank, at most 1,000 characters; the path must name a member of the request's arguments).
- A malformed `framework.execute` request is a `422`. A wrong `requestId`, `origin`, `protocol`, `transport`, `resource`, `family` or `variant` answers `A2004` with one issue per wrong member, and nothing runs; it used to be `A3000` or ran anyway.

**Diagnostics**

- `diagnostics` hears more. It now also receives an `A3xxx` error you threw on purpose (marked `deliberate: true`), a result that does not match its Contract (`OutputValidationError`), a computed field that returns a refused value (`ComputedValueError`), and, in a custom host that mounted only some of `protocol.surface()`, a request for a route it left out (`UnmountedRouteError`). What the caller receives is unchanged. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics#what-else-reaches-it).
- `FrameworkError` messages. For any code outside `A3xxx` the message reaches the caller exactly as written: keep database text, SQL, stacks, paths and secrets out of it.

**CLI and packages**

- Progress while it works. `aventara new`, `aventara init`, `avclient init` and `avclient generate` show their steps on stderr (a spinner and the seconds so far on a terminal, one plain line per step in a pipe, in CI or with `NO_COLOR`), then a closing line with the total time. `aventara` gains `--verbose` to show the output of `nest new` and the install as it runs. See [CLI reference](/docs/cli-reference#progress-aventara).
- Next steps print last. `aventara new` ends with the next steps, after the commit and the closing line. The scaffold's `prebuild` and `prestart` hooks are unchanged.
- `@aventara/testing` loads under CommonJS, and adds `AvProtocolCorpus` (the corpus's server side, to serve through your own client or host) and the corpus as plain JSON at `@aventara/testing/fixtures/protocol-v1.json`. The corpus gained rows for a transaction whose unique `where` and filter reference an earlier step, and for a reference to a step that does not exist. See [Testing and conformance](/docs/testing-and-conformance).
- Each package ships its `CHANGELOG.md`, beside its README.
- `@aventara/core` depends on `zod`, which only `@aventara/core/json` loads.

## 0.1.0-pilot.4

Published under the `pilot` dist-tag. Upgrading from pilot.3: see [Upgrading](/docs/upgrading#from-010-pilot3-to-010-pilot4).

**Server and CLI**

- The discovery artifact regenerates when you build or start. `aventara new` and `aventara init` add `prebuild`, `prestart`, `prestart:dev` and `prestart:debug` scripts that run `aventara:prepare`. After a change to `schema.prisma`, the next `npm run start:dev` (or `build`, `start`, `start:debug`) regenerates the Prisma client and the artifact before the server compiles; no reinstall needed. npm and pnpm run these hooks; Yarn Berry and pnpm with `enable-pre-post-scripts=false` do not, so run `aventara:prepare` yourself there. On an existing project, `aventara init` keeps a `prebuild` or `prestart*` script you already have unless you confirm or pass `--yes`.
- A clear error for an old artifact. An artifact written by an older adapter now fails the TypeScript build with `Property 'regenerate_with_aventara_prepare' is missing`, and the adapter refuses it at start-up with a message that names `aventara:prepare`. The fix is `npm run aventara:prepare`. See [Troubleshooting](/docs/troubleshooting#build-error-property-regenerate_with_aventara_prepare-is-missing).
- The scaffold's rate-limiting note links to the docs: [Rate limiting](/docs/limits-and-safety#rate-limiting), where it used to carry a placeholder.
- Plainer messages. The generate step's error messages say "the generated client's types" in words, not with Prisma's emoji labels.

**Packages**

- The comments an editor shows on hover, and the READMEs, now describe what each export does, how to use it, what it returns and what it throws. This applies to `@aventara/core`, `@aventara/nest`, `@aventara/prisma7-adapter`, `@aventara/client` and `@aventara/testing`, and to the declarations a generated client copies from `@aventara/core`.
- `@aventara/cli` ships no type declarations: it is a command, run with `npx` or installed globally, and has no API to import.

## 0.1.0-pilot.3

Published under the `pilot` dist-tag. Upgrading from pilot.1 or pilot.2: see [Upgrading](/docs/upgrading#from-010-pilot1-or-pilot2-to-010-pilot3).

**Server and CLI**

- CORS in the scaffold. `aventara new` and `aventara init` turn CORS on in `src/main.ts` for the origins listed in `CORS_ORIGINS` (default `http://localhost:5173,http://localhost:3001`), and write that variable into `.env`, an existing `.env` included. Unset or empty means CORS is off, never open to every origin. A `main.ts` that already configures CORS is left alone, with a warning; one with no `NestFactory.create` line is not edited, and the lines are printed. Before this, a browser frontend on another port got a CORS error. See [Deploying](/docs/deploying#cors-and-browsers).
- Rate limiting. The scaffold's `main.ts` ends with a commented-out platform-level limiter and a note: `@nestjs/throttler` is a Nest guard and does not run on Aventara's routes, `express-rate-limit` does. See [Rate limiting](/docs/limits-and-safety#rate-limiting).
- A first commit. `aventara new` ends with a git commit, `Initial Aventara Scaffold` (never `.env`), unless git is not installed or configured, the directory is already inside a repository, or you pass `--skip-git`.
- `--orm` takes an adapter name, `prisma7`; `--help` lists the values for `--orm`, `--db` and `--package-manager`. `prisma` and `prisma@7` are no longer accepted.

**Frontend**

- `avclient init` refuses a project with no `tsconfig.json` before it writes or installs anything (plain JavaScript is not supported yet).
- `avclient init` adds `.env` to the frontend's `.gitignore`.
- The generated client is type-checked with your project's own TypeScript, so the "typescript could not be resolved" warning appears only in a project without it, and Node's `stripTypeScriptTypes` warning is gone.

## 0.1.0-pilot.2

**Generated client**

- The client fits your project. It is still TypeScript source (`AvClient.ts` and `generated/`), but its imports are now spelled the way your `tsconfig.json` says: extensionless under `bundler` resolution (Next.js with Turbopack or webpack) or CommonJS, `.js` under `nodenext` (NestJS 12), `.ts` where your imports name `.ts` files (Vite's `react-ts`, Node's type stripping). You import it like your own files. Next.js 16 with Turbopack, which could not resolve the pilot.1 client, builds it. See [Client setup](/docs/client-setup#importing-the-client).
- The config loads like `prisma.config`. `avclient init` writes `framework.client.ts`; `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` are read, in ESM or CommonJS syntax. A pilot.1 `framework.client.mts` keeps working. Two config files are refused.
- The client type-checks under `"strict": false`, the `tsconfig` Next.js writes. A project without a `tsconfig.json` is refused.
- `avclient --version` and `-v`; `aventara -v`.

**Server**

- Pipe output is validated. What a pipe returns is checked against the server's own contract before it reaches the database. A refusal is the new internal code `A3004` (`500`) with the generic message `A server pipeline produced invalid arguments.`; the pipe, operation and field go to the server log and your diagnostics sink only. See [Pipelines](/docs/pipelines#what-a-pipe-may-and-may-not-do).
- A create that lacks a required field is `422` `A2004` with a `V1000` issue at the field's path, instead of `500` `A3001`. It covers `create.one`, every row of `create.many`, the create branch of an upsert, nested creates and transaction steps.
- A `BigInt` outside signed 64-bit is `A2004` / `V1004`, instead of `A3001`.
- Orphaning a required child (`$set: []` or `$disconnect` on a to-many whose children require the parent) is `409` `A2008`, instead of `A3001`.
- Internal failures are logged. `A3000` to `A3004` each write one line to Nest's log (code, operation, scope, request id, error class; never the error's message). See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log).
- A stale discovery artifact stops the server at startup, with a sentence that names `aventara:prepare`, when the Prisma client has a model or field the artifact lacks. The artifact's format changed, so regenerate it after upgrading.
- `aventara new` and `init` add `.env` to the project's `.gitignore`.

## 0.1.0-pilot.1

Upgrading from pilot.0 needs no code changes; see [Upgrading](/docs/upgrading#from-010-pilot0-to-010-pilot1).

**Frontend setup**

- `avclient init` writes `framework.client.mts`, an ES module that works in CommonJS and ESM projects (a plain `npm init -y` frontend now works without `"type": "module"`). From pilot.2 the default is `framework.client.ts` again, and a `.mts` keeps working.
- TypeScript 7 is supported in the frontend. The generator's `typescript` peer is `>=5.5.0`. Under TypeScript 7 the post-generate check is a syntax and shape check, reported in one warning; the client is still written. The CLI and the Prisma adapter still require TypeScript below 7 (the scaffolded server uses 6).

**Server**

- NestJS logs one startup line from the host: `Aventara mounted <N> operations at /api (+ GET /api/_contract, POST /api/_transactions)`.
- A request without the identity headers answers `400 A2000`, and the message now names the missing header or headers.

**CLI**

- The printed next steps use your package manager's runner (`npx` or `pnpm dlx`) and the `@pilot` dist-tag.
- `aventara new --help`, `aventara init --help`, `avclient init --help` and `avclient generate --help` print that command's usage and exit 0.

**Known cosmetic**

- The first `npx @aventara/client@pilot init` could print a "typescript could not be resolved" warning and Node's experimental-feature warning, even in a project that had TypeScript. Fixed in pilot.3.

## 0.1.0-pilot.0

The first public pilot release.

- `aventara new` and `aventara init` scaffold a NestJS 12 server with Prisma 7 on SQLite or PostgreSQL, or add Aventara to an existing project.
- Contracts compiled from your Prisma schema and configuration into three layers (core, application, client); only the client contract is served, at `GET <entrypoint>/_contract`, with its hash as `ETag`.
- Standard operations for every Resource: `find` (`first`, `unique`, `many`, `count`), `create` (`one`, `many`, `count`), `update` (`first`, `unique`, `many`, `count`), `delete` (`first`, `unique`, `count`) and `upsert.unique`, with filters, relation filters, `select` / `include`, ordering, offset and cursor pagination, `$count` and nested writes.
- Interactive transactions with references between steps (`$ref`), rollback and cascade refusal.
- A stable response envelope with `A` codes for outcomes and `V` codes for validation issues, and a fixed HTTP status per code.
- Configuration: restrictions per layer (hidden Resources and fields, write-only fields, switched-off operations), limits, pipelines (guards, pipes, hooks, interceptors, filters), virtual fields and behaviors, and a diagnostics sink.
- `@aventara/nest` hosts the protocol on Express or Fastify.
- `@aventara/client`: `avclient init` and `avclient generate` produce a standalone typed client with typed errors, `AbortSignal` and custom `fetch` support, and `tx` / `transaction`. The generated client has no runtime dependency on Aventara.
- `@aventara/core/protocol`: the HTTP protocol as plain data and functions, for writing your own host.
- `@aventara/testing`: conformance fixtures for adapters and hosts.
- License: PolyForm Shield 1.0.0 with an additional permission; see [License](/docs/license).

## See also

- [Roadmap](/docs/roadmap), [Installation](/docs/installation)
