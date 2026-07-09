/**
 * Railway Oriented Programming core (doc 06). Hand-rolled, zero-dep.
 * Operational failures ride the Err track; violations never do.
 */

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

/** Railway combinator: transform the success value, pass errors through. */
export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r
}

/** Railway combinator: chain a fallible step, short-circuit on error. */
export function andThen<T, U, E>(
  r: Result<T, E>,
  f: (t: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? f(r.value) : r
}

/**
 * Fold combinator (NOT a railway): run all, accumulate every error.
 * Used by spec loading so every invalid rule is reported at once.
 */
export function combineWithAllErrors<T, E>(
  results: Result<T, E>[],
): Result<T[], E[]> {
  const values: T[] = []
  const errors: E[] = []
  for (const r of results) {
    if (r.ok) values.push(r.value)
    else errors.push(r.error)
  }
  return errors.length > 0 ? err(errors) : ok(values)
}
