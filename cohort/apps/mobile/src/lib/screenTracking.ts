/** Router segment names only. Dynamic route values never enter telemetry. */
export function screenName(segments:string[]):string {
  return (segments.filter(s=>s!=='(tabs)'&&s!=='(auth)').map(s=>s.startsWith('[')||/^[0-9a-f-]{8,}$/i.test(s)?':id':s).join('/')||'home').slice(0,60);
}
export function mayTrackScreen(signedIn:boolean,consent:string|null):boolean{return signedIn&&consent==='accepted';}
