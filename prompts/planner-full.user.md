## Task

Analyze the requirement and existing documentation, then generate a complete project blueprint and harness task list.

## Requirement

{{prdContent}}

{{projectName}}

{{existingDocsInfo}}

## Budget

You have **{{maxTurns}} turns**. Use `session_progress` if you need to inspect remaining turns. Prioritize a coherent PRD, implementation spec, and task list over decorative detail.

## Context

This is full mode. If documents already exist, read and preserve their useful decisions. If the PRD is already present in `docs/PRD.md`, treat it as authoritative unless the user input clearly overrides it.

## Output requirements

Create or update the relevant documentation suite:

1. `CLAUDE.md` as the project index.
2. `docs/PRD.md` for product requirements.
3. `docs/DESIGN.md` for UX, visual system, accessibility, and component states when UI exists.
4. `docs/API_CONTRACT.md` for service boundaries when APIs exist.
5. `docs/DATA_MODEL.md` for entities, validation, persistence, and relationships when data exists.
6. `docs/UE_FLOW.md` for user journeys and state transitions.
7. `docs/FLOWCHART.md` for core flows when useful.
8. `.harness/spec.md` as the concise implementation contract.
9. `.harness/tasks.json` using camelCase fields such as `createdAt`, `acceptanceCriteria`, `inProgress`, and `needsHuman`.
10. `.harness/progress.txt` with an initial English note if needed.

Make each task executable, dependency-aware, and testable. Include acceptance criteria that cover success, failure, and edge paths. Keep all generated text in English.
