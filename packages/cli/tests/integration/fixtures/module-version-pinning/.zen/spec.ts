import { rule } from '../../../../../src/index'

export const spec = [
  // #19: registry modules must pin their version (`=` or `~>`) — a floating
  // or absent version lets `terraform init` pull a different revision each
  // run (supply-chain drift). Local modules (./) carry no version and pass.
  rule()
    .allResources()
    .denyFloatingModuleVersion()
    .message('registry modules must be version-pinned (= or ~>)'),
]