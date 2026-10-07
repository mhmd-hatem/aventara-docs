---
title: Custom host
description: Host an Aventara framework on any HTTP server by adapting it to @aventara/core/protocol - complete Express and plain node:http examples.
order: 62
section: hosting
---

# Custom host

NestJS is one host. `@aventara/core/protocol` is the same HTTP protocol as passive data and pure functions: it mounts nothing and imports no HTTP library, so any server can host a framework by translating requests into the protocol's request shape and responses back out. This is what the Nest host does.

You build the framework with `createFramework(config)` (the same `aventaraConfig` you use with Nest) and bind it once.

```ts
import { createFramework } from "@aventara/core";
import { AvProtocol } from "@aventara/core/protocol";

const framework = await createFramework(config);
const protocol = AvProtocol.bind(framework);
```

## The binding

| Member | What it does |
|---|---|
| `protocol.surface()` | The routes to mount: `{ kind: "operation" \| "contract" \| "transactions", method, path }` with `path` relative to the entrypoint (`/_contract`, `/_resources/User/find/many`, `/_transactions`). Only advertised operations appear; `transactions` only when interactive. |
| `protocol.handleOperation(request)` | Decode, execute and encode one operation. Resolves to a response; never rejects. |
| `protocol.handleTransaction(request)` | The same for `/_transactions`. |
| `protocol.encodeContract(request)` | The `GET /_contract` answer: `ETag`, `Cache-Control: no-cache`, and `304` handling. Synchronous. |
| `protocol.answerAbsent(request)` | The protocol's answer for any other path in its `_` namespace (404, 405 with `Allow`, 400), or `undefined` for a path outside it, which is yours to answer. |
| `protocol.failure(code, requestId?)` | A transport-level failure (`A2000`, `A2010`, `A2011`) as a complete response, for hosts that read the body themselves. |
| `AvProtocol.headers`, `AvProtocol.httpStatus` | The header names and the code to status table, as data. |

A **request** is:

```ts
{
  method: string;
  path: string;          // relative to the entrypoint, e.g. "/_contract"
  headers: Record<string, string | readonly string[] | undefined>;   // Node's req.headers fits
  body: { kind: "raw"; content: string | Uint8Array }   // the protocol checks size, type and JSON
      | { kind: "parsed"; value: unknown };             // your parser already did
}
```

A **response** is `{ status: number; headers: Record<string, string>; body: string }`, the body a JSON string (empty for `304`).

Use `kind: "raw"` unless you have a reason not to: the protocol then enforces `maxRequestBytes`, the content type, `Content-Encoding` and JSON syntax with its own codes.

## A shared framework module

Both examples below import this, built from the scaffold's own Prisma service and configuration:

```ts
// src/custom/framework.ts
import { createFramework } from "@aventara/core";
import { PrismaService } from "../prisma.service.js";
import { aventaraConfig } from "../aventara.config.js";

export async function buildFramework() {
  const prisma = new PrismaService();
  return createFramework(await aventaraConfig(prisma));
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
const base = framework.entrypoint;             // "/api"

const toRequest = (req: Request, path: string): AvProtocolRequest => ({
  method: req.method,
  path,                                        // relative to the entrypoint
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
  } else {
    app.post(url, raw, async (req, res) => send(res, await protocol.handleOperation(toRequest(req, rel(req)))));
  }
}

// Anything else under <entrypoint>/_* gets the protocol's own answer (404, 405 + Allow, ...).
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
write without Authorization             -> AuthError A4000 (the pipeline guard ran)
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
const base = framework.entrypoint;
const maxBytes = framework.contracts.client.limits.maxRequestBytes;

// "POST /_resources/User/find/many" -> "operation", "GET /_contract" -> "contract", ...
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
  const path = url.pathname.slice(base.length);   // relative to the entrypoint
  const request = {
    method: req.method ?? "GET",
    path,
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
    default: {
      // Not a route we mount: the protocol answers its own "_" namespace; the rest is ours.
      const answer = protocol.answerAbsent(request);
      if (answer) return send(res, answer);
      res.writeHead(404).end();
    }
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log("listening"));
```

Same behaviours as the Express host, verified with the generated client and `curl`: operations, transactions, the contract with `ETag`/`304`, `405` with `Allow`, and `413` for an oversized body.

## Rules for a host

- **Mount from `surface()`**, not from a hand-written list: only advertised operations are routable.
- **Never parse the body yourself** unless you must; pass it raw.
- **Authentication** is still an Aventara [pipeline](/docs/configuration#pipelines): pass all request headers through (`headers`), and a guard reads `transport.headers`. A custom host has no Nest guards to bypass.
- **Your own routes** may live beside the entrypoint, but not under its `_` namespace.
- **CORS, compression, TLS and logging** are your server's job.
- The request id is the client's `Aventara-Request-Id` or one the protocol mints; the response always carries it.

## See also

- [HTTP protocol](/docs/http-protocol)
- [NestJS host](/docs/nestjs-host)
- [Configuration](/docs/configuration)
- [Client setup](/docs/client-setup), to generate a client against your host
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Request IDs and diagnostics](/docs/request-ids-and-diagnostics), [Limits and safety](/docs/limits-and-safety)
