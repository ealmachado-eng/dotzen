import { describe, it, expect } from 'vitest'
import { GITHUB_ACTIONS, GITLAB_CI, CI_TEMPLATE_HINT } from './ci-templates'

describe('CI templates (#23)', () => {
  it('GitHub Actions template is valid YAML-ish with the check step', () => {
    expect(GITHUB_ACTIONS).toContain('npx @dotzen/dotzen@1 check')
    expect(GITHUB_ACTIONS).toContain('actions/checkout@v4')
    expect(GITHUB_ACTIONS).toContain('DOTZEN_ENV_FILE')
    expect(GITHUB_ACTIONS).toContain('pull_request')
  })

  it('GitLab CI template is valid YAML-ish with the check job', () => {
    expect(GITLAB_CI).toContain('npx @dotzen/dotzen@1 check')
    expect(GITLAB_CI).toContain('artifacts:')
    expect(GITLAB_CI).toContain('dotenv')
    expect(GITLAB_CI).toContain('merge_request_event')
  })

  it('hint mentions both CI systems + the approval signal', () => {
    expect(CI_TEMPLATE_HINT).toContain('GitHub Actions')
    expect(CI_TEMPLATE_HINT).toContain('GitLab CI')
    expect(CI_TEMPLATE_HINT).toContain('DOTZEN_REQUIRES_APPROVAL')
  })
})
