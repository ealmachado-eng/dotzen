# Lessons — append-only log

> Two-sided memory: **KEEP** (what went right, do again) and **AVOID** (what went wrong, don't repeat). Append a new entry per non-trivial session/release. Never rewrite history — mark `superseded YYYY-MM-DD` instead of deleting.
>
> Related: `docs/SESSION_HANDOFF.md` (current state), `docs/ROADMAP.md` (backlog + dogfood log), `docs/specs/00-architecture-decision-record.md` (locked decisions).

## How to use

- **Author:** at the end of a release or non-trivial session, append one entry. Tag with topic (`release`, `normalize`, `cis`, `ci`, `parser`, etc.).
- **Reader:** at session start, grep this file for the topic you're about to touch. The `AGENTS.md` Session bootstrap rule instructs the agent to do this automatically.

## Entry shape

```markdown
## YYYY-MM-DD — <topic> — <short title>

**KEEP** (do again):
- ...

**AVOID** (don't repeat):
- ...
```

---

## 2026-08-05 — release — v1.9.37 publish gate

**KEEP** (do again):
- `publish needs: [gate]` in `release.yml` — a `gate` job (Node 24) runs the full correctness suite before `npm publish --provenance` can start. Caught the Quick Start order regression before it hit npm.
- Node 24 / npm 11 pin on the release workflow — trusted publishing OIDC token exchange silently fails on Node 20 / npm 10.x. Don't lower it.
- `prepack` copies root `README.md` → `./README.md` so the npm tarball ships the current README. Removes the historical npm/GitHub README drift.
- Absolute README links + ASCII diagrams — npmjs doesn't render mermaid, and relative links 404. Stay absolute, stay ASCII.

**AVOID** (don't repeat):
- **npm no-republish.** Once a version number is published (even if unpublished), npm blocks republishing it. Always use a fresh version number after any publish, no matter how small the fix.
- Quick Start order matters on npm — `check` before `init` is broken because `check` needs a spec. Verify the order in the rendered tarball, not just in the repo.
- Tag-triggered `ci.yml` runs duplicate work that `release.yml` owns — `ci.yml` should not fire on tags.

## 2026-07-30 → 2026-08-08 — parser — HCL `${...}` interpolation strings

**KEEP** (do again):
- Pure-JS WASM parser boundary (`@cdktf/hcl2json`) — no native binary, no Gatekeeper dialog, no SmartScreen. Adoption-friction win.
- Build HCL `${...}` interpolation strings via **string concatenation**, not via regex/template-string assembly that interpolates user-controlled content. CodeQL #1-3 flagged the old form; concatenation is the safe shape.

**AVOID** (don't repeat):
- Don't construct `${...}` strings via regex substitution over untrusted HCL — CodeQL flags it as a tainted-template form even when exploitation requires the engine's own input. Refactor to concatenation, don't disable the rule.
- The upstream parser source repo (`hashicorp/terraform-cdk`) is archived. Documented in `docs/specs/00-architecture-decision-record.md`. Future mitigation: compile `hashicorp/hcl/v2` to WASM and vendor the `.wasm`. Don't act like the dependency is actively maintained.

## 2026-08-06 — ci — CodeQL semantic analysis rollout

**KEEP** (do again):
- CodeQL `security-and-quality` query suite on JS/TS caught 5 real findings on first run (3 tainted-template, 1 missing-regexp-anchor, 1 formatting). Worth the CI minutes.
- `workflow_dispatch` on both `ci.yml` and `codeql.yml` — manual/on-demand reruns without pushing a no-op commit. Add it to every workflow that gates releases.
- Anchor regexes — `$schema` matching in SARIF tests was unanchored; CodeQL #5 flagged it. Anchoring is the right form for identifier validation.

**AVOID** (don't repeat):
- Don't bump `codeql-action` major without checking the changelog — v3 → v4 had behavioral changes that needed a separate commit. Bundle the bump with verification, not as a drive-by.
- Probing GitHub Actions push-event delivery with an empty commit (`1f3a6c1`) works but pollutes history. Use `workflow_dispatch` instead — that's what it's for.

## 2026-07-29 → 2026-08-05 — engine — graph layer + module-following

**KEEP** (do again):
- Resource-type-aware edge classification (`classifyEdge(attr, resourceType)` + `STRUCTURAL_REF_BY_TYPE`) — fixed the NAT false chain via `aws_nat_gateway.subnet_id` → structural. Without the type override, `denyIfReachable` chained through every resource with a `subnet_id` attribute.
- `couldNotEvaluate` for unresolved graph edges — partially-unresolvable reachability chains degrade honestly, never a false pass. The principle "a false positive is worse than an honest gap" is the right framing for a governance tool.
- Per-instantiation trace labels (`env/prd › modules/rds/main.tf (db_bad)`) — distinguish two calls of one module. Without them, findings on `for_each` modules are ambiguous.

**AVOID** (don't repeat):
- Don't treat `google_service_account.*.{member,email,name}` as opaque — the provider type-system guarantees they can't equal a public-principal scalar. Returning `couldNotEvaluate` for them is wrong; it's a definite PASS. (Fixed in v1.9.31 via `denyValueExcludedByResourceAttr`.)
- Don't skip graph edges silently when a list-valued attribute is involved — `buildGraph` must scan `res.lists` too, or SG-shared rules miss real `.tf` patterns.
- Don't disable Stryker mutation clusters without a documented equivalent-mutant reason. The skip-optimization block in `evaluate.ts` L2403-2413 has `// Stryker disable` comments explaining why — keep that pattern for any future disables.

## 2026-08-11 — process — session memory bootstrap

**KEEP** (do again):
- Persistent memory harness: `SESSION_HANDOFF.md` (state) + `LESSONS.md` (this file, two-sided) + `ROADMAP.md` (backlog) + AGENTS.md bootstrap rule that forces the agent to read them at session start. Closes the "agent didn't proactively pull context" gap.
- `npm run context` emits a deterministic bootstrap blob (last tag, commits since, npm version, drift). No LLM reasoning needed for state that git already knows.
- Append-only logs. Never rewrite history — supersede with a date stamp.

**AVOID** (don't repeat):
- Don't put "delete this file after absorbing" in a handoff doc — it fights persistence and the file stays anyway. Rolling-append is the right model.
- Don't bury bootstrap instructions in 26K-char CLAUDE.md — agents skim long files. Top of `AGENTS.md`, short and explicit.
- Don't capture only failures. Wins rot fastest because success feels self-explanatory in the moment. Two-sided log or none.

## 2026-08-18 — brand — rebrand recovery + naming sprint

**KEEP** (do again):
- Screen names against npm + GitHub + common-law BEFORE falling in love — killed ~60% of candidates in minutes (all common animal names npm-taken; Tagma/Styx/Nomos/Lorica too).
- Capture brand decisions to disk the session they're made. Original rebrand discussion was lost with its session; this sprint's conclusions now live in `docs/REBRAND.md`. The harness already paid for itself.
- Trade-off tables + blunt recommendation + wait. User holds under pressure; presenting cleanly and waiting worked.
- Positioning split by audience: "NixOS for governance" (devs) vs "control plane for AI-generated infrastructure" (buyers). Same product, two framings.

**AVOID** (don't repeat):
- Mythological/commercial-collision names without a TM budget — Sobek (Smite/Hi-Rez) + 4 live USPTO applications forced a retreat after emotional investment.
- Common animal words as npm package names — namespace exhausted; `croc` additionally collides with schollz/croc file-transfer CLI.
- Personal names as package names (Sotiris etc.) — weak trademarks (need secondary meaning), reads wrong as a CLI.
- `krokodil` — Russian street drug. Never.
- Declaring "OS" at launch. Earn the platform framing via a second domain adapter; ship the wedge.
