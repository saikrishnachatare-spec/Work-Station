import type { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Caller, Profile } from './index';

type C = Context<{ Bindings: Bindings }>;
type Helpers = {
  getCaller: (c: C) => Promise<Caller | null>;
  getProfile: (db: D1Database, id: string) => Promise<Profile | null>;
  isAdmin: (p: Profile | null) => boolean;
  isActiveMember: (p: Profile | null) => boolean;
};
export type FileRow = { bucket: string; path: string; owner_id: string; state: string; mime_type: string; byte_size: number };
const buckets = ['resources', 'student-notes', 'resumes', 'post-images'];
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const objectKey = (bucket: string, path: string) => `${bucket}/${path}`;
export function validFilePath(path: string): boolean {
  // Every new object is a single file inside the mapped owner's folder.
  return /^[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(path) && !path.includes('..');
}
export async function readyFile(db: D1Database, bucket: string, path: string, owner?: string): Promise<boolean> {
  if (!validFilePath(path)) return false;
  const row = await db.prepare("SELECT owner_id FROM file_objects WHERE bucket=? AND path=? AND state='ready'").bind(bucket, path).first<{owner_id:string}>();
  return !!row && (!owner || row.owner_id === owner);
}
// Byte deletion precedes ledger tombstone. Failure leaves an explicit deleting
// record; retry is idempotent. R2/D1 are not a distributed transaction.
export async function deleteFile(env: Bindings, bucket: string, path: string): Promise<boolean> {
  if (!env.FILES || !validFilePath(path)) return false;
  const row = await env.DB.prepare('SELECT state FROM file_objects WHERE bucket=? AND path=?').bind(bucket,path).first();
  // A legacy path absent from this new ledger cannot be declared cleaned.
  if (!row) return false;
  if ((row as {state:string}).state==='deleted') return true;
  await env.DB.prepare("UPDATE file_objects SET state='deleting' WHERE bucket=? AND path=?").bind(bucket,path).run();
  try {
    await env.FILES.delete(objectKey(bucket,path));
    if (await env.FILES.head(objectKey(bucket,path))) return false;
    await env.DB.prepare("UPDATE file_objects SET state='deleted' WHERE bucket=? AND path=?").bind(bucket,path).run();
    return true;
  } catch { return false; }
}

export function registerStorage(app: Hono<{Bindings:Bindings}>, h: Helpers) {
  app.put('/api/files/:bucket', async (c) => {
    const bucket=c.req.param('bucket'), path=c.req.query('path') ?? '';
    if (!buckets.includes(bucket) || !validFilePath(path)) return c.json({error:'invalid',reason:'file_path'},400);
    const caller=await h.getCaller(c);
    if (!caller) return c.json({error:'unauthorized'},401);
    if (!caller.cohortUserId) return c.json({error:'forbidden',reason:'no_mapped_user'},403);
    const uid=caller.cohortUserId;
    if (path.split('/')[0]!==uid) return c.json({error:'forbidden',reason:'owner_mismatch'},403);
    const me=await h.getProfile(c.env.DB,uid);
    const avatar=path.split('/')[1].startsWith('avatar-');
    if (bucket==='resources' ? !(h.isAdmin(me) || (avatar && h.isActiveMember(me))) : !h.isActiveMember(me))
      return c.json({error:'forbidden',reason:'upload_not_allowed'},403);
    if (!c.env.FILES) return c.json({error:'unavailable',reason:'storage_not_configured'},503);
    const mime=(c.req.header('Content-Type') ?? '').split(';')[0].toLowerCase();
    const allowed=bucket==='resumes' ? ['application/pdf'] : bucket==='post-images' ? imageTypes : ['application/pdf',...imageTypes];
    if (!allowed.includes(mime)) return c.json({error:'invalid',reason:'mime_type'},415);
    // 10MB is the app upload limit for notes/images; resumes are5MB.
    const max=bucket==='resumes' ? 5*1024*1024 : 10*1024*1024;
    const claimed=Number(c.req.header('Content-Length') ?? 0);
    if (claimed>max) return c.json({error:'invalid',reason:'file_too_large'},413);
    const reader=c.req.raw.body?.getReader();
    if (!reader) return c.json({error:'invalid',reason:'empty_file'},400);
    const chunks:Uint8Array[]=[];let length=0;
    while (true) {
      const {done,value}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>max){await reader.cancel();return c.json({error:'invalid',reason:'file_too_large'},413);}
      chunks.push(value);
    }
    if (!length) return c.json({error:'invalid',reason:'empty_file'},400);
    const bytes=new Uint8Array(length);let offset=0;for(const v of chunks){bytes.set(v,offset);offset+=v.length;}
    const prefix = String.fromCharCode(...bytes.slice(0,12));
    const signatureOk = mime === 'application/pdf' ? prefix.startsWith('%PDF-') :
      mime === 'image/png' ? bytes[0]===137 && prefix.slice(1,4)==='PNG' :
      mime === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 :
      prefix.startsWith('RIFF') && prefix.slice(8,12)==='WEBP';
    if (!signatureOk) return c.json({error:'invalid',reason:'content_type_mismatch'},415);
    // Reserve first, so pending writes count toward the resume10/day cap.
    // No overwrite endpoint: generated unique names keep object replacement
    // separate from metadata references. Collision returns409.
    try {
      const r=await c.env.DB.prepare(`INSERT INTO file_objects(bucket,path,owner_id,mime_type,byte_size,state)
        SELECT ?,?,?,?,?,'pending' WHERE ? <> 'resumes' OR
        (SELECT count(*) FROM file_objects WHERE bucket='resumes' AND state<>'deleted' AND owner_id=? AND created_at>datetime('now','-1 day'))<10`)
        .bind(bucket,path,uid,mime,length,bucket,uid).run();
      if (!r.meta.changes) return c.json({error:'rate_limited',reason:'resume_uploads_10_per_day'},429);
    } catch { return c.json({error:'conflict',reason:'path_exists'},409); }
    try {
      await c.env.FILES.put(objectKey(bucket,path),bytes,{httpMetadata:{contentType:mime}});
      const stored=await c.env.FILES.head(objectKey(bucket,path));
      if (!stored || stored.size!==length) throw new Error('size_mismatch');
      const committed=await c.env.DB.prepare("UPDATE file_objects SET state='ready' WHERE bucket=? AND path=? AND state='pending'").bind(bucket,path).run();
      if (!committed.meta.changes) {
        // Cleanup won the race. Never resurrect a deleting/deleted upload.
        await c.env.FILES.delete(objectKey(bucket,path));
        return c.json({error:'conflict',reason:'upload_cancelled'},409);
      }
      return c.json({path,bucket,byte_size:length,mime_type:mime},201);
    } catch {
      // Keep pending ledger row so a failed upload is visible and deletable,
      // not an invisible orphan. Never report ready on unknown outcome.
      return c.json({error:'storage_write_failed',reason:'pending_cleanup_required'},502);
    }
  });
  app.get('/api/files/:bucket', async (c) => {
    const bucket=c.req.param('bucket'),path=c.req.query('path')??'';
    if (!buckets.includes(bucket)||!validFilePath(path))return c.json({error:'invalid',reason:'file_path'},400);
    const caller=await h.getCaller(c);
    if (!['post-images','student-notes'].includes(bucket) && !caller)return c.json({error:'unauthorized'},401);
    if(bucket==='resumes') {
      if(!caller?.cohortUserId)return c.json({error:'forbidden'},403);
      const uid=caller.cohortUserId,me=await h.getProfile(c.env.DB,uid);
      const employer=await c.env.DB.prepare('SELECT 1 AS x FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.resume_path=? AND j.posted_by=?').bind(path,uid).first();
      if(path.split('/')[0]!==uid && !h.isAdmin(me) && !employer)return c.json({error:'forbidden'},403);
    }
    if(!c.env.FILES)return c.json({error:'unavailable',reason:'storage_not_configured'},503);
    if(!await readyFile(c.env.DB,bucket,path))return c.json({error:'not_found'},404);
    const obj=await c.env.FILES.get(objectKey(bucket,path));
    if(!obj)return c.json({error:'not_found'},404);
    const headers=new Headers({'Content-Type':obj.httpMetadata?.contentType??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Length':String(obj.size)});
    // Inline only safe image formats; PDFs download to avoid active document content.
    if(!imageTypes.includes(obj.httpMetadata?.contentType??''))headers.set('Content-Disposition','attachment');
    return new Response(obj.body,{headers});
  });
  app.delete('/api/files/:bucket', async (c) => {
    const bucket=c.req.param('bucket'),path=c.req.query('path')??'';
    if(!buckets.includes(bucket)||!validFilePath(path))return c.json({error:'invalid',reason:'file_path'},400);
    const caller=await h.getCaller(c);if(!caller)return c.json({error:'unauthorized'},401);
    if(!caller.cohortUserId)return c.json({error:'forbidden'},403);
    const me=await h.getProfile(c.env.DB,caller.cohortUserId);
    // Resumes delete remains owner-only, even for admin (0049).
    if(path.split('/')[0]!==caller.cohortUserId && !(bucket!=='resumes' && h.isAdmin(me)))return c.json({error:'forbidden'},403);
    if(!c.env.FILES)return c.json({error:'unavailable',reason:'storage_not_configured'},503);
    if(!await deleteFile(c.env,bucket,path))return c.json({error:'conflict',reason:'storage_cleanup_required'},409);
    return c.json({ok:true});
  });
}
