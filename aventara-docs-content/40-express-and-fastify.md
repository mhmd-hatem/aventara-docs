---
title: Express and Fastify
description: Run Aventara on Nest's Express or Fastify platform - what is the same, what differs, middleware exclusion on Fastify, global prefix and CORS.
order: 61
section: hosting
---

# Express and Fastify

`@aventara/nest` supports both of Nest's HTTP platforms. The protocol behaves the same on both, because its routes are registered on the platform itself and all of its rules live in the protocol. What differs is how Nest's own machinery (middleware, routing) touches those routes.

## Choose a platform

Express is Nest's default and what `aventara new` creates. For Fastify, install the adapter and pass it when creating the app:

```bash
npm install @nestjs/platform-fastify fastify @fastify/cors
```

```ts
// src/main.ts
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.listen(process.env.PORT ?? 3000, "127.0.0.1");
```

Nothing in `AventaraModule` or your configuration changes. Any other platform fails at startup, before listening.

## What is the same

Both platforms log the same startup line, serve `GET /api/_contract` and `POST /api/_resources/...`, and produce the same envelopes and statuses. Nest guards, interceptors and pipes never run on Aventara routes on either; authentication belongs in Aventara [pipelines](/docs/configuration#pipelines).

## What differs

| | Express | Fastify |
|---|---|---|
| `app.use(...)` middleware, helmet | runs on Aventara routes | runs |
| `MiddlewareConsumer` middleware | never runs on Aventara routes | runs on them unless excluded |
| Your own controller at `<entrypoint>/_contract` (any `_` path) | never reached | the application does not start |
| Resource keys or entrypoints needing `*` or `: + # $ & , / ; = ? @` in a route path | accepted | refused at startup, naming it |
| Routing case | case-insensitive (`/API/_contract` answers) | case-sensitive |
| `X-Powered-By` response header | sent (`app.disable("x-powered-by")` removes it) | not sent |
| CORS preflight methods | `GET,HEAD,PUT,PATCH,POST,DELETE` | `GET,HEAD,POST` (all the protocol needs) |

On Express, a protocol route requested with a percent-encoding a generated client never sends (for example `%6Eotes` for `notes`) answers `500 A3000`; Fastify and the in-process protocol execute it. Generated clients are unaffected.

## Middleware on Fastify

On Fastify, Nest middleware registered through `MiddlewareConsumer` runs before routing, so it also runs on Aventara routes. A logger registered with `forRoutes("*path")` would see every protocol request. Keep it off them with `.exclude()`, using your entrypoint plus `/_*path`:

```ts
// src/app.module.ts
import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { LoggerMiddleware } from "./logger.middleware.js";

@Module({ /* imports ... */ })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .exclude("api/_*path")      // "<entrypoint without the slash>/_*path"
      .forRoutes("*path");
  }
}
```

With the exclusion, a request to `/api/_contract` does not reach `LoggerMiddleware`; a request to `/` does. Without it, both do. On Express the same module code is harmless: the middleware never ran on Aventara routes there.

Middleware you want on Aventara routes on both platforms goes through `app.use(...)` instead, which runs on both.

## Global prefix

`app.setGlobalPrefix("v1")` moves your controllers and leaves the protocol where it is. With the prefix set and entrypoint `/api`:

```text
GET /api/_contract      200
GET /v1/api/_contract   404
GET /v1                 200   (your own controller's root)
```

Put the prefix in the entrypoint instead (`entrypoint: "/v1/api"`) and generate the client against that URL.

## CORS

A browser frontend on another origin needs CORS. `app.enableCors()` is a platform-level feature that runs on Aventara routes on both platforms. A project made by `aventara new` already has it in `src/main.ts`, driven by `CORS_ORIGINS` in `.env` (a comma-separated list, default `http://localhost:5173,http://localhost:3001`; unset or empty means CORS is off):

```ts
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false });
```

Without the scaffold, a single origin is one line:

```ts
app.enableCors({ origin: "http://localhost:5173" });
```

The generated client sends `Content-Type: application/json`, `Aventara-Protocol-Version` and `Aventara-Contract-Hash` (plus `Aventara-Request-Id` if you set `requestId`, and anything your custom `fetch` adds, such as `Authorization`). Those make every call a non-simple request, so the browser preflights it; Nest's default reflects the requested headers back, which is what you need. Verified on both platforms:

```bash
curl -si -X OPTIONS http://localhost:3103/api/_resources/Post/find/many \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,aventara-protocol-version,authorization"
```

```text
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET,HEAD,POST
Access-Control-Allow-Headers: content-type,aventara-protocol-version,authorization
```

(Fastify's wording; Express answers the same with its longer method list.) Restrict `origin` to your frontends. If you send cookies, add `credentials: true` and use a specific origin. CORS only tells browsers what they may read: it is not access control, and servers and bots ignore it ([Limits and safety](/docs/limits-and-safety#cors-is-not-access-control)).

## Request body handling

Protocol routes read bodies raw on both platforms, never through Nest's body parser, up to `limits.maxRequestBytes`. Your own routes keep Nest's parsed `req.body`. See [NestJS host](/docs/nestjs-host#requests).

## See also

- [NestJS host](/docs/nestjs-host)
- [Custom host](/docs/custom-host), for other servers
- [Configuration](/docs/configuration#pipelines)
- [Client setup](/docs/client-setup)
- Guides: [Deploying](/docs/deploying), [Authentication and guards](/docs/authentication-and-guards)
