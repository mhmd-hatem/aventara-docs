---
title: Hosts
description: "Mount Access's routes in Next.js, NestJS, Express or the standalone server, and wire the engine into Aventara."
order: 9
section: guides
---

# Hosts

Access's routes are Better Auth's, plus its own, and they mount the way Better Auth's do. Better Auth's own helpers
(`toNextJsHandler`, `toNodeHandler`) take the Access instance as it is. The framework's hosts mount no Access route.

Mounting serves the routes. Wiring hands the framework the policy engine and each request's `me`. A host needs both.

## Next.js

Mount the routes with the catch-all route file, as in Better Auth's Next.js docs:

```ts
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { access } from "@/access";

export const { GET, POST } = toNextJsHandler(access);
```

Wire it by putting `access` in `aventaraConfig`, in `src/aventara/config.ts`, not in `server.ts`:

```ts
// src/aventara/config.ts
import { access } from "../access";

export const aventaraConfig = {
	api: "/api",
	exposed: true,
	// The rest of the configuration `aventara new` wrote stays as it is.
	access,
} as const;
```

- The build (`aventara:prepare`, which `next build` runs first) reads `config.ts` to compile the Contracts. With
  `access` there, the prebuilt Contracts match what the server runs. Given only in `server.ts`, the framework warns
  `AVENTARA_PREBUILT_STALE` and compiles the Contracts at startup.
- `aventara-build` runs `config.ts`, and so your `access.ts`, at build time. It reads the project's `.env` files
  first, as `avclient generate` does, so a database client that reads `DATABASE_URL` at import finds it.
- Next.js evaluates `access.ts` once per bundle, so one process can hold several Access instances. Each reads Better
  Auth's key set from your database once.

## NestJS

Mount Better Auth's Node.js handler before the body parser: `app.use()` between `NestFactory.create()` and `listen()`,
with a path test. It works on Express and Fastify alike.

```ts
// src/main.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { access } from "./access.js";
import { AppModule } from "./app.module.js";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	// Access's routes, under /api/auth, before Nest's body parser (listen() adds it).
	const auth = toNodeHandler(access);
	app.use(
		(request: IncomingMessage, response: ServerResponse, next: () => void) =>
			request.url?.startsWith("/api/auth/") ? auth(request, response) : next(),
	);
	await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

On Fastify, `app.use("/api/auth", …)` hands Better Auth the URL without its base path, so use the path test above. If
you enable CORS, register it before this mount, so Access's routes answer the same origins.

Wire it by putting `access` beside `adapter` in the `config` that the scaffold's `forRootAsync` factory returns. This is
the scaffold's `src/app.module.ts` with the two `access` lines added:

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AventaraModule } from '@aventara/nest';
import { createPrismaAdapter } from '@aventara/prisma7-adapter';
import adapter from './aventara.adapter.js';
import { aventaraConfig } from './aventara.config.js';
import { PrismaModule, PrismaService } from './prisma.service.js';
import { access } from './access.js';

@Module({
  imports: [
    PrismaModule,
    AventaraModule.forRootAsync({
      imports: [PrismaModule],
      inject: [PrismaService],
      useFactory: async (prisma: PrismaService) => ({
        config: {
          ...aventaraConfig,
          adapter: await createPrismaAdapter({
            ...adapter,
            client: prisma,
          }),
          access,
        },
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Here `aventaraConfig` has no `policy`: Access brings the engine. Nest compiles its Contracts at startup, so nothing goes
stale.

## Express

In a plain Express app, mount `toNodeHandler(access)` before `express.json()`. With Express 5, Better Auth's docs use a
named wildcard:

```ts
// src/express.main.ts
import { toNodeHandler } from "better-auth/node";
import express from "express";
import { access } from "./access.js";

const app = express();
// Access's routes first: Better Auth reads the body itself.
app.all("/api/auth/*splat", toNodeHandler(access));
// Your own routes after, with the JSON body parser.
app.use(express.json());
app.listen(Number(process.env.PORT ?? 3000));
```

Wire it with `createFramework({ ...config, access })`.

## Anywhere else

`createFramework({ ...config, access })`. With the Better Auth plugin, `accessOf(auth)` is the `access` value, in
each of the places above ([The Better Auth plugin](/docs/better-auth-plugin)).

Any object with `policy` (an engine) and `state` (`({ headers }) => ({ me })`) also fits the framework's `access`
option, so an app with its own authentication gets the same wiring. With `access`, the configuration has no `policy`
and the host has no `state` option.

## Standalone

`serve` runs Access as its own HTTP server around the same handler, with `GET /health` answering `200 {"status":"ok"}`:

```ts
// src/access.server.ts
import { serve } from "@aventara/access/standalone";
import access from "../access.config.js";

const server = await serve(access, { port: 4000 });
console.log(`Access listens on ${server.url}`);
```

| Option | Default |
|---|---|
| `port` | `3000`; `0` picks a free one |
| `hostname` | `"127.0.0.1"`, this host only; `"0.0.0.0"` listens on every interface |
| `maxBodyBytes` | 1 MiB (`1048576`) |

`serve` resolves to `{ port, url, close() }` once the server listens. `avaccess serve` runs the
same server from a configuration file ([The standalone server](/docs/standalone-server)).

`serve` speaks plain HTTP. Sessions, tokens and registry keys travel in headers, so put it behind a proxy that
terminates TLS. What it does for the handler behind it:

- A body over `maxBodyBytes` is refused with `413` before it is handed on. A push to the registry has its key checked
  before its body is read.
- The client's address is the socket's. `X-Forwarded-For` is replaced with it, unless the socket is a proxy listed in
  Better Auth's `advanced.ipAddress.trustedProxies`.
- `close()` stops accepting connections, lets requests in flight finish for up to 10 seconds, then ends the rest.

## The engine alone

Without Better Auth, hand the engine to the framework's `policy` option, with a function that reads the principal from
the request's state. Your host's `state` option (or your MCP `verify`) puts the user there.

```ts
// src/aventara.config.ts
import type { AvState } from "@aventara/core";
import { type Principal, policies } from "./access.policies.js";

declare module "@aventara/core" {
	interface AvState {
		user?: Principal;
	}
}

export const aventaraConfig = {
	api: "/api",
	exposed: true,
	policy: {
		engine: policies.engine(),
		principal: ({ $state }: { readonly $state: AvState }) =>
			$state.user ?? null,
	},
} as const;
```

## Sign up and sign in

Better Auth's routes are under `/api/auth`. With `emailAndPassword` on, from a terminal:

```sh
# Sign up: the user is created and signed in.
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{ "email": "ada@example.com", "password": "correct-horse-battery", "name": "Ada" }'

# Sign in: the session cookie goes into cookies.txt.
curl -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{ "email": "ada@example.com", "password": "correct-horse-battery" }'

# A token for a service: the session cookie traded for a JWT, sent as a bearer token.
curl -b cookies.txt http://localhost:3000/api/auth/token
```

Send an `Origin` header that matches Better Auth's base URL or one of its `trustedOrigins`. A request that carries a
cookie is refused `403 MISSING_OR_NULL_ORIGIN` without one, and `403 INVALID_ORIGIN` with another. A browser's `fetch`
sends `Origin` itself.

With `emailAndPassword` on, anyone who reaches the server can sign up. A server whose users are created another way sets
`emailAndPassword: { enabled: true, disableSignUp: true }`. A server that signs in no one leaves `emailAndPassword` out.
