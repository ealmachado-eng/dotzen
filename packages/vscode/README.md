# pluvian for VS Code

In-editor pluvian findings for Terraform: the moment a `.tf` file is saved,
the exact engine the `pluvian` CLI runs checks your whole project — same
spec (`.pluvian/spec.ts`), same verdicts, squiggles instead of a red CI job.

- Requires a `pluvian.json` in the workspace (the extension stays dormant
  without one; scaffold one with `npx @erkos/pluvian init`).
- Violations show as Error/Warning/Info squiggles; could-not-evaluate gaps
  show as Hints (ungoverned types behind an off-by-default setting).
- Status bar `✓ n · ✗ n · ? n` — click for the full report.
- Command palette: **pluvian: Check Project**.

Unpublished placeholder README — Marketplace/Open VSX listing lands with
P3 (see `docs/specs/11-vscode-extension.md`).
