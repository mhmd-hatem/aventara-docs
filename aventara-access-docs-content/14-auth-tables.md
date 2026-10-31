---
title: Better Auth tables as Resources
description: "Which of Better Auth's tables the rules may open, which columns stay sealed, and authTables."
order: 14
section: guides
---

# Better Auth tables as Resources

Better Auth's tables are in your schema, so the framework sees them as Resources. Access runs built-in rules over every
one of them. These rules only narrow. `resources` decides which tables your rules may open:

| Key | Opens | Writes through Aventara |
|---|---|---|
| `users: true` | `user`, `session` and `account` (session and account read only) | on `user`, an update of `role`, by a grant that names it |
| `members: true` | the organization plugin's `member`, and its `organization` (read only) | on `member`, a create, an update of `role` by a grant that names it, and a delete |

- Every other Better Auth table stays closed: `verification`, `jwks`, the organization plugin's `invitation`,
  `twoFactor`, `deviceCode`, and Access's own tables. A key that is off leaves its tables closed too.
- An opened table is read as your rules grant. Writes are limited because a write through Aventara skips Better Auth's
  hooks, its cookie cache and its secondary storage. Change a name or an email through Better Auth's API.
- `role` is a claim, so Access governs `user`'s `role` as `"write"` ([Governed fields](/docs/rules#governed-fields)):
  an update grant sets it only when it names it. To let an admin set roles, add `.govern("User", { role: "write" })`
  to your rules, which lets a grant name the field, and `fields: ["User.role"]` to that admin's update grant, ideally
  with `where: { NOT: { id: me.id } }` so an admin cannot change their own role. Never name it in a grant for
  `signedIn`, `anyone` or any role a user can reach on their own. Users edit their profile through Better Auth's
  `/update-user`.
- With `members: true`, `member`'s `role` is governed the same way: a create or update grant sets it only when it
  names it. Name it only in an organization admin role's grant, held to `where: { organizationId: me.org }`.
- `members: true` needs Better Auth's `organization()` plugin with `requireEmailVerificationOnInvitation: true`
  ([The organization bridge](/docs/better-auth-plugin#the-organization-bridge)).
- `explain` and the audit log name a built-in deny `better-auth:<Resource>` (a closed table) or
  `better-auth:<Resource>/<actions>` (a write an opened table never takes).

The project `aventara new` creates has its own `User` model. Once Better Auth's tables are in the schema, it is Better
Auth's `user` table, so a rule on `User` needs `resources: { users: true }`.

## Sealed columns

No grant opens these, on any table, so a request that selects, filters or sorts by one is refused:

| Table | Sealed columns |
|---|---|
| `account` | `password`, `accessToken`, `refreshToken`, `idToken` |
| `session` | `token` |
| `verification` | `identifier`, `value` |
| `jwks` | `privateKey` |
| `twoFactor` | `secret`, `backupCodes` |
| `deviceCode` | `deviceCode`, `userCode` |
| `accessKey` | `keyHash` |

Exempt these columns from your Contracts, or govern them, so a read that names no field leaves them out instead of
being refused.

## Which Resource is which table

Access must know which Resource is which of Better Auth's tables, or it could not keep them closed and their secrets
sealed.

- **On Better Auth's Prisma adapter** (`prismaAdapter`), Access finds each table by the Prisma model the adapter reads
  it through. There is nothing to configure, and `resources.authTables` is refused.
- **On any other adapter** (Better Auth's built-in Kysely on a `pg` Pool or SQLite, Drizzle, MongoDB, your own), nothing
  ties a table to a Resource by name. You name them: `resources.authTables` maps every table Better Auth is built with
  (its plugins' and Access's own included) to its Resource, or to `null` when the rules' schema does not have it.

```ts
// src/auth-tables.ts
/**
 * Better Auth on a pg Pool, its tables mapped to models of the app's own naming:
 * `resources: { users: true, authTables }`. Better Auth here has `user`, `session`,
 * `account`, `verification` and `jwks` (and `twoFactor` with that plugin, and so on).
 */
export const authTables = {
	user: "AuthUser",
	session: "AuthSession",
	account: "AuthAccount",
	verification: null,
	jwks: null,
};
```

`null` means "this table is not in the rules' schema", never "closed". The map is held to the schema, and refused with
`ACCESS_OPTIONS_INVALID` where they disagree:

- A table's Resource must exist, be no other table's, and have every column of the table under Better Auth's field
  name for it. An `@map` that renames one is refused: Access could not seal what it cannot find.
- A table mapped to `null` must not be in the schema under another name.

## When the checks run

These checks run when `access.policy` is first read, which is when the framework is built.

- A key whose tables Better Auth lacks, or that the rules' schema lacks, is refused with `ACCESS_RESOURCE_MISSING`: add
  the plugin, or run `npx auth@~1.7.12 generate` and regenerate the model.
- A grant on a closed table, or of a write the table never takes, is refused with `ACCESS_OPTIONS_INVALID`.

The instance itself still builds, so `npx auth@~1.7.12 generate` can load your configuration before the schema has the
tables.
