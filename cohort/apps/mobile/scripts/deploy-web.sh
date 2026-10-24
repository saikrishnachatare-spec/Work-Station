#!/usr/bin/env bash
# Deploy the web build to Vercel production (cohort-pi-eight.vercel.app).
# Prereqs: pnpm install, .env filled from .env.example, VERCEL_TOKEN env var,
# and a .vercel link (npx vercel link --yes --project cohort).
# The project has no dashboard build settings: we export locally and deploy dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
npx expo export --platform web
printf '{\n  "cleanUrls": true\n}\n' > dist/vercel.json
cp -r .vercel dist/.vercel
(cd dist && npx --yes vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN")
