// Post-export fix for web: expo export emits vector-icon fonts under
// dist/assets/__node_modules/.pnpm/... - Vercel (and other static hosts)
// refuse to serve dot-directories, so the font 404s and every icon renders
// as an empty box. Copy each font out of the dot-path into assets/fonts/
// and rewrite the reference inside the JS bundles.
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const moved = [];
for (const file of walk(join(dist, 'assets'))) {
  const rel = relative(dist, file).split('\\').join('/');
  if (!rel.includes('/.')) continue;
  const sub = /\.(ttf|otf|woff2?)$/.test(file) ? 'fonts' : 'img';
  const target = `assets/${sub}/${basename(file)}`;
  mkdirSync(join(dist, `assets/${sub}`), { recursive: true });
  cpSync(file, join(dist, target));
  moved.push([rel, target]);
}

for (const file of walk(dist)) {
  if (!/\.(js|html|css|json)$/.test(file)) continue;
  let src = readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of moved) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) writeFileSync(file, src);
}

for (const [from, to] of moved) console.log(`relocated ${from} -> ${to}`);
if (moved.length === 0) console.log('no dot-path fonts found');
