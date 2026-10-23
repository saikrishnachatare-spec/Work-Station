import { SeoHead } from '@/components/SeoHead';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, spacing, type as typeScale } from '@/theme';

const SECTIONS: [string, string][] = [
  ['1. What we collect', 'Account details (name, email), the content you post (posts, resources, messages, listings), and security and audit records (sign-ins and moderation actions, kept as an admin-only audit log to protect accounts).'],
  ['1a. Optional analytics', 'Only if you accept in the consent note, we also count which screens signed-in members open - screen names only, at most one count per screen per 30 minutes, visible to admins only - to see which features get used. Declining collects nothing. Deleting your account anonymises these records like every other audit row.'],
  ['2. What we do with it', 'Run the community: show your posts to other members, deliver messages, recommend content, keep the service secure, and understand what to build next. We do not sell your personal data.'],
  ['3. What others see', 'Your name, course level and the content you post are visible to other members. Messages are visible only to their participants. Admins can review reported content to keep the community safe.'],
  ['4. Where data lives', 'Data is stored with Supabase in the ap-south-1 (Mumbai) region. Analytics and error reports are processed by our monitoring providers under their own privacy terms.'],
  ['5. Cookies and storage', 'The app stores your sign-in session on your device so you stay logged in. You can clear it by signing out.'],
  ['6. Your choices', 'You can edit or delete your posts, sign out any time, and request account deletion from the account screen. Deleting your account removes your profile and personal data; content you shared may remain in anonymized form.'],
  ['7. Data retention', 'We keep account data while your account is active. Backups roll off on a fixed schedule (currently 7 days on our free database tier).'],
  ['8. Security', 'Passwords are hashed by our auth provider and never stored in plain text. Access to production data is limited to admins and protected by row-level security.'],
  ['9. Changes', 'We will update this policy as the app evolves and note the date above. Material changes will be announced in the app.'],
  ['10. Contact', 'Privacy questions or deletion requests: reach the team through the Helpdesk section in the app.'],
];

export default function PrivacyScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SeoHead description="How Cohort collects, uses and protects your data." path="/privacy" title="Privacy policy" />
      <Text style={styles.title}>Privacy policy</Text>
      <Text style={styles.meta}>Cohort · last updated 23 October 2026</Text>
      {SECTIONS.map(([head, body]) => (
        <Text key={head} style={styles.body}>
          <Text style={styles.head}>{head}{'\n'}</Text>
          {body}{'\n'}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.sm, padding: spacing.lg, paddingBottom: 60 },
  title: { ...typeScale.screenTitle, color: colors.ink },
  meta: { ...typeScale.caption, color: colors.ink3, marginBottom: spacing.sm },
  head: { ...typeScale.body, color: colors.ink, fontWeight: '700' },
  body: { ...typeScale.body, color: colors.ink2 },
});
