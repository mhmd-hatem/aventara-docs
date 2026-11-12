---
title: Onboarding
description: "Hold users at the door until they finish: steps, invites, email verification, a second factor and a passkey, with or without Access, beside the kiosk."
order: 29
section: guides
---

# Onboarding

Onboarding holds a user at the door until they have done what your app asks of them: changed a temporary password,
claimed an account an admin made, verified their email, enrolled a second factor or a passkey, accepted your terms,
filled in their profile, or waited for an admin's approval. It is a Better Auth plugin of its own, `onboarding()` from
`@aventara/better-auth-onboarding`, which any Better Auth app can use, with or without Access. Beside Access it goes in
`betterAuth.plugins`, and Access asks it about every token and session it reads.

```sh
npm install --save-exact @aventara/better-auth-onboarding@rc
# The samples below also use pg, and the passkey step Better Auth's passkey plugin. Install it, and
# @better-auth/core, at the better-auth version the app has (npm ls better-auth): each @better-auth/* release needs
# the better-auth and core of its own version or later, and npm would otherwise add a newer core beside
# better-auth's own, whose types do not match.
v=$(npm ls better-auth --depth=0 --json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).dependencies["better-auth"].version')
npm install --save-exact pg "@better-auth/core@$v" "@better-auth/passkey@$v"
```

It runs on `better-auth` `~1.7.12`, the range Access runs on, and the `@better-auth/utils` Better Auth brings (a peer,
`^0.5.0`: the two-factor step checks codes with its TOTP).

1. A user signs in, signs up or redeems an invite. If a step is open, Better Auth's answer is `403 ONBOARDING_REQUIRED`
   with no session, and the browser gets an attempt: a short-lived cookie that only the onboarding routes read.
2. The page asks for the current step (`GET /onboarding/state`) and completes it (`POST /onboarding/complete-step`),
   one step after another, in the order you listed them.
3. The last step signs the user in through Better Auth's own session creation.

## Without Access

```ts
// src/auth.onboarding.ts
import {
	credentialStep,
	onboarding,
	statusStep,
	termsStep,
} from "@aventara/better-auth-onboarding";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import { Pool } from "pg";

export const auth = betterAuth({
	database: new Pool({ connectionString: process.env.DATABASE_URL }),
	baseURL: "https://app.example.com",
	// Accounts are made by an admin (the admin plugin's /admin/create-user); nobody
	// signs up with an address they have not proven.
	emailAndPassword: { enabled: true, disableSignUp: true },
	plugins: [
		admin(),
		onboarding({
			steps: [
				// Pending or deactivated accounts, and banned ones, cannot sign in.
				statusStep({ initial: "active" }),
				// A password an admin set is changed; an account an admin made without
				// one is claimed by setting one.
				credentialStep({
					policy: (password) =>
						password.length >= 12 || "Use at least 12 characters.",
				}),
				// Raise the version when your terms change: everyone accepts again.
				termsStep({ version: 1 }),
			],
			// Who may use the admin routes (set a status, reopen a step, read records).
			canManage: ({ user }) => user.role === "admin",
			// Where a browser flow (a magic link, a social sign-in, an email link) lands
			// a user who must onboard.
			pages: { onboarding: "/onboarding" },
		}),
	],
});

// The plugin checks Better Auth's options when Better Auth builds its context:
// build it before you listen, so a refusal stops the start.
await auth.$context;
```

## With Access

Put `onboarding()` in `betterAuth.plugins`, and start Better Auth with `await access.api.ok()` before your server
listens: the plugin's checks of Better Auth's options run then, and a refusal rejects it.

```ts
// src/access.onboarding.ts
import { createAccess } from "@aventara/access/auth";
import {
	credentialStep,
	type OnboardingUser,
	onboarding,
	statusStep,
	verifiedEmailStep,
} from "@aventara/better-auth-onboarding";
import { Pool } from "pg";
import { policies } from "./access.policies.js";
import { sendMail } from "./onboarding.mail.js";

const claims = { role: "string", banned: "boolean" } as const;

/** Admins invite and manage. Each rule gets Better Auth's user row. */
const isAdmin = ({ user }: { readonly user: OnboardingUser }) =>
	user.role === "admin";

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
		baseURL: "https://app.example.com",
		emailAndPassword: { enabled: true },
		emailVerification: {
			sendVerificationEmail: async ({ user, url }) => {
				await sendMail(user.email, url);
			},
			// Beside invites, the browser that follows the link goes on with onboarding.
			autoSignInAfterVerification: true,
		},
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
		plugins: [
			onboarding({
				steps: [statusStep(), verifiedEmailStep(), credentialStep()],
				canManage: isAdmin,
				invites: {
					canInvite: { claim: isAdmin, create: isAdmin, allInvites: isAdmin },
				},
				// An invited user verifies the address at the email step.
				emailVerification: "lenient",
				pages: { onboarding: "/onboarding" },
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
		users: true,
		// Off Prisma's adapter, every table Better Auth is built with is named: the
		// plugin's three among them, its invites' table whether or not invites are on.
		authTables: {
			user: "User",
			session: "Session",
			account: "Account",
			verification: null,
			jwks: null,
			onboardingStep: null,
			onboardingAttempt: null,
			onboardingInvite: null,
		},
	},
});
```

```ts
// src/onboarding.mail.ts

/** Your own mailer. */
export const sendMail = async (to: string, url: string): Promise<void> => {
	void to;
	void url;
};
```

Access imports nothing of the plugin. It finds it in `betterAuth.plugins` (or beside `aventaraAccess()`, before or
after it: the order does not matter) by its id, `aventara-onboarding`, and reads its facts.

- **No principal for a user who is not done.** The plugin's gate keeps every session it opens to users who finished
  onboarding. A token outlives that: a step may open, or the account be blocked, after it was issued. So Access asks
  the plugin about the user of every token it verifies (its own `jwt()` tokens and the OAuth provider's) and of every
  session Better Auth answers (one the API-key plugin builds included). A user who is not `complete` is nobody: the
  framework answers their requests as it answers a caller who is not signed in.
- **The plugin's hash columns are sealed** for `resources` (the attempt's `secretHash` and `credential`, the invite's
  `secretHash`), whatever the tables are called.
- **`resources.authTables`** names the plugin's tables when Better Auth is not on its Prisma adapter, `onboardingInvite`
  included whether or not invites are on (`null` for a table the rules' schema does not have). Without them Access
  refuses to start ([Better Auth's tables as Resources](/docs/auth-tables)). On Prisma's adapter there is nothing to
  name.
- **Facts of a version this Access does not read** are refused with `ACCESS_OPTIONS_INVALID`: install the matching
  releases.
- **Rules on onboarding data.** `claimsOf({ user, session })` sees the user row. What only the plugin holds, such as
  the terms version a user accepted, is read with `onboardingOf(access).records(userId)`.
- **Tokens.** Access's tokens live at most 900 seconds (`policies.tokenTtl`), which is the plugin's default
  `jwtLifetimeCap`. Lower `jwtLifetimeCap` only together with `tokenTtl`.

## Options

| Option | Takes | Default |
|---|---|---|
| `steps` | The steps, in the order the user completes them; each id once | required |
| `canManage` | `({ user, session }) => boolean`: who may use the admin routes. Anything but `true` refuses | none: the admin routes answer `404` |
| `pages.onboarding` | A path or an absolute URL where browser flows send a user who must onboard | none: the flow's own error page with `?error=ONBOARDING_REQUIRED` |
| `invites` | `{ canInvite, lifetime?, requiredForSignUp?, batch? }` ([below](#invites)). Needs `credentialStep()` | `false` |
| `emailVerification` | `"strict"`, `"lenient"` or `"off"` ([below](#email-verification)) | `"strict"` beside `requireEmailVerification`, else `"off"` |
| `cookieCacheCap` | The longest `session.cookieCache.maxAge` allowed beside the plugin, in seconds (1 to 86400) | 300 |
| `jwtLifetimeCap` | The longest lifetime of a `jwt()` token allowed beside the plugin, in seconds (60 to 86400) | 900 |
| `schema` | Better Auth's plugin schema override: other table names (`modelName`) or column names (`fields`) | none |

These are fixed: an attempt lives 10 minutes; 5 failed tries end it; an invite link holds 256 random bits and a typed
code 60; a typed code gets 5 tries per account, then a 15-minute lock.

## The steps

| Step | Open when | Completed with |
|---|---|---|
| `statusStep({ initial })` | The account's status is `pending` or `deactivated` (an account with none counts as `initial`, `"active"` by default; `"pending"` makes every new account wait for approval), or the admin plugin's ban is on | Nothing: it blocks (`ONBOARDING_BLOCKED`, no attempt) until an admin sets the status `active` |
| `credentialStep({ policy, markAdminCreated, expireAfterDays, required })` | An admin set the password (`/admin/set-user-password`) or made the account (`/admin/create-user`); your server called `setTemporaryPassword` or `reopen`; or the password is `expireAfterDays` old (1 to 3650) | `{ currentPassword, newPassword }`; with no password yet (an account to claim), `{ newPassword }` alone. `markAdminCreated: false` stops the admin routes from opening it |
| `verifiedEmailStep()` | Better Auth's `emailVerified` is not `true`, or the step's email was sent and the step not finished | `{ phase: "send" }`, Better Auth's link, then `{ phase: "finish" }` |
| `twoFactorStep({ methods, required })` | Better Auth's `twoFactorEnabled` is not `true` | `{ phase: "begin", method }`, then `{ phase: "verify", method, code }`. `methods`: `"totp"`, `"otp"` or both (the default) |
| `passkeyStep({ required })` | The user has no passkey (the passkey plugin's), or the step was begun or reopened and not finished | `{ phase: "begin" }`, a registration through the passkey plugin, then `{ phase: "finish" }` |
| `termsStep({ version, required })` | The user has not accepted `version`, or a later one | `{ version }`, the current version |
| `profileStep({ fields, data, required })` | One of the listed user fields is empty, or the step was reopened | The listed fields and only those, such as `{ handle: "ada" }` |
| `defineStep({ id, required, complete, data, describe })` | Your `required({ user, record, now })` | Your `complete(...)`: nothing when done, `{ next }` for another phase, `{ refused: "a sentence" }` for a failed try. `data` is a Standard Schema the body must pass first |

The steps run in the order you list them. A step with no `complete` blocks the user and issues no attempt. The steps
that come with the plugin skip anonymous users (the anonymous plugin's); one of your own that is open for an anonymous
user blocks them.

The credential, two-factor, passkey, terms and profile steps also take `required`, your own condition, the same as
`defineStep`'s: `twoFactorStep({ required: ({ user }) => user.tillOnly !== true })`. The step is then open for a user
only while its own condition holds and yours answers `true`. It is asked wherever the step's openness is read: at the
gate, in the state and at every step call, at session refresh, and by `check` (so by Access and by the kiosk). If it
throws or answers anything but a boolean, the step stays required, and Better Auth's logger hears of it. The
verified-email step and the status step take no condition: an unproven address could otherwise enrol factors in the
owner's name, and the status is an admin's block. While your condition answers `false`, `reopen` opens the step's
record and nothing more; an invite cannot claim an account whose credential step your condition turns off (nor one
whose condition throws).

**Never key `required` on a field the user can write.** The condition decides who skips a second factor, a passkey or
a password: read only what your server sets, such as a field marked `input: false` that only your server and the admin
API write, or a role an admin assigns. The user writes their email (at sign-up, and with Better Auth's email change),
their name, every `user.additionalFields` entry that takes input, and every field a profile step lists; a social
provider asserts an address too. An address at your own domain proves nothing until it is verified, and a condition
on it lets anyone who signs up there skip the steps.

A step a user cannot complete where they sign in keeps them out: a user with a step open is refused at a kiosk's PIN
switch, with no attempt ([Staff who only work at a till](#staff-who-only-work-at-a-till)).

## Staff who only work at a till

A PIN switch is never given an attempt, so a user with a step open is refused there with `ONBOARDING_REQUIRED` and can
onboard only on a device of their own. Staff who only work at a till use the kiosk's PIN path instead: scope off, for
them, every step a till cannot hold.

```ts
// src/access.till-staff.ts
import { createAccess } from "@aventara/access/auth";
import { kiosk, kioskOf } from "@aventara/better-auth-kiosk";
import {
	credentialStep,
	type OnboardingUser,
	onboarding,
	statusStep,
	termsStep,
	twoFactorStep,
} from "@aventara/better-auth-onboarding";
import { admin } from "better-auth/plugins/admin";
import { twoFactor } from "better-auth/plugins/two-factor";
import { Pool } from "pg";
import { policies } from "./access.policies.js";

/** The shop's own mail domain: till staff's addresses, whose mail the shop reads. */
const TILL_DOMAIN = "@till.shop.example";

/**
 * Every step below applies to everyone but till-only staff: those whose `tillOnly`
 * the server set. Never the address: anyone may sign up at any address.
 */
const notTillOnly = ({ user }: { readonly user: OnboardingUser }) =>
	user.tillOnly !== true;

const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		database: new Pool({ connectionString: process.env.DATABASE_URL }),
		baseURL: "https://shop.example",
		// Accounts are made by an admin; nobody signs up.
		emailAndPassword: { enabled: true, disableSignUp: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
				// Set by the server through the admin API; no request of the user's writes it.
				tillOnly: { type: "boolean", required: false, input: false },
			},
		},
		plugins: [
			admin(),
			twoFactor(),
			kiosk({ canEnrollDevice: ({ user }) => user.role === "admin" }),
			onboarding({
				steps: [
					statusStep(),
					credentialStep({ required: notTillOnly }),
					twoFactorStep({ methods: ["totp"], required: notTillOnly }),
					termsStep({ version: 1, required: notTillOnly }),
				],
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
		// kiosk's, onboarding's and two-factor's among them.
		authTables: {
			user: "User",
			session: "Session",
			account: "Account",
			verification: null,
			jwks: null,
			twoFactor: null,
			kioskDevice: null,
			kioskPin: null,
			kioskLockout: null,
			kioskRetiredSecret: null,
			kioskDeviceEnrollmentCode: null,
			onboardingStep: null,
			onboardingAttempt: null,
			onboardingInvite: null,
		},
	},
});

/** A till-only account, made through Better Auth's admin API, and its first PIN. */
export const addTillStaff = async (name: string, pin: string) => {
	const { user } = await access.api.createUser({
		body: {
			email: `${name}${TILL_DOMAIN}`,
			name,
			data: { tillOnly: true, emailVerified: true },
		},
	});
	// Marked to be changed: at the till the PIN answers KIOSK_PIN_CHANGE_REQUIRED,
	// and the till replaces it at POST /kiosk/change-pin before a session opens.
	await kioskOf(access).setUserPin(user.id, pin);
	return user.id;
};
```

- **The account.** Better Auth's admin plugin makes it: `access.api.createUser` from your server with no headers, or
  `POST /admin/create-user` from an admin's session (a call with a request's headers and no admin session is refused).
  The admin API writes `data` as given, so it sets `tillOnly`, which no sign-up or `/update-user` can (`input: false`).
  Made without a password, the account has its credential step open to be claimed, which `required` turns off for
  till-only staff; a manager made the same way, without `tillOnly`, meets every step.
- **The condition.** It reads `tillOnly`, never the address: with sign-up open, anyone could sign up at
  `@till.shop.example` and skip the second factor and the terms. Key it only on what your server sets.
- **Its PIN.** `kioskOf(access).setUserPin(userId, pin)` gives the first PIN; the till replaces it at
  `POST /kiosk/change-pin` (`authClient.kiosk.changePin`) before it opens a session ([PINs](/docs/kiosk#pins)).
- **Everywhere, not only at the till.** `tillOnly` scopes the steps off on every path: the web sign-in, a passkey, a
  magic link, any other. Whoever gets such an account a password (a password reset by whoever reads its mailbox, an
  admin's `/admin/set-user-password`) signs in on the web with no second factor and no terms. Give till-only accounts
  no password, keep password reset and passwordless sign-in off for them where you can, and keep what your rules grant
  them (in Access, the rules their role or claims meet) to what a till needs.
- **Its address.** Mark an address verified only when its mailbox is the person's own or yours, such as a domain you
  control: whoever reads that mailbox can take the account through a password reset, a magic link or an email code,
  and onboarding holds nothing back for a verified address. Better Auth turns password reset off only for everyone
  (leave out `emailAndPassword.sendResetPassword`), as it does magic links and email codes (leave out their plugins).
  An unverified address keeps the account at `verifiedEmailStep()` when it is listed, and at the kiosk's
  `EMAIL_NOT_VERIFIED` under `requireEmailVerification`.
- **Its status.** Under `statusStep({ initial: "pending" })`, a till-only account waits too: set it active with
  `onboardingOf(access).setStatus(userId, "active")`.
- **Not `markAdminCreated: false`.** It turns the admin routes' marking off for every user: a password an admin sets with
  `/admin/set-user-password` is no longer one the user must change (the admin keeps knowing it), and an account
  `/admin/create-user` makes without a password can no longer be claimed by an invite.
- **The admin API, not the internal adapter.** `createAccess` exposes no `$context` to reach Better Auth's internal
  adapter, and with `user.validateUserInfo` set that adapter refuses a user made outside a request
  (`validation_context_missing`).

## How a user onboards

| Route | Body | Answers |
|---|---|---|
| `GET /onboarding/state` | none | `{ step: { id, data? } \| null, remaining, expiresAt }` |
| `POST /onboarding/complete-step` | `{ step, data? }` | `{ done, next?, complete }`; on `complete: true` the session cookie |
| `POST /onboarding/abandon` | none | `{ success }` |

`data` in the state is what the page needs to show: `{ mode }` for the credential step (`"temporary"`, `"expired"` or
`"claim"`), `{ verified }` for the email step, `{ methods }` for the two-factor step, `{ version, accepted }` for the
terms step, `{ fields, missing }` for the profile step.

```ts
// src/onboard.client.ts
import { onboardingClient } from "@aventara/better-auth-onboarding/client";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({ plugins: [onboardingClient()] });

/** Signs in; when onboarding is needed, answers the step to show. */
export const signIn = async (email: string, password: string) => {
	const signedIn = await authClient.signIn.email({ email, password });
	if (signedIn.error?.code !== "ONBOARDING_REQUIRED") {
		return signedIn;
	}
	return await authClient.onboarding.state();
};

/** Accepts the terms the state showed: when it is the last step, the user is signed in. */
export const acceptTerms = (version: number) =>
	authClient.onboarding.completeStep({ step: "terms", data: { version } });
```

- **The attempt** is an HTTP-only, `SameSite=Strict` cookie sent only to `/api/auth/onboarding/*`. It lives 10
  minutes, is replaced at each completed step (of parallel completions, one goes on), and ends after 5 failed tries,
  on `abandon`, when the user is blocked, when any route writes their password, and when their address is proven or
  changed. It is never a session: Better Auth's `getSession` does not read it, and `GET /token` gets nothing from it.
- **Sign-in paths** that get an attempt: email, username and phone with a password, two-factor's verification, a
  passkey, a social sign-in, a magic link, an email or phone code, SIWE, and the email verification link. Other paths
  that open a session (an admin's impersonation, the device flow, a kiosk's PIN switch, your server's own calls) are
  refused the same way, with no attempt.
- **Sign-up** goes straight into onboarding: a new user with a step open gets the attempt and `ONBOARDING_REQUIRED`,
  and one with nothing open is signed in. When Better Auth answers every sign-up alike (`requireEmailVerification`, or
  `autoSignIn: false`), every sign-up answers `ONBOARDING_REQUIRED` with an attempt whose state shows no step, for a
  new address and a taken one alike; onboarding begins at the user's next sign-in.
- **A second factor first.** Beside Better Auth's `twoFactor()`, listed before `onboarding()`, a user who has a second
  factor proves it before any step: the password sign-in meets two-factor's challenge, and the attempt comes with
  `/two-factor/verify-*`'s answer. A passwordless sign-in of such a user answers `ONBOARDING_SECOND_FACTOR_REQUIRED`.
- **Browser flows** (a social callback, a magic link, the email link) are sent to `pages.onboarding` with the attempt
  set.

## A second factor and a passkey

```ts
// src/auth.factors.ts
import {
	onboarding,
	onboardingPasskeyUser,
	onboardingPasskeyVerified,
	passkeyStep,
	statusStep,
	twoFactorStep,
	verifiedEmailStep,
} from "@aventara/better-auth-onboarding";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { Pool } from "pg";
import { sendCode, sendLink } from "./code.mail.js";

export const auth = betterAuth({
	database: new Pool({ connectionString: process.env.DATABASE_URL }),
	baseURL: "https://app.example.com",
	appName: "Example",
	// Anyone may sign up, with any address: the email step below comes first, so
	// nobody enrols a factor on an address they have not proven.
	emailAndPassword: { enabled: true },
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => await sendLink(user.email, url),
		autoSignInAfterVerification: true,
	},
	plugins: [
		// Before onboarding(): its challenge runs first at a password sign-in.
		twoFactor({
			otpOptions: {
				sendOTP: async ({ user, otp }) => await sendCode(user.email, otp),
			},
		}),
		// Registration without a session, for onboarding: onboardingPasskeyUser says
		// whose, and onboardingPasskeyVerified checks it all again at the verification.
		passkey({
			registration: {
				requireSession: false,
				resolveUser: onboardingPasskeyUser,
				afterVerification: onboardingPasskeyVerified,
			},
		}),
		onboarding({
			steps: [
				statusStep(),
				verifiedEmailStep(),
				twoFactorStep(),
				passkeyStep(),
			],
			emailVerification: "lenient",
			pages: { onboarding: "/onboarding" },
		}),
	],
});

await auth.$context;
```

```ts
// src/code.mail.ts

/** Your own mail (or text message) of a sign-in code. */
export const sendCode = async (to: string, code: string): Promise<void> => {
	void to;
	void code;
};

/** Your own mail of Better Auth's verification link. */
export const sendLink = async (to: string, url: string): Promise<void> => {
	void to;
	void url;
};
```

**The two-factor step** writes the two-factor plugin's own rows, so two-factor's challenge takes what was enrolled
here.

- `{ phase: "begin", method: "totp" }` answers `next: { method: "totp", totpURI, backupCodes }`: show the URI as a QR
  code for an authenticator app, and the backup codes. They are answered this once.
- `{ phase: "begin", method: "otp" }` sends a code through `otpOptions.sendOTP`, good for `otpOptions.period` and in
  this attempt only. A user is sent at most 3 codes per 10 minutes.
- `{ phase: "verify", method, code }` turns the factor on. A wrong code is a failed try. The code proves the factor,
  so the steps after it, and the sign-in at the end, take it as the user's second factor. From then on two-factor
  challenges the user at every password sign-in.

**The passkey step.** `{ phase: "begin" }` answers `next: { phase: "register" }` and sets a ticket, a cookie sent only
to `/api/auth/passkey/*` that names the attempt as it stands. The page then registers a passkey as it always does with
the passkey plugin (`authClient.passkey.addPasskey()`), with no session: `onboardingPasskeyUser` answers the ticket's
user, and `onboardingPasskeyVerified` checks the ticket again and binds the passkey to the attempt. `{ phase: "finish"
}` completes the step once a passkey bound to this attempt exists. A registration that asks for a session
(`createSession: true`) is refused with `ONBOARDING_REQUIRED`: the last step signs the user in. With `requireSession:
false` the passkey plugin no longer asks a signed-in user's registration for a fresh session, so
`onboardingPasskeyVerified` does (`SESSION_NOT_FRESH`), whether or not `passkeyStep()` is listed.

Under pnpm with `declaration: true`, exporting the Better Auth instance (or its options) with `passkey()` in its
plugins fails with `TS2883` or `TS2742`: the inferred type names `@simplewebauthn/server`'s and zod's types, which
Better Auth's own types reach and your project does not depend on. This is Better Auth's typing, not the onboarding
plugin's. Give the export a type annotation, or keep it unexported.

Without `twoFactor()`, or with a method it does not offer (`otp` needs `otpOptions.sendOTP`; `totpOptions.disable`
turns `totp` off), or with `passkeyStep()` and the passkey plugin not wired as above, the plugin refuses to start.
`reopen` does not take the two-factor or the email step: they follow Better Auth's own fields.

## Terms, profile and password age

- **Terms.** `termsStep({ version })` stores the version the user accepted. When you raise `version`, everyone who
  accepted a lower one accepts again at their next sign-in, and their session ends at its next refresh.
  `onboardingOf(auth).records(userId)` answers the accepted `version`, and when, as `completedAt`.
- **Profile.** `profileStep({ fields })` lists fields of the user to fill in: Better Auth's `name` and `image`, and your
  `user.additionalFields` that take input. The client sends the fields themselves; every empty one must be given, none
  may be blank, and no other key is taken. Values pass Better Auth's own checks of your fields (`validator.input`,
  `transform.input`), as `/update-user` runs them. The plugin refuses a step that lists `email`, `emailVerified`, a
  role or ban field, `twoFactorEnabled`, a field marked `input: false`, a field another plugin declares, or a field
  the user does not have.
- **Password age.** With `credentialStep({ expireAfterDays })`, a password that many days old opens the step in mode
  `"expired"`: the user gives the current password and a new, different one. The age counts from Better Auth's own
  stamp of the credential account, which every write of the password renews, by any route.

A step that opens because time passed or your configuration changed applies at the user's next sign-in and at their
session's next refresh (Better Auth's `session.updateAge`). `reopen` applies it at once.

## Email verification

`emailVerification` says whether onboarding takes a user whose email is not verified.

| Value | Does | Needs |
|---|---|---|
| `"strict"` (the default beside Better Auth's `emailAndPassword.requireEmailVerification`) | Such a user is not onboarding's: no attempt, no step. The gate, a sign-up, a step call and the last step answer Better Auth's own `403 EMAIL_NOT_VERIFIED`, and send the verification email as Better Auth sends one at a sign-in (`sendOnSignIn`). Once verified, the user onboards as anyone does. The step order is free | Beside invites: `emailVerification.sendVerificationEmail` and `autoSignInAfterVerification: true` |
| `"lenient"` | Such a user onboards, and verifies at `verifiedEmailStep()`, which `steps` must list. Every step the user completes comes after it; only a blocking step such as `statusStep()` may come first. Better Auth's own `requireEmailVerification`, if on, still refuses an unverified password sign-in first | `verifiedEmailStep()` listed, `sendVerificationEmail`, and beside invites `autoSignInAfterVerification: true` |
| `"off"` (the default otherwise) | Onboarding does not look at it. A listed `verifiedEmailStep()` still holds the user, and the same order applies | `sendVerificationEmail` when `verifiedEmailStep()` is listed, and beside invites `autoSignInAfterVerification: true` too |

The plugin refuses each of these when it is missing, with `ONBOARDING_OPTIONS_INVALID`: `verifiedEmailStep()` without
`sendVerificationEmail`; `"lenient"` without `verifiedEmailStep()`; a step the user completes listed before
`verifiedEmailStep()` while the mode is not `"strict"`; strict or a listed email step beside invites without
`sendVerificationEmail` and `autoSignInAfterVerification: true`.

**The email step.** The page sends `{ phase: "send" }`: the plugin mails Better Auth's own verification link through
your `sendVerificationEmail`, leading back to `pages.onboarding` (at most 3 emails per user per 10 minutes). Following
the link verifies the address. Proving the address, by that link or any other way, ends every onboarding attempt of the
user from before the proof, the one that sent the link included. With `autoSignInAfterVerification`, the browser that
followed the link gets a fresh attempt and lands on `pages.onboarding`, where `{ phase: "finish" }` completes the step;
without it, the user signs in again and finishes.

**Invites under strict.** An invite that claims an unverified account answers `EMAIL_NOT_VERIFIED`, stays good, and
sends the link. An invite that creates an account creates it, is spent, sends the new address its link and answers
`EMAIL_NOT_VERIFIED`. The link verifies the address, and Better Auth's sign-in after verification starts onboarding
in that browser.

**Invites under lenient** (or beside a listed email step): redeeming sets the attempt as usual, and the user verifies
at the step. Whoever redeemed it may not own the address: the owner's proof ends their attempt, and onboarding goes
on in the browser that followed the link.

## Invites

An invite brings a user into onboarding without a password: a member of staff an admin made, or a newcomer to an
invite-only app. It is single use, and never a session: redeeming it sets the attempt, and the last step signs the
user in.

| Kind | Looks like | Does |
|---|---|---|
| A link (`kind: "link"`) | `avo_invite_` and 43 characters; put it in your URL or a QR code | Claims an account an admin made without a password (`userId`), or creates an account (`create`) |
| A typed code (`kind: "code"`) | `XXXX-XXXX-XXXX` (Crockford's base32: any case, dashes optional) | Claims an account an admin made without a password; redeemed with that account's email, username or id |

| `invites` option | Takes | Default |
|---|---|---|
| `canInvite` | `{ claim, create, allInvites }`: one rule per kind, each required. Only `true` passes | required |
| `lifetime` | How long an invite is good, in seconds (3600 to 2592000) | 7 days to claim, 72 hours to create |
| `requiredForSignUp` | `true`: sign-up by invite only | `false` |
| `batch` | How many invites one call may issue (1 to 50) | 1 |

| Rule | Asked | Answers whether `user` may |
|---|---|---|
| `claim({ user, session, userId })` | When an invite is issued, and again for its issuer (`session: undefined`) when it is redeemed | Issue an invite that claims the account `userId` |
| `create({ user, session, email?, name? })` | The same | Issue an invite that creates an account, with the fields it pre-fills |
| `allInvites({ user, session })` | When invites are listed or revoked | Reach every issuer's invites; otherwise a caller reaches only their own |

Because `claim` and `create` are asked again at redemption, an invite your rules no longer allow, or a blocked
issuer's, is dead. An account to claim has no password and its credential step open, as `/admin/create-user` makes one
without a password: an invite never takes over an account someone holds a password of.

```ts
// src/onboarding.invites.ts
import { onboardingOf } from "@aventara/better-auth-onboarding";
import { access } from "./access.onboarding.js";

/**
 * A link for a QR code: `newcomerEmail` gets an account by it, made at redemption.
 * The code is in the fragment, which the browser never sends to a server or in a
 * Referer: the join page reads it from `location.hash` and redeems it.
 */
export const newcomerLink = async (adminId: string, newcomerEmail: string) => {
	const { invites } = await onboardingOf(access).issueInvite({
		issuedBy: adminId,
		kind: "link",
		create: { email: newcomerEmail },
	});
	return `https://app.example.com/join#code=${invites[0]?.code ?? ""}`;
};

/** A code to read out to a member of staff an admin made without a password. */
export const staffCode = async (adminId: string, staffId: string) =>
	(
		await onboardingOf(access).issueInvite({
			issuedBy: adminId,
			kind: "code",
			userId: staffId,
		})
	).invites[0]?.code;
```

- Each code is answered once. Only an HMAC of it, keyed from Better Auth's secret, is stored.
- An invite link is a credential until it is redeemed: whoever holds it claims the account. Keep it out of query
  strings, logs and analytics. Put it in the URL's fragment, as above, or serve the page that reads it with
  `Referrer-Policy: no-referrer`.
- `POST /onboarding/invite/redeem` (`authClient.onboarding.invite.redeem({ code, identifier?, data? })`) takes Better
  Auth's origin check and its rate limit. Every refusal of the invite itself answers `401 ONBOARDING_INVITE_INVALID`,
  whatever the cause. Two answers are not refusals of the invite: a link that creates an account, redeemed without the
  `data.email` or `data.name` it does not pre-fill, answers `400` and stays good; under `"strict"`, an unverified
  address answers Better Auth's `403 EMAIL_NOT_VERIFIED` ([Email verification](#email-verification)). The fifth wrong
  typed code for an account locks its codes for 15 minutes; the codes stay good after it.
- The routes `POST /onboarding/invite/issue` (`403 ONBOARDING_INVITE_REFUSED` when the rule refuses),
  `GET /onboarding/invite/list` and `POST /onboarding/invite/revoke` serve a signed-in caller; the client has
  `authClient.onboarding.invite.issue`, `.list` and `.revoke`. The server has `issueInvite`, `listInvites({ by })` and
  `revokeInvite(inviteId, { by })`.
- A user with a second factor claims nothing by an invite: they sign in with it instead.
- With `requiredForSignUp: true`, Better Auth creates a user only through an invite, `/admin/create-user`, or your
  server's own code outside a request. Every other way (an email sign-up, a social provider's first sign-in, a magic
  link or code for a new address, an anonymous sign-in, any other plugin's sign-up) is refused with
  `401 ONBOARDING_INVITE_INVALID`, for a new address and a taken one alike.
- An account an invite creates starts with `emailVerified: false`.

## Your server's own calls

No route opens these:

| Call | Does |
|---|---|
| `onboardingOf(auth).setStatus(userId, status, { reason?, by? })` | `"active"`, `"pending"` or `"deactivated"`; a blocking status ends the user's sessions, attempts and OAuth tokens at once |
| `reopen(userId, step, { reason? })` | Opens a step again and ends the user's sessions (not the two-factor or the email step) |
| `setTemporaryPassword(userId, password)` | Sets a password the user changes at their next sign-in |
| `check(userId)` | `"complete"`, `"open"` or `"blocked"`: whether the user could be given a session now |
| `records(userId)` | What the plugin stores of each step for the user |
| `issueInvite`, `listInvites`, `revokeInvite` | The invites ([above](#invites)) |

`onboardingOf` takes a Better Auth instance with `onboarding()` in its plugins, or the instance `createAccess` built.
For a session `canManage` allows, the same calls are routes: `POST /onboarding/admin/set-status`
(`{ userId, status, reason? }`), `POST /onboarding/admin/reopen` (`{ userId, step, reason? }`) and
`GET /onboarding/admin/records?userId=`. With SCIM, call `setStatus(userId, "deactivated")` where a user is set
`active: false`.

## Security notes

- **The gate runs after each sign-in path's own check.** A wrong password gets Better Auth's own answer; only the
  holder of the credential learns that steps are open or that the account is blocked.
- **A TOTP secret and its backup codes are shown once,** on the screen that begins the step. On a device several
  people share, use `twoFactorStep({ methods: ["otp"] })` (a code sent to the user) or leave the step out, and have
  users enrol an authenticator app on their own device.
- **Staff who only work at a till** use the kiosk's PIN path, with the steps a till cannot hold scoped off for them
  ([Staff who only work at a till](#staff-who-only-work-at-a-till)).
- **Without the email step, and not `"strict"`**, whoever signs up by email, or redeems an invite that creates an
  account, may type someone else's address. Onboarding then lets them set a password, enrol an authenticator app or a
  passkey, accept terms and fill in the profile, all on an address nobody proved. When the owner later verifies the
  address (or resets the password), that second factor and that passkey survive: Better Auth's cleanup of an unproven
  account, at a magic link or an email code, strips its sessions and linked accounts (a password among them), not its
  passkeys or its two-factor rows. With open sign-up or invites that create accounts, list `verifiedEmailStep()`
  first, use `"strict"`, or turn email sign-up off (`disableSignUp: true`). Unless the mode is `"strict"`, the email
  step comes before every step the user completes, so an unproven attempt enrols nothing in the owner's name. A
  password set with the sign-up itself survives a proof by the verification link, as with Better Auth alone.
- **Whoever may issue invites that create accounts can learn whether an address has an account:** issuing one that
  pre-fills a taken address answers `400`, and redeeming one with a taken address answers the one refusal and spends
  the invite. Give `create` to people you would tell that anyway; redemptions are held to Better Auth's rate limit.
- **API keys act as their owner.** A blocked owner's key is refused (list `apiKey()` before `onboarding()`). Your
  server's own `auth.api.getSession({ headers })` with a key is answered by the API-key plugin before the onboarding
  plugin is asked: a route that authenticates that way also asks `onboardingOf(auth).check(userId)`. Access does this
  for you.
- **Impersonation** of a user who must onboard is refused, and the admin gets no attempt.
- **Cookie caches and `jwt()` tokens** outlive a status change by at most `cookieCacheCap` and `jwtLifetimeCap`. With
  `session.disableSessionRefresh`, a step opened by time or configuration applies only at the next sign-in: use
  `reopen` when it must apply now.

## What the plugin refuses

When Better Auth builds its context (the first request, or `await auth.$context` / `await access.api.ok()`), the plugin
refuses, with an error whose `code` is `ONBOARDING_OPTIONS_INVALID` and a sentence that says what to change:

| Refused | Why |
|---|---|
| Better Auth's memory adapter (`memoryAdapter`, or no `database`, which Better Auth runs on it) | It enforces no unique index, and the attempts' and invites' single use rests on the tables' unique columns ([Tables and codes](#tables-and-codes)) |
| `advanced.database.generateId: "serial"` | The single-use checks are off under numeric ids |
| `advanced.database.generateId: false`, or the earlier `advanced.generateId: false` | The database would make the ids, which onboarding does not support. A `generateId` function is not checked |
| `advanced.disableOriginCheck` and `advanced.disableCSRFCheck`; the same checks off in Better Auth's context (another plugin's `init`), but `@better-auth/sso`'s SAML paths; Better Auth's test mode (`TEST` set outside NODE_ENV=test); a trusted origin whose host is a wildcard alone (`"*"`, `"http://*"`) | A page on any site could complete a step on the user's session cookie, or sign a user in. List the app's other origins in `trustedOrigins` instead; a wildcard there is warned of outside `NODE_ENV=production` ([Trusted origins and wildcards](/docs/hosts#trusted-origins-and-wildcards)). Under NODE_ENV=test, Better Auth's default stands |
| Another plugin under `/onboarding/`, or a second onboarding plugin | It would answer for the steps |
| `twoFactor()` or `apiKey()` listed after `onboarding()` | Their hooks must run first |
| `session.cookieCache` over `cookieCacheCap`, or `jwt()` tokens over `jwtLifetimeCap` | A blocked user would keep a session or a token longer |
| `haveIBeenPwned()` whose `paths` leave out `/onboarding/complete-step` | A breached password would pass the credential step |
| `bearer()`, `multiSession()`, `jwt()`, `lastLoginMethod()` or `anonymous()` before `onboarding()`, while sign-up signs users in | They read the session the plugin opens at sign-up |
| `twoFactorStep()` without `twoFactor()` or with a method it does not offer; `passkeyStep()` without the passkey wiring | The step could never close |
| `verifiedEmailStep()` without `sendVerificationEmail`; the email settings of [Email verification](#email-verification) | The same |
| `profileStep()` listing a field the user may not set | The user would write it |

`onboarding()` itself refuses bad step lists (an id twice, an id outside `[a-z0-9-]`, a custom step with a built-in id),
`invites` without `credentialStep()`, `requiredForSignUp` without `canInvite`, `"lenient"` without the email step, and
a completable step before the email step. An option another plugin adds when it starts is checked at the first
request, which then fails, and so does every request after it, until the options are fixed.

## Tables and codes

The plugin adds three tables, and no user or session column. `npx auth@~1.7.12 generate --yes` writes them into your
schema, or `npx auth@~1.7.12 migrate` creates them, with their unique indexes (`onboardingStep.key`, each
`secretHash`): those indexes are what keep an attempt and an invite single-use. Tables made by hand must have them
too: Better Auth's schema check compares tables and columns, not indexes.

| Table | Holds |
|---|---|
| `onboardingStep` | One row per user and step: `key`, `userId`, `step`, `state`, `status`, `reason`, `openedAt`, `completedAt`, `changedBy`, `passwordChangedAt`, `version` (the terms version accepted), `updatedAt` |
| `onboardingAttempt` | The attempts: `secretHash` and `credential` (sealed), `userId`, `amr`, `dontRemember`, `failures`, `createdAt`, `expiresAt` |
| `onboardingInvite` | The invites and the typed codes' try counts: `secretHash` (sealed), `kind`, `userId`, `create`, `issuedBy`, `name`, `heldAt`, `heldFor`, `failures`, `createdAt`, `expiresAt` |

The plugin declares all three whether or not invites are on. The two-factor and passkey steps add no table: they use
the `twoFactor` table and the user's `twoFactorEnabled` column of Better Auth's two-factor plugin, and the passkey
plugin's `passkey` table, which their own migrations bring.

| Code | Status | When |
|---|---|---|
| `ONBOARDING_REQUIRED` | 403 | A step to complete; on a sign-in path the attempt is set. Also a passkey registration that asks for a session without one |
| `ONBOARDING_BLOCKED` | 403 | A blocking step is open (`status` in the body for the status step); no attempt |
| `ONBOARDING_ATTEMPT_INVALID` | 401 | No attempt, or an expired, replaced, ended or unknown one, or one beside a live session |
| `ONBOARDING_STEP_INVALID` | 400 | Not the current step |
| `ONBOARDING_STEP_FAILED` | 400 | A failed try; the message says why |
| `ONBOARDING_SECOND_FACTOR_REQUIRED` | 403 | A user with a second factor signed in without it, or calls a step in an attempt that did not prove it |
| `ONBOARDING_MANAGE_REFUSED` | 403 | `canManage` did not answer `true` |
| `ONBOARDING_INVITE_INVALID` | 401 | An invite refused, whatever the cause; a sign-up outside an invite under `requiredForSignUp` |
| `ONBOARDING_INVITE_REFUSED` | 403 | `canInvite` did not answer `true` |
| `ONBOARDING_OPTIONS_INVALID` | thrown, or 500 | The plugin's options, or Better Auth's beside it, would let a user past onboarding |
| `EMAIL_NOT_VERIFIED` | 403 | Better Auth's own, under `"strict"`: a user whose email is not verified |

The plugin's events (`plugin.$onboarding.subscribe(listener)`) carry no password, attempt, invite code or token.
