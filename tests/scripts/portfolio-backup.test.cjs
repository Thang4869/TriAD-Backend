const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sourceEnvironment,
} = require("../../scripts/backup/portfolio-backup.cjs");
const url =
  "postgresql://triad_staging:private@dpg-dbcbq8ff3r2c739hbi3g-a.singapore-postgres.render.com/triad_staging";
test("only backs up the selected external portfolio database over required TLS", () => {
  const env = sourceEnvironment(url + "?sslmode=require");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(env.PGDATABASE, "triad_staging");
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.equal(sourceEnvironment(url).PGSSLMODE, "require");
});
test("rejects source substitution and environment-file injection", () => {
  for (const value of [
    url.replace("singapore-postgres.render.com", "evil.example"),
    url.replace("/triad_staging", "/production"),
    url.replace("private@", "bad%0APGSSLMODE=disable@"),
    url + "?sslmode=disable",
    url + "?options=evil",
    url + "#fragment",
    url.replace("postgresql:", "https:"),
    url.replace(".com/", ".com:5433/"),
  ])
    assert.throws(() => sourceEnvironment(value));
});
