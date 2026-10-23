#!/usr/bin/env bash
# Build the static web export and deploy it to Vercel (project "cohort").
# Requires VERCEL_TOKEN in the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
node_modules/.bin/expo export --platform web --output-dir dist
# Static export regenerates dist/, so restore the Vercel config (cleanUrls
# keeps deep links like /search working) before every deploy.
cp vercel.dist.json dist/vercel.json
# Vercel refuses to serve dot-directories (.pnpm), which is where expo puts
# vector-icon fonts - copy them to /fonts and rewrite every reference.
mkdir -p dist/fonts
find dist/assets -path '*Fonts/*.ttf' -exec cp {} dist/fonts/ \;
for f in $(grep -rl '/assets/__node_modules/[^"]*/Fonts/' dist/_expo/static/js/web/ dist/*.html 2>/dev/null); do
  sed -i 's#/assets/__node_modules/[^"'"'"']*/Fonts/#/fonts/#g' "$f"
done
# Static web files (OG image, robots.txt, sitemap.xml).
cp web-static/* dist/
# Vercel serves 404.html for unmatched routes; point it at the branded 404 page.
cp "dist/+not-found.html" dist/404.html
# Per-route SEO head tags (title/meta/OG/canonical).
python3 scripts/seo-inject.py dist
URL=$(npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" --name cohort dist | grep -o 'https://[^ ]*vercel.app' | head -1)
# --prod does not always move the existing alias; pin it explicitly.
npx vercel alias set "${URL#https://}" cohort-pi-eight.vercel.app --token "$VERCEL_TOKEN"
