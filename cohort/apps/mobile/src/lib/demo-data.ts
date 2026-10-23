/**
 * Demo content for the Cohort app, ported from the clickable prototype.
 * All names, firms, posts and openings are made-up sample data.
 */

export type FeedItem = {
  id: string;
  type: 'announcement' | 'post' | 'message';
  author: string;
  role: string;
  time: string;
  pinned?: boolean;
  text: string;
  likes: number;
  comments: number;
};

export const FEED: FeedItem[] = [
  { id: 'f1', type: 'announcement', author: 'Board of Studies', role: 'Official', time: '2h ago', pinned: true, text: 'Nov 2026 exam schedule for CA Final and CA Inter is out. Exam forms, dates and admit cards are linked in the ICAI module.', likes: 312, comments: 45 },
  { id: 'f2', type: 'post', author: 'Ananya Reddy', role: 'CA Final', time: '1h ago', text: 'Cleared CA Inter Group 2 today! Uploading my FR and AFM notes to Resources. Happy to help anyone starting their prep.', likes: 214, comments: 38 },
  { id: 'f3', type: 'post', author: 'Rohan Mehta', role: 'CMA Inter', time: '3h ago', text: 'Anyone writing CMA Inter this December from Hyderabad? Starting a weekend study group for Cost Accounting. Message me if you are in.', likes: 56, comments: 21 },
  { id: 'f4', type: 'message', author: 'CA Priya Sharma', role: 'Mentor', time: '5h ago', text: 'Mentor broadcast: free Direct Tax revision marathon this Sunday at 10 AM. The session link is pinned in Resources under Videos.', likes: 98, comments: 12 },
  { id: 'f5', type: 'post', author: 'Arjun Desai', role: 'CS Executive', time: '8h ago', text: 'Condensed the latest Company Law amendments into 4 pages for the December attempt. Uploaded to Resources, hope it helps.', likes: 143, comments: 17 },
];
export const FEED_FILTERS = ['All', 'Posts', 'Announcements', 'Messages'];

export type Read = { kind: string; title: string; sum: string; mins: number };
export const READS: Read[] = [
  { kind: 'Study plan', title: 'Nov 2026 attempt: a 12-week study plan', sum: 'A week-by-week split for CA Final and Inter that balances classes, revision and mock tests. Adjust the weeks to your own dates.', mins: 2 },
  { kind: 'Tax basics', title: 'GSTR-3B late fees, explained', sum: 'How the late fee is computed, when the waiver windows usually open, and the checklist for filing pending returns.', mins: 3 },
  { kind: 'Quick revision', title: 'Ind AS 115 in five steps', sum: 'The revenue model on one page: contract, obligations, price, allocation, recognition. Perfect for a pre-class refresh.', mins: 3 },
  { kind: 'Exam tip', title: 'Case-study MCQs in Direct Tax', sum: 'Read the requirement first, then the facts. A 4-minute guide on how examiners hide the one detail that changes the answer.', mins: 4 },
  { kind: 'Amendment', title: 'Company Law: CSR thresholds updated', sum: 'What changed, who it applies to, and three likely exam questions. For CS Executive and CA Final Law.', mins: 3 },
  { kind: 'Case law', title: 'ITC on canteen services: the latest ruling', sum: 'A short, plain-language summary of the ruling and what it means for blocked credits.', mins: 5 },
  { kind: 'Concept clarity', title: 'Deferred tax, finally intuitive', sum: 'Timing gaps, reversing differences, and the one test that tells you when deferred tax applies.', mins: 3 },
  { kind: 'Mentor note', title: 'What examiners check in Audit answers', sum: 'CA Priya Sharma on the three things that earn marks: the SA reference, the fact link, and a clear conclusion.', mins: 4 },
  { kind: 'Career', title: '6 questions firms ask in articleship interviews', sum: 'Collected from 40 recent interviews at mid-size firms, with sample answers that worked.', mins: 4 },
  { kind: 'Routine', title: 'A 45-minute daily revision routine', sum: 'Spaced repetition without apps or gadgets: the simple split seniors swear by before mocks.', mins: 2 },
];

export type Resource = { id: string; cat: string; course: string; title: string; by: string; meta: string };
export const RESOURCES: Resource[] = [
  { id: 'r1', cat: 'Notes', course: 'CA Final', title: 'Ind AS 115 quick revision notes', by: 'Ananya Reddy', meta: 'PDF · 12 pages · 2.1k downloads' },
  { id: 'r2', cat: 'Notes', course: 'CA Inter', title: 'Audit SA series mind maps', by: 'Kiran Kumar', meta: 'PDF · 8 pages · 1.4k downloads' },
  { id: 'r3', cat: 'Notes', course: 'CMA Inter', title: 'Cost Accounting formulas one-pager', by: 'Kavya Nair', meta: 'PDF · 2 pages · 980 downloads' },
  { id: 'r4', cat: 'Question papers', course: 'CA Inter', title: 'Nov 2025 papers with suggested answers', by: 'Cohort team', meta: 'PDF · 6 papers · 3.3k downloads' },
  { id: 'r5', cat: 'Videos', course: 'CS Executive', title: 'Company Law amendments, explained', by: 'CA Priya Sharma', meta: 'Video · 45 min · 760 views' },
  { id: 'r6', cat: 'RTP & MTP', course: 'CA Final', title: 'RTP compilation, Direct Tax', by: 'Cohort team', meta: 'PDF · 2 attempts · 1.1k downloads' },
];
export const RESOURCE_FILTERS = ['All', 'Notes', 'Question papers', 'Videos', 'RTP & MTP'];
export const SAMPLE_KINDS = [
  { cat: 'Notes', meta: 'PDF · 14 pages', by: 'Ananya Reddy' },
  { cat: 'Question papers', meta: 'PDF · last 5 attempts', by: 'Cohort team' },
  { cat: 'Videos', meta: 'Video · 38 min', by: 'CA Priya Sharma' },
  { cat: 'RTP & MTP', meta: 'PDF · 2 sets', by: 'Cohort team' },
];

export type SubjectGroup = { group: string; subjects: string[] };
export const COURSES = ['CA', 'CMA', 'CS'];
export const LEVELS: Record<string, string[]> = {
  CA: ['Foundation', 'Inter', 'Final'],
  CMA: ['Foundation', 'Inter', 'Final'],
  CS: ['Foundation', 'Executive', 'Professional'],
};
export const SUBJECTS: Record<string, SubjectGroup[][]> = {
  CA: [
    [{ group: 'Papers 1 to 4', subjects: ['Accounting', 'Business Laws', 'Quantitative Aptitude', 'Business Economics'] }],
    [{ group: 'Group 1', subjects: ['Advanced Accounting', 'Corporate and Other Laws', 'Taxation'] }, { group: 'Group 2', subjects: ['Cost and Management Accounting', 'Auditing and Ethics', 'Financial Management and Strategic Management'] }],
    [{ group: 'Group 1', subjects: ['Financial Reporting', 'Advanced Financial Management', 'Advanced Auditing'] }, { group: 'Group 2', subjects: ['Direct Tax Laws', 'Indirect Tax Laws', 'Integrated Business Solutions'] }],
  ],
  CMA: [
    [{ group: 'Papers 1 to 4', subjects: ['Business Laws and Communication', 'Financial and Cost Accounting', 'Business Mathematics and Statistics', 'Business Economics and Management'] }],
    [{ group: 'Group 1', subjects: ['Business Laws and Ethics', 'Financial Accounting', 'Direct and Indirect Taxation', 'Cost Accounting'] }, { group: 'Group 2', subjects: ['Operations and Strategic Management', 'Corporate Accounting and Auditing', 'Financial Management and Data Analytics'] }],
    [{ group: 'Group 3', subjects: ['Corporate and Economic Laws', 'Strategic Financial Management', 'Direct Tax and International Taxation', 'Strategic Cost Management'] }, { group: 'Group 4', subjects: ['Cost and Management Audit', 'Corporate Financial Reporting', 'Indirect Tax Laws and Practice', 'Strategic Performance Management'] }],
  ],
  CS: [
    [{ group: 'Papers 1 to 4', subjects: ['Business Environment and Law', 'Business Management and Ethics', 'Business Economics', 'Accounting and Auditing'] }],
    [{ group: 'Module 1', subjects: ['Jurisprudence and General Laws', 'Company Law', 'Setting up of Business Entities', 'Tax Laws'] }, { group: 'Module 2', subjects: ['Corporate and Management Accounting', 'Securities Laws and Capital Markets', 'Economic and Commercial Laws'] }],
    [{ group: 'Module 1', subjects: ['Governance, Risk and Ethics', 'Advanced Tax Laws', 'Drafting and Appearances'] }, { group: 'Module 2', subjects: ['Secretarial Audit and Due Diligence', 'Corporate Restructuring and Insolvency'] }],
  ],
};

export type Job = { id: string; cat: string; firm: string; role: string; loc: string; pay: string; tags: string[] };
export const JOBS: Job[] = [
  { id: 'j1', cat: 'Articleship', firm: 'Sen & Rao LLP', role: 'Articleship, statutory audit', loc: 'Hyderabad', pay: '₹8,000/month', tags: ['Statutory audit', 'Tax audit'] },
  { id: 'j2', cat: 'Articleship', firm: 'Mehta & Associates', role: 'Articleship, direct tax', loc: 'Chennai', pay: '₹7,500/month', tags: ['Income tax', 'Appeals'] },
  { id: 'j3', cat: 'Industrial training', firm: 'Amber Textiles Ltd', role: 'Industrial trainee, finance', loc: 'Mumbai', pay: '₹15,000/month', tags: ['CA Final', '9 months'] },
  { id: 'j4', cat: 'Gig work', firm: 'Sunny & Co.', role: 'GST return season assistant', loc: 'Remote', pay: '₹6,000/month', tags: ['3 months', 'GSTR-1 & 3B'] },
  { id: 'j5', cat: 'Jobs', firm: 'VedaTax Advisors', role: 'Accounts executive, semi-qualified', loc: 'Bengaluru', pay: '₹4.2 LPA', tags: ['CA Inter', 'Full-time'] },
  { id: 'j6', cat: 'Jobs', firm: 'Deccan Pharma', role: 'Costing trainee', loc: 'Hyderabad', pay: '₹3.6 LPA', tags: ['CMA Inter', 'Full-time'] },
];
export const JOB_FILTERS = ['All', 'Articleship', 'Jobs', 'Gig work', 'Industrial training'];

export type Service = { icon: string; label: string; sub: string };
export const SERVICES: Service[] = [
  { icon: 'document-text-outline', label: 'Exam form', sub: 'Fill and pay' },
  { icon: 'card-outline', label: 'Admit card', sub: 'Download hall ticket' },
  { icon: 'school-outline', label: 'Results', sub: 'Check your marks' },
  { icon: 'notifications-outline', label: 'Announcements', sub: 'Official notices' },
  { icon: 'book-outline', label: 'Study material', sub: 'Modules and BoS' },
  { icon: 'person-outline', label: 'SSP portal', sub: 'Student services' },
  { icon: 'list-outline', label: 'Syllabus', sub: 'Subject-wise scope' },
  { icon: 'create-outline', label: 'Mock test papers', sub: 'Attempt and review' },
  { icon: 'albums-outline', label: 'RTP / MTP', sub: 'Revision and mock' },
  { icon: 'calendar-outline', label: 'Important dates', sub: 'Exam and form dates' },
  { icon: 'briefcase-outline', label: 'Articleship', sub: 'Registration, transfer' },
  { icon: 'ribbon-outline', label: 'Membership', sub: 'Join, renew, certificate' },
  { icon: 'location-outline', label: 'Exam centres', sub: 'Choose or change' },
  { icon: 'help-circle-outline', label: 'Helpdesk', sub: 'Raise a query' },
];

export type GroupItem = { id: string; name: string; purpose: string; members: number; desc: string; mine: boolean };
export const GROUPS: GroupItem[] = [
  { id: 'g1', name: 'CA Final Nov 2026 exam form help', purpose: 'Exam form', members: 1240, desc: 'Form dates, fee doubts and centre changes.', mine: true },
  { id: 'g2', name: 'Hyderabad CMA Inter study circle', purpose: 'Study group', members: 86, desc: 'Weekend Cost Accounting sessions.', mine: true },
  { id: 'g3', name: 'Articleship seekers 2026', purpose: 'Professional', members: 2310, desc: 'Share openings, firm reviews and interview tips.', mine: false },
  { id: 'g4', name: 'CS Executive Company Law', purpose: 'Study group', members: 540, desc: 'Amendments, case laws and doubt threads.', mine: false },
  { id: 'g5', name: 'Practicing CAs and students', purpose: 'Professional', members: 420, desc: 'Ask practising CAs about real work.', mine: false },
  { id: 'g6', name: 'GST return season gigs', purpose: 'Professional', members: 780, desc: 'Gig work leads and filing tips.', mine: false },
];

export type Person = { name: string; role: string; kind: string };
export const PEOPLE: Person[] = [
  { name: 'CA Priya Sharma', role: 'Practicing CA · 8 yrs', kind: 'Mentor' },
  { name: 'CA Vikram Krishnan', role: 'Partner, Sen & Rao LLP', kind: 'Firm' },
  { name: 'Ananya Reddy', role: 'CA Final', kind: 'Peer' },
  { name: 'Kavya Nair', role: 'CMA Final', kind: 'Peer' },
  { name: 'Arjun Desai', role: 'CS Professional', kind: 'Peer' },
];

export const AI_ANSWERS: Record<string, string> = {
  'Summarize Ind AS 115': 'Ind AS 115 in one minute: revenue is recognised when control of goods or services passes to the customer, in the amount you expect to receive. Five steps: identify the contract, identify the performance obligations, set the transaction price, allocate it to the obligations, then recognise revenue as each obligation is met. Example: a one-year maintenance contract billed upfront is recognised monthly, not on day one.',
  'Explain input tax credit': 'Input tax credit lets you reduce the GST you collect on sales by the GST you already paid on purchases. You can claim it when you hold the invoice, the goods or services are received, the supplier has filed their returns, and the tax has reached the government. Blocked credits include motor vehicles (with exceptions) and food or personal use.',
  'Concept clarity: Deferred tax': 'Think of deferred tax as a timing gap. Accounting profit and taxable profit differ today but will match over time. If you pay less tax now because of depreciation timing, you owe it later, so you show a deferred tax liability. Quick test: does the difference reverse in future? If yes, it is a timing difference and deferred tax applies.',
  '7-day Audit revision plan': 'A 7-day Audit sprint: Days 1-2 cover SA 200-299 (planning and evidence). Day 3 is SA 300-450 (risk and materiality). Day 4 is SA 500-580 (evidence specifics). Day 5 is SA 600-720 (group audits and reporting). Day 6 is professional ethics and company audit. Day 7: one full mock paper, then review every wrong answer.',
};

export type QuizQ = { q: string; options: string[]; correct: number };
export const QUIZ: QuizQ[] = [
  { q: 'Under Ind AS 115, when is revenue from a one-year maintenance contract billed upfront recognised?', options: ['In full when invoiced', 'Monthly, as the service is performed', 'When the customer pays', 'At the end of the year'], correct: 1 },
  { q: 'SA 315 deals with:', options: ['Audit evidence', 'Audit sampling', 'Identifying and assessing the risk of material misstatement', 'Going concern'], correct: 2 },
  { q: 'Input tax credit cannot be claimed on:', options: ['Office laptops', 'Raw material for taxable goods', 'Food for personal use', 'Audit fees'], correct: 2 },
];

export type ThreadMsg = { from: 'you' | 'them'; text: string };
export type Thread = { id: string; name: string; role: string; preview: string; unread: number; thread: ThreadMsg[] };
export const THREADS: Thread[] = [
  {
    id: 'priya', name: 'CA Priya Sharma', role: 'Mentor · Practicing CA', preview: 'Sunday revision marathon at 10 AM. Bring your RTP doubts.', unread: 2,
    thread: [
      { from: 'them', text: 'Hi Aarav! Saw your post about DT revision. Join the marathon this Sunday, 10 AM.' },
      { from: 'them', text: 'Bring your RTP doubts, we will solve them live.' },
      { from: 'you', text: "Thank you ma'am! I will be there. Should I finish SA 540 before then?" },
      { from: 'them', text: 'Yes, and skim the case studies from the last two attempts.' },
    ],
  },
  {
    id: 'ananya', name: 'Ananya Reddy', role: 'CA Final', preview: 'Sending the Ind AS notes now', unread: 0,
    thread: [
      { from: 'you', text: 'Congrats on Group 2! Could you share the Ind AS 115 notes?' },
      { from: 'them', text: 'Thank you! Sending the Ind AS notes now, check Resources in 10 minutes.' },
      { from: 'you', text: 'You are the best, thanks!' },
    ],
  },
  {
    id: 'senrao', name: 'Sen & Rao LLP', role: 'CA firm', preview: 'Your articleship application was viewed', unread: 1,
    thread: [
      { from: 'them', text: 'Your articleship application was viewed by our HR team.' },
      { from: 'them', text: 'Shortlisted candidates hear back within a week. All the best!' },
      { from: 'you', text: 'Thank you for the update.' },
    ],
  },
];

/** Demo users for the admin panel. Admin access is grant-only, never self-serve. */
export type DemoUser = { id: string; name: string; detail: string; role: 'admin' | 'user'; status: 'active' | 'suspended' };
export const USERS: DemoUser[] = [
  { id: 'u1', name: 'Chatare Saikrishna', detail: 'Founder · first admin', role: 'admin', status: 'active' },
  { id: 'u2', name: 'Ananya Reddy', detail: 'CA Final', role: 'user', status: 'active' },
  { id: 'u3', name: 'Rohan Mehta', detail: 'CMA Inter', role: 'user', status: 'active' },
  { id: 'u4', name: 'CA Priya Sharma', detail: 'Mentor · Practicing CA', role: 'user', status: 'active' },
  { id: 'u5', name: 'Arjun Desai', detail: 'CS Executive', role: 'user', status: 'active' },
  { id: 'u6', name: 'Kavya Nair', detail: 'CMA Final', role: 'user', status: 'active' },
  { id: 'u7', name: 'Vikram Krishnan', detail: 'Partner, Sen & Rao LLP', role: 'user', status: 'active' },
];

