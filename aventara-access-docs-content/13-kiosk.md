---
title: The kiosk profile
description: "Shared devices with staff switching by PIN: enrolling, locking, PIN limits, LAN without TLS and Expo apps."
order: 13
section: guides
---

# The kiosk profile

The kiosk profile is the web profile plus staff switching by PIN on shared devices, such as the tills of a shop.

1. A manager enrolls a device once.
2. After that, anyone with a PIN switches the device to themselves with their user id and PIN.
3. The session that opens is bound to that device, and locks when idle.

```ts
// src/access.kiosk.ts
import { createAccess } from "@aventara/access/auth";
import { Pool } from "pg";
import { policies } from "./access.policies.js";

const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
		baseURL: "https://kiosk.example.com",
		// Staff accounts are made by a manager; nobody signs up at a till.
		emailAndPassword: { enabled: true, disableSignUp: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
	},
	policies: { rules: policies, claims },
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
	profile: {
		kind: "kiosk",
		// Who may enroll, list and revoke devices: asked with a fresh full-credential session.
		canEnrollDevice: ({ claims }) => claims.role === "admin",
		// A session on a till locks after 5 minutes without a write.
		idleTimeout: 300,
	},
});
```

| Option | Takes | Default |
|---|---|---|
| `canEnrollDevice` | `(identity) => boolean`: who may enroll, list or revoke devices, asked with `{ sub, claims }` of a fresh session opened with full credentials. Anything but `true` refuses. | required |
| `idleTimeout` | Seconds without a request that may change something (any method but GET, HEAD or OPTIONS) after which a session on the device locks: whole seconds from 60 to 3600 | 300 |
| `insecureLan` | The private IPv4 ranges of a till network without TLS ([below](#a-till-network-without-tls)) | none |

`profile` takes one kind. The kiosk's keys on `web` or `service`, or two kinds at once, are a type error and are refused
with `ACCESS_OPTIONS_INVALID`.

## What the kiosk refuses

Each of these is a way around the device binding, so the kiosk refuses it with `ACCESS_OPTIONS_INVALID`:

- Better Auth's cookie cache (a locked session must end at once);
- `secondaryStorage` without `session.storeSessionInDatabase: true`;
- Better Auth's `bearer()` and `multiSession()` (and under any other id, no answer carries `bearer()`'s
  `set-auth-token` header);
- `advanced.crossSubDomainCookies`, and `SameSite=None` on any cookie;
- a plain http: base URL, except on a loopback host or on an address `insecureLan` lists. A dynamic `baseURL` takes
  `protocol: "https"`, unless every allowed host is a loopback host.

## The verbs and routes

The routes sit under Better Auth's base path. `access.client.verbs` publishes a verb for each, after Better Auth's, and
the framework's `$access` takes them as optional verbs.

| Verb | Route | Arguments | Result | Who |
|---|---|---|---|---|
| `enrollDevice` | `POST /kiosk/enroll-device` | `name` | `device: { id, name }` | A fresh full-credential session `canEnrollDevice` allows |
| `revokeDevice` | `POST /kiosk/revoke-device` | `deviceId` | `success` | The same |
| `setPin` | `POST /kiosk/set-pin` | `pin` | `success` | A fresh full-credential session, for its own user |
| `switchUser` | `POST /kiosk/switch-user` | `userId`, `pin` | `user: { id }` | An enrolled device |
| `lock` | `POST /kiosk/lock` | none | `success` | An enrolled device |

`GET /kiosk/list-devices` answers a manager with `devices: [{ id, name, enrolledBy, enrolledAt, lastSwitchAt? }]`,
never a credential. It is a route only.

Call the verbs' routes from the device, or their `call` from your server. A `call` of `switchUser`, `lock` or
`enrollDevice` sets the session cookie and the device's credential through your cookie plugin (`nextCookies()` in a
Server Action). Without one, the browser keeps the credential the switch replaced, and the device's next switch is
refused as a copy: call the route from the device instead.

On the web and service profiles there is no PIN route: each answers `404`.

## Your server's own calls

No route opens these:

```ts
// src/kiosk.admin.ts
import { access } from "./access.kiosk.js";

/** The kiosk's operator API: there on the kiosk profile only. */
const kiosk = access.kiosk;
if (kiosk === undefined) {
	throw new Error("access.kiosk.ts runs the kiosk profile");
}

/** The enrolled tills, for a manager's screen your app guards. */
export const tills = () => kiosk.listDevices();

/** Takes a till out of service, ending every session on it. */
export const retireTill = (deviceId: string) => kiosk.revokeDevice(deviceId);
```

| Call | Does |
|---|---|
| `access.kiosk.listDevices()` | The enrolled devices, as `GET /kiosk/list-devices` answers them (dates as `Date`) |
| `access.kiosk.revokeDevice(deviceId)` | Revokes a device, ending every session on it; `false` when there is none |
| `access.api.kioskSetUserPin({ body: { userId, pin } })` | Sets anyone's PIN, for staff who have no password. Better Auth's server-only endpoint: its router never serves it. |

## Enrolling, switching and locking

- **A fresh full-credential session** is one opened with a password (or any sign-in but a PIN) within Better Auth's
  `session.freshAge`, one day by default. A PIN session never enrolls, lists, revokes or sets a PIN.
- **Enrolling** gives the device its credential: 32 random bytes in an HTTP-only cookie, kept 400 days, always
  `SameSite=Lax`. On an https base URL it is `__Host-better-auth.kiosk_device`. Enrolling ends the session that
  enrolled it, so the device starts locked. Enrolling a device again revokes the old enrollment first.
- **A switch** checks the device's credential, then the PIN. A right one ends every session on the device, and opens a
  new one for the user named, with that user's own claims. The device's credential is replaced in the same answer, so a
  copy of the old one is spent. The audit log records a `kiosk-switch`.
- **Lock** ends the same sessions and keeps the device enrolled. A session idle for `idleTimeout` is ended on its next
  request, as if locked. Only a request that may change something (any method but GET, HEAD or OPTIONS, through
  Better Auth's routes or through the framework) counts as use: a page left open that keeps reading, such as Better
  Auth's client polling `/get-session`, does not keep the session alive.
- **Revoking** a device ends every session on it at once. Nothing is pushed to the till: it learns on its next
  request, which finds no session, and its next switch is refused `KIOSK_DEVICE_NOT_ENROLLED`.

## PINs

A PIN is 6 to 12 digits. It is refused when it is set (`400 PIN_TOO_WEAK`) if a guesser would try it first: repeated
digits or blocks, alternating digits, palindromes, straight runs, doubled digits, keypad lines, and the most common
6-digit PINs of leaked passwords. Dates are not refused. A PIN is hashed with argon2id at the `passwords` profile, and
never stored, logged or answered. A PIN stored at another profile is hashed again at the profile at its user's next
switch, written only while the row still holds the hash just checked. Setting a PIN clears its user's failed PINs.

What protects a PIN:

| Limit | What happens |
|---|---|
| Per user, on one device | 5 wrong PINs free, then one try per backoff that doubles from 1 minute to 1 hour (`429 KIOSK_PIN_LOCKED`). After 100 in a row, the PIN stops working on that device (`403 KIOSK_PIN_DISABLED`). Other devices are not affected, and a full sign-in or a new PIN clears both. The account itself is never locked. |
| Per device | 10 wrong PINs at once, for any users, then one more every 90 seconds. A user with no wrong PIN on the device since their last right one still gets one try while it is held, so one person cannot lock everyone out of a till. |

The counts are kept in the database before the PIN is checked, so parallel guesses cannot all pass one reading. They
are kept for any user id, whether it holds a PIN or names no user. The user's count, the device's one try for a user with a clean record, the PIN and the audit entry are keyed on the user's id as the database stores it, never as the request wrote it, so another spelling of the same id (an upper-case uuid in a PostgreSQL `uuid` column, another case under a MySQL `_ci` collation) gets no counts of its own. `kioskSetUserPin` and a device's revocation log the stored id too. On `1.0.0-rc.1` every spelling had its own counts, so a kiosk app that ran it on such ids should have its users set new PINs. A user id with no PIN costs the same argon2id
check as one with a PIN, so no answer tells who holds a PIN. An admin's impersonation is not a full sign-in: it clears
nothing.

## How a session is bound to its device

- Every session opened on an enrolled device is bound to it: a PIN switch's, and a password sign-in's on the device
  too. A bound session is held to the idle timeout, is issued no token (`GET /token` refuses it), and `/get-session`
  answers it without its token. A sign-in that brings the credential the last switch replaced, within 30 seconds of
  it, is refused `409 KIOSK_DEVICE_BUSY`, as every kiosk route refuses it.
- On every call that carries a session, a bound session is ended unless the request brings its device's current
  credential. A session copied to another browser is no session there, and no longer one on the device it came from.
  A session bound to no device, brought with an enrolled device's credential, is ended the same way.
- Every credential a switch replaced is kept as a hash for 400 days. Any of them brought back revokes the device with
  every session on it. The one exception is the credential the last switch replaced, within 30 seconds of it: that is a
  double tap, refused `409 KIOSK_DEVICE_BUSY` with the device left as it is.
- A PIN session reaches only `/get-session`, `/sign-out`, `/me`, `/jwks`, `/kiosk/switch-user`, `/kiosk/lock` and the
  routes that sign in with full credentials. Any other is refused `403 KIOSK_SESSION_NOT_ALLOWED`.
- With `mcp` or `audience`, a bound session is refused at the OAuth provider's authorization routes, and at its routes
  that manage clients and consents (`/oauth2/create-client`, `/oauth2/get-consents` and the like). A sign-in on an
  enrolled device that carries an authorization request to resume opens no session there, whether the request came in
  the body (the login page's `oauth_query`) or in a social sign-in's state, begun elsewhere. An agent is authorized
  from a manager's own browser, off the till.

## A till network without TLS

An on-prem shop may run its server on the tills' own network: a router of its own, WPA3, with nothing else on it,
and no certificate a tablet would trust. `insecureLan` lists that network's ranges. The kiosk then takes a plain http:
base URL on an address inside one.

Everything that crosses that network does so in the clear: the device's credential, the PIN sessions and the PINs.
Anyone who joins the network, or reads its radio, can take a till's session or learn a PIN. Use it only on a network
that is the tills' alone.

```ts
// src/access.till.ts
import { createAccess } from "@aventara/access/auth";
import { expo } from "@better-auth/expo";
import { Pool } from "pg";
import { policies } from "./access.policies.js";

const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
		// The server's fixed address on the tills' own network.
		baseURL: "http://192.168.1.10:3000",
		emailAndPassword: { enabled: true, disableSignUp: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
		// The tills are an Expo app: its scheme is a trusted origin.
		plugins: [expo()],
		trustedOrigins: ["tillapp://"],
	},
	policies: { rules: policies, claims },
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
	profile: {
		kind: "kiosk",
		canEnrollDevice: ({ claims }) => claims.role === "admin",
		insecureLan: ["192.168.1.0/24"],
	},
});
```

- **A range** is an IPv4 CIDR written in full, with its host bits clear (`192.168.1.0/24`, or `192.168.1.10/32` for the
  server alone). It is a /16 or narrower and lies wholly inside 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16. A
  hostname, an IPv6 range, any other range, an empty list, a range listed twice and a range inside another listed one
  are refused with `ACCESS_OPTIONS_INVALID`. A hostname or a missing prefix length is a type error first.
- **The base URL** is http: on an IPv4 address inside a listed range, never a hostname and never IPv6, written as the
  browser writes it: `http://192.168.001.010` or `http://3232235786` is refused, naming the form to write. A range's
  network or broadcast address (`192.168.1.0` or `192.168.1.255` in a /24) is refused too. It is a fixed `baseURL` (or
  `BETTER_AUTH_URL`), not a dynamic one. An https: or loopback base URL ignores `insecureLan`.
- **Cookies** follow http: they are not `Secure`. Settings that make a cookie `Secure`, or a `__Secure-` or `__Host-`
  prefix, are refused here. Cookies are not kept apart by port: run nothing else on the server's address. A service
  on another port of that address receives every till's credential and session, and can set cookies in any browser
  that visits it. With a till's credential planted in a browser, it can end that browser's session and bind its next
  sign-in to the till.
- **At startup** Better Auth's logger warns, naming the base URL and the ranges. `logger: { disabled: true }` in
  `betterAuth` silences it with the rest of Better Auth's log.

Everything else is as on https.

## A till that is an Expo app

A till can be a React Native app on Better Auth's Expo integration (`@better-auth/expo`) instead of a browser. Its
client keeps the cookies in SecureStore and sends them in a `Cookie` header, so enrolling, switching, the idle lock,
lock and revoking work as they do in a browser. The sample above shows the server side.

- Add Better Auth's `expo()` to `betterAuth.plugins`, and the app's scheme to `trustedOrigins`. The app names itself in
  an `expo-origin` header, which `expo()` makes the request's `Origin` when it has none. In Expo Go the origin is
  `exp://`, which `expo()` trusts only when `NODE_ENV` is `development`.
- Send the app's cookies to your Aventara API too (`Cookie: await authClient.getCookie()`). The device's credential is
  one of them, and without it a bound session is ended.
- On the till, staff sign in with their password (`signIn.email`) or switch by PIN. A native ID-token sign-in
  (`signIn.social` with `idToken`) is sent with no cookie, so the session is not bound and the till ends it. Pass the
  cookies and the origin yourself, `{ headers: { cookie: await authClient.getCookie(), "expo-origin": "tillapp://" } }`,
  as `signIn.social`'s second argument, and the session is bound.
- A sign-in in the system browser handed back to the app (a magic link, a social sign-in's redirect) cannot be bound.
  The system browser does not hold the device's credential, and it keeps that session itself: the next person at the
  till who opens that browser is signed in. On a till, use a password or a PIN. If a till must sign in that way, open
  the browser session as an ephemeral one (`preferEphemeralSession` in `expo-web-browser`'s
  `openAuthSessionAsync`, on iOS), so the system browser keeps nothing.
- `expo()` hands a redirect sign-in's session cookie to the app in the redirect URL (`?cookie=`). On Android another
  app that registers the same scheme could receive it. That is Better Auth's Expo integration, not the kiosk, and on a
  till such a session is not bound, so the till ends it.
- A native app has no HTTP-only cookie: the credential and the session token sit in SecureStore, where the app's own
  code can read them.
- Under `insecureLan`, React Native refuses plain http by default. Allow the server's address in Android's network
  security configuration (`cleartextTrafficPermitted`) and in iOS's App Transport Security.

## Tables and codes

The kiosk's tables are `accessKioskDevice`, `accessKioskPin`, `accessKioskLockout` and `accessKioskRetiredSecret`, and
Better Auth's `session` gains `kioskDeviceId`, `kioskSeenAt` and `kioskPin`. `npx auth@~1.7.12 generate` writes them.
They stay closed to every request, and a credential's or a PIN's hash is a sealed column.

| Code | Status | When |
|---|---|---|
| `KIOSK_DEVICE_NOT_ENROLLED` | 401 | The request brings no current device credential |
| `INVALID_USER_OR_PIN` | 401 | A wrong PIN, a user with none, or no such user (`400` for a PIN that is not 6 to 12 digits) |
| `KIOSK_PIN_LOCKED` | 429 | The user's backoff on this device, or the device's limit; `X-Retry-After` says when |
| `KIOSK_PIN_DISABLED` | 403 | 100 wrong PINs in a row for this user on this device |
| `KIOSK_DEVICE_BUSY` | 409 | Two switches on one device at once, or a request or sign-in with the credential the last switch replaced within 30 seconds |
| `KIOSK_FULL_CREDENTIAL_REQUIRED`, `SESSION_NOT_FRESH` | 403 | Enrolling, listing, revoking or setting a PIN from a PIN session, or a session older than `freshAge` |
| `KIOSK_ENROLL_REFUSED` | 403 | `canEnrollDevice` did not answer `true` |
| `KIOSK_SESSION_NOT_ALLOWED` | 403 | A PIN session on a route it does not reach, a bound session asking for a token or managing OAuth clients or consents, or a sign-in on a till that would resume an authorization request |
| `KIOSK_DEVICE_NOT_FOUND` | 404 | Revoking a device that is not enrolled |
| `USER_NOT_FOUND` | 404 | `kioskSetUserPin` for no such user |
| `PIN_TOO_WEAK` | 400 | A PIN that is not 6 to 12 digits, or one a guesser tries first |
