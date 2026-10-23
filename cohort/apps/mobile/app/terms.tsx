import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, spacing, type as typeScale } from '@/theme';

const SECTIONS: [string, string][] = [
  ['1. What Cohort is', 'Cohort is a community app for CA, CMA and CS students: a feed, shared study resources, groups, work and articleship listings, institute services, an AI study assistant and practice questions.'],
  ['2. Your account', 'You need an account with a verified email to post or manage content. Keep your password private. You are responsible for activity under your account. Admin access is granted by existing admins only; it is never self-serve.'],
  ['3. Your content', 'You keep ownership of what you post. By posting you give Cohort a license to show it inside the app to other members. Do not post content you have no right to share, including pirated study material.'],
  ['4. Community rules', 'Be respectful. No harassment, spam, exam malpractice, impersonation, or sharing of leaked exam content. We may remove content and suspend accounts that break these rules.'],
  ['5. Listings and opportunities', 'Jobs, articleship and gig listings are posted by members and firms. Cohort does not verify every listing and is not a party to any agreement you make. Check firms and offers yourself before committing.'],
  ['6. The AI assistant', 'The AI assistant gives study help, not professional advice. Verify answers against official institute material before relying on them in exams or work.'],
  ['7. Availability', 'We aim for a reliable service but do not promise uninterrupted availability. Features may change as the app grows.'],
  ['8. Liability', 'Cohort is provided as is. To the extent the law allows, we are not liable for indirect losses arising from use of the app.'],
  ['9. Changes', 'We will update these terms as the app evolves and will note the date above. Continued use after an update means you accept the new terms.'],
  ['10. Contact', 'Questions about these terms: reach the team through the Helpdesk section in the app.'],
];

export default function TermsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Terms of use</Text>
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
