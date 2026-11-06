// Ephemeral synthetic signing key, no real Clerk/vendor calls or durable secret.
import ts from 'typescript';import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';import {randomBytes} from 'node:crypto';import {Webhook} from 'standardwebhooks';import assert from 'node:assert/strict';
const temp=new URL('../src/.lifecycle-test.mjs',import.meta.url);writeFileSync(temp,ts.transpileModule(readFileSync(new URL('../src/clerkLifecycle.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
try{
 const {verifiedLifecycle}=await import(temp.href),secret='whsec_'+randomBytes(32).toString('base64'),hook=new Webhook(secret),sub='user_synthetic_lifecycle',allow=new Set([sub]),instance='ins_synthetic';let n=0;
 const base={object:'event',instance_id:instance,timestamp:Math.floor(Date.now()/1000),type:'session.created',data:{id:'sess_synthetic',user_id:sub,status:'active',user:{id:sub,external_id:'synthetic-uuid',email_addresses:['private'],private_metadata:{secret:'not-output'}},latest_activity:{ip_address:'private'}}};
 const req=(data=base,{tamper=false,old=false}={})=>{const raw=JSON.stringify(data),date=new Date(Date.now()-(old?600000:0)),id='msg_synthetic';return new Request('https://synthetic.test/webhook',{method:'POST',headers:{'svix-id':id,'svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':hook.sign(id,date,raw)},body:tamper?raw+' ':raw});};
 const run=async(name,fn)=>{await fn();n++;console.log('PASS '+name);};
 await run('valid signature normalizes seconds, redacts personal payload',async()=>{const e=await verifiedLifecycle(req(),secret,instance,allow);assert.equal(e.kind,'session_created');assert.equal(e.externalId,'synthetic-uuid');assert.equal(JSON.stringify(e).includes('private'),false);assert.equal(Object.keys(e).length,6);});
 await run('missing secret fails closed',()=>assert.rejects(()=>verifiedLifecycle(req(),undefined,instance,allow)));
 await run('bad signature fails',()=>assert.rejects(()=>verifiedLifecycle(req(base,{tamper:true}),secret,instance,allow)));
 await run('old delivery signature rejected',()=>assert.rejects(()=>verifiedLifecycle(req(base,{old:true}),secret,instance,allow)));
 await run('wrong pinned instance rejected',()=>assert.rejects(()=>verifiedLifecycle(req(),secret,'ins_other',allow)));
 await run('unsupported type ignored',async()=>assert.equal(await verifiedLifecycle(req({...base,type:'session.pending'}),secret,instance,allow),null));
 await run('unapproved subject ignored',async()=>assert.equal(await verifiedLifecycle(req(),secret,instance,new Set()),null));
 await run('inactive session refused',()=>assert.rejects(()=>verifiedLifecycle(req({...base,data:{...base.data,status:'pending'}}),secret,instance,allow)));
 await run('nested subject mismatch refused',()=>assert.rejects(()=>verifiedLifecycle(req({...base,data:{...base.data,user:{id:'user_other'}}}),secret,instance,allow)));
 await run('mapping wrong type refused',()=>assert.rejects(()=>verifiedLifecycle(req({...base,data:{...base.data,user:{id:sub,external_id:7}}}),secret,instance,allow)));
 await run('deletion ms timestamp no mapping inference',async()=>{const e=await verifiedLifecycle(req({...base,type:'user.deleted',timestamp:Date.now(),data:{id:sub,deleted:true,object:'user'}}),secret,instance,allow);assert.equal(e.kind,'identity_deleted');assert.equal(e.externalId,undefined);assert.equal(e.sessionId,undefined);});
 await run('missing instance refused even signed',()=>assert.rejects(()=>verifiedLifecycle(req({...base,instance_id:undefined}),secret,instance,allow)));
 await run('future event rejected',()=>assert.rejects(()=>verifiedLifecycle(req({...base,timestamp:Date.now()+600000}),secret,instance,allow)));
 console.log(`offline lifecycle verifier: ${n} passed; no journal/route/vendor delivery tested`);
}finally{unlinkSync(temp);}
