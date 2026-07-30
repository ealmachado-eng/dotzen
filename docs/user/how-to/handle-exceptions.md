# How to handle exceptions (suppress findings)

> **Audience:** spec authors, security reviewers. When a rule legitimately shouldn't apply to a specific resource — suppress it **with a reason**, on the block, so the exception is auditable in the diff.

## The principle: auditable, never silent

dotzen never provides a backdoor flag that silently skips the engine. Suppression is a **comment directive placed directly on the Terraform block** that violates, with a mandatory-or-recommended reason. When a reviewer reads the diff, they see _exactly_ what was suppressed and why — the suppression is code-reviewed alongside the change.

```hcl
resource "aws_security_group" "bastion" {
  # dotzen:ignore: bastion host — SSH is intentionally public behind a corp-VPN CIDR
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }
}
```

## Syntax

The directive is a comment starting with `dotzen:ignore`. It suppresses findings **on the block it's placed in** (a `resource`, an `ingress` block, etc.).

| Form                                 | Scope                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `# dotzen:ignore`                    | Suppresses all findings on this block. Reason omitted (allowed but discouraged).     |
| `# dotzen:ignore: <reason>`          | Suppresses all findings on this block; reason recorded in the diff. **Recommended.** |
| `# dotzen:ignore <ruleId>`           | Suppresses findings from a specific rule only, on this block.                        |
| `# dotzen:ignore <ruleId>: <reason>` | Specific rule + reason. Most precise.                                                |

The `reason` is free text after the colon. Use it to record _why_ the exception exists (a ticket ref, a risk-acceptance note) — it shows up in code review.

## Examples

**Suppress all findings on a block, with a reason** — the common case:

```hcl
resource "aws_s3_bucket" "public_cdn" {
  # dotzen:ignore: public CDN bucket — public access is the product, not a misconfig
  bucket = "my-public-cdn"
  acl    = "public-read"
}
```

**Suppress one specific rule only** — let other rules still fire:

```hcl
resource "aws_db_instance" "legacy" {
  # dotzen:ignore require-storage-encryption: legacy DB — encryption migration tracked in INFRA-482
  storage_encrypted = false
}
```

Other rules on `aws_db_instance.legacy` (e.g. tag rules, public-access rules) still evaluate normally.

**Suppress on a nested block** — scope tightens to just that block:

```hcl
resource "aws_security_group" "app" {
  ingress {
    # dotzen:ignore: internal health-check port — only the ALB SG reaches this
    from_port = 8080
    to_port   = 8080
  }
  ingress {
    # other ingress blocks still checked normally
    from_port = 443
  }
}
```

## When to suppress vs. fix vs. narrow scope

- **Fix the Terraform** when the finding is real and the resource should comply. Suppression is not a substitute for correctness.
- **[Narrow the rule's scope](./scope-to-environment.md)** when a rule legitimately applies _only in some contexts_ (e.g. prod-only). Don't pepper ignore directives; fix the rule's environment/region/provider-alias filter.
- **Suppress** when the violation is a genuine, documented exception (bastion host, public CDN, a legacy resource with an open migration ticket). The directive + reason is the audit trail.

## Reviewing suppressions

Because every suppression lives in the `.tf` as a comment, you can audit them with grep:

```bash
rg "dotzen:ignore" terraform/
```

Some teams add a CI check that lists all suppressions, or require a ticket reference in the reason (`# dotzen:ignore: INFRA-482 …`). dotzen itself doesn't enforce a reason format — your team's review process does.

## What you cannot do

- **Suppress globally** (no `.dotzenignore` file, no `--no-check` flag). A governance tool with a silent bypass defeats its own purpose. Every suppression is local, on a block, in the diff.
- **Suppress could-not-evaluate to hide a gap.** You _can_ attach the directive, but the honest path for a genuine could-not-evaluate is usually to [understand it](./understand-could-not-evaluate.md) or supply the missing value — suppression hides the gap rather than acknowledging it.

## See also

- [Understand could-not-evaluate](./understand-could-not-evaluate.md) — when a gap is honest, not an exception.
- [Scope to environment / region](./scope-to-environment.md) — fix the rule's applicability instead of suppressing per-resource.
