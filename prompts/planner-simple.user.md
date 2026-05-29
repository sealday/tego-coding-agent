## Task

Plan a simple autonomous implementation run from this requirement:

{{prdContent}}

{{projectName}}

## Budget

You have **{{maxTurns}} turns**. Use `session_progress` if you need to inspect remaining turns. Spend the budget on producing an executable plan, not on extended analysis.

## Context

This is simple mode. Generate only the minimum harness state needed for implementation. If the target project already contains useful files, inspect them before deciding the stack and tasks.

## Output requirements

Create or update these files:

1. `.harness/spec.md` with product goal, chosen stack, directory structure, core behavior, constraints, assumptions, and verification commands.
2. `.harness/tasks.json` using the camelCase task schema with `createdAt`, `acceptanceCriteria`, `inProgress`, and `needsHuman` fields where appropriate.
3. `.harness/progress.txt` with an initial English note if it does not already exist.

Each task must include concrete acceptance criteria with executable `steps`. Favor small tasks that unblock one another in dependency order. Keep all generated text in English.
