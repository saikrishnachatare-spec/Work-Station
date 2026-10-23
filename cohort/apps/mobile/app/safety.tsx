import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable,ScrollView,Text,TextInput } from 'react-native';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/session';
import { useToast } from '@/components/Toast';
import { colors,spacing } from '@/theme';
export default function Safety(){
 const params=useLocalSearchParams<{type:string;id:string}>(); const {session}=useAuth();const toast=useToast();const qc=useQueryClient();
 const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 const blocks=useQuery({queryKey:['blocks',session?.user.id],enabled:!!session,queryFn:async()=>{const{data,error}=await supabase.from('user_blocks').select('blocked_id');if(error)throw error;return data||[];}});
 const blocked=blocks.data?.some(b=>b.blocked_id===params.id);
 const report=async()=>{if(!session){toast.show('Sign in to report','info');return;}if(reason.trim().length<5){toast.show('Explain the concern in at least 5 characters','info');return;}setBusy(true);const{error}=await supabase.from('content_reports').insert({reporter_id:session.user.id,target_type:params.type,target_id:params.id,reason:reason.trim()});setBusy(false);if(error)toast.show('Could not submit report','error');else setDone(true);};
 const block=async()=>{if(!session)return;setBusy(true);const r=blocked?await supabase.from('user_blocks').delete().eq('blocker_id',session.user.id).eq('blocked_id',params.id):await supabase.from('user_blocks').insert({blocker_id:session.user.id,blocked_id:params.id});setBusy(false);if(r.error)toast.show('Could not update block','error');else {await qc.invalidateQueries({queryKey:['blocks']});toast.show(blocked?'User unblocked':'User blocked','success');}};
 if(!['post','user','job'].includes(params.type)||!params.id)return <Text>Open Report from a post, listing or conversation.</Text>;
 return <ScrollView contentContainerStyle={{padding:spacing.lg,gap:16}}><Text style={{fontSize:24}}>Report {params.type}</Text><Text>A report goes to Cohort admins for review. It does not automatically remove content.</Text>{done?<Text>Report submitted for admin review.</Text>:<><TextInput accessibilityLabel="Reason for report" placeholder="What is the concern?" multiline maxLength={2000} value={reason} onChangeText={setReason} style={{backgroundColor:'white',padding:14,minHeight:100,borderRadius:14}}/><Pressable accessibilityRole="button" disabled={busy} onPress={report} style={{backgroundColor:colors.brand,padding:14,borderRadius:24}}><Text style={{color:'white',textAlign:'center'}}>Submit report</Text></Pressable></>}{params.type==='user'&&params.id!==session?.user.id&&<><Text>Blocking stops direct messages in both directions. Existing conversations remain visible. Shared groups are not blocked. You can undo this here.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={block}><Text>{blocked?'Unblock user':'Block user'}</Text></Pressable></>}</ScrollView>;
}
