import { describe, it, expect } from 'vitest'
import { scanIgnores } from './parse'

describe('scanIgnores — #20 inline directives', () => {
  it('targets the next block-start line after the comment', () => {
    const text = `# dotzen:ignore
resource "aws_s3_bucket" "x" {
  bucket = "x"
}`
    expect(scanIgnores(text, 'main.tf')).toEqual([
      { file: 'main.tf', line: 2, reason: undefined },
    ])
  })

  it('targets a same-line trailing comment (block-start == comment line)', () => {
    const text = `resource "aws_s3_bucket" "x" { # dotzen:ignore
  bucket = "x"
}`
    expect(scanIgnores(text, 'main.tf')).toEqual([
      { file: 'main.tf', line: 1, reason: undefined },
    ])
  })

  it('captures the optional reason text', () => {
    const text = `# dotzen:ignore: intentionally public for a static site
resource "aws_s3_bucket" "pub" {}`
    expect(scanIgnores(text, 'main.tf')).toEqual([
      {
        file: 'main.tf',
        line: 2,
        reason: 'intentionally public for a static site',
      },
    ])
  })

  it('supports // line comments', () => {
    const text = `// dotzen:ignore
output "pw" { value = "x" }`
    expect(scanIgnores(text, 'main.tf')).toEqual([
      { file: 'main.tf', line: 2, reason: undefined },
    ])
  })

  it('handles multiple directives in one file', () => {
    const text = `# dotzen:ignore
resource "aws_s3_bucket" "a" {}

# dotzen:ignore: known gap
module "b" { source = "./m" }`
    const dirs = scanIgnores(text, 'main.tf')
    expect(dirs).toHaveLength(2)
    expect(dirs[0]?.line).toBe(2)
    expect(dirs[1]?.line).toBe(5)
    expect(dirs[1]?.reason).toBe('known gap')
  })

  it('skips a directive with no following block (no target)', () => {
    const text = `# dotzen:ignore
# just a comment, no block`
    expect(scanIgnores(text, 'main.tf')).toEqual([])
  })

  it('targets any top-level block type (data/output/variable/locals/terraform/provider)', () => {
    const text = `# dotzen:ignore
variable "pw" { default = "x" }

# dotzen:ignore
locals { x = 1 }

# dotzen:ignore
terraform { required_version = "1.0" }`
    const dirs = scanIgnores(text, 'main.tf')
    expect(dirs.map((d) => d.line)).toEqual([2, 5, 8])
  })

  it('does not match non-dotzen comments', () => {
    const text = `# todo: fix later
resource "aws_s3_bucket" "x" {}`
    expect(scanIgnores(text, 'main.tf')).toEqual([])
  })

  it('does NOT match the token inside a string value (false-positive guard)', () => {
    // `description = "# dotzen:ignore"` is a string value, NOT a directive.
    // Without the ^\s* anchor, the unanchored regex would match this and
    // suppress the NEXT resource — a dangerous false suppression.
    const text = `resource "aws_s3_bucket" "a" {
  description = "# dotzen:ignore"
}

resource "aws_s3_bucket" "b" {
  bucket = "b"
}`
    expect(scanIgnores(text, 'main.tf')).toEqual([])
  })

  it('does NOT match the token inside a quoted value with a reason', () => {
    const text = `resource "aws_s3_bucket" "a" {
  value = "# dotzen:ignore: fake reason"
}`
    expect(scanIgnores(text, 'main.tf')).toEqual([])
  })

  it('captures a per-rule ID (stable author-chosen: no-public-ssh)', () => {
    const text = `# dotzen:ignore no-public-ssh: bastion host — SSH is intentional
resource "aws_security_group" "bastion" {}`
    const dirs = scanIgnores(text, 'main.tf')
    expect(dirs).toHaveLength(1)
    expect(dirs[0]?.ruleId).toBe('no-public-ssh')
    expect(dirs[0]?.reason).toBe('bastion host — SSH is intentional')
  })

  it('captures a per-rule ID (positional: rule-5)', () => {
    const text = `# dotzen:ignore rule-5: known exception
resource "aws_s3_bucket" "cdn" {}`
    const dirs = scanIgnores(text, 'main.tf')
    expect(dirs[0]?.ruleId).toBe('rule-5')
    expect(dirs[0]?.reason).toBe('known exception')
  })

  it('without a ruleId, ruleId is undefined (suppress all)', () => {
    const text = `# dotzen:ignore: suppress everything on this block
resource "aws_s3_bucket" "x" {}`
    const dirs = scanIgnores(text, 'main.tf')
    expect(dirs[0]?.ruleId).toBeUndefined()
    expect(dirs[0]?.reason).toBe('suppress everything on this block')
  })

  it('trailing comment with a per-rule ID', () => {
    const text = `resource "aws_s3_bucket" "x" { # dotzen:ignore no-public-ssh
  bucket = "x"
}`
    const dirs = scanIgnores(text, 'main.tf')
    expect(dirs[0]?.ruleId).toBe('no-public-ssh')
  })
})
