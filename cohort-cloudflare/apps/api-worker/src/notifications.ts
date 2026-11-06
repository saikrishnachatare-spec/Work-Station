/** Source0055 keyword semantics: comma/whitespace tokens, case-insensitive
 * substring match, one alert/job/member, active recipients, skip poster. */
export async function jobMatchStatements(db:D1Database,job:{id:string;role:string;firm:string;loc:string;tags:string[];posted_by:string}):Promise<D1PreparedStatement[]> {
  const {results}=await db.prepare("SELECT p.user_id,p.keywords FROM job_alert_prefs p JOIN profiles u ON u.id=p.user_id WHERE u.status='active' AND p.user_id<>?").bind(job.posted_by).all<{user_id:string;keywords:string}>();
  const hay=`${job.role} ${job.firm} ${job.loc} ${job.tags.join(' ')}`.toLowerCase();
  return results.filter(p=>p.keywords.toLowerCase().split(/[,\s]+/).some(k=>k && hay.includes(k))).map(p=>
    db.prepare(`INSERT OR IGNORE INTO notifications(id,user_id,kind,title,body,link,dedupe_key)
      SELECT ?,?,'job_match','New opening matches your alerts',?,?,? WHERE EXISTS(SELECT 1 FROM profiles WHERE id=? AND status='active')`)
      .bind(crypto.randomUUID(),p.user_id,`${job.role}${job.firm?' at '+job.firm:''}${job.loc?' - '+job.loc:''}`.slice(0,500),`/job?id=${job.id}`,`jobmatch:${job.id}:${p.user_id}`,p.user_id));
}
