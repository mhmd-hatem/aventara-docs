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

Better Auth's rate limit counts each client by its `X-Forwarded-For`, and Next.js keeps one the client sent (it
fills the header from the socket only when it is missing). On Vercel there is nothing to do: the platform sets it.
Self-hosted (`next start`), run behind a proxy that overwrites `X-Forwarded-For` with the client's address, or one that
appends to it and is listed in Better Auth's `advanced.ipAddress.trustedProxies`. Never let clients reach `next start`
directly: each could pick the address it is counted under.

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
with a path test. It works on Express and Fastify alike. This is the scaffold's `src/main.ts` with the mount added
after its CORS block, so Access's routes answer the same origins:

```ts
// src/main.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { access } from "./access.js";
import { AppModule } from "./app.module.js";
import { clientAddressed } from "./client-address.js";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	// The browser origins allowed to call this server: CORS_ORIGINS in .env,
	// comma-separated. Unset or empty, CORS stays off.
	const corsOrigins = (process.env.CORS_ORIGINS ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false });
	// Rate limiting: @nestjs/throttler is a Nest guard and does not run on Aventara's
	// routes; a platform-level limiter does. `npm i express-rate-limit`, import
	// { rateLimit } from 'express-rate-limit', pick your limits and uncomment below.
	// See: https://aventara.razor34.dev/framework/docs/limits-and-safety#rate-limiting
	// app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
	// Access's routes, under /api/auth: after CORS, before Nest's body parser
	// (listen() adds it), each request with its client's address.
	const auth = toNodeHandler(access);
	app.use(
		(request: IncomingMessage, response: ServerResponse, next: () => void) => {
			if (!request.url?.startsWith("/api/auth/")) {
				return next();
			}
			clientAddressed(request);
			return auth(request, response);
		},
	);
	await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

Node.js's handler hands Better Auth no client address, and Better Auth reads one only from a header
(`X-Forwarded-For` unless `advanced.ipAddress.ipAddressHeaders` names others). Without one, in production its rate
limit puts every client in one bucket per route, so three wrong sign-ins lock everyone out of signing in; and a header
the client sent itself would buy it a fresh bucket each time. `clientAddressed` does what [`serve`](#standalone) does:

```ts
// src/client-address.ts
import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import type { BetterAuthOptions } from "better-auth";
import { access } from "./access.js";

const options: BetterAuthOptions = access.options;
const ip = options.advanced?.ipAddress;
/** Where Better Auth reads the client's address: its first `ipAddressHeaders`, `x-forwarded-for` by default. */
const headers = (ip?.ipAddressHeaders ?? ["x-forwarded-for"]).map((header) =>
	header.toLowerCase(),
);
/** Better Auth's `trustedProxies`: the proxies whose forwarded headers are kept. */
const proxies = new BlockList();
for (const entry of ip?.trustedProxies ?? []) {
	const [address = "", prefix] = entry.split("/");
	const family = isIP(address);
	const type = family === 4 ? "ipv4" : "ipv6";
	if (family !== 0 && prefix === undefined) {
		proxies.addAddress(address, type);
	} else if (family !== 0 && /^\d+$/.test(prefix ?? "")) {
		proxies.addSubnet(address, Number(prefix), type);
	}
}

/**
 * Gives a request its client's address, as `serve` does: the socket's, in the header
 * Better Auth reads. A client's own `X-Forwarded-For` (and `-Proto`, `-Host`) is
 * dropped first, unless the socket is a proxy `trustedProxies` lists: then the
 * proxy's headers are kept, and Better Auth reads the client from them.
 */
export function clientAddressed(request: IncomingMessage): void {
	if (ip?.disableIpTracking === true) {
		return;
	}
	// An IPv4 client on a dual-stack socket reads as ::ffff:203.0.113.7.
	const socket = request.socket.remoteAddress?.replace(
		/^::ffff:(?=\d{1,3}(?:\.\d{1,3}){3}$)/i,
		"",
	);
	const family = socket === undefined ? 0 : isIP(socket);
	const proxy =
		socket !== undefined &&
		family !== 0 &&
		proxies.check(socket, family === 4 ? "ipv4" : "ipv6");
	if (!proxy) {
		for (const header of headers) {
			delete request.headers[header];
		}
		delete request.headers["x-forwarded-proto"];
		delete request.headers["x-forwarded-host"];
	}
	const first = headers[0];
	if (socket !== undefined && first !== undefined && !(first in request.headers)) {
		request.headers[first] = socket;
	}
}
```

- On a server clients reach directly, a client's own `X-Forwarded-For` is replaced with its socket's address, so no
  client picks the address it is counted under.
- Behind a proxy (a load balancer, a TLS terminator), list it in Better Auth's `advanced.ipAddress.trustedProxies`
  (`["10.0.0.2"]`, or a CIDR range): its `X-Forwarded-For` is kept, and Better Auth reads the client from the rightmost
  address in it that is not a trusted proxy. Without it, every client counts as the proxy's address.
- Run production with `NODE_ENV=production`: Better Auth's rate limit, and Access's limit on `access.client`'s calls, are on only under it, and the scaffold's `start:prod` does not set it.

On Fastify, `app.use("/api/auth", …)` hands Better Auth the URL without its base path, so use the path test above.

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

In a plain Express app, mount `toNodeHandler(access)` before `express.json()`, with `clientAddressed` from
`src/client-address.ts` above. With Express 5, Better Auth's docs use a named wildcard:

```ts
// src/express.main.ts
import { toNodeHandler } from "better-auth/node";
import express from "express";
import { access } from "./access.js";
import { clientAddressed } from "./client-address.js";

const app = express();
// Access's routes first, each request with its client's address: Better Auth reads
// the body itself.
const auth = toNodeHandler(access);
app.all("/api/auth/*splat", (request, response) => {
	clientAddressed(request);
	return auth(request, response);
});
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

In production, run it with `NODE_ENV=production` (`NODE_ENV=production node dist/access.server.js`).

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
