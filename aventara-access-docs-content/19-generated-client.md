---
title: The generated client
description: "Decide for a service that does not run on Aventara, with two generated TypeScript files."
order: 19
section: multi-service
---

# The generated client

A service that does not run on Aventara decides with a generated client: two TypeScript files that import nothing
else. The service needs no Access version at run time.

| File | What it holds |
|---|---|
| `src/generated/avAccess.ts` | The one the service imports. It exports `access` and the client's types, and holds the pulled policies file, the denies the org's guardrails add to it, and the namespace's Resource types. |
| `src/generated/avAccess.internal.ts` | The copy of Access's decisions it imports. Nothing in it is the client's API. |

## The steps

```sh
avaccess schema --orm prisma7      # prisma/schema.prisma → src/generated/avAccess.schema.ts
avaccess push src/access.rules.ts  # with the namespace's push key
avaccess pull                      # with its pull key
avaccess generate --orm prisma7    # the pulled files → src/generated/avAccess.ts and avAccess.internal.ts
```

1. `avaccess schema` reads the service's Prisma schema (`--schema`, default `prisma/schema.prisma`; a folder of
   `.prisma` files reads as one) into a module that exports `model`. It leaves out, and lists, what it cannot model: an
   `Unsupported(...)` column, a composite `type`, a `view`, an `@ignore`d field or model. `schema` requires `--orm`;
   `prisma7` is the first.
2. Author the rules against that module, and push them ([Namespaces, the registry and the CLI](/docs/registry-and-cli)).
3. Pull them back.
4. Generate the client.

```ts
// src/access.rules.ts
import { definePolicies } from "@aventara/access";
import { model } from "./generated/avAccess.schema.js";

export const rules = definePolicies(model, { namespace: "chat" })
	.principal<{ profileId: string }>()
	.govern("Message", ["body"])
	.grants(({ grant, me }) => [
		grant("anyone", "read", "Room", { where: { kind: "PUBLIC" } }),
		grant("signedIn", "read", "Message", {
			where: { authorId: me.profileId },
			fields: ["Message.body"],
		}),
	]);
```

Only the rules file imports `@aventara/access`. It is authoring, not run time.

`avaccess generate` runs the same check as `avaccess verify` first: a pulled file edited by hand is refused and nothing
is written. Regenerate after each pull, for example in the service's `postinstall`:
`avaccess verify && avaccess generate --orm prisma7`. The same pulled files, translator and Access version give the same
bytes. Never edit the generated files.

| Command | Flags |
|---|---|
| `avaccess schema` | `--orm` (required), `--schema <path>` (default `prisma/schema.prisma`), `--out <file>` (default `src/generated/avAccess.schema.ts`) |
| `avaccess generate` | `--orm` (default `none`), `--out <file>` (default `src/generated/avAccess.ts`; the internal file is written beside it), `--tsconfig <file>` |

## The translator

`--orm` names the translator. For `generate` it is optional:

| `--orm` | The client's `access` |
|---|---|
| `none` (the default) | `can`, `grantsOf`, `scopeOf`, `fieldsOf` and `checkBeacons`, answering in Aventara's `where`. No ORM's name anywhere. |
| `prisma7` | The same, plus `prismaWhere`, `readable`, `prismaExists` and `prismaBeacon`, and the Prisma types |

The generated file's banner always spells `--orm` out.

## The tsconfig

`avAccess.ts` imports `avAccess.internal.ts` with the extension the project's `tsconfig.json` asks for, as Prisma 7's
`prisma-client` does: `.js` under `nodenext`, none under `moduleResolution: "bundler"` or `module: "commonjs"`, `.ts`
with `allowImportingTsExtensions` or `rewriteRelativeImportExtensions`.

The tsconfig is the nearest one above the generated file (`extends` followed; in a solution-style root, the referenced
project that includes the file), or the one `--tsconfig <file>` names. A project with no tsconfig is refused and
nothing is written: JavaScript projects are not supported yet.

## Deciding with it

```ts
// src/messages.read.ts
import { access } from "./generated/avAccess.js";
import type { PrismaClient } from "./generated/prisma/client.js";

/** The service's principal: the profile its token maps to, and the token's claims. */
export type Principal = { profileId: string; claims: { role?: string } };

/** A room's messages this principal may read, with the fields it sees on every row. */
export async function readMessages(
	prisma: PrismaClient,
	principal: Principal | null,
	roomId: string,
) {
	const question = {
		principal,
		origin: "client",
		resource: "Message",
	} as const;
	const scope = access.scopeOf({ ...question, action: "read" });
	if (scope === false) {
		return null; // refused
	}
	return prisma.message.findMany({
		where: { AND: [{ roomId }, access.prismaWhere("Message", scope)] },
		select: access.readable(question),
	});
}

/** Whether this principal may post `body` in a room, asking Prisma what the row does not carry. */
export async function mayPost(
	prisma: PrismaClient,
	principal: Principal,
	roomId: string,
	body: string,
) {
	return access.can({
		principal,
		origin: "client",
		action: "create",
		resource: "Message",
		row: { roomId, authorId: principal.profileId, body },
		exists: (resource, where) => access.prismaExists(prisma, resource, where),
	});
}
```

| Member | Answers |
|---|---|
| `can`, `grantsOf`, `scopeOf`, `fieldsOf` | As the engine does, in Aventara's `where` |
| `checkBeacons(reader, pins, environment)` | The startup beacon check ([Beacons and `foreign`](/docs/beacons-and-foreign)) |
| `prismaWhere(resource, scope)` | A scope as a Prisma `where`; `false` matches no row |
| `readable(question)` | The fields a read shows on every row, as a Prisma `select`. A field governed for reading and opened on some rows only is left out (one governed for writing only is read as any other), and no relation is selected. |
| `prismaExists(prisma, resource, where)` | `can`'s `exists`, through your Prisma client |
| `prismaBeacon(prisma)` | An `AccessBeaconStore` over a Prisma model of `_aventara_beacon` |

## Weaker guarantees

Inside Aventara, every request goes through the policy: reads, writes, nested writes and selections. A generated client
only answers questions. The service must ask them, and use the answers, on every path.

- **The scope covers only the queries you pass it to.** A query that forgets `prismaWhere` reads every row.
- **A Prisma `include` is not scoped.** Only `select: access.readable(question)` holds the fields, and it selects no
  relation.
- **The principal is yours to build.** Verify the bearer token against the Access server's key set
  (`/api/auth/jwks`) before you build the principal. The client does not read tokens.
- **Updates need your transaction.** Aventara checks the row an update leaves inside the update's transaction and
  rolls back. The client cannot do that for you (below).
- **Rows are yours to hand over.** Hand `can` the row's own fields. It never reads a relation on the row, and a client's
  relation data never belongs there.

## Updates

1. Run the update on the rows `scopeOf({ action: "update" })` returns.
2. In the same transaction, read each row before you update it. Ask `access.grantsOf({ action: "update", row })` about
   it, with the same `exists`.
3. Hold the update to that row (its values in the update's `where`), so a concurrent change makes the update miss
   instead of passing on a stale `before`.
4. Ask `access.can({ action: "update", row, before, beforeGrants })` about each row the update leaves, and roll back on
   `false`.

Without `before`, `can` checks only the row the update leaves. Without `beforeGrants`, it asks the row before's relation
conditions when you ask `can`, after the write. [Updates](/docs/updates) explains why.
