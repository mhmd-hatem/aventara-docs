---
title: Testing and conformance
description: "@aventara/testing - a fake adapter, and the protocol corpus for holding a host or a client written by you to Aventara's HTTP answers: run it in-process, serve it, or read it as plain JSON."
order: 63
section: hosting
---

# Testing and conformance

`@aventara/testing` is for people who write something that speaks Aventara's HTTP protocol or runs a framework: a host for another server, a client in another language, an adapter, or application code you want to test without a database. It depends on `@aventara/core` only.

```bash
npm install --save-dev @aventara/testing@rc
```

Node `^22.18.0 || >=24.2.0`. The package is ES modules, and it also loads from CommonJS ([below](#from-commonjs)).

| Export | What it is |
|---|---|
| `createFakeAdapter` | An in-memory adapter, with transaction tracing, for code that runs a `Framework` without a database. |
| `runAvProtocolConformance(driver)` | Drives the protocol corpus through one host and reports, per row, every mismatch. |
| `AvProtocolCorpus` | The corpus's server side: a corpus `Framework` you can serve through your own host or client. |
| `AvProtocolFixtures` | The corpus rows, as data. |
| `@aventara/testing/fixtures/protocol-v1.json` | The same corpus as plain JSON, for a client or host written in any language. |

## The protocol corpus

The corpus is a list of rows. Each row is an HTTP request a host receives, the answer the host must give, and what a generated client does with that answer:

- `request`: method, a path relative to the entrypoint, headers and a body (what you would hand `protocol.handleOperation`, [Custom host](/docs/custom-host)).
- `server`: the `status`, the framework `code` (or `null`: no envelope at all), the exact key set of `cause`, each issue's `code` and `path`, how many operations the corpus adapter was handed (`adapterCalls`), the response headers that must be present with exactly those values, and, where bytes matter, the exact `bodyBytes`.
- `client`: the `outcome` a generated client produces: `"resolve"`, `"framework-error"` (with its `code`) or `"transport-error"`.

A row whose `client.outcome` is `"transport-error"` describes something no host produces (a proxy's HTML page, a dropped connection); skip it when serving, as the conformance run does. For protocol version 1 the corpus has 131 rows, 104 of which a host answers.

## Check your host

`runAvProtocolConformance` builds the corpus `Framework` itself and drives every row a host answers through a driver you supply. A driver is a function that receives a `Framework` and returns a session: `send` takes one protocol request and returns the answer, and `close` ends the session. Each row runs against a fresh framework through a fresh session.

This driver goes straight to the protocol binding, the way a host's route handlers do. Written for your own host, `send` would call it over a socket instead:

```js
const { runAvProtocolConformance } = require("@aventara/testing");
const { AvProtocol } = require("@aventara/core/protocol");

const myHost = async (framework) => {
  const protocol = AvProtocol.bind(framework);
  const routes = new Map(protocol.surface().map((r) => [`${r.method} ${r.path}`, r.kind]));
  return {
    send: async (request) => {
      switch (routes.get(`${request.method} ${request.path}`)) {
        case "contract": return protocol.encodeContract(request);
        case "transactions": return protocol.handleTransaction(request);
        case "operation": return protocol.handleOperation(request);
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
104 rows driven, 0 with mismatches
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

- `AvProtocolCorpus.framework(contractHash?)` returns a fresh corpus framework, backed by an in-memory adapter whose answers every row states. Pass a row's `Aventara-Contract-Hash` to get the contract that row targets: a few rows target a second contract, without transactions, and every other hash (a stale one included) gets the main contract.
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

- `contracts` lists each ClientContract a row targets: its `hash` and the exact bytes of its `GET /_contract` answer (`document`, a string). The first is the main contract, `clientContractHash`; a row targets the other by sending its hash.
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

`require("@aventara/testing")` returns the same module `import` does, so a CommonJS test setup can use the whole kit. The package stays ES modules; Node's `require()` of an ES module needs Node 22.18 or later, which the package already requires.

```js
const t = require("@aventara/testing");
Object.keys(t).sort().join(", ");
// AvProtocolCorpus, AvProtocolFixtures, createFakeAdapter, runAvProtocolConformance
```

## See also

- [Custom host](/docs/custom-host): the protocol binding the driver above uses.
- [HTTP protocol](/docs/http-protocol): the routes, headers and codes the corpus holds a host to.
- [Protocol API reference](/docs/protocol-api-reference)
- [Installation](/docs/installation)
