#!/usr/bin/env bash
# Build the static web export and deploy it to Vercel (project "cohort").
# Requires VERCEL_TOKEN in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
node_modules/.bin/expo export --platform web --output-dir dist
# Static export regenerates dist/, so restore the Vercel config (cleanUrls
# keeps deep links like /search working) before every deploy.
cp vercel.dist.json dist/vercel.json
# Vercel serves 404.html for unmatched routes; point it at the branded 404 page.
cp "dist/+not-found.html" dist/404.html
npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" --name cohort dist
