/**
 * CI integration templates (#23). Reference YAML for GitHub Actions and GitLab
 * CI, and the scaffold drops a pointer to them on `pluvian init`. The templates
 * run `pluvian check` via npx (no local install needed) and export the approval
 * signal (`PLUVIAN_REQUIRES_APPROVAL`) for downstream manual-approval gates.
 */

/** GitHub Actions workflow — `.github/workflows/pluvian.yml` */
export const GITHUB_ACTIONS = `# pluvian governance check — runs on every PR / push to main.
# No local install needed: npx pulls the pinned version. The approval signal
# (PLUVIAN_REQUIRES_APPROVAL) is exposed as an env var for downstream gates.
name: pluvian check

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: pluvian check
        run: npx @erkos/pluvian@1 check
        env:
          PLUVIAN_ENV_FILE: pluvian.env
      - name: expose approval signal
        if: always()
        run: |
          if [ -f pluvian.env ]; then
            cat pluvian.env >> "$GITHUB_ENV"
          fi

      # Optional: surface findings in the GitHub Security tab (Code Scanning)
      # with file:line PR annotations. Emits SARIF 2.1.0 and uploads it.
      # - name: pluvian check (sarif for Security tab)
      #   run: npx @erkos/pluvian@1 check --format sarif > pluvian.sarif
      # - uses: github/codeql-action/upload-sarif@v3
      #   if: always()
      #   with:
      #     sarif_file: pluvian.sarif
      #     category: pluvian
`

/** GitLab CI job — paste into `.gitlab-ci.yml` */
export const GITLAB_CI = `# pluvian governance check — runs on every MR / push to the default branch.
# The approval signal (PLUVIAN_REQUIRES_APPROVAL) is exposed via a dotenv
# artifact so a downstream manual-approval job can gate on it.
pluvian:check:
  stage: test
  image: node:20
  script:
    - npx @erkos/pluvian@1 check
  artifacts:
    reports:
      dotenv: pluvian.env
  # Optional SARIF: add \`npx @erkos/pluvian@1 check --format sarif > pluvian.sarif\`
  # to script and list \`pluvian.sarif\` under artifacts.paths for cross-tool
  # security interchange. (GitLab's native security dashboard uses a different
  # JSON shape — use a sarif->gitlab converter for dashboard ingestion.)
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

# Optional: a manual-approval gate that only runs when pluvian flagged a
# require-approval violation. Uncomment to enable.
# pluvian:approve:
#   stage: deploy
#   needs: [pluvian:check]
#   when: manual
#   rules:
#     - if: $PLUVIAN_REQUIRES_APPROVAL == "true"
#   script:
#     - echo "Manual approval granted for pluvian-flagged changes."
`

/** The scaffold prints this pointer so users know where to find the templates. */
export const CI_TEMPLATE_HINT = `
CI integration templates are available in the pluvian package:
  • GitHub Actions:  src/templates/ci-templates.ts → GITHUB_ACTIONS
  • GitLab CI:       src/templates/ci-templates.ts → GITLAB_CI
Copy the relevant YAML into your repo's .github/workflows/ or .gitlab-ci.yml.
The check runs via npx (no local install needed); the approval signal
(PLUVIAN_REQUIRES_APPROVAL) is exported for downstream manual-approval gates.
`
