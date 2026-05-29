## Task

Evaluate the current task completion strictly against the specification and acceptance criteria. Run real checks where possible and write the evaluator report to the required path.

## Current task

{{taskJson}}

## Specification

{{spec}}

## Budget

You have **{{maxTurns}} turns**. Use `session_progress` if you need to inspect remaining turns. Preserve enough budget to write the report.

## Context

This is attempt **{{attempt}}** for task `{{taskId}}`. The generator may have modified code, tests, docs, prompts, or configuration. Use repository evidence, command exit codes, and file contents rather than trust in the generator's summary.

## Output requirements

Write the JSON report to exactly:

`{{reportPath}}`

The report must include `reportId`, `taskId`, `attempt`, `timestamp`, `overallResult`, `summary`, `criteriaResults`, `totalWeightedScore`, `threshold`, `finalDecision`, and `feedbackForGenerator`.

For each acceptance criterion, record whether it passed or failed and include concrete evidence such as commands run, inspected files, output snippets, or observed behavior. If the task fails, give actionable feedback with file paths or commands for the generator to fix.
