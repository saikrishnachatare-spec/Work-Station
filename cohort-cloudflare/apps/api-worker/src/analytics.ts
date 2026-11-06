import type { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings,Caller,Profile } from './index';
type C=Context<{Bindings:Bindings}>;
type Helpers={getCaller:(c:C)=>Promise<Caller|null>;getProfile:(db:D1Database,id:string)=>Promise<Profile|null>;isAdmin:(p:Profile|null)=>boolean};
const recent:Record<string,string>={
 profiles:"id,full_name,role,status,account_type,course,level,org_name,(verified_at IS NOT NULL) AS verified,created_at",
 posts:"id,author_name,kind,substr(body,1,140) AS excerpt,created_at",
 comments:"id,post_id,substr(body,1,140) AS excerpt,created_at",
 jobs:'id,role,firm,cat,loc,pay,status,created_at',
 applications:'id,job_id,user_id,status,created_at',groups:'id,name,purpose,member_count,created_at',
 resources:'id,title,course,subject,uploaded_by,created_at',student_notes:'id,title,subject,uploader_name,created_at',
 activity_log:'id,actor_name,action,entity_type,detail,created_at',error_logs:'id,substr(message,1,200) AS message,url,created_at',
 connections:'id,requester_id,addressee_id,status,created_at',communities:'id,name,created_at',verification_requests:'id,user_id,status,created_at',
 content_reports:'id,target_type,reason,status,created_at',notifications:'id,user_id,kind,title,(read_at IS NOT NULL) AS read,created_at',
 trash:'id,entity_table,entity_id,trashed_at'
};
export function registerAnalytics(app:Hono<{Bindings:Bindings}>,h:Helpers){
 const admin=async(c:C)=>{const a=await h.getCaller(c);return !!a?.cohortUserId && h.isAdmin(await h.getProfile(c.env.DB,a.cohortUserId));};
 app.post('/api/screen-views',async c=>{
  const a=await h.getCaller(c);if(!a)return c.json({error:'unauthorized'},401);
  if(!a.cohortUserId)return c.json({error:'forbidden'},403);
  const body=await c.req.json<{screen?:unknown}>().catch(()=>null);
  if(typeof body?.screen!=='string'||!body.screen||body.screen.length>60||!/^[a-z0-9/():_-]+$/.test(body.screen))return c.json({error:'invalid'},400);
  const me=await h.getProfile(c.env.DB,a.cohortUserId);if(!me)return c.json({error:'forbidden'},403);
  // The UPSERT and trigger insert are one statement, so two concurrent views
  // cannot both observe an empty rolling30min window.
  await c.env.DB.prepare(`INSERT INTO screen_view_windows(actor_id,screen,last_at) VALUES(?,?,datetime('now'))
    ON CONFLICT(actor_id,screen) DO UPDATE SET last_at=excluded.last_at WHERE last_at<=datetime('now','-30 minutes')`).bind(a.cohortUserId,body.screen).run();
  return c.json({ok:true});
 });
 app.get('/api/admin/db-overview',async c=>{
  if(!await admin(c))return c.json({error:'forbidden'},403);
  const {results:tables}=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all<{name:string}>();
  const counts=[];for(const t of tables){if(!/^[a-zA-Z0-9_]+$/.test(t.name))continue;const n=await c.env.DB.prepare(`SELECT count(*) n FROM "${t.name}"`).first<{n:number}>();counts.push({table:t.name,rows:n?.n??0});}
  return c.json({tables:counts});
 });
 app.get('/api/admin/db-recent/:table',async c=>{
  if(!await admin(c))return c.json({error:'forbidden'},403);
  const table=c.req.param('table');if(!Object.hasOwn(recent,table))return c.json({error:'invalid',reason:'table_not_available'},400);
  const {results}=await c.env.DB.prepare(`SELECT ${recent[table]} FROM ${table} ORDER BY ${table==='trash'?'trashed_at':'created_at'} DESC LIMIT 25`).all();
  return c.json({rows:results.map(r=>({...r,...(typeof r.detail==='string'?{detail:JSON.parse(r.detail)}:{})}))});
 });
 app.get('/api/admin/analytics',async c=>{
  if(!await admin(c))return c.json({error:'forbidden'},403);
  const db=c.env.DB;
  const one=async(sql:string)=>(await db.prepare(sql).first<{n:number}>())?.n??0;
  const all=async(sql:string)=>(await db.prepare(sql).all()).results;
  const real=`FROM activity_log a WHERE a.actor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM controlled_test_accounts t WHERE t.user_id=a.actor_id) AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=a.actor_id AND p.status<>'deleted')`;
  const eligible=`status<>'deleted' AND NOT EXISTS(SELECT 1 FROM controlled_test_accounts t WHERE t.user_id=profiles.id)`;
  const totals:Record<string,number>={};
  for(const t of ['posts','applications','resources','groups','messages'])totals[t]=await one(`SELECT count(*) n FROM ${t}`);
  totals.members=await one(`SELECT count(*) n FROM profiles WHERE ${eligible}`);
  totals.controlled_test_accounts=await one("SELECT count(*) n FROM profiles p JOIN controlled_test_accounts t ON t.user_id=p.id WHERE p.status<>'deleted'");
  totals.suspended=await one("SELECT count(*) n FROM profiles WHERE status='suspended'");totals.verified=await one("SELECT count(*) n FROM profiles WHERE verified_at IS NOT NULL AND status<>'deleted'");
  for(const status of ['open','closed'])totals['jobs_'+status]=await one(`SELECT count(*) n FROM jobs WHERE status='${status}'`);
  const funnel:Record<string,unknown>={scope:'Current applications only. Withdrawn/deleted rows are absent; this is a snapshot, not historical conversion.',total:totals.applications};
  for(const status of ['new','reviewed','shortlisted','rejected'])funnel[status]=await one(`SELECT count(*) n FROM applications WHERE status='${status}'`);
  const by_day=await all(`WITH RECURSIVE days(day) AS (SELECT date('now','-13 days') UNION ALL SELECT date(day,'+1 day') FROM days WHERE day<date('now')) SELECT day,(SELECT count(*) ${real} AND action='sign_in' AND date(created_at)=day) AS signins,(SELECT count(*) FROM profiles WHERE ${eligible} AND date(created_at)=day) AS new_members FROM days ORDER BY day`);
  const start=await db.prepare("SELECT min(created_at) log_since,min(CASE WHEN action='screen_view' THEN created_at END) screen_tracking_since FROM activity_log").first();
  return c.json({generated_at:new Date().toISOString(),...start,totals,funnel,by_day,basis:`Excludes ${totals.controlled_test_accounts} controlled test accounts and deleted members from member/activity product metrics. Audit events and content inventory are retained. Sign-in capture is not connected yet; zero is not proof of no sign-ins.`,
   active_members:{signin_7d:await one(`SELECT count(DISTINCT actor_id) n ${real} AND action='sign_in' AND created_at>=datetime('now','-7 days')`),signin_30d:await one(`SELECT count(DISTINCT actor_id) n ${real} AND action='sign_in' AND created_at>=datetime('now','-30 days')`)},
   screens:await all(`SELECT entity_id screen,count(*) views,count(DISTINCT actor_id) members ${real} AND action='screen_view' GROUP BY entity_id ORDER BY views DESC LIMIT 15`),
   per_job:await all("SELECT j.id,j.role,j.firm,j.status,count(a.id) applications,sum(CASE WHEN a.status='shortlisted' THEN 1 ELSE 0 END) shortlisted,sum(CASE WHEN a.status='rejected' THEN 1 ELSE 0 END) rejected,sum(CASE WHEN a.status='reviewed' THEN 1 ELSE 0 END) reviewed FROM jobs j LEFT JOIN applications a ON a.job_id=j.id GROUP BY j.id ORDER BY applications DESC,j.created_at DESC LIMIT 20"),
   top_posts:await all('SELECT id,substr(body,1,60) excerpt,author_name,like_count,comment_count FROM posts ORDER BY (like_count+comment_count) DESC,created_at DESC LIMIT 10'),
   groups_by_size:await all('SELECT g.id,g.name,g.member_count,(SELECT count(*) FROM threads t WHERE t.group_id=g.id) threads,(SELECT count(*) FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.group_id=g.id) messages FROM groups g ORDER BY member_count DESC LIMIT 20'),
   most_active:await all(`SELECT actor_id,COALESCE(NULLIF(max(actor_name),''),'Former member') name,count(*) events,max(created_at) last_active ${real} AND created_at>=datetime('now','-30 days') GROUP BY actor_id ORDER BY events DESC LIMIT 20`)});
 });
}
