# pluvian example specs

Copy-paste starting points for `.pluvian/spec.ts`, sized to an org's maturity. Each
is a **standalone spec** — copy the one that fits, drop a `pluvian.json` next to
it (`pluvian init`), edit the org-specific bits (tag keys, approved regions,
approvers), and run:

```bash
npx @erkos/pluvian@2.0.0 check
```

> These are **templates**, not a registry. A spec is a flat array of rules, so
> you compose by spreading the shipped packs (`coreSecurity`, `cisAws`,
> `cisAzure`, `cisGcp`, `pciDss`, `soc2`, `nist80053`, `dataProtection`) and
> adding your own. Pick the profile closest to your needs and trim/extend it.

## Profiles

| Profile | Use when | What's in it |
| --- | --- | --- |
| [`startup/`](./startup/.pluvian/spec.ts) | Lean team, ship fast, secure-by-default | `coreSecurity` + one ownership tag (warn) |
| [`enterprise/`](./enterprise/.pluvian/spec.ts) | Poly-cloud estate, change governance | Startup baseline + 3 CIS packs + ownership tags (block) + prod `prevent_destroy` approval gate |
| [`regulated/`](./regulated/.pluvian/spec.ts) | Compliance regime (PCI / SOC 2 / NIST / GDPR / LGPD) | Enterprise baseline + framework packs + data-residency (region sovereignty) |

## Customization points

- **Tag keys** — the `startup` profile uses the built-in `Tag` enum; the
  `enterprise` profile declares an `OrgTag` enum. Tag *keys* are org-defined, so
  declare yours as an enum (never bare strings — a typo'd tag key is a silently
  never-fires rule). See the pluvian-spec-authoring skill.
- **Approved regions** (`regulated`) — edit the `ApprovedRegion` enum to your
  jurisdiction (GDPR → EU; LGPD → `sa-east-1` / `southamerica-east1`).
- **Approvers / stateful types** (`enterprise`) — the `prevent_destroy` gate's
  approver set and targeted resource types are illustrative; match them to your
  change-advisory process.

## Composing presets (the general pattern)

```ts
import { coreSecurity, cisAws, pciDss, rule, AwsResource, Effect } from '@erkos/pluvian'

export const spec = [
  ...coreSecurity,   // secure-by-default baseline (secrets, encryption, public access)
  ...cisAws,         // CIS AWS Foundations additions
  ...pciDss,         // PCI-DSS additions (on top of coreSecurity)

  // ...your org-specific rules here
  rule()
    .resource(AwsResource.S3Bucket)
    .mustHaveTags('Application') // (use an OrgTag enum in real specs)
    .message('Buckets must carry an Application tag'),
]
```

> **Don't double-spread.** Each pack is a distinct set of rules with stable IDs.
> Spreading the same pack twice is a load error (`duplicate rule ID`). A profile
> here is a complete standalone spec — copy one, don't stack two profiles.

## Verifying the examples

The examples are covered by a loader test (`packages/cli/src/spec/examples.test.ts`)
that loads each via the real jiti spec loader and validates every rule — so they
stay correct as the DSL evolves.
