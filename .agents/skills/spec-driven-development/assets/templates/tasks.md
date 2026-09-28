# Tasks: <Feature Name>

**Status:** Draft | Approved | In progress | Done
**Last updated:** <date>
**Design:** [design.md](./design.md)

Ordered by dependency — earlier tasks unblock later ones. Check items off as they're completed during implementation so this file stays an accurate record of progress.

- [ ] **T1 — <short, concrete description>**
  Satisfies: US-1
  Notes: <anything an implementer needs that isn't obvious from the title — file/module to touch, edge case to handle, etc.>

- [ ] **T2 — <short, concrete description>**
  Satisfies: US-1, US-2
  Depends on: T1

- [ ] **T3 — <short, concrete description>**
  Satisfies: US-2

<!--
Guidelines for writing tasks:
- Each task should be small enough to implement and verify in one sitting, and specific enough to start without re-reading the whole design doc.
- Prefer "add POST /notifications endpoint with request validation per design.md §Interfaces" over "build the API".
- Put tests next to the task they verify, not batched into one giant "write tests" item at the end.
- Data models and shared interfaces generally come before the logic that consumes them.
-->
