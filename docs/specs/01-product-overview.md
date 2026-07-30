# 01 — Product Overview

## The problem

Organizations are moving from "developers call pre-approved, team-built
Terraform modules" to "developers generate Terraform HCL via AI (Copilot,
ChatGPT, agentic coding tools) directly." This is happening now, is
accelerating, and existing pre-built-module governance strategies do not
survive the transition: if developers no longer route through the
module, the module can no longer be the governance chokepoint.

AI-generated Terraform has a specific, predictable failure mode: the
model does not know an organization's internal policies (required tags,
banned open ports, data-residency rules, encryption requirements) and
will generate plausible-looking, syntactically valid HCL that violates
them. This is not a hypothetical risk — it is the default outcome of
asking a general-purpose model to write infrastructure code without
organization-specific context.

## The insight that makes AI-generated infrastructure *governable*

AI-generated Terraform tends to be **explicit and literal**, not
abstracted through variables or external modules, because the model is
producing the most direct code that satisfies the prompt. A `0.0.0.0/0`
CIDR block, a `publicly_accessible = true`, a missing `encrypted = true`
— these appear as literal values in the generated HCL far more often
than they would in hand-written, parameterized code.

This means **static analysis of the HCL text**, without needing a
resolved `terraform plan` (credentials, state access, network
connectivity), catches the large majority of real violations in
AI-generated code. The same property of the code that creates the risk
(directness, literalness) is what makes it detectable. This is why
dotzen's local check does not require Terraform credentials or state —
see `/docs/specs/03-distribution-and-cli.md` §"Static analysis vs
`terraform plan`."

> **This is a bet, not yet a measured fact.** The claim above is strongly
> plausible but unproven in this repository. Before committing to v1
> scope, run the engine against a corpus of *real* AI-generated `.tf` and
> measure the false-positive / false-negative rate of static matching.
> The cheapest way to de-risk the entire product is a thin vertical slice
> — parse one file, evaluate one rule (e.g. `denyIngress` on a security
> group), print one violation — pointed at real generated Terraform, not
> more design. If static matching turns out to miss too much, that is a
> finding worth having early, while the architecture is still cheap to
> adjust.

> **Measured (v0 slice, 2026-07).** The bet was tested against a corpus of
> representative AI-generated security-group HCL
> (`packages/cli/examples/ai-generated/`). Result: literal inline
> `ingress` with `0.0.0.0/0` is caught; the modern decomposed
> `aws_vpc_security_group_ingress_rule` form is caught; and the cases
> static analysis genuinely cannot judge — a `var`-supplied CIDR and a
> `dynamic "ingress"` block whose values reference the `for_each`
> variable — correctly report **could not evaluate** rather than passing
> silently. Zero false negatives on the corpus, and the "never a silent
> pass" principle held in practice. The bet holds for the AI failure mode
> it targets; the honest-degrade path is doing its job.

## Product philosophy: Prose as Code

Existing policy-as-code tools (OPA/Rego, Sentinel) are built for the
people who write policies, not for the people who must review, approve,
or be governed by them. Rego in particular has a real learning-curve
barrier that keeps non-programmer security architects out of the
authoring and review loop entirely — policies get written by whoever on
the platform team knows Rego, and reviewed by trust rather than
comprehension.

dotzen's core bet is that **governance rules should be legible to the
person accountable for them.** The `.zen/spec.ts` DSL is TypeScript
under the hood but is deliberately disciplined (see
`/docs/specs/02-spec-dsl.md`) to read like structured prose:

```typescript
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH, Port.RDP)
  .message('SSH and RDP must not be open to internet'),
```

A security architect who has never written a line of TypeScript can
read this, understand exactly what it does, and approve or reject it in
an MR review — without needing to trust the platform engineer's
unreviewable Rego.

## Positioning against existing tools

| | OPA / Rego | HashiCorp Sentinel | tfsec / Checkov | **dotzen** |
|---|---|---|---|---|
| Authoring audience | Platform/security engineers who know Rego | Same, Rego-adjacent | Nobody — rules are hardcoded/YAML | Security architects directly, via readable DSL |
| Local pre-commit check | Possible but high-friction (multi-step CLI, JSON plan wrangling) | Not available outside Terraform Cloud/Enterprise | Yes | Yes, first-class, zero-install via `npx` |
| Requires credentials/state locally | Usually (for `terraform show -json`) | Yes (Cloud/Enterprise only) | No (static analysis) | No (static analysis by default) |
| Vendor lock-in | No | Yes (Terraform Cloud/Enterprise) | No | No |
| Vocabulary customizable to org | Yes (Rego) | Yes (Sentinel) | Limited (mostly generic rules) | Yes — org-specific enums generated from schema |
| Install friction | Binary install | Enterprise product | Binary install | **Zero** — `npx` |

dotzen's differentiated claim is not "better rule engine" — it is
**"the governance layer designed for the specific failure mode of
AI-generated infrastructure, with an authoring experience non-engineers
can actually review, and zero adoption friction."**

## Target users — two entry ramps

Governance tools have a quirk: the *user* and the *buyer/advocate* are usually
different people, and a developer won't voluntarily self-impose a blocker. So
there isn't a single linear "win over first" ladder — there are two entry ramps
that meet in the middle.

### Bottom-up — the individual developer (the launch wedge)

The developer generating Terraform via AI is the *user*. They will not adopt a
governance check for its own sake — but they *will* adopt a tool that their
**AI coding agent runs in its own loop**: the agent writes Terraform, runs
`npx @dotzen/dotzen@1 check`, reads the findings, and fixes them before the
developer ever opens a PR. The dev's win is fewer review cycles and less
rework, not "I love policy." This is why dotzen must be zero-install (`npx`)
and credential-free — the agent loop only works if the check is instant and
self-contained. This bottom-up wedge is how adoption starts before any
organizational mandate (the eslint/Prettier playbook), and the agent loop is
what makes a *governance* tool credible on that path — without it, "developers
will voluntarily add a blocker" is not a believable thesis.

### Top-down — security architect + platform engineer (the org-wide driver)

The *advocates/buyers* who actually put dotzen into CI:

- **The security architect** authors and approves the spec. This is often the
  person who *brings* dotzen in — OPA/Rego lock them out of authoring (someone
  who knows Rego writes the policy; the architect reviews it on trust), and
  dotzen's readable DSL lets them read `.zen/spec.ts` directly in a
  GitLab/GitHub MR diff and own the rules themselves. They are the internal
  champion.
- **The platform engineer** puts dotzen into the CI pipeline and pre-commit
  hooks. Needs it to be a single, well-documented pipeline step, not an
  infrastructure project of its own (hence: no servers, no database, no cloud
  dependency for v1 — see `/docs/specs/05-future-cloud-layer.md`).

In most orgs this ramp is the real adoption driver: the architect champions,
the platform team mandates, and the developer (often already using dotzen via
the agent loop) complies. The two ramps reinforce each other rather than one
strictly preceding the other.

### Trailing beneficiary — compliance / audit

LGPD, SOC2, PCI-DSS, CIS benchmarks. Needs an audit trail proving which rules
applied to which infrastructure change and when — served for v1 by CI logs and
Git history in a monorepo (see `/docs/specs/04-governance-model.md`), not by a
dedicated compliance dashboard (that's v2+, see
`/docs/specs/05-future-cloud-layer.md`).

## The "governance as three-layer defense in depth" model

A rule violation in AI-generated Terraform is caught by up to three
independent layers, each covering what the others might miss:

1. **Generation-time (optional, future):** an authoring skill injects
   the organization's spec into the LLM's context so generated code is
   compliant from the first draft. Not required for dotzen to function.
2. **Local (pre-commit hook, via `npx`):** static HCL analysis, instant
   feedback, before a commit is even made. This is the fail-fast layer.
3. **Pipeline (CI gate, via `npx`):** the same engine and same
   `dotzen.json`-pinned version, run again before `terraform apply`.
   This is the layer that cannot be bypassed by a developer skipping
   their local hook — it is the non-negotiable institutional gate.

No single layer needs to be perfect because the layers overlap. See
`/docs/specs/04-governance-model.md` for the full model including
production-approval gates via CI manual jobs.

## What dotzen explicitly is not (v1)

- Not a `terraform plan` replacement or a cost-estimation tool.
- Not a secrets scanner (though a rule *could* be written to flag
  hardcoded values that look like secrets — this is a rule authors can
  write, not a built-in dotzen feature).
- Not a general-purpose OPA/Rego alternative for non-Terraform domains
  (Kubernetes admission control, API gateways, etc.) — though the
  underlying "spec-driven development" pattern generalizes, and other
  applications were explored (IAM policies, LLM input filtering for
  sensitive data, CI/CD pipeline gates, feature flags, DB migrations —
  see `/docs/specs/00-architecture-decision-record.md` context and the
  original design conversation for the full list). None of these are
  in scope for the dotzen v1 repository.
