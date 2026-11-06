import { describe, test, expect } from '@jest/globals';
import { pollDelay, queryPollDelay } from '../liveUpdates';

describe('bounded foreground polling',()=>{
  test('normal message and inbox cadence',()=>{expect(pollDelay(15000,true,0,null)).toBe(15000);expect(pollDelay(30000,true,0,null)).toBe(30000);});
  test('hidden/background pauses',()=>{expect(pollDelay(15000,false,0,null)).toBe(false);});
  test('auth and membership failures stop',()=>{for(const status of [401,403])expect(pollDelay(15000,true,1,{status})).toBe(false);});
  test('network and server failures back off with ceiling',()=>{expect(pollDelay(15000,true,1,{status:0})).toBe(30000);expect(pollDelay(60000,true,7,{status:500})).toBe(300000);});
  test('success recovers cadence',()=>{expect(pollDelay(15000,true,0,null)).toBe(15000);});
});

test('consecutive query failures count once and reset after success',()=>{
 const q={state:{error:{status:500} as unknown,errorUpdatedAt:1}};
 expect(queryPollDelay(15000,true,q)).toBe(30000);
 expect(queryPollDelay(15000,true,q)).toBe(30000);
 q.state.errorUpdatedAt=2;expect(queryPollDelay(15000,true,q)).toBe(60000);
 q.state.error=null;expect(queryPollDelay(15000,true,q)).toBe(15000);
 q.state.error={status:500};q.state.errorUpdatedAt=3;expect(queryPollDelay(15000,true,q)).toBe(30000);
});
