---
title: "Why Access"
description: "The problem Access solves, what it decides and what it leaves to Better Auth and to you."
order: 2
section: get-started
---

# Why Access

An Aventara app gives every Prisma model a typed API with no controllers. That is fast to build, and it raises one question at once: who may read which rows, and who may change them? A guard can answer "is this user signed in". It cannot say "this user may read notes in campaigns they belong to, and only the author may edit them, and the email column is for admins".

Access answers that second kind of question, in one place, for every request.

## What you write

Rules, not checks. You say which roles exist and what each may do. You do not repeat the check in each operation.

- Roles are global (read from a user's claims) or held on a row (a member of this campaign).
- Grants allow an action on a Resource, optionally for some rows (`where`) and some fields (`fields`).
- Denies refuse, and a matching deny always wins over every grant.
- Nothing is allowed until a grant allows it.

The order of the rules never matters. That makes a rule set easy to read and to review.

## What the types do for you

Rules are typed from your schema. Misspell a field and the compiler stops at that key. Name a governed field in a grant without governing it and you get a type error that says what to do. The rules compile to a passive JSON file that you can store, diff and hash.

## What Access does not do

| Not Access | Who does it |
|---|---|
| Sign-in, sign-up, sessions, password reset | Better Auth |
| Issuing tokens, OAuth for agents | Better Auth (`jwt()` and `@better-auth/oauth-provider`) |
| Your business logic | Your [pipelines](https://aventara.razor34.dev/framework/docs/pipelines) |
| Request shape, filters, results | The framework |

Access adds no token endpoint and no OAuth route. It verifies and maps what Better Auth issued, and it refuses configurations that would weaken the rules.

## Where it fits

```text
 request ──► Better Auth session or token ──► principal
                                                  │
 framework: may this principal do this? ◄── Access engine (policies file)
                    │
        allow, scope to rows, trim fields        or  403 A4002
```

The framework owns the question and enforces the answer: it limits reads to the rows in scope, refuses fields a grant does not open, and checks writes. See [Policies](https://aventara.razor34.dev/framework/docs/policies) in the framework docs for how it asks.

## When it is a good fit

- You build on Aventara and Better Auth and want one rule file instead of scattered checks.
- You run several services against one set of users and want each service to own the rules for its own data.
- You let AI agents act for users and need them held to the user's own grants and to token scopes.
- You run shared devices, such as tills, where staff switch by PIN.

## When it is not

- You need an authentication product. Use Better Auth for that. Access sits beside it.
- Your service has no Aventara and no ORM Access can translate to. A [generated client](/docs/generated-client) works with Prisma 7 or no ORM, and it only answers questions: your code must ask them on every path.
