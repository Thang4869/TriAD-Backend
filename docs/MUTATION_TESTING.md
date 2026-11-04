# Mutation testing

Mutation testing runs StrykerJS 10.1.1 with the Vitest runner against a
deliberately small, business-critical scope:

- shared value objects;
- cart, order, and product domain entities;
- product specifications; and
- checkout pricing and stock-reservation services.

Generated code, DTOs, API/infrastructure adapters, application bootstrap, and
integration tests are excluded because they are either generated, boundary
plumbing, or require external services. Their behavior remains covered by the
existing unit, integration, and end-to-end quality gates.

## Local execution

```sh
npm run test:mutation
```

The command writes reproducible HTML and JSON reports to
`reports/mutation/`. The report directory is intentionally not committed;
continuous integration uploads it as an artifact.

The initial baseline was recorded on Node 24.14.0 with the first successful
run:

- mutation score: 86.23% (570 killed, 69 survived, no timeouts, and 22
  uncovered out of 661 mutants)
- enforced threshold: 85% (`break`)

The threshold is intentionally below the baseline to allow for normal
mutation-engine variation while preventing a material regression. The 90%
high threshold reports the selected scope as needing attention until the
surviving mutants are addressed. Surviving mutants must not be hidden through
exclusions or weakened assertions.
