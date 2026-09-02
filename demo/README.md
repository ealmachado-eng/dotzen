# pluvian demo — a topology rule in action

A minimal project showing pluvian's **graph layer** at work: a rule no static
per-resource tool can express — "no filesystem mount target reachable from the
public internet."

## The rule

[`.pluvian/spec.ts`](.pluvian/spec.ts) contains a single rule:

```ts
rule()
  .resource(AwsResource.EfsMountTarget)
  .denyIfReachable(AwsResource.InternetGateway)
  .message('EFS mount targets must not be in a public subnet')
```

## The infrastructure

[`terraform/main.tf`](terraform/main.tf) declares a VPC with a public and a
private subnet, and **two** EFS mount targets:

- **`public_mt`** — in the **public** subnet, whose route table has a default
  route (`0.0.0.0/0`) to an Internet Gateway.
- **`private_mt`** — in a **private** subnet, with no route to an Internet Gateway.

## One rule, two verdicts

A rule targets a **resource type**, and pluvian evaluates it against **each
matching resource** independently. So this single rule produces two verdicts:

| resource     | reaches an Internet Gateway?                  | verdict      |
| ------------ | --------------------------------------------- | ------------ |
| `public_mt`  | yes (public subnet → route table → IGW)       | **violation** |
| `private_mt` | no (private subnet, no IGW route)             | pass          |

That's why the output reads `1 violation(s), 1 passed, 0 could not be evaluated`
from one rule — one rule, two resources, two independent results. The graph
walks the reference chain
(`mount target → subnet → route_table_association → route_table → internet_gateway`)
to decide reachability; both chains resolve fully (the `subnet_id` values are
literals), so neither degrades to `could not evaluate`.

It's also the no-false-positive proof: the rule flags the mount target that
actually reaches the internet and clears the one that doesn't, rather than
blanket-flagging every mount target.

## Run it

```bash
cd demo
pluvian check
```

Expected output:

```
── BLOCKING ──
✗ aws_efs_mount_target.public_mt  (terraform/main.tf:56)
    EFS mount targets must not be in a public subnet

✗ 1 violation(s), 1 passed, 0 could not be evaluated
```
