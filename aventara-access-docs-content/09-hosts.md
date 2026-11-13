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

Wiring is the framework's `access` option, and nothing beside it: with `access`, leave out the configuration's `policy`
and the host's `state` option. Either one beside it stops the app at startup (`createFramework` refuses `policy` with
`CONFIG_INVALID_VALUE`; `AventaraModule` and Next.js's `Aventara()` refuse `state`). If your app seeds its own `state`
today, remove it in the same change that adds `access`. `principal` gives `me`, and a pipeline stage may still write
keys of its own on `ctx.$state` ([With the framework](/docs/create-access#with-the-framework-access-replaces-policy-and-the-hosts-state)).

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
	// Better Auth starts, and Access checks its options: a refusal stops the start
	// here, before the server listens.
	await access.api.ok();
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
// Better Auth starts, and Access checks its options, before the server listens.
await access.api.ok();
app.listen(Number(process.env.PORT ?? 3000));
```

Wire it with `createFramework({ ...config, access })`.

## Anywhere else

`createFramework({ ...config, access })`. With the Better Auth plugin, `accessOf(auth)` is the `access` value, in
each of the places above ([The Better Auth plugin](/docs/better-auth-plugin)).

Any object with `policy` (an engine) and `state` (`({ headers }) => ({ me })`) also fits the framework's `access`
option, so an app with its own authentication gets the same wiring. With `access`, the configuration has no `policy`
and the host has no `state` option: either one beside it is refused at startup.

A host of its own passes `ctx.$state.me` to the policy as it is, by reference: a copy (a spread, `structuredClone`)
loses the marks Access puts on the principal (an OAuth access token's grant, a session bearer's), and the policy would
then answer the copy as the user's own principal under every origin.

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

## Access rules with your own identity

The rules do not need Better Auth. Until your app signs users in (a first release on a trusted till network, a
development build, your tests), run them on the engine alone, as above, and let your host's own `state` option say who
the caller is. For a development build on your own machine, that can be a header your own shell sets. Such a header is
a password anyone can type, so the state below honours it only when all of these hold, and treats every other caller
as anonymous:

- `AV_DEV_IDENTITY=1` turns it on. Without it the header is ignored.
- `NODE_ENV` is `development` or `test`. With `AV_DEV_IDENTITY=1` and any other `NODE_ENV` (`production`, or none at
  all, as on many servers and containers), the module throws when it loads, so the app does not start.
- The request comes from this machine's own loopback address, and carries no header a proxy adds (`Forwarded`, any
  `X-Forwarded-*`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`, `Via` and the like).
- Its `Host` is `localhost`, `127.0.0.1` or `[::1]`, with or without a port. A web page on another site can get your
  browser to send requests to `127.0.0.1` under the page's own host name (DNS rebinding), and those carry that name.

Never run it behind a proxy or a tunnel (`ssh -R`, `kubectl port-forward`, ngrok and the like), and never deploy it. A
reverse proxy on the same machine (nginx, Caddy, a sidecar) makes every request from anywhere arrive from `127.0.0.1`,
and a tunnel does the same, usually without adding any header. The header list above cannot be complete: proxies have
headers of their own (`X-Original-Forwarded-For`, `Fly-Client-IP`, `X-Envoy-External-Address`, and more), and many
strip or never set any. The check catches a proxy that says so, nothing else. Behind one that does not, anyone who can
reach it can send the header and be any user.

```ts
// src/dev-identity.state.ts
import type { IncomingMessage } from "node:http";
import type { AvState } from "@aventara/core";
import type { Principal } from "./access.policies.js";

/** On only with `AV_DEV_IDENTITY=1`, and only under NODE_ENV `development` or `test`. */
const enabled = process.env.AV_DEV_IDENTITY === "1";
const environment = process.env.NODE_ENV;
if (enabled && environment !== "development" && environment !== "test") {
	throw new Error(
		`AV_DEV_IDENTITY=1 is set with NODE_ENV=${environment ?? "(unset)"}: the development identity header runs only under NODE_ENV development or test. Unset AV_DEV_IDENTITY.`,
	);
}

/** Addresses of this machine: a header from anywhere else is ignored. */
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Headers a proxy adds. With any of them the socket's address is the proxy's, not the caller's. */
const PROXY_HEADERS = new Set([
	"forwarded",
	"via",
	"x-real-ip",
	"cf-connecting-ip",
	"true-client-ip",
	"x-client-ip",
	"x-cluster-client-ip",
	"fastly-client-ip",
]);

const proxied = (headers: IncomingMessage["headers"]): boolean =>
	Object.keys(headers).some(
		(name) => PROXY_HEADERS.has(name) || name.startsWith("x-forwarded-"),
	);

/**
 * This machine's host names, with an optional port. A page on another name that
 * reaches the server (DNS rebinding) sends its own name.
 */
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

/**
 * The request's state for the framework's `policy`: the user a development header
 * names, when it is on, from this machine, to a local host name, not through a proxy.
 * Anyone else is anonymous.
 */
export const devIdentityState = (request: unknown): AvState => {
	if (!enabled) {
		return {};
	}
	const { socket, headers } = request as IncomingMessage;
	const id = headers["x-dev-user"];
	if (
		typeof id !== "string" ||
		id === "" ||
		!LOOPBACK.has(socket?.remoteAddress ?? "") ||
		!LOCAL_HOST.test(headers.host ?? "") ||
		proxied(headers)
	) {
		return {};
	}
	// Every boolean claim a deny compares, set: a deny such as `banned: true` matches a
	// principal that lacks the claim, so a user without it would be refused everything.
	const user: Principal = { id, claims: { banned: false } };
	return { user };
};
```

On NestJS it is the module's `state` option, beside `config` (`AventaraModule.forRoot({ config, state:
devIdentityState })`). Start the server with `AV_DEV_IDENTITY=1 NODE_ENV=development`, and send `x-dev-user: <id>`
from the same machine.

Next.js does not hand `state` the connection: the `state` option of `Aventara()` gets `{ headers, request? }`, and no
address, so with the flag on this sample treats every caller there as anonymous. A Next.js app cannot tell a request from its own machine from one from anywhere
else, so do not give it a header identity. Sign users in with Better Auth, or in tests ask as a principal (below). If
you add one anyway, gate it the same way (`AV_DEV_IDENTITY=1`, `NODE_ENV` development or test, a local `Host`, no
proxy header), and
know that anyone who can reach the dev server can send the header: `next dev` listens on every interface unless you
start it with `--hostname 127.0.0.1`.

Later, to sign users in with Better Auth, the rules stay as they are:

1. Build `createAccess` with `policies: { rules: policies, claims }` and a `principal` that maps `{ sub, claims }` to
   the same `Principal` ([`createAccess()`](/docs/create-access)).
2. Mount its routes, as above.
3. In one change, give the framework `access` and remove both `policy` and the host's `state` option: either one beside
   `access` stops the app at startup.

Tests need neither a sign-in nor a header. A server call asks as a principal: `framework.client.Note.find.many(args, {
as: pat })`, or with a state (`{ state: { user: pat } }` on the engine alone, `{ state: { me: pat } }` under `access`).
`{ as }` reads the same in both setups, and `{ as: null }` asks as an anonymous caller.

## A desktop shell

A desktop app (Electron, say) that starts the server and shows its web pages in a window is a browser on a client
address of its own. What to set:

- **Its pages' origin.** Load the pages from the server's own origin (the base URL) and there is nothing to add. Pages
  on another origin (a custom scheme such as `app://till`, or a dev server such as `http://localhost:5173`) need it in
  `betterAuth.trustedOrigins`: on a request that may change something, Access reads the session cookie only from a
  trusted origin. A page loaded from a file sends `Origin: null`, which no list makes trusted, so serve the pages
  rather than loading files. A cookie sent from another origin also needs `sameSite: "none"` and `secure`, which
  Access accepts only with `trustedOrigins` set.
- **Rate limits.** With `clientAddressed` (above) or `serve`, Better Auth counts each client by the socket's address.
  Windows on the server's own machine reach it over loopback, so they share one bucket per route: past three sign-in
  attempts in 10 seconds, right or wrong, the next is refused `429` until the window passes. Clients on other machines
  each count under their own address; behind one router address (NAT) they share it. Better Auth's limit is on only
  with `NODE_ENV=production`, so a shell that starts the server sets it there too, or passes
  `rateLimit: { enabled: true }` in the `betterAuth` block.

## Trusted origins and wildcards

`trustedOrigins` is also Better Auth's allowlist for its CSRF check and for redirects. A request whose `Origin`
matches an entry is taken as your app's own, and a `callbackURL`, a `redirectTo` or a password-reset link may send the
browser to any site an entry matches. A wildcard (`*` or `?`, such as `https://*.example.com`) trusts every site it
matches, so it must sit under a domain you own, and every site under it must be yours. A wildcard over a shared host
(`*.vercel.app`, `*.github.io`, `*.co.uk`) trusts everyone's sites there. An entry whose host is a wildcard alone
(`"*"`, `"?"`, `"http://*"`, `"*://*"`, `"*:3000"`, `"[*]"`, read with Better Auth's escapes, so `"*\\"` and
`"\\https://*"` are too) trusts every site, as the CSRF check off would: Access, the kiosk
and the onboarding plugin refuse it (`ACCESS_OPTIONS_INVALID`, `KIOSK_OPTIONS_INVALID`,
`ONBOARDING_OPTIONS_INVALID`), from the options, `BETTER_AUTH_TRUSTED_ORIGINS` or Better
Auth's context. So is an entry of a script or file scheme (`javascript:`, `data:`, `vbscript:`,
`file:`): Better Auth would take a callback URL of it and hand it back to the browser. Any other wildcard is your choice in Better Auth, and is taken: outside `NODE_ENV=production` it is
warned of once in the process when it is first met (`ACCESS_TRUSTED_ORIGIN_WILDCARD`, a Node.js warning, from Access
or from the kiosk or onboarding plugin, whichever meets it first; the plugins also log it through Better Auth's logger,
so a quiet logger does not silence it).

When a wildcard matches a site you do not control, such as a subdomain someone else can deploy to or take over, or
a site on a shared host, Access cannot fully guarantee:

- **No cross-site sign-in.** A sign-in form posted from a matched subdomain of your own domain, or from any matched
  site under `sameSite: "none"`, is accepted and signs the browser in to an account of its choosing (login CSRF).
  From a matched site on a shared host, Better Auth's Fetch Metadata check still blocks the cross-site form `POST`,
  but its redirects and password-reset links can still reach that site (below).
- **Cookie-session requests from your origins only.** On a request that may change something, Better Auth and
  Access's `state` read the session cookie from that site as from your own. A browser sends the default
  `SameSite=Lax` cookie on such a request from a subdomain of your own domain, and from any site under
  `sameSite: "none"`.
- **Redirects that stay on your sites.** A `callbackURL`, a `redirectTo` or a password-reset link may send the
  browser there, and the reset token with it.
- **With the kiosk plugin**, PIN switches and device requests from your app's origins only.
- **With the onboarding plugin**, onboarding steps completed from your app's origins only.

A custom scheme's wildcard (`myapp://*`) names no web origin: it is taken and warned of, and, like any entry whose host
is a wildcard alone, it never counts as naming the origins your app is served from for the `sameSite: "none"` rule. A
`trustedOrigins` function answers on each request, and Access does not read it: checking what it answers is yours.

## Instead of turning the CSRF check off

Better Auth's `advanced.disableOriginCheck` and `advanced.disableCSRFCheck` are refused, and there is no way around
the refusal. What a request needs instead depends on who sends it:

- **An API that clients call with bearer tokens, and no cookies.** Nothing to turn off: Better Auth checks the origin
  of a request that carries a cookie, and Access reads `Authorization: Bearer <token>` with the JWT `GET /token`
  issues. With Better Auth's `bearer({ requireSignature: true })` among the plugins, a signed session token (the
  `set-auth-token` a sign-in answers) is a bearer token too: Access reads its session through Better Auth with every
  cookie stripped, so the bearer alone decides. A different session cookie beside it makes the request nobody's;
  other cookies are ignored. It is not read under `audience` or the `service` profile, and the policy refuses its
  principal on the MCP endpoint (origin `agent`, rule `mcp-audience`). A kiosk till that is a native app works this
  way ([A till that is a native app](/docs/kiosk#a-till-that-is-a-native-app-headers)); its server answers CORS with
  `authorization` and `kiosk-device` allowed and `set-auth-token` and `set-kiosk-device` exposed. Signing in is the
  exception: sign-in, sign-up, magic-link and email-OTP requests from a browser are checked
  even with no cookie (their `Origin`, and Fetch Metadata's `Sec-Fetch-*` headers), so a browser client served from
  another origin must have that origin in `trustedOrigins` to sign in.
- **A native or mobile app that sends no `Origin`.** List its scheme in `trustedOrigins` (`myapp://`) and send it as
  the request's origin, as Better Auth's Expo plugin (`@better-auth/expo`) does for an Expo app. A state-changing
  request (any method but `GET`, `HEAD` and `OPTIONS`) that carries a cookie and neither an `Origin` nor a `Referer`
  (Better Auth's fallback) is refused `403 MISSING_OR_NULL_ORIGIN`.
- **Another server calling this one.** A bearer token (a JWT from `GET /token`, or the OAuth provider's) or an API
  key (`@better-auth/api-key`), not a session cookie.
- **Tests that fail with `MISSING_OR_NULL_ORIGIN`.** Run them under `NODE_ENV=test`, where Better Auth's own default
  leaves the origin check off, or send an `Origin` header that matches the base URL or a trusted origin.
- **Local development** with the pages on another port than the server (a dev server such as
  `http://localhost:5173`). Add that origin to `trustedOrigins`.

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

Send an `Origin` header that matches Better Auth's base URL or one of its `trustedOrigins`. A state-changing request
(any method but `GET`, `HEAD` and `OPTIONS`) that carries a cookie is refused `403 MISSING_OR_NULL_ORIGIN` without one,
and `403 INVALID_ORIGIN` with another. A browser's `fetch`
sends `Origin` itself.

With `emailAndPassword` on, anyone who reaches the server can sign up. A server whose users are created another way sets
`emailAndPassword: { enabled: true, disableSignUp: true }`. A server that signs in no one leaves `emailAndPassword` out.
