/**
 * Startup profile — secure-by-default baseline, minimal friction.
 *
 * The lean starting point: spread `coreSecurity` (no hardcoded secrets,
 * no public SSH/RDP, at-rest encryption, public-access denials, floating-
 * version pinning) and add a single ownership tag. Designed to run on every
 * PR with zero tuning and near-zero false positives.
 *
 * Copy this file to `<your-project>/.zen/spec.ts`, drop a `dotzen.json`
 * next to it (`dotzen init`), and run `npx @dotzen/dotzen@1.9.29 check`.
 *
 * Grow into the enterprise/regulated profiles by spreading the CIS +
 * framework packs (see ../enterprise and ../regulated).
 */
import { coreSecurity, rule, Tag, Effect } from '@dotzen/dotzen'

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
