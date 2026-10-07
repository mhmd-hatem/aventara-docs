---
title: NestJS host
description: Mount Aventara in NestJS with AventaraModule, inject the framework, and understand the entrypoint, startup log and what runs on Aventara routes.
order: 60
section: hosting
---

# NestJS host

`@aventara/nest` hosts a framework in a NestJS 12 application, on **Express** (Nest's default) or **Fastify**. It mounts the framework's HTTP protocol on Nest's HTTP platform and puts the `Framework` into Nest's dependency injection. All protocol rules (routes, statuses, envelopes, headers) belong to the protocol itself; the host only translates requests and responses.

For the platform differences (middleware, global prefix, CORS) see [Express and Fastify](/docs/express-and-fastify). To host outside Nest, see [Custom host](/docs/custom-host).

## AventaraModule

`AventaraModule` is a global module. Import it once, in your root module. `aventara new` and `aventara init` write this for you:

```ts
// src/app.module.ts
import { Module } from "@nestjs/common";
import { AventaraModule } from "@aventara/nest";
import { aventaraConfig } from "./aventara.config.js";
import { PrismaModule, PrismaService } from "./prisma.service.js";

@Module({
  imports: [
    PrismaModule,
    AventaraModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: async (prisma: PrismaService) => ({
        config: await aventaraConfig(prisma),
      }),
    }),
  ],
})
export class AppModule {}
```

It takes the framework in one of three forms:

| Form | Use when |
|---|---|
| `AventaraModule.forRoot({ framework })` | You called `createFramework(config)` yourself and want your own typed `Framework` in code. |
| `AventaraModule.forRoot({ config })` | The module calls `createFramework(config)` for you. |
| `AventaraModule.forRootAsync({ imports, inject, useFactory })` returning `{ framework }` or `{ config }` | What builds the framework (a Prisma client, a configuration service) is itself a provider. |

The `config` form is checked like `createFramework`'s parameter, against your adapter's model.

### Injecting the framework

`@InjectFramework()` injects the `Framework` anywhere. Nest's DI carries no type argument, so declare a type alias from your configuration:

```ts
// src/aventara.config.ts
import { createFramework } from "@aventara/core";

const buildFramework = async (prisma: PrismaService) =>
  createFramework(await aventaraConfig(prisma));
export type AppFramework = Awaited<ReturnType<typeof buildFramework>>;
```

```ts
// src/stats.service.ts
import { Injectable } from "@nestjs/common";
import { InjectFramework } from "@aventara/nest";
import type { AppFramework } from "./aventara.config.js";

@Injectable()
export class StatsService {
  constructor(@InjectFramework() private readonly framework: AppFramework) {}

  async userCount() {
    const res = await this.framework.application.User.find.count({});
    return res.data;
  }
}
```

`@Inject(AVENTARA_FRAMEWORK)` is the same thing. See [Querying](/docs/querying#running-operations-on-the-server) for `framework.application.*` and `framework.client.*`, and [Admin vs public](/docs/example-admin-vs-public) for a worked example.

### Fails before listen

These errors happen while Nest builds the application, before it listens: both or neither of `framework` and `config` given; a `framework` that is not a Framework; the module mounted twice; a platform other than Express or Fastify; and any `FrameworkConstructionError` (for example an invalid restriction). Nest's default `abortOnError: true` **exits the process** on a bootstrap error; pass `abortOnError: false` to `NestFactory.create` to catch it instead.

The module owns no resource to shut down. Your Prisma service closes its own client in `onModuleDestroy`; call `app.enableShutdownHooks()` to handle signals.

## Startup log

When the application starts, the host logs one line:

```text
Aventara mounted 42 operations at /api (+ GET /api/_contract, POST /api/_transactions)
```

The number is how many operations are advertised and `/api` is your entrypoint. The `POST /api/_transactions` part appears only when transactions are interactive.

## Logging

An internal failure (`A3000` to `A3004`) writes one line to Nest's log under the context `Aventara`: the code, the operation, the scope, the request id and the error's class name, never its message:

```text
ERROR [Aventara] A3000 on Counter.find.many (client scope, request checkout-17): Error. The raw error goes to the framework's diagnostics sink.
```

This is the case when `AventaraModule` builds the framework from `config` (the form the scaffold uses). A `framework` you built with `createFramework` yourself has its own `diagnostics` sink, which the module does not wrap. The line is written through Nest's `Logger`, so your logger settings govern it. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics#internal-failures-in-the-server-log).

## Entrypoint

`FrameworkConfig.entrypoint` alone decides where the protocol is mounted:

```ts
return { entrypoint: "/api", adapter: /* ... */ } as const;
```

`app.setGlobalPrefix("v1")` **does not** move the protocol: with the prefix set, `/api/_contract` still answers `200` and `/v1/api/_contract` answers `404`. Set the entrypoint to where you want it (`"/v1/api"`), and point the generated client at that URL ([Client setup](/docs/client-setup)).

Your own controllers may live beside it, for example `GET /api/health`, as long as they are outside the protocol's reserved `_` paths (`/api/_contract`, `/api/_resources/...`, `/api/_transactions`, and any other `/api/_*`).

## What runs on Aventara routes

The protocol's routes are registered on the HTTP platform itself, one per advertised operation, plus `GET <entrypoint>/_contract`, and `POST <entrypoint>/_transactions` when transactions are interactive. The framework's own validation is outermost.

| | Express | Fastify |
|---|---|---|
| Your `app.use(...)` middleware, `app.enableCors()`, helmet | runs | runs |
| Nest guards, interceptors and pipes (global or not) | **never** | **never** |
| `MiddlewareConsumer` middleware | **never** | **runs** (keep it off with `.exclude()`) |
| Your controller at `<entrypoint>/_contract` (or any `_` path) | never reached | the application does not start |
| Your controller at `<entrypoint>/health` (outside `_`) | reached | reached |

### Authentication and authorization

**Nest guards never run on Aventara routes.** Put authentication and authorization into Aventara [pipelines](/docs/configuration#pipelines), where a guard reads `transport.headers`:

```ts
client: {
  pipelines: {
    guards: [
      (ctx) => {
        const token = ctx.transport?.headers["authorization"];
        if (!token) throw new FrameworkError("A4000", "Sign in first.");
        // verify the bearer token or cookie here
        return true;
      },
    ],
  },
},
```

A Passport strategy run as Nest middleware sets `req.user`, which a pipeline cannot see. Verify the token in the Aventara guard instead.

## Requests

- **Bodies** on protocol routes are read raw, never through Nest's body parser, up to `limits.maxRequestBytes`. An oversized body answers `413 A2010`, another content type `415 A2011`, malformed JSON `400 A2000`. Your own routes keep Nest's parsed `req.body`; no `NestFactory.create` option is needed.
- **`Content-Encoding`**: `gzip`, `deflate` and `br` are inflated, and the size limit counts decoded bytes. Any other coding answers `415 A2011`.
- **The request id** is the client's `Aventara-Request-Id` when it is 1-128 visible characters; anything else (empty, containing spaces, longer than 128) is silently replaced by a generated UUID. `X-Request-Id` is never copied into it; set `Aventara-Request-Id` at your proxy. See [Request IDs and diagnostics](/docs/request-ids-and-diagnostics).
- A **query string** is not part of the protocol path and is ignored.

## Testing

Nest's testing module works: `Test.createTestingModule({ imports: [AppModule] }).compile()`. The module waits for the application that `createNestApplication()` supplies.

## See also

- [Express and Fastify](/docs/express-and-fastify)
- [Custom host](/docs/custom-host)
- [Configuration](/docs/configuration)
- [HTTP protocol](/docs/http-protocol)
- Guides: [Authentication and guards](/docs/authentication-and-guards), [Pipelines](/docs/pipelines), [Server-side usage](/docs/server-side-usage), [Deploying](/docs/deploying)
