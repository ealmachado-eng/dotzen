# Self-host a GitLab runner (unlimited CI minutes)

> **Audience:** the project maintainer. The `governance-tools` namespace shares a finite pool of free GitLab.com runner minutes (400/qtr). When it runs out, **no pipelines run** — including the `publish` job on a release tag. Self-hosting a runner gives the test/security gate **unlimited minutes**, for free, on any always-on machine (your Mac mini, a VPS, a home server).

## The one critical constraint — `publish` must stay on shared

npm **trusted publishing (OIDC)** — which dotzen uses to publish *without* a stored `NPM_TOKEN` — works **only on GitLab.com shared runners**. npm rejects the OIDC token from a self-hosted runner. (Confirmed in `.claude/skills/dotzen-release/SKILL.md`.) So:

| Job | Runs on | Why |
|---|---|---|
| `test:linux`, `audit`, `semgrep`, `gitleaks` | **self-hosted runner** (tagged `local`) | The bulk of compute — runs on every push/MR/tag. Unlimited minutes here is the whole win. |
| `publish` | **shared runner** (untagged) | Trusted-publishing OIDC needs a GitLab.com runner. Only runs on `v*` tags → costs ~1–2 min/release. Sustainable on the free quota. |

So you get unlimited gate runs (the 99% of compute) and spend shared minutes only on releases (a few/year). 400/qtr is plenty for the publish job alone.

## Prerequisites (on the host machine)

- **An always-on machine** — the runner only works while the machine is up. A Mac mini / NUC / $5 VPS all work. (If it's your dev Mac mini, that's ideal.)
- **Docker** — the gate jobs declare `image:` (`node:20-bookworm`, `semgrep/semgrep`, `zricethezav/gitleaks`), so the runner uses the **docker executor**. Install Docker Desktop or [colima](https://github.com/abiosoft/colima):
  ```bash
  brew install --cask docker          # Docker Desktop
  # OR, lighter:
  brew install colima && colima start
  docker run --rm hello-world         # verify
  ```
- **gitlab-runner** — the agent:
  ```bash
  brew install gitlab-runner
  ```

## Register the runner (project-scoped, docker executor)

1. **Create the runner token in GitLab** (the UI is the source of truth — the path moves):
   - Project → **Settings → CI/CD → Runners**, click **New project runner**.
   - Tags: **`local`** (required — the gate jobs will select this runner by tag).
   - Tick **Run untagged jobs? = No** (the runner only takes jobs asking for `local`; `publish` stays untagged → stays on shared).
   - Untick **Locked to current project** only if you'll reuse it across the namespace.
   - Submit, copy the **authentication token** GitLab prints (starts with `glrt-`).

2. **Register it on the host:**
   ```bash
   gitlab-runner register \
     --url https://gitlab.com \
     --token glrt-XXXXXXXXXXXXXXXX \
     --name "mac-mini-local" \
     --executor docker \
     --docker-image "node:20-bookworm" \
     --tag-list local
   ```
   The `--docker-image` is the default; each job's own `image:` overrides it. `--tag-list local` is the tag the gate jobs will request.

3. **Verify registration** — the runner shows **online (green)** in Project → Settings → CI/CD → Runners ("Assign project runners").

## Run it as a service (auto-start on boot)

```bash
brew services start gitlab-runner
```

`brew services` launches it now and on every login. Verify:
```bash
gitlab-runner status        # => service is running
gitlab-runner verify        # => is alive
```

On Linux hosts (VPS), the equivalent is `systemctl enable --now gitlab-runner` (install via the [official repo](https://docs.gitlab.com/runner/install/linux-repository/)).

## Point the gate jobs at the self-hosted runner

Edit `.gitlab-ci.yml` — tag the four gate jobs `local`. **`publish` stays untagged.** The minimal change is a `tags: [local]` line on each:

```yaml
# Gate jobs → self-hosted (unlimited minutes)
test:linux:
  extends: .test
  tags: [local]                              # ← add
  rules: !reference [.default_rules, rules]

audit:
  extends: .node
  stage: security
  tags: [local]                              # ← add
  rules: !reference [.default_rules, rules]
  script:
    - npm audit --audit-level=high

semgrep:
  stage: security
  image: semgrep/semgrep:latest
  tags: [local]                              # ← add
  # …rest unchanged

gitleaks:
  stage: security
  image: { name: zricethezav/gitleaks:latest, entrypoint: [''] }
  tags: [local]                              # ← add
  # …rest unchanged

# publish stays UNTAGGED → runs on a GitLab.com shared runner (trusted-publishing OIDC).
publish:
  stage: release
  extends: .node
  image: node:24-bookworm
  rules: [ { if: '$CI_COMMIT_TAG =~ /^v/' } ]
  # …rest unchanged — NO tags: line
```

> **Ordering matters (chicken-and-egg):** register the runner and confirm it's **online** *before* pushing this `.gitlab-ci.yml` change. Otherwise the gate jobs have nowhere to run and CI goes red until the runner appears. (Shared `publish` is unaffected — it has no tag.)

> **Don't tag the `.test` template itself** — that template is also `extends`-ed by `test:windows`/`test:macos` (the cross-OS jobs gated behind `ENABLE_CROSS_OS`), which must stay on GitLab SaaS runners. Put the `tags: [local]` on the concrete `test:linux` job, not the template.

## Verify end-to-end

Push any commit and watch the pipeline:

```bash
git commit --allow-empty -m "ci: verify self-hosted runner" && git push
glab ci list
```

In the pipeline view, each gate job's log should open with:
```
Running on runner-… (mac-mini-local) via mac-mini…
```
— the `via mac-mini…` (your host name) confirms it's on your self-hosted runner, **not** a `green-*` shared runner. The `publish` job (if you pushed a tag) still lands on a shared runner.

You can confirm minutes are no longer being spent: Project → **Settings → Usage Quotas → CI/CD** — the "shared runner compute minutes" line should stop climbing for push/MR pipelines.

## Ops notes

- **The host must be up** for CI to run. If your Mac mini sleeps, either prevent sleep during CI (`caffeinate`) or accept that pipelines queue until wake. (A VPS avoids this entirely.)
- **Keep Docker running** — the docker executor pulls images on demand; if Docker isn't up, jobs fail with a docker-daemon error.
- **Update the runner periodically** — `brew upgrade gitlab-runner && brew services restart gitlab-runner`. GitLab ships a new runner ~monthly; staying within one major avoids compatibility surprises.
- **Image cache** — the first run pulls `node:20-bookworm` / `semgrep` / `gitleaks` (a few hundred MB each). Subsequent runs reuse them; only `npm install` per job. Cache is already configured for `node_modules/` (`.node.cache` in `.gitlab-ci.yml`).
- **What if the host is offline when you push a tag?** The gate jobs stay `pending` until the runner reconnects. `publish` (on shared) runs independently once its gate siblings complete — so if the host is down, the whole pipeline stalls, including publish. Keep the host reachable around releases.
- **Don't run untrusted pipelines on a self-hosted runner without isolation.** This is fine for a solo/private repo (you control the `.gitlab-ci.yml`). For a public project, lock the runner to protected branches/tags only (Settings → CI/CD → Runners → "Protected" toggle) and keep `npm install`-from-lock discipline.

## Why not just self-host everything (including publish)?

You could — but it means **abandoning trusted publishing** for a stored `NPM_TOKEN` CI variable, re-introducing the secret-rotation/leak surface the project deliberately removed. The hybrid (self-hosted gate + shared publish) keeps zero-stored-secrets publishing *and* unlimited gate minutes. It's strictly better until/unless npm extends trusted publishing to self-hosted runners.

## See also

- `.gitlab-ci.yml` — the pipeline definition (the `tags` edits live here).
- `.claude/skills/dotzen-release/SKILL.md` — the trusted-publishing constraint (why `publish` stays shared).
- GitLab docs: [register a runner](https://docs.gitlab.com/runner/register/), [docker executor](https://docs.gitlab.com/runner/executors/docker.html).
