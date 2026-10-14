"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assertSafeDatabase } = require("../../scripts/recovery-drill.cjs");

function protectedCheck(url, mode, environment = "test", enabled = "true") {
  const priorEnv = process.env.NODE_ENV;
  const priorFlag = process.env.RECOVERY_DRILL_ENABLED;
  process.env.NODE_ENV = environment;
  process.env.RECOVERY_DRILL_ENABLED = enabled;
  try {
    return assertSafeDatabase(url, mode);
  } finally {
    if (priorEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorEnv;
    if (priorFlag === undefined) delete process.env.RECOVERY_DRILL_ENABLED;
    else process.env.RECOVERY_DRILL_ENABLED = priorFlag;
  }
}
test("allows only explicitly enabled ephemeral source and target databases", () => {
  assert.doesNotThrow(() => protectedCheck(
    "postgresql://test:test@127.0.0.1:5432/triad_recovery_source", "seed",
  ));
  assert.doesNotThrow(() => protectedCheck(
    "postgresql://test:test@127.0.0.1:5432/triad_recovery_target", "verify",
  ));
});
test("refuses a production database or accidental wrong phase", () => {
  assert.throws(
    () => protectedCheck("postgresql://prod:secret@host/prod", "seed"),
    /Refusing recovery drill/,
  );
  assert.throws(
    () => protectedCheck("postgresql://test:test@host/triad_recovery_source", "verify"),
    /Refusing recovery drill/,
  );
});
test("refuses non-CI host or credentials even with an approved DB name", () => {
  assert.throws(
    () => protectedCheck("postgresql://test:test@production.example.com:5432/triad_recovery_source", "seed"),
    /Refusing recovery drill/,
  );
  assert.throws(
    () => protectedCheck("postgresql://admin:password@127.0.0.1:5432/triad_recovery_target", "verify"),
    /Refusing recovery drill/,
  );
});

test("refuses the drill unless NODE_ENV=test and explicitly enabled", () => {
  assert.throws(() => protectedCheck(
    "postgresql://test:test@host/triad_recovery_source", "seed", "production", "true",
  ));
  assert.throws(() => protectedCheck(
    "postgresql://test:test@host/triad_recovery_source", "seed", "test", "false",
  ));
});
