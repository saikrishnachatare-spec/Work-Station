import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Pill, ScreenHeader, SectionTitle } from '@/components/ScreenBits';
import { AI_ANSWERS, PEOPLE, QUIZ, SERVICES } from '@/lib/demo-data';
import { colors, radius, spacing, type as typeScale } from '@/theme';

type ChatMsg = { from: 'ai' | 'you'; text: string };

function AiAssistant() {
  const [chat, setChat] = useState<ChatMsg[]>([
    { from: 'ai', text: 'Hi! Ask me to summarize a topic or clear a concept.' },
  ]);
  const [draft, setDraft] = useState('');
  const ask = (chip: string) =>
    setChat((c) => [...c, { from: 'you', text: chip }, { from: 'ai', text: AI_ANSWERS[chip] }]);
  const askFree = () => {
    const t = draft.trim();
    if (!t) return;
    setChat((c) => [...c, { from: 'you', text: t }, {
      from: 'ai',
      text: `Here is a short summary of "${t}": the key idea, the rule in one line, and a quick example you can write in the exam. (Demo reply. The live app will answer with a real AI.)`,
    }]);
    setDraft('');
  };

  return (
    <Card>
      <View style={styles.aiHead}>
        <View style={styles.botAvatar}><Ionicons color="#fff" name="hardware-chip-outline" size={18} /></View>
        <View>
          <Text style={styles.strong}>Cohort AI</Text>
          <Text style={styles.meta}>🟢 Study bot · online</Text>
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        {chat.map((m, i) =>
          m.from === 'ai' ? (
            <View key={i} style={styles.botRow}>
              <View style={styles.botAvatarSm}><Ionicons color="#fff" name="hardware-chip-outline" size={12} /></View>
              <Text style={[styles.bubble, styles.bubbleAi]}>{m.text}</Text>
            </View>
          ) : (
            <Text key={i} style={[styles.bubble, styles.bubbleYou]}>{m.text}</Text>
          ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {Object.keys(AI_ANSWERS).map((chip) => (
          <Pressable key={chip} onPress={() => ask(chip)} style={styles.aiChip}>
            <Text style={styles.aiChipText}>{chip}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          onChangeText={setDraft}
          onSubmitEditing={askFree}
          placeholder="Ask any topic or concept…"
          placeholderTextColor={colors.ink3}
          returnKeyType="send"
          style={styles.input}
          value={draft}
        />
        <Pressable accessibilityLabel="Ask" onPress={askFree} style={styles.sendBtn}>
          <Ionicons color="#fff" name="send" size={15} />
        </Pressable>
      </View>
    </Card>
  );
}

function McqPractice() {
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = QUIZ[qi];
  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.correct) setScore((s) => s + 1);
  };
  const next = () => {
    if (qi + 1 >= QUIZ.length) setDone(true);
    else { setQi((x) => x + 1); setPicked(null); }
  };
  const restart = () => { setQi(0); setPicked(null); setScore(0); setDone(false); };

  return (
    <Card>
      <View style={styles.quizTop}>
        <Pill label="CA Final · FR & Audit" />
        <Text style={styles.meta}>{done ? `Score ${score}/${QUIZ.length}` : `Q${qi + 1} of ${QUIZ.length}`}</Text>
      </View>
      {done ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>You scored {score} out of {QUIZ.length}.</Text>
          <Text style={styles.meta}>
            {score === QUIZ.length ? 'Full marks. Keep the streak going.' : 'Good attempt. Review the ones you missed and try again.'}
          </Text>
          <Pressable onPress={restart} style={styles.btn}><Text style={styles.btnText}>Restart practice</Text></Pressable>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.strong}>{q.q}</Text>
          {q.options.map((o, i) => (
            <Pressable
              key={i}
              onPress={() => pick(i)}
              style={[
                styles.opt,
                picked !== null && i === q.correct && styles.optCorrect,
                picked !== null && i === picked && i !== q.correct && styles.optWrong,
              ]}
            >
              <Text style={styles.optText}>{o}</Text>
            </Pressable>
          ))}
          {picked !== null && (
            <View style={styles.quizFoot}>
              <Text style={styles.meta}>
                {picked === q.correct ? 'Correct.' : `Not quite. The answer is "${q.options[q.correct]}".`}
              </Text>
              <Pressable onPress={next} style={styles.btn}>
                <Text style={styles.btnText}>{qi + 1 >= QUIZ.length ? 'See score' : 'Next question'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

export function IcaiScreen() {
  const [svc, setSvc] = useState<string | null>(null);
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader sub="Services, concept help, practice and your network." title="ICAI module" />

      <SectionTitle first title="ICAI services" />
      <View style={styles.svcGrid}>
        {SERVICES.map((x) => (
          <Pressable
            key={x.label}
            onPress={() => setSvc(svc === x.label ? null : x.label)}
            style={[styles.svc, svc === x.label && styles.svcOn]}
          >
            <Ionicons color={colors.brand} name={x.icon as never} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.svcLabel}>{x.label}</Text>
              <Text style={styles.svcSub}>{x.sub}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {svc && <Text style={styles.noteOk}>{svc}: this opens the ICAI service inside the app (demo).</Text>}

      <SectionTitle title="AI assistant: summaries and concept clarity" />
      <AiAssistant />

      <SectionTitle title="MCQ practice" />
      <McqPractice />

      <SectionTitle title="Connect with people" />
      {PEOPLE.map((p) => (
        <Card key={p.name} style={styles.person}>
          <Avatar name={p.name} />
          <View style={{ flex: 1 }}>
            <Text style={styles.strong}>{p.name}</Text>
            <Text style={styles.meta}>{p.role}</Text>
          </View>
          <Pressable
            onPress={() => setConnected((c) => ({ ...c, [p.name]: !c[p.name] }))}
            style={[styles.btnSlim, connected[p.name] && styles.btnDone]}
          >
            <Text style={[styles.btnSlimText, connected[p.name] && styles.btnTextDone]}>
              {connected[p.name] ? 'Requested' : 'Connect'}
            </Text>
          </Pressable>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: 120 },
  svcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  svc: {
    alignItems: 'center', backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.tile, borderWidth: 1, flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: 10, paddingVertical: 10, width: '48%', flexGrow: 1, flexBasis: '45%',
  },
  svcOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  svcLabel: { ...typeScale.caption, color: colors.ink, fontWeight: '600' },
  svcSub: { fontSize: 10, color: colors.ink3 },
  noteOk: {
    ...typeScale.caption, backgroundColor: '#eef4ec', borderRadius: radius.input,
    color: '#3f6440', overflow: 'hidden', padding: 10,
  },
  aiHead: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  botAvatar: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: 18,
    height: 36, justifyContent: 'center', width: 36,
  },
  botAvatarSm: {
    alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.brand,
    borderRadius: 12, height: 24, justifyContent: 'center', marginTop: 2, width: 24,
  },
  botRow: { flexDirection: 'row', gap: 6 },
  bubble: { ...typeScale.body, borderRadius: 14, overflow: 'hidden', padding: 10 },
  bubbleAi: { backgroundColor: colors.raised, color: colors.ink, flex: 1 },
  bubbleYou: { alignSelf: 'flex-end', backgroundColor: colors.brand, color: '#fff', maxWidth: '85%' },
  aiChip: {
    backgroundColor: colors.card, borderColor: '#e7d9cf', borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
  },
  aiChipText: { ...typeScale.caption, color: colors.ink2, fontWeight: '500' },
  composer: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  input: {
    ...typeScale.body, backgroundColor: colors.card, borderColor: colors.lineWarm,
    borderRadius: radius.input, borderWidth: 1, color: colors.ink, flex: 1,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  sendBtn: {
    alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill,
    height: 36, justifyContent: 'center', width: 36,
  },
  quizTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  opt: {
    backgroundColor: colors.card, borderColor: colors.lineWarm, borderRadius: radius.input,
    borderWidth: 1, padding: 11,
  },
  optCorrect: { backgroundColor: '#eef4ec', borderColor: '#6f9a6f' },
  optWrong: { backgroundColor: '#f9ece9', borderColor: colors.brand },
  optText: { ...typeScale.body, color: colors.ink },
  quizFoot: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  btn: {
    alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  btnText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  btnSlim: {
    backgroundColor: colors.brand, borderColor: colors.brand, borderRadius: radius.pill,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
  },
  btnDone: { backgroundColor: colors.card },
  btnSlimText: { ...typeScale.caption, color: '#fff', fontWeight: '600' },
  btnTextDone: { color: colors.brand },
  person: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  strong: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
  meta: { ...typeScale.caption, color: colors.ink3 },
});
