// OFFLINE PREPARATION ONLY: no route, binding, queue, schedule or receiver
// registration. No production/account mutation. Consumer/journal not built.
import {verifyWebhook} from '@clerk/backend/webhooks';
export type LifecycleEvent={eventId:string;kind:'session_created'|'identity_deleted';clerkSub:string;occurredAt:string;sessionId?:string;externalId?:string};
const identifier=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
export async function verifiedLifecycle(request:Request,secret:string|undefined,instance:string,allowedSubjects:ReadonlySet<string>):Promise<LifecycleEvent|null>{
 if(!secret||!identifier(instance))throw Error('not_configured');
 const length=Number(request.headers.get('content-length')??0);if(length>65536)throw Error('payload_too_large');
 // Bound actual decoded input, not just the untrusted client Content-Length.
 const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>65536)throw Error('payload_too_large');
 const verified=await verifyWebhook(new Request(request.url,{method:'POST',headers:request.headers,body:raw}),{signingSecret:secret});
 const e=verified as unknown as {instance_id?:unknown;object?:unknown;type?:unknown;timestamp?:unknown;data?:Record<string,unknown>};
 if(e.instance_id!==instance||e.object!=='event')throw Error('wrong_instance');
 if(e.type!=='session.created'&&e.type!=='user.deleted')return null;
 const d=e.data;if(!d)throw Error('invalid_event');
 const sub=e.type==='session.created'?d.user_id:d.id;
 if(!identifier(sub)||!sub.startsWith('user_'))throw Error('invalid_subject');
 if(!allowedSubjects.has(sub))return null;
 const id=request.headers.get('svix-id');if(!identifier(id))throw Error('invalid_event_id');
 const timestamp=e.timestamp;if(typeof timestamp!=='number'||!Number.isFinite(timestamp)||timestamp<=0)throw Error('invalid_timestamp');
 // Current live catalog has seconds sample for session.created, ms for deletion.
 const ms=timestamp<1e11?timestamp*1000:timestamp;
 if(ms>Date.now()+300000||ms<946684800000)throw Error('invalid_timestamp');
 const event:LifecycleEvent={eventId:id,kind:e.type==='session.created'?'session_created':'identity_deleted',clerkSub:sub,occurredAt:new Date(ms).toISOString()};
 if(e.type==='session.created'){
  if(d.status!=='active'||!identifier(d.id)||!d.id.startsWith('sess_'))throw Error('invalid_session');
  event.sessionId=d.id;
  const user=d.user as Record<string,unknown>|undefined;
  if(user&&user.id!==sub)throw Error('subject_mismatch');
  if(user?.external_id!=null){if(!identifier(user.external_id))throw Error('invalid_mapping');event.externalId=user.external_id;}
 }else if(d.deleted!==true||d.object!=='user')throw Error('invalid_deletion');
 // No raw JSON, emails, names, metadata, IP/location, useragent or tokens escape.
 return event;
}
