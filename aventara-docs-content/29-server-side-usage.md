---
title: Server-side usage
description: Call operations from your own NestJS services with framework.application and framework.client, catch the typed errors they throw, and pass a request id.
order: 29
section: guides
---

# Server-side usage

You do not need HTTP to use your data layer from your own code. Inject the framework into a Nest service and call the same operations directly. There are three typed surfaces:

| Surface | Runs under | Arguments | Use it for |
|---|---|---|---|
| `framework.application.<Resource>.<family>.<variant>(args, options?)` | the application layer | application values (`Date`, `bigint`, `AvDecimal`, `Uint8Array`) | trusted code: jobs, services, seeding |
| `framework.serverClient.<Resource>.<family>.<variant>(args, options?)` | the client layer: the same exposure, pipelines, validation and policy a remote caller gets | application values | server code that acts for a remote caller: a Next.js Server Component or Server Action, server-side rendering |
| `framework.client.<Resource>.<family>.<variant>(args, options?)` | the client layer, as above | wire values (ISO strings, decimal strings) | tests that must behave exactly like a remote caller |

Both run the full pipeline ([Pipelines](/docs/pipelines)): the root's stages, then the overlay's. Guards that read `ctx.$transport.headers` see no headers on a server-side call, because there is no HTTP request. From inside a stage, call the framework through `ctx` instead ([The pipeline context](/docs/pipeline-context)): those calls skip your stages and join the stage's transaction.

## Inject the framework

Nest's dependency injection carries no type argument, so export a type alias from your configuration:

```ts
// src/aventara.framework.ts
import { createFramework } from "@aventara/core";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import adapter from "./aventara.adapter.js";
import { aventaraConfig } from "./aventara.config.js";
import type { PrismaService } from "./prisma.service.js";

export const buildFramework = async (prisma: PrismaService) =>
  createFramework({
    ...aventaraConfig,
    adapter: await createPrismaAdapter({ ...adapter, client: prisma }),
  });
export type AppFramework = Awaited<ReturnType<typeof buildFramework>>;
```

```ts
// src/stats.service.ts
import { Injectable } from "@nestjs/common";
import { InjectFramework } from "@aventara/nest";
import { AvDecimal } from "@aventara/core";
import type { AppFramework } from "./aventara.framework.js";

@Injectable()
export class StatsService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  async userCount(requestId?: string) {
    return this.framework.application.User.find.count({}, { requestId });   // a number
  }
}
```

Add the service to a module's `providers` as usual. `@Inject(AVENTARA_FRAMEWORK)` is the same as `@InjectFramework()`. Every name in `select`, `where` and `data` is checked against your model, and against the layer: a field you hid for the client layer is a compile error on `framework.client` but fine on `framework.application` ([Exposing and hiding fields](/docs/exposing-and-hiding-fields)).

### Returning a Resource, a family or a call from a method

A Nest project emits declarations (`declaration: true`), so a method without a return type has its type written into a `.d.ts` file. A method can return any node of the façade without a return type: a Resource, a family, or a variant.

```ts
@Injectable()
export class PostsService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  posts() {
    return this.framework.application.Post;
  }

  findMany() {
    return this.framework.application.Post.find.many;
  }
}
```

The declaration file writes a short reference, under half a kilobyte per method at any schema size:

```ts
posts(): import("@aventara/core").AvApplicationResourceFacade<
  import("@aventara/core").AvContractView<import("…/discovery.artifact.js").AvModel, never, "omit", never, "omit", never, never>,
  "Post">;
findMany(): import("@aventara/core").AvApplicationProjectingCall<
  import("@aventara/core").AvContractView<import("…/discovery.artifact.js").AvModel, never, "omit", never, "omit", never, never>,
  "Post", { readonly family: "find"; readonly variant: "many" }>;
```

Before this, the declaration wrote the whole Contract view out (about 440 KB per method over 50 Resources), and a method that returned a transaction variant (`this.framework.appTx.Post.create.one`) could run the compiler out of memory. Code that does this needs no annotation now.

You never write these names yourself. They exist so a declaration can name what a method returns. They are exported from `@aventara/core`, one set per surface (`application`, `client`, `appTx`, `clientTx`):

| Node | `framework.application` | the others |
|---|---|---|
| the whole surface | `AvApplicationFacade` | `AvClientFacade`, `AvAppTxFacade`, `AvClientTxFacade` |
| one Resource | `AvApplicationResourceFacade` | `AvClientResourceFacade`, `AvAppTxResourceFacade`, `AvClientTxResourceFacade` |
| one family | `AvApplicationFamilyFacade` | `AvClientFamilyFacade`, `AvAppTxFamilyFacade`, `AvClientTxFamilyFacade` |
| a variant that takes a `select` or `include` | `AvApplicationProjectingCall` | `AvClientProjectingCall`, `AvAppTxProjectingCall`, `AvClientTxProjectingCall` |
| a variant that does not (the `count` variants, such as `find.count`) | `AvApplicationPlainCall` | `AvClientPlainCall`, `AvAppTxPlainCall`, `AvClientTxPlainCall` |

Each takes the Contract view, `AvContractView`, as its first argument. A configuration whose `resources` blocks hold `fields` entries has those entries written after each reference. That costs about 23 KB per method over 50 Resources that each configure a field. If that matters, annotate the method; the annotation is written as the short reference:

```ts
posts(): AppFramework["application"]["Post"] {
  return this.framework.application.Post;
}
```

An application that publishes no declarations can set `"declaration": false` and skip the question.

The configuration and the `AppFramework` alias cost almost nothing. The discovery artifact that `aventara:prepare` generates names the model's type, `AvModel`, so the declarations of `aventaraConfig` and `buildFramework` refer to it by name: about 0.5 KB whatever the size of your schema. Before 1.0.0-rc.2 each of them wrote the whole model out, about 0.5 MB per mention over 50 models. The artifact is regenerated on every install, build and start, so an upgraded project gets the name on its next build.

### A helper that takes or returns arguments

A helper that takes a call's arguments, or builds a `where` from them, needs no annotation either. Type the parameter off the call and let the return type be inferred. The declaration file names the argument types `@aventara/core` exports:

```ts
// src/post.filters.ts
import { Injectable } from "@nestjs/common";
import type { AppFramework } from "./aventara.framework.js";

type FindManyPosts = NonNullable<Parameters<AppFramework["application"]["Post"]["find"]["many"]>[0]>;

@Injectable()
export class PostFilters {
  publishedOnly(args: FindManyPosts) {
    return { AND: [args.where ?? {}, { published: { equals: true } }] };
  }
}
```

The declaration writes the `where` as `import("@aventara/core").AvWhereInput<…>`. A nested write's `data` is written as `AvCreateDataInput<…>` or `AvUpdateDataInput<…>` the same way. Before `1.0.0-rc.8` a helper like this failed `nest build` with `TS4023` (`has or is using name 'ScalarFilterOperands' … but cannot be named`), usually beside `TS7056` ([Troubleshooting](/docs/troubleshooting#build-error-ts4023-or-ts7056-on-a-helper-that-takes-arguments)).

You can also write the argument type yourself, for a very large type or by choice. Take the Contract view off the façade, then name the type:

```ts
// src/post.args.ts
import type {
  AvApplicationFacade,
  AvApplicationScalarForms,
  AvOperationArgumentsFor,
  AvWhereInput,
} from "@aventara/core";
import type { AppFramework } from "./aventara.framework.js";

type AppView = AppFramework["application"] extends AvApplicationFacade<infer C> ? C : never;

export type PostWhere = AvWhereInput<AppView, "Post", AvApplicationScalarForms>;

export type FindManyPostsArgs = AvOperationArgumentsFor<
  AppView,
  "Post",
  { family: "find"; variant: "many" },
  AvApplicationScalarForms
>;

// or, without the Contract view:
export type PostWhereFromCall = NonNullable<
  Parameters<AppFramework["application"]["Post"]["find"]["many"]>[0]
>["where"];
```

For `framework.client`, use `AvClientFacade` and `AvWireScalarForms` in place of `AvApplicationFacade` and `AvApplicationScalarForms`.

`framework.execute(request)` takes an `AvOperationRequest` and `framework.executeTransaction(request)` an `AvTransactionRequest`, both exported from `@aventara/core`. Each is a union by `origin`: `AvApplicationOperationRequest`, `AvClientOperationRequest` and `AvAgentOperationRequest` (and the same three for a transaction, `AvApplicationTransactionRequest`, `AvClientTransactionRequest` and `AvAgentTransactionRequest`). A client or agent request carries a `protocol` of `{ version, hash }`, typed `AvRequestProtocol`:

```ts
import type { AvOperationRequest, AvRequestProtocol } from "@aventara/core";
import type { AppFramework } from "./aventara.framework.js";

export function run(framework: AppFramework, request: AvOperationRequest) {
  return framework.execute(request);
}

export const identity: AvRequestProtocol = { version: 1, hash: "…" };
```

In the same way, `framework.appTx.$sql` is an `AvSqlStatementBuilder`, and the values it binds are `AvSqlStatementValue`. A method that returns `framework.appTx.$sql` needs no annotation.

## Errors

Server-side calls settle the way the generated frontend client does: they resolve the data, and every failure is thrown as an `AvError` subclass, one per code class, exported from `@aventara/core`:

```ts
const post = await this.framework.application.Post.find.unique({ where: { id: 1 }, select: ["id", "title"] });
// { id: 1, title: 'Hello' }

await this.framework.application.Post.find.unique({ where: { id: 999 }, select: ["id", "title"] });
// throws AvNotFoundError: code "A2003", cause { message: "No record matched the unique selector." }
```

| Class | Codes | When |
|---|---|---|
| `AvValidationError` | `A2004`, `A2007`, `A2009` | The arguments broke a Contract rule; `cause.issues` says which, by code and path. |
| `AvNotFoundError` | `A2003` | A `unique` target does not exist. The miss fails inside the pipeline: no `after` hook runs, and a filter may turn it into another error ([Pipelines](/docs/pipelines#a-unique-operation-that-finds-no-row)). |
| `AvConflictError` | `A2008`, `A2013`, `A2014` | The write conflicted with stored state. |
| `AvAuthError` | `A4000`, `A4001`, `A4002` | A guard refused, a policy refused a call made `{ as }` a principal, or an `AvError` with one of these codes was thrown. |
| `AvProtocolError` | `A2000`–`A2002`, `A2006`, `A2010`–`A2012` | The operation is not one this layer offers. |
| `AvInternalError` | `A3000`–`A3004` | The server failed; the real error went to `diagnostics`. |
| `AvContractMismatchError` | `A2005` | A stale generated client; an in-process call never meets it. |

A `first` that matches nothing resolves `null`; a `count` resolves a number. `error.code` is the outcome code and `error.cause` is `{ message, issues?, operation? }`, exactly what the HTTP envelope would carry. Branch on the class or on `code`, never on `cause.message`:

```ts
import { AvNotFoundError } from "@aventara/core";

async findOrNull(postId: number) {
  try {
    return await this.framework.application.Post.find.unique({ where: { id: postId }, select: ["id", "title"] });
  } catch (error) {
    if (error instanceof AvNotFoundError) return null;
    throw error;
  }
}
```

Throw your own exception (a Nest `NotFoundException`, say) where it makes sense for your callers; the framework does not decide your service's errors. `framework.execute` and `framework.executeTransaction`, the untyped entries a custom host calls, still answer the envelope `{ data, code, cause }` without throwing ([Custom host](/docs/custom-host)).

## Values: application and wire forms

Application values on `framework.application`:

```ts
const post = await this.framework.application.Post.update.unique({
  where: { id: 1 },
  data: { publishedAt: new Date(), price: new AvDecimal("12.50"), bigViews: 1n },
  select: ["id", "publishedAt", "price", "bigViews"],
});
// { id: 1, publishedAt: 2026-10-06T23:00:55.918Z, price: AvDecimal {}, bigViews: 1n }
```

`AvDecimal` is exported from `@aventara/core`; it holds the decimal string and does no arithmetic. On `framework.client` the same input is in wire form (strings), while results are always application values:

```ts
const post = await this.framework.client.Post.update.unique({
  where: { id: 1 },
  data: { publishedAt: "2026-05-01T12:00:00.000Z", price: "12.50" },
  select: ["id", "publishedAt", "price"],
});
// { id: 1, publishedAt: 2026-05-01T12:00:00.000Z, price: AvDecimal {} }
```

### `framework.serverClient`: the client layer with application values

`framework.serverClient` runs the request `framework.client` would run, but takes the values `framework.application` takes. It is typed from the Client Contract's view, so what the client layer hides is absent, and the client pipelines, validation, exposure and policy all run:

```ts
const recent = await this.framework.serverClient.Post.find.many({
  where: { publishedAt: { gt: new Date(Date.now() - 86_400_000) } },
  select: ["id", "title", "publishedAt"],
});
```

- Arguments are typed as application values (`Date`, `bigint`, `AvDecimal`, `Uint8Array`); a wire string where a `Date` goes is a type error. At runtime a value already in its wire form is accepted too, as `framework.client` reads it.
- Each call copies its arguments, encodes the copy into the wire forms against the Client Contract, and runs that request: the same answers and the same `AvError` classes as `framework.client`. Results are `framework.client`'s.
- `framework.serverClientTx` builds client-layer transaction handles from application values. One `framework.transaction([...])` may hold them beside `framework.clientTx` handles, never beside `framework.appTx` ones.
- The `state` and `as` options work as on `framework.client` ([AvExecutionOptions](#avexecutionoptions)), and so does `signal` (it aborts that call).
- `framework.serverClient.all({ key: call, ... }, { settle?, signal? })` awaits an object of calls together, in process. A call runs when it is made; wrap one in `avLazy(() => call)` (from `@aventara/core`) for `all` to start it, at most `limits.maxAllConcurrency` at once. It takes any number of calls: `limits.maxAll` bounds `POST /_all` only. Strict by default; `settle: true` settles each key on its own. See [Several operations in one round trip](/docs/operation-sets#on-the-server-avclientall-in-process).

In a Next.js app, `avClient` from `@/aventara/server` is `framework.serverClient`, with the request's `state` filled in ([Next.js host](/docs/nextjs-host#the-three-clients)).

Server-side results hold native values: `bigint` and `Date` are not JSON-serializable. If you return a result from a Nest controller, convert it first. See [Enums and scalar types](/docs/enums-and-scalars).

## What a server-side call accepts

`framework.application`, `framework.client`, `framework.serverClient`, `framework.execute`, `framework.executeTransaction` and the `appTx` / `clientTx` / `serverClientTx` builders read what you pass them once, when you call them, into plain data the framework owns. Validation, your guards and pipes, computed values and the adapter see only that copy.

- Changing your object afterwards changes nothing. An Immer draft that is revoked after `produce`, or a store that moves on, is safe to pass: the call already has its own copy.
- A live Proxy works (Vue `reactive`, MobX): it is read through its traps once.
- `Date`, `AvDecimal` and `Uint8Array` (a Node `Buffer` too) are copied as themselves; `bigint` and the other primitives are values.
- Only plain data otherwise. Arrays and plain objects (`{}` or `Object.create(null)`) are copied with their own enumerable string keys, like JSON: inherited, non-enumerable and symbol keys are dropped.

Anything else is refused as an error in your request: `A2004` with one `V1001` at the value's path, before any guard, pipe or adapter runs. There are two refusals:

| The value | Message |
|---|---|
| a class instance or a `Map` (any object that is not plain data) | `Value must be plain data.` |
| a value that cannot be read: a revoked Proxy, a getter that throws | `Value could not be read.` |

The call throws an `AvValidationError`; its `cause` is what the HTTP envelope would carry:

```ts
import { AvValidationError } from "@aventara/core";

class Where { id = 1; }
try {
  await this.framework.application.User.find.unique({ where: new Where(), select: ["id"] });
} catch (error) {
  if (!(error instanceof AvValidationError)) throw error;
  error.code;   // "A2004"
  error.cause;  // { message: "Operation arguments failed framework validation.",
                //   issues: [ { code: "V1001", path: ["arguments", "where"], message: "Value must be plain data." } ] }
}

const { proxy, revoke } = Proxy.revocable({ id: 1 }, {});
revoke();
await this.framework.application.User.find.unique({ where: proxy, select: ["id"] });
// throws AvValidationError: issues [ { code: "V1001", path: ["arguments", "where"], message: "Value could not be read." } ]

await this.framework.application.User.find.unique({ where: { get id(): number { throw new Error("x"); } }, select: ["id"] });
// throws AvValidationError: issues [ { code: "V1001", path: ["arguments", "where", "id"], message: "Value could not be read." } ]
```

The path is `["arguments", ...]` for one operation. In a transaction it is `["operations", i, "args", ...]` and `cause.operation` is the step:

```ts
try {
  await this.framework.transaction([
    this.framework.appTx.User.find.unique({ where: { id: 1 }, select: ["id"] }),
    this.framework.appTx.User.find.unique({ where: proxy, select: ["id"] }),   // the revoked Proxy
  ]);
} catch (error) {
  if (!(error instanceof AvValidationError)) throw error;
  error.cause;  // { message: "Operation arguments failed framework validation.",
                //   issues: [ { code: "V1001", path: ["operations", 1, "args", "where"], message: "Value could not be read." } ],
                //   operation: 1 }
}
```

A transaction builder (`appTx`, `clientTx`) never throws: it keeps the refusal, and `framework.transaction([...])` throws it. One plan takes the steps of one builder: mixing `appTx` and `clientTx` steps is a type error, and refused at runtime (`A2004` / `V1020`) when it gets past the types. `framework.appTx.$sql` adds a SQL step to an application plan ([Transactions](/docs/transactions#sql-steps-apptxsql)). An object carrying `$ref` in a step's `args` is copied when you call `framework.transaction` like the rest; the framework never runs a getter inside an object that carries `$ref`, so such a getter is refused unread.

The request object is checked too. `framework.execute(request)` and `framework.executeTransaction(request)` check the request object itself before anything runs. A malformed one (not an object, a missing or empty `requestId`, an `origin` other than `"application"`, `"client"` or `"agent"`, a client request without a `protocol` of `{ version, hash }`, a malformed `transport`, a `protocol` or `transport` on an application request, a missing or non-string `resource`, `family` or `variant`) is answered `422` `A2004` with one issue per wrong member at its own path (`["requestId"]`, `["protocol", "hash"]`, ...), and no guard, pipe, hook or adapter call runs. Before, most of these answered `A3000`. A well-formed request is unchanged, including `A2005`/`A2006` for a stale `protocol` and `A2001` for an unknown Resource.

HTTP requests are unaffected: a body the protocol parses from raw content is already plain data and is not copied again. A body your own host parsed and passes as `{ kind: "parsed" }` is copied like any server-side input ([Custom host](/docs/custom-host)).

The generated frontend client reads your arguments through one guard too: a value that cannot be read is refused before anything is sent, as a `TypeError` that names where, and a `tx` builder never throws either (`transaction([...])` rejects with that error):

```text
TypeError: An operation's arguments must be readable plain data, and the value at /where could not be read.
```

### Counting the refusals

These refusals are a caller's mistake, so they do not reach `diagnostics`. To see them, set the optional root setting `misuse` beside it:

```ts
const framework = await createFramework({
  api: "/api",
  adapter,
  misuse: (event) => metrics.increment("aventara.misuse", { kind: event.kind }),
});
```

It receives one `AvMisuseEvent` per refused value, never the value itself:

```json
{"kind":"non-plain-value","path":["arguments","data","name"],"origin":"application","resource":"User","family":"create","variant":"one"}
```

`kind` is `"unreadable-value"` or `"non-plain-value"`; `path` is the path the caller received; `origin`, `resource`, `family`, `variant` and the transaction step (`operation`) are present when they could be read. It cannot change a response: an error it throws or a promise it rejects is ignored. Nothing is reported to both `misuse` and `diagnostics` ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#misuse-reports)).

## AvExecutionOptions

The second argument of every call has these members:

- `requestId`: the correlation id the operation runs under. It reaches your pipelines (`ctx.$requestId`) and diagnostics, so logs from a background job can be tied to its operations. Omitted (or empty), the framework generates one.
- `state`: the call's `ctx.$state`, the one object every stage of the call reads and writes, such as the user your service acts for. It is used as it is, so you can read what the stages wrote after the call. Omitted, the call starts with `{}`. See [The pipeline context](/docs/pipeline-context#request-state).

- `as`: the principal the call is checked as by the configuration's [policy](/docs/policies). Left out, a `framework.application` call is server code and the policy does not check it. Name one to opt in: `{ as: user }`, or `{ as: null }` for an anonymous caller. On a `framework.client` or `framework.serverClient` call, which is always checked, `as` replaces the principal `policy.principal` would derive from `state`. Without a `policy` it does nothing.
- `signal` (on `framework.serverClient` calls): an `AbortSignal` that aborts this call. The call rejects at once; a database query that already started still finishes.

```ts
await this.framework.application.User.find.count({}, { requestId: "job-42" });
await this.framework.application.Post.find.many({}, { as: user });   // checked as `user`
```

See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics). Transaction runs take the same options: `framework.transaction([...], { requestId, state, as })`, one state and one principal for the whole plan.

## Transactions

Build steps with `framework.appTx` (application layer), `framework.clientTx` (client layer, wire values) or `framework.serverClientTx` (client layer, application values) and run them with `framework.transaction`. A plan holds one layer: application handles never sit beside client-layer ones.

```ts
const user = this.framework.appTx.User.create.one({ data: { email: "srv@example.com" }, select: ["id"] });
const post = this.framework.appTx.Post.create.one({ data: { title: "srv", authorId: user.$ref("id") } });
const [created, written] = await this.framework.transaction([user, post], { requestId: "tx-1" });
```

See [Transactions with $ref](/docs/transactions-with-ref).

## In tests

`@nestjs/testing` works: `Test.createTestingModule({ imports: [AppModule] }).compile()`, then `moduleRef.get(StatsService)` or the framework itself. Assert on the data a call resolves, and on a failure with `await expect(call).rejects.toBeInstanceOf(AvValidationError)` or `.rejects.toMatchObject({ code: "A2004" })`.

## See also

- [NestJS host](/docs/nestjs-host#injecting-the-framework)
- [Querying](/docs/querying#running-operations-on-the-server)
- [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
- [Transactions with $ref](/docs/transactions-with-ref)
