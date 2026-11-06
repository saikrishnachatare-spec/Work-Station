/**
 * Prep API client (cloudflare-stack-prep branch ONLY, flag-gated).
 *
 * With EXPO_PUBLIC_CLERK_PREP=1 the data layer calls the prep API worker
 * (Cloudflare) instead of Supabase-direct. The Clerk session token goes in
 * the Authorization header; the worker verifies it against the pinned dev
 * instance. Tokens are never logged or stored here - getToken() is called
 * per request via the bridge registered by ClerkPrepProvider.
 *
 * With the flag off none of this is reachable: hooks keep their Supabase
 * path and no token getter is registered.
 */
import { CLERK_PREP_API_URL } from '@/lib/clerk';

type TokenGetter = () => Promise<string | null>;
type SignOutFn = () => Promise<unknown>;

let tokenGetter: TokenGetter | null = null;
let clerkSignOut: SignOutFn | null = null;

/** Called once by ClerkPrepProvider's bridge (inside ClerkProvider). */
export function registerClerkRuntime(getToken: TokenGetter, signOut: SignOutFn) {
  tokenGetter = getToken;
  clerkSignOut = signOut;
}

export async function clerkSignOutNow() {
  if (clerkSignOut) await clerkSignOut();
}

export class ApiError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, body: unknown) {
    const b = body as { message?: string; reason?: string; error?: string } | null;
    super(b?.message ?? b?.reason ?? b?.error ?? `Request failed (${status})`);
    this.status = status;
    this.reason = b?.reason;
  }
}

/** Thrown for capabilities intentionally not built yet in this stage. The
 * UI surfaces the message verbatim - never a fake empty success. */
export function previewUnavailable(feature: string, item: string): ApiError {
  return new ApiError(501, { error: 'unavailable_in_preview', message: `${feature} is not available in the test preview yet (${item}).` });
}

export async function api<T = unknown>(
  path: string,
  opts: { body?: unknown; method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'; auth?: 'none' | 'optional' | 'required' } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const wantAuth = (opts.auth ?? 'optional') !== 'none';
  if (wantAuth && tokenGetter) {
    const token = await tokenGetter().catch(() => null);
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (opts.auth === 'required') throw new ApiError(401, { error: 'unauthorized' });
  }
  // Fail closed: an auth-required call must NEVER go out unauthenticated,
  // even if the token bridge has not registered yet (startup race).
  if (opts.auth === 'required' && !headers.Authorization)
    throw new ApiError(401, { error: 'unauthorized' });
  let res: Response;
  try {
    res = await fetch(`${CLERK_PREP_API_URL}${path}`, {
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      headers,
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    });
  } catch {
    throw new ApiError(0, { error: 'network', message: 'Could not reach the preview server.' });
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, { error: 'bad_response' });
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Authenticated byte API: no tokens in URLs or browser storage. */
export async function fileRequest(bucket: string, path: string, method: 'GET' | 'PUT' | 'DELETE' = 'GET', bytes?: ArrayBuffer, mime?: string): Promise<Response> {
  const headers: Record<string,string> = {};
  const token = tokenGetter ? await tokenGetter().catch(() => null) : null;
  if(token) headers.Authorization=`Bearer ${token}`;
  if(method!=='GET' && !token) throw new ApiError(401,{error:'unauthorized'});
  if(mime) headers['Content-Type']=mime;
  const r=await fetch(`${CLERK_PREP_API_URL}/api/files/${encodeURIComponent(bucket)}?path=${encodeURIComponent(path)}`,{method,headers,body:bytes});
  if(!r.ok) throw new ApiError(r.status,await r.json().catch(()=>({error:'file_request_failed'})));
  return r;
}
export async function uploadPreviewFile(bucket:string,userId:string,file:{uri:string;name:string;mimeType?:string},avatar=false):Promise<string>{
  const safe=file.name.replace(/[^A-Za-z0-9._-]/g,'_').slice(-80)||'file';
  const path=`${userId}/${avatar?'avatar-':''}${Date.now()}-${Math.random().toString(36).slice(2,10)}-${safe}`;
  const bytes=await(await fetch(file.uri)).arrayBuffer();
  await fileRequest(bucket,path,'PUT',bytes,file.mimeType||'application/pdf');
  return path;
}
export async function previewFileBlobUrl(bucket:string,path:string):Promise<string>{
  const r=await fileRequest(bucket,path);
  return URL.createObjectURL(await r.blob());
}
/** Web preview download uses fetched bytes, never an auth token in a URL. */
export async function openPreviewFile(bucket:string,path:string):Promise<void>{
  if(typeof document==='undefined') throw new Error('Native file download is not verified in this preview. Use the web preview.');
  const url=await previewFileBlobUrl(bucket,path);
  const a=document.createElement('a');a.href=url;a.download=path.split('/').pop()||'file';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
