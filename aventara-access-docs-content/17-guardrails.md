---
title: Guardrails
description: "The org's deny-only rules that every namespace's engine adds on top of its own."
order: 17
section: multi-service
---

# Guardrails

The org's guardrails are deny-only rules that every namespace's engine adds on top of its own. They only narrow: the
data owner writes the grants, and a guardrail can only take them away.

The operator writes them with `defineGuardrails`, which has `.denies()` and no `.grants()`:

```ts
// src/org.guardrails.ts
import { defineGuardrails } from "@aventara/access";

export const guardrails = defineGuardrails({ claims: { suspended: "boolean" } })
	.denies(({ deny }) => [
		// A suspended user reads, and writes nothing, in every service.
		deny(["create", "update", "delete"], "*", {
			name: "suspended-read-only",
			if: { claims: { suspended: true } },
		}),
	])
	.contract();
```

- `deny(actions, resources, options?)` names whole Resources: `"*"`, or by namespace, `{ campaign: ["Note"] }` or
  `{ chat: "*" }`.
- A guardrail's options are a `name` and `if: { claims, origin }`. A `grant`, or a row condition (`where`, `after`), is a
  type error.
- `.contract()` compiles them to an `aventara-access/guardrails@1` file. `guardrailsHash(file)` is its canonical hash.

## Pushing them

Push them through the server's own instance. No namespace key can push them:

```ts
// scripts/guardrails.push.ts
import access from "../access.config.js";
import { guardrails } from "../src/org.guardrails.js";

const pushed = await access.registry.pushGuardrails(guardrails);
console.log(pushed);
```

Each service then gets them with `avaccess pull`, and passes them as `policies.guardrails` (or the engine's
`guardrails` option). See [The lock at startup](/docs/registry-and-cli#the-lock-at-startup).

## What a guardrail reaches

Each guardrail becomes a deny on the Resources it reaches:

- `"*"` reaches every Resource the file has.
- A namespaced list reaches the file's own namespace's list. `{ chat: "*" }` is every Resource the file owns.
- Another namespace's list is left alone.
- A Resource the file does not list has no grant at all, so nothing there is left for a guardrail to take away.

A Resource in the file's own list that the file lacks, or reads as foreign, is refused, and so is a namespaced list when
the file names no namespace.

`createAccess` refuses guardrails that compare a claim `policies.claims` does not declare
(`ACCESS_CLAIMS_UNDECLARED`). Declare `suspended` there too.

## Missing claims fail closed

A guardrail's `if` fails closed on a claim the token lacks, as a deny's does: the guardrail applies, whatever value it
compares with.

- Every service that declares `suspended` issues it in each token, `false` when unset. So
  `if: { claims: { suspended: true } }` leaves alone a user who is not suspended, and applies to a token without
  `suspended`.
- `if: { claims: { tier: "trial" } }` applies to a user with no `tier`.

Write a guardrail so that a missing claim is the safe case.

## How fast a guardrail takes effect

Guardrails reach a service at build time, with a pull and a deploy. A change that must take effect sooner travels as a
claim: a suspended user gets the claim with their next token, within `policies.tokenTtl` (15 minutes at most).
