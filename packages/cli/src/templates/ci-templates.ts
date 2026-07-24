/**
 * CI integration templates (#23). Reference YAML for GitHub Actions and GitLab
 * CI, and the scaffold drops a pointer to them on `dotzen init`. The templates
 * run `dotzen check` via npx (no local install needed) and export the approval
 * signal (`DOTZEN_REQUIRES_APPROVAL`) for downstream manual-approval gates.
 */

/** GitHub Actions workflow — `.github/workflows/dotzen.yml` */
export const GITHUB_ACTIONS = `# dotzen governance check — runs on every PR / push to main.
# No local install needed: npx pulls the pinned version. The approval signal
# (DOTZEN_REQUIRES_APPROVAL) is exposed as an env var for downstream gates.
name: dotzen check

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
      - name: dotzen check
        run: npx @dotzen/dotzen@1 check
        env:
          DOTZEN_ENV_FILE: dotzen.env
      - name: expose approval signal
        if: always()
        run: |
          if [ -f dotzen.env ]; then
            cat dotzen.env >> "$GITHUB_ENV"
          fi
`

/** GitLab CI job — paste into `.gitlab-ci.yml` */
export const GITLAB_CI = `# dotzen governance check — runs on every MR / push to the default branch.
# The approval signal (DOTZEN_REQUIRES_APPROVAL) is exposed via a dotenv
# artifact so a downstream manual-approval job can gate on it.
dotzen:check:
  stage: test
  image: node:20
  script:
    - npx @dotzen/dotzen@1 check
  artifacts:
    reports:
      dotenv: dotzen.env
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

# Optional: a manual-approval gate that only runs when dotzen flagged a
# require-approval violation. Uncomment to enable.
# dotzen:approve:
#   stage: deploy
#   needs: [dotzen:check]
#   when: manual
#   rules:
#     - if: $DOTZEN_REQUIRES_APPROVAL == "true"
#   script:
#     - echo "Manual approval granted for dotzen-flagged changes."
`

/** The scaffold prints this pointer so users know where to find the templates. */
export const CI_TEMPLATE_HINT = `
CI integration templates are available in the dotzen package:
  • GitHub Actions:  src/templates/ci-templates.ts → GITHUB_ACTIONS
  • GitLab CI:       src/templates/ci-templates.ts → GITLAB_CI
Copy the relevant YAML into your repo's .github/workflows/ or .gitlab-ci.yml.
The check runs via npx (no local install needed); the approval signal
(DOTZEN_REQUIRES_APPROVAL) is exported for downstream manual-approval gates.
`
