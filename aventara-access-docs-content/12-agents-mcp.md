---
title: Agents over MCP
description: "Authorize AI agents with Better Auth's OAuth provider: scopes, registration and one audience per service."
order: 12
section: guides
---

# Agents over MCP

Better Auth authenticates; Access authorizes. An agent's client gets its token from Better Auth's own OAuth provider,
`@better-auth/oauth-provider`, which you add to `betterAuth.plugins` with its options as Better Auth's docs give them.
Access issues no token and serves no OAuth route.

With `mcp: { resource }`, Access reads the provider's tokens for your MCP endpoint, holds the agent to its user's
grants and its token's scopes, and gives the framework its `mcp.authorization`.

Install the provider and `@better-auth/cimd` in the same range as Better Auth. npm takes the newest patch of each, with
Better Auth's at the same patch:

```sh
npm install @better-auth/oauth-provider@~1.7.12 @better-auth/cimd@~1.7.12
```

```ts
// src/access.mcp.ts
import { createAccess } from "@aventara/access/auth";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { oauthProvider } from "@better-auth/oauth-provider";
import { Pool } from "pg";
import { policies } from "./access.policies.js";

/** The MCP endpoint, as its protected-resource metadata names it. */
const resource = "https://app.example.com/mcp";

const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
		baseURL: "https://app.example.com",
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
		plugins: [
			// Better Auth's OAuth provider, as its docs give it: it issues every token.
			oauthProvider({
				loginPage: "/sign-in",
				consentPage: "/consent",
				scopes: ["aventara:read", "aventara:write", "offline_access"],
				resources: [resource],
				clientRegistrationDefaultResources: [resource],
			}),
			// Client ID Metadata Documents: an agent's client is the domain its document is served from.
			cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
		],
	},
	policies: { rules: policies, claims },
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
	mcp: { resource },
});
```

Then the framework's configuration takes it in one line, beside `access`:
`mcp: { path: "/mcp", authorization: access.mcp }`.

## What `access.mcp` holds

`access.mcp` is there exactly when `mcp` is given, and is `{ servers, verify }`:

- `servers` is Access's issuer, the origin of Better Auth's base URL, alone. Mount `access.handler` at
  `/.well-known/oauth-authorization-server` too, at the root of that origin, where a client looks for the provider's
  metadata. The issuer is https, or on this machine `http://127.0.0.1` or `http://[::1]` with any port. Set `baseURL`
  to that address, not `localhost`.
- `verify(token)` takes the provider's JWT access token for the MCP endpoint and nothing else, and resolves who the agent
  acts for: `{ sub, claims, clientId, scopes }`, the claims read from the user now.

`verify` refuses a session token (`GET /token`), a token for another resource, an opaque token, a token bound to a DPoP
key, a client-credentials token, and one whose client is disabled, whose user is gone or no longer consents to its
scopes, or whose session has ended.

`POST /oauth2/revoke` does not revoke a JWT access token: the provider answers that a self-contained token cannot be
revoked server-side, and the token verifies until it expires. To stop an agent at once, revoke the user's consent to its
client, disable the client or end its session, which `verify` reads on every request, and keep the provider's
`accessTokenExpiresIn` short. `/oauth2/revoke` does revoke a refresh token.

With Better Auth's `secondaryStorage`, the provider requires `session.storeSessionInDatabase: true`, so the session a
token names is a database row. With `preserveSessionInDatabase` too, Better Auth ends that row when the session ends, and
the token stops.

### Better Auth on Prisma's adapter

Better Auth's OAuth provider (1.7.12 to 1.7.14) cannot register its resource on Better Auth's Prisma adapter: it writes
`allowedScopes: null`, and the `String[]` column `auth generate` writes for it is a list Prisma will not leave unset.
Run Better Auth on a `pg` `Pool` (its built-in Kysely), as the samples on this page do. The tables can still live in
your Prisma schema: `auth generate` writes them, `prisma db push` makes them, and `resources.authTables` names the
Resource each one is.

## How an agent is held

The request state reads the same token, so `ctx.$state.me` is the user's principal, as `principal` maps it. The policy
holds it to the token before the rules:

- Under the `agent` origin, `aventara:read` admits the read questions and `aventara:write` the writes (`create`,
  `update`, `delete`). A question the scopes do not admit is refused. One they admit is the user's own, so an agent never
  does what its user may not. Your rules can narrow it further by origin.
- Under any other origin it is refused everything. The token opens the MCP endpoint alone, never the protocol routes,
  `_access/can`, a server-side call or Access's own `GET /me` route.
- A refused question is an audit event like any other, with the reason `deny:mcp-scope` or `deny:mcp-audience`.

The claims are read from the user on every request, so a ban or a role taken away reaches the agent on its next call.

## Telling an agent apart

`agentOf(me)`, from `@aventara/access/auth` and `@aventara/access/better-auth`, answers `{ clientId, scopes }` for
the principal an agent's token yields, and `null` for any other principal. The mark does not show in the principal's own
fields, its spread or its JSON.

```ts
// src/agent.check.ts
import { agentOf } from "@aventara/access/auth";

/** Whether a request's principal is an agent acting for its user, and which client. */
export const actingAgent = (me: unknown): string | null => agentOf(me)?.clientId ?? null;
```

`me()` is the token identity, `{ sub, claims }`, everywhere, the MCP surface included. Only the HTTP route `GET /me`
answers an agent's token `null`.

## Registration

With `@better-auth/cimd`, an agent's client registers itself by its `client_id`, the URL of its metadata document, and
your consent page can name the domain it comes from.

Open dynamic registration (`allowDynamicClientRegistration` with `allowUnauthenticatedClientRegistration: true`)
registers any client as whoever it says it is. Access refuses it unless you acknowledge it with
`mcp: { resource, openRegistration: true }`. Registration by a signed-in user or with an initial access token needs no
acknowledgement.

Your consent page is your app's. Show the client's name, the domain of its metadata document and the host of the
redirect URI it asked for, and say what each scope lets the agent do.

## What Access refuses at startup

`ACCESS_OPTIONS_INVALID`, on a provider that would let an agent's authorization fall short:

- no provider in the plugins, or two;
- opaque access tokens (`disableJwtPlugin`);
- the endpoint missing from its `resources`, or no `aventara:read` among its `scopes`;
- a refresh reuse window (`refreshTokenReuseInterval` other than 0);
- a `validateRedirectUri`, a `requestUriResolver`, or a `postLogin.consentReferenceId`;
- open registration without `openRegistration`;
- an endpoint that is the provider's own UserInfo URL;
- the `service` profile, which hands no browser a session to consent in.

A provider or a `cimd()` outside `~1.7.12` is refused with `ACCESS_BETTER_AUTH_VERSION`. Every
authorization request must use PKCE with SHA-256 and carry its own parameters; one without, or one by reference
(`request_uri`), is refused with `400 invalid_request`.

With the Better Auth plugin, pass the same `mcp` to `aventaraAccess()` and put `oauthProvider()` after it in
`plugins`. `accessOf(auth).mcp` is then the framework's `mcp.authorization`.

## One audience per service

By default a service takes the one-org token `GET /token` issues, whose audience is the issuer. A service can opt in to
tokens addressed to it alone (RFC 8707). `audience` names its URL, and the provider lists it among its `resources`.
Each client the service takes is linked to it, one by one (`auth.api.adminLinkClientResource`, the provider's own
operator call), and asks for one of Access's scopes.

```ts
// src/access.audience.ts
import { createAccess } from "@aventara/access/auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { Pool } from "pg";
import { policies } from "./access.policies.js";

/** This service, as a client names it when it asks for a token. */
const audience = "https://app.example.com/api";

const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
		baseURL: "https://app.example.com",
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
		plugins: [
			oauthProvider({
				loginPage: "/sign-in",
				consentPage: "/consent",
				scopes: ["aventara:read", "aventara:write", "offline_access"],
				resources: [audience],
			}),
		],
	},
	policies: { rules: policies, claims },
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
	audience,
});
```

- With `audience`, the request state takes a bearer token only when it is the provider's access token addressed to the
  service alone, checked as `verify` checks an agent's, and carrying `aventara:read` or `aventara:write`.
- Its principal is the user's, held to those scopes under every origin. A scope never grants what the user's own grants
  do not.
- The one-org token is refused. A session cookie is read as before.
- `audience` cannot be the MCP endpoint, the issuer itself or the provider's UserInfo URL.
- Access refuses a provider with `enforcePerClientResources: false`, and open registration. With `mcp` beside it, the
  audience in `clientRegistrationDefaultResources` or `clientRegistrationAllowedResources` is refused too.

On the kiosk profile, a session bound to a till never gets an agent's token ([The kiosk profile](/docs/kiosk)).
