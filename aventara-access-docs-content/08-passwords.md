---
title: Passwords
description: "Argon2id hashing: the default, the two profiles, rehashing at sign-in, moving off scrypt and Node.js 22."
order: 8
section: guides
---

# Passwords

Better Auth hashes passwords with scrypt. `createAccess` and the Better Auth plugin `aventaraAccess()` hash them with
argon2id instead. There are three ways to set it up:

1. **The default.** Set neither `passwords` nor `betterAuth.emailAndPassword.password`. Passwords are hashed with
   argon2id at the `"owasp-minimum"` profile.
2. **A named profile.** `passwords: { argon2id: "rfc9106-low-memory" }` beside `betterAuth`. A misspelled profile is a
   type error, and is refused at run time with `ACCESS_OPTIONS_INVALID`. Add `legacyScrypt: true` to accept
   passwords Better Auth already stored with scrypt.
3. **Your own hook.** Set Better Auth's `emailAndPassword.password` (`hash` and `verify`) in the `betterAuth` block. It
   is used as you wrote it, and Access installs nothing. To keep Better Auth's scrypt, pass its own functions.

```ts
// src/access.passwords.ts
import type { AccessPasswordsOptions } from "@aventara/access/auth";
import type { BetterAuthOptions } from "better-auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";

// 1. The default: leave `passwords` out, and `emailAndPassword.password` too.
export const byDefault = {
	enabled: true,
} satisfies BetterAuthOptions["emailAndPassword"];

// 2. A named profile: createAccess({ betterAuth, policies, passwords }).
export const passwords = {
	argon2id: "rfc9106-low-memory",
} satisfies AccessPasswordsOptions;

// 2b. The same, for an app whose users Better Auth signed up with scrypt.
export const movingOffScrypt = {
	argon2id: "owasp-minimum",
	legacyScrypt: true,
} satisfies AccessPasswordsOptions;

// 3. Your own hook, here Better Auth's scrypt: betterAuth: { emailAndPassword }, and no `passwords`.
export const emailAndPassword = {
	enabled: true,
	password: {
		hash: hashPassword,
		verify: verifyPassword,
	},
} satisfies BetterAuthOptions["emailAndPassword"];
```

Setting both `passwords` and `betterAuth.emailAndPassword.password` is refused with `ACCESS_OPTIONS_INVALID`, so it is
never in doubt which one hashes.

## The profiles

| Profile | Memory | Passes (`t`) | Lanes (`p`) | Source |
|---|---|---|---|---|
| `"owasp-minimum"` (the default) | 19 MiB (`m=19456`) | 2 | 1 | [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| `"rfc9106-low-memory"` | 64 MiB (`m=65536`) | 3 | 4 | [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html) section 4, the second recommended option |

Both use a 16-byte random salt and a 32-byte tag. RFC 9106's first recommended option (2 GiB of memory per hash) is
not offered: a server that signs users in concurrently cannot spend 2 GiB on each.

## How hashes are stored and checked

- A hash is a PHC string, `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`. Verifying reads the parameters from the
  stored string, so you can move to another profile later and every older hash still verifies. The hash is compared in
  constant time.
- Every check costs one argon2id computation at your profile, whatever the stored value is, so the time a check takes
  does not say what an account holds. One exception: after you move to another profile, a hash stored at the old one
  is checked at the old one's cost, so the time a sign-in takes can tell such an account apart (and that it exists)
  until its user next signs in, which rehashes it at your profile (below). Active users' hashes move; an account
  nobody signs in to keeps the old cost until its password is set again.
- A stored hash that costs more than the largest profile (`m` over 65536, `t` over 3, `p` over 4) is refused without
  being computed, with a warning in Better Auth's log. A tampered row cannot make a sign-in allocate gigabytes.
- A corrupted value, or a failure inside the computation, fails the check like a wrong password. A check never throws.
- A password longer than Better Auth's `emailAndPassword.maxPasswordLength` (128 by default) is never hashed:
  `PASSWORD_TOO_LONG` (`400`). Passwords are NFKC-normalised before hashing, as Better Auth's scrypt does.
- Better Auth's plugins that hash or check a password (`admin`, `username`, `phone-number`, `email-otp`, two-factor)
  use the same hook.

## Rehashing at sign-in

A sign-in whose password matches a hash stored at other parameters than your profile's (an older profile, a cheaper or
a costlier one) stores the password again at your profile. Change the profile, and each active account moves to it at
its next sign-in.

- The hook checks the password against the stored hash itself before it writes anything, so it only ever stores a
  hash of the password that matched. A wrong password changes nothing.
- The write is a compare-and-set: it changes the account only while it still holds the hash just checked. A password
  changed or reset in the meantime is never overwritten. Two sign-ins at once both write a valid hash of the same
  password, and the later one stays.
- Cost: a hash already at your profile costs one read of the credential account per password sign-in, and no write.
  The sign-in that moves a hash costs two argon2id computations more (the check again, and the new hash) and one write.
- The write goes through Better Auth's database adapter, past its `account` update hooks (`databaseHooks`): it is the
  same password, stored anew.
- A failure is logged as an error, without the password or a hash, and the sign-in stands. The next sign-in tries
  again.
- An account with two-factor on may not be rehashed by a password sign-in that its second step holds back: once
  two-factor's hook has ended the session that sign-in opened, there is none to rehash for.
- With your own `emailAndPassword.password` hook, Access rehashes nothing.
- Kiosk PINs move the same way at the next switch ([The kiosk profile](/docs/kiosk)).

## Moving off scrypt

Hashes Better Auth stored with scrypt (`<salt>:<key>` in hex) fail the check by default, with a warning in Better
Auth's log. With `legacyScrypt: true` they verify through Better Auth's own `verifyPassword`, and a sign-in that matches
one stores the password again with argon2id. Each account leaves scrypt at its next sign-in. Once none is left, turn
`legacyScrypt` off.

While it is on, every hash and check also costs one scrypt, so sign-up and sign-in are about twice as slow.

## Node.js 22

argon2id runs on Node.js's own `crypto.argon2`, added in Node.js 24.7.0, with no native dependency. Node.js 22 has
none, so there Access uses `@node-rs/argon2`, an optional peer you install yourself at the exact version Access is
tested against:

```sh
npm install --save-exact @node-rs/argon2@2.2.2
```

It computes the same function, and Access writes and reads the PHC strings itself, so a hash made on Node.js 22
verifies on Node.js 24 and back. On Node.js 24 it is never loaded. On Node.js 22 without it, `createAccess` refuses
with `ACCESS_OPTIONS_INVALID`, unless you hash passwords yourself.

Kiosk PINs are hashed with argon2id at the same profile ([The kiosk profile](/docs/kiosk)).
