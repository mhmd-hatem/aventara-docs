---
title: "Glossary"
description: "The words Access uses: principal, claim, grant, deny, governed field, namespace, guardrail, beacon and more."
order: 27
section: reference
---

# Glossary

| Term | Meaning |
|---|---|
| Access | The policy engine and its tools. Authorization only. |
| Principal | The signed-in user as the rules see them (`me`), or `null` for an anonymous caller. You type it with `.principal<P>()`. |
| Identity | What a verified token carries: `{ sub, claims }`. `AccessIdentity<typeof claims>` is its type. |
| Claim | A value in the token beside `sub`, declared in `policies.claims`: `{ role: "string", banned: "boolean" }`. Read from the user's field of the same name. |
| Role | A name for who may do something. Global (read from claims) or held on a row (`on` a Resource, with a `where`). |
| Subject | Who a grant is for: a role name, `signedIn`, or `anyone`. |
| Grant | A rule that allows actions on Resources, optionally for some rows (`where`) and fields (`fields`). |
| Deny | A rule that refuses. A matching deny wins over every grant. |
| Origin | Where a request comes from: `client` (a user's request), `application` (your server's own), or `agent` (an AI agent through the framework's MCP endpoint). |
| Governed field | A field only a grant that names it opens. Its mode says for what: `"both"` (the list form: out of every default projection and written by no grant that does not name it), `"write"` (read as any field, written only by a naming grant) or `"read"` (written as any field, read only through a naming grant). |
| Scope | The rows a principal may read, update or delete: `true`, `false`, or an Aventara `where`. |
| Policies file | The rules compiled to passive JSON, format `aventara-access/policies@1`. |
| Engine | The thing that answers `can`, `scopeOf`, `fieldsOf` and `grantsOf` from a policies file. |
| Profile | How the instance treats sessions: `web`, `service` or `kiosk`. |
| Namespace | One service's name in the registry. It owns the rules for its own Resources. |
| Registry | The part of Access that stores each namespace's policies file and the org's guardrails. |
| Push key, pull key | A namespace's keys: push may push and read, pull only reads. |
| Lock | `avAccess.lock.json`: the hashes of the pulled files. |
| Guardrail | An org-wide, deny-only rule every namespace's engine adds. |
| Foreign Resource | A Resource another namespace owns. Rules may read it in conditions but not grant, deny or govern on it. |
| Beacon | A random value one service writes to its own database to prove other services share that database. |
| Kiosk | A shared device that staff switch on by PIN. |
| Bridge | The organization bridge: it puts a member's role and organization into token claims. |
| Hub | An app that runs Better Auth and is also the registry other services push to. |
| Aventara | The [framework](https://aventara.razor34.dev/framework/docs/introduction) Access decides for. |
