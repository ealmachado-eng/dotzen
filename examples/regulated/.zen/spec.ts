/**
 * Regulated profile — the full compliance stack + data sovereignty.
 *
 * For estates under a compliance regime (PCI-DSS, SOC 2, NIST 800-53, or
 * data-protection law like GDPR/LGPD). Spreads every shipped framework pack
 * on top of the CIS baselines and adds a data-residency control: resources
 * must run in an approved region, so personal/regulated data stays in its
 * jurisdiction.
 *
 * Copy this file to `<your-project>/.zen/spec.ts`, then edit:
 *   - `ApprovedRegion` — the regions your data is allowed to live in, and
 *   - which framework packs you spread (drop the ones you aren't bound by).
 */
import {
  coreSecurity,
  cisAws,
  cisAzure,
  cisGcp,
  pciDss,
  soc2,
  nist80053,
  dataProtection,
  rule,
  Effect,
} from '@dotzen/dotzen'

// The regions where regulated/personal data may be processed (GDPR example —
// edit to your jurisdiction: LGPD → sa-east-1 / southamerica-east1, etc.).
// Declared as an enum so a typo'd region code is a compile error, not a
// silently-never-fires residency rule.
enum ApprovedRegion {
  EuWest1 = 'eu-west-1',
  EuWest2 = 'eu-west-2',
  EuCentral1 = 'eu-central-1',
  WestEurope = 'westeurope',
  NorthEurope = 'northeurope',
  EuropeWest1 = 'europe-west1',
  EuropeWest3 = 'europe-west3',
}

export const spec = [
  // ── Baselines + compliance frameworks ───────────────────────────────
  ...coreSecurity,
  ...cisAws,
  ...cisAzure,
  ...cisGcp,
  ...pciDss,
  ...soc2,
  ...nist80053,
  ...dataProtection,

  // ── Data sovereignty: resources must run in an approved region ───────
  // A resource whose provider region is NOT in the approved set violates;
  // a resource with no statically-knowable region degrades to
  // could-not-evaluate (never a false pass — an unknown region might be
  // outside the jurisdiction).
  rule()
    .allResources()
    .denyNonApprovedRegion(
      ApprovedRegion.EuWest1,
      ApprovedRegion.EuWest2,
      ApprovedRegion.EuCentral1,
      ApprovedRegion.WestEurope,
      ApprovedRegion.NorthEurope,
      ApprovedRegion.EuropeWest1,
      ApprovedRegion.EuropeWest3,
    )
    .onViolation(Effect.Block)
    .message('Resources must run in an approved region (data residency)')
    .rationale(
      'GDPR Art. 44–49 / LGPD Art. 11 — personal data must not leave its ' +
        'jurisdiction. Restricting deployable regions enforces this at the ' +
        'infrastructure layer, before any data is written.',
    ),
]
