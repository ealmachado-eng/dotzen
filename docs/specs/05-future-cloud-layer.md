# 05 — Future Cloud Layer (Deferred — Not v1)

Everything in this document was designed in real detail during the
project's exploration phase and is preserved here **for continuity**,
not as a v1 task list. Read `CLAUDE.md` §6 first: building any of this
before v1 has real users is the specific mistake this document exists
to prevent.

**Trigger condition for revisiting this document:** dotzen has real
users running it in CI/pre-commit, and they are explicitly asking for
one of the capabilities below — not before.

## Why none of this is needed for v1

Every capability described here can be approximated adequately by:
- **CI logs** as the audit trail (GitLab/GitHub already store and
  retain these).
- **A monorepo's Git history** as the spec-change audit trail (see
  `/docs/specs/04-governance-model.md`).
- **The spec file itself, reviewed in an MR**, as the "approval
  workflow" for rule changes.

Building server infrastructure to formalize what Git and CI already do
adequately is the classic premature-platform mistake. v1's entire value
proposition (see `/docs/specs/01-product-overview.md`) is achievable
with zero servers.

## Deferred capability 1: Central spec registry

**Problem it solves:** In a polyrepo setup, distributing spec updates to
every team requires either a monorepo (preferred, see
`04-governance-model.md`) or manual copy-paste/submodule/npm-package
distribution.

**Design (if ever built):** Publish `.zen/spec.ts` as a versioned npm
package (`@your-org/dotzen-spec`) that consuming repos take as a
`devDependency`. This is actually achievable **without any cloud
infrastructure** — npm itself is the registry. A "Deno Deploy-hosted
spec API" was considered during design specifically to avoid needing an
npm-publish step for spec updates, but **the npm-package approach is
strictly simpler and should be tried first** if/when this problem is
real. Only build a custom API if the npm-package approach proves
insufficient.

## Deferred capability 2: Central violation/audit reporting API

**Problem it solves:** Compliance wants a single queryable view of every
violation across every team, without manually aggregating CI logs from
N repositories.

**Design (if ever built):**
- **Backend:** Deno Deploy (serverless edge runtime) + Deno KV (built-in
  key-value store, no separate database to provision). Chosen originally
  for near-zero operational burden: no servers, generous free tier,
  global distribution, no connection strings.
- **What gets sent:** violation *metadata only* — rule name, resource
  identifier, file, line, severity, team, repo, commit SHA, timestamp.
  **Never the actual HCL content, variable values, or state file
  contents.** This is a hard privacy/security constraint, not a nice-to-
  have — sending raw Terraform source to any external service, even
  one you operate, is a legitimate objection any security-conscious
  organization will raise, and metadata-only reporting is the answer
  (same pattern as how Snyk/Dependabot report vulnerabilities without
  uploading source code).
- **Self-hosting option:** for enterprise customers requiring
  everything on-premise / air-gapped, the same Deno Deploy code should
  be deployable via Deno Subhosting or a Docker image, not only the
  multi-tenant SaaS instance.

```typescript
// Example payload shape — metadata only
{
  team: "payments",
  repo: "payments-api",
  commit: "abc123",
  violations: [
    { rule: "no-public-ssh", resource: "aws_security_group.web",
      file: "terraform/network.tf", line: 23, severity: "block" }
  ],
  passed: 47,
  failed: 1
}
```

## Deferred capability 3: Web dashboard

**Problem it solves:** A security architect wants a browser-based view
of compliance status without opening a repository.

**Design (if ever built):** Deno Fresh (server-side rendered, deployed
on Deno Deploy alongside the reporting API from capability 2) —
violation history, trend charts, per-team compliance status. No
separate frontend hosting, no separate backend — Fresh + Deno Deploy
was chosen specifically to minimize the number of moving parts an early
product would need to operate.

## Deferred capability 4: WASM-sandboxed community policy-pack
## marketplace

**Problem it solves:** Once dotzen has a community, allowing anyone to
publish and share reusable rule packs (e.g. a "PCI-DSS pack," an
"LGPD pack") requires running **untrusted third-party code** safely —
a materially different threat model from v1's spec, which is always
authored by the consuming organization's own platform team in their own
private repo.

**Design (if ever built):** This is the one place where the language
choices rejected in the main ADR (`00-architecture-decision-record.md`)
become relevant again:
- **AssemblyScript compiled to WASM**, executed via a Wasm runtime
  embedded in the Node engine (`wazero`-equivalent for Node, or a
  WASI-based approach) — chosen because WASM provides real sandboxing
  (no filesystem/network access unless explicitly granted) and
  AssemblyScript's TypeScript-like syntax lowers the contribution
  barrier for a large pool of potential pack authors.
- Untrusted packs never get access to anything beyond the resource data
  passed into the sandbox — no ambient authority.

**Do not build this until there is an actual community wanting to
publish packs.** It solves a problem v1 does not have.

## Deferred capability 5: Interactive/analytical rule-development tier

**Problem it solves:** Writing and validating new governance rules
against real historical infrastructure data, and analyzing violation
trends over time (which teams are generating the most violations, is a
specific rule too noisy / high false-positive-rate, what's the cost
impact of newly-required instance sizes) is fundamentally an
exploratory, iterative, data-analysis task — a different shape of
problem than the fast-path CLI check.

**Design (if ever built):** **Julia**, specifically because:
- Julia's startup time (even optimized) is too slow for the fast-path
  CLI (this is *why* Julia was rejected as an engine language in the
  ADR) — but that constraint doesn't apply to an asynchronous analysis
  job or an interactive notebook.
- **Pluto.jl** notebooks are well suited to interactive rule
  development: load a corpus of real (anonymized) Terraform plans,
  write a candidate rule, immediately see which resources it would
  flag, iterate.
- Julia's data-analysis ecosystem is a natural fit for violation-trend
  analysis, false-positive-rate calibration per rule, and cost-impact
  reporting — directly reusing prior experience with CloudQuery/
  Steampipe-style infrastructure data analysis.

This tier would consume the violation-metadata API from capability 2
(read-only) and never sits in the fast path any developer or CI
pipeline waits on.

## Explicitly not part of any future dotzen roadmap

The separate **AI agent authorization/policy engine** (its own runtime
and stack, with a fluent-interface DSL for agent identity, delegation
chains, tool-call scopes, and ephemeral permission grants) explored in
parallel
during this project's design phase is a **distinct product**, not a
dotzen feature. If it is ever built, it gets its own repository and its
own `CLAUDE.md` — do not merge its scope into this one. See
`CLAUDE.md` §6 for the explicit boundary statement.
