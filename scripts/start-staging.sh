#!/bin/sh
set -eu

# The default production Docker command never runs migrations automatically.
# This entrypoint is only for the isolated staging stack in render.yaml.
if [ "${TRIAD_DEPLOYMENT_ENV:-}" != "staging" ]; then
  echo "Refusing staging startup: TRIAD_DEPLOYMENT_ENV must be staging" >&2
  exit 1
fi

case "${TRIAD_SEED_STAGING_CATALOG:-false}" in
  true|false) ;;
  *)
    echo "Refusing staging startup: TRIAD_SEED_STAGING_CATALOG must be true or false" >&2
    exit 1
    ;;
esac

./node_modules/.bin/prisma migrate deploy
if [ "${TRIAD_SEED_STAGING_CATALOG:-false}" = "true" ]; then
  node scripts/seed-staging-catalog.cjs
fi
exec node dist/server.js
