"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHmac } = require("node:crypto");
const dotenv = require("dotenv");
const Redis = require("ioredis");

const CONFIRMATION = "triad_fullstack_e2e";
const REDIS_DB = 15;
const EMAIL = "user@example.com";
const REQUEST_IP = "::ffff:127.0.0.1";

async function main() {
  if (process.env.FULLSTACK_E2E_CONFIRM !== CONFIRMATION) {
    throw new Error("Missing or invalid FULLSTACK_E2E_CONFIRM");
  }

  if (process.env.FULLSTACK_E2E_REDIS_DB !== String(REDIS_DB)) {
    throw new Error("Redis DB confirmation must be 15");
  }

  if (
    process.env.FULLSTACK_E2E_BACKEND_TARGET !==
    "test:triad_fullstack_e2e:redis15"
  ) {
    throw new Error("Backend E2E target confirmation is required");
  }

  const envPath = path.resolve(__dirname, "../.env");
  const env = dotenv.parse(fs.readFileSync(envPath));

  const secret = env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Backend JWT secret is missing or invalid");
  }

  const digest = createHmac("sha256", secret)
    .update(`triad:rate-limit:v1:email:${EMAIL}`)
    .digest("hex");

  const key = `ratelimit:auth:${REQUEST_IP}:${digest}`;

  const redis = new Redis({
    host: "127.0.0.1",
    port: 6379,
    db: REDIS_DB,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });

  try {
    await redis.connect();

    if (await redis.ping() !== "PONG") {
      throw new Error("Redis health check failed");
    }

    const type = await redis.type(key);
    if (type !== "string" && type !== "none") {
      throw new Error("Unexpected Redis key type; refusing deletion");
    }

    const deleted = await redis.del(key);
    console.log(`E2E auth bucket reset: ${deleted === 1 ? "deleted" : "already clean"}`);
  } finally {
    await redis.quit();
  }
}

main().catch((error) => {
  console.error(`E2E auth bucket reset failed: ${error.message}`);
  process.exitCode = 1;
});
