## Task

Implement the current harness task. First check whether the repository already satisfies the acceptance criteria; if it does, verify and report the evidence. If implementation is needed, make the smallest maintainable change that satisfies the task.

## Current task

{{taskJson}}

## Specification

{{spec}}

## Budget

You have **{{maxTurns}} turns**. Use `session_progress` if you need to inspect remaining turns before choosing between more investigation and verification.

## Context

The orchestrator already selected this task because its dependencies should be runnable. If you discover a dependency is not actually satisfied, stop and report the blocker with evidence. If this is a retry, inspect the latest evaluator report for this task before editing.

## Output requirements

- Implement only the current task scope.
- Preserve `.harness/tasks.json`, `.harness/progress.txt`, and evaluator report files; the harness updates them.
- Run relevant tests, build checks, CLI commands, or smoke checks.
- Report changed files, verification commands, results, and remaining risks in English.
