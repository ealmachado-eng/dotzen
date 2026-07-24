# @dotzen/dotzen

**Prose as Code.** Zero-install governance for AI-generated Terraform — across **AWS, Azure, and GCP**.

```bash
npx @dotzen/dotzen check ./terraform/
```

dotzen catches security, tagging, and compliance violations in Terraform HCL — especially the kind AI code-generation tools produce when they don't know your organization's policies. Rules are written in a readable, strongly-typed TypeScript DSL (`.zen/spec.ts`) meant to be reviewable by a security architect who has never written code:

```ts
import { rule, AwsResource, Port } from '@dotzen/dotzen'

export const spec = [
  rule()
    .resource(AwsResource.SecurityGroup)
    .denyIngress(Port.SSH, Port.RDP)
    .message('SSH and RDP must not be open to the internet')
    .rationale('CIS AWS Foundations Benchmark, control 5.2'),
]
```

Each finding is `block` (fails the build), `warn`, or `require_approval` (pauses CI for sign-off). When a value can't be resolved statically, dotzen reports **"could not evaluate"** rather than guessing — a false positive is worse than an honest gap.

## Getting started

```bash
npx @dotzen/dotzen init      # scaffold .zen/spec.ts + dotzen.json
npm i -D @dotzen/dotzen      # editor autocomplete + type-checking for spec.ts
npx @dotzen/dotzen check     # evaluate ./terraform against the spec
```

Two modes, both supported:

- **Authoring** — install as a devDependency so your editor resolves the
  DSL types (`import { rule } from '@dotzen/dotzen'`) and gives you
  autocomplete + compile-time safety while you write rules.
- **Running** — `npx @dotzen/dotzen check` stays zero-install (nothing to add
  to your project) — ideal for CI. The engine resolves the DSL import itself.

- `--format json` for machine-readable output (schema frozen at `schemaVersion: 1`).
- Pin the version in `dotzen.json` (never `@latest` in CI).

## Curated CIS presets

Three starter rule packs covering CIS Foundations high-impact controls — spread into your spec and extend:

```ts
import { cisAws } from '@dotzen/dotzen'
// or cisAzure, cisGcp

export const spec = [
  ...cisAws, // 24 rules: network, encryption, IAM, audit, tags, secrets
  // ...your custom rules
]
```

- **`cisAws`** (23 rules) — no public SSH/RDP/DB ports, encryption at rest (RDS/EBS/EC2/Redshift/ElastiCache), KMS rotation, S3 public-access block, IAM `Action:*` / `Principal:*` denial, CloudTrail KMS + validation + multi-region, RDS backup retention + not-public, ECR scan-on-push, required tags, secrets hygiene, provisioner denial.
- **`cisAzure`** (17 rules) — storage TLS 1.2 + no public nested + network default-deny + no public network, SQL TLS/SSL, Key Vault purge protection, AKS private cluster + local accounts disabled, App Service HTTPS-only, ACR admin disabled, RBAC Owner/Contributor denial, secrets hygiene.
- **`cisGcp`** (21 rules) — storage public-access-prevention + UBLA + versioning, Cloud SQL SSL + no public IPv4 + no hardcoded root password, GKE private nodes + no legacy ABAC, KMS rotation, compute secure boot + no IP forwarding, IAM `allUsers`/primitive-roles denial, Cloud Run Functions ingress + service account, firewall SSH, secrets hygiene.

Each rule carries `.rationale()` citing the CIS control. Proven end-to-end against real Terraform fixtures.

## Rule conditions

### Resource conditions

| Condition                            | What it flags                                            |
| ------------------------------------ | -------------------------------------------------------- |
| `denyIngress(...ports)`              | SG/firewall opens a port to the internet                 |
| `denyEgress(...ports)`               | Egress opens a port to the internet                      |
| `denyAcl(...acls)`                   | S3 bucket has a public ACL                               |
| `mustHaveTags(...keys)`              | Required tag keys missing (org enums OK)                 |
| `mustBeTrue(...attrs)`               | Attribute must be `true` (e.g. `storage_encrypted`)      |
| `mustBeFalse(...attrs)`              | Attribute must be `false` (e.g. `publicly_accessible`)   |
| `mustBeSet(...attrs)`                | Attribute must be present (any value)                    |
| `denyWhenTrue(...attrs)`             | Flag if the attribute is `true`                          |
| `mustEqual(attr, value)`             | Attribute must equal a specific value                    |
| `mustBeAtLeast(attr, min)`           | Numeric attribute ≥ min                                  |
| `mustBeAtMost(attr, max)`            | Numeric attribute ≤ max                                  |
| `mustBeOneOf(attr, ...values)`       | Attribute must be one of an allowlist                    |
| `denyValue(attr, ...values)`         | Flag if attribute is any of the values                   |
| `denyLiteral(...attrs)`              | Attribute must be a reference, not a hardcoded literal   |
| `listContains(attr, ...values)`      | List attribute contains a forbidden value                |
| `listMustInclude(attr, ...values)`   | List attribute must include all values                   |
| `denyIamWildcard()`                  | IAM policy grants `Action: "*"`                          |
| `denyPublicPrincipal()`              | IAM policy grants `Principal: "*"`                       |
| `requireSslOnlyPolicy()`             | Policy must `Deny` non-SSL transport                     |
| `denyPrivilegedContainers()`         | ECS container is privileged                              |
| `denyPlaintextEnvSecrets()`          | Plaintext secret in env vars (ECS/Lambda/Azure/GCP)      |
| `denyPlaintextConnectionSecret()`    | Plaintext secret in a `connection {}` block              |
| `denyProvisioner(...names)`          | `provisioner "local-exec"/"remote-exec"/"file"` declared |
| `denyIgnoreChanges(...attrs)`        | `lifecycle.ignore_changes` hides drift on named attrs    |
| `mustHaveBlock(block)`               | Resource must declare a nested block                     |
| `denyBlockPresence(block)`           | Resource must NOT declare a nested block                 |
| `mustHaveAssociated(childType, via)` | A separate child resource must reference this one        |

### Scoping

| Method                  | Effect                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `.resource(...types)`   | Rule applies only to the listed resource types                           |
| `.allResources()`       | Rule applies to every resource                                           |
| `.environment(Env)`     | Rule applies only to resources in that environment (tag or root mapping) |
| `.providerAlias(alias)` | Rule applies only to resources pinned to that provider alias             |

### Cross-resource surfaces (zero-arg, use `.allResources()`)

| Condition                               | What it flags                                                |
| --------------------------------------- | ------------------------------------------------------------ |
| `denyInsensitiveVariable()`             | Secret-looking `variable` without `sensitive = true`         |
| `denyPlaintextLocalSecret()`            | `locals` entry hardcodes a secret (literal, not a ref)       |
| `denyInsensitiveSecretOutput(...attrs)` | `output` references a secret attr without `sensitive = true` |
| `requireExactTerraformVersion()`        | `required_version` not an exact pin (`= X.Y.Z`)              |
| `denyFloatingProviderVersion(...names)` | Provider version constraint floating or absent               |
| `requireEncryptedBackend()`             | State backend not declared or not encrypted                  |
| `denyLocalBackend()`                    | `backend "local"` or no backend (local default)              |
| `denyFloatingModuleVersion()`           | Registry module version floating or absent                   |

## Inline ignore directives

Suppress a known-acceptable finding with a comment on the block:

```hcl
# dotzen:ignore: bastion host — SSH is intentionally public behind a CIDR allowlist
resource "aws_security_group" "bastion" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }
}
```

Both `# dotzen:ignore` and `// dotzen:ignore` work, on their own line or
trailing a block header. The optional `: <reason>` is for auditability.

## CI integration

`dotzen init` prints a pointer to CI templates. The check runs via `npx`
(no local install needed) and exports `DOTZEN_REQUIRES_APPROVAL` for
downstream manual-approval gates:

- **GitHub Actions** — checkout + `npx @dotzen/dotzen@1 check` + approval signal via `$GITHUB_ENV`.
- **GitLab CI** — a `dotzen:check` job with `artifacts:reports:dotenv` + an optional manual-approval gate.

## Engine coverage

**Terraform structures handled:**

- Module nesting (unbounded depth, cycle-guarded) with `count`/`for_each` expansion
- Provider `default_tags`/`default_labels` inheritance (incl. nested modules)
- Resource `count = 0` / `for_each`-empty skip + per-element `for_each` expansion
- `dynamic` blocks (any name, not just ingress/egress) expanded into attributes
- Data sources (`data "aws_ami"`) governed as resources
- Provider alias scoping + module `providers` map remapping
- `lifecycle { prevent_destroy, create_before_destroy, ignore_changes }`
- `connection {}` blocks, `provisioner` blocks, `output` blocks, `variable`/`locals` bindings
- `terraform { required_version, required_providers, backend }` settings
- Conservative ternary evaluation (`${ref == scalar ? scalar : scalar}`)
- Var/local/each scope resolution through chains (depth-bounded)
- `merge()` tag-key extraction (partial when an arg is unresolvable)

**Three clouds, one engine:** AWS (deep), Azure and GCP at CIS Foundations Level 1.

**Performance:** ~195ms for 1200 resources (100 files + 100 module calls).

## Docs

Full documentation, design rationale, and the roadmap live in the [project repository](https://gitlab.com/governance-tools/dotzen). The parser is the official `hashicorp/hcl` compiled to WASM (`@cdktf/hcl2json`) — pure JS, no native binary.

## License

MIT © Eduardo Machado
