import { cisAws } from '../../../../../src/presets/cis-aws'

// A smoke test: run the REAL cisAws preset against a fixture with known
// violations + known compliant resources. Proves the preset fires correctly
// end-to-end (not just that its rules validate).
export const spec = [...cisAws]
