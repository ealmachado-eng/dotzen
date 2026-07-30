# Self-host a GitHub Actions runner (optional)

> **Audience:** the project maintainer. **On a public repo you do NOT need this** — GitHub grants public repos unlimited hosted-Actions minutes, so the free tier is already uncapped. This guide is only relevant if you (a) take the repo private later (private = 2,000 min/mo), or (b) want to offload CI onto your own hardware for speed/cost. It replaces the earlier GitLab-runner guide after the repo migrated to GitHub.

## When you'd actually self-host on GitHub

| Situation | Self-host? |
|---|---|
| Public repo (current) | **No** — unlimited hosted minutes; provenance works on hosted runners. Skip this doc. |
| Repo goes private | Optional — 2,000 hosted min/mo may still be plenty; self-host if you exceed it. |
| You want faster/heavier CI on your own hardware | Yes — runs on your machine, no queue, no minute counting. |

Unlike GitLab (where npm trusted publishing only worked on shared runners), **GitHub trusted publishing works on self-hosted runners too** — so there's no hybrid split: every job, including `publish`, can run on a self-hosted runner.

## Prerequisites (on the host machine)

- **An always-on machine** — the runner only polls while it's up. A Mac mini, a NUC, or a Linux VPS all work.
- **The machine's OS/arch** must match the jobs you'll route there. `runs-on: self-hosted` accepts any OS; add OS labels (`ubuntu`, `macos`) if jobs assume one.
- **Docker** — if you route container-based jobs to the runner. (dotzen's jobs run Node directly via `actions/setup-node`, so Docker is optional.)

## Register the runner (project-scoped)

GitHub generates the exact commands per OS — these are the shape:

1. **Repo → Settings → Actions → Runners → New self-hosted runner** → pick OS/arch.
2. GitHub prints a download URL, a **registration token** (short-lived), and the config command. Run them on the host:
   ```bash
   # Linux x64 example (GitHub gives you the exact tarball + token):
   mkdir actions-runner && cd actions-runner
   curl -o actions-runner-linux-x64-<ver>.tar.gz -L <github-url>
   tar xzf actions-runner-linux-x64-<ver>.tar.gz
   ./config.sh --url https://github.com/ealmachado-eng/dotzen --token <TOKEN> \
     --name "mac-mini" --labels "self-hosted,linux" --unattended
   ```
   macOS uses `actions-runner-osx-x64-<ver>.tar.gz`; the flow is identical.
3. **Verify** — the runner shows **Idle (green)** under Settings → Actions → Runners.

## Run it as a service (auto-start on boot)

```bash
sudo ./svc.sh install "$USER"   # install as a launchd/systemd service
sudo ./svc.sh start             # start now + on boot
sudo ./svc.sh status            # verify
```

On macOS the runner installs a launchd agent via `svc.sh` ( survives reboot, runs as your user).

## Route jobs to it

In `.github/workflows/ci.yml` (and/or `release.yml`), set `runs-on`:

```yaml
jobs:
  test:
    runs-on: self-hosted          # any self-hosted runner
    # OR pin by label:
    # runs-on: [self-hosted, linux]
    steps: …
```

Leave a job on hosted runners by keeping `runs-on: ubuntu-latest` — GitHub routes hosted `runs-on` values to its cloud, self-hosted labels to your machine. You can mix freely (e.g. test on `self-hosted`, publish on `ubuntu-latest`).

## Verify end-to-end

Push any commit; the routed job's log opens with:

```
Self-hosted runner: mac-mini
…
```

Confirm under Settings → Billing → Actions that hosted-minutes stop climbing for jobs routed to `self-hosted`.

## Ops notes

- **The host must be up** for self-hosted jobs to run; they queue (`queued`) until the runner reconnects. Prevent sleep on a Mac host: `sudo pmset -a sleep 0` (server mode) is cleaner than `caffeinate`.
- **Keep the runner current** — GitHub ships a new runner ~monthly; it auto-updates by default, but restart after major bumps.
- **Security (public repo)** — GitHub does **not** run workflows from forked PRs on self-hosted runners by default (safe). For your own branches, only run trusted workflows (you control `.github/workflows/`).
- **If the host is offline** the job stays queued; hosted-runner jobs are unaffected. Keep the host reachable around releases if `release.yml` routes there.

## Why this is optional now (vs the old GitLab constraint)

On GitLab, npm trusted publishing worked **only** on shared runners — so the original guide split gate jobs to a self-hosted runner and kept `publish` on shared (the "hybrid" dance). **GitHub has no such constraint**: trusted publishing (OIDC) works on hosted *and* self-hosted runners. With a public repo you get unlimited hosted minutes anyway, so self-hosting is a pure opt-in for cost/speed — not an escape hatch.

## See also

- `.github/workflows/ci.yml`, `.github/workflows/release.yml` — the workflow definitions (`runs-on` lives here).
- `.claude/skills/dotzen-release/SKILL.md` — the trusted-publishing flow on GitHub.
- GitHub docs: [self-hosted runners](https://docs.github.com/actions/hosting-your-own-runners).
