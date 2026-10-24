const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertFixture,
} = require("../../scripts/acceptance/recovery-fixture.cjs");
const environment = {
  RECOVERY_RUNTIME_ENABLED: "true",
  RECOVERY_PREFIX: "triad-runtime-recovery-123",
  DATABASE_URL:
    "postgresql://test:test@triad-runtime-recovery-123-pg:5432/triad_recovery_source",
  REDIS_URL: "redis://triad-runtime-recovery-123-redis:6379",
};
test("only permits explicitly owned disposable recovery source/target phases", () => {
  assert.doesNotThrow(() => assertFixture("seed", environment));
  assert.doesNotThrow(() =>
    assertFixture("prepare", {
      ...environment,
      DATABASE_URL: environment.DATABASE_URL.replace("source", "target"),
    }),
  );
  assert.throws(() => assertFixture("prepare", environment));
  assert.throws(() => assertFixture("unknown", environment));
});
test("refuses external credentials/hosts, unexpected databases and Redis", () => {
  for (const overrides of [
    { RECOVERY_RUNTIME_ENABLED: "false" },
    { RECOVERY_PREFIX: "staging" },
    {
      DATABASE_URL:
        "postgresql://operator:private@production.example/triad_recovery_source",
    },
    { DATABASE_URL: environment.DATABASE_URL + "?schema=public" },
    {
      DATABASE_URL: environment.DATABASE_URL.replace(
        "triad_recovery_source",
        "triad_staging",
      ),
    },
    { REDIS_URL: "redis://production.example:6379" },
  ])
    assert.throws(() =>
      assertFixture("seed", { ...environment, ...overrides }),
    );
});
