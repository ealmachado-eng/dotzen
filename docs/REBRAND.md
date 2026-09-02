# Rebrand — dotzen → erkos/pluvian (pre-launch)

> **Status: EXECUTED 2026-09-02 — `@erkos/pluvian@2.0.0` live on npm (provenance, trusted publishing); `@dotzen/dotzen` deprecated; repo at `erkos-hq/pluvian`.** Remaining post-launch: launch-post rewrite+post, Renovate install on the org, VS Code P1 (spec 11), optional erkos.dev + correctly-issued GITLEAKS_LICENSE. This file is now the historical record of the rebrand decision process.

## Trigger

**Trademark conflict on "dotzen".** Total rebrand decided before launch — all six axes: product name, domain, npm package, GitHub repo, logo, tagline.

## Locked decisions (do not re-litigate without new facts)

| Axis | Decision | Notes |
|---|---|---|
| **Umbrella brand** | **erkos** (Greek: ἔρκος = enclosure/rampart/hedge) | **Flipped 2026-09-01 (user decision) — supersedes the 2026-08-18 tafros lock.** ~~tafros (τάφρος = moat)~~ superseded 2026-09-01. The beast-in-moat narrative is consciously given up; the perimeter/fortification semantics fit governance directly. Crocodile mascot survives — and see Gharial's *erkos odonton* tie in the matrix. |
| **Tool name** | **pluvian** (from *Pluvianus aegyptius* — the Egyptian plover, Herodotus's crocodile bird) | **LOCKED 2026-09-01** after 3 screening rounds. The bird that rides in the crocodile's mouth and keeps it clean — the only candidate that PARTNERS with the locked mascot instead of competing with it; the agent-loop story incarnate; purest Pattern C. Binary `pluvian`, package `@erkos/pluvian`, repo `erkos-hq/pluvian`, contract `.pluvian/` + `pluvian.json`. |
| **Brand pattern** | **C — mascot + coined technical name** | Package/CLI uses a technical name; the beast + character live in marketing/docs. Rejected: B (character-as-package — weak trademark, enterprise-tone risk), A (beast only in marketing — loses narrative integration). |
| **Mascot (this tool)** | **Crocodile** | Canonical moat beast. Character name DEFERRED (Greek personal names like Sotiris/Nereus considered for the character layer — do NOT use as package names; personal names are weak trademarks). |
| **GitHub handle** | `erkos-hq` (direction) | ~~`tafros-hq`~~ superseded 2026-09-01. `github.com/erkos` is taken by an inactive personal account (created 2011-09-25, 0 public repos — verified 2026-09-01); `erkos-hq` verified OPEN same day. **NOT YET CLAIMED — do this before publishing.** |
| **Domain** | `erkos.dev` (direction) | ~~`tafros.dev`~~ superseded 2026-09-01. Umbrella site; products listed at `erkos.dev/<name>` — no per-tool domain hunt. DNS does not resolve as of 2026-09-01 (consistent with unregistered) — verify at registration. |
| **npm** | `@erkos/pluvian` | ~~`@erkos-hq/<tool>`~~ superseded 2026-09-01: npm gets the CLEAN name — the npx command is the #1 adoption surface and carries the real brand; GitHub keeps the forced `-hq`; owning the scope is squat-protection. Unscoped `erkos` on npm free (verified 2026-09-01). Org NOT YET CREATED — create `erkos` on npm. npm no-republish applies to the new package too. |
| **Beast→category mapping** | Deferred until product #2 | Ad-hoc per product for now. |

## Candidate matrix — tool name (screened 2026-08-11/18)

Screening = npm (`npm view <name>` 404) + GitHub username + DDG common-law. USPTO TESS is SPA/captcha — manual search required for any finalist (see "Sobek" note).

> **Re-verified 2026-09-01:** squama / sphragis / gharial all still 404 on the npm registry; `erkos-hq` free on GitHub. The matrix below is current as of that date — don't re-run it.

| Name | Type | npm | Risk | Mascot/semantic tie | Status |
|---|---|---|---|---|---|
| **Squama** | Latin "scale" | clean | ~zero | Direct (crocodiles are scaly) | **Front-runner.** DDG: zero commercial use in dev space. |
| **Sphragis** | Greek σφραγίς "seal" | clean | ~zero | Security×identity primitive (ancient seal = tamper-proof + owner identity). Frees mascot from crocodile if ever wanted. | Strong. Pairs with tafros (Greek×Greek). |
| **Gharial** | Crocodilian, ~110-tooth snout | clean | ~zero | **Identity tie with erkos RESTORED** (snout = Homer's "erkos odonton", rampart of teeth — erkos is now the umbrella, so the etymology binds mascot↔brand directly). 7 chars. | Alive. Distinctive + visually iconic; the narrative pick under erkos. |
| **Erkos** | Greek "enclosure/hedge" | clean | ~zero | Perimeter semantic — now the UMBRELLA itself | **PROMOTED to umbrella 2026-09-01 — no longer a tool-name candidate.** |
| **Synthema** | Greek "watchword" | clean | ~zero | Byzantine military password = secret + recognition | Backup. |
| **Suchus** | Greek form of Sobek | clean | ~zero | Same god narrative | **Deprioritized** — pronunciation drift (SOO-kus/SUK-us), "such" lexical clash, academic not mythological register. |
| **Sobek** | Egyptian crocodile god | clean | **medium** | God of protection; instant recognition | **User's pick, then stepped back for 0-risk.** Hi-Rez's Smite character (class 9 adjacency); 4 LIVE USPTO applications (serials 99550639, 99531559, 99917809, 99920976 — classes unknown, TESS manual check needed). OSS calculus: lawsuit <1%, but npm takedown ~10% if reported. Path if chosen: use without TM filing, rename window pre-publish is cheapest. |
| **Caim / gatorix / caima** | Coined clippings | clean | zero | Loose | Weak — lose instant recognition. |
| **croc / gator / snake / owl / heron / caiman / alligator / naja / varanus / krok / crock / wolf / lion / bear / drake / draco / falcon / hawk / mastiff / viper** | Animal-type | **TAKEN** | — | — | **Architecture dead on npm.** Also `croc` = schollz/croc file-transfer CLI (mental-model collision). `krokodil` = Russian street drug — never. |
| **Sotiris / Nereus / etc.** | Greek personal names | clean | weak TM | Character layer only | Rejected as package names (personal names need secondary meaning to register; reads wrong as CLI). |
| Tagma / Styx / Candor / Lorica / Thesmos / Phraxis / Temenos / Nomos / Teichos / Talos / Argus / Janus / etc. | Various classical | most TAKEN | — | — | Killed by npm filter in first sweep (Tagma, Nomos, Styx, Lorica, Thesmos, Phraxis, Temenos all npm-taken except where noted clean above). |

### Round 2 — screened 2026-09-01 (under the erkos umbrella, new naming logics)

| Name | Type | npm | Risk | Tie | Status |
|---|---|---|---|---|---|
| **Agger** | Latin "earthen rampart" (the Roman camp earthwork) | clean | low-med | **The Terraform-specific pun**: terra (earth) + agger (earthwork defense) — a governance rampart for *Terra*form. Under erkos, the tool IS the rampart. 5 letters, no pronunciation drift. | **Alive.** npm free; no standalone "agger" tool on DDG. Cons: reads as "Dagger minus d" in the exact infra/CI market (Dagger CI is huge there); a small cybersecurity firm "Agger Labs" exists. |
| **Scute** | The bony armor plate in crocodile skin | clean | med | The mascot's armor UNIT — "every rule is a scute; the rules form the rampart." 5 letters, English. | **Alive, with priors.** npm free, but two existing software users: the GnuPG smartcard plugin (Debian/Gentoo-packaged) and e280/scute (Rust build tool with a coding-agent CLI). Fails the "zero dev-space use" bar that made Squama clean. |
| Ephor / Phylax / Vallum / Custos | watchman/rampart/keeper family | **TAKEN** | — | ephor was the Spartan overseer of kings (the AI-oversight narrative); phylax the watchman (prophylaxis = prevention before the fact); vallum the stone rampart; custos the keeper. | **Dead 2026-09-01.** ephor = "governed agent organization" npm package (Jul 2026 — *AI-governance adjacent*); phylax = name-squat (Jun 2026); vallum = an active AI-agent shell-security Rust CLI (22 releases since Jun 2026); custos = dormant 2016 JS client. Classical names in the AI-security space are being eaten fast — claim the winner's handles early. |

### Round 3 — screened 2026-09-01 (watchman-on-the-wall: birds + watchtower words)

| Name | Type | npm | Risk | Tie | Status |
|---|---|---|---|---|---|
| **Pluvian** | coined from *Pluvianus aegyptius* — the Egyptian plover, Herodotus's crocodile bird | clean | low | **The bird that rides in the crocodile's mouth and keeps it clean** — the only candidate that PARTNERS with the locked croc mascot instead of competing with it; the agent-loop story incarnate (the small watchbird cleaning up after the beast). Coined form = the purest Pattern C name on the board. 7 letters, no pronunciation drift. | **LOCKED 2026-09-01.** DDG: a French GEO-marketing agency (pluvian.com, different industry) + an academic "Pluvianus" calcium-imaging GUI (different form) — low risk, accepted. |
| **Glaux** | γλαύξ — Athena's little owl on Athenian tetradrachms | clean | high | The state-coin owl: watchful wisdom + the legitimacy stamp; Greek×Greek with erkos. | **Dead 2026-09-01 (DDG).** GLAUX GROUP AG = Swiss software company (~200 staff, 30 yrs) for PUBLIC-ADMINISTRATION software — same industry, governance-adjacent. Plus one-syllable drift (GLAWKS/GLOWKS). |
| **Erne** | Old English: the sea eagle | clean | med | 4-letter real-word raptor, easy to type. | **Alive, DDG unchecked.** Spoken homophone of "earn" — voice-confusion risk for a CLI name. |
| **Numida** | helmeted guinea-fowl genus — the farm sentinel bird that alarm-calls at anything strange | clean | med | The alarm-raiser incarnate; echoes ancient Numidia. 6 letters, NOO-mi-da. | **Alive, DDG unchecked** (possible fintech named Numida — verify before finalist). |
| **Tutela** | Latin: guardianship; the guardian deity of a city | clean | med | The keeper-branch of the watchman logic (non-bird bonus). too-TEL-a. | **Alive, DDG unchecked.** A living legal term in Romance languages (incl. LGPD/data-governance contexts) — feature or genericness, by taste. |
| Plover / Tyto / Otus / Shrike / Saker / Noctua / Vigilo / Specula | croc-bird common name; owl+raptor genera; butcherbird; falconry falcon; Athena's owl; "I keep watch"; "watchtower" | **TAKEN** | — | — | **Dead 2026-09-01.** plover = alibaba web framework; tyto/otus/shrike/saker/noctua = dormant 2015-23 packages; vigilo = active Web3 security-audit orchestrator (Jan 2026 — adjacent again); specula = squatted Nov 2025 (221-byte no-README). Presumed dead, unverified: kestrel (.NET), merlin (AI agent), falco (CNCF runtime security — most adjacent of all), milvus (vector DB), kite, huginn (agent platform), strix (ASUS), bubo (plague connotation), asio (audio drivers). |

## Strategy layer (decided orientation, not launch posture)

**Governance OS endgame — yes; launch message — no.**
- "OS" has drifted from metal (NixOS = config-as-OS; Slack/Stripe/Shopify marketing sense). Legitimate, but crowded positioning.
- **npx architecture is fully OS-compatible** (Prisma/Nx/Bun/Playwright precedent). Current codebase ~70% domain-agnostic (DSL + engine conditions + report pipeline). Remaining 30%: isolate HCL parse/normalize behind a DomainAdapter interface — 3-6mo refactor, not rewrite.
- **NixOS is the reference architecture**: "governance posture is a pure function of the spec" — deterministic, reproducible, side-effect-free. Patterns worth borrowing: module system, generations/rollback of governance posture, Nixpkgs-style community vocabulary, flake-like pinning (already implicit in dotzen.json).
- Positioning ladder (audience-split): dev docs → "NixOS for governance" framing; buyer deck → "control plane for AI-generated infrastructure".
- Ship the wedge (Terraform governance), earn the platform (2nd domain adapter), never declare OS at launch.

## Execution plan (after name locks)

- **Phase C — lock identity**: claim `erkos-hq` GH org + npm org + register `erkos.dev` (these three are name-INDEPENDENT — can proceed now); repo transfer to `erkos-hq/<tool>` + Trusted Publisher registration on npm wait for the tool name (they bind to repo/package names). Decide contract-file renames (`dotzen.json` → `<tool>.json`, `.zen/` → `.<tool>/` — recommend YES pre-launch); keep "Prose as Code" tagline (independent of name); logo concept deferred to design pass.
- **Phase D — mechanical rebrand** (~6h): package.json/bin/src/tests; contract files; README/CLAUDE/AGENTS/docs/specs/skills; CI workflows + branch rulesets; memory harness (session-context.ts, plugins); re-run `npm run gen-docs` + `gen-examples`; full gate; graphify update. Single squashed commit as v2.0.0 prep. Note: `.gitattributes` line 1, `dotzen.module-following` ruleId, `DOTZEN_REQUIRES_APPROVAL` env signal, jiti self-alias in spec loader — all carry the old name.
- **Phase E — launch**: v2.0.0 CHANGELOG (rebrand rationale + migration: uninstall old, install new, rename contract files); publish `@erkos-hq/<tool>@2.0.0` w/ provenance; deprecate `@dotzen/dotzen` w/ migration README; launch post was NEVER sent (Show HN / r/terraform draft exists in docs/launch/) — rewrite for new name.

## Phase D execution inventory (captured 2026-09-01, verified against source)

Headline: **1,063 textual occurrences / 112 files** (case-insensitive; excluding node_modules/.git/graphify-out/.codegraph), PLUS filename-only artifacts content grep cannot see: **43 files named `dotzen.json`**, **46 dirs named `.zen/`**, `bin/dotzen.js`, 3 `.claude/skills/dotzen-*` dirs. Instantiate `<tool>` the moment the name locks; then execute top-to-bottom.

| # | Surface (exact literal today) | Where | Rename to |
|---|---|---|---|
| 1 | Package name `@dotzen/dotzen`, bin `dotzen`, `bin/dotzen.js`, repository/homepage/bugs URLs | `packages/cli/package.json:2,21-30`; lockfile regenerates via `npm install` | `@erkos-hq/<tool>`, bin `<tool>`, `bin/<tool>.js`, erkos-hq URLs |
| 2 | Config candidates `'dotzen.json'`, `'.zen/dotzen.json'` + error path | `src/version/config.ts:26,36` | `<tool>.json`, `.<tool>/<tool>.json` |
| 3 | Init writes `dotzen.json` + `.zen/spec.ts`; hints | `src/cli/scaffold.ts:17,30,31`; `main.ts:140-160` | `<tool>.json` + `.<tool>/spec.ts` |
| 4 | jiti alias key `'@dotzen/dotzen'` (the npx self-resolution linchpin; opaque string — key swap just works) | `src/spec/load.ts:28`; test `load.test.ts:47-63` | `'@erkos-hq/<tool>'` |
| 5 | Generated spec import + init header (single source feeding init AND examples) | `src/cli/profiles.ts:244,246,257` | 3 literals |
| 6 | Approval signal `DOTZEN_REQUIRES_APPROVAL`, `DOTZEN_ENV_FILE`, default `dotzen.env` | `src/cli/main.ts:37-44`; banner `report.ts:126`; `.gitignore:8-9` | `<TOOL>_REQUIRES_APPROVAL`, `<TOOL>_ENV_FILE`, `<tool>.env` |
| 7 | SARIF `tool.driver.name: '@dotzen/dotzen'` + informationUri fallback `github.com/ealmachado-eng/dotzen` | `src/report/report.ts:327`; `main.ts:55` | `'@erkos-hq/<tool>'` + new repo URL |
| 8 | ruleId `'dotzen.module-following'` | `src/cli/check.ts:78`; test `check.test.ts:285` | `<tool>.module-following` |
| 9 | ruleId `'dotzen.ungoverned'` (**second** synthetic ruleId — was NOT in the original Phase D list) | `src/report/report.ts:308` | `<tool>.ungoverned` |
| 10 | Ignore directive regexes `dotzen:ignore` ×2 (old directives stop matching → suppressed findings re-fire loudly = the safe direction) | `src/hcl/parse.ts:127,131`; applied `check.ts:94-110`; tests `parse.ignores.test.ts` + fixture | `<tool>:ignore` |
| 11 | CI templates: npx pins, job ids `dotzen:check:`/`dotzen:approve:`, `dotzen.env`, `dotzen.sarif`, `category: dotzen` | `src/templates/ci-templates.ts:9-89`; `ci-templates.test.ts` | full rebrand of emitted YAML |
| 12 | Usage string `usage: dotzen <check|init>` | `main.ts:174-176` | `usage: <tool> …` |
| 13 | Internal identifiers `DotzenError` / `DotzenConfig` / `readDotzenJson` (not in the public DSL surface) | `src/result/errors.ts:8`; `src/version/config.ts:13,28` + uses | neutral: `EngineError` / `EngineConfig` / `readEngineConfig` |
| 14 | Generators: import fences ×4, `.zen` path, `npm view @dotzen/dotzen`, banner | `scripts/gen-rule-docs.ts:52-86`; `gen-examples.ts:21`; `session-context.ts:53,70` | update literals, then `npm run gen-docs && npm run gen-examples` (check-docs gate depends on it) |
| 15 | On-disk artifacts: 43 `dotzen.json` (contents carry `"spec": ".zen/spec.ts"`), 46 `.zen/` dirs (41 integration fixtures + demo + examples/ + ai-generated corpus), 3 skill dirs `dotzen-*`, `demo.tape` paths | repo-wide | scripted git-mv + content fix; verify via git status |
| 16 | Trusted Publisher binding (owner=ealmachado-eng, repo=dotzen, workflow=release.yml) | npmjs.com-side registration (the real coupling); mirrored in `.claude/skills/dotzen-release/SKILL.md:195`; `release.yml:5-8` comments | RE-REGISTER on npm for `@erkos-hq/<tool>` under repo `erkos-hq/<tool>` — else publish fails ENEEDAUTH at tag time only |
| 17 | Docs sweep: root README (42 hits; ships in tarball via prepack — re-copy to `packages/cli/README.md`), CLAUDE.md (30, incl. the `dotzen.dev` line → erkos.dev), AGENTS, ONBOARDING, specs 00-08/10/11, user docs, skills, demo/examples READMEs | ~430 occurrences / 43 hand-written files | hand-edit; generated files regenerate via gen-docs |
| 18 | HISTORICAL — keep: CHANGELOG old entries (add v2.0.0 on top), REBRAND.md itself, SESSION_HANDOFF (append / supersede in place), ROADMAP dogfood-log entries | — | never rewrite |

Clean (verified, no action): `.githooks/post-commit`, `stryker.conf.json`, `vitest.config.ts`, `.prettierignore`, `renovate.json`, `.opencode/plugins/*`, `opencode.jsonc`, `ci.yml` functional keys, `codeql.yml`, LICENSE (keeps "Eduardo Machado" unless reassigned), `dist/`+`coverage/` (regenerate). Order matters: generators (14) before the gate; repo transfer before PR merge (so new absolute links resolve); full gate = `npm run typecheck && lint && format:check && test && test:integration && coverage && check-docs` from `packages/cli/`, then `graphify update .`.

## Hard constraints (unchanged by rebrand)

- npm no-republish. Trusted publishing needs Node 24/npm 11. `prepack` copies root README. Mermaid doesn't render on npm; absolute links only. 0-false-positive thesis. Version pinning via contract file.

## How to resume this file

1. ✅ **Name locked: pluvian (2026-09-01).** Remaining Phase C (user): create GH org `erkos-hq` + npm org `erkos` (+ optional `erkos.dev`); transfer repo → `erkos-hq/pluvian`; register Trusted Publisher on npm (`@erkos/pluvian`, owner=erkos-hq, repo=pluvian, workflow=release.yml). Then Phase D from the playbook table below, then Phase E.
2. If still deciding → the live candidates are: **Squama, Sphragis, Gharial** (round 1) + **Agger, Scute** (round 2) + **Pluvian, Erne, Numida, Tutela** (round 3, birds/watchtower — see the round-3 table; only Pluvian is DDG-checked). Sobek only if user accepts TM risk. All npm-free candidates verified 2026-09-01; don't re-run it. On record, no push: **Pluvian = the crocodile-bird pick** (partners with the locked mascot, purest Pattern C); Squama = usability/zero-risk pick; Gharial = *erkos odonton* narrative pick; Agger = the Terraform double-meaning pick (accept Dagger-adjacency).
3. User decision style this session: holds under pressure, wants zero-risk options, responds well to trade-off tables + blunt recommendations. Don't push; present and wait.
