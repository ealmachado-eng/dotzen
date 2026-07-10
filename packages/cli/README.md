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

**Org-specific tags:** tag taxonomies vary by org, so `mustHaveTags` accepts your own keys — declare them in your own `enum` (keeps typos as compile errors) and mix with the built-in `Tag`:

```ts
enum OrgTag {
  ApmId = 'apm_id',
  CmdbAppId = 'cmdb_app_id',
}
rule()
  .resource(AwsResource.S3Bucket)
  .mustHaveTags(OrgTag.ApmId, OrgTag.CmdbAppId, Tag.Environment)
  .message('...')
```

dotzen resolves tags through `var`/`local` refs and `merge(<literal>, var.tags)` — so a required key hardcoded in the module passes, while one that might come from a caller's `var.tags` reports "could not evaluate" (never a false violation).

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

- `--format json` for machine-readable output.
- Pin the version in `dotzen.json` (never `@latest` in CI).

## Coverage

Three clouds, one engine: **AWS** (deep), **Azure** and **GCP** at ~CIS Foundations Level 1 — network exposure, encryption at rest/in transit, public access, IAM/RBAC over-permission, audit logging, and hardcoded secrets.

## Docs

Full documentation, design rationale, and the roadmap live in the [project repository](https://gitlab.com/governance-tools/dotzen). The parser is the official `hashicorp/hcl` compiled to WASM (`@cdktf/hcl2json`) — pure JS, no native binary.

## License

MIT © Eduardo Machado
