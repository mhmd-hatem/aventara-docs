---
title: Kiosk mode
description: "Shared tills with the kiosk plugin: enrolling, device enrollment codes, switching by PIN, locking, approvals, LAN without TLS, Expo apps, and moving from rc.2."
order: 13
section: guides
---

# Kiosk mode

Kiosk mode is staff switching by PIN on shared devices, such as the tills of a shop. It is a Better Auth plugin of its
own, `kiosk()` from `@aventara/better-auth-kiosk`, which any Better Auth app can use. Beside Access it goes in
`betterAuth.plugins`, on the `web` profile, and Access reads what it needs of it: the kiosk's verbs reach the
framework's `$access`, a session bound to a device gets no token from Access, and the kiosk's events go to the audit
log.

```sh
npm install --save-exact @aventara/better-auth-kiosk@rc
```

1. A manager enrolls a device once.
2. After that, anyone with a PIN switches the device to themselves with their user id and PIN.
3. The session that opens is bound to that device, and locks when idle.

```ts
// src/access.kiosk.ts
import { createAccess } from "@aventara/access/auth";
import { kiosk } from "@aventara/better-auth-kiosk";
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
		plugins: [
			kiosk({
				// Who may enroll, list and revoke devices: asked with the user and session of a
				// fresh full-credential session, as Better Auth's rows.
				canEnrollDevice: ({ user }) => user.role === "admin",
				// A session on a till locks after 5 minutes without a write.
				idleTimeout: 300,
				// Who may approve what on a till, for the cashier's session there.
				canApprove: ({ approver, action }) =>
					approver.role === "admin" && action === "refund",
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
	resources: {
		// The rules grant on `User`, Better Auth's `user` table: `users: true` opens it,
		// and `session` and `account` read only (an admin's `read "*"` reads them),
		// their secret columns sealed.
		users: true,
		// Off Prisma's adapter, every table Better Auth is built with is named: the
		// kiosk's five among them.
		authTables: {
			user: "User",
			session: "Session",
			account: "Account",
			verification: null,
			jwks: null,
			kioskDevice: null,
			kioskPin: null,
			kioskLockout: null,
			kioskRetiredSecret: null,
			kioskDeviceEnrollmentCode: null,
		},
	},
});
```

Before your server listens, start Better Auth with `await access.api.ok()`: the kiosk checks Better Auth's options
then, and a refusal rejects it, so the server never serves a till it cannot protect ([below](#what-the-kiosk-refuses)).
`serve()` and `avaccess serve` do this themselves.

| Option | Takes | Default |
|---|---|---|
| `canEnrollDevice` | `({ user, session }) => boolean`, or a promise of it: who may enroll, list or revoke devices and device enrollment codes, asked with Better Auth's user and session rows of a fresh session opened with full credentials, and again for a code's issuer when a device redeems it (`session` is `undefined` then). Anything but `true` refuses. | required |
| `idleTimeout` | Seconds without a request that may change something (any method but GET, HEAD or OPTIONS) after which a session on the device locks: whole seconds from 60 to 3600 | 300 |
| `insecureLan` | The private IPv4 ranges of a till network without TLS ([below](#a-till-network-without-tls)) | none |
| `pinHasher` | `{ hash, verify, needsRehash? }`: how PINs are hashed, after they are keyed with a key derived from Better Auth's secret ([below](#pins)) | Better Auth's password hasher: under `createAccess`, argon2id at the `passwords` profile |
| `schema` | Better Auth's plugin schema override: other table or column names ([below](#tables-and-codes)) | none |
| `deviceEnrollmentCode` | `{ lifetime?, batch? }`: how long a device enrollment code is good (whole seconds from 60 to 900) and how many one call issues (1 to 10); `false` turns the code routes off ([below](#enrolling-a-device-with-a-code)) | `{ lifetime: 300, batch: 1 }` |
| `canApprove` | `({ approver, requester, session, action, subject, device }) => boolean`, or a promise of it: who may approve what on a till ([below](#supervisor-approval)), asked with Better Auth's user rows of the approver and of the user whose session asks. Anything but `true` refuses. | none: `/kiosk/approve` answers `404` |
| `approval` | `{ lifetime? }`: how long an approval may be consumed, whole seconds from 10 to 300 | `{ lifetime: 60 }` |

`canEnrollDevice` and `canApprove` are the kiosk's own and get Better Auth's rows, never Access's principal: the kiosk
works without Access, where there is no `me`. When the role lives in a table of yours (an employee's role, beside Better
Auth's user), make the callback async and look it up by the user's id, as `principal` does:

```ts
// src/access.kiosk-staff.ts
import { kiosk } from "@aventara/better-auth-kiosk";

/** A user's role on the shop floor, from your own tables, by Better Auth's user id. */
type ShopRoleOf = (userId: string) => Promise<string | undefined>;

/** Managers enroll tills; supervisors and managers approve a refund. */
export const tills = (shopRoleOf: ShopRoleOf) =>
	kiosk({
		canEnrollDevice: async ({ user }) =>
			(await shopRoleOf(user.id)) === "manager",
		canApprove: async ({ approver, action }) =>
			action === "refund" &&
			["manager", "supervisor"].includes((await shopRoleOf(approver.id)) ?? ""),
	});
```

Neither answer is cached: `canEnrollDevice` is asked on every enroll, list or revoke of devices, every issue, list or
revoke of device enrollment codes, and once more for the issuer when a device redeems a code; `canApprove` on every
approval whose PIN matched. A role you change is seen on the next call.

A value `kiosk()` cannot run with is refused when it is called, with `KIOSK_OPTIONS_INVALID` (on the error's `code`).
`createAccess` refuses the kiosk under the `service` profile (`ACCESS_OPTIONS_INVALID`): a service hands no caller a
session, and a kiosk is made of them. `profile: { kind: "kiosk" }` is gone: it is refused with a sentence that names
the plugin.

## What the kiosk refuses

Each of these is a way around the device binding, so the kiosk refuses it with `KIOSK_OPTIONS_INVALID` when Better
Auth builds its context: the first request, or `await access.api.ok()` before your server listens (`createAccess` itself builds nothing;
`serve()` and `avaccess serve` start Better Auth before they listen, and refuse to start). Until then every request to
Better Auth fails, and the refusal is logged once, through Better Auth's logger as you configured it (`logger.disabled`
silences it):

| Refused | Why |
|---|---|
| Better Auth's memory adapter (`memoryAdapter`, or no `database`, which Better Auth runs on it) | It enforces no unique index, and the PIN limits and single-use credentials rest on the kiosk tables' unique columns ([Tables and codes](#tables-and-codes)) |
| Better Auth's cookie cache (`session.cookieCache`) | A locked or revoked session must end at once; the cookie would keep answering it |
| `secondaryStorage` without `session.storeSessionInDatabase: true` | The kiosk finds a device's sessions in the database to end them |
| `bearer()` without `requireSignature: true`, or listed after `kiosk()` | Unsigned, it takes the raw session token Better Auth stores and lists as a credential; listed after, its `set-auth-token` would be set after the kiosk's last word on an `auth.api` call. Signed and listed before, it is a native till's session transport ([A till that is a native app](#a-till-that-is-a-native-app-headers)). A plugin under another id that sets `set-auth-token` (a renamed `bearer()`) has it stripped from every answer, unless `bearer()` itself is installed and the answer is a native till's header call that sets the same session cookie |
| `multiSession()` | The browser would keep the session before a switch and switch back to it |
| Better Auth's own `jwt()` without `disableSettingJwtHeader: true`, where the kiosk runs without Access | It would hand page code a bound session's JWT on every `/get-session`. `GET /token` refuses a bound session |
| `oneTimeToken({ setOttHeaderOnNewSession: true })` | It would hand page code a one-time token of every new session, a bound one's included |
| `deviceAuthorization()`, and the OAuth provider's `oauthDeviceAuthorization()` | The device flow hands the device that showed a code a session of its own. Run it on another Better Auth instance |
| `@better-auth/electron`, by its id or by its exchange's paths (any plugin serving `/electron/transfer-user` or `/electron/token`) | It turns a session, or a sign-in on the device, into a one-time code that opens a session wherever it is redeemed. Served under another id at other paths, its code is refused on any request from an enrolled device, and its cookies, known by what they hold whatever their names, are expired on every answer to one |
| `advanced.database.generateId: "serial"` (`createAccess` refuses it too) | Better Auth's single-use checks are off under numeric ids, and several spellings name one user |
| `advanced.database.generateId: false`, or the earlier `advanced.generateId: false` (`createAccess` refuses them too) | The database would make the ids, which the kiosk does not support. A `generateId` function is not checked |
| `advanced.disableOriginCheck` and `advanced.disableCSRFCheck`; the same checks off in Better Auth's context (another plugin's `init`), but `@better-auth/sso`'s SAML paths; Better Auth's test mode (`TEST` set outside NODE_ENV=test); a trusted origin whose host is a wildcard alone (`"*"`, `"http://*"`) (`createAccess` refuses them too) | A page on any site could post a PIN switch or a device's request on the till's cookies. List the app's other origins in `trustedOrigins` instead; a wildcard there is warned of outside `NODE_ENV=production` ([Trusted origins and wildcards](/docs/hosts#trusted-origins-and-wildcards)). Under NODE_ENV=test, Better Auth's default stands |
| `advanced.crossSubDomainCookies`, and `SameSite=None` on any cookie | The credential and the sessions would reach other hosts, or come from other sites |
| A plain http: base URL, except on a loopback host or on an address `insecureLan` lists; a dynamic `baseURL` without `protocol: "https"`, unless every allowed host is a loopback host | The credential, the sessions and the PINs would cross an open network in the clear |
| Another plugin with an endpoint under `/kiosk/`, an endpoint marked for PIN sessions at a path another endpoint (Better Auth's own included) also has, a kiosk table named as one of the app's tables, or two fields in one column | It would answer for a PIN switch, open another endpoint to PIN sessions, or mix rows and columns |
| With `canApprove`: the onboarding plugin with facts of a version the kiosk does not read, or two plugins with its id | An approval asks it whether the approver has finished onboarding |

A plugin's `init` can add options after the kiosk has read them, so the kiosk checks the options once more before it
answers its first request. A refusal found then answers every request with `500 KIOSK_OPTIONS_INVALID` and the same
sentence. `await access.api.ok()` is such a first request, and `serve()` and `avaccess serve` make it before they
listen, so they refuse to start the same way.

## The verbs and routes

The routes sit under Better Auth's base path. `access.client.verbs` publishes a verb for each, after Better Auth's, when
it finds the plugin in `betterAuth.plugins`, and the framework's `$access` takes them as optional verbs. Better Auth's
client calls them through `kioskClient()` from `@aventara/better-auth-kiosk/client` (`authClient.kiosk.switchUser`).

| Verb | Route | Arguments | Result | Who |
|---|---|---|---|---|
| `enrollDevice` | `POST /kiosk/enroll-device` | `name` | `device: { id, name }` | A fresh full-credential session `canEnrollDevice` allows |
| `revokeDevice` | `POST /kiosk/revoke-device` | `deviceId` | `success` | The same |
| `setPin` | `POST /kiosk/set-pin` | `pin` | `success` | A fresh full-credential session, for its own user |
| `switchUser` | `POST /kiosk/switch-user` | `userId`, `pin` | `user: { id }` | An enrolled device |
| `lock` | `POST /kiosk/lock` | none | `success` | An enrolled device |

`GET /kiosk/list-devices` answers a manager with `devices: [{ id, name, enrolledBy, enrolledAt, lastSwitchAt? }]`,
never a credential. `POST /kiosk/change-pin` (`userId`, `pin`, `newPin`) replaces a PIN on an enrolled device
([below](#pins)), and `POST /kiosk/approve` (`userId`, `pin`, `action`, `subject?`) answers a supervisor's approval
([below](#supervisor-approval)). They are routes only: call them from the device, or through `kioskClient()`
(`authClient.kiosk.changePin`, `authClient.kiosk.approve`).

Call the verbs' routes from the device, or their `call` from your server. A `call` of `switchUser`, `lock` or
`enrollDevice` sets the session cookie and the device's credential through your cookie plugin (`nextCookies()` in a
Server Action). Without one, the browser keeps the credential the switch replaced, and the device's next switch is
refused as a copy: call the route from the device instead. A till that is a native app
([below](#a-till-that-is-a-native-app-headers)) always calls the routes itself: a `call` of `switchUser` or
`enrollDevice` with its headers (`Authorization` or `kiosk-device`) is refused `400` before it runs, since its answer
would hand the till new credentials in headers that a server's `call` does not pass on.

Without the plugin there is no PIN route: each answers `404`.

## Your server's own calls

No route opens these:

```ts
// src/kiosk.admin.ts
import { kioskOf } from "@aventara/better-auth-kiosk";
import { access } from "./access.kiosk.js";

/** The kiosk's operator API, over the instance `createAccess` built. */
const kiosk = kioskOf(access);

/** The enrolled tills, for a manager's screen your app guards. */
export const tills = () => kiosk.listDevices();

/** Takes a till out of service, ending every session on it. */
export const retireTill = (deviceId: string) => kiosk.revokeDevice(deviceId);

/** Gives a member of staff with no password a PIN, which they replace at the till before it opens a session. */
export const givePin = (userId: string, pin: string) => kiosk.setUserPin(userId, pin);

/** A device enrollment code for a tablet to be named `name`, issued for a manager `canEnrollDevice` allows. */
export const codeFor = (managerId: string, name: string) =>
	kiosk.issueDeviceEnrollmentCode({ issuedBy: managerId, name });
```

| Call | Does |
|---|---|
| `kioskOf(auth).listDevices()` | The enrolled devices, as `GET /kiosk/list-devices` answers them (dates as `Date`) |
| `kioskOf(auth).revokeDevice(deviceId)` | Revokes a device, ending every session on it; `false` when there is none |
| `kioskOf(auth).setUserPin(userId, pin)` | Sets anyone's PIN, for staff who have no password, marked to be changed before it opens a session; `PIN_TOO_WEAK` or `USER_NOT_FOUND` when it cannot |
| `kioskOf(auth).issueDeviceEnrollmentCode({ issuedBy, name, count? })` | Issues `codes: [{ id, code, name, expiresAt }]` for a manager; `KIOSK_ENROLL_REFUSED` when `canEnrollDevice` does not pass for `issuedBy` |
| `kioskOf(auth).listDeviceEnrollmentCodes()`, `revokeDeviceEnrollmentCode(codeId)` | The codes not redeemed yet (never a code itself); revoking answers `false` when there is no such code |
| `kioskOf(auth).consumeApproval({ headers, approvalId, action, subject? })` | Consumes a supervisor's approval once ([below](#supervisor-approval)): `{ approverId, requesterId, deviceId }`, or `KIOSK_APPROVAL_INVALID` |

`kioskOf` takes the instance `createAccess` built, or a Better Auth instance with `kiosk()` in its plugins.

## Enrolling, switching and locking

- **A fresh full-credential session** is one opened with a password (or any sign-in but a PIN) within Better Auth's
  `session.freshAge`, one day by default. An API key of the user counts too, under `enableSessionForAPIKeys`: a key
  acts as its owner everywhere. A PIN session never enrolls, lists, revokes or sets a PIN, and neither does a session
  an admin impersonates (Better Auth's `admin()`, `403 KIOSK_FULL_CREDENTIAL_REQUIRED`), which proves nothing of the
  user.
- **Enrolling** gives the device its credential: 32 random bytes in an HTTP-only cookie, kept 400 days, always
  `SameSite=Lax`. On an https base URL it is `__Host-better-auth.kiosk_device`. Enrolling ends the session that
  enrolled it, so the device starts locked. Enrolling a device again revokes the old enrollment first.
- **A switch** checks the device's credential, then the PIN. A right one ends every session on the device, and opens a
  new one for the user named, with that user's own claims. The device's credential is replaced in the same answer, so a
  copy of the old one is spent. The audit log records a `kiosk-switch`.
- **An admin's impersonation.** A switch, a lock, an enrollment, a redeemed enrollment code, and the end of an
  impersonated session on a till (idle, or brought without the device's credential) also end the session Better
  Auth's admin plugin keeps in its impersonation cookie (`admin_session`: the admin's own, its token readable on
  the till) and expire the cookie, at the path the admin plugin set it with. An admin impersonating on a browser of
  their own is not touched.
- **Lock** ends the same sessions and keeps the device enrolled. A session idle for `idleTimeout` is ended on its next
  request, as if locked. Only a request that may change something (any method but GET, HEAD or OPTIONS, through
  Better Auth's routes or through the framework) counts as use: a page left open that keeps reading, such as Better
  Auth's client polling `/get-session`, does not keep the session alive.
- **Revoking** a device ends every session on it at once. Nothing is pushed to the till: it learns on its next
  request, which finds no session, and its next switch is refused `KIOSK_DEVICE_NOT_ENROLLED`.

## Enrolling a device with a code

A tablet can be enrolled without a manager's password typed on it, as a POS enrolls a till from a QR:

1. On the manager's own screen, a fresh full-credential session that `canEnrollDevice` allows calls
   `POST /kiosk/issue-device-enrollment-code` with the device's `name` (`authClient.kiosk.issueDeviceEnrollmentCode`),
   or your server calls `kioskOf(access).issueDeviceEnrollmentCode`. The answer holds the code, `avk_enroll_` and 256
   random bits, once; only its SHA-256 is stored.
2. The app shows the code with what else the tablet needs, such as the server's address, as a QR. What the QR holds is
   the app's choice.
3. The tablet calls `POST /kiosk/redeem-device-enrollment-code` with the code (`authClient.kiosk.redeemDeviceEnrollmentCode`).
   It is enrolled under the code's issuer, named as the code was, and locked: no session opens, no token is answered,
   and any session the request carried ends. A `trust_device` cookie and an OAuth popup marker the browser held are
   expired, and a device enrolled already is revoked first.
4. Staff switch on it by PIN.

| Route | Body | Answers | Who |
|---|---|---|---|
| `POST /kiosk/issue-device-enrollment-code` | `name`, `count?` | `codes: [{ id, code, name, expiresAt }]` | A fresh full-credential session `canEnrollDevice` allows |
| `GET /kiosk/list-device-enrollment-codes` | none | `codes: [{ id, name, issuedBy, expiresAt }]` | The same |
| `POST /kiosk/revoke-device-enrollment-code` | `codeId` | `success` (`false` when there was no such code) | The same |
| `POST /kiosk/redeem-device-enrollment-code` | `code` | `device: { id, name }` | Anyone with the code |

- **Single use.** Of any number of redemptions of one code at once, one enrolls a device. A code is good for
  `deviceEnrollmentCode.lifetime`, five minutes by default. `count` issues up to `deviceEnrollmentCode.batch` codes in
  one call, each single-use.
- **The issuer is asked again.** At redemption `canEnrollDevice` must still pass for the code's issuer, asked with
  `session: undefined`. A manager demoted, deleted, or banned by Better Auth's `admin()` since leaves dead codes.
- **One answer.** An unknown, used, revoked or expired code, and one whose issuer no longer passes, all answer
  `401 KIOSK_DEVICE_ENROLLMENT_CODE_INVALID`. Better Auth's rate limit, when it is on (in production by default),
  holds a redeeming address to 10 tries a minute.
- **No confirm step.** If a photographed code is redeemed first, the real tablet gets
  `KIOSK_DEVICE_ENROLLMENT_CODE_INVALID`: list the devices and revoke the extra one.
- **No code from a PIN session.**
- **On a till network without TLS** the code crosses the network in the clear, as PINs do.

The audit log gets the device's `kiosk-device` (`enrolled`, by the issuer), and each code issued, redeemed, revoked or
refused (`enrollment-code-issued`, `-redeemed`, `-revoked`, `-refused`), by its id, never with the code
([With Access](#with-access)).

## Supervisor approval

A supervisor approves an action on the cashier's till without signing the cashier out, such as a refund the cashier's
rules do not allow. On the till, in the cashier's session, the supervisor types their user id and PIN, and the till
calls `POST /kiosk/approve` with them, the `action` and its `subject` (`authClient.kiosk.approve`). The answer,
`approval: { id, approverId, action, expiresAt }`, goes with the refund request to your server, which consumes it
before it writes:

```ts
// src/refund.approval.ts
import { kioskOf } from "@aventara/better-auth-kiosk";
import { access } from "./access.kiosk.js";

/**
 * Before a refund the cashier's rules do not allow alone: the supervisor's approval,
 * consumed once, from the headers of the till's own request. It throws Better Auth's
 * `APIError` (409, `error.body.code` `KIOSK_APPROVAL_INVALID`) unless this session on
 * this till was given it for a refund of this order.
 */
export const approvedBy = async (
	headers: Headers,
	orderId: string,
	approvalId: string,
) => {
	const { approverId } = await kioskOf(access).consumeApproval({
		headers,
		approvalId,
		action: "refund",
		subject: orderId,
	});
	return approverId;
};
```

The consume is the approval. A page that checks for an approval id and never calls `consumeApproval` on the server
approves nothing: anyone can send an id, and only the consume checks it. An approval is not yet a condition of an
Access rule: consume it in the code that writes.

- **Who asks.** The till's current credential and a session bound to it, a PIN session or a password one
  (`401 UNAUTHORIZED` without one), not one an admin impersonates (`403 KIOSK_APPROVAL_REFUSED`: she could approve
  her own request). The cashier's session stays, and the device's credential is not replaced. `canApprove` gets the
  session's row as `session`, without its token.
- **Who approves.** The PIN is checked under the switch's limits ([below](#pins)): a wrong one counts for the
  supervisor on this device and for the device, a right one clears the supervisor's failed PINs here. The supervisor may
  not be the session's user, whatever `canApprove` says; must have verified their email under
  `requireEmailVerification`; must not be banned by Better Auth's `admin()` (`banExpires` honoured); must have finished
  onboarding when `@aventara/better-auth-onboarding` is installed; and `canApprove` must answer `true`. A refusal
  answers `403 KIOSK_APPROVAL_REFUSED` (`EMAIL_NOT_VERIFIED` for the email, `KIOSK_PIN_CHANGE_REQUIRED` for a PIN
  someone else set).
- **Bound.** The approval sits in Better Auth's `verification` table under an identifier that keys its id with the
  session that asked, the action and the subject (HMAC-SHA-256, with a key derived from Better Auth's secret). A consume from another session, or for another action or subject,
  finds nothing and leaves it as it was. A switch or a lock ends that session, and its approvals with it. The id is not
  a secret: without that session on that till it is worth nothing.
- **What `subject` names** is what the approval is for, as precisely as the write: for a refund or a discount, the
  order and the amount (`order-17:12.50`) or a hash of the cart, so an approval of a small refund is no approval of a
  large one.
- **Once, and briefly.** One of any number of consumes at once wins; an approval lives `approval.lifetime`, 60 seconds
  by default.
- **The headers** are the till's own request's: its session cookie and the device's credential. The consume reads the
  session through Better Auth's API, so a session that came without its device's credential is ended there, as
  everywhere, and consumes nothing.

The audit log records each approval granted, refused and consumed (`approval-granted`, `-refused`, `-consumed`): who
approved, for whose session, on which device, the action and the subject. A refused one names its approver by a keyed
hash of their id, never the id. A wrong PIN is a refused sign-in on `/kiosk/approve`.

## PINs

A PIN is 6 to 12 digits. It is refused when it is set (`400 PIN_TOO_WEAK`) if a guesser would try it first: repeated
digits or blocks, alternating digits, palindromes, straight runs, doubled digits, keypad lines, and the most common
6-digit PINs of leaked passwords. Dates are not refused. A PIN is keyed (HMAC-SHA-256, with a key derived from Better Auth's secret by HKDF), then
hashed by Better Auth's password hasher (under `createAccess`, argon2id at the `passwords` profile) unless `pinHasher`
says otherwise, and never stored, logged or answered. The PIN table alone is then not enough to guess PINs offline. A
PIN is hashed again at its user's next right PIN when it was keyed with an older secret, or when
`pinHasher.needsRehash` says its hash is outdated, written only while the row still holds the hash just checked.
Changing the app's `emailAndPassword.password` hook changes the PIN hasher too, and nothing is hashed again without
`needsRehash`. Setting a PIN clears its user's failed PINs.

Rotate Better Auth's secret through its `secrets` (`[{ version: 2, value: newSecret }, { version: 1, value: oldSecret
}]`): a PIN keyed with a version still listed keeps working, and is keyed with the current one at its next right entry.
Moving from a plain `secret` to `secrets` keeps PINs too, while `secret` stays set beside them. Changing a plain
`secret`, or dropping a version some PINs still use, makes those PINs fail as wrong ones: give those users new PINs.

A PIN given with `kioskOf(auth).setUserPin` is marked to be changed. At the switch, the right PIN answers
`403 KIOSK_PIN_CHANGE_REQUIRED` and opens no session; the till calls `POST /kiosk/change-pin` with the user's id, that
PIN and a new one, and the user switches with the new one. Only someone who typed the right PIN learns that it must
change, and wrong PINs there count against the limits below. A user changes their own PIN on a till the same way, from
their own PIN session there.

What protects a PIN:

| Limit | What happens |
|---|---|
| Per user, on one device | 5 wrong PINs free, then one try per backoff that doubles from 1 minute to 1 hour (`429 KIOSK_PIN_LOCKED`). After 100 in a row, the PIN stops working on that device (`403 KIOSK_PIN_DISABLED`). Other devices are not affected, and a full sign-in or a new PIN clears both. The account itself is never locked. |
| Per device | 10 wrong PINs at once, for any users, then one more every 90 seconds. A user with no wrong PIN on the device since their last right one still gets one try while it is held, so one person cannot lock everyone out of a till. |

The counts are kept in the database before the PIN is checked, so parallel guesses cannot all pass one reading. They
are kept for any user id, whether it holds a PIN or names no user, and a user id with no PIN costs the same hash
check as one with a PIN, so no answer tells who holds a PIN. An admin's impersonation is not a full sign-in: it clears
nothing.

## How a session is bound to its device

- Every session opened on an enrolled device is bound to it: a PIN switch's, and a password sign-in's on the device
  too. A bound session is held to the idle timeout, and is issued no token: `GET /token`, `/one-time-token/generate`,
  `/api-key/create`, the device flow's `/device/*` and `@better-auth/electron`'s `/electron/*` (whatever plugin serves
  them) refuse it. No answer on an enrolled device carries a session's
  token (a sign-in's `token`, `session.token`, a session list's tokens, an `access_token`), no answer carries
  `set-auth-jwt` or `set-ott`, none but a native till's header call carries `set-auth-token` or `set-kiosk-device`, and an enrolled device is refused passkey registration, two-factor's
  `trustDevice` and the OAuth popup's start (enrolling expires a `trust_device` cookie and an OAuth popup marker the
  browser held). Do not turn a token you find
  in an answer into a cookie. A sign-in that brings the credential the last switch replaced, within 30 seconds of
  it, is refused `409 KIOSK_DEVICE_BUSY`, as every kiosk route refuses it.
- On every call that carries a session, a bound session is ended unless the request brings its device's current
  credential. A session copied to another browser is no session there, and no longer one on the device it came from.
  A session bound to no device, brought with an enrolled device's credential, is ended the same way.
- Every credential a switch replaced is kept as a hash for 400 days. Any of them brought back revokes the device with
  every session on it. The one exception is the credential the last switch replaced, within 30 seconds of it: that is a
  double tap, refused `409 KIOSK_DEVICE_BUSY` with the device left as it is.
- A PIN session reaches only `/get-session`, `/sign-out`, `jwt()`'s key set (`/jwks`, or its `jwks.jwksPath`),
  `/kiosk/switch-user`, `/kiosk/lock`, `/kiosk/change-pin`, `/kiosk/approve`, the routes that sign in with full
  credentials, and an endpoint whose `metadata` carries `{ "aventara-kiosk": { pinSession: true } }`, as Access's `/me` does. Any other is refused `403 KIOSK_SESSION_NOT_ALLOWED`.
- With `mcp` or `audience`, a bound session is refused at the OAuth provider's authorization routes, and at its routes
  that manage clients and consents (`/oauth2/create-client`, `/oauth2/get-consents` and the like). A sign-in on an
  enrolled device that carries an authorization request to resume opens no session there, whether the request came in
  the body (the login page's `oauth_query`) or in a social sign-in's state, begun elsewhere. An agent is authorized
  from a manager's own browser, off the till.

An API key (`@better-auth/api-key` with `enableSessionForAPIKeys`) is not bound: it acts as its owner everywhere, a
till included, outside the device binding and the idle lock. It counts as full credentials too: a key of a user
`canEnrollDevice` allows sets that user's PIN and manages devices and enrollment codes. A key is its owner's secret:
keep it as a password, and never type one into a till. A ban does not stop it on Better Auth's own routes: see
[When someone leaves](/docs/create-access#when-someone-leaves).

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
import { kiosk } from "@aventara/better-auth-kiosk";
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
		plugins: [
			expo(),
			kiosk({
				canEnrollDevice: ({ user }) => user.role === "admin",
				insecureLan: ["192.168.1.0/24"],
			}),
		],
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
	resources: {
		// The rules grant on `User`, Better Auth's `user` table: `users: true` opens it,
		// and `session` and `account` read only (an admin's `read "*"` reads them),
		// their secret columns sealed.
		users: true,
		// Off Prisma's adapter, every table Better Auth is built with is named: the
		// kiosk's five among them.
		authTables: {
			user: "User",
			session: "Session",
			account: "Account",
			verification: null,
			jwks: null,
			kioskDevice: null,
			kioskPin: null,
			kioskLockout: null,
			kioskRetiredSecret: null,
			kioskDeviceEnrollmentCode: null,
		},
	},
});
```

- **A range** is an IPv4 CIDR written in full, with its host bits clear (`192.168.1.0/24`, or `192.168.1.10/32` for the
  server alone). It is a /16 or narrower and lies wholly inside 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16. A
  hostname, an IPv6 range, any other range, an empty list, a range listed twice and a range inside another listed one
  are refused with `KIOSK_OPTIONS_INVALID`. A hostname or a missing prefix length is a type error first.
- **The base URL** is http: on an IPv4 address inside a listed range, never a hostname and never IPv6, written in
  dotted decimal as the browser reads it: under `createAccess`, `http://192.168.01.10` or `http://3232235786` is
  refused (`ACCESS_OPTIONS_INVALID`), naming the form to write, so the address you read is the one used. Without
  Access the plugin cannot see the written form (Better Auth writes its base URL as the URL parser reads it before any
  plugin starts) and checks the address the browser uses. A range's
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

### Client addresses

Better Auth's rate limit, and the address it records on each session, read the client's address from a request header
only: `x-forwarded-for` by default (`advanced.ipAddress.ipAddressHeaders`). Tills that reach the server directly send no
such header, so every request to a path shares one bucket: one tablet's ten wrong device enrollment codes hold back
every till's redemption for a minute. And without `advanced.ipAddress.trustedProxies`, Better Auth takes a single-value
`x-forwarded-for` as the client wrote it: a device on the network can spend another till's bucket, or write a new
address with each try and never be held back. Put a reverse proxy in front of the server that writes the header from
the connection's address (replacing the client's), let only the proxy reach the server, and name it in
`betterAuth.advanced.ipAddress`: `{ ipAddressHeaders: ["x-forwarded-for"], trustedProxies: ["192.168.1.10"] }`. Tills
behind one shared address still share a bucket.

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

## A till that is a native app (headers)

A till can also be a native app that keeps no cookie jar: a Capacitor or Cordova WebView, an Electron app's main
process, a native HTTP client. Its PIN session travels in `Authorization: Bearer`, read by Better Auth's own
`bearer()`, and its device credential in a `kiosk-device` header. Answers hand them back in `set-auth-token`
(`bearer()`'s) and `set-kiosk-device`. A PIN switch rotates the device credential, so its answer carries both.

### The server

Put `bearer({ requireSignature: true })` in `plugins` before `kiosk()`. The kiosk refuses `bearer()` without
`requireSignature: true` (Better Auth stores and lists the raw session token, and an unsigned bearer would take it as
a credential) and `bearer()` listed after `kiosk()` (its `set-auth-token` would be set after the kiosk's last word on a
call of `auth.api`). With the onboarding plugin, list `onboarding()` first, then `bearer()`, then `kiosk()`.

```ts nest
// src/auth.native-till.ts
import { kiosk } from "@aventara/better-auth-kiosk";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { Pool } from "pg";

export const auth = betterAuth({
	database: new Pool({ connectionString: process.env.DATABASE_URL }),
	baseURL: "https://192.168.1.10:3443",
	// Only for a password sign-in typed in a WebView till (Better Auth checks its Origin). An app-unique scheme and
	// host, never capacitor://localhost, and never the server's own host.
	trustedOrigins: ["capacitor://till.example", "app://till"],
	plugins: [
		bearer({ requireSignature: true }),
		kiosk({ canEnrollDevice: ({ user }) => user.role === "manager" }),
	],
});
```

A WebView calls the server cross-origin, so the server answers CORS for the app's origins: the two request headers
allowed, the two answer headers exposed, and no credentials (no cookie is sent). Browsers on your web origins still
get credentialed CORS. Answer both from one `enableCors`, in place of the scaffold's in `src/main.ts`
([Hosts](/docs/hosts)): a second `enableCors` adds a second CORS middleware, which answers every preflight before the
other is reached. The native origins are the ones `trustedOrigins` lists.

```ts nest
// src/till.cors.ts
import type { IncomingMessage } from "node:http";
import type { INestApplication } from "@nestjs/common";

/** The native tills' own origins: app-unique, and the ones `trustedOrigins` lists. */
const NATIVE_TILL_ORIGINS = ["capacitor://till.example", "app://till"];

/**
 * The server's one CORS setup, called in `src/main.ts` in place of the scaffold's
 * `app.enableCors(...)` (on Express): the web origins in CORS_ORIGINS with
 * credentials, the native tills' without, with their two headers.
 */
export const tillCors = (app: INestApplication): void => {
	const webOrigins = (process.env.CORS_ORIGINS ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	app.enableCors(
		(
			request: IncomingMessage,
			done: (error: Error | null, options: object) => void,
		) => {
			const origin = request.headers.origin;
			if (origin !== undefined && NATIVE_TILL_ORIGINS.includes(origin)) {
				done(null, {
					origin,
					allowedHeaders: ["content-type", "authorization", "kiosk-device"],
					exposedHeaders: ["set-auth-token", "set-kiosk-device"],
					credentials: false,
				});
				return;
			}
			done(null, {
				origin: webOrigins.length > 0 ? webOrigins : false,
				credentials: true,
			});
		},
	);
};
```

### Which calls are header calls

Each call is read one way, decided once from the request as the client sent it:

- With no signed `bearer()` before the kiosk, every call is a cookie call: `kiosk-device` is not read.
- A request that brings `kiosk-device` and a kiosk cookie (the device cookie, or Better Auth's session cookie with
  another value than the `Authorization` bearer) is refused `400 KIOSK_DEVICE_CREDENTIAL_CONFLICT`, with both cookies
  expired. Behind it, a retired `kiosk-device` revokes its device, and so does a retired device cookie, unless the
  header is that same device's current credential (a jar that missed a rotation). Every such answer is the same.
- A request with a kiosk cookie is a cookie call.
- So is one a browser marks as a page of the app's own site: `Sec-Fetch-Site` `same-origin` or `same-site`,
  `Origin: null`, or an `Origin` (or, with none, a `Referer`) on the server's host, whatever its scheme or port.
- Anything else is a header call: a cross-host `Origin` (`capacitor://till.example`, `app://till`) or no browser
  signal at all (native HTTP).

Serve a browser till's page from the server's own host. The test is the host, not the site: a page on another host
of the same site (`pos.example.com` calling `api.example.com`) is a cookie call only when the browser sends
`Sec-Fetch-Site: same-site`, which it does not over plain http (`insecureLan`) or in Safari before 16.4. Such a page's
redeem or first sign-in is then a header call, and its answer hands `set-kiosk-device` to page code wherever your CORS
lets that page read it.

Other cookies (a load balancer's, the app's own) are ignored. A header call's answer sets no device cookie, and keeps
`set-auth-token` only when it is `bearer()`'s copy of the session cookie the same answer sets. A cookie call's answer
never carries `set-auth-token` or `set-kiosk-device`. `set-auth-jwt` and `set-ott` are never sent. A `kiosk-device`
header sent on a cookie call is ignored, and a kiosk route answers `401 KIOSK_DEVICE_NOT_ENROLLED`, naming the
conditions above.

| Request | `Authorization` | `kiosk-device` |
|---|---|---|
| Redeem an enrollment code | none | none |
| A manager's password sign-in on a till not enrolled yet | none | none |
| `enroll-device` | `Bearer <manager's token>` | none |
| `switch-user` | `Bearer <previous>`, if any | the credential |
| `lock`, `change-pin`, `approve`, `get-session`, `sign-out` | `Bearer <token>` | the credential |
| Your API (Access's state, `/me`) | `Bearer <token>` | the credential |

A bound session sent without `kiosk-device` is ended, as a copied cookie is.

### The client

Attach both headers at send time, to the till's own server only, and keep what answers hand back. Store
`set-kiosk-device` first: a switch whose rotated credential is lost revokes the till on its next call.

```ts nest
// src/till.client.ts
import { kioskClient } from "@aventara/better-auth-kiosk/client";
import { createAuthClient } from "better-auth/client";

/** Keychain or Keystore backed (Electron: `safeStorage`), excluded from backups; never `localStorage`. */
declare const vault: {
	get(key: "session" | "device"): string | undefined;
	set(key: "session" | "device", value: string): Promise<void>;
	delete(key: "session" | "device"): Promise<void>;
};

const API = new URL("https://192.168.1.10:3443").origin;

/** The credentials go to the till's own server only, never to a CDN, a payment provider or analytics. */
const ours = (url: string | URL) => new URL(url, API).origin === API;

const attach = (url: string | URL, headers: Headers) => {
	if (!ours(url)) {
		return;
	}
	const session = vault.get("session");
	const device = vault.get("device");
	if (session) {
		headers.set("authorization", `Bearer ${session}`);
	}
	if (device) {
		headers.set("kiosk-device", device);
	}
};

const keep = async (url: string | URL, response: Response) => {
	if (!ours(url)) {
		return;
	}
	const device = response.headers.get("set-kiosk-device");
	if (device) {
		await vault.set("device", device);
	}
	const session = response.headers.get("set-auth-token");
	if (session) {
		await vault.set("session", session);
	}
};

export const tillClient = createAuthClient({
	baseURL: `${API}/api/auth`,
	plugins: [kioskClient()],
	fetchOptions: {
		credentials: "omit",
		onRequest: (context) => {
			attach(context.url, context.headers);
			return context;
		},
		onResponse: async (context) => {
			await keep(context.request.url, context.response);
		},
	},
});

/** The till's calls to your API: the headers attached when the request is sent, never stored with it. */
export const tillFetch = async (input: string | URL, init: RequestInit = {}) => {
	const headers = new Headers(init.headers);
	attach(input, headers);
	const response = await fetch(input, { ...init, headers, credentials: "omit" });
	await keep(input, response);
	return response;
};

export const signOutTill = async () => {
	await tillClient.kiosk.lock();
	await vault.delete("session");
};
```

- **No cookie jar.** A client that stores the session's `Set-Cookie` (CapacitorHttp with its cookies on, an Electron
  session) sends it back beside `kiosk-device` and gets `400 KIOSK_DEVICE_CREDENTIAL_CONFLICT`; the answer expires the
  cookies, so the next call works, but every switch costs one failed call. Turn the jar off.
- **Retry once on `409 KIOSK_DEVICE_BUSY`.** A call sent while a switch rotates the credential is refused that way,
  inside Access's state too (the framework call fails rather than reading nobody). Serialize calls around a switch.
- **Never replay stored headers.** An offline queue that keeps a request's headers, or a vault restored from a backup,
  sends a retired credential later, and that revokes the till. Attach the headers at send time, and exclude the vault
  from backups.
- **An app-unique origin.** `capacitor://localhost` and `https://localhost` are every Capacitor app's origins: give the
  app its own scheme or host (Capacitor's iOS scheme setting and its `server.hostname`), and never the server's own host, which
  would make its calls cookie calls. Prefer enrollment codes to a manager's password typed in a WebView.
- **Fetch Metadata from the HTTP stack.** Better Auth checks the `Origin` of a redeem and of a sign-in whenever the
  request carries Fetch Metadata, and some native stacks add it on their own (Node's `fetch` sends
  `Sec-Fetch-Mode: cors`). Without an `Origin` such a request is refused `403 MISSING_OR_NULL_ORIGIN`: send the app's
  own origin (`app://till`), listed in `trustedOrigins`.
- **Electron.** Make the calls from the main process (`net.fetch`), keep both values encrypted with `safeStorage` and
  refuse to start when it has no OS keyring to use (its plain-text fallback on Linux); the renderer gets IPC actions only. A renderer on `file://`
  sends `Origin: null`, which is a cookie call. Check that your `net.fetch` setup sends no cookie and no
  `Sec-Fetch-Site: same-origin` before you rely on it.
- **Proxies and logs.** Keep `authorization` and `kiosk-device` out of request logs.
- **Your server's own reads.** `kioskOf(auth).consumeApproval({ headers: request.headers, ... })` reads the till's
  headers as they came, so a route that copies only the `cookie` header must forward `authorization` and
  `kiosk-device` too. A nested `auth.api.getSession({ headers: ctx.headers })` inside an endpoint is fine: the kiosk
  tells `bearer()`'s own copy of the token from a cookie.
- **A plugin that answers early.** A plugin listed before the kiosk whose `onResponse` answers stops the ones after it,
  so the kiosk's last strip of an answer does not run, and its internal mark reaches the client. Keep such plugins
  after the kiosk.

A native till's secrets are as exposed as Expo's: the app's own code can read them. A session token stolen alone is
ended at its next use off the device; a device credential stolen alone needs a PIN, and the real till's next call after
a switch made with it revokes the device.

## With Access

Access imports nothing of the plugin. It finds it in `betterAuth.plugins` (or Better Auth's plugins under
`aventaraAccess()`) by its id, `aventara-kiosk`, and reads its facts.

- **Rules read the session's kiosk facts** ([below](#the-sessions-kiosk-facts-in-the-rules)).
- **No token for a bound session.** Access's `jwt()` issues none to a session bound to a device (`GET /token`,
  `set-auth-jwt`), and its token verifiers take none issued in one. An agent is authorized from a manager's own
  browser, off the till.
- **The `service` profile** refuses the plugin (`ACCESS_OPTIONS_INVALID`): a service hands no caller a session, and a
  kiosk is made of them. Facts of a version this Access does not read are refused with `ACCESS_KIOSK_UNSUPPORTED`:
  install the matching releases.
- **The framework's `$access` verbs** (`switchUser`, `lock`, `setPin`, `enrollDevice`, `revokeDevice`) keep working at
  the same routes. Device enrollment codes and approvals are called through `kioskClient()`.
- **`GET /me`** is within a PIN session's reach.
- **The audit log** records the kiosk's events with `audit` on: `kiosk-switch`, `kiosk-lock`, `kiosk-device`,
  `kiosk-pin`, a wrong PIN as a `sign-in-failed`, and the device enrollment codes' and approvals' events
  ([The audit log](/docs/audit-log)). With `audit: true` the table gains nullable columns for them.
- **The plugin's hash columns are sealed** for `resources`, whatever the tables are called.

### The session's kiosk facts in the rules

`policies.claimsOf({ user, session })` sees the session row, with `kioskDeviceId` (the device it is bound to) and
`kioskPin` (a PIN opened it). Declare the claim, return it with every other claim, and grant on the positive fact, as
"a PIN session refunds at most 50" would:

```ts
// src/access.kiosk-claims.ts
import { definePolicies } from "@aventara/access";
import { type AccessIdentity, createAccess } from "@aventara/access/auth";
import { kiosk } from "@aventara/better-auth-kiosk";
import { Pool } from "pg";
import { model } from "./generated/aventara/discovery.artifact.js";

const claims = { role: "string", banned: "boolean", kioskPin: "boolean" } as const;

/** Rules typed with the token's identity: every claim reaches them, `kioskPin` included. */
const kioskRules = definePolicies(model)
	.principal<AccessIdentity<typeof claims>>()
	// A session a PIN opened on a till.
	.roles(() => ({ pinSession: { global: { claims: { kioskPin: true } } } }))
	.grants(({ grant, me }) => [
		grant("pinSession", "read", "Note", { where: { authorId: me.sub } }),
	]);

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
		baseURL: "https://kiosk.example.com",
		emailAndPassword: { enabled: true, disableSignUp: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
		plugins: [kiosk({ canEnrollDevice: ({ user }) => user.role === "admin" })],
	},
	// No `principal`: the rules are typed with `AccessIdentity`, so each claim, `kioskPin`
	// included, reaches them as `claimsOf` returns it.
	policies: {
		rules: kioskRules,
		claims,
		claimsOf: ({ user, session }) => ({
			role: typeof user.role === "string" ? user.role : undefined,
			banned: user.banned === true,
			kioskPin: session.kioskPin === true,
		}),
	},
	resources: {
		// Off Prisma's adapter, every table Better Auth is built with is named: the
		// kiosk's five among them.
		authTables: {
			user: "User",
			session: "Session",
			account: "Account",
			verification: null,
			jwks: null,
			kioskDevice: null,
			kioskPin: null,
			kioskLockout: null,
			kioskRetiredSecret: null,
			kioskDeviceEnrollmentCode: null,
		},
	},
});
```

A rule that grants only on a kiosk fact cannot be met without the plugin. Never deny on its absence. A bound session
gets no token, so these claims come only from the session cookie.

## From Access 1.0.0-rc.2

1.0.0-rc.2 ran kiosk mode as `createAccess`'s `profile: { kind: "kiosk" }`. To move:

| 1.0.0-rc.2 | Now |
|---|---|
| `profile: { kind: "kiosk", canEnrollDevice, idleTimeout?, insecureLan? }` | `kiosk({ canEnrollDevice, idleTimeout?, insecureLan? })` in `betterAuth.plugins`, on the `web` profile |
| `canEnrollDevice({ sub, claims })` | `canEnrollDevice({ user, session })`, with Better Auth's rows: read the role from `user` |
| `access.kiosk.listDevices()`, `revokeDevice()` | `kioskOf(access).listDevices()`, `revokeDevice()` |
| `access.api.kioskSetUserPin({ body: { userId, pin } })` | `kioskOf(access).setUserPin(userId, pin)`: the PIN must now be changed at the till before it opens a session |
| Tables `accessKioskDevice`, `accessKioskPin`, `accessKioskLockout`, `accessKioskRetiredSecret` | `kioskDevice`, `kioskPin`, `kioskLockout`, `kioskRetiredSecret`: keep yours with `schema` ([below](#tables-and-codes)) or rename them, then migrate for the new columns and table |
| Refusals as `ACCESS_OPTIONS_INVALID` when `createAccess` is called | `KIOSK_OPTIONS_INVALID` when Better Auth starts: `await access.api.ok()` before you listen |
| API keys | Act as their owner, on a till too: keep them as passwords |
| PINs hashed by Access's argon2id | Under `createAccess` with no password hook of your own: unchanged. With your own `emailAndPassword.password` hook: give `kiosk()` a `pinHasher` whose `verify` reads argon2id as well as your hook's hashes and whose `hash` is your hook's (each old PIN is hashed anew at its next right PIN), or set every PIN again. Until then such a PIN is refused as a wrong one |

Enrolled devices keep working: the device cookie, the credentials and the session fields are the same. The changelogs
of both packages list every change. Four fixes are reasons to move:

- On a database with one connection, such as SQLite, rc.2's kiosk could hang the whole server: a sign-up, or a
  password change with `revokeOtherSessions`, from an enrolled device never answered, and every request after it
  waited. The plugin reads inside Better Auth's transaction and does not hang.
- In rc.2, a session another plugin opened from its own before or after hook on a till was not bound to the till: it
  escaped the lock, the idle timeout and the PIN session's reach. The plugin binds it.
- rc.2 had no handling of `@better-auth/electron` beside the kiosk. Its exchange turns a till's session into a code
  that opens a session anywhere. The plugin refuses it.
- In rc.2 a session an admin impersonates (Better Auth's `admin()`) passed the check for full credentials: the admin
  could set the user's PIN and enroll a till as them, then switch in as them with no impersonation marked. The plugin
  refuses that session where full credentials are asked.

## Tables and codes

The kiosk's tables are `kioskDevice`, `kioskPin`, `kioskLockout`, `kioskRetiredSecret` and
`kioskDeviceEnrollmentCode`, and Better Auth's `session` gains `kioskDeviceId`, `kioskSeenAt` and `kioskPin`.
`npx auth@~1.7.12 generate --yes` writes them, with the unique indexes that enforce the PIN limits and the single-use
credentials (`kioskLockout.key`, `kioskPin.userId`, each `secretHash`). Tables made by hand must have those indexes
too: Better Auth's schema check compares tables and columns, not indexes, and without them a held device takes
unlimited PIN tries. Under Access they stay closed to every request, and a credential's, a
PIN's or a device enrollment code's hash is a sealed column, whatever the table is called. Off Prisma's adapter, name
each of them in `resources.authTables` ([Auth tables](/docs/auth-tables)).

An app that ran kiosk mode as `createAccess`'s `profile` keeps its tables with the plugin's `schema` option:
`kiosk({ ..., schema: { kioskDevice: { modelName: "accessKioskDevice" }, kioskPin: { modelName: "accessKioskPin" },
kioskLockout: { modelName: "accessKioskLockout" }, kioskRetiredSecret: { modelName: "accessKioskRetiredSecret" } } })`.

In your server's code, a `kioskOf(auth)` method that refuses (`consumeApproval`, `issueDeviceEnrollmentCode`,
`setUserPin` and the rest) throws Better Auth's `APIError`, as a route answers: the code is at `error.body.code`, the
status at `error.status` (`"CONFLICT"` for `KIOSK_APPROVAL_INVALID`) and `error.statusCode` (`409`). The error has no
`code` of its own. Test for it with Better Auth's `isAPIError` (`better-auth/api`). `KIOSK_OPTIONS_INVALID` is the
one exception: `kiosk()` and `kioskOf` throw it as an `Error` whose `code` is on the error itself.

```ts nest
// src/approval.refusal.ts
import { isAPIError } from "better-auth/api";

/** Whether `consumeApproval` refused: the code is in the body of Better Auth's `APIError`, not on the error. */
export const isApprovalRefused = (error: unknown): boolean =>
	isAPIError(error) && error.body?.code === "KIOSK_APPROVAL_INVALID";
```

| Code | Status | When |
|---|---|---|
| `KIOSK_DEVICE_NOT_ENROLLED` | 401 | The request brings no current device credential |
| `INVALID_USER_OR_PIN` | 401 | A wrong PIN, a user with none, or no such user (`400` for a PIN that is not 6 to 12 digits) |
| `KIOSK_PIN_LOCKED` | 429 | The user's backoff on this device, or the device's limit; `X-Retry-After` says when |
| `KIOSK_PIN_DISABLED` | 403 | 100 wrong PINs in a row for this user on this device |
| `KIOSK_DEVICE_CREDENTIAL_CONFLICT` | 400 | A `kiosk-device` header beside a kiosk cookie: both cookies are expired with the answer ([A till that is a native app](#a-till-that-is-a-native-app-headers)) |
| `KIOSK_DEVICE_BUSY` | 409 | Two switches on one device at once, or a request or sign-in with the credential the last switch replaced within 30 seconds; or a kiosk write SQLite refused because another connection's transaction held the file ("database is locked"), on a route or in a `kioskOf(auth)` call |
| `KIOSK_FULL_CREDENTIAL_REQUIRED`, `SESSION_NOT_FRESH` | 403 | Enrolling, listing, revoking, issuing a device enrollment code or setting a PIN from a session an admin impersonates, or a session older than `freshAge` (a PIN session gets `KIOSK_SESSION_NOT_ALLOWED` there: those routes are out of its reach) |
| `KIOSK_DEVICE_ENROLLMENT_CODE_INVALID` | 401 | A device enrollment code that is unknown, used, revoked or expired, or whose issuer `canEnrollDevice` no longer allows |
| `KIOSK_ENROLL_REFUSED` | 403 | `canEnrollDevice` did not answer `true` |
| `KIOSK_PIN_CHANGE_REQUIRED` | 403 | The right PIN at a switch, given with `setUserPin`: replace it at `/kiosk/change-pin` |
| `UNAUTHORIZED` | 401 | `/kiosk/change-pin` for one's own PIN without one's own PIN session on the device; `/kiosk/approve` without a session bound to the device |
| `EMAIL_NOT_VERIFIED` | 403 | Under `requireEmailVerification`, a switch to, or an approval by, a user whose email is not verified |
| `KIOSK_APPROVAL_REFUSED` | 403 | An approval asked from a session an admin impersonates, by the session's own user, by a user banned or not done with onboarding, or one `canApprove` did not answer `true` for |
| `KIOSK_APPROVAL_INVALID` | 409 | `consumeApproval` of an approval that is used, expired, never given, or given for another session, action or subject |
| `KIOSK_SESSION_NOT_ALLOWED` | 403 | A PIN session on a route it does not reach, a bound session asking for a token or managing OAuth clients or consents, a sign-in on a till that would resume an authorization request, or passkey registration or `trustDevice` from an enrolled device |
| `KIOSK_DEVICE_NOT_FOUND` | 404 | Revoking a device that is not enrolled |
| `USER_NOT_FOUND` | 404 | `kioskOf(auth).setUserPin`, or `issueDeviceEnrollmentCode`'s `issuedBy`, for no such user |
| `KIOSK_OPTIONS_INVALID` | thrown, or `500` | `kiosk()`'s options, or Better Auth's options beside it, would break a device-bound session (`500` on every request when another plugin's `init` added the option) |
| `PIN_TOO_WEAK` | 400 | A PIN that is not 6 to 12 digits, or one a guesser tries first |
| `INVALID_BODY` | 400 | A body that is not a JSON object of the route's fields, a field out of its bounds, or a control character in a name, an `action` or a `subject` |

The plugin's own codes are listed on `kiosk(...).$ERROR_CODES`. `SESSION_NOT_FRESH`, `EMAIL_NOT_VERIFIED`,
`USER_NOT_FOUND` and `FAILED_TO_CREATE_SESSION` are Better Auth's, listed in its `BASE_ERROR_CODES`. A refusal of the
onboarding plugin's (`ONBOARDING_REQUIRED`, `ONBOARDING_BLOCKED`) passes through a PIN switch unchanged
([Onboarding](/docs/onboarding)), and the device is left as it was, even after a right PIN: its credential is not
rotated, and the session of whoever was on it before stays (the refused switch ends nothing, as any switch refused
before its new session stands). Lock the till when the refused user should not find the last one's session there.
