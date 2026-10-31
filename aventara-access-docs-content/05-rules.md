---
title: Rules
description: "definePolicies: roles, grants, denies, governed fields and the principal type, plus the four questions the engine answers."
order: 5
section: guides
---

# Rules

`definePolicies` takes your schema and returns a builder for the rules. In an Aventara app the schema is the discovery
artifact's `model`, which `aventara:prepare` writes. Every name in a rule is checked against it: a Resource, field,
relation or enum value that does not exist is a type error at the key that names it.

## A first set of rules

```ts
// src/access.policies.ts
import { definePolicies } from "@aventara/access";
import { model } from "./generated/aventara/discovery.artifact.js";

/** What your app derives for a request: the signed-in user, or null. */
export type Principal = {
	id: string;
	claims: { role?: "admin"; banned?: boolean };
};

export const policies = definePolicies(model)
	.principal<Principal>()

	.roles(({ me }) => ({
		// A global role, read from the principal's claims.
		admin: { global: { claims: { role: "admin" } } },
		// Roles held on a row: a member of a campaign, as DM or player.
		dm: {
			on: "Campaign",
			where: { members: { some: { userId: me.id, role: "DM" } } },
		},
		player: {
			on: "Campaign",
			where: { members: { some: { userId: me.id, role: "PLAYER" } } },
		},
	}))

	// Governed fields: out of every default projection, and written by no grant that
	// does not name one; a grant that names one opens it.
	.govern("User", ["email"])

	.grants(({ grant, me }) => [
		grant("signedIn", "read", "User"),
		grant("signedIn", "read", "User", {
			where: { id: me.id },
			fields: ["User.email"],
		}),
		grant("admin", "read", "*", { fields: ["User.email"] }),
		grant("signedIn", "create", "Campaign"),
		grant(["dm", "player"], "read", "Campaign"),
		grant("player", "read", "Note", {
			in: "campaign",
			where: { visibility: "PARTY" },
		}),
		grant("dm", ["read", "create", "update", "delete"], "Note", {
			in: "campaign",
		}),
	])

	.denies(({ deny }) => [
		deny("*", "*", { if: { claims: { banned: true } } }),
		deny("delete", "*", { if: { origin: "agent" } }),
	]);
```

In a Next.js app, `aventara:prepare` writes the artifact to `src/aventara/generated/discovery.artifact.ts`. Import the
model from `@/aventara/generated/discovery.artifact` there.

## The building blocks

| Call | What it does |
|---|---|
| `.principal<P>()` | Types `me` in every callback |
| `.roles(({ me }) => ({ … }))` | Names roles: `global` (from claims) or held `on` a Resource's row (`where`) |
| `.govern(resource, fields)` | Governs fields: a list for reads and writes, or `{ field: "write" \| "read" \| "both" }` |
| `.grants(({ grant, me }) => [ … ])` | `grant(subjects, actions, resources, options?)` |
| `.denies(({ deny }) => [ … ])` | `deny(actions, resources, options?)` |
| `.contract()` | Compiles the rules to a policies file |
| `.engine(options?)` | Builds the engine from the rules |

The built-in subjects are `signedIn` (any non-null principal) and `anyone` (the anonymous caller, `null`, too). A
grant's options are `name`, `where`, `in`, `fields`, `after` and `write: { except }`. A deny's options are `name`,
`where` and `if: { claims, origin }`.

## How the rules combine

- Nothing is allowed until a grant allows it.
- Any grant that matches allows. Any deny that matches wins over every grant. The order of rules never matters.
- `in: "campaign"` means the subject holds its role on the row's `campaign`.
- `if: { origin: "agent" }` matches an AI agent's request through the framework's MCP endpoint. The other origins are
  `client` (a user's request) and `application` (your server's own).
- The principal is an object, an instance of a class included. An array, a function or a primitive is anonymous. Its
  values are read from its own properties, never from its prototype.

## Writing a reference needs read on its target

A row that points at another row holds a reference: a `Member` holds its `profileId`, a `Note` its `authorId`. When a
create or an update sends a reference to a Resource your app serves, Aventara checks that the caller may read the row
it points at. When no read grant covers that row, the write is refused with `A4002`, whatever the write grant allows,
and the message names the Resource:

```text
The policy does not allow this write to link a row of Resource "Profile" outside what the caller may read.
```

So a role that writes a reference needs read on the Resource the reference points at. For Better Auth's `User` table, that read grant also needs `resources: { users: true }` in `createAccess`. The TTRPG example keeps its game
data on a `Profile`, apart from Better Auth's `User`. A DM seats a player by creating a `Member` with the player's
`profileId`, and a player writes notes and owns characters through `authorId` and `ownerId`. Each of those writes needs
read on `Profile`:

```text
grant("signedIn", "read", "User"),
grant("signedIn", "read", "Profile"),   // without it, no DM can seat a player
grant("dm", ["create", "delete"], "Member", { in: "campaign" }),
```

That grant is the simplest fix, and it is wide: every signed-in user can list every profile, a user directory. It can
be narrowed like any other read grant, with a `where` or with governed fields, and the caller can then link only the
rows it lets it read. To let a user read their own profile and those of the people they share a campaign with:

```text
grant("signedIn", "read", "Profile", {
  where: {
    OR: [
      { id: me.profileId },
      { members: { some: { campaign: { members: { some: { profileId: me.profileId } } } } } },
    ],
  },
}),
```

A DM can then seat only a player who already shares a campaign with them. Bring in a newcomer some other way (an
invitation the player accepts, which creates their own `Member`), or keep the wide grant.

When Aventara hosts the engine, it tells the engine which Resources it holds a written reference to: every Resource
its Core Contract shows, so none your root `exemptions` hide. The engine then warns about each role that may create or
update a reference to one of them that no read grant reaches for that role:

```text
(node:4242) [ACCESS_REFERENCE_UNREADABLE] AventaraAccessWarning: dm may write Member.profileId, Note.authorId and Character.ownerId, references to Resource "Profile", but no read grant on "Profile" reaches dm. …
```

The warning comes when the framework starts (`@aventara/core` `1.0.0-rc.10` or later), not when the rules compile:
`.contract()`, `.engine()` and `avaccess push` print nothing, since only your app's configuration says which Resources
it serves. A reference to a Resource the app hides is not held, so it is not warned about. A service that does not run
on Aventara (a generated client, the standalone server) holds no reference and gets no warning.

It is a warning only: the engine decides exactly as before. A read grant reaches a role when it names that role,
`signedIn` or `anyone`. A grant that names the target Resource itself also reaches a `signedIn` writer, whatever role it
names, and reaches a role held on rows of one Resource when it names another role held on that same Resource, since one
caller can hold both. When the target is a Better Auth table that stays closed until a `resources` key opens it
(`User`, until `resources: { users: true }` in `createAccess`), the warning names that key too: no grant on the table
is taken before it is opened. A reference the write grant locks with `write: { except }` is not warned about. A
reference to a foreign Resource is not either: see below. Each warning is printed once per process and namespace. Node's
`--disable-warning=ACCESS_REFERENCE_UNREADABLE` silences it.

### A reference to a foreign Resource

A foreign Resource ([Beacons and `foreign`](/docs/beacons-and-foreign)) is read in conditions and never granted on, so
no caller reads a row of it, and Aventara cannot hold a reference to it to the rows the caller may read. The engine
lists the rules' foreign Resources in `unheld` (`@aventara/core` `1.0.0-rc.10` or later), and Aventara does not hold a
reference to them: the write grant alone decides which row may be linked. A chat `Room` that holds the `campaignId` of
a `Campaign` the campaign service owns is linked to whatever campaign the grant allows. So constrain the link through
the relation: a `where` on a create grant, an `after` on an update grant (an update grant's `where` is checked on the
row it leaves too, [Updates](/docs/updates#an-update-that-changes-a-reference)):

```text
grant("signedIn", "create", "Room", {
  where: { campaign: { members: { some: { userId: me.id } } } },
}),
grant("signedIn", "update", "Room", {
  where: { ownerId: me.id },
  after: { campaign: { members: { some: { userId: me.id } } } },
}),
```

Without such a condition, the caller can link any row of the foreign Resource by its identifier. When Aventara hosts
the engine, it warns about each role whose create or update grant may write a reference to a foreign Resource with no
condition through that relation:

```text
(node:4242) [ACCESS_FOREIGN_REFERENCE_UNCHECKED] AventaraAccessWarning: signedIn may write Room.campaignId, a reference to Resource "Campaign", which namespace "campaign" owns (foreign), and no condition of the write grant reads that relation, so any row of "Campaign" can be linked by its identifier. …
```

A condition counts when it filters through the relation (`campaign: { … }`), compares the reference field with
`equals` or `in` (`campaignId: me.campaignId`), or is the grant's `in: "campaign"`, and holds in every branch of an
`OR`. One under a `NOT`, or a `not` comparison, still lets every other row in. A reference the grant locks with
`write: { except }` is not warned about. Node's `--disable-warning=ACCESS_FOREIGN_REFERENCE_UNCHECKED` silences it.

Reads do not change: through Aventara a read of a foreign Resource, or an include of one, is still refused
(`A4002`). A row that is not there is refused by your database's foreign key, where it has one, rather than by the
policy, so a caller who may write the reference may tell a row that exists from one that does not by its identifier.

## Missing values fail closed

A rule can read a `me` value the principal lacks. An anonymous principal lacks them all. A missing or `null` property,
an empty string, or a number JSON cannot carry counts as missing.

- A grant that reads a missing value never matches.
- A deny that reads one in its `where` matches, whatever `not` or `NOT` surrounds it.
- A claim the principal lacks fails closed the same way. A global role that compares it is not held, and a deny's `if`
  that compares it holds, whatever value it compares with.

A token Access issues carries every declared boolean claim, `false` when the user's field is unset. So
`deny("*", "*", { if: { claims: { banned: true } } })` leaves alone a user whose ban is unset, and denies a token that
lacks `banned` (one from another issuer, or from before the claim was declared). The anonymous caller has no claims: a
comparison with `true` never holds for it, so a ban does not close an `anyone` grant.

## Typed comparisons

A rule compares a value by its field's type:

| Type | Compared by |
|---|---|
| `decimal` | Value: `1.5`, `"1.50"` and a decimal object are equal |
| `datetime` | Instant: a `Date`, or an ISO-8601 date or instant with its offset. The compiled file holds `toISOString()`'s form. |
| `bigint` | Exactly |

A row value of another type than its field's, or than the rule's `me` value, is unknown. No grant matches it, and a deny
that compares it matches.

Through Aventara, a rule that compares a `datetime`, `decimal` or `bigint` field in a scope or an `exists` question
cannot be used yet: the framework answers `A3000` and the request is refused. It fails closed. `can` on a row, and a
generated client, compare these fields as above.

Strings compare exactly in `can`, code unit by code unit. A column with a case- or accent-insensitive collation can find
rows `can` would not keep. Give the fields your rules compare a binary or deterministic collation.

## Governed fields

A governed field is opened only by a grant that names it (`fields: ["User.email"]`). Each governed field has a mode:

| Form | Reads | Writes |
|---|---|---|
| `.govern("User", ["email"])`, or `{ email: "both" }` | Out of every default projection; a read grant that names it opens it, when the request selects it | Only a create or update grant that names it sets it |
| `.govern("Member", { role: "write" })` | As any other field | Only a create or update grant that names it sets it |
| `.govern("Citizen", { nationalId: "read" })` | As `"both"` | As any other field |

Govern every field your roles, claims or principal read, usually as `"write"`. A role held on a `Member` row reads
`Member.role`; governed as `"write"`, an update grant on `Member` that does not name it cannot change it, and every
reader still sees it. `"read"` fits a field people write and almost nobody reads back, such as a government id.

Selecting a field governed for reading without a grant that opens it is refused with `403 A4002`, and so is setting a
field governed for writing without a grant that names it. The field is never dropped quietly.

- A relation and its reference fields are governed together, with one mode. `.govern("Post", ["author"])` without
  `"authorId"`, or the reverse, is refused when the rules compile.
- A field governed twice with two modes is a type error, and refused when the rules compile.
- A field governed as `"read"` that is unique (one of its Resource's identifiers) still tells writers which values
  exist: a write that sends a value another row holds fails on the duplicate. Compiling the rules or building the
  engine warns `ACCESS_READ_GOVERNED_UNIQUE`. Govern it as `"both"`, or accept the leak.
- `fields` on a Resource with no governed field is a type error that says what to do.
- Access governs Better Auth's `User.role` and the organization `member` table's `role` as `"write"` itself
  ([Better Auth's tables](/docs/auth-tables)).

`write: { except: [...] }` keeps fields out of what a create or an update may set. A relation and its reference fields
are locked together.

## The principal type

`.principal<…>()` types `me` in every callback. Without it, `me.sub` in a `where` and `claims` in a role are type
errors. There are two ways to use it:

- **Your own type**, as above. With `createAccess`, you then pass a `principal` function that maps the verified token to
  it.
- **The token's identity.** `AccessIdentity<typeof claims>` is `{ sub, claims }`, exactly what a verified token carries.
  Pass the same `claims` object to `createAccess` and leave `principal` out.

```ts
// src/identity.policies.ts
import { definePolicies } from "@aventara/access";
import type { AccessIdentity } from "@aventara/access/auth";
import { model } from "./generated/aventara/discovery.artifact.js";

/** The claims a token carries beside `sub`, by type. */
export const claims = { role: "string", banned: "boolean" } as const;

export const identityPolicies = definePolicies(model)
	.principal<AccessIdentity<typeof claims>>()
	.grants(({ grant, me }) => [
		grant("signedIn", "read", "User", { where: { id: me.sub } }),
		grant("signedIn", "create", "Note", { where: { authorId: me.sub } }),
	])
	.denies(({ deny }) => [deny("*", "*", { if: { claims: { banned: true } } })]);
```

## Asking the engine

The engine answers four questions. Each states `principal`, `origin` and `resource`:

```ts
// scripts/fields.read.ts
import { type Principal, policies } from "../src/access.policies.js";

const engine = policies.engine();
const pat: Principal = { id: "pat", claims: {} };

// The fields pat may read on User.
console.log(
	engine.fieldsOf({ principal: pat, origin: "client", resource: "User", access: "read" }),
);
// The fields pat may set when she updates a Note.
console.log(
	engine.fieldsOf({
		principal: pat,
		origin: "client",
		resource: "Note",
		access: "write",
		action: "update",
	}),
);
```

| Method | Answers |
|---|---|
| `can(question)` | Whether the principal may do `action` on `resource`; on `row` when one is given |
| `scopeOf(question)` | The rows the principal may read, update or delete: `true`, `false`, or an Aventara `where` |
| `fieldsOf(question)` | The fields usable on every reachable row (`always`), and those usable on some rows only (`perRow`) |
| `grantsOf(question)` | The update grants that cover a row before an update ([Updates](/docs/updates)) |
| `explain(question)` | In development, which rules took part in a `can` decision. It throws when `NODE_ENV` is `production`. |
| `checkBeacons(reader, pins, environment)` | The startup beacon check ([Beacons and `foreign`](/docs/beacons-and-foreign)) |

The engine also holds `governed` (the fields governed for reading, by Resource), `afterChecks` (the Resources whose updates are
checked after the write) and `paths` (the relation paths and operators each rule filters on) ([Reference](/docs/reference)).

`fieldsOf` takes `access: "read"`, or `access: "write"` with an optional `action` (`"create"` or `"update"`). Anything
else is refused with `ACCESS_QUESTION_INVALID`.

A deny on a nullable field lets the NULL rows through, in `can` and in `scopeOf` alike: `scopeOf` writes the deny's
negation with an `OR` that keeps the NULL rows. A `where` that matches no row is written `{ OR: [] }`.

Next: [Updates](/docs/updates), or [createAccess](/docs/create-access) to put the rules behind Better Auth.
