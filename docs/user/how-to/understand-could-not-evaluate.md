# How to understand "could not evaluate"

> **Audience:** security reviewers triaging findings; spec authors. This is pluvian's most-misunderstood output — read this once and the tool makes sense.

## The principle: a false positive is worse than an honest gap

When pluvian cannot _statically_ prove a rule passes or fails, it reports **could-not-evaluate** — not a guess. A tool that silently passes a check it can't actually run is worse than no tool: it gives false confidence. pluvian refuses to guess.

```
✗ 1 violation(s), 3 passed, 2 could not be evaluated
```

The `could not be evaluated` count is **informational, not a failure** — the exit code is driven by violations only (`block` → exit 1). But it's surfaced prominently so gaps are visible, never silent.

## Why it fires

pluvian reads HCL statically — no `terraform plan`, no cloud, no state. A rule becomes could-not-evaluate when the value it needs can't be resolved from HCL alone:

- **A `var` with no default and no module-caller input.**
  ```hcl
  cidr_blocks = var.allowed_cidrs   # var.allowed_cidrs has no default → unknown
  ```
- **A compound expression pluvian doesn't model.** pluvian evaluates common Terraform built-ins (`toset`, `concat`, `flatten`, `merge`, conservative ternaries, single-interpolation string concat) — but not everything. `length(var.x)`, a function call pluvian doesn't recognize, or arithmetic stays unresolved.
- **A resource-attribute reference.** `member = google_service_account.x.email` — pluvian can't see the apply-time email address.
- **A registry/remote module.** A `module {}` whose source pluvian can't read locally (`terraform-aws-modules/...`) surfaces its internals as could-not-evaluate under the stable rule id `pluvian.module-following` — never a silent `0 checks`.

## How to read a could-not-evaluate finding

Each entry names the rule, the resource, and the _reason_:

```
── COULD NOT EVALUATE ──
? aws_s3_bucket.data  (terraform/main.tf:2): tags is an unresolved reference (require-org-tags)
```

That tells you: _the `require-org-tags` rule couldn't decide on `aws_s3_bucket.data` because its `tags` value is an unresolved reference._ Now you know exactly what to look at.

## What to do about it

Decide which of these you're in:

1. **The value is genuinely unknown until apply** (a data-source lookup, a computed value). → **Accept it.** This is the honest outcome. Could-not-evaluate is not a finding to fix; it's a gap to acknowledge. If you need a definite verdict on a runtime value, that's the job of plan-time policy (OPA / Sentinel), not static HCL analysis.

2. **The value _could_ be known but the HCL doesn't expose it.** Give the variable a default, or thread a concrete value from the module caller:

   ```hcl
   # Before: var.allowed_cidrs has no default → unknown.
   # After: give it a default, or pass one from the caller.
   variable "allowed_cidrs" { default = ["10.0.0.0/8"] }
   ```

   pluvian now resolves it to a definite verdict (pass or violation).

3. **You don't actually need the rule on this resource.** Narrow the rule's [scope](./scope-to-environment.md) (e.g. environment- or provider-alias-scoped), or [suppress it with an ignore directive](./handle-exceptions.md) + a reason.

4. **pluvian doesn't model an expression you rely on heavily** (e.g. a Terraform built-in not yet supported). Check `docs/ROADMAP.md` for the compound-input coverage list, and consider filing an issue — the supported set grows release over release.

## Could-not-evaluate vs. ungoverned — don't confuse them

Two distinct "gap" categories, both surfaced but for different reasons:

| Output category        | Meaning                                                                            | Action                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **could not evaluate** | pluvian has a rule for this resource, but can't statically resolve a value it needs | Review the reason; accept, supply a default, narrow scope, or suppress |
| **ungoverned**         | pluvian _recognizes_ the resource type but has no rule for it                       | Add a custom rule, or accept the coverage gap                          |

Both are visible so coverage is honest. A clean run is `0 violations, 0 could not evaluate, 0 ungoverned` — that's a fully-governed, fully-resolved project.

## In SARIF / JSON output

Could-not-evaluate entries appear as `note`-level results in SARIF (visible in the security dashboard, but they do not gate) and in the `couldNotEvaluate` array in JSON. Use the level/array to filter them in your own dashboards.

## See also

- [What pluvian does / doesn't](../what-it-does.md) — the static-only boundary.
- [Read the output](./read-the-output.md) — exit codes, JSON, SARIF.
- [Handle exceptions](./handle-exceptions.md) — when could-not-evaluate is a legit gap you want to suppress.
