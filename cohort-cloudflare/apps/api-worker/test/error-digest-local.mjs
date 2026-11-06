import {readFileSync} from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const js=ts.transpileModule(readFileSync('src/errorDigest.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {errorDigest}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const a='2026-11-06T00:00:00Z',b='2026-11-07T00:00:00Z';let n=0;
function check(name,fn){fn();console.log('PASS',name);n++;}
const rows=[{created_at:'2026-11-06 00:00:00',message:'network failed email private@example.com token secret'},{created_at:'2026-11-06T23:59:59Z',message:'upload failed /private/path'},{created_at:b,message:'out of window'},{created_at:'bad',message:'invalid timestamp'}];
const d=errorDigest(rows,a,b);
check('window inclusive start/exclusive end',()=>assert.equal(d.total,2));
check('category counts',()=>assert.deepEqual(d.categories,{network:1,authentication:0,storage:1,other:0}));
check('no raw diagnostics in draft',()=>{for(const privateText of ['private@example.com','secret','/private/path'])assert(!d.text.includes(privateText));});
check('empty is honest',()=>assert.equal(errorDigest([],a,b).total,0));
check('bad window rejected',()=>assert.throws(()=>errorDigest(rows,b,a)));
console.log(`digest draft: ${n} passed`);
