import { describe, it, expect } from 'vitest'
import { ok, err, map, andThen, combineWithAllErrors } from './result'

describe('Result', () => {
  it('map transforms the success value', () => {
    expect(map(ok(2), (n) => n + 1)).toEqual(ok(3))
  })

  it('map passes an error through untouched', () => {
    const e = err('boom')
    expect(map(e, (n: number) => n + 1)).toBe(e)
  })

  it('andThen chains on success', () => {
    expect(andThen(ok(2), (n) => ok(n * 10))).toEqual(ok(20))
  })

  it('andThen short-circuits on the first error (railway)', () => {
    const e = err('stop')
    const next = andThen(e, (n: number) => ok(n * 10))
    expect(next).toBe(e)
  })

  it('combineWithAllErrors accumulates every error, not just the first', () => {
    const r = combineWithAllErrors([ok(1), err('a'), ok(2), err('b')])
    expect(r).toEqual(err(['a', 'b']))
  })

  it('combineWithAllErrors returns all values when everything is ok', () => {
    expect(combineWithAllErrors([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]))
  })
})
