import { coreSecurity, cisAws } from '../../../../../src/index'

// A smoke test: run the REAL coreSecurity + cisAws presets against a fixture
// with known violations + known compliant resources. Proves the composed
// preset produces correct verdicts end-to-end (not just that its rules
// validate).
export const spec = [...coreSecurity, ...cisAws]
