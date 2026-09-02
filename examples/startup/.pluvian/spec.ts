/**
 * Startup profile — secure-by-default baseline, minimal friction.
 *
 * Generated from the `startup` profile (`pluvian init --profile startup`).
 * Spreads `coreSecurity` (no hardcoded secrets, no public SSH/RDP, at-rest
 * encryption, public-access denials, floating-version pinning) and adds a
 * single ownership tag. Designed to run on every PR with zero tuning.
 *
 * Grow into enterprise/regulated by adding `--presets` or switching
 * `--profile`; or edit this file directly.
 */

import { coreSecurity, rule, Tag, Effect } from '@erkos/pluvian'

export const spec = [
  ...coreSecurity,
  // Ownership — one tag, warn severity (don't block the startup on a missing
  // label). Upgrade to Effect.Block once tag hygiene is established.
  rule()
    .allResources()
    .mustHaveTags(Tag.Team)
    .onViolation(Effect.Warn)
    .message('Resources must carry a team tag for ownership and cost attribution')
    .rationale(
      'A single ownership signal enables oncall routing, cost attribution, ' +
        'and blast-radius analysis — the minimum viable governance metadata.',
    ),
]
