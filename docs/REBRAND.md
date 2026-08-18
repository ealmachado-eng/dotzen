# Rebrand — dotzen → tafros <tool> (pre-launch)

> **Status: IN PROGRESS — tool name not yet locked.** This file reconstructs the rebrand discussion (the original was lost with a session; this capture prevents recurrence). Read `docs/SESSION_HANDOFF.md` Session N+2 for the narrative arc.

## Trigger

**Trademark conflict on "dotzen".** Total rebrand decided before launch — all six axes: product name, domain, npm package, GitHub repo, logo, tagline.

## Locked decisions (do not re-litigate without new facts)

| Axis | Decision | Notes |
|---|---|---|
| **Umbrella brand** | **tafros** (Greek: τάφρος = moat) | Umbrella IS the platform bet (see "Governance OS" below). `erkos` was evaluated as umbrella and REJECTED — breaks the beast-in-moat narrative. Erkos survives as a tool-name candidate only. |
| **Brand pattern** | **C — mascot + coined technical name** | Package/CLI uses a technical name; the beast + character live in marketing/docs. Rejected: B (character-as-package — weak trademark, enterprise-tone risk), A (beast only in marketing — loses narrative integration). |
| **Mascot (this tool)** | **Crocodile** | Canonical moat beast. Character name DEFERRED (Greek personal names like Sotiris/Nereus considered for the character layer — do NOT use as package names; personal names are weak trademarks). |
| **GitHub handle** | `tafros-hq` (direction) | `github.com/tafros` taken by unrelated user (1 repo, OPNsense fork). `tafros-hq` verified open. **NOT YET CLAIMED — do this before publishing.** |
| **Domain** | `tafros.dev` (direction) | Umbrella site; products listed at `tafros.dev/<name>` — no per-tool domain hunt. Registration status UNVERIFIED. |
| **npm** | `@tafros-hq/<tool>` scope | Org NOT YET CREATED. npm no-republish applies to the new package too. |
| **Beast→category mapping** | Deferred until product #2 | Ad-hoc per product for now. |

## Candidate matrix — tool name (screened 2026-08-11/18)

Screening = npm (`npm view <name>` 404) + GitHub username + DDG common-law. USPTO TESS is SPA/captcha — manual search required for any finalist (see "Sobek" note).

| Name | Type | npm | Risk | Mascot/semantic tie | Status |
|---|---|---|---|---|---|
| **Squama** | Latin "scale" | clean | ~zero | Direct (crocodiles are scaly) | **Front-runner.** DDG: zero commercial use in dev space. |
| **Sphragis** | Greek σφραγίς "seal" | clean | ~zero | Security×identity primitive (ancient seal = tamper-proof + owner identity). Frees mascot from crocodile if ever wanted. | Strong. Pairs with tafros (Greek×Greek). |
| **Gharial** | Crocodilian, ~110-tooth snout | clean | ~zero | **Identity tie with erkos** (snout = Homer's "erkos odonton", rampart of teeth) — but erkos lost as umbrella, so tie weakened. 7 chars. | Alive. Distinctive + visually iconic. |
| **Erkos** | Greek "enclosure/hedge" | clean | ~zero | Perimeter semantic; Greek pairing with tafros | Alive as tool name (umbrella bid rejected). |
| **Synthema** | Greek "watchword" | clean | ~zero | Byzantine military password = secret + recognition | Backup. |
| **Suchus** | Greek form of Sobek | clean | ~zero | Same god narrative | **Deprioritized** — pronunciation drift (SOO-kus/SUK-us), "such" lexical clash, academic not mythological register. |
| **Sobek** | Egyptian crocodile god | clean | **medium** | God of protection; instant recognition | **User's pick, then stepped back for 0-risk.** Hi-Rez's Smite character (class 9 adjacency); 4 LIVE USPTO applications (serials 99550639, 99531559, 99917809, 99920976 — classes unknown, TESS manual check needed). OSS calculus: lawsuit <1%, but npm takedown ~10% if reported. Path if chosen: use without TM filing, rename window pre-publish is cheapest. |
| **Caim / gatorix / caima** | Coined clippings | clean | zero | Loose | Weak — lose instant recognition. |
| **croc / gator / snake / owl / heron / caiman / alligator / naja / varanus / krok / crock / wolf / lion / bear / drake / draco / falcon / hawk / mastiff / viper** | Animal-type | **TAKEN** | — | — | **Architecture dead on npm.** Also `croc` = schollz/croc file-transfer CLI (mental-model collision). `krokodil` = Russian street drug — never. |
| **Sotiris / Nereus / etc.** | Greek personal names | clean | weak TM | Character layer only | Rejected as package names (personal names need secondary meaning to register; reads wrong as CLI). |
| Tagma / Styx / Candor / Lorica / Thesmos / Phraxis / Temenos / Nomos / Teichos / Talos / Argus / Janus / etc. | Various classical | most TAKEN | — | — | Killed by npm filter in first sweep (Tagma, Nomos, Styx, Lorica, Thesmos, Phraxis, Temenos all npm-taken except where noted clean above). |

## Strategy layer (decided orientation, not launch posture)

**Governance OS endgame — yes; launch message — no.**
- "OS" has drifted from metal (NixOS = config-as-OS; Slack/Stripe/Shopify marketing sense). Legitimate, but crowded positioning.
- **npx architecture is fully OS-compatible** (Prisma/Nx/Bun/Playwright precedent). Current codebase ~70% domain-agnostic (DSL + engine conditions + report pipeline). Remaining 30%: isolate HCL parse/normalize behind a DomainAdapter interface — 3-6mo refactor, not rewrite.
- **NixOS is the reference architecture**: "governance posture is a pure function of the spec" — deterministic, reproducible, side-effect-free. Patterns worth borrowing: module system, generations/rollback of governance posture, Nixpkgs-style community vocabulary, flake-like pinning (already implicit in dotzen.json).
- Positioning ladder (audience-split): dev docs → "NixOS for governance" framing; buyer deck → "control plane for AI-generated infrastructure".
- Ship the wedge (Terraform governance), earn the platform (2nd domain adapter), never declare OS at launch.

## Execution plan (after name locks)

- **Phase C — lock identity**: claim `tafros-hq` GH org + npm org + verify/buy `tafros.dev`; decide contract-file renames (`dotzen.json` → `<tool>.json`, `.zen/` → `.<tool>/` — recommend YES pre-launch); keep "Prose as Code" tagline (independent of name); logo concept deferred to design pass.
- **Phase D — mechanical rebrand** (~6h): package.json/bin/src/tests; contract files; README/CLAUDE/AGENTS/docs/specs/skills; CI workflows + branch rulesets; memory harness (session-context.ts, plugins); re-run `npm run gen-docs` + `gen-examples`; full gate; graphify update. Single squashed commit as v2.0.0 prep. Note: `.gitattributes` line 1, `dotzen.module-following` ruleId, `DOTZEN_REQUIRES_APPROVAL` env signal, jiti self-alias in spec loader — all carry the old name.
- **Phase E — launch**: v2.0.0 CHANGELOG (rebrand rationale + migration: uninstall old, install new, rename contract files); publish `@tafros-hq/<tool>@2.0.0` w/ provenance; deprecate `@dotzen/dotzen` w/ migration README; launch post was NEVER sent (Show HN / r/terraform draft exists in docs/launch/) — rewrite for new name.

## Hard constraints (unchanged by rebrand)

- npm no-republish. Trusted publishing needs Node 24/npm 11. `prepack` copies root README. Mermaid doesn't render on npm; absolute links only. 0-false-positive thesis. Version pinning via contract file.

## How to resume this file

1. If tool name is locked → update the matrix row to **LOCKED**, fill Phase C checklist items as claimed, proceed to Phase D.
2. If still deciding → the live candidates are: **Squama, Sphragis, Gharial, Erkos** (+ Sobek if user accepts TM risk). Screening data is above; don't re-run it.
3. User decision style this session: holds under pressure, wants zero-risk options, responds well to trade-off tables + blunt recommendations. Don't push; present and wait.
