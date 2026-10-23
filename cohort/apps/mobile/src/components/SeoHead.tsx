/**
 * Per-route head metadata (web only): title, description, canonical URL and
 * Open Graph / Twitter card tags. No-op on native.
 */
import Head from 'expo-router/head';

export const SITE_URL = 'https://cohort-pi-eight.vercel.app';
export const SITE_NAME = 'Cohort';
const DEFAULT_DESC = 'Cohort is the community for CA students and professionals: daily reads, study circles, ICAI updates, jobs and mentorship in one place.';

type SeoHeadProps = {
  /** Prevent indexing (private screens). */
  noindex?: boolean;
  /** Absolute path on the site, e.g. "/resources". */
  path: string;
  description?: string;
  title: string;
};

export function SeoHead({ description = DEFAULT_DESC, noindex = false, path, title }: SeoHeadProps) {
  const fullTitle = path === '/' ? `${SITE_NAME} - community for CA students` : `${title} - ${SITE_NAME}`;
  const canonical = `${SITE_URL}${path}`;
  return (
    <Head>
      <title>{fullTitle}</title>
      {noindex ? <meta content="noindex, nofollow" name="robots" /> : null}
      <meta content={description} name="description" />
      <link href={canonical} rel="canonical" />
      <meta content="website" property="og:type" />
      <meta content={SITE_NAME} property="og:site_name" />
      <meta content={fullTitle} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${SITE_URL}/og-image.png`} property="og:image" />
      <meta content="1200" property="og:image:width" />
      <meta content="630" property="og:image:height" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content={fullTitle} name="twitter:title" />
      <meta content={description} name="twitter:description" />
      <meta content={`${SITE_URL}/og-image.png`} name="twitter:image" />
    </Head>
  );
}
