---
title: File formats, hashes and the engine
description: "The passive JSON formats Access writes, their hashes, and the engine's members."
order: 22
section: reference
---

# File formats, hashes and the engine

## File formats

Every file Access writes is passive JSON with a format string. A member the format does not define is refused, and so
is a file of another format.

| Format | Members | Written by |
|---|---|---|
| `aventara-access/policies@1` | `format`, `namespace` (optional), `claims`, `schema`, `roles`, `govern`, `governModes` (optional), `grants`, `denies` | `.contract()`, `avaccess pull` |
| `aventara-access/guardrails@1` | `format`, `claims`, `denies` | `defineGuardrails(…).contract()`, `avaccess pull` |
| `aventara-access/lock@1` | `format`, `namespace`, `policies`, `guardrails`, `foreign` (optional) | `avaccess pull` |
| `aventara-access/foreign@1` | `format`, `namespace`, `schema` (the owners' entries, each marked `foreign`) | `avaccess pull --foreign` |
| `aventara-access/beacons@1` | `format`, `namespace`, `environment`, `beacons` (owner to beacon hash) | `avaccess pull --env` |

A policies file's schema entry lists, beside its fields, the nullable ones (`nullable`) and the ones `can` compares by
type (`types`: `bigint`, `datetime` or `decimal`). A rule's literal is written in its field's canonical form. The engine
checks every member of a file it is handed, and refuses a number JSON cannot carry (`NaN`, `Infinity`).

## Hashes

`policiesHash(file)` and `guardrailsHash(file)` return a file's canonical hash, `"sha256:<hex>"`. It is the same for the
same rules written in any order, and a formatter's re-indent does not change it.

```ts
// scripts/policies.write.ts
import { readFileSync, writeFileSync } from "node:fs";
import { createAccessEngine, policiesHash } from "@aventara/access";
import { policies } from "../src/access.policies.js";

const file = policies.contract();
writeFileSync("policies.json", `${JSON.stringify(file, null, "\t")}\n`);
console.log(policiesHash(file)); // "sha256:…"

// Later, or in another process: the same engine, from the file alone.
const engine = createAccessEngine(
	JSON.parse(readFileSync("policies.json", "utf8")),
);
console.log(Object.keys(engine.governed)); // ["User"]
```

Run it from the project's root with `npx tsx scripts/policies.write.ts`.

The file's parts are exported as types (`AccessPolicies`, `AccessGrantRule`, `AccessDenyRule`, `AccessGuardrails`,
`AccessLock` and the rest), so a project that emits declarations can export any part of a file. A pulled file imported
as JSON fits the options that take one (`AccessPoliciesJson`, `AccessGuardrailsJson`), and the engine checks the rest
when it is built.

## The engine

`policies.engine(options)` builds the engine from the rules, and `createAccessEngine(file, options)` from a compiled
file. Both take `{ guardrails, lock, requireLock }`. Any other option is refused. The engine runs from its own frozen
copy of the file.

| Member | What it is |
|---|---|
| `can(question)` | Whether the principal may do `action` on `resource`; on `row` when one is given |
| `grantsOf(question)` | The update grants that cover a row before an update ([Updates](/docs/updates)) |
| `scopeOf(question)` | `true`, `false`, or an Aventara `where` |
| `fieldsOf(question)` | `{ always, perRow }`: `always` is `"all"` or a list of field names, `perRow` maps a field to the `where` of the rows it opens on |
| `explain(question)` | Which rules took part in a `can` decision; throws in production |
| `checkBeacons(reader, pins, environment)` | The startup beacon check ([Beacons and `foreign`](/docs/beacons-and-foreign)) |
| `hosted({ held })` | Called by Aventara when it hosts the engine, with the Resources it holds a written reference to; warns `ACCESS_REFERENCE_UNREADABLE` ([Rules](/docs/rules#writing-a-reference-needs-read-on-its-target)) and `ACCESS_FOREIGN_REFERENCE_UNCHECKED` ([Rules](/docs/rules#a-reference-to-a-foreign-resource)) |
| `governed` | The fields governed for reading (`"read"`, `"both"` or the list form), by Resource |
| `afterChecks` | The Resources whose updates Aventara checks after the write |
| `paths` | Every relation path and operator each rule filters on, by rule id |
| `unheld` | The Resources the rules read as foreign; Aventara holds no written reference to them to the caller's read scope ([Rules](/docs/rules#a-reference-to-a-foreign-resource)) |

## Error codes

Refusals from `createAccess`, the registry and the engine are `AccessError`, exported from `@aventara/access`, each with a `code`. [Error codes](/docs/error-codes) lists every code with its fix, and every case of `ACCESS_OPTIONS_INVALID`. The kiosk's codes are on [The kiosk profile](/docs/kiosk#tables-and-codes).
