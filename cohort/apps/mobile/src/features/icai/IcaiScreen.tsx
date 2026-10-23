import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { ScreenHeader, SectionTitle } from '@/components/ScreenBits';
import { colors, radius, spacing, type as typeScale } from '@/theme';

type Service = { title: string; note: string; url: string; login?: boolean };
type Tab = { id: string; label: string; services: Service[] };

const TABS: Tab[] = [
  {
    id: 'exams', label: 'Exams & results',
    services: [
      { title: 'Exam results and merit lists', note: 'Foundation, Inter and Final results with announcement dates.', url: 'https://icai.nic.in/' },
      { title: 'Exam forms and admit cards', note: 'Application forms, corrections and admit cards run through your SSP login.', url: 'https://eservices.icai.org/', login: true },
      { title: 'Foundation admit card (direct form)', note: 'Official e-form login for the Foundation admit card.', url: 'https://eservices.icai.org/EForms/configuredHtml/1666/71696/login.html', login: true },
      { title: 'Intermediate admit card (direct form)', note: 'Official e-form login for the Intermediate admit card.', url: 'https://eservices.icai.org/EForms/loginAction.do?formId=71729&orgId=1666&subAction=ViewLoginPage', login: true },
      { title: 'Exam FAQs', note: 'ICAI answers on exam rules, centres and papers (PDF).', url: 'https://icai-call-sahayata.icai.org/assets/pdf/FAQs-on-Examinations-.pdf' },
    ],
  },
  {
    id: 'study', label: 'Study',
    services: [
      { title: 'BoS Knowledge Portal', note: 'Syllabus, study material, RTPs, mock tests, live and recorded lectures, student journal.', url: 'https://boslive.icai.org/' },
      { title: 'Students home on icai.org', note: 'ICAI student announcements and service directory.', url: 'https://www.icai.org/students.shtml' },
      { title: 'Order printed study material (CDS)', note: 'Centralised Distribution System for books at your doorstep.', url: 'https://www.icai.org/post/publication-cds-directorate' },
      { title: 'New scheme FAQs', note: 'Current scheme of education and training, answered by ICAI (PDF).', url: 'https://icai-call-sahayata.icai.org/assets/pdf/FAQs_on_CA_Course.pdf' },
    ],
  },
  {
    id: 'account', label: 'ICAI account',
    services: [
      { title: 'Self Service Portal (SSP)', note: 'Your ICAI account: registration, exam forms, fees, letters and requests.', url: 'https://eservices.icai.org/', login: true },
      { title: 'New student registration', note: 'First-time registration for the CA course.', url: 'https://eservices.icai.org/EForms/configuredHtml/1666/87785/Registration.html' },
      { title: 'ICAI main website', note: 'Institute news, council decisions and official notices.', url: 'https://www.icai.org/' },
    ],
  },
  {
    id: 'training', label: 'Training & skills',
    services: [
      { title: 'ICITSS / Advanced ICITSS', note: 'IT and soft-skills course information and FAQs (PDF).', url: 'https://icai-call-sahayata.icai.org/wp-content/uploads/2025/03/SSEB-ICITSS-AICITSS-faq.pdf' },
      { title: 'Practical training portal (SPMT)', note: 'Articleship and industrial training records through SSP-linked services.', url: 'https://spmt.icai.org/ICAI/LoginAction_input.action', login: true },
      { title: 'ICAI Cloud Campus', note: 'Digital learning environment for ICAI courses.', url: 'https://cloudcampus.icai.org/', login: true },
    ],
  },
  {
    id: 'money', label: 'Money & careers',
    services: [
      { title: 'Scholarships (CASBF)', note: 'Financial assistance from the CA Students Benevolent Fund - rules and how to apply (PDF).', url: 'https://icai-call-sahayata.icai.org/wp-content/uploads/2025/01/scholarship-FAQs-updated-1.pdf' },
      { title: 'Campus placements (CMI&B)', note: 'ICAI campus placement programme for newly qualified CAs.', url: 'https://cmib.icai.org/campus-signin?user_type=student', login: true },
    ],
  },
  {
    id: 'help', label: 'Help',
    services: [
      { title: 'ICAI Call Sahayata', note: 'Official student helpdesk: call +91-99975 99975 or browse the FAQ library.', url: 'https://icai-call-sahayata.icai.org/' },
      { title: 'BoS portal help and FAQs', note: 'Using the BoS Knowledge Portal, step by step.', url: 'https://www.icai.org/post/18502' },
    ],
  },
];

function open(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
}

export function IcaiScreen() {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader title="ICAI services" sub="Every needed official service, in one place." />
      <Card>
        <Text style={styles.body}>
          Cohort is an independent community, not ICAI. Confirm dates, fees and notices on the official
          source. ICAI does not allow its pages to be shown inside other apps, so each service opens in a
          new browser tab on its official site. Cohort never asks for your ICAI password.
        </Text>
      </Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            accessibilityRole="button"
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.tab, tab === t.id && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ gap: spacing.sm }}>
        {active.services.map((s) => (
          <Pressable accessibilityRole="link" key={s.url} onPress={() => open(s.url)}>
            <Card style={styles.service}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.note}>{s.note}</Text>
                <Text style={styles.url}>{s.url.replace('https://', '')}</Text>
              </View>
              <View style={styles.badges}>
                {s.login && <Text style={styles.badgeLogin}>ICAI login</Text>}
                <Text style={styles.badgeOpen}>New tab</Text>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
      <SectionTitle title="Study tools in Cohort" />
      <Card>
        <Text style={styles.title}>AI assistant not connected</Text>
        <Text style={styles.body}>
          A real provider key and spending limit are needed. The canned assistant was removed rather than
          shown as live AI.
        </Text>
      </Card>
      <Card>
        <Text style={styles.title}>Question bank not published</Text>
        <Text style={styles.body}>
          The sample quiz was removed. A reviewed original or licensed question bank is still needed.
          Until then, use the BoS Knowledge Portal official mock tests and RTPs above.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: {
    backgroundColor: colors.card, borderColor: colors.lineWarm, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8,
  },
  tabOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  tabText: { ...typeScale.caption, color: colors.ink2, fontWeight: '500' },
  tabTextOn: { color: colors.brandDeep, fontWeight: '600' },
  service: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  title: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  note: { ...typeScale.caption, color: colors.ink2, lineHeight: 18 },
  url: { ...typeScale.caption, color: colors.ink3, fontSize: 11 },
  body: { ...typeScale.body, color: colors.ink2, lineHeight: 22 },
  badges: { alignItems: 'flex-end', gap: 4 },
  badgeLogin: {
    ...typeScale.caption, backgroundColor: colors.brandSoft, borderRadius: radius.pill, color: colors.brandDeep,
    fontSize: 10, fontWeight: '600', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeOpen: { ...typeScale.caption, color: colors.ink3, fontSize: 10 },
});
