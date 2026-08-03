# dotzen

**Prose as Code.** Governance for AI-generated Terraform — AWS, Azure, and GCP.

```bash
npx @dotzen/dotzen@1 check ./terraform/
```

A zero-install governance layer that catches policy violations in Terraform HCL —
especially the kind AI code-gen tools produce when they don't know your
organization's security, tagging, and compliance requirements. Rules are written
in a readable, strongly-typed TypeScript DSL (`.zen/spec.ts`) designed to be
reviewed by a security architect who has never written code:

```ts
rule()
  .resource(AwsResource.SecurityGroup)
  .denyIngress(Port.SSH, Port.RDP)
  .message('SSH and RDP must not be open to the internet')
  .rationale('CIS AWS Foundations Benchmark v1.4, control 5.2')
```

Every finding is **`block`** (fails the build), **`warn`**, or **`require_approval`**
(pauses CI for sign-off). When dotzen can't statically resolve a value, it reports
**`could not evaluate`** instead of guessing — for a governance tool, a false
positive is worse than an honest gap.

It runs wherever Terraform is written — pre-commit hook, CI pipeline, or **inside
the AI coding agent's own loop**: the agent runs `npx @dotzen/dotzen@1 check`,
reads the findings, and fixes them before you ever see the PR. Catch violations at
the earliest, cheapest gate.

> **v1.9.32** · 144 rules across 8 presets · 42 rule conditions · ~3,200 resource
> types recognized (3 clouds) · 801 unit + 40 integration tests · published to npm
> with [SLSA provenance](https://docs.npmjs.com/generating-provenance-statements)
> · **0 false positives across 18 real-world module repos** (3 clouds).

---

## Why dotzen

Organizations are moving from "developers call pre-approved modules" to
"developers generate Terraform with AI (Copilot, ChatGPT, agents)." Once the
developer stops routing through the module, **the module can no longer be the
governance chokepoint** — and the model doesn't know your required tags, banned
ports, data-residency rules, or encryption baseline.

The insight that makes this governable: **AI-generated Terraform is literal and
explicit** — a `0.0.0.0/0` CIDR, a `publicly_accessible = true`, a missing
`encrypted = true` appear as literal values far more often than in hand-written,
parameterized code. So **static analysis of the HCL text** catches the large
majority of real violations — _without_ `terraform plan`, credentials, or state
access. The same directness that creates the risk is what makes it detectable.

### How it's different

|                                  | OPA / Rego              | HashiCorp Sentinel    | tfsec / Checkov               | **dotzen**                                |
| -------------------------------- | ----------------------- | --------------------- | ----------------------------- | ----------------------------------------- |
| Authoring audience               | Engineers who know Rego | Same                  | Nobody — rules hardcoded/YAML | **Security architects**, via readable DSL |
| Local pre-commit check           | High-friction           | Cloud/Enterprise only | Yes                           | **Yes, zero-install `npx`**               |
| Needs credentials / state        | Usually                 | Yes                   | No                            | **No**                                    |
| Org-customizable rules           | Yes                     | Yes                   | Limited                       | **Yes**                                   |
| Topology-aware (multi-hop) rules | —                       | —                     | No                            | **Yes — graph layer**                     |
| Vendor lock-in                   | No                      | Yes                   | No                            | **No**                                    |

> **Same layer as tfsec/Checkov** (static HCL, no creds/state) — dotzen doesn't
> claim a unique layer there. The differentiator vs them is the **readable DSL**,
> the **topology graph**, and **zero-install `npx`**. The "different layer" claim
> is vs **OPA/Sentinel**, which run at the _plan/policy_ layer and need
> credentials + state (or Terraform Cloud).

dotzen's claim isn't "better rule engine." It's **the governance layer designed
for the failure mode of AI-generated infrastructure, with authoring non-engineers
can actually review, at zero adoption friction.**

### Where dotzen fits — defense in depth

dotzen **complements, not replaces**. It occupies one layer in a stack, and the
layers cover each other's blind spots:

```text
 gitleaks /         dotzen                OPA / Sentinel           cloud config /
 secret-scan   →    (static code +    →   (plan + policy,     →   CSPM / Config
 (secrets)          config)               needs auth + state)     (running cloud)
                         ↑
                         dotzen sits here — the fail-fast code layer:
                         no credentials, no state, no terraform plan
```

- **Secrets** — gitleaks/CI secret-scanning (the plaintext key in a var).
- **Code/config (dotzen)** — the `.tf` you're about to commit. No credentials,
  no state, no `terraform plan` — runs in pre-commit, CI, or an agent loop.
- **Plan/policy** — OPA/Sentinel evaluate the resolved plan (needs auth/state;
  catches what static text can't).
- **Deploy** — the running cloud (CSPM, Config).

dotzen is the **fail-fast code layer** — the cheapest place to catch the literal
mistakes AI-generated Terraform makes by default.

---

## Who this is for

Governance tools have a quirk: the person who _uses_ the tool day-to-day
and the person who _champions_ it inside an org are rarely the same
person. dotzen is built around both.

- **The developer generating Terraform via AI** won't add a blocker for
  its own sake — but will happily let their **coding agent** run
  `npx @dotzen/dotzen@1 check` in its own loop, read the findings, and
  fix them before a PR ever opens. Fewer review cycles, not "I love
  policy."
- **The security architect** authors and owns the spec. Rego locks them
  out of authoring — someone else writes the policy, they approve on
  trust. `.zen/spec.ts` reads like prose they can review and edit
  directly in an MR diff.
- **The platform engineer** wires it into CI and pre-commit. No servers,
  no database, no credentials — one pipeline step.

In most orgs the architect champions it, the platform team mandates it,
and the developer — often already using it via the agent loop — was
never blocked in the first place.

---

## The 30-second demo

Point dotzen at any Terraform project that has a `.zen/spec.ts`:

```bash
npx @dotzen/dotzen@1 check ./terraform/
```

```
── BLOCKING ──
✗ aws_security_group.web  (terraform/main.tf:2)
    SSH and RDP must not be open to the internet
    ↳ CIS AWS Foundations Benchmark v1.4, control 5.2

✗ 1 violation(s), 14 passed, 0 could not be evaluated
```

No install step, no Gatekeeper dialog on macOS, no SmartScreen on Windows, no
cloud credentials. The `could not evaluate` count is the honest-gap signal —
values dotzen can't resolve statically (a `var`-supplied CIDR, an unresolved
`for_each`) rather than a silent pass.

---

## How it works

dotzen is a static-analysis pipeline. The parser is a pure-JS WASM dependency
(`@cdktf/hcl2json`) — **no native binary, no `terraform plan`**, which is what
keeps the local check fast and credential-free.

```text
 .tf HCL files
      │
      ▼
 hcl2json parse
      │
      ▼
 normalize    ← vars · locals · ternary · merge · modules · for_each · dynamic
      │
      ▼
 evaluate     ← 42 conditions + dependency graph
      │
      ▼
   report  ───→  terminal (ANSI)            [default]
           ───→  --format json              [CI artifact]
           ───→  --format sarif 2.1.0       [GitHub Code Scanning / GitLab]
```

Three outcomes, never collapsed: a rule **violates**, **passes**, or **could not
be evaluated**. `couldNotEvaluate` is carried inside the success track — it's not
an error and not a silent pass.

### The graph layer — topology-aware rules (differentiated)

Per-resource rules ("is this RDS encrypted?") cover most CIS controls. A class of
real controls needs **multi-hop traversal** — and no static Terraform tool does
this as authorable rules. dotzen does:

```ts
rule()
  .resource(AwsResource.DbInstance)
  .denyIfReachable(AwsResource.InternetGateway)
  .message('Database instances must not be in a public subnet')
```

The graph walks the reference chain bidirectionally — forward and reverse — to
decide reachability:

```text
 aws_db_instance
      │  subnet_id  (forward)
      ▼
 aws_subnet
      │  who references this subnet?  (reverse hop)
      ▼
 aws_route_table_association
      │  route_table_id
      ▼
 aws_route_table
      │  gateway_id
      ▼
 aws_internet_gateway   ◀── target reached → violation
```

If that chain reaches an Internet Gateway, the DB is in a public subnet →
**violation**, with the exact chain rendered in the finding detail. Partially-
unresolvable chains (an opaque `var`) degrade honestly to `could not evaluate`,
never a false pass. Three graph conditions ship: `denyIfReachable`,
`denyIfSharedWith` (no shared SG between a public LB and a private DB), and
`denyIfReachableAttr` (e.g. a bucket's KMS key must be customer-managed).

---

## Coverage

- **AWS** (deep): VPC/SG/NACL, RDS/Aurora/DynamoDB/ElastiCache, S3, EBS/EFS,
  KMS/SecretsManager, EKS/ECS, ALB/NLB, Lambda, CloudTrail/Config/IAM, and more.
- **Azure** (CIS L1): NSG, Storage, SQL/PostgreSQL/MySQL, Key Vault, AKS,
  App Service, Functions, VMs (+ the graph-layer VM→NIC→public-IP rule).
- **GCP** (CIS L1): Compute Firewall, GKE, Cloud SQL, KMS, Cloud Run Functions,
  BigQuery, storage.
- **8 presets**: `coreSecurity` + `cisAws` / `cisAzure` / `cisGcp` +
  `pciDss` / `soc2` / `nist80053` / `dataProtection`. Spread what you need.
- **3 output formats**: terminal (default), `--format json`, `--format sarif`.

---

## Quick start

**1. Run it** against existing Terraform (zero install):

```bash
npx @dotzen/dotzen@1 check ./terraform/
```

**2. Author a spec.** Copy a starting point from [`examples/`](https://github.com/ealmachado-eng/dotzen/tree/main/examples) —
[`startup/`](https://github.com/ealmachado-eng/dotzen/blob/main/examples/startup/.zen/spec.ts) (lean baseline),
[`enterprise/`](https://github.com/ealmachado-eng/dotzen/blob/main/examples/enterprise/.zen/spec.ts) (multi-cloud CIS + prod
change-safety gates), or [`regulated/`](https://github.com/ealmachado-eng/dotzen/blob/main/examples/regulated/.zen/spec.ts) (full
compliance stack + data residency). Each is a standalone `.zen/spec.ts` you edit
and commit.

```ts
import {
  coreSecurity,
  cisAws,
  rule,
  AwsResource,
  Port,
  Effect,
} from '@dotzen/dotzen'

export const spec = [
  ...coreSecurity, // secure-by-default baseline
  ...cisAws, // CIS AWS Foundations additions

  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveTags('Application', 'Owner') // use an OrgTag enum in real specs
    .message('Buckets must carry ownership tags'),
]
```

**3. Pin the exact version** in `dotzen.json`. The install (`@1`) floats within
major 1; `dotzen.json` is the **enforcement** pin — the engine does an exact
match and refuses to run on a mismatch, printing the corrective command. (Run
`npx @dotzen/dotzen@1 init` to generate it.)

```json
{ "spec": ".zen/spec.ts", "terraform": "./terraform", "version": "1.9.32" }
```

This is also what makes `@1` safe in CI: if a run fetches a newer `1.x` than
`dotzen.json` pins, the engine refuses loudly and forces an intentional bump —
no silent drift. (`@latest` is deliberately never used — it's unbounded across
majors.)

**4. Wire CI.** Add `npx @dotzen/dotzen@1 check` as a GitHub Actions /
GitLab CI step, or upload SARIF via `github/codeql-action/upload-sarif@v3`.

---

## Credibility

- **0 false positives** across **18 real-world module repos** (terraform-aws-modules,
  terraform-google-modules, Azure/, cloudposse/) on three clouds — dogfooded every
  release since v1.9.6.
- **Honest degradation**: `couldNotEvaluate` for unresolvable values, never a guess
  and never a silent pass.
- **Defense in depth**: structural, resource-aware governance that complements
  (doesn't replace) gitleaks/secret-scanning.

---

## Documentation

The engine is documented deeply in `docs/specs/`:

- [`00-architecture-decision-record`](https://github.com/ealmachado-eng/dotzen/blob/main/docs/specs/00-architecture-decision-record.md) —
  why Node/TypeScript + `npx` won on adoption friction (decision locked).
- [`01-product-overview`](https://github.com/ealmachado-eng/dotzen/blob/main/docs/specs/01-product-overview.md) — the problem,
  "Prose as Code," positioning vs OPA/Sentinel/tfsec.
- [`02-spec-dsl`](https://github.com/ealmachado-eng/dotzen/blob/main/docs/specs/02-spec-dsl.md) — the `.zen/spec.ts` language spec.
- [`03-distribution-and-cli`](https://github.com/ealmachado-eng/dotzen/blob/main/docs/specs/03-distribution-and-cli.md) — `npx`
  mechanics, version pinning, the WASM-parser choice.
- [`10-graph-layer`](https://github.com/ealmachado-eng/dotzen/blob/main/docs/specs/10-graph-layer.md) — the dependency-graph design.
- [`ROADMAP`](https://github.com/ealmachado-eng/dotzen/blob/main/docs/ROADMAP.md) — what's shipped and the remaining backlog.

User docs (tutorial, how-tos, auto-generated rule catalog) live in
[`docs/user/`](https://github.com/ealmachado-eng/dotzen/tree/main/docs/user).

---

## Status

Working, published, provenance-attested. The static-analysis engine is at
diminishing returns on coverage/precision. The levers ahead are adoption
(VS Code extension, broader dogfood data) — see [`ROADMAP`](https://github.com/ealmachado-eng/dotzen/blob/main/docs/ROADMAP.md).

MIT licensed. Issues and feedback: [github.com/ealmachado-eng/dotzen](https://github.com/ealmachado-eng/dotzen).
