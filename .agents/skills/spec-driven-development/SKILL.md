---
name: spec-driven-development
description: Guides feature development through Spec-Driven Development (SDD) — a structured Requirements → Design → Tasks → Implementation workflow with an explicit human approval checkpoint at the end of each phase, producing versioned markdown specs inside the repo (specs/<feature-slug>/). Use this skill whenever the user starts a new feature, kicks off a new project, says "let's build X", asks to implement something non-trivial, mentions "spec", "spec-driven development", "SDD", "requirements doc", or "design doc", or when picking up a feature that already has a specs/ folder in the repo. Also use it proactively before writing implementation code for any feature-sized piece of work, even if the user didn't ask for a spec by name — the team has adopted SDD as the default way of building, so don't jump straight to code for anything beyond a trivial fix.
---

# Spec-Driven Development (SDD)

SDD exists to separate "what we're building and why" from "how it's built" from "the actual code" — and to force explicit agreement at each of those boundaries before moving on. Skipping straight to code hides assumptions until they're expensive to fix; a plan document nobody read hides them just as well. The fix for both is the same: write a short, concrete document, put it in front of the person who has to sign off, and wait for a real yes before continuing.

This skill walks a feature through four phases. Each phase produces one markdown file in the repo, under `specs/<feature-slug>/`. **Do not begin a phase until the previous one has been explicitly approved by the user in this conversation.** That's the whole mechanism — the rest of this document is about making each phase's output good enough to approve.

## When to use the full flow vs. when it's overkill

Use the full four-phase flow for anything you'd call a feature: new functionality, a new service or endpoint, a non-trivial refactor, a new project from scratch. That's the default for this team.

You don't need it for a one-line bugfix, a typo, a dependency bump, or a change so small that writing a requirements doc would take longer than the fix itself. If it's genuinely that small, say so, do the change, and skip the ceremony. If you're unsure which side of the line a task falls on, err toward running the flow — the cost of a short requirements.md is much lower than the cost of building the wrong thing.

## Where specs live

```
specs/<feature-slug>/
├── requirements.md
├── design.md
└── tasks.md
```

- `<feature-slug>` is a short kebab-case name for the feature (e.g. `user-notifications`, `csv-export`), not a ticket number — pick something a teammate would recognize months later.
- Check the repo first: if it already has a `docs/specs/` folder or another established convention instead of `specs/`, follow that instead of introducing a second convention. If neither exists, create `specs/`.
- These files are committed to the repo like any other source file — they are the durable record of why the feature looks the way it does, not a scratch pad to delete afterward.
- If `specs/<feature-slug>/` already exists when you start (someone is resuming work), read the existing files first and figure out which phase was last approved before doing anything else — don't silently restart from Requirements.

## The four phases

### Phase 1 — Requirements

Goal: pin down *what* is being built and *how you'll know it's done*, before anyone thinks about *how*.

1. Ask enough questions to understand the feature's purpose, the users/actors involved, and the boundaries of scope (what's explicitly out of scope matters as much as what's in). Don't interrogate for its own sake — if the user's initial request already answers something, don't re-ask it.
2. Write `specs/<feature-slug>/requirements.md` using `assets/templates/requirements.md` as the structure. Express behavior as user stories with acceptance criteria in EARS format (see below) — it forces you to write testable, unambiguous conditions instead of vague prose like "handles errors gracefully."
3. Show the user the document (or a summary of it plus the file path) and ask directly: does this match what they want, and are they OK moving to design? Something like "¿Apruebas estos requirements para pasar a la fase de diseño, o querés ajustar algo?"
4. **Stop and wait.** Do not start design work in the same turn. If they ask for changes, revise `requirements.md` and ask again. Only proceed once you get an explicit approval (a plain "sí", "dale", "approved", "looks good", etc. — not just silence or a change of subject).

**EARS format** (Easy Approach to Requirements Syntax) — use this for acceptance criteria because "WHEN/IF ... THE SYSTEM SHALL ..." is unambiguous and directly testable, unlike free-form prose:

- Ubiquitous: `THE SYSTEM SHALL <always-true behavior>`
- Event-driven: `WHEN <trigger> THE SYSTEM SHALL <response>`
- State-driven: `WHILE <state> THE SYSTEM SHALL <behavior>`
- Conditional: `IF <condition> THEN THE SYSTEM SHALL <response>`
- Unwanted behavior: `IF <error condition> THEN THE SYSTEM SHALL <error handling>`

Example: `WHEN a user submits the form with an empty email field THE SYSTEM SHALL show a validation error and SHALL NOT submit the request.`

### Phase 2 — Design

Goal: decide *how* it's built, at the level of detail an engineer needs to implement it without re-deciding architecture mid-task.

1. Re-read the approved `requirements.md` — design must satisfy every acceptance criterion in it, and if you discover during design that a requirement is unworkable or ambiguous, go back and fix `requirements.md` first (flag the change to the user explicitly rather than quietly reinterpreting the requirement).
2. Write `specs/<feature-slug>/design.md` using `assets/templates/design.md`: architecture/component overview, data models and schema changes, API or interface contracts (signatures, request/response shapes, error cases), sequence of interactions for the non-obvious flows, and — importantly — the trade-offs section. Naming the alternative you didn't pick and why is what makes a design doc reviewable instead of just descriptive.
3. Use a mermaid diagram for any flow or component relationship that's easier to see than to read (see the template for where).
4. Show it to the user and ask for approval before moving to task planning, same as Phase 1. Stop and wait for an explicit yes.

### Phase 3 — Tasks

Goal: turn the approved design into an ordered, checkable list of implementation steps — small enough that each one is a coherent unit of work, and sequenced so dependencies come first.

1. Write `specs/<feature-slug>/tasks.md` using `assets/templates/tasks.md`. Each task should be concrete enough to start immediately (not "implement backend" but "add `POST /notifications` endpoint with request validation per design.md §3.2"), and should reference which requirement(s) it satisfies so traceability survives into implementation.
2. Order tasks by dependency, not by convenience — data model and interface changes generally come before the logic that uses them, tests can be listed alongside the task they verify rather than batched at the end.
3. Show it to the user and ask for approval before writing any implementation code. Stop and wait.

### Phase 4 — Implementation

Goal: build exactly what was planned, staying traceable back to the design and requirements.

1. Work through `tasks.md` in order. As you complete each task, mark it done in the file (e.g. `- [x]`) so the document stays an accurate log of progress — this is what makes it useful if someone else picks up the work later, or if you resume in a new session.
2. If you hit something the design didn't anticipate, don't silently improvise a divergent solution — say what you found, propose the change, and update `design.md` (and `tasks.md` if the task breakdown changes) before continuing. Small implementation-detail decisions that don't contradict the design don't need a round trip; genuine design changes do.
3. You don't need per-task approval the way you needed per-phase approval — Phase 3's sign-off is the green light for implementation as a whole. But it's good practice to check in at natural milestones (e.g. after the first vertical slice works end-to-end) rather than going silent until everything is done, especially on a large task list.

## Handling scope changes mid-flow

Requirements shift — that's normal, not a failure of the process. If new information arrives after a phase was approved (new constraint from the user, a technical blocker, a product decision), go back to the earliest document that's now wrong, update it, and re-run approval forward from there: a requirements change means design and tasks may need to change too. Don't patch a later document to route around an earlier one that's now inaccurate — that's how specs and reality quietly diverge.

## Why the approval gates matter

It's tempting, especially for a capable model, to draft all four documents in one pass and hand over a finished-looking bundle — it feels more helpful. Resist that. The value of SDD isn't the documents themselves, it's catching a wrong assumption when it costs one paragraph to fix instead of catching it after a design or an implementation was built on top of it. Treat each "approve to continue?" as a real question you're not allowed to answer on the user's behalf, not a formality on the way to the code.
