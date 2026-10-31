---
title: Beacons and foreign Resources
description: "Read another namespace's Resources in conditions, and prove both services share one database."
order: 18
section: multi-service
---

# Beacons and foreign Resources

A namespace can read another namespace's Resources in its conditions. For example, a chat service lets a user read a
note when they are a member of its campaign, and the `campaign` namespace owns `Campaign`.

This is only sound while both services run on one database: the facts must come from the owner's own tables, not from
a copy. The ownership beacon proves it, at push, at pull and at startup.

## Marking a Resource as foreign

A Resource another namespace owns is marked `{ foreign: "<namespace>" }` in the schema. The rules can read it in
conditions, but cannot grant, deny or govern on it. That is a type error, and the engine and the registry refuse it
too.

```ts policy
// src/chat.policies.ts
import { definePolicies } from "@aventara/access";
import { model } from "./generated/aventara/discovery.artifact.js";

/** The schema with Campaign marked as the campaign namespace's. */
const schema = {
	...model,
	resources: {
		...model.resources,
		Campaign: { ...model.resources.Campaign, foreign: "campaign" },
	},
} as const;

export const chatPolicies = definePolicies(schema, { namespace: "chat" })
	.principal<{ id: string }>()
	.grants(({ grant, me }) => [
		// Read through Campaign in a condition: allowed.
		grant("signedIn", "read", "Note", {
			where: { campaign: { members: { some: { userId: me.id } } } },
		}),
		// grant("signedIn", "read", "Campaign") would be a type error here.
	]);
```

A row of your own may hold a reference to a foreign Resource (a chat `Room`'s `campaignId`). The engine lists the
rules' foreign Resources in `unheld`, so Aventara does not hold such a reference to what the caller may read: the write
grant's `where` and `after` decide which row may be linked
([A reference to a foreign Resource](/docs/rules#a-reference-to-a-foreign-resource)).

## The beacon

Each service writes one row in `_aventara_beacon` (`namespace`, `value`, `createdAt`) through its own data layer, with a
random value (`avb_…`), once. Access names no ORM and writes no SQL: you hand it an `AccessBeaconStore` over your
data layer, in a module that exports `beacon`. A generated client's `access.prismaBeacon(prisma)` is one, over a Prisma
model of the table.

In a deployment with a schema per service, each service's schema holds its own row. With a single schema, one table
holds them all.

```ts
// src/access.beacons.ts
import { readFileSync } from "node:fs";
import type { AccessBeaconPins, AccessBeaconStore } from "@aventara/access";

/** Your data layer's view of _aventara_beacon, one row per namespace. */
declare const beaconRows: {
	find(namespace: string): Promise<{ readonly value: string } | null>;
	insert(row: { readonly namespace: string; readonly value: string }): Promise<void>;
};

/** What `avaccess push --beacon src/access.beacons.ts` loads, and what the startup check reads through. */
export const beacon: AccessBeaconStore = {
	read: async (namespace) => (await beaconRows.find(namespace))?.value ?? null,
	create: (namespace, value) => beaconRows.insert({ namespace, value }),
};

/** The environment this process runs in: required, never guessed. */
export const environment = ((): string => {
	const named = process.env.AVACCESS_ENV;
	if (named === undefined || !/^[a-z][a-z0-9_-]{0,62}$/.test(named)) {
		throw new Error(
			"AVACCESS_ENV names the environment this service runs in (such as production); its beacon pins are avAccess.beacons.<environment>.json",
		);
	}
	return named;
})();

/** This environment's pins, as `avaccess pull --env <environment>` wrote them. */
export const beaconPins = JSON.parse(
	readFileSync(`avAccess.beacons.${environment}.json`, "utf8"),
) as AccessBeaconPins;
```

## At push

`avaccess push <rules> --beacon <module>` sends the namespace's own beacon with the file, writing its row the first
time. For each namespace the file reads as foreign, it also sends that namespace's row as this service's connection
reads it.

- The registry keeps each beacon's hash bound to its namespace (`sha256` of `<namespace>:<value>`), never the value.
- Only a namespace's own push registers or replaces its beacon. A reader only refers to the owner's.
- A file that reads another namespace is stored only when the push carries that namespace's beacon, and it is the one
  that namespace pushed. Otherwise the push is refused with `ACCESS_FOREIGN_CROSS_DATABASE`, which suggests carrying
  the fact in a JWT claim instead.
- A beacon a namespace replaced never comes back (`ACCESS_BEACON_MISMATCH`, `409`). A push never adopts a row it did
  not write.

## At pull

First push a file that marks the Resources it reads as the owner's: the registry serves another namespace's facts only
for what your current file reads as foreign. Then:

```sh
avaccess pull --foreign campaign:Campaign,Member --beacon src/access.beacons.ts --env production
```

- The owner's schema entries of those Resources go to `access/foreign.json`, pinned in the lock and checked by
  `verify`. `avaccess schema` adds them to your model, marked as the owner's.
- Every pull of rules that read another namespace reads that namespace's row through `--beacon` and holds it to the
  hash the namespace pushed. On another database it is refused, and nothing is written.
- The hashes go to `avAccess.beacons.<environment>.json`, one file per environment (`--env`, or
  `AVACCESS_ENV`), never into the lock. A database's beacon is its own, and the lock holds against any
  environment's registry. `avaccess verify --env <environment>` checks that file against the rules, offline.

## At startup

An engine whose rules read another namespace decides nothing until
`await access.policy.checkBeacons(beacon, beaconPins, environment)` has passed, with or without a lock:

- It holds the pins to `environment`, reads each owner's row through your connection, and holds it to its pin.
- A service started against another database refuses with `ACCESS_BEACON_MISMATCH`.
- A failed check latches: the engine stays shut until the process restarts.
- Await it before the service takes requests. An engine that reads no other namespace passes at once.

```ts
// src/main.ts
async function bootstrap() {
	await access.policy.checkBeacons(beacon, beaconPins, environment);
	const app = await NestFactory.create(AppModule);
	// ...
	await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

Without the call, every route answers `500` with `A3000`, and the server log shows an `AccessError` saying the beacons were not checked.

The error message names this call. On an engine you build yourself (`createAccessEngine`, `rules.engine()`), it is `engine.checkBeacons`.

A generated client does the same with `access.checkBeacons(reader, pins, environment)`, and throws an error with the
same `code`.

## A shared schema

In a single shared schema, every service with write access to `_aventara_beacon` can overwrite or delete another
namespace's row. It cannot make a reader pass, because the registry holds the owner's hash. But the readers then refuse
at startup until the owner's row is restored and pushed again. The check fails closed. Where the database can, give each
service's role write access to its own row only.

## On an Access server

With the registry on, an Access server whose rules name a namespace keeps its own beacon through Better Auth's adapter.
Its migration creates the `aventaraBeacon` table (Prisma model `AventaraBeacon`), and `access.beacon` is the store.
Every beacon table stays closed to requests, with its `value` sealed.
