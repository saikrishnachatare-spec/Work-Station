/** Offline draft builder only. No sender, schedule, provider or send endpoint.
 * Never include raw message/stack/URL/user identifiers in email drafts.
 */
export type DigestError={message:string;created_at:string};
export function errorDigest(rows:DigestError[],start:string,end:string){
 const a=Date.parse(start),b=Date.parse(end);
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw new Error('invalid_window');
 const counts:Record<string,number>={network:0,authentication:0,storage:0,other:0};
 let total=0;
 for(const row of rows){
  const t=Date.parse(row.created_at.includes('T')?row.created_at:row.created_at.replace(' ','T')+'Z');
  if(!Number.isFinite(t)||t<a||t>=b)continue;
  const m=row.message.toLowerCase();
  const category=/network|timeout|fetch/.test(m)?'network':/unauthor|forbidden|token/.test(m)?'authentication':/storage|upload|download/.test(m)?'storage':'other';
  counts[category]++;total++;
 }
 return {start:new Date(a).toISOString(),end:new Date(b).toISOString(),total,categories:counts,
  subject:`Cohort test preview: ${total} recorded errors`,
  text:`Cohort test-preview error summary\nWindow: ${new Date(a).toISOString()} to ${new Date(b).toISOString()} (end exclusive)\nRecorded errors: ${total}\n`+Object.entries(counts).map(([k,n])=>`${k}: ${n}`).join('\n')+'\nCategories are heuristic. Counts represent recorded rows, not affected users or unique incidents. Raw diagnostics remain in the admin panel.'};
}
