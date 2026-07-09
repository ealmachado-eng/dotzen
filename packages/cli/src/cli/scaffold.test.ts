import { describe, it, expect, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { scaffoldFiles, initProject } from './scaffold'

describe('scaffoldFiles', () => {
  const files = scaffoldFiles('1.2.3')
  const byPath = (p: string) => files.find((f) => f.path === p)

  it('writes dotzen.json pinned to the engine version', () => {
    const cfg = JSON.parse(byPath('dotzen.json')!.content)
    expect(cfg).toEqual({
      version: '1.2.3',
      spec: '.zen/spec.ts',
      terraform: './terraform',
    })
  })

  it('scaffolds a spec.ts that imports from the published package', () => {
    const spec = files.find((f) => f.path.endsWith('spec.ts'))!.content
    expect(spec).toContain("from '@dotzen/dotzen'")
    expect(spec).toContain('export const spec')
    expect(spec).toContain('rule()')
    // no relative import path in the generated file
    expect(spec).not.toContain('../')
  })
})

describe('initProject', () => {
  const tmp: string[] = []
  const mk = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dotzen-init-'))
    tmp.push(d)
    return d
  }
  afterAll(() =>
    tmp.forEach((d) => fs.rmSync(d, { recursive: true, force: true })),
  )
  const terraformOf = (dir: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, 'dotzen.json'), 'utf8')).terraform

  it('greenfield: creates config, spec, and a ./terraform dir', () => {
    const dir = mk()
    const res = initProject(dir, '0.0.1')
    expect(res.detected).toBe(false)
    expect(res.terraform).toBe('./terraform')
    expect(fs.existsSync(path.join(dir, '.zen', 'spec.ts'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'terraform'))).toBe(true)
  })

  it('is fail-safe: a second run overwrites nothing', () => {
    const dir = mk()
    initProject(dir, '0.0.1')
    const { created, skipped } = initProject(dir, '0.0.1')
    expect(created).toHaveLength(0)
    expect(skipped).toContain('dotzen.json')
  })

  it('detects .tf at the project root -> terraform "."', () => {
    const dir = mk()
    fs.writeFileSync(path.join(dir, 'main.tf'), 'resource "x" "y" {}')
    const res = initProject(dir, '0.0.1')
    expect(res.detected).toBe(true)
    expect(res.terraform).toBe('.')
    expect(terraformOf(dir)).toBe('.')
    // does NOT create a spurious terraform/ dir
    expect(fs.existsSync(path.join(dir, 'terraform'))).toBe(false)
  })

  it('detects .tf in a single subdir -> points there', () => {
    const dir = mk()
    fs.mkdirSync(path.join(dir, 'infra'))
    fs.writeFileSync(path.join(dir, 'infra', 'main.tf'), 'resource "x" "y" {}')
    const res = initProject(dir, '0.0.1')
    expect(res.terraform).toBe('./infra')
  })

  it('honors an explicit --terraform override', () => {
    const dir = mk()
    fs.writeFileSync(path.join(dir, 'main.tf'), 'resource "x" "y" {}')
    const res = initProject(dir, '0.0.1', { terraform: './environments/prod' })
    expect(res.terraform).toBe('./environments/prod')
    expect(terraformOf(dir)).toBe('./environments/prod')
  })

  it('detects a per-environment layout as multiple roots', () => {
    const dir = mk()
    for (const env of ['dev', 'stg', 'prd']) {
      fs.mkdirSync(path.join(dir, 'env', env), { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'env', env, 'main.tf'),
        'resource "x" "y" {}',
      )
    }
    const res = initProject(dir, '0.0.1')
    // recognizable env folder names get an environment mapping
    const expected = [
      { path: './env/dev', environment: 'development' },
      { path: './env/prd', environment: 'production' },
      { path: './env/stg', environment: 'staging' },
    ]
    expect(res.terraform).toEqual(expected)
    expect(terraformOf(dir)).toEqual(expected)
    // no spurious terraform/ dir
    expect(fs.existsSync(path.join(dir, 'terraform'))).toBe(false)
  })
})
