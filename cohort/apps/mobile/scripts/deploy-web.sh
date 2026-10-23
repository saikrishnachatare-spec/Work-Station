#!/usr/bin/env bash
# Build the static web export and deploy it to Vercel (project "cohort").
# Requires VERCEL_TOKEN in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
node_modules/.bin/expo export --platform web --output-dir dist
# Static export regenerates dist/, so restore the Vercel config (cleanUrls
# keeps deep links like /search working) before every deploy.
cp vercel.dist.json dist/vercel.json
npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" --name cohort dist
