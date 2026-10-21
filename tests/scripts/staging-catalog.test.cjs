"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  seedStagingCatalog,
} = require("../../scripts/seed-staging-catalog.cjs");

const enabled = {
  TRIAD_DEPLOYMENT_ENV: "staging",
  TRIAD_SEED_STAGING_CATALOG: "true",
};

test("rejects missing or incorrect opt-ins before accessing the database", async () => {
  for (const env of [
    {},
    { ...enabled, TRIAD_DEPLOYMENT_ENV: "production" },
    { ...enabled, TRIAD_DEPLOYMENT_ENV: "Staging" },
    { TRIAD_DEPLOYMENT_ENV: "staging" },
    { ...enabled, TRIAD_SEED_STAGING_CATALOG: "false" },
    { ...enabled, TRIAD_SEED_STAGING_CATALOG: "TRUE" },
    { ...enabled, TRIAD_SEED_STAGING_CATALOG: "1" },
  ]) {
    let accessed = false;
    await assert.rejects(
      seedStagingCatalog(
        {
          $transaction() {
            accessed = true;
            throw new Error("Database must not be accessed");
          },
        },
        env,
      ),
      /Refusing catalog seed/,
    );
    assert.equal(accessed, false);
  }
});

test("checks the actual database name before issuing catalog writes", async () => {
  let checked = false;
  await assert.rejects(
    seedStagingCatalog(
      {
        $transaction: (callback) =>
          callback({
            $queryRaw: async () => {
              checked = true;
              return [{ name: "production" }];
            },
          }),
      },
      enabled,
    ),
    /connected database must be triad_staging/,
  );
  assert.equal(checked, true);
});

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "triad-staging-catalog-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("CLI rejects an unapproved environment without leaking connection details", () => {
  const child = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../../scripts/seed-staging-catalog.cjs")],
    {
      env: {
        ...process.env,
        ...enabled,
        TRIAD_DEPLOYMENT_ENV: "production",
        DATABASE_URL:
          "postgresql://private-user:private-password@invalid/production",
      },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(child.status, 1);
  assert.match(child.stderr, /TRIAD_DEPLOYMENT_ENV must be staging/);
  assert.doesNotMatch(
    child.stdout + child.stderr,
    /private-user|private-password/,
  );
});

test("CLI disconnects and sanitizes unexpected Prisma errors", (t) => {
  const root = temporaryRoot(t);
  fs.copyFileSync(
    path.resolve(__dirname, "../../scripts/seed-staging-catalog.cjs"),
    path.join(root, "seed.cjs"),
  );
  const clientPath = path.join(root, "node_modules", "@prisma", "client");
  fs.mkdirSync(clientPath, { recursive: true });
  fs.writeFileSync(
    path.join(clientPath, "index.js"),
    `exports.PrismaClient = class {
      async $transaction() { throw new Error("postgresql://private-user:private-password@private-host/db"); }
      async $disconnect() { console.log("DISCONNECTED"); }
    };`,
  );
  const child = spawnSync(process.execPath, [path.join(root, "seed.cjs")], {
    env: { ...process.env, ...enabled },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Staging catalog seed failed/);
  assert.match(child.stdout, /DISCONNECTED/);
  assert.doesNotMatch(
    child.stdout + child.stderr,
    /private-user|private-password|private-host/,
  );
});

for (const scenario of [
  {
    name: "unset",
    flag: undefined,
    migration: 0,
    seed: 0,
    status: 0,
    output: "MIGRATION\nAPP_STARTED\n",
  },
  {
    name: "disabled",
    flag: "false",
    migration: 0,
    seed: 0,
    status: 0,
    output: "MIGRATION\nAPP_STARTED\n",
  },
  {
    name: "enabled",
    flag: "true",
    migration: 0,
    seed: 0,
    status: 0,
    output: "MIGRATION\nSEED\nAPP_STARTED\n",
  },
  {
    name: "migration failure",
    flag: "true",
    migration: 1,
    seed: 0,
    status: 1,
    output: "MIGRATION\n",
  },
  {
    name: "seed failure",
    flag: "true",
    migration: 0,
    seed: 2,
    status: 2,
    output: "MIGRATION\nSEED\n",
  },
  {
    name: "invalid flag",
    flag: "True",
    migration: 0,
    seed: 0,
    status: 1,
    output: "",
  },
]) {
  test(
    `staging startup: ${scenario.name}`,
    { skip: process.platform === "win32" },
    (t) => {
      const root = temporaryRoot(t);
      fs.mkdirSync(path.join(root, "node_modules", ".bin"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(root, "dist"));
      fs.mkdirSync(path.join(root, "scripts"));
      const prisma = path.join(root, "node_modules", ".bin", "prisma");
      fs.writeFileSync(
        prisma,
        `#!/bin/sh\nprintf 'MIGRATION\\n'\nexit ${scenario.migration}\n`,
      );
      fs.chmodSync(prisma, 0o755);
      fs.writeFileSync(
        path.join(root, "dist", "server.js"),
        "console.log('APP_STARTED');\n",
      );
      fs.writeFileSync(
        path.join(root, "scripts", "seed-staging-catalog.cjs"),
        `console.log('SEED'); process.exitCode = ${scenario.seed};\n`,
      );
      const env = { ...process.env, TRIAD_DEPLOYMENT_ENV: "staging" };
      delete env.TRIAD_SEED_STAGING_CATALOG;
      if (scenario.flag !== undefined)
        env.TRIAD_SEED_STAGING_CATALOG = scenario.flag;
      const child = spawnSync(
        "sh",
        [path.resolve(__dirname, "../../scripts/start-staging.sh")],
        { cwd: root, env, encoding: "utf8", timeout: 5000 },
      );
      assert.equal(child.status, scenario.status);
      assert.equal(child.stdout, scenario.output);
      if (scenario.name === "invalid flag") {
        assert.match(
          child.stderr,
          /TRIAD_SEED_STAGING_CATALOG must be true or false/,
        );
      }
    },
  );
}
