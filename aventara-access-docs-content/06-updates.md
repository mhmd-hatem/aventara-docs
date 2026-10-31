---
title: Updates, grantsOf and beforeGrants
description: "How Access checks an update twice, and how the row before reaches can."
order: 6
section: guides
---

# Updates, grantsOf and beforeGrants

An update changes a row that a grant covered. The row it leaves must still be one a grant covers, and it must be the
same grant. Access checks an update twice to hold that.

## The two checks

1. **The scope.** `scopeOf({ action: "update" })` picks the rows a grant's `where` covers and no update deny matches.
   The update runs on those rows only.
2. **The row after.** Each row the update leaves must still be covered by an update grant, by that grant's `where` and
   its `after` together, and no update deny may match it.

A grant's `where` is checked on the new row by default. So a grant `where: { authorId: me.id }` does not let the author
hand the row to someone else. `after` adds what the new row must also meet:

```text
grant("signedIn", "update", "Character", {
  where: { ownerId: me.id },
  after: { campaign: { $role: "player" } },
})
```

This lets a player move a character only to a campaign they play in.

## One grant must cover both rows

`can` can take both rows: `row`, the row after, and `before`, the row as it was. One update grant must then cover both:
its `where` the row before, its `where` and `after` the row after. No update moves a row from what one grant reaches to
what another reaches. Update denies are asked about the row after only.

The engine lists in `afterChecks` every Resource whose update grants read the row (a `where`, an `after`, a role held on
a row) or whose update denies have a `where`. Aventara asks `can` about each row such an update changed, with the row
before it, inside the update's transaction, and rolls the update back when one fails. Where it has no interactive
transaction, it refuses those updates.

## An update that changes a reference

An update that changes a reference is held to the same rule as a create
([Writing a reference needs read on its target](/docs/rules#writing-a-reference-needs-read-on-its-target)): the row it
points at must be one the caller may read, where the app serves that Resource. That check comes on top of the two
above. In the TTRPG example a player who hands a character to another player (`ownerId: "olive"`) may read olive's
`Profile`, so the reference passes. The update is refused by the grant itself: its `where` (`ownerId: me.profileId`),
checked on the new row, no longer holds.

A reference to a foreign Resource is not held to what the caller may read (no caller reads one), so the update grant's
own conditions on the new row are all that decide which row it may point at: its `where` and its `after`. Constrain it
through the relation, `after: { campaign: { members: { some: { userId: me.id } } } }`
([A reference to a foreign Resource](/docs/rules#a-reference-to-a-foreign-resource)).

## `grantsOf` and `beforeGrants`

A grant whose `where` reads a relation (`tags: { some: { name: "shared" } }`, or a role held through a membership)
must be judged on what the database held before the update. Otherwise a nested write in the same request could make
it hold: tagging a row "shared" in the same update that hands it to someone else.

So the decision about the row before is made before the write:

1. Before the write, ask `grantsOf({ action: "update", row })` about the row as it is now. It answers the keys of the
   update grants that cover it.
2. After the write, in the same transaction, ask `can({ action: "update", row, before, beforeGrants })`. The grant that
   covers the row after must be one of those keys.

Aventara does this itself for every Resource in `afterChecks` (it needs `@aventara/core` `1.0.0-rc.10` or later). It asks
`grantsOf` after it reads the row and before any of your stages or the write runs.

Outside Aventara, the same two calls look like this:

```ts
// scripts/update.check.ts
import type { AccessExists } from "@aventara/access";
import { type Principal, policies } from "../src/access.policies.js";

const engine = policies.engine();

/** Whether a row of `resource` meets `where`, asked of your database in the update's transaction. */
declare const exists: AccessExists;

type NoteRow = {
	readonly id: string;
	readonly campaignId: string;
	readonly authorId: string;
	readonly body: string;
	readonly visibility: "PARTY" | "PRIVATE" | "DM_ONLY";
};

/** Checks one Note update: `before` as read in the transaction, `after` as the update leaves it. */
export async function mayUpdateNote(
	principal: Principal,
	before: NoteRow,
	after: NoteRow,
): Promise<boolean> {
	const question = {
		principal,
		origin: "application",
		resource: "Note",
		action: "update",
	} as const;
	// Before the write: the update grants that cover the row as it is now.
	const beforeGrants = await engine.grantsOf({ ...question, row: before, exists });
	// After the write, in the same transaction: the row it leaves, with the row before.
	return engine.can({ ...question, row: after, before, beforeGrants, exists });
}
```

What holds:

- The keys `grantsOf` answers are opaque: a short hash of the policies file's grants, then a grant's place in it. They
  never carry a grant's conditions. A key list from another policies file covers nothing.
- With `before` too, `can` checks each listed grant's `where` on the row before in memory. A key list replayed from
  another row or another principal fails on a scalar condition. Only a relation condition is left to `grantsOf`'s
  answer.
- `grantsOf` answers no key on a row an update deny already refuses in memory.
- Without `beforeGrants`, `can` asks a relation condition on the row before through `exists` at the after check, when
  the update has already written.
- `grantsOf` answers what the database held when it was asked. A relation fact that changes between that question and
  the write, through one of your own stages or through another transaction that commits in between (under PostgreSQL's
  default READ COMMITTED), is not in its answer. Only someone who could already make that change can use the gap.
- Aventara may ask `grantsOf` about several rows of one update at once, so your `exists` can be called concurrently
  inside one transaction. Prisma's interactive transaction queues the calls on its one connection; an `exists` of your
  own must allow it too.
- `grantsOf` decides nothing: it is not reported to the audit log's decision observer and has no `explain`. The `can`
  that follows it is the decision, and is reported and explained as any other.

## Rows handed to `can`

A row is a Resource's own scalar fields. A relation on it (`author: { … }`, `tags: [ … ]`) is never read: a relation
condition is always asked through `exists`, on what the database holds. Never put relation data a client sent on a row.

A to-one step whose reference fields the row carries (`campaign` through `campaignId`) is asked on the row those values
name, so a question asked before the write sees where the row is moving. Anything else is asked about the row itself, by
its identifier.

The caller must also limit the update itself to the rows `scopeOf({ action: "update" })` returns. Otherwise an update
could start from a row no grant covers. A generated client works the same way
([The generated client](/docs/generated-client#updates)).
