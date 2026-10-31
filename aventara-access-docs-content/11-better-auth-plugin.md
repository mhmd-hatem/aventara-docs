---
title: The Better Auth plugin
description: "aventaraAccess(), accessOf, the organization bridge, the client plugin and the app as the hub."
order: 11
section: guides
---

# The Better Auth plugin

`createAccess` builds Better Auth for you. When your app already calls `betterAuth({...})` itself, add Access to it as
a plugin instead:

- `aventaraAccess()` is the server plugin. It takes the same `policies`, `principal`, `resources`, `audit`, `passwords`
  and `registry` as `createAccess`.
- `accessOf(auth)` gives the framework its `access` option from that Better Auth instance.
- `aventaraAccessClient()` is the client plugin. It adds `authClient.access.can`.

All three come from `@aventara/access/better-auth`.

## An app with organizations

This app's rules are its organizations': Better Auth's `organization()` plugin holds the memberships, and the
organization bridge (below) puts a member's role and organization into the token.

```ts
// src/org.policies.ts
import { definePolicies } from "@aventara/access";
import { model } from "./generated/aventara/discovery.artifact.js";

/** What every token carries beside `sub`: the ban, and the organization bridge's two claims. */
export const claims = {
	banned: "boolean",
	orgRole: "string",
	org: "string",
} as const;

/** The principal: the user, with the session's active organization copied up for the rules. */
export type Principal = {
	id: string;
	org?: string;
	claims: { banned?: boolean; orgRole?: string; org?: string };
};

export const orgPolicies = definePolicies(model)
	.principal<Principal>()
	.roles(() => ({
		// The bridge's role: an admin of the session's active organization.
		orgAdmin: { global: { claims: { orgRole: "admin" } } },
	}))
	.grants(({ grant, me }) => [
		// Every grant is held to the principal's organization: a role from the bridge is
		// that organization's, never a global one.
		grant("signedIn", "read", "Campaign", { where: { organizationId: me.org } }),
		grant("orgAdmin", ["create", "update", "delete"], "Campaign", {
			where: { organizationId: me.org },
		}),
	])
	.denies(({ deny }) => [deny("*", "*", { if: { claims: { banned: true } } })]);
```

```ts
// src/auth.ts
import { accessOf, aventaraAccess } from "@aventara/access/better-auth";
import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins/organization";
import { PrismaClient } from "./generated/prisma/client.js";
import { claims, orgPolicies } from "./org.policies.js";

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	emailAndPassword: { enabled: true },
	user: {
		additionalFields: {
			banned: { type: "boolean", required: false, input: false },
		},
	},
	plugins: [
		organization({
			// Invitations are accepted only by a verified email (GHSA-fmh4-wcc4-5jm3, below).
			requireEmailVerificationOnInvitation: true,
			// Who may create an organization, and so own it: here, nobody but the server.
			allowUserToCreateOrganization: false,
		}),
		aventaraAccess({
			policies: { rules: orgPolicies, claims },
			// A member's role in the session's active organization, and that organization.
			organization: {
				claim: "orgRole",
				organizationClaim: "org",
				roles: [
					["owner", "admin"],
					["admin", "admin"],
					["member", "member"],
				],
			},
			// The organization claim copied onto the principal, where the rules read it.
			principal: ({ sub, claims }) => ({
				id: sub,
				...(claims.org === undefined ? {} : { org: claims.org }),
				claims,
			}),
			// Every sign-in and every decision: `true` for the `accessAudit` table.
			audit: { sink: (event) => console.log(event.kind, event.userId) },
		}),
	],
});

/** The framework's `access` option: the policy engine and each request's `me`. */
export const access = accessOf(auth);
```

## What the plugin does

- It carries Better Auth's `jwt()` inside it, so `GET /api/auth/token` and `GET /api/auth/jwks` are there. Its tokens
  carry `sub` and the declared claims only, under your base URL's origin as issuer and audience, for
  `policies.tokenTtl`. Do not add `jwt()` beside it.
- It runs `createAccess`'s own checks on your Better Auth options when Better Auth starts it, and `accessOf(auth)` runs
  them again when the framework is built. A refusal is the same `AccessError` `createAccess` throws, so your server fails
  at startup with the sentence.
- `accessOf(auth)` reads requests as `createAccess`'s `state` does. Its engine closes Better Auth's tables and seals
  their secrets alike. `accessOf(auth).$Infer.Me` is the principal type, and `$Infer.Claims` the claims.
- `audit` logs sign-ins, refused sign-ins, sign-outs and tokens from Better Auth's hooks, and each decision of
  `accessOf(auth).policy`.
- Passwords are hashed with argon2id as under `createAccess` ([Passwords](/docs/passwords)).
- What else `createAccess` adds around Better Auth is not here: profiles, `access.handler`, the standalone host, and
  the `$access` verbs. You mount `auth.handler` as you already do.
- Call `aventaraAccess()` once for each `betterAuth({...})`. One plugin in two instances whose options differ is refused
  with `ACCESS_PLUGIN_DUPLICATE`. So is `aventaraAccess()` inside `createAccess({ betterAuth: { plugins } })`.

## The organization bridge

`organization: { claim, organizationClaim, roles }` puts a member's role in Better Auth's organization plugin into
one claim, and the organization into another. Both must be declared in `policies.claims` as `"string"`.

- When a token is issued (and when `me` is read from the session cookie), Access reads the membership of the session's
  active organization from Better Auth's store and maps its role through `roles`, an ordered list of
  `[Better Auth role, value]`. A member with several roles gets the value of the first one listed.
- No active organization, no membership, or a role `roles` does not name gives neither claim.
- Removing a member, or changing their role, changes their next token.
- The bridge owns both claims: neither the user's field of the same name nor `policies.claimsOf` fills them.

An organization role is that organization's, but the rules' roles are global. A rule on the bridged role alone would let
an admin of one organization act on every organization's rows. Hold every grant on it to the organization: copy the
organization claim onto the principal, and give each grant `where: { organizationId: me.org }`, as above. A principal
without the claim matches no such grant.

The bridge refuses, with `ACCESS_OPTIONS_INVALID`, an organization plugin that lets a member be made otherwise than the
app decided:

- `requireEmailVerificationOnInvitation` must be `true`. Better Auth's advisory
  [GHSA-fmh4-wcc4-5jm3](https://github.com/better-auth/better-auth/security/advisories/GHSA-fmh4-wcc4-5jm3) lets a
  user whose email is not verified accept an invitation sent to that email without it. Better Auth has not fixed it
  as of 1.7.14.
- `allowUserToCreateOrganization` must be `false`, or a function that decides who may.
- With `dynamicAccessControl` on, `roles` may map only the plugin's static roles.

Without `organization()` in your plugins, the bridge is refused with `ACCESS_RESOURCE_MISSING`.

## The client plugin

`aventaraAccessClient({ api })` adds `authClient.access.can` to Better Auth's client. It asks the framework, not Better
Auth: one `POST {api}/_access/can` for the whole page, one boolean per question.

```ts
// src/auth-client.ts
import { aventaraAccessClient } from "@aventara/access/better-auth";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
	plugins: [aventaraAccessClient({ api: "/api" })],
});

/** One request for the page: may the user edit this campaign, and add notes? */
export const pageAnswers = async (campaignId: string) => {
	const { data, error } = await authClient.access.can([
		{ resource: "Campaign", action: "update", where: { id: campaignId } },
		{ resource: "Note", action: "create" },
	]);
	if (error !== null) {
		throw new Error(`can: ${error.status} ${error.code ?? error.statusText}`);
	}
	const [editCampaign = false, createNote = false] = data;
	return { editCampaign, createNote };
};
```

- `api` is the framework's API path or URL. A path is read against the auth client's `baseURL`, else the page's
  address.
- The request goes through Better Auth's own fetch, so it carries the session cookie, and the answer is Better Auth's
  `{ data, error }`.
- A question with `where` asks about one row, by its unique where. A row the user cannot read answers `false`, exactly
  as a missing one does.
- `can` only shapes the page. The real request is still checked.

## The app as the hub

With `registry: { enabled: true }`, the app that runs Better Auth is the registry other services push their files to
and pull them from, with no Access server beside it ([Namespaces, the registry and the CLI](/docs/registry-and-cli)).

```ts
// src/hub.ts
import { definePolicies } from "@aventara/access";
import { accessOf, aventaraAccess } from "@aventara/access/better-auth";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { model } from "./generated/aventara/discovery.artifact.js";

/** The hub's own rules, in its own namespace: it pushes them like any other service. */
const rules = definePolicies(model, { namespace: "campaign" }).grants(({ grant }) => [
	grant("signedIn", "read", "Campaign"),
]);

export const auth = betterAuth({
	database: new Pool({ connectionString: process.env.DATABASE_URL }),
	emailAndPassword: { enabled: true },
	plugins: [aventaraAccess({ policies: { rules, claims: {} }, registry: { enabled: true } })],
});

/** The framework's `access` option, and the registry's operator API as `access.registry`. */
export const access = accessOf(auth);
```

- The registry's tables are the plugin's schema, so `npx auth@~1.7.12 migrate` (or `generate` for an ORM's schema)
  creates them beside Better Auth's. They are the tables `createAccess` uses, so the data moves with you if you switch.
- Its routes are the plugin's endpoints under Better Auth's base path. A service reaches them only with its namespace's
  key in `x-access-key`. A session cookie or a token of the hub opens none of them.
- `access.registry` is the operator's API. No route opens it: run it in the app's own process, or with
  `avaccess keys … --server src/hub.ts`.
- The hub's own rules never come from the registry: they are the `policies` you pass in the app's process.
- A push's key is checked before Better Auth reads its body, on any mount: no key or a wrong one is refused, and a
  declared length over 2 MiB is answered `413`, unread.
- Every plugin you install runs in your app's process and sees every request, registry keys included: its `onRequest`
  and `hooks` are not checked. One whose endpoint can match a registry route, by name, path or parameters
  (`/:a/v1/key`), is refused. Install only plugins you trust with the keys.
- Better Auth's rate limit reads the client's address from `X-Forwarded-For` unless `advanced.ipAddress.trustedProxies`
  names your proxy, so a caller that sends its own header is counted afresh each time. Behind a proxy, set
  `trustedProxies`.
- The hub's tokens are one org token: one trust domain. A token any service sees works at every service that checks
  the hub's key set until it expires. Where services must not trust each other's callers, use
  [one audience per service](/docs/agents-mcp#one-audience-per-service).
