---
title: Custom host
description: Host an Aventara framework on any HTTP server by adapting it to @aventara/core/protocol - complete Express and plain node:http examples.
order: 62
section: hosting
---

# Custom host

NestJS and Next.js are hosts. `@aventara/core/protocol` is the same HTTP protocol as passive data and pure functions: it mounts nothing and imports no HTTP library, so any server can host a framework by translating requests into the protocol's request shape and responses back out. The Nest host works this way.

You build the framework with `createFramework(config)` (the same `aventaraConfig` you use with Nest, plus the adapter) and bind it once.

A framework you built this way can also be handed to a ready-made host instead of being bound by hand: `AventaraModule.forRoot({ framework })` in NestJS, and `Aventara({ framework })` in Next.js, which serves it from one catch-all route file and also gives you `avClient` and `avApp` on that same framework. Neither builds it again. See [Next.js host](/docs/nextjs-host#a-framework-you-built).

```ts
import { createFramework } from "@aventara/core";
import { AvProtocol } from "@aventara/core/protocol";

const framework = await createFramework(config);
const protocol = AvProtocol.bind(framework);
```

## The binding

| Member | What it does |
|---|---|
| `protocol.surface()` | The routes to mount: `{ kind: "operation" \| "contract" \| "transactions" \| "all", method, path }` with `path` relative to the `api` mount path (`/_contract`, `/_resources/User/find/many`, `/_transactions`). Only advertised operations appear; `transactions` only when transactions are interactive; `all` (`POST /_all`) whenever at least one operation is advertised. A read with a [`cache` stage](/docs/caching-reads) has a second `operation` entry, `method: "GET"`, at the same path, right after its `POST`. |
| `protocol.handleOperation(request)` | Decode, execute and encode one operation, a cached read's `GET` included. Resolves to a response; never rejects. |
| `protocol.handleTransaction(request)` | The same for `/_transactions`. |
| `protocol.handleAll(request, { signal })` | The same for `/_all`. Resolves to `{ status, headers, body }`; `body` is a string, or, when the caller sent `Accept: application/x-ndjson`, an async iterable of lines to write as each operation settles. Abort `signal` when the client leaves. |
| `protocol.encodeContract(request)` | The `GET /_contract` answer: `ETag`, `Cache-Control: no-cache`, `X-Content-Type-Options: nosniff`, and `304` handling. Synchronous. |
| `protocol.answerAbsent(request)` | The protocol's answer for any other path in its `_` namespace (404, 405 with `Allow`, 400), or `undefined` for a path outside it, which is yours to answer. |
| `protocol.decodeOperation(request)` / `protocol.decodeTransaction(request)` | Decode a `POST` without executing, for a host that runs its own steps in between (a `GET` is `405` here: send it to `handleOperation`). Resolves to `{ ok: true, request, requestId }` or `{ ok: false, response, requestId }`. A decoded `request` is an `AvClientOperationRequest` or `AvAgentOperationRequest` (`AvClientTransactionRequest` or `AvAgentTransactionRequest` for a transaction), the request `framework.execute` / `framework.executeTransaction` take. All are exported from `@aventara/core`. |
| `protocol.failure(code, requestId?)` | A transport-level failure (`A2000`, `A2010`, `A2011`) as a complete response, for hosts that read the body themselves. |
| `AvProtocol.headers`, `AvProtocol.httpStatus` | The header names and the code to status table, as data. |

A request is:

```ts
{
  method: string;
  path: string;          // relative to the `api` mount path, e.g. "/_contract"
  query?: string;        // the URL's query without its "?", as received; read only by a cached read's GET
  headers: Record<string, string | readonly string[] | undefined>;   // Node's req.headers fits
  body: { kind: "raw"; content: string | Uint8Array }   // the protocol checks size, type and JSON
      | { kind: "parsed"; value: unknown };             // your parser already did
}
```

A response is `{ status: number; headers: Record<string, string>; body: string }`, the body a JSON string (empty for `304`). `handleAll` may instead answer `body` as an async iterable of lines: write each one as it arrives (the examples below do).

Use `kind: "raw"` unless you have a reason not to: the protocol then enforces `maxRequestBytes`, the content type, `Content-Encoding` and JSON syntax with its own codes.

## A shared framework module

Both examples below import this, built from the scaffold's own Prisma service and configuration:

```ts
// src/custom/framework.ts
import { createFramework } from "@aventara/core";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import adapter from "../aventara.adapter.js";
import { aventaraConfig } from "../aventara.config.js";
import { PrismaService } from "../prisma.service.js";

export async function buildFramework() {
  const prisma = new PrismaService();
  return createFramework({
    ...aventaraConfig,
    adapter: await createPrismaAdapter({ ...adapter, client: prisma }),
  });
}
```

## Express

```ts
// src/custom/express.host.ts
import express, { type Request, type Response } from "express";
import { AvProtocol, type AvProtocolRequest, type AvProtocolResponse } from "@aventara/core/protocol";
import { buildFramework } from "./framework.js";

const framework = await buildFramework();
const protocol = AvProtocol.bind(framework);   // bind once, at startup
const base = framework.api;             // "/api"

const toRequest = (req: Request, path: string): AvProtocolRequest => ({
  method: req.method,
  path,                                        // relative to the `api` mount path
  query: req.originalUrl.split("?")[1] ?? "",  // a cached read's arguments travel here
  headers: req.headers,
  body: { kind: "raw", content: Buffer.isBuffer(req.body) ? req.body : "" },
});

const send = (res: Response, r: AvProtocolResponse) => res.status(r.status).set(r.headers).send(r.body);

// Read protocol bodies raw: the protocol enforces content type and JSON itself.
const raw = express.raw({ type: () => true, limit: framework.contracts.client.limits.maxRequestBytes });

const app = express();
app.disable("x-powered-by");

for (const route of protocol.surface()) {
  const url = base + route.path;
  const rel = (req: Request) => req.path.slice(base.length);
  if (route.kind === "contract") {
    app.get(url, (req, res) => send(res, protocol.encodeContract(toRequest(req, rel(req)))));
  } else if (route.kind === "transactions") {
    app.post(url, raw, async (req, res) => send(res, await protocol.handleTransaction(toRequest(req, rel(req)))));
  } else if (route.kind === "all") {
    // One JSON body; with `Accept: application/x-ndjson`, one line per operation as it settles.
    app.post(url, raw, async (req, res) => {
      const gone = new AbortController();          // the client left: operations not yet started never start
      res.on("close", () => gone.abort());
      const { status, headers, body } = await protocol.handleAll(toRequest(req, rel(req)), { signal: gone.signal });
      res.status(status).set(headers);
      if (typeof body === "string") return res.send(body);
      res.flushHeaders();
      for await (const line of body) res.write(line);
      res.end();
    });
  } else if (route.method === "GET") {
    // A read with a `cache` stage: also served as a GET, its arguments in the query.
    app.get(url, async (req, res) => send(res, await protocol.handleOperation(toRequest(req, rel(req)))));
  } else {
    app.post(url, raw, async (req, res) => send(res, await protocol.handleOperation(toRequest(req, rel(req)))));
  }
}

// Anything else under <api>/_* gets the protocol's own answer (404, 405 + Allow, ...).
app.use(base, (req, res, next) => {
  const answer = protocol.answerAbsent(toRequest(req, req.path));   // req.path is already relative here
  if (answer === undefined) return next();
  send(res, answer);
});

// A body over the limit is refused by the raw parser before the protocol sees it: answer in the protocol's words.
app.use((err: { type?: string }, req: Request, res: Response, next: express.NextFunction) => {
  if (err.type === "entity.too.large") return send(res, protocol.failure("A2010"));
  next(err);
});

// Your own routes live outside the protocol's "_" namespace.
app.get(`${base}/health`, (_req, res) => res.json({ ok: true }));

app.listen(Number(process.env.PORT ?? 3000), () => console.log(`listening, ${protocol.surface().length} routes`));
```

Run it (`node --env-file .env dist/custom/express.host.js` after building, or with `tsx`). The generated client works against it unchanged, including transactions:

```text
POST /api/_resources/Post/find/count   -> 200 {"data":4,"code":"A1000","cause":null}
transaction (Category + Post with $ref) -> committed, [ { id: 3 }, { id: 5 } ]
write without Authorization             -> AvAuthError A4000 (the pipeline guard ran)
GET  /api/health                        -> 200
DELETE /api/_contract                   -> 405, Allow: GET, code A2012
POST body of 1.1 MB                     -> 413, code A2010
```

## Plain node:http

No framework at all, only `node:http`:

```ts
// src/custom/node.host.ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AvProtocol, type AvProtocolResponse } from "@aventara/core/protocol";
import { buildFramework } from "./framework.js";

const framework = await buildFramework();
const protocol = AvProtocol.bind(framework);
const base = framework.api;
const maxBytes = framework.contracts.client.limits.maxRequestBytes;

// "POST /_resources/User/find/many" -> "operation", "GET /_contract" -> "contract", ...
// A read with a `cache` stage also has "GET /_resources/<R>/find/<variant>" -> "operation".
const routes = new Map<string, string>(protocol.surface().map((r) => [`${r.method} ${r.path}`, r.kind]));

const send = (res: ServerResponse, r: AvProtocolResponse) => {
  res.writeHead(r.status, r.headers);
  res.end(r.body);
};

// Collect the body, but stop once it is over the limit: the protocol then answers 413 itself.
async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    chunks.push(chunk);
    if (size > maxBytes) break;
  }
  return Buffer.concat(chunks);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === `${base}/health`) {
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    return;
  }
  if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) {
    res.writeHead(404).end();
    return;
  }
  const path = url.pathname.slice(base.length);   // relative to the `api` mount path
  const request = {
    method: req.method ?? "GET",
    path,
    query: url.search.slice(1),                   // a cached read's arguments travel here
    headers: req.headers,
    body: { kind: "raw", content: req.method === "POST" ? await readBody(req) : "" },
  } as const;

  switch (routes.get(`${request.method} ${path}`)) {
    case "contract":
      return send(res, protocol.encodeContract(request));
    case "transactions":
      return send(res, await protocol.handleTransaction(request));
    case "operation":
      return send(res, await protocol.handleOperation(request));
    case "all": {
      // One JSON body; with `Accept: application/x-ndjson`, one line per operation as it settles.
      const gone = new AbortController();          // the client left: operations not yet started never start
      res.on("close", () => gone.abort());
      const { status, headers, body } = await protocol.handleAll(request, { signal: gone.signal });
      res.writeHead(status, headers);
      if (typeof body === "string") return void res.end(body);
      res.flushHeaders();
      for await (const line of body) res.write(line);
      return void res.end();
    }
    default: {
      // Not a route we mount: the protocol answers its own "_" namespace; the rest is ours.
      const answer = protocol.answerAbsent(request);
      if (answer) return send(res, answer);
      res.writeHead(404).end();
    }
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log("listening"));
```

Same behaviours as the Express host, verified with the generated client and `curl`: operations, `/_all` (one JSON body or streamed lines), transactions, the contract with `ETag`/`304`, `405` with `Allow`, and `413` for an oversized body.

## Rules for a host

- Mount from `surface()`, not from a hand-written list: only advertised operations are routable. Mount every entry, with its own method ([below](#a-route-the-host-left-out)): a cached read's `GET` too.
- Pass the URL's query as `query`: a cached read's arguments travel in it.
- Write a streamed `/_all` answer line by line, and don't let your server or a proxy buffer it. Abort the `signal` you gave `handleAll` when the client disconnects, so operations not yet started never start.
- Never parse the body yourself unless you must; pass it raw.
- Authentication is still an Aventara [pipeline](/docs/configuration#pipelines): pass all request headers through (`headers`), and a guard reads `ctx.$transport.headers`. A custom host has no Nest guards to bypass.
- Your own routes may live beside the `api` mount path, but not under its `_` namespace.
- CORS, compression, TLS and logging are your server's job.
- The request id is the client's `Aventara-Request-Id` or one the protocol mints; the response carries it, except a public cached read's answer, which a CDN shares between callers.
- Write the protocol's headers as they are. A cached read's `Cache-Control`, `Vary` and `ETag` are what make it cacheable; a server that adds its own `ETag` or answers `304` itself must keep the protocol's.

## A route the host left out

If your host mounts only some of `protocol.surface()`, a request for a route it left out reaches `protocol.answerAbsent`, and the caller gets `500 A3000` ("Internal framework error."). So that this is not a silent failure, your `diagnostics` function receives one `A3000` diagnostic naming the route: an `"operation"` diagnostic with the Resource, family and variant (a `"transaction"` one for `/_transactions`), whose `error` is named `AvUnmountedRouteError` and says which `surface()` entry to mount:

```text
{ kind: "operation", code: "A3000", origin: "client", resource: "Post", family: "find", variant: "many",
  error: AvUnmountedRouteError: The ClientContract advertises Post.find.many, but the host mounted no route for
         POST /_resources/Post/find/many, so protocol.answerAbsent answered it 500 A3000. Mount every protocol.surface() entry. }
```

A route your ClientContract does not offer (an operation exposure removed, a transaction when transactions are off) is still answered `404` without a report. `@aventara/nest` mounts every route, so Nest applications never see this ([Request IDs and diagnostics](/docs/request-ids-and-diagnostics#what-else-reaches-it)).

## Two copies of `@aventara/core`

A bundler can load `@aventara/core` more than once in one process: Next.js gives each server layer its own copy, and a duplicate install, a monorepo, Vite SSR or a test runner's module isolation do the same. Copies of one major version recognize each other's values and errors: an `AvDecimal` made by one copy is an `AvDecimal` to every other (`instanceof` included, and the protocol encodes it), every `AvError` subclass passes `instanceof` across copies, and a framework's `diagnostics` sink receives reports raised through another copy. Copies of different majors do not. Loading one copy is still the simplest setup; in Next.js that is `serverExternalPackages` ([Next.js host](/docs/nextjs-host#serverexternalpackages)).

## Hold your host to the corpus

`@aventara/testing` ships the protocol corpus and a runner that checks a host against it, row by row: [Testing and conformance](/docs/testing-and-conformance).

## See also

- [HTTP protocol](/docs/http-protocol)
- [NestJS host](/docs/nestjs-host)
- [Configuration](/docs/configuration)
- [Client setup](/docs/client-setup), to generate a client against your host
- [Testing and conformance](/docs/testing-and-conformance)
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics), [Limits and safety](/docs/limits-and-safety)
