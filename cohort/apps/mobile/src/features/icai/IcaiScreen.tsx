import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, font } from '@/theme';

type Service = { title: string; note: string; url: string; login?: boolean };
type Section = { id: string; label: string; services: Service[] };

const SECTIONS: Section[] = [
  {
    id: 'exams', label: 'Exams & results',
    services: [
      { title: 'Exam results and merit lists', note: 'Foundation, Inter and Final results with announcement dates.', url: 'https://icai.nic.in/' },
      { title: 'Exam forms and admit cards', note: 'Application forms, corrections and admit cards run through your SSP login.', url: 'https://eservices.icai.org/', login: true },
      { title: 'Exam FAQs', note: 'ICAI answers on exam rules, centres and papers (PDF).', url: 'https://icai-call-sahayata.icai.org/assets/pdf/FAQs-on-Examinations-.pdf' },
    ],
  },
  {
    id: 'study', label: 'Study',
    services: [
      { title: 'BoS Knowledge Portal', note: 'Syllabus, study material, RTPs, mock tests, live and recorded lectures, student journal.', url: 'https://boslive.icai.org/' },
      { title: 'Students home on icai.org', note: 'ICAI student announcements and service directory.', url: 'https://www.icai.org/students.shtml' },
      { title: 'Order printed study material (CDS)', note: 'Centralised Distribution System for books at your doorstep.', url: 'https://www.icai.org/post/publication-cds-directorate' },
    ],
  },
  {
    id: 'account', label: 'ICAI account',
    services: [
      { title: 'Self Service Portal (SSP)', note: 'Your ICAI account: registration, exam forms, fees, letters and requests.', url: 'https://eservices.icai.org/', login: true },
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
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>ICAI services</Text>
        <Text style={styles.headSub}>Relevant official ICAI services, in one place.</Text>
      </View>
      {SECTIONS.map((t) => (
        <View key={t.id} style={styles.section}>
          <Text style={styles.secTitle}>{t.label}</Text>
          <View style={styles.grid}>
            {t.services.map((s) => (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${s.title}. ${s.note}`}
                key={s.url}
                onPress={() => open(s.url)}
                style={styles.svcCell}
              >
                <Card style={styles.svc}>
                  <Text numberOfLines={2} style={styles.svcTitle}>{s.title}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <View style={styles.section}>
        <Text style={styles.secTitle}>Study tools in Cohort</Text>
        <View style={styles.grid}>
          <View style={styles.svcCell}>
            <Card style={styles.svc}>
              <Text numberOfLines={1} style={styles.svcTitle}>AI assistant</Text>
              <Text style={styles.soon}>Coming soon</Text>
            </Card>
          </View>
          <View style={styles.svcCell}>
            <Card style={styles.svc}>
              <Text numberOfLines={1} style={styles.svcTitle}>MCQ practice bank</Text>
              <Text style={styles.soon}>Coming soon</Text>
            </Card>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { gap: 1 },
  headSub: { color: colors.ink2, fontSize: 11, lineHeight: 14 },
  headTitle: { color: colors.ink, fontFamily: font.display, fontSize: 17, letterSpacing: -0.3 },
  page: { gap: 10, padding: 12, paddingBottom: 24 },
  section: { gap: 4 },
  secTitle: { color: colors.ink, fontFamily: font.display, fontSize: 13.5, letterSpacing: -0.2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  svcCell: { flexGrow: 0, flexShrink: 0, width: '31%' },
  svc: { borderRadius: 12, gap: 2, justifyContent: 'center', minHeight: 46, padding: 6 },
  svcTitle: { color: colors.ink, fontSize: 11, fontWeight: '600', lineHeight: 14 },
  soon: { color: colors.ink3, fontSize: 9.5, lineHeight: 12 },
});
