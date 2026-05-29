# Project Agent Instructions

## Runtime and package manager

- Use Bun for this project. Run scripts with `bun run`, install dependencies with `bun install`, and run tests with `bun test`.
- Do not introduce npm, pnpm, yarn lockfiles, or Node-only script assumptions unless the user explicitly asks for a migration.
- Keep generated project content, prompts, documentation, comments, and user-facing CLI text in English.
- The PI integration must target the current `@earendil-works/pi-*` package family from `https://github.com/earendil-works/pi`.

## Development workflow

- Follow TDD: add or update a failing Bun test before implementation, then make it pass.
- Commit after each implementation phase with a Lore-style commit message.
- Keep `.harness/`, `.omx/`, `dist/`, coverage output, and `node_modules/` out of git.

## Verification

- Before claiming completion, run `bun test`, `bun run typecheck`, and `bun run build`.
- Scan for non-English CJK characters in tracked project files before final delivery.
