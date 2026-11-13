---
title: NestJS host
description: Mount Aventara in NestJS with AventaraModule, inject the framework, and understand the mount path (`api`), startup log and what runs on Aventara routes.
order: 60
section: hosting
---

# NestJS host

`@aventara/nest` hosts a framework in a NestJS 12 application, on Express (Nest's default) or Fastify. It mounts the framework's HTTP protocol on Nest's HTTP platform and puts the `AvFramework` into Nest's dependency injection. All protocol rules (routes, statuses, envelopes, headers) belong to the protocol itself; the host only translates requests and responses.

For the platform differences (middleware, global prefix, CORS) see [Express and Fastify](/docs/express-and-fastify). To host outside Nest, see [Custom host](/docs/custom-host).

## AventaraModule

`AventaraModule` is a global module. Import it once, in your root module. `aventara new` and `aventara init` write this for you:

```ts
// src/app.module.ts
import { Module } from "@nestjs/common";
import { AventaraModule } from "@aventara/nest";
import { createPrismaAdapter } from "@aventara/prisma7-adapter";
import adapter from "./aventara.adapter.js";
import { aventaraConfig } from "./aventara.config.js";
import { PrismaModule, PrismaService } from "./prisma.service.js";

@Module({
  imports: [
    PrismaModule,
    AventaraModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: async (prisma: PrismaService) => ({
        config: {
          ...aventaraConfig,
          adapter: await createPrismaAdapter({ ...adapter, client: prisma }),
        },
      }),
    }),
  ],
})
export class AppModule {}
```

`aventaraConfig` is a plain value with no adapter in it, so `aventara-build` can run it without a database client. The adapter is built here, from `src/aventara.adapter.ts` and the Prisma client ([Configuration](/docs/configuration#adapter)).

It takes the framework in one of three forms:

| Form | Use when |
|---|---|
| `AventaraModule.forRoot({ framework })` | You called `createFramework(config)` yourself and want your own typed `AvFramework` in code. |
| `AventaraModule.forRoot({ config })` | The module calls `createFramework(config)` for you. |
| `AventaraModule.forRootAsync({ imports, inject, useFactory })` returning `{ framework }` or `{ config }` | What builds the framework (a Prisma client, a configuration service) is itself a provider. |

The `config` form is checked like `createFramework`'s parameter, against your adapter's model.

### Injecting the framework

`@InjectFramework()` injects the `AvFramework` anywhere. Nest's DI carries no type argument, so declare a type alias from your configuration:

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
import type { AppFramework } from "./aventara.framework.js";

@Injectable()
export class StatsService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  async userCount() {
    return this.framework.application.User.find.count({});   // a number; a failure throws an AvError subclass
  }
}
```

`@Inject(AVENTARA_FRAMEWORK)` is the same thing. See [Querying](/docs/querying#running-operations-on-the-server) for `framework.application.*` and `framework.client.*`, and [Admin vs public](/docs/example-admin-vs-public) for a worked example.

### Fails before listen

These errors happen while Nest builds the application, before it listens: both or neither of `framework` and `config` given; a `framework` that is not an `AvFramework`; the module mounted twice; a platform other than Express or Fastify; and any `AvConstructionError` (for example an invalid exemption). Nest's default `abortOnError: true` exits the process on a bootstrap error; pass `abortOnError: false` to `NestFactory.create` to catch it instead.

The module owns no resource to shut down. Your Prisma service closes its own client in `onModuleDestroy`; call `app.enableShutdownHooks()` to handle signals.

## Startup log

When the application starts, the host logs one line:

```text
Aventara mounted 42 operations at /api (+ GET /api/_contract, POST /api/_transactions, POST /api/_all)
```

The number is how many operations are advertised and `/api` is your `api` mount path. The `POST /api/_transactions` part appears only when transactions are interactive.

## Logging

An internal failure (`A3000` to `A3004`) writes one line to Nest's log under the context `Aventara`: the code, the operation, the origin, the request id and the error's class name, never its message:

```text
ERROR [Aventara] A3000 on Counter.find.many (client origin, request checkout-17): Error. The raw error goes to the framework's diagnostics sink.
```

This is the case when `AventaraModule` builds the framework from `config` (the form the scaffold uses). A `framework` you built with `createFramework` yourself has its own `diagnostics` sink, which the module does not wrap. The line is written through Nest's `Logger`, so your logger settings govern it. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log).

## Mount path

`AvConfig.api` alone decides where the protocol is mounted:

```ts
export const aventaraConfig = { api: "/api" } as const;
```

`app.setGlobalPrefix("v1")` does not move the protocol: with the prefix set, `/api/_contract` still answers `200` and `/v1/api/_contract` answers `404`. Set `api` to where you want it (`"/v1/api"`), and point the generated client at that URL ([Client setup](/docs/client-setup)).

Your own controllers may live beside it, for example `GET /api/health`, as long as they are outside the protocol's reserved `_` paths (`/api/_contract`, `/api/_resources/...`, `/api/_transactions`, and any other `/api/_*`).

## Serving a frontend beside the API

The same Nest process can serve a built single-page app (a Vite or React build, the files of a desktop shell) beside the protocol. Serve its files, and answer `index.html` to a browser asking for any other page, so the app's own routes load on refresh.

The fallback is `app.use` middleware, and on Express that runs before every route Nest registers: Aventara's ([What runs on Aventara routes](#what-runs-on-aventara-routes)) and your own controllers'. So it answers only a browser's page request (`GET`, an `Accept` header that lists `text/html` itself, with a `q` other than `0`, no file extension). A script's `Accept: */*`, the default of `curl` and `fetch`, is not a page request, so it falls through to a `404`, and it skips every path something else owns: `<api>` and everything under it, the MCP path and `/.well-known/` (the MCP endpoint's OAuth metadata lives there), and each of your own controllers outside `<api>`.

```ts
// src/main.ts (Express)
import { extname, join } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";

// Paths the fallback leaves alone: the API, MCP and its OAuth metadata, and your own controllers.
const notPages = ["/api", "/mcp", "/.well-known", "/status"];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const client = join(process.cwd(), "client");   // the built frontend: index.html and its assets
  app.useStaticAssets(client);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const owned = notPages.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
    // A browser lists text/html itself; curl's and fetch's */* do not, and text/html;q=0 refuses it.
    const wantsHtml = (req.get("accept") ?? "").split(",").some((entry) => {
      const [type, ...params] = entry.split(";").map((part) => part.trim().toLowerCase());
      const q = params.find((param) => param.startsWith("q="));
      return type === "text/html" && (q === undefined || Number(q.slice(2)) > 0);
    });
    const page = req.method === "GET" && wantsHtml && extname(req.path) === "";
    if (page && !owned) {
      res.sendFile(join(client, "index.html"));
      return;
    }
    next();
  });
  await app.listen(3000);
}
void bootstrap();
```

Checked on a running app with this setup: a browser's `/` and `/orders/42` get `index.html`, `/assets/app.js` its file and a missing `/assets/nope.js` `404`; `/api/_contract`, `/api/health`, `/status` (a controller of the app) and `/.well-known/...` reach their own routes; a request for `/orders/42` that accepts only JSON gets `404`. Point the frontend's generated client at the same origin's `<api>` ([Client setup](/docs/client-setup)). The example is Express; on Fastify, keep the same rules for a static plugin's fallback.

## The MCP endpoint

With `mcp` in the configuration, `AventaraModule` also mounts the MCP endpoint of `@aventara/mcp` at that path, on Express and Fastify alike, and logs `Aventara mounted the MCP endpoint at /mcp (...)`. Like `api`, the path is absolute and Nest's global prefix does not move it. Install `@aventara/mcp` at the same exact version as `@aventara/core` (`npm install --save-exact @aventara/mcp@<version>`); with `mcp` set and the package missing, the application refuses to start and prints that command with your version filled in. Your `state` option seeds each tool call's `ctx.$state`. See [MCP](/docs/mcp).

## What runs on Aventara routes

The protocol's routes are registered on the HTTP platform itself, one per advertised operation, plus `GET <api>/_contract`, and `POST <api>/_transactions` when transactions are interactive. The framework's own validation is outermost.

| | Express | Fastify |
|---|---|---|
| Your `app.use(...)` middleware, `app.enableCors()`, helmet | runs | runs |
| Nest guards, interceptors and pipes (global or not) | never | never |
| `MiddlewareConsumer` middleware | never | runs (keep it off with `.exclude()`) |
| Your controller at `<api>/_contract` (or any `_` path) | never reached | the application does not start |
| Your controller at `<api>/health` (outside `_`) | reached | reached |

### Authentication and authorization

Nest guards never run on Aventara routes. Put authentication and authorization into Aventara [pipelines](/docs/configuration#pipelines), where a guard reads `ctx.$transport.headers`:

```ts
client: {
  pipelines: {
    guards: [
      (ctx: AvContext) => {
        const token = ctx.$transport?.headers["authorization"];
        if (!token) throw new AvError("A4000", "Sign in first.");
        // verify the bearer token or cookie here
        return true;
      },
    ],
  },
},
```

### Request state: what your middleware found

`AventaraModule`'s `state` option hands every protocol request's stages what your own middleware found. It is called once per request with the platform's request (Express's `req`, Fastify's `request`), and what it returns is the request's `ctx.$state`:

```ts
declare module "@aventara/core" {
  interface AvState {
    user?: { id: number; role: "member" | "admin" };
  }
}

AventaraModule.forRoot({
  config,
  state: (req: Request) => ({ user: req.user }),   // set by your auth middleware (app.use)
});

// in the configuration
client: { pipelines: { guards: [(ctx: AvContext) => ctx.$state.user !== undefined] } },
```

- Run the middleware that finds the user with `app.use(...)`: it runs on Aventara routes on both platforms. Nest guards never do, and `MiddlewareConsumer` middleware does not on Express.
- On Fastify, `app.use` middleware writes to the Node request, so read `request.raw.user`.
- Throw `new AvError("A4001", "...")` from `state` to refuse the request with `403`. A rejection whose `status` or `statusCode` is 401 or 403 (how an authentication library refuses a bad credential) answers `401 A4000` or `403 A4001` with Aventara's own message, not the library's ([Error codes](/docs/error-codes#a4000)). Any other throw answers `500 A3000`.
- `forRootAsync`'s `useFactory` returns `state` beside `framework` or `config`.

The same object reaches every stage of the request, a transaction's steps and the ctx calls they make. See [The pipeline context](/docs/pipeline-context#request-state).

## Requests

- Bodies on protocol routes are read raw, never through Nest's body parser, up to `limits.maxRequestBytes`. An oversized body answers `413 A2010`, another content type `415 A2011`, malformed JSON `400 A2000`. Your own routes keep Nest's parsed `req.body`; no `NestFactory.create` option is needed.
- `Content-Encoding`: `gzip`, `deflate` and `br` are inflated, and the size limit counts decoded bytes. Any other coding answers `415 A2011`.
- The request id is the client's `Aventara-Request-Id` when it is 1-128 visible characters; anything else (empty, containing spaces, longer than 128) is silently replaced by a generated UUID. `X-Request-Id` is never copied into it; set `Aventara-Request-Id` at your proxy. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics).
- A query string is not part of the protocol path and is ignored.

## Testing

Nest's testing module works: `Test.createTestingModule({ imports: [AppModule] }).compile()`. The module waits for the application that `createNestApplication()` supplies.

## See also

- [Express and Fastify](/docs/express-and-fastify)
- [Custom host](/docs/custom-host)
- [Configuration](/docs/configuration)
- [MCP](/docs/mcp)
- [HTTP protocol](/docs/http-protocol)
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Pipelines](/docs/pipelines), [Server-side usage](/docs/server-side-usage), [Deploying](/docs/deploying)
