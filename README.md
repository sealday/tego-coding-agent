# Tego Coding Agent

Tego Coding Agent is a Bun-based reimplementation of the `autorun-harness` project. It provides a long-running autonomous development harness that turns requirements into a specification, executable tasks, generator work, evaluator reports, provider management, and documentation-to-task synchronization.

## Baseline

- Runtime and package manager: Bun.
- PI SDK family: `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai`.
- Upstream PI repository: <https://github.com/earendil-works/pi>.
- Verified upstream main commit during this reimplementation: `7be8a10d2358fe60f1cf4507140aa9cfa81682ee`.
- NPM package baseline installed by Bun: `@earendil-works/pi-coding-agent@0.77.0` and `@earendil-works/pi-ai@0.77.0`.

## Commands

```bash
bun install
bun test
bun run typecheck
bun run build
```

Run the CLI directly with Bun:

```bash
bun run src/index.ts --help
bun run src/index.ts provider --add --name primary --token "$TOKEN" --url "https://api.example.com" --model "model-id"
bun run src/index.ts init ./my-app --mode simple --text "Build a todo app"
bun run src/index.ts run ./my-app --max-tasks 5
bun run src/index.ts sync ./my-app --fix
```

The package also exposes `tego-coding-agent` and `autorun-harness` bin aliases for installed usage.

## Architecture

```text
requirements -> Planner -> .harness/spec.md + .harness/tasks.json
pending task -> Generator -> Evaluator -> completed or retry
project docs -> SyncEngine -> task alignment report or safe task additions
```

Key directories:

- `src/commands/` contains CLI command handlers.
- `src/core/` contains orchestration, state, provider, PI session, cost, evaluator, and sync logic.
- `src/agents/` loads prompt templates.
- `prompts/` contains English-only planner, generator, and evaluator prompts.
- `tests/` contains Bun tests written before each implementation phase.

Runtime project state is written to `.harness/` inside initialized target projects. Local OMX workflow artifacts are kept in `.omx/` and are not committed.

## Development rules

- Use Bun for scripts, dependency installation, and tests.
- Keep all prompts, docs, comments, and user-facing output in English.
- Add or update failing Bun tests before implementation changes.
- Commit after each implementation phase.
- Run `bun test`, `bun run typecheck`, and `bun run build` before delivery.
