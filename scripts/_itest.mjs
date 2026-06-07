import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE,{auth:{persistSession:false}});
let pass=0,fail=0; const ok=(n,c)=>{c?(pass++,console.log('  ✅',n)):(fail++,console.log('  ❌',n));};
const today=new Date().toISOString().slice(0,10);
const todaySlash=today.replace(/-/g,'/');

console.log('\n=== A) Attendance — night shift crossing midnight ===');
const EMP='__ITEST_EMP__';
await sb.from('attendance').delete().eq('employee_name',EMP);
// night-shift OUT at 01:00 today (the IN was yesterday)
const o=await sb.from('attendance').insert({employee_name:EMP,date:todaySlash,day:'اختبار',type:'out',time_in:'01:00',method:'app',recorded_at:'01:00',status:'🚪'});
ok('insert night out@01:00', !o.error);
// new morning check-in same day must be allowed (no unique constraint)
const ci=await sb.from('attendance').insert({employee_name:EMP,date:todaySlash,day:'اختبار',type:'in',time_in:'10:00',method:'app',recorded_at:'10:00',status:'✅'});
ok('insert morning in@10:00 same day (not blocked)', !ci.error);
// verify open-shift logic: latest in=10:00 > latest out=01:00 → openShift true (can checkout)
const {data:rows}=await sb.from('attendance').select('type,time_in').eq('employee_name',EMP).eq('date',todaySlash);
let cIn=null,cOut=null; rows.forEach(r=>{if(r.type==='in'&&(!cIn||r.time_in>=cIn))cIn=r.time_in; if(r.type==='out'&&(!cOut||r.time_in>=cOut))cOut=r.time_in;});
const openShift=!!cIn&&(!cOut||cOut<cIn);
ok('openShift=true after morning check-in (10:00>01:00)', openShift===true);
await sb.from('attendance').delete().eq('employee_name',EMP);
console.log('  🧹 cleaned attendance');

console.log('\n=== B) Campaigns — end-to-end (create→ads→logs→aggregate→cascade delete) ===');
await sb.from('ad_campaigns').delete().eq('name','__ITEST_CMP__');
const cmp=await sb.from('ad_campaigns').insert({name:'__ITEST_CMP__',team:'تيم سوريا',channel_type:'page',status:'active',cost_usd:100,assigned_to:['Ali','Sara']}).select().single();
ok('create campaign with cost+assigned', !cmp.error && cmp.data?.cost_usd==100 && cmp.data?.assigned_to?.length==2);
const cid=cmp.data.id;
const ad1=await sb.from('campaign_ads').insert({campaign_id:cid,ad_name:'AD-1',status:'active'}).select().single();
const ad2=await sb.from('campaign_ads').insert({campaign_id:cid,ad_name:'AD-2',status:'active'}).select().single();
ok('add 2 ads', !ad1.error && !ad2.error);
// daily logs today: Ali logs ad1 (10 msg,2 buy), Sara logs ad2 (5 msg,1 buy). Ali also for compliance.
const l1=await sb.from('ad_daily_logs').insert({campaign_id:cid,ad_id:ad1.data.id,employee_name:'Ali',log_date:today,shift:'morning',messages:10,purchases:2,note:'good'});
const l2=await sb.from('ad_daily_logs').insert({campaign_id:cid,ad_id:ad2.data.id,employee_name:'Sara',log_date:today,messages:5,purchases:1});
ok('insert 2 daily logs', !l1.error && !l2.error);
// aggregate like the dashboard
const {data:logs}=await sb.from('ad_daily_logs').select('*').eq('campaign_id',cid);
const totMsg=logs.reduce((s,l)=>s+l.messages,0), totBuy=logs.reduce((s,l)=>s+l.purchases,0);
ok('aggregate messages=15', totMsg===15);
ok('aggregate purchases=3', totBuy===3);
ok('conversion=20%', Math.round(totBuy/totMsg*100)===20);
// compliance today: assigned Ali,Sara → both logged
const {data:tl}=await sb.from('ad_daily_logs').select('employee_name').eq('campaign_id',cid).eq('log_date',today);
const loggedSet=new Set(tl.map(r=>r.employee_name));
const compliance=['Ali','Sara'].filter(n=>loggedSet.has(n)).length;
ok('compliance today 2/2', compliance===2);
// cascade delete: delete campaign → ads + logs gone
await sb.from('ad_campaigns').delete().eq('id',cid);
const {count:adsLeft}=await sb.from('campaign_ads').select('*',{count:'exact',head:true}).eq('campaign_id',cid);
const {count:logsLeft}=await sb.from('ad_daily_logs').select('*',{count:'exact',head:true}).eq('campaign_id',cid);
ok('cascade deleted ads', adsLeft===0);
ok('cascade deleted logs', logsLeft===0);
console.log('  🧹 cleaned campaigns');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
