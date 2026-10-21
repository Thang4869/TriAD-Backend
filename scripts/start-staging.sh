#!/bin/sh
set -eu

# The default production Docker command never runs migrations automatically.
# This entrypoint is only for the isolated staging stack in render.yaml.
if [ "${TRIAD_DEPLOYMENT_ENV:-}" != "staging" ]; then
  echo "Refusing staging startup: TRIAD_DEPLOYMENT_ENV must be staging" >&2
  exit 1
fi

./node_modules/.bin/prisma migrate deploy
exec node dist/server.js
