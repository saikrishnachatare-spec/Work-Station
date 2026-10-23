import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { ScreenHeader, SectionTitle } from '@/components/ScreenBits';
import { colors, spacing, type as typeScale } from '@/theme';

const LINKS = [
  { title: 'ICAI official website and announcements', url: 'https://www.icai.org/' },
  { title: 'ICAI Self Service Portal (SSP)', url: 'https://eservices.icai.org/' },
  { title: 'ICAI Board of Studies Knowledge Portal', url: 'https://boslive.icai.org/' },
  { title: 'BoS portal help and FAQs', url: 'https://www.icai.org/post/18502' },
];
export function IcaiScreen() {
  return <ScrollView contentContainerStyle={styles.page}>
    <ScreenHeader title="ICAI links" sub="Official services, opened on their own websites." />
    <Card><Text style={styles.body}>Cohort is an independent community, not ICAI. Confirm exam dates, fees and notices on the official source. Cohort does not collect your ICAI password.</Text></Card>
    {LINKS.map(link => <Pressable accessibilityRole="link" key={link.url} onPress={() => Linking.openURL(link.url)}>
      <Card><Text style={styles.title}>{link.title}</Text><Text style={styles.meta}>{link.url}</Text></Card>
    </Pressable>)}
    <SectionTitle title="Study tools" />
    <Card><Text style={styles.title}>AI assistant not connected</Text><Text style={styles.body}>A real provider key and spending limit are needed. The canned assistant has been removed rather than presented as live AI.</Text></Card>
    <Card><Text style={styles.title}>Question bank not published</Text><Text style={styles.body}>The sample quiz has been removed. A reviewed original or licensed question bank is still needed.</Text></Card>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  title: { ...typeScale.body, color: colors.brand, fontWeight: '600', marginBottom: 6 },
  body: { ...typeScale.body, color: colors.ink2, lineHeight: 22 },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
