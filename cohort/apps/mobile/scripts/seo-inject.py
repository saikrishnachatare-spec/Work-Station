#!/usr/bin/env python3
"""Inject per-route SEO head tags into the static export (dist/*.html).

Expo Router's <Head> gates on screen focus, so nothing reaches the static
HTML during export. Until that changes, we inject title/description/
canonical/OG tags directly into each exported page.
"""
import json, os, re, sys

SITE = 'https://cohort-pi-eight.vercel.app'
NAME = 'Cohort'
OG_IMG = f'{SITE}/og-image.png'
DEFAULT_DESC = ('Cohort is the community for CA students and professionals: '
                'daily reads, study circles, jobs and mentorship in one place.')

# html file -> (path, title, description, noindex)
ROUTES = {
  'index.html':           ('/', f'{NAME} - community for CA students', DEFAULT_DESC, False),
  'community.html':       ('/community', f'Community - {NAME}', 'Study circles, groups and peers preparing for CA together.', False),
  'work.html':            ('/work', f'Work - {NAME}', 'Articleships, jobs and firm openings for CA students and professionals.', False),
  'resources.html':       ('/resources', f'Resources - {NAME}', 'Notes, papers and study resources shared by the community.', False),
  'login.html':           ('/login', f'Log in - {NAME}', 'Log in or create your Cohort account.', False),
  'terms.html':           ('/terms', f'Terms of use - {NAME}', 'The terms that govern use of Cohort.', False),
  'privacy.html':         ('/privacy', f'Privacy policy - {NAME}', 'How Cohort collects, uses and protects your data.', False),
  'search.html':          ('/search', f'Search - {NAME}', 'Search posts, resources, groups, jobs and people across Cohort.', True),
  'messages.html':        ('/messages', f'Messages - {NAME}', 'Messages with students, mentors and firms.', True),
  'account.html':         ('/account', f'Account - {NAME}', 'Your Cohort account and settings.', True),
  'admin.html':           ('/admin', f'Admin - {NAME}', 'Cohort admin panel.', True),
  'reset-password.html':  ('/reset-password', f'Reset password - {NAME}', 'Reset your Cohort password.', True),
  '404.html':             ('/404', f'Not found - {NAME}', 'This page could not be found.', True),
  '+not-found.html':      ('/404', f'Not found - {NAME}', 'This page could not be found.', True),
}

def jsonld_for(path, title, desc):
    base = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      'name': title,
      'description': desc,
      'url': f'{SITE}{path}',
      'isPartOf': {'@type': 'WebSite', 'name': NAME, 'url': SITE},
    }
    blocks = [base]
    if path == '/':
        blocks.append({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          'name': NAME,
          'url': SITE,
          'logo': f'{SITE}/og-image.png',
          'description': desc,
        })
        blocks.append({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          'name': NAME,
          'url': SITE,
          'potentialAction': {
            '@type': 'SearchAction',
            'target': f'{SITE}/search?q={{search_term_string}}',
            'query-input': 'required name=search_term_string',
          },
        })
    if path not in ('/', '/404'):
        crumbs = [{'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE}]
        crumbs.append({'@type': 'ListItem', 'position': 2, 'name': title.split(' - ')[0], 'item': f'{SITE}{path}'})
        blocks.append({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': crumbs})
    return ''.join(f'<script type="application/ld+json">{json.dumps(b, separators=(",", ":"))}</script>' for b in blocks)


def perf_tags(dist):
    # Preload the icon font (otherwise icons wait for JS + useFonts) and
    # preconnect to the API origin so first data fetches skip setup cost.
    tags = [f'<link rel="preconnect" href="https://ghjerdyubgjtfihumzhb.supabase.co"/>']
    fonts_dir = os.path.join(dist, 'fonts')
    if os.path.isdir(fonts_dir):
        for f in sorted(os.listdir(fonts_dir)):
            if f.endswith('.ttf'):
                tags.append(f'<link rel="preload" href="/fonts/{f}" as="font" type="font/ttf" crossorigin="anonymous"/>')
    return ''.join(tags)


def tags_for(path, title, desc, noindex, dist):
    canonical = f'{SITE}{path}'
    robots = f'<meta name="robots" content="noindex, nofollow"/>' if noindex else ''
    return (
      f'<title>{title}</title>'
      f'<meta name="description" content="{desc}"/>'
      f'{robots}'
      f'<link rel="canonical" href="{canonical}"/>'
      f'<meta property="og:type" content="website"/>'
      f'<meta property="og:site_name" content="{NAME}"/>'
      f'<meta property="og:title" content="{title}"/>'
      f'<meta property="og:description" content="{desc}"/>'
      f'<meta property="og:url" content="{canonical}"/>'
      f'<meta property="og:image" content="{OG_IMG}"/>'
      f'<meta property="og:image:width" content="1200"/>'
      f'<meta property="og:image:height" content="630"/>'
      f'<meta name="twitter:card" content="summary_large_image"/>'
      f'<meta name="twitter:title" content="{title}"/>'
      f'<meta name="twitter:description" content="{desc}"/>'
      f'<meta name="twitter:image" content="{OG_IMG}"/>'
      f'{jsonld_for(path, title, desc)}'
      f'{perf_tags(dist)}'
    )

dist = sys.argv[1] if len(sys.argv) > 1 else 'dist'
done = []
for fname, (path, title, desc, noindex) in ROUTES.items():
    fpath = os.path.join(dist, fname)
    if not os.path.exists(fpath):
        continue
    html = open(fpath).read()
    if '<title>' in html:
        continue  # already injected
    html = html.replace('<meta http-equiv="X-UA-Compatible" content="IE=edge"/>',
                        '<meta http-equiv="X-UA-Compatible" content="IE=edge"/>' + tags_for(path, title, desc, noindex, dist))
    open(fpath, 'w').write(html)
    done.append(fname)
print(f'seo-inject: tagged {len(done)} pages: {", ".join(done)}')
