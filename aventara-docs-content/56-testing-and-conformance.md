---
title: Testing and conformance
description: "@aventara/testing - a fake adapter, a stage ctx for testing shared code, a wrapper that makes adapter calls fail, and the protocol corpus for holding a host or a client written by you to Aventara's HTTP answers: run it in-process, serve it, or read it as plain JSON."
order: 63
section: hosting
---

# Testing and conformance

`@aventara/testing` is for people who write something that speaks Aventara's HTTP protocol or runs a framework: a host for another server, a client in another language, an adapter, or application code you want to test without a database, or through a stage `ctx`, or with a failing adapter. It depends on `@aventara/core` only.

```bash
npm install --save-dev @aventara/testing@rc
```

Node `^22.23.4 || >=24.22.1`. The package is ES modules, and it also loads from CommonJS ([below](#from-commonjs)).

| Export | What it is |
|---|---|
| `createFakeAdapter` | An in-memory adapter, with transaction tracing, for code that runs an `AvFramework` without a database. |
| `withStageContext(framework, work, options?)` | Runs `work` with a real, typed stage `ctx` of your framework, in a transaction, so code that takes a `ctx` can be tested alone. |
| `createFaultyAdapter(adapter)` | Wraps an adapter so chosen calls fail on demand, and records every call. |
| `runAvProtocolConformance(driver)` | Drives the protocol corpus through one host and reports, per row, every mismatch. |
| `AvProtocolCorpus` | The corpus's server side: a corpus `AvFramework` you can serve through your own host or client. |
| `AvProtocolFixtures` | The corpus rows, as data. |
| `@aventara/testing/fixtures/protocol-v1.json` | The same corpus as plain JSON, for a client or host written in any language. |

## A framework without a database

The examples below use two models next to the starter's, and a `Post` and an `OutboxEvent` Resource over them. Ids are strings, as the scaffold's `cuid()` ids are:

```prisma
model Post {
  id    String @id @default(cuid())
  title String
}

model OutboxEvent {
  id      String @id @default(cuid())
  topic   String
  payload Json
}
```

Every model in the schema is a Resource already, so these examples need no `defineResource` file. After editing `schema.prisma`, run `pnpm run aventara:prepare` (the starter's `postinstall` and `prebuild` script) so the discovery artifact knows `Post` and `OutboxEvent`. The checks call them on `framework.application` and on a stage `ctx`.

With the default configuration nothing else is needed, and both Resources are exposed to remote callers like any other. To keep `OutboxEvent` away from them, hide it on the `client` overlay: `ctx` still reaches it. Under a root `exposed: false` ([Exposure](/docs/exposure)), `ctx` calls need the Resource exposed on the root layer too, and without that `ctx.OutboxEvent` fails with `A2001` and `framework.application.Post` is not there. Expose what the checks use:

```ts
exposed: false,
exemptions: {
  resources: {
    Post: true,
    OutboxEvent: {
      operations: { create: ["one"] },
      fields: { id: ["select"], topic: ["create"], payload: ["create"] },
    },
  },
},
```

The `.check.ts` files import `./x.js` for `.ts` files and use top-level `await`, so run them through a test runner: with Vitest, `await import("./post-list.check.js")` inside an `it`.

`createFakeAdapter(options)` returns an adapter that keeps no data of its own. Your test answers each operation, and the adapter records what it was asked. Build the framework from your own configuration and your model, and run the same calls your server makes:

```ts
// src/post-list.check.ts
import assert from "node:assert/strict";
import { createFramework } from "@aventara/core";
import { createFakeAdapter } from "@aventara/testing";
import { aventaraConfig } from "./aventara.config.js";
import { discovery } from "./generated/aventara/discovery.artifact.js";

const adapter = createFakeAdapter({
  model: discovery.model,
  execute: (operation) =>
    operation.family === "find" && operation.variant === "many" ? [{ id: "p1", title: "Hello" }] : null,
});
const framework = await createFramework({ ...aventaraConfig, adapter });

const posts = await framework.application.Post.find.many({ select: ["id", "title"] });
assert.deepEqual(posts, [{ id: "p1", title: "Hello" }]);
assert.equal(adapter.operations[0]?.resource, "Post");
```

| Option | What it does |
|---|---|
| `model` (required) | The adapter model the fake reports, usually your discovery artifact's `discovery.model`. Its `transactions` decides whether the fake offers transactions: with `"interactive"` it does, with `"none"` it has no `transaction` and the framework runs none. |
| `execute(operation)` | Answers each operation, now or as a promise. `operation` is `{ resource, family, variant, arguments }`, the arguments already validated, after your pipes and compute. Left out, every operation resolves `undefined`. |
| `rollback: { snapshot, restore }` | Rolls back state your test keeps (an in-memory table, say): `snapshot()` when a transaction begins, `restore(snapshot)` when its work throws. Without it, a rolled-back transaction keeps what `execute` changed. |

The adapter it returns has two read-only records beside the adapter members:

- `operations`: every operation it ran, in order, inside a transaction or not.
- `transactions`: one entry per finished transaction, `{ operations, outcome }`, where `operations` is what ran inside it and `outcome` is `"committed"` or `"rolled-back"`. Use it to check that a `forceTransaction` operation and its hook's `ctx` writes ran in one transaction, or that a refusal rolled them back.

The fake runs no SQL: `ctx.$sql` answers `A2002` with it. It checks nothing your database would (unique keys, foreign keys), and it returns what `execute` returns, so a test of database behaviour belongs on a real database. For tests through Nest and HTTP, see [NestJS host](/docs/nestjs-host#testing); for in-process calls checked as a remote caller, see [Server-side usage](/docs/server-side-usage).

## Code that takes a stage `ctx`

A function shared between stages, such as `accountSale(ctx, postId)` called from an after hook, is written against the `ctx` a stage is told. `withStageContext` makes one outside a stage, so you test the function on its own, with no harness Resource and no second framework:

```ts
// src/account-sale.check.ts
import assert from "node:assert/strict";
import { type AvContext, createFramework } from "@aventara/core";
import { createFakeAdapter, withStageContext } from "@aventara/testing";
import { aventaraConfig } from "./aventara.config.js";
import { discovery } from "./generated/aventara/discovery.artifact.js";

type Model = typeof discovery.model;

// The shared function: the same one a hook calls with its own ctx.
async function accountSale(ctx: AvContext<Model>, postId: string) {
  return ctx.OutboxEvent.create.one({
    data: { topic: "post.sold", payload: { postId } },
    select: ["id"],
  });
}

const adapter = createFakeAdapter({
  model: discovery.model,
  execute: () => ({ id: "e1" }),
});
const framework = await createFramework({ ...aventaraConfig, adapter });

// Pass the operation of the stage that calls accountSale in production.
const event = await withStageContext(framework, (ctx) => accountSale(ctx, "p1"), {
  operation: { resource: "Post", family: "create", variant: "one" },
});
assert.deepEqual(event, { id: "e1" });
```

The `ctx` is your framework's own executor, typed exactly as a stage's, so `accountSale(ctx, "p1")` needs no cast. Its calls go through the same Framework Validation Layer, field pipes, validators and compute as any `ctx` call, and join the transaction `withStageContext` opens, as a hook's do. The result is what `work` resolved.

| Option | Default | What it does |
|---|---|---|
| `outcome` | `"rollback"` | `"rollback"` undoes what `work` wrote when it returns, so tests leave the database as it was. `"commit"` keeps it. A throw from `work` always rolls back, and its error is rethrown. |
| `state` | `{}` | The request's state, read as `ctx.$state`. It is used as it is, not copied. |
| `origin` | `"application"` | The layer `ctx.$origin` and `ctx.$contract` state. Calls made through the `ctx` are application-origin whatever this says. |
| `requestId` | a fresh id | `ctx.$requestId`, which every call of the `ctx` carries. |
| `operation`, `args` | none, `{}` | `ctx.$operation` and `ctx.$args`. Pass the `operation` of the stage that calls your function in production, so its `ctx` is a stage's `ctx` and `accountSale(ctx: AvContext<Model>)` stays as written. Without `operation`, `ctx.$operation` is `undefined`, typed so, and `work` gets `Omit<AvContext<Model>, "$operation"> & { $operation: undefined }`: enough for a helper that never reads `$operation` (annotate it `Omit<AvContext<Model>, "$operation">` if it should work both ways). |

The framework's adapter must run transactions (`transactions: "interactive"` or `"server"`). With `createFakeAdapter`, use an `"interactive"` model and a `rollback` hook, so a rolled-back transaction undoes your in-memory rows.

## Making an adapter call fail

The operation objects on a framework (`framework.application.Post.update.unique`, and the ones on a `ctx`) are frozen on purpose: one test cannot change what a stage calls. So `vi.spyOn(framework.application.Post.update, "unique")` throws "Cannot redefine property", and a `Proxy` around the framework is not what your code holds.

Fail the adapter instead. That is where an outage happens, and the framework's real error paths run. `createFaultyAdapter` wraps the adapter you pass to `createFramework`:

```ts
// src/post-update.check.ts
import assert from "node:assert/strict";
import { AvInternalError, createFramework } from "@aventara/core";
import { createFakeAdapter, createFaultyAdapter } from "@aventara/testing";
import { aventaraConfig } from "./aventara.config.js";
import { discovery } from "./generated/aventara/discovery.artifact.js";

const faulty = createFaultyAdapter(
  createFakeAdapter({ model: discovery.model, execute: () => ({ id: "p1", title: "Hello" }) }),
);
const framework = await createFramework({ ...aventaraConfig, adapter: faulty });

const rule = faulty.fail({
  resource: "Post",
  family: "update",
  variant: "unique",
  when: (operation) => JSON.stringify(operation.arguments).includes("Failed"),
  error: new Error("SQLITE_BUSY: database is locked"),
  times: "always",
});

await assert.rejects(
  framework.application.Post.update.unique({ where: { id: "p1" }, data: { title: "Failed" }, select: ["id"] }),
  AvInternalError,
);
await framework.application.Post.update.unique({ where: { id: "p1" }, data: { title: "Done" }, select: ["id"] });
assert.equal(rule.hits, 1);
assert.deepEqual(faulty.calls.map((call) => call.failed), [true, false]);
```

| Member of `faulty.fail({ ... })` | What it does |
|---|---|
| `resource`, `family`, `variant` | Match a call by its Resource, operation family (`"update"`) and variant (`"unique"`). A member left out matches every call. |
| `when(operation)` | Narrows the match by the call, usually its `operation.arguments`. |
| `error` | What the call rejects with, by identity. A raw `Error` is answered `A3001` with the generic message, and none of its text reaches the caller. An `AvError` the adapter would have classified, such as `new AvError("A2013", "write conflict")`, is answered as its own code. |
| `times` | How many matching calls fail: a number (default `1`) or `"always"`. Faults apply in the order added. |

`fail` returns a rule: `rule.hits` counts the calls it has failed, and `rule.remove()` stops it. `faulty.calls` lists every operation call the wrapper saw, in order, each with `failed` and whether it ran `inTransaction`.

A call inside a transaction (a hook's `ctx` call, or one made in `withStageContext`) fails the same way, and the transaction rolls back. `executeSql` and the transaction boundary itself pass through untouched. The wrapper takes the adapter `createPrismaAdapter` or `createFakeAdapter` returns, not the passive description `describePrismaAdapter` gives, because a description has nothing to call.

## The protocol corpus

The corpus is a list of rows. Each row is an HTTP request a host receives, the answer the host must give, and what a generated client does with that answer:

- `request`: method, a path relative to the entrypoint, headers and a body (what you would hand `protocol.handleOperation`, [Custom host](/docs/custom-host)).
- `server`: the `status`, the framework `code` (or `null`: no envelope at all), the exact key set of `cause`, each issue's `code` and `path`, how many operations the corpus adapter was handed (`adapterCalls`), the response headers that must be present with exactly those values, and, where bytes matter, the exact `bodyBytes`.
- `client`: the `outcome` a generated client produces: `"resolve"`, `"framework-error"` (with its `code`) or `"transport-error"`.

A row whose `client.outcome` is `"transport-error"` describes something no host produces (a proxy's HTML page, a dropped connection); skip it when serving, as the conformance run does. For protocol version 1 the corpus has 170 rows, 143 of which a host answers. They include `POST /_all` ([Operation Sets](/docs/operation-sets)), its streamed answer (a row whose `server.code` is `null`, since the lines are no envelope), and cached reads as `GET` ([Caching reads](/docs/caching-reads)), whose `request` carries a `query`.

## Check your host

`runAvProtocolConformance` builds the corpus `AvFramework` itself and drives every row a host answers through a driver you supply. A driver is a function that receives an `AvFramework` and returns a session: `send` takes one protocol request and returns the answer, and `close` ends the session. Each row runs against a fresh framework through a fresh session.

This driver goes straight to the protocol binding, the way a host's route handlers do. It has a case for every `kind` that `surface()` returns (`operation`, `contract`, `transactions`, `all` and `can`): a route the driver does not handle reaches `answerAbsent`, and the corpus rows for it fail with `500 A3000`. Written for your own host, `send` would call it over a socket instead:

```js
const { runAvProtocolConformance } = require("@aventara/testing");
const { AvProtocol } = require("@aventara/core/protocol");

// `/_all` may answer its lines as an async iterable; a real host writes them out as they come.
const drained = async (answer) => {
  if (typeof answer.body === "string") return answer;
  let body = "";
  for await (const line of answer.body) body += line;
  return { status: answer.status, headers: answer.headers, body };
};

const myHost = async (framework) => {
  const protocol = AvProtocol.bind(framework);
  const routes = new Map(protocol.surface().map((r) => [`${r.method} ${r.path}`, r.kind]));
  return {
    send: async (request) => {
      switch (routes.get(`${request.method} ${request.path}`)) {
        case "contract": return protocol.encodeContract(request);
        case "transactions": return protocol.handleTransaction(request);
        case "operation": return protocol.handleOperation(request);
        case "can": return protocol.handleCan(request);
        case "all": return drained(await protocol.handleAll(request));
        default: return protocol.answerAbsent(request) ?? { status: 404, headers: {}, body: "" };
      }
    },
    close: async () => {},
  };
};

runAvProtocolConformance(myHost).then((results) => {
  const bad = results.filter((r) => r.mismatches.length > 0);
  console.log(`${results.length} rows driven, ${bad.length} with mismatches`);
  for (const r of bad) console.log(r.label, r.mismatches);
});
```

```text
143 rows driven, 0 with mismatches
```

The result is one entry per driven row, in corpus order, each with its `mismatches` (none when the host conforms). A driver that throws is a mismatch of its row, not a failure of the run. Assert on the results with whichever test runner you use. `@aventara/nest` is held to this corpus on Express and Fastify in its own tests.

## Serve the corpus through your own stack

To point a client you are writing at a running corpus, or to test a host with your own bench, take the corpus framework from `AvProtocolCorpus` and mount it with your host:

```ts
import { AvProtocolCorpus } from "@aventara/testing";

const framework = await AvProtocolCorpus.framework();
// Mount `framework` under AvProtocolCorpus.entrypoint ("/api") with your host,
// then send each row's `request` and compare the answer with the row's `server`.
```

- `AvProtocolCorpus.framework(contractHash?)` returns a fresh corpus framework, backed by an in-memory adapter whose answers every row states. Pass a row's `Aventara-Contract-Hash` to get the contract that row targets; a cached read's `GET` sends none, so pass its query's `v`. A few rows target a contract without transactions, the cached-read rows one with `cache` stages, and every other hash (a stale one included) gets the main contract.
- `AvProtocolCorpus.entrypoint` is where the corpus is mounted: `"/api"`. Every row's `path` is relative to it.
- `AvProtocolCorpus.clientContractHash` is the main ClientContract's hash: what a client generated against the corpus sends, and what `GET /_contract` names.

A row's `adapterCalls` counts the operations the corpus adapter was handed, which only the conformance run can observe; when you serve the corpus yourself, compare status, code, headers and body.

## The corpus as JSON

For a client or a host written in another language, `@aventara/testing/fixtures/protocol-v1.json` holds the whole corpus for protocol version 1, in the same order and with the same fields as `AvProtocolFixtures`. It is generated from the TypeScript corpus when the package is built.

```json
{
  "protocolVersion": 1,
  "entrypoint": "/api",
  "clientContractHash": "sha256:07b1a75...",
  "contracts": [{ "hash": "sha256:07b1a75...", "document": "{\"enums\":{},..." }, ...],
  "rows": [{ "label": "...", "request": { ... }, "server": { ... }, "client": { ... } }, ...]
}
```

- `contracts` lists each ClientContract a row targets: its `hash` and the exact bytes of its `GET /_contract` answer (`document`, a string). The first is the main contract, `clientContractHash`; a row targets another by sending its hash (a cached read as its query's `v`).
- `rows` are the rows described above. A real one:

  ```json
  {
    "label": "transaction — committed, a create included → 200 A1009 in plan order",
    "request": {
      "method": "POST",
      "path": "/_transactions",
      "headers": { "Content-Type": "application/json", "Aventara-Protocol-Version": "1",
                   "Aventara-Contract-Hash": "sha256:07b1a75...", "Aventara-Request-Id": "corpus-tx-committed" },
      "body": { "kind": "raw", "content": "{\"operations\":[ ... ]}" }
    },
    "server": { "status": 200, "code": "A1009", "adapterCalls": 2,
                "responseHeaders": { "Content-Type": "application/json", "Aventara-Request-Id": "corpus-tx-committed" },
                "bodyBytes": "{\"data\":[ ... ],\"code\":\"A1009\",\"cause\":null}" },
    "client": { "outcome": "resolve" }
  }
  ```

- One body is a recipe. The one request too large to write out (one byte over the 1 MiB request limit) has a `request.body.content` that is not a string but `{ "prefix": "...", "repeat": "x", "times": 1048567, "suffix": "..." }`, standing for `prefix` followed by `repeat` repeated `times` times, then `suffix`. Every other `content` is the body's text.

From JavaScript, `require("@aventara/testing/fixtures/protocol-v1.json")`, or import it with `with { type: "json" }`.

## From CommonJS

`require("@aventara/testing")` returns the same module `import` does, so a CommonJS test setup can use the whole kit. The package stays ES modules; Node's `require()` of an ES module needs Node 22.23.4 or later, which the package already requires.

```js
const t = require("@aventara/testing");
Object.keys(t).sort().join(", ");
// AvProtocolCorpus, AvProtocolFixtures, createFakeAdapter, createFaultyAdapter, runAvProtocolConformance, withStageContext
```

## See also

- [Custom host](/docs/custom-host): the protocol binding the driver above uses.
- [HTTP protocol](/docs/http-protocol): the routes, headers and codes the corpus holds a host to.
- [Protocol API reference](/docs/protocol-api-reference)
- [Installation](/docs/installation)
