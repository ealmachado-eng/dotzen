# How to use the CIS / framework presets

> **Audience:** spec authors. The curated rule packs are a starting point you compose and extend — not a black box. Pick the ones that match your compliance scope.

## The composable model

Every preset is a plain `Rule[]`. You **spread** the ones you want into your `spec` and add your own rules on top. Nothing is forced on you; nothing is hidden.

```ts
import { coreSecurity, cisAws, pciDss } from '@dotzen/dotzen'

export const spec = [
  ...coreSecurity,   // the shared 80% baseline (always start here)
  ...cisAws,         // AWS CIS additions
  ...pciDss,         // PCI DSS additions (because you handle cardholder data)
  // your org's own rules:
  rule().resource(...)...,
]
```

## What each preset covers

Full rule detail in the [reference catalog](../reference/rules/); the shape of the lineup:

- **`coreSecurity`** — the 80% baseline shared across CIS, PCI DSS, SOC 2, NIST 800-53, GDPR/LGPD. Network exposure, encryption at rest, IAM least-privilege, audit logging, no hardcoded secrets, required tags, provisioner denial. **Always start here.** Cloud-neutral where possible (AWS-primary).
- **`cisAws`** — AWS-specific additions aligned to the CIS Amazon Web Services Foundations Benchmark (CloudTrail hardening, IAM password policy, Config recorder, Access Analyzer presence, NACL governance, …).
- **`cisAzure`** — Azure additions aligned to the CIS Microsoft Azure Foundations (NSG, storage TLS/public access, Key Vault, AKS, App Service, …).
- **`cisGcp`** — GCP additions aligned to the CIS Google Cloud Platform Foundation Benchmark (firewall, storage, public IAM, GKE, Cloud SQL, BigQuery, …).
- **`pciDss`** — PCI DSS v4.0 additions on top of coreSecurity: encrypt ALL resources at rest, all four S3 public-access-block flags, ≥30-day backup retention, encrypted + non-local state, DynamoDB PITR, no public DB endpoints.
- **`soc2`** — SOC 2 Trust Services additions on top of coreSecurity.
- **`nist80053`** — NIST SP 800-53 additions on top of coreSecurity.
- **`dataProtection`** — data-protection additions (encryption + retention breadth beyond the core baseline).

The framework packs (`pciDss`, `soc2`, `nist80053`, `dataProtection`) **compose on top of `coreSecurity`** — they add stricter/broader controls, they don't duplicate the baseline. Always spread `coreSecurity` first, then the framework pack, then the per-cloud CIS pack, then your rules.

## A realistic spec

A team on AWS handling cardholder data, with EU residency obligations:

```ts
import { coreSecurity, cisAws, pciDss } from "@dotzen/dotzen";

enum OrgTag {
  Owner = "owner",
  CostCenter = "cost_center",
  DataClassification = "data_classification",
}

export const spec = [
  ...coreSecurity, // baseline (encryption, no public SSH, etc.)
  ...cisAws, // AWS CIS (CloudTrail, IAM password policy, Access Analyzer, …)
  ...pciDss, // PCI breadth (encrypt everything, ≥30d backups, encrypted state, …)

  // org-specific, on top:
  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveTags(OrgTag.Owner, OrgTag.CostCenter, DataClassification)
    .message("Buckets must carry org + data-classification tags"),
  // …your other rules
];
```

## Picking what to spread

| Your scope                 | Spread                                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS, general security      | `coreSecurity` + `cisAws`                                                                                                                                                        |
| Azure, general security    | `coreSecurity` + `cisAzure`                                                                                                                                                      |
| GCP, general security      | `coreSecurity` + `cisGcp`                                                                                                                                                        |
| Multi-cloud                | `coreSecurity` + each per-cloud CIS pack you use (the packs are cloud-targeted; spreading the wrong cloud's pack is harmless — its rules don't match resources of another cloud) |
| Cardholder data (PCI)      | `+ pciDss`                                                                                                                                                                       |
| SOC 2 audit                | `+ soc2`                                                                                                                                                                         |
| US-gov / NIST              | `+ nist80053`                                                                                                                                                                    |
| Extra encryption/retention | `+ dataProtection`                                                                                                                                                               |

## Don't agree with a preset rule?

Two options:

1. **Override the effect** in your own spec by adding a rule with the same target + a different `.onViolation(Effect.Warn)` — but preset rules don't auto-dedupe, so this is clumsy.
2. **Don't spread that preset.** Fork the relevant lines into your own spec and edit. The presets are plain TS — copy what you want, drop what you don't, and you own the policy.

dotzen deliberately does not provide a "disable rule X from preset Y" knob — the clean, reviewable path is to compose explicitly from the source.

## See also

- [Rule catalog](../reference/rules/all-rules.md) — every shipped rule, what it checks.
- [Add a custom rule](./add-a-custom-rule.md) — your rules on top of the presets.
- `packages/cli/examples/ai-generated/.zen/spec.ts` — the canonical comprehensive spec reference (~100+ rules composed).
