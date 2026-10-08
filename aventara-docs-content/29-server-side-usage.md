---
title: Server-side usage
description: Call operations from your own NestJS services with framework.application and framework.client, handle the returned envelope, and pass a request id.
order: 29
section: guides
---

# Server-side usage

You do not need HTTP to use your data layer from your own code. Inject the framework into a Nest service and call the same operations directly. There are two typed surfaces:

| Surface | Runs under | Arguments | Use it for |
|---|---|---|---|
| `framework.application.<Resource>.<family>.<variant>(args, options?)` | the application layer | application values (`Date`, `bigint`, `Decimal`, `Uint8Array`) | trusted code: jobs, services, seeding |
| `framework.client.<Resource>.<family>.<variant>(args, options?)` | the client layer: the same restrictions and limits a remote caller gets | wire values (ISO strings, decimal strings) | server-side rendering and tests that must behave like a remote caller |

Both run the full pipeline ([Pipelines](/docs/pipelines)): root pipelines, then the layer's own. Guards that read `transport.headers` see no headers on a server-side call, because there is no HTTP request.

## Inject the framework

Nest's dependency injection carries no type argument, so export a type alias from your configuration:

```ts
// src/aventara.config.ts
import { createFramework } from "@aventara/core";

export const buildFramework = async (prisma: PrismaService) =>
  createFramework(await aventaraConfig(prisma));
export type AppFramework = Awaited<ReturnType<typeof buildFramework>>;
```

```ts
// src/stats.service.ts
import { Injectable } from "@nestjs/common";
import { InjectFramework } from "@aventara/nest";
import { Decimal } from "@aventara/core";
import type { AppFramework } from "./aventara.config.js";

@Injectable()
export class StatsService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  async userCount(requestId?: string) {
    const res = await this.framework.application.User.find.count({}, { requestId });
    return res.code === "A1000" ? res.data : 0;
  }
}
```

Add the service to a module's `providers` as usual. `@Inject(AVENTARA_FRAMEWORK)` is the same as `@InjectFramework()`. Every name in `select`, `where` and `data` is checked against your model, and against the layer: a field you hid for the client layer is a compile error on `framework.client` but fine on `framework.application` ([Exposing and hiding fields](/docs/exposing-and-hiding-fields)).

## The envelope

Unlike the generated frontend client, which returns data and throws on failure, server-side calls return the envelope and do not throw for operation failures:

```ts
const res = await this.framework.application.Post.find.unique({ where: { id: 999 }, select: ["id", "title"] });
// { data: null, code: "A2003", cause: { message: "No record matched the unique selector." } }
```

| Member | Meaning |
|---|---|
| `code` | The outcome: `A1000` and the other `A1xxx` are success, `A2xxx` refusals, `A3xxx` internal failures, `A4xxx` auth. See [HTTP protocol](/docs/http-protocol#codes). |
| `data` | The result, or `null`. A first-style miss is `A1001` with `data: null`. |
| `cause` | `null` on success; on failure `{ message, issues?, operation? }`. |

Branch on `code`, never on `cause.message`. A typed narrowing works on the code: after `res.code === "A1000"`, `res.data` has the result type.

```ts
async findOrThrow(postId: number) {
  const res = await this.framework.application.Post.find.unique({ where: { id: postId }, select: ["id", "title"] });
  if (res.code !== "A1000") throw new Error(`${res.code}: ${res.cause?.message}`);   // "A2003: No record matched the unique selector."
  return res.data;                                                                      // { id: 1, title: 'Hello' }
}
```

Throw your own exception (a Nest `NotFoundException`, say) where it makes sense for your callers; the framework does not decide your service's errors.

## Values: application and wire forms

Application values on `framework.application`:

```ts
const res = await this.framework.application.Post.update.unique({
  where: { id: 1 },
  data: { publishedAt: new Date(), price: new Decimal("12.50"), bigViews: 1n },
  select: ["id", "publishedAt", "price", "bigViews"],
});
// { data: { id: 1, publishedAt: 2026-10-06T23:00:55.918Z, price: Decimal {}, bigViews: 1n }, code: 'A1004', cause: null }
```

`Decimal` is exported from `@aventara/core`; it holds the decimal string and does no arithmetic. On `framework.client` the same input is in wire form (strings), while results are always application values:

```ts
const res = await this.framework.client.Post.update.unique({
  where: { id: 1 },
  data: { publishedAt: "2026-05-01T12:00:00.000Z", price: "12.50" },
  select: ["id", "publishedAt", "price"],
});
// { data: { id: 1, publishedAt: 2026-05-01T12:00:00.000Z, price: Decimal {} }, code: 'A1004', cause: null }
```

Server-side results hold native values: `bigint` and `Date` are not JSON-serializable. If you return a result from a Nest controller, convert it first. See [Enums and scalar types](/docs/enums-and-scalars).

## What a server-side call accepts

`framework.application`, `framework.client`, `framework.execute`, `framework.executeTransaction` and the `appTx` / `clientTx` builders read what you pass them once, when you call them, into plain data the framework owns. Validation, your guards and pipes, computed values and the adapter see only that copy.

- Changing your object afterwards changes nothing. An Immer draft that is revoked after `produce`, or a store that moves on, is safe to pass: the call already has its own copy.
- A live Proxy works (Vue `reactive`, MobX): it is read through its traps once.
- `Date`, `Decimal` and `Uint8Array` (a Node `Buffer` too) are copied as themselves; `bigint` and the other primitives are values.
- Only plain data otherwise. Arrays and plain objects (`{}` or `Object.create(null)`) are copied with their own enumerable string keys, like JSON: inherited, non-enumerable and symbol keys are dropped.

Anything else is refused as an error in your request: `A2004` with one `V1001` at the value's path, before any guard, pipe or adapter runs. There are two refusals:

| The value | Message |
|---|---|
| a class instance or a `Map` (any object that is not plain data) | `Value must be plain data.` |
| a value that cannot be read: a revoked Proxy, a getter that throws | `Value could not be read.` |

```ts
class Where { id = 1; }
await this.framework.application.User.find.unique({ where: new Where(), select: ["id"] });
// { data: null, code: "A2004", cause: { message: "Operation arguments failed framework validation.",
//     issues: [ { code: "V1001", path: ["arguments", "where"], message: "Value must be plain data." } ] } }

const { proxy, revoke } = Proxy.revocable({ id: 1 }, {});
revoke();
await this.framework.application.User.find.unique({ where: proxy, select: ["id"] });
// ... issues: [ { code: "V1001", path: ["arguments", "where"], message: "Value could not be read." } ]

await this.framework.application.User.find.unique({ where: { get id(): number { throw new Error("x"); } }, select: ["id"] });
// ... issues: [ { code: "V1001", path: ["arguments", "where", "id"], message: "Value could not be read." } ]
```

The path is `["arguments", ...]` for one operation. In a transaction it is `["operations", i, "args", ...]` and `cause.operation` is the step:

```ts
await this.framework.transaction([
  this.framework.appTx.User.find.unique({ where: { id: 1 }, select: ["id"] }),
  this.framework.appTx.User.find.unique({ where: proxy, select: ["id"] }),   // the revoked Proxy
]);
// { data: null, code: "A2004", cause: { message: "Operation arguments failed framework validation.",
//     issues: [ { code: "V1001", path: ["operations", 1, "args", "where"], message: "Value could not be read." } ],
//     operation: 1 } }
```

A transaction builder (`appTx`, `clientTx`) never throws: it keeps the refusal, and `framework.transaction([...])` answers it. An object carrying `$ref` in a step's `args` is copied when you call `framework.transaction` like the rest; the framework never runs a getter inside an object that carries `$ref`, so such a getter is refused unread.

The request object is checked too. `framework.execute(request)` and `framework.executeTransaction(request)` check the request object itself before anything runs. A malformed one (not an object, a missing or empty `requestId`, an `origin` other than `"application"` or `"client"`, a client request without a `protocol` of `{ version, hash }`, a malformed `transport`, a `protocol` or `transport` on an application request, a missing or non-string `resource`, `family` or `variant`) is answered `422` `A2004` with one issue per wrong member at its own path (`["requestId"]`, `["protocol", "hash"]`, ...), and no guard, pipe, hook or adapter call runs. Before, most of these answered `A3000`. A well-formed request is unchanged, including `A2005`/`A2006` for a stale `protocol` and `A2001` for an unknown Resource.

HTTP requests are unaffected: a body the protocol parses from raw content is already plain data and is not copied again. A body your own host parsed and passes as `{ kind: "parsed" }` is copied like any server-side input ([Custom host](/docs/custom-host)).

The generated frontend client reads your arguments through one guard too: a value that cannot be read is refused before anything is sent, as a `TypeError` that names where, and a `tx` builder never throws either (`transaction([...])` rejects with that error):

```text
TypeError: An operation's arguments must be readable plain data, and the value at /where could not be read.
```

### Counting the refusals

These refusals are a caller's mistake, so they do not reach `diagnostics`. To see them, set the optional root setting `misuse` beside it:

```ts
const framework = await createFramework({
  entrypoint: "/api",
  adapter,
  misuse: (event) => metrics.increment("aventara.misuse", { kind: event.kind }),
});
```

It receives one `FrameworkMisuseEvent` per refused value, never the value itself:

```json
{"kind":"non-plain-value","path":["arguments","data","name"],"origin":"application","resource":"User","family":"create","variant":"one"}
```

`kind` is `"unreadable-value"` or `"non-plain-value"`; `path` is the path the caller received; `origin`, `resource`, `family`, `variant` and the transaction step (`operation`) are present when they could be read. It cannot change a response: an error it throws or a promise it rejects is ignored. Nothing is reported to both `misuse` and `diagnostics` ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#misuse-reports)).

## ExecutionOptions

The second argument of every call has one member, `requestId`: the correlation id the operation runs under. It reaches your pipelines (`ctx.requestId`) and diagnostics, so logs from a background job can be tied to its operations. Omitted (or empty), the framework generates one.

```ts
await this.framework.application.User.find.count({}, { requestId: "job-42" });
```

See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics). Transaction runs take the same option: `framework.transaction([...], { requestId })`.

## Transactions

Build steps with `framework.appTx` (application layer) or `framework.clientTx` (client layer) and run them with `framework.transaction`:

```ts
const user = this.framework.appTx.User.create.one({ data: { email: "srv@example.com" }, select: ["id"] });
const post = this.framework.appTx.Post.create.one({ data: { title: "srv", authorId: user.$ref("id") } });
const result = await this.framework.transaction([user, post], { requestId: "tx-1" });   // code "A1009"
```

See [Transactions with $ref](/docs/transactions-with-ref).

## In tests

`@nestjs/testing` works: `Test.createTestingModule({ imports: [AppModule] }).compile()`, then `moduleRef.get(StatsService)` or the framework itself. Assert on `res.code` and `res.data`.

## See also

- [NestJS host](/docs/nestjs-host#injecting-the-framework)
- [Querying](/docs/querying#running-operations-on-the-server)
- [Request IDs and diagnostics](/docs/request-ids-and-diagnostics)
- [Transactions with $ref](/docs/transactions-with-ref)
