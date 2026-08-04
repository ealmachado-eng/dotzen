/**
 * Regulated profile — the full compliance stack + data sovereignty.
 *
 * Generated from the `regulated` profile (`dotzen init --profile regulated`).
 * Spreads every shipped framework pack (PCI/SOC2/NIST/data-protection) on top
 * of the CIS baselines and adds a data-residency control. Edit the
 * ApprovedRegion enum to your jurisdiction + drop frameworks you don't need.
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

// Regions where regulated/personal data may be processed (GDPR example —
// edit to your jurisdiction: LGPD → sa-east-1 / southamerica-east1, etc.).
// Declared as an enum so a typo'd region code is a compile error.
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
  // an unknown region degrades to could-not-evaluate (never a false pass).
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
