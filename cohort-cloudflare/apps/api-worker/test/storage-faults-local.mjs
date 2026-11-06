// Deterministic unit fault injection into actual route/deleteFile code.
// In-memory D1/R2 doubles, not vendor outages or production stress proof.
import ts from 'typescript';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {Hono} from 'hono';
import assert from 'node:assert/strict';
const temp=new URL('../src/.storage-fault-test.mjs',import.meta.url);
writeFileSync(temp,ts.transpileModule(readFileSync(new URL('../src/storage.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
let pass=0;
try{
 const {registerStorage,deleteFile}=await import(temp.href);
 const uid='synthetic-fault-owner',path=uid+'/fault.pdf',key='student-notes/'+path;
 let state=null,bytes=null,fault='';
 const DB={prepare(sql){return {bind(){return this;},async first(){return state?{state,owner_id:uid}:null;},async run(){
  if(sql.includes('INSERT INTO file_objects')){if(state)throw Error('exists');state='pending';return {meta:{changes:1}};}
  if(sql.includes("SET state='ready'")){if(state!=='pending')return {meta:{changes:0}};state='ready';return {meta:{changes:1}};}
  if(sql.includes("SET state='deleting'"))state='deleting';
  if(sql.includes("SET state='deleted'")){if(fault==='d1-finalize')throw Error('d1 outage');state='deleted';}
  return {meta:{changes:1}};
 }}}};
 const FILES={async put(k,b){assert.equal(k,key);if(fault==='put')throw Error('put outage');if(fault==='race')await deleteFile(env,'student-notes',path);bytes=b;},
 async head(){if(fault==='head')throw Error('head outage');return bytes?{size:bytes.length}:null;},async delete(){if(fault==='delete')throw Error('delete outage');bytes=null;},async get(){return bytes?{size:bytes.length,body:bytes,httpMetadata:{contentType:'application/pdf'}}:null;}};
 const env={DB,FILES};
 const app=new Hono();registerStorage(app,{getCaller:async()=>({clerkUserId:'sub',cohortUserId:uid}),getProfile:async()=>({id:uid,status:'active',role:'user'}),isAdmin:()=>false,isActiveMember:()=>true});
 const put=()=>app.request('http://test/api/files/student-notes?path='+path,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:'%PDF-synthetic'},env);
 const check=(name,fn)=>{fn();pass++;console.log('PASS '+name);};
 fault='put';let r=await put();check('put outage502 pending, no bytes',()=>{assert.equal(r.status,502);assert.equal(state,'pending');assert.equal(bytes,null);});
 fault='';check('retry cleanup put failure',()=>{});assert.equal(await deleteFile(env,'student-notes',path),true);assert.equal(state,'deleted');
 state=null;fault='head';r=await put();check('unknown head502 retains pending bytes for reconciliation',()=>{assert.equal(r.status,502);assert.equal(state,'pending');assert.ok(bytes);});
 fault='delete';check('R2delete failure false + deleting',()=>{});assert.equal(await deleteFile(env,'student-notes',path),false);assert.equal(state,'deleting');
 fault='d1-finalize';check('D1finalize failure false, bytes absent, deleting',()=>{});assert.equal(await deleteFile(env,'student-notes',path),false);assert.equal(bytes,null);assert.equal(state,'deleting');
 fault='';assert.equal(await deleteFile(env,'student-notes',path),true);check('retry finalization reaches deleted',()=>assert.equal(state,'deleted'));
 state=null;bytes=null;fault='race';r=await put();check('cleanup between reserve and put cannot resurrect ready',()=>{assert.equal(r.status,409);assert.equal(state,'deleted');assert.equal(bytes,null);});
 fault='';assert.equal(await deleteFile(env,'student-notes',path),true);check('repeated deletion safe',()=>assert.equal(state,'deleted'));
 state=null;check('unknown ledger fails closed',()=>{});assert.equal(await deleteFile(env,'student-notes',path),false);
 console.log(`storage deterministic faults: ${pass} passed`);
}finally{unlinkSync(temp);}
