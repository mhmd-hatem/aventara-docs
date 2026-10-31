---
title: "The $access verbs"
description: "signIn, signUp, signOut, resetPassword and me: their routes, server calls and rate limits."
order: 10
section: guides
---

# The $access verbs

The framework's generated client has an `$access` member that signs users in and out and says who is signed in. Its
verbs are served by Access. `access.client` is what the framework reads to build them: where Access is mounted, and the
verbs this instance serves.

`url` is Better Auth's base URL with its base path (`http://localhost:3000/api/auth`), or the base path alone
(`/api/auth`) when `baseURL` is dynamic and follows the request's host. Each verb has a method, a path under `url`, the
JSON Schema of its arguments and of its result, and `call`.

| Verb | Route | Arguments | Result |
|---|---|---|---|
| `signIn` | `POST /sign-in/email` | `email`, `password`, optional `callbackURL`, `rememberMe` | `redirect`, `url`, `user: { id }` |
| `signUp` | `POST /sign-up/email` | `name`, `email`, `password`, optional `image`, `callbackURL`, `rememberMe` | `user: { id }` |
| `signOut` | `POST /sign-out` | none | `success` |
| `resetPassword` | `POST /reset-password` | `newPassword`, `token` | `status` |
| `me` | `GET /me` | none | `{ sub, claims }`, or `null` when no one is signed in |

`$access.can` is the framework's own verb: it asks `POST {api}/_access/can`, answered by the same engine that decides
the real requests.

- The arguments are the ones Better Auth's client sends on each route.
- A result names the user's id and Better Auth's own flags, never the session token or a field of the user.
- `me` is the token identity: `sub` and the claims `policies.claims` declares, whatever `principal` maps the request to.
  `GET /api/auth/me` is Access's own route. A plugin of yours with an endpoint at `/me` is refused with
  `ACCESS_PLUGIN_DUPLICATE`.

## Which verbs an instance serves

A verb the instance does not serve is left out:

- `signIn`, `signUp` and `resetPassword` need `emailAndPassword`.
- `signUp` is left out with `disableSignUp`.
- A path in `disabledPaths` takes its verb out.
- The `service` profile has no `signIn` or `signUp`.
- The kiosk profile adds `switchUser` and its other verbs ([The kiosk profile](/docs/kiosk)).

## Calling a verb on the server

`call({ args, headers })` runs the verb in the same process, through Better Auth's API, with the request's headers.
That is how a Server Action signs a user in. Put Better Auth's `nextCookies()` plugin last in `betterAuth.plugins`, and
it sets the browser's cookie from the answer.

```ts
// src/app/sign-in.action.ts
"use server";
import { headers } from "next/headers";
import { access } from "@/access";

/** Signs the user in from a form, in the same process as the page. */
export async function signInAction(email: string, password: string) {
	const signIn = access.client.verbs.signIn;
	if (signIn === undefined) {
		throw new Error("this Access instance serves no email sign-in");
	}
	return signIn.call({ args: { email, password }, headers: await headers() });
}
```

The call is checked as the route would be:

- the arguments against the verb's schema (`400` naming the key, never the value);
- Better Auth's origin check (a cookie from a site Better Auth does not trust, or a `callbackURL` outside
  `trustedOrigins`, is refused `403`);
- every plugin's `onRequest`, in the order Better Auth's router runs them. A plugin's refusal is thrown as Better Auth's
  `APIError` with the plugin's status and body;
- the profile's refusals;
- the audit log, which records the sign-in with origin `client`.

## Rate limits on server calls

Better Auth's rate limit runs in its router, which a call to its API skips. So Access limits the calls of `signIn`,
`signUp` and `resetPassword` itself, with Better Auth's own `rateLimit` options: on when they turn it on (`enabled`,
production by default), with the rule Better Auth's router applies to the route, in the storage they name.

Each call is counted in two buckets, and refused when either is full:

- **By client address**, read from the request's headers as Better Auth reads it (`advanced.ipAddress`). With
  `disableIpTracking` there is no address bucket.
- **By target**: the email the call names, or a password reset's token, as its HMAC. It counts failures: 10, each
  within 5 minutes of the one before, refuse the account's next try, the right password too, until 5 minutes have
  passed. A success clears the count.

A refused call throws Better Auth's own `429` (`TOO_MANY_REQUESTS`, with `X-Retry-After`), and the audit log records a
`sign-in-failed` with reason `rate-limited`. Behind a proxy, set `trustedProxies`, or calls whose address cannot be read
share one bucket per route.

## Over MCP

The framework's MCP `me` tool calls `access.client.verbs.me.call` in-process with the agent's headers. It answers who
the agent acts for ([Agents over MCP](/docs/agents-mcp)).
