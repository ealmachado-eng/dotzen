import { describe, it, expect, vi } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  it('runs once per burst (trailing), with the last arguments', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 500)
    debounced('a')
    debounced('b')
    debounced('c')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
    vi.useRealTimers()
  })

  it('reschedules on a follow-up trigger before the timer fires', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 500)
    debounced()
    vi.advanceTimersByTime(400)
    debounced()
    vi.advanceTimersByTime(400)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
