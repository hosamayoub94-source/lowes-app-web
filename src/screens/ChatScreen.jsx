// =============================================================
// ChatScreen 4.0 — سريع · سهل · جميل
// ✏️ تعديل/حذف  📌 تثبيت  ✍️ يكتب…  🔢 غير مقروء
// 📎 ملفات  😄 إيموجي  🔔 إشعارات فورية
// =============================================================
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation }    from 'react-router-dom';
import { useAuth }        from '@hooks/useAuth';
import { supabase }       from '@services/supabase';
import { ROLES }          from '@data/teams';
import { mergeMessagesById, hasMessageChanges } from '@utils/chatMessages';

// ── Constants ──────────────────────────────────────────────────
const DEFAULT_CHANNELS = [
  { name: '💬 عام',                team: 'عام',     description: 'قناة عامة للجميع',          requires_approval: false, is_private: false },
  { name: '📱 الميديا والمحتوى',  team: 'ميديا',   description: 'فريق السوشال ميديا',         requires_approval: false, is_private: false },
  { name: '🇸🇾 مبيعات سوريا',      team: 'سوريا',   description: 'فريق المبيعات سوريا',       requires_approval: false, is_private: false },
  { name: '🇹🇷 مبيعات تركيا',      team: 'تركيا',   description: 'فريق المبيعات تركيا',       requires_approval: false, is_private: false },
  { name: '⚙️ الإدارة والعمليات', team: 'إدارة',   description: 'الإدارة والعمليات',          requires_approval: false, is_private: false },
  { name: '💼 المبيعات',           team: 'مبيعات',  description: 'فريق المبيعات',              requires_approval: false, is_private: false },
  { name: '🇦🇪 دبي',               team: 'دبي',     description: 'فريق الإمارات',              requires_approval: false, is_private: false },
  { name: '🌐 إسطنبول',            team: 'إسطنبول', description: 'فريق إسطنبول',              requires_approval: false, is_private: false },
  { name: '🇸🇾 دمشق',              team: 'دمشق',    description: 'فريق دمشق',                 requires_approval: false, is_private: false },
  { name: '🇸🇦 الرياض',            team: 'الرياض',  description: 'فريق الرياض',               requires_approval: false, is_private: false },
];
const APPROVER_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER, ROLES.SOCIAL_MANAGER];
const QUICK_EMOJIS   = ['👍','❤️','😂','😮','😢','🔥'];
const EMOJI_GRID = [
  '😀','😁','😂','🤣','😍','🥰','😎','🤔','😢','😡',
  '🤯','🥳','😴','🤗','😏','🫡','🤝','👋','👍','👎',
  '👏','🙌','💪','🙏','❤️','💙','💚','💛','🔥','✨',
  '🎉','🎊','🎵','🎶','📣','💡','✅','❌','⚠️','📌',
  '📎','📅','📊','💰','🎯','🚀','💯','⚡','🌟','👀',
];
const FILE_ICONS = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📋', pptx:'📋', zip:'🗜️', txt:'📃', default:'📎' };

// ── Helpers ─────────────────────────────────────────────────────
function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 60000)    return 'الآن';
  if (diff < 3600000)  return `${Math.floor(diff/60000)}د`;
  if (diff < 86400000) return d.toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'});
  return d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory',{month:'short',day:'numeric'});
}
function formatLastSeen(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return 'للتو';
  if (diff < 3600000)  return `منذ ${Math.floor(diff/60000)} دقيقة`;
  if (diff < 86400000) return `منذ ${Math.floor(diff/3600000)} ساعة`;
  return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory',{month:'short',day:'numeric'});
}
function dateDivider(iso) {
  const d = new Date(iso), diff = Math.floor((Date.now()-d)/86400000);
  if (diff===0) return 'اليوم';
  if (diff===1) return 'أمس';
  return d.toLocaleDateString('ar-SA-u-nu-latn-ca-gregory',{weekday:'long',day:'numeric',month:'long'});
}
function groupByDay(msgs) {
  const groups=[]; let lastDay=null;
  msgs.forEach(m => {
    const day=new Date(m.created_at).toDateString();
    if(day!==lastDay){groups.push({type:'divider',label:dateDivider(m.created_at),key:day});lastDay=day;}
    groups.push({type:'msg',...m});
  });
  return groups;
}
function fmtSize(bytes) {
  if(!bytes) return '';
  if(bytes<1024) return `${bytes} B`;
  if(bytes<1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}
function fileIcon(name) {
  const ext=(name||'').split('.').pop().toLowerCase();
  return FILE_ICONS[ext]||FILE_ICONS.default;
}
// Consistent avatar color from name
function avatarColor(name) {
  const colors=['bg-teal/20 text-teal','bg-navy/20 text-navy','bg-amber/20 text-amber','bg-red/20 text-red','bg-purple/20 text-purple','bg-green/20 text-green'];
  let h=0; for(const c of (name||'')) h=(h*31+c.charCodeAt(0))%colors.length;
  return colors[h];
}

// ── AI Bot ──────────────────────────────────────────────────────
const BOT_NAME='🤖 مساعد لويز', BOT_ID='bot';

async function buildBotResponse(cmdText,roomId,userId,userName){
  const cmd=cmdText.trim();const cmdL=cmd.toLowerCase();let response='';
  try{
    if(['/مساعدة','/help','/مساعده'].includes(cmdL)){response=['🤖 الأوامر المتاحة:','','📋 /مهامي   — مهامي المفتوحة','📅 /حضور   — سجل حضوري','👥 /الفريق  — قائمة الفريق','📢 /اعلانات — آخر الإعلانات','❓ /مساعدة  — هذه القائمة'].join('\n');}
    else if(['/مهامي','/tasks','/مهام'].includes(cmdL)){
      const taskFilter=userId?`assignee_id.eq.${userId},assigned_to.eq.${userId}`:`assigned_to.eq.${userId}`;
      const{data}=await supabase.from('tasks').select('title,status,due_date').or(taskFilter).not('status','in','("done","completed","cancelled")').order('created_at',{ascending:false}).limit(8);
      response=!data?.length?'✅ ليس لديك مهام مفتوحة!':`📋 مهامك المفتوحة (${data.length}):\n\n${data.map(t=>`${({pending:'⏳',in_progress:'🔄',in_review:'👀',overdue:'🚨'}[t.status]??'📋')} ${t.title}${t.due_date?` — ${new Date(t.due_date).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory',{month:'short',day:'numeric'})}`:''}`).join('\n')}`;
    }else if(['/حضور','/attendance','/حضوري'].includes(cmdL)){
      const d=new Date();const today=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      const{data:rows}=await supabase.from('attendance').select('type,time_in,note').eq('employee_name',userName).eq('date',today).in('type',['in','out']);
      const inRow=rows?.find(r=>r.type==='in'),outRow=rows?.find(r=>r.type==='out');
      const displayDate=`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
      response=!rows?.length?`📅 اليوم (${displayDate}):\n\n❌ لا يوجد حضور مسجّل`:`📅 اليوم (${displayDate}):\n\n${inRow?`✅ دخول: ${inRow.time_in}`:'❌ لم تسجّل دخول'}\n${outRow?`🏠 خروج: ${outRow.time_in}`:'⏳ لم تسجّل خروج'}${outRow?.note?`\n📝 ${outRow.note}`:''}`;
    }else if(['/الفريق','/team','/فريق'].includes(cmdL)){
      const{data}=await supabase.from('profiles').select('employee_name,team').eq('is_active',true).order('employee_name').limit(25);
      response=!data?.length?'⚠️ لا توجد بيانات.':`👥 الفريق (${data.length}):\n\n${data.map(p=>`• ${p.employee_name}${p.team?` — ${p.team}`:''}`).join('\n')}`;
    }else if(['/اعلانات','/announcements','/اعلان'].includes(cmdL)){
      const{data}=await supabase.from('announcements').select('title,created_at,is_pinned').order('created_at',{ascending:false}).limit(5);
      response=!data?.length?'📢 لا توجد إعلانات.':`📢 آخر الإعلانات:\n\n${data.map(a=>`${a.is_pinned?'📌':'📢'} ${a.title} — ${new Date(a.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory',{month:'short',day:'numeric'})}`).join('\n')}`;
    }else{response=`❓ أمر غير معروف: "${cmd}"\nاكتب /مساعدة للأوامر.`;}
  }catch{response='⚠️ حدث خطأ. حاول مجدداً.';}
  return{id:`bot-${Date.now()}`,room_id:roomId,sender_id:BOT_ID,sender_name:BOT_NAME,message_type:'text',content:response,created_at:new Date().toISOString()};
}

// ── Voice recorder hook ──────────────────────────────────────────
function useVoiceRecorder(onDone){
  const[recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0);
  const recRef=useRef(null),chunksRef=useRef([]),timerRef=useRef(null);
  const start=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      chunksRef.current=[];
      const mr=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus'});
      mr.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      mr.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());clearInterval(timerRef.current);setSeconds(0);onDone(new Blob(chunksRef.current,{type:'audio/webm'}));};
      recRef.current=mr;mr.start();setRecording(true);setSeconds(0);
      timerRef.current=setInterval(()=>setSeconds(s=>s+1),1000);
    }catch{alert('لا يمكن الوصول إلى الميكروفون');}
  };
  const stop=()=>{recRef.current?.stop();setRecording(false);};
  const cancel=()=>{chunksRef.current=[];recRef.current?.stop();setRecording(false);setSeconds(0);};
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  return{recording,seconds,start,stop,cancel,fmt};
}

// ── EmojiPicker ──────────────────────────────────────────────────
function EmojiPicker({onSelect,onClose}){
  const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();};
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);
  },[onClose]);
  return(
    <div ref={ref} className="absolute bottom-full mb-2 bg-surface border border-border rounded-2xl shadow-2xl p-3 z-30 animate-in zoom-in-90 duration-150 origin-bottom-start" style={{insetInlineStart:0}}>
      <div className="grid grid-cols-10 gap-0.5" style={{width:260}}>
        {EMOJI_GRID.map(e=>(
          <button key={e} onClick={()=>{onSelect(e);onClose();}} className="text-lg p-1 rounded-lg hover:bg-surface-alt hover:scale-125 transition-all duration-100">{e}</button>
        ))}
      </div>
    </div>
  );
}

// ── VoiceMessage ─────────────────────────────────────────────────
function VoiceMessage({url,isMine}){
  const[playing,setPlaying]=useState(false),[prog,setProg]=useState(0);
  const audioRef=useRef(null);
  useEffect(()=>{
    audioRef.current=new Audio(url);
    audioRef.current.onended=()=>{setPlaying(false);setProg(0);};
    audioRef.current.ontimeupdate=()=>{if(audioRef.current.duration)setProg(audioRef.current.currentTime/audioRef.current.duration*100);};
    return()=>audioRef.current?.pause();
  },[url]);
  const toggle=()=>{if(!audioRef.current)return;if(playing){audioRef.current.pause();setPlaying(false);}else{audioRef.current.play();setPlaying(true);}};
  return(
    <div className="flex items-center gap-2.5 min-w-[180px] py-0.5">
      <button onClick={toggle} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 transition ${isMine?'bg-white/20 hover:bg-white/30':'bg-teal/10 hover:bg-teal/20 text-teal'}`}>
        {playing?'⏸':'▶'}
      </button>
      <div className="flex-1 relative h-1.5 rounded-full overflow-hidden bg-current/20">
        <div className={`absolute inset-y-0 start-0 rounded-full transition-all ${isMine?'bg-white/70':'bg-teal'}`} style={{width:`${prog}%`}} />
      </div>
      <span className={`text-[10px] shrink-0 ${isMine?'text-white/60':'text-muted'}`}>🎙️</span>
    </div>
  );
}

// ── FileMessage ──────────────────────────────────────────────────
function FileMessage({msg,isMine}){
  return(
    <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-2.5 min-w-[200px] py-0.5 rounded-xl transition-opacity hover:opacity-80 ${isMine?'text-white':'text-text'}`}>
      <span className="text-2xl shrink-0">{fileIcon(msg.file_name)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{msg.file_name||'ملف'}</p>
        {msg.file_size&&<p className={`text-[10px] ${isMine?'text-white/60':'text-muted'}`}>{fmtSize(msg.file_size)}</p>}
      </div>
      <span className={`text-xs shrink-0 ${isMine?'text-white/70':'text-teal'}`}>⬇</span>
    </a>
  );
}

// ── Highlight @mentions in message text ─────────────────────────
function MsgText({text}){
  if(!text)return null;
  const parts=text.split(/(@[\w؀-ۿ][\w؀-ۿ\s.-]{0,30}?(?=\s|@|$))/g);
  return<>{parts.map((p,i)=>p.startsWith('@')?<span key={i} className="font-medium text-teal">{p}</span>:<span key={i}>{p}</span>)}</>;
}

// ── ForwardPanel ─────────────────────────────────────────────────
function ForwardPanel({msg,rooms,userId,userName,onClose}){
  const[sel,setSel]=useState(null),[sending,setSending]=useState(false);
  const fwd=async()=>{
    if(!sel||!msg)return;setSending(true);
    try{
      const payload={room_id:sel.id,sender_id:userId,sender_name:userName,created_at:new Date().toISOString(),
        message_type:msg.message_type,content:msg.message_type==='text'?`↩ تم التوجيه من ${msg.sender_name}:\n${msg.content}`:null,
        file_url:msg.file_url??null,file_name:msg.file_name??null,file_size:msg.file_size??null};
      await supabase.from('chat_messages').insert(payload);
      onClose();
    }catch(e){alert('فشل التوجيه: '+e.message);}finally{setSending(false);}
  };
  const available=rooms.filter(r=>r.id!==msg?.room_id);
  return(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div><h2 className="font-bold text-text text-sm">↗ إعادة توجيه الرسالة</h2><p className="text-[11px] text-muted mt-0.5">اختر القناة أو المحادثة</p></div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>
        {/* Message preview */}
        <div className="px-4 py-2.5 bg-surface-alt border-b border-border">
          <p className="text-xs text-muted mb-0.5">الرسالة المُوجَّهة:</p>
          <p className="text-sm text-text truncate">
            {msg?.message_type==='text'?msg.content:msg?.message_type==='image'?'📷 صورة':msg?.message_type==='voice'?'🎙️ رسالة صوتية':`📎 ${msg?.file_name||'ملف'}`}
          </p>
        </div>
        {/* Room list */}
        <div className="max-h-56 overflow-y-auto p-2 space-y-1">
          {available.length===0?<p className="text-center text-sm text-muted py-4">لا توجد قنوات أخرى</p>:
          available.map(r=>(
            <button key={r.id} onClick={()=>setSel(r)}
              className={`w-full text-start px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-sm transition ${sel?.id===r.id?'bg-teal/10 text-teal border border-teal/30':'hover:bg-surface-alt text-text border border-transparent'}`}>
              <span className="text-base shrink-0">{r.type==='dm'?'👤':r.is_private?'🔒':'#'}</span>
              <span className="flex-1 font-medium truncate">{r.display_name??r.name}</span>
              {sel?.id===r.id&&<span className="text-teal font-bold text-xs shrink-0">✓</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border">
          <button onClick={fwd} disabled={!sel||sending} className="w-full py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition">
            {sending?'⏳ جاري الإرسال…':'↗ إرسال'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MessageBubble ────────────────────────────────────────────────
function MessageBubble({msg,isMine,userId,isApprover,onReply,onReact,onEdit,onDelete,onPin,onImageClick,onForward,reactions,isOnline,roomReadMap,isDm,othersOnline}){
  const[showMenu,setShowMenu]=useState(false),[editMode,setEditMode]=useState(false),[editText,setEditText]=useState('');
  const[showEmoji,setShowEmoji]=useState(false);
  const menuRef=useRef(null),editRef=useRef(null);

  useEffect(()=>{
    const h=e=>{if(menuRef.current&&!menuRef.current.contains(e.target))setShowMenu(false);};
    if(showMenu)document.addEventListener('mousedown',h);
    return()=>document.removeEventListener('mousedown',h);
  },[showMenu]);

  const rxMap=useMemo(()=>{
    const m={};(reactions??[]).forEach(r=>{m[r.emoji]=(m[r.emoji]??0)+1;});return m;
  },[reactions]);

  // ── Read receipt: is this message read by someone else? ────────
  const isRead=useMemo(()=>{
    if(!isMine||!roomReadMap)return false;
    const msgTime=new Date(msg.created_at).getTime();
    return Object.entries(roomReadMap).some(([uid,readAt])=>uid!==userId&&new Date(readAt).getTime()>msgTime);
  },[isMine,msg.created_at,roomReadMap,userId]);

  const startEdit=()=>{setEditText(msg.content||'');setEditMode(true);setShowMenu(false);setTimeout(()=>editRef.current?.focus(),50);};
  const submitEdit=async()=>{
    const t=editText.trim();
    if(!t||t===msg.content){setEditMode(false);return;}
    await onEdit?.(msg.id,t);setEditMode(false);
  };

  // Bot
  if(msg.sender_id===BOT_ID||msg.sender_name?.startsWith('🤖')){
    return(
      <div className="flex justify-start mb-3 animate-in slide-in-from-bottom-2 duration-200">
        <div className="max-w-[88%] sm:max-w-[75%]">
          <span className="text-[10px] font-bold text-navy/40 ms-1 mb-1 block">🤖 مساعد لويز</span>
          <div className="bg-navy/[0.05] border border-navy/10 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
            <pre className="text-sm text-text whitespace-pre-wrap font-[inherit] leading-relaxed">{msg.content}</pre>
          </div>
          <span className="text-[9px] text-muted/60 ms-1 mt-0.5 block">{timeLabel(msg.created_at)}</span>
        </div>
      </div>
    );
  }

  // Deleted
  if(msg.is_deleted){
    return(
      <div className={`flex mb-1.5 ${isMine?'justify-end':'justify-start'}`}>
        <div className={`px-3.5 py-2 rounded-2xl border text-xs italic ${isMine?'rounded-br-sm border-border/30 text-white/40 bg-teal/30':'rounded-bl-sm border-border text-muted/60 bg-surface-alt/50'}`}>
          🚫 تم حذف هذه الرسالة
        </div>
      </div>
    );
  }

  return(
    <div className={`flex mb-1.5 group animate-in slide-in-from-bottom-1 duration-150 ${isMine?'justify-end':'justify-start'}`}>
      {/* Avatar */}
      {!isMine&&(
        <div className="relative shrink-0 me-2 mt-auto mb-0.5">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs select-none ${avatarColor(msg.sender_name)}`}>
            {msg.sender_name?.[0]?.toUpperCase()??' '}
          </div>
          {isOnline&&<span className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface block"/>}
        </div>
      )}

      <div className={`flex flex-col ${isMine?'items-end':'items-start'} max-w-[78%] sm:max-w-[65%]`}>
        {!isMine&&<span className="text-[11px] text-teal/80 font-medium mb-0.5 ms-1">{msg.sender_name}</span>}

        {/* Reply preview */}
        {msg.reply_preview&&(
          <div className={`mb-1 px-3 py-1.5 rounded-xl text-[11px] border-s-2 border-teal/60 text-muted bg-surface-alt/80 max-w-full truncate`}>
            ↩ {msg.reply_preview}
          </div>
        )}

        {/* Bubble */}
        <div className="relative">
            {/* ── Action pill — appears above bubble on hover ──────── */}
          <div className={`absolute -top-9 ${isMine?'end-0':'start-0'} opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 pointer-events-none group-hover:pointer-events-auto`}>
            <div className="flex items-center bg-surface border border-border rounded-full shadow-lg px-1.5 py-1 gap-0.5 animate-in zoom-in-75 duration-150 origin-bottom">
              {/* Quick emojis */}
              {QUICK_EMOJIS.map(e=>(
                <button key={e} onClick={()=>onReact?.(msg.id,e)}
                  className="w-7 h-7 rounded-full text-base flex items-center justify-center hover:bg-surface-alt hover:scale-125 transition-all duration-100 leading-none">
                  {e}
                </button>
              ))}
              <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0"/>
              {/* Full picker toggle */}
              <button onClick={()=>setShowEmoji(v=>!v)}
                className="w-7 h-7 rounded-full text-[11px] flex items-center justify-center text-muted hover:bg-surface-alt hover:text-teal transition-all">
                😊
              </button>
              {/* Reply */}
              <button onClick={()=>onReply?.(msg)}
                className="w-7 h-7 rounded-full text-xs flex items-center justify-center text-muted hover:bg-surface-alt hover:text-teal transition-all">
                ↩
              </button>
              {/* Forward */}
              <button onClick={()=>onForward?.(msg)}
                className="w-7 h-7 rounded-full text-xs flex items-center justify-center text-muted hover:bg-surface-alt hover:text-teal transition-all">
                ↗
              </button>
              {/* Context menu */}
              {(isMine||isApprover)&&(
                <div className="relative" ref={menuRef}>
                  <button onClick={()=>setShowMenu(v=>!v)}
                    className="w-7 h-7 rounded-full text-xs flex items-center justify-center text-muted hover:bg-surface-alt hover:text-text transition-all">
                    ⋯
                  </button>
                  {showMenu&&(
                    <div className={`absolute top-8 bg-surface border border-border rounded-2xl shadow-xl py-1.5 z-30 min-w-[130px] animate-in zoom-in-90 duration-150 ${isMine?'end-0':'start-0'}`}>
                      {isMine&&msg.message_type==='text'&&<button onClick={startEdit} className="w-full text-start px-4 py-2 text-sm text-text hover:bg-surface-alt transition flex items-center gap-2"><span>✏️</span> تعديل</button>}
                      {isApprover&&<button onClick={()=>{onPin?.(msg);setShowMenu(false);}} className="w-full text-start px-4 py-2 text-sm text-text hover:bg-surface-alt transition flex items-center gap-2"><span>📌</span> تثبيت</button>}
                      {(isMine||isApprover)&&<button onClick={()=>{onDelete?.(msg.id);setShowMenu(false);}} className="w-full text-start px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition flex items-center gap-2"><span>🗑️</span> حذف</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Full Emoji picker */}
          {showEmoji&&(
            <div className={`absolute -top-12 z-30 ${isMine?'end-0':'start-0'}`} style={{transform:'translateY(-100%)'}}>
              <EmojiPicker onSelect={e=>{onReact?.(msg.id,e);setShowEmoji(false);}} onClose={()=>setShowEmoji(false)} />
            </div>
          )}

          {/* Main bubble */}
          {editMode?(
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <textarea ref={editRef} value={editText} onChange={e=>setEditText(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitEdit();}if(e.key==='Escape')setEditMode(false);}}
                className="border border-teal/40 rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30 resize-none"
                rows={2} />
              <div className="flex gap-1.5 justify-end">
                <button onClick={()=>setEditMode(false)} className="px-3 py-1 rounded-xl text-xs border border-border text-muted hover:bg-surface-alt transition">إلغاء</button>
                <button onClick={submitEdit} className="px-3 py-1 rounded-xl text-xs bg-teal text-navy hover:bg-teal/90 transition">حفظ</button>
              </div>
            </div>
          ):(
            <div onDoubleClick={()=>onReact?.(msg.id,'❤️')} className="relative">
              {/* WhatsApp-style bubble tail */}
              {isMine?(
                <svg className="absolute -end-[7px] bottom-2 text-teal" width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden>
                  <path d="M1 0C1 0 0 9 0 13C2.5 10 6.5 6.5 8 5L1 0Z"/>
                </svg>
              ):(
                <svg className="absolute -start-[7px] bottom-2 text-surface" width="8" height="13" viewBox="0 0 8 13" fill="currentColor" aria-hidden style={{filter:'drop-shadow(-1px 0 0 var(--color-border))'}}>
                  <path d="M7 0C7 0 8 9 8 13C5.5 10 1.5 6.5 0 5L7 0Z"/>
                </svg>
              )}
              <div className={`relative px-3.5 py-2 rounded-2xl shadow-sm select-text cursor-default transition-transform active:scale-[0.98] ${
                isMine
                  ? 'bg-teal text-navy rounded-br-sm'
                  : 'bg-surface border border-border/70 text-text rounded-bl-sm'
              }`}>
                {msg.message_type==='text'&&<p className="text-[15px] font-normal leading-[1.5] whitespace-pre-wrap break-words"><MsgText text={msg.content}/></p>}
                {msg.message_type==='image'&&msg.file_url&&<img src={msg.file_url} alt="صورة" onClick={()=>onImageClick?.(msg.file_url)} className="max-w-[220px] rounded-xl max-h-60 object-cover cursor-zoom-in hover:opacity-90 transition-opacity" />}
                {msg.message_type==='voice'&&msg.file_url&&<VoiceMessage url={msg.file_url} isMine={isMine} />}
                {msg.message_type==='file'&&<FileMessage msg={msg} isMine={isMine} />}
              </div>
            </div>
          )}
        </div>

        {/* Reactions */}
        {Object.keys(rxMap).length>0&&(
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(rxMap).map(([emoji,count])=>(
              <button key={emoji} onClick={()=>onReact?.(msg.id,emoji)}
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-surface-alt border border-border/60 text-xs hover:scale-105 hover:border-teal/40 transition-all shadow-sm">
                <span>{emoji}</span><span className="text-muted font-bold">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp + edited badge + read receipt */}
        <div className={`flex items-center gap-1 mt-0.5 ${isMine?'flex-row-reverse':''}`}>
          <span className="text-[9px] text-muted/60">{timeLabel(msg.created_at)}</span>
          {msg.edited_at&&<span className="text-[9px] text-muted/50 italic">تم التعديل</span>}
          {isMine&&(
            isRead
              ? <span className="text-[10px] font-bold leading-none text-teal" title="تمت القراءة">✓✓</span>
              : othersOnline
                ? <span className="text-[10px] font-bold leading-none text-muted/40" title="تم التسليم">✓✓</span>
                : <span className="text-[10px] font-bold leading-none text-muted/40" title="تم الإرسال">✓</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TypingIndicator ──────────────────────────────────────────────
function TypingIndicator({users}){
  if(!users.length) return null;
  const label=users.length===1?`${users[0]} يكتب`:users.length===2?`${users[0]} و${users[1]} يكتبان`:`${users.length} أشخاص يكتبون`;
  return(
    <div className="flex items-center gap-2 px-4 py-1.5 animate-in slide-in-from-bottom-1 duration-200">
      <div className="flex gap-0.5">
        {[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 rounded-full bg-teal/60 animate-bounce" style={{animationDelay:`${i*0.15}s`}} />)}
      </div>
      <span className="text-[11px] text-muted italic">{label}…</span>
    </div>
  );
}

// ── PinnedBanner ─────────────────────────────────────────────────
function PinnedBanner({pinned,onUnpin,isApprover}){
  const[open,setOpen]=useState(true);
  if(!pinned||!open) return null;
  return(
    <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 bg-teal/5 border-b border-teal/15 text-sm animate-in slide-in-from-top-2 duration-200">
      <span className="text-teal shrink-0">📌</span>
      <p className="flex-1 text-text truncate text-xs font-medium">{pinned.content}</p>
      <div className="flex items-center gap-1 shrink-0">
        {isApprover&&<button onClick={onUnpin} className="text-[10px] text-muted hover:text-red-500 transition px-2 py-0.5 rounded-lg hover:bg-red-50">إزالة</button>}
        <button onClick={()=>setOpen(false)} className="text-muted hover:text-text transition text-xs px-1">✕</button>
      </div>
    </div>
  );
}

// ── MessageInput ─────────────────────────────────────────────────
function MessageInput({onSend,disabled,replyTo,onCancelReply,onTyping,members=[]}){
  const[text,setText]=useState('');
  const[uploading,setUploading]=useState(false);
  const[imgPreview,setImgPreview]=useState(null);
  const[imgFile,setImgFile]=useState(null);
  const[attachedFile,setAttachedFile]=useState(null);
  const[showEmoji,setShowEmoji]=useState(false);
  // @mention state
  const[mentionQ,setMentionQ]=useState(null),[mentionStart,setMentionStart]=useState(-1),[mentionIdx,setMentionIdx]=useState(0);
  const fileRef=useRef(null),textRef=useRef(null);

  const voice=useVoiceRecorder(async(blob)=>{
    setUploading(true);
    try{
      const path=`voice/${Date.now()}.webm`;
      const{data,error}=await supabase.storage.from('chat-files').upload(path,blob,{contentType:'audio/webm'});
      if(error)throw error;
      const{data:u}=supabase.storage.from('chat-files').getPublicUrl(data.path);
      await onSend({message_type:'voice',file_url:u.publicUrl,duration_s:Math.max(1,Math.round(blob.size/16000))});
    }catch(e){alert('فشل رفع الصوت: '+e.message);}
    finally{setUploading(false);}
  });

  const sendText=()=>{
    const t=text.trim();if(!t)return;
    onSend({message_type:'text',content:t});
    setText('');textRef.current?.focus();
  };

  const sendImage=async()=>{
    if(!imgFile)return;setUploading(true);
    try{
      const ext=imgFile.name.split('.').pop(),path=`images/${Date.now()}.${ext}`;
      const{data,error}=await supabase.storage.from('chat-files').upload(path,imgFile,{contentType:imgFile.type});
      if(error)throw error;
      const{data:u}=supabase.storage.from('chat-files').getPublicUrl(data.path);
      await onSend({message_type:'image',file_url:u.publicUrl});
    }catch(e){alert('فشل رفع الصورة: '+e.message);}
    finally{setUploading(false);setImgPreview(null);setImgFile(null);}
  };

  const sendFile=async()=>{
    if(!attachedFile)return;setUploading(true);
    try{
      const path=`files/${Date.now()}_${attachedFile.name}`;
      const{data,error}=await supabase.storage.from('chat-files').upload(path,attachedFile,{contentType:attachedFile.type});
      if(error)throw error;
      const{data:u}=supabase.storage.from('chat-files').getPublicUrl(data.path);
      await onSend({message_type:'file',file_url:u.publicUrl,file_name:attachedFile.name,file_size:attachedFile.size});
    }catch(e){alert('فشل رفع الملف: '+e.message);}
    finally{setUploading(false);setAttachedFile(null);}
  };

  const handleFileChange=e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.type.startsWith('image/')){
      setImgFile(file);
      const r=new FileReader();r.onload=ev=>setImgPreview(ev.target.result);r.readAsDataURL(file);
    }else{setAttachedFile(file);}
    e.target.value='';
  };

  // @mention detection
  const insertMention=useCallback(name=>{
    if(mentionStart<0)return;
    const cur=textRef.current?.selectionStart??text.length;
    const newText=text.slice(0,mentionStart)+'@'+name+' '+text.slice(cur);
    setText(newText);setMentionQ(null);setMentionStart(-1);
    requestAnimationFrame(()=>{if(!textRef.current)return;const p=mentionStart+name.length+2;textRef.current.setSelectionRange(p,p);textRef.current.focus();});
  },[mentionStart,text]);

  const filteredMembers=useMemo(()=>mentionQ===null?[]:members.filter(m=>(m.name||'').toLowerCase().includes(mentionQ.toLowerCase())).slice(0,6),[mentionQ,members]);

  const handleTextChange=e=>{
    const val=e.target.value;const cur=e.target.selectionStart;
    setText(val);onTyping?.();
    e.target.style.height='auto';
    e.target.style.height=Math.min(e.target.scrollHeight,128)+'px';
    // detect @
    const slice=val.slice(0,cur);const match=slice.match(/@(\w*)$/);
    if(match){setMentionQ(match[1]);setMentionStart(cur-match[0].length);setMentionIdx(0);}
    else{setMentionQ(null);setMentionStart(-1);}
  };

  return(
    <div className="shrink-0 border-t border-border bg-surface">
      {/* @mention dropdown */}
      {mentionQ!==null&&filteredMembers.length>0&&(
        <div className="mx-3 mb-1 bg-surface border border-border rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-150">
          <p className="text-[10px] font-bold text-muted px-3 pt-2 pb-1">ذكر موظف</p>
          {filteredMembers.map((m,i)=>(
            <button key={m.id||m.name} onMouseDown={e=>{e.preventDefault();insertMention(m.name);}}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition ${i===mentionIdx?'bg-teal/10 text-teal':'hover:bg-surface-alt text-text'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(m.name)}`}>{m.name?.[0]?.toUpperCase()}</div>
              <span className="font-medium truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
      {/* Reply */}
      {replyTo&&(
        <div className="flex items-center gap-2 px-3 pt-2 pb-1 animate-in slide-in-from-bottom-1 duration-150">
          <div className="flex-1 bg-teal/5 border border-teal/20 rounded-xl px-3 py-1.5 text-xs text-muted truncate">
            ↩ ردّاً على <span className="font-semibold text-teal">{replyTo.sender_name}</span>: {replyTo.content||(replyTo.message_type==='image'?'📷 صورة':'🎙️ صوت')}
          </div>
          <button onClick={onCancelReply} className="text-muted hover:text-red-500 transition text-xl leading-none">×</button>
        </div>
      )}

      {/* Image preview */}
      {imgPreview&&(
        <div className="px-3 pt-2 flex items-start gap-2 animate-in slide-in-from-bottom-2 duration-200">
          <div className="relative">
            <img src={imgPreview} alt="" className="w-16 h-16 rounded-xl object-cover border border-border shadow-sm" />
            <button onClick={()=>{setImgPreview(null);setImgFile(null);}} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow">×</button>
          </div>
          <button onClick={sendImage} disabled={uploading} className="mt-1 px-4 py-2 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 disabled:opacity-50 transition">
            {uploading?'⏳ يرفع…':'📤 إرسال'}
          </button>
        </div>
      )}

      {/* File preview */}
      {attachedFile&&(
        <div className="px-3 pt-2 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200">
          <span className="text-2xl">{fileIcon(attachedFile.name)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{attachedFile.name}</p>
            <p className="text-xs text-muted">{fmtSize(attachedFile.size)}</p>
          </div>
          <button onClick={()=>setAttachedFile(null)} className="text-muted hover:text-red-500 transition">✕</button>
          <button onClick={sendFile} disabled={uploading} className="px-4 py-2 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 disabled:opacity-50 transition">
            {uploading?'⏳':'📤 إرسال'}
          </button>
        </div>
      )}

      {/* Voice recording */}
      {voice.recording&&(
        <div className="flex items-center gap-3 px-3 py-2.5 bg-red-50 border-t border-red-100 animate-in slide-in-from-bottom-2 duration-200">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-red-600 font-mono font-bold tabular-nums">{voice.fmt(voice.seconds)}</span>
          <div className="flex-1 flex items-end gap-0.5 h-6">
            {Array.from({length:30},(_,i)=>(
              <div key={i} className="flex-1 bg-red-400 rounded-full" style={{height:`${3+Math.sin(i*0.5)*5+Math.cos(i*0.9)*3}px`,animation:`pulse ${0.5+i*0.03}s ease-in-out infinite alternate`}} />
            ))}
          </div>
          <button onClick={voice.cancel} className="text-xs text-red-500 font-semibold hover:text-red-700 transition px-2">إلغاء</button>
          <button onClick={voice.stop} className="px-3 py-1.5 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 transition shadow-sm">✓ إرسال</button>
        </div>
      )}

      {/* Main input row */}
      {!voice.recording&&(
        <div className="flex items-end gap-2 p-3">
          {/* Attachment */}
          <div className="relative">
            <button onClick={()=>fileRef.current?.click()} disabled={disabled||uploading}
              className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-teal hover:border-teal/40 transition shrink-0 hover:scale-105">
              📎
            </button>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Text input + emoji */}
          <div className="flex-1 relative">
            {showEmoji&&(
              <EmojiPicker onSelect={e=>{setText(t=>t+e);textRef.current?.focus();}} onClose={()=>setShowEmoji(false)} />
            )}
            <div className="flex items-end border border-border rounded-2xl bg-surface-alt focus-within:ring-2 focus-within:ring-teal/30 focus-within:border-teal/40 transition-all overflow-hidden">
              <textarea
                ref={textRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={e=>{
                  if(mentionQ!==null&&filteredMembers.length>0){
                    if(e.key==='ArrowDown'){e.preventDefault();setMentionIdx(i=>Math.min(i+1,filteredMembers.length-1));return;}
                    if(e.key==='ArrowUp'){e.preventDefault();setMentionIdx(i=>Math.max(i-1,0));return;}
                    if(e.key==='Enter'){e.preventDefault();insertMention(filteredMembers[mentionIdx]?.name||'');return;}
                    if(e.key==='Escape'){setMentionQ(null);return;}
                  }
                  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();}
                }}
                placeholder="اكتب رسالة… (/مساعدة للأوامر)"
                rows={1}
                disabled={disabled||uploading}
                className="flex-1 px-4 py-2.5 text-sm bg-transparent text-text focus:outline-none resize-none disabled:opacity-60 max-h-32 leading-relaxed"
                style={{overflowY:'auto'}}
              />
              <button onClick={()=>setShowEmoji(v=>!v)} className="p-2.5 text-muted hover:text-teal transition shrink-0">😊</button>
            </div>
          </div>

          {/* Send / voice */}
          {text.trim()?(
            <button onClick={sendText} disabled={disabled||uploading}
              className="w-9 h-9 rounded-xl bg-teal text-navy flex items-center justify-center hover:bg-teal/90 disabled:opacity-50 transition shrink-0 shadow-sm hover:scale-105 hover:shadow-md">
              ↑
            </button>
          ):(
            <button onPointerDown={voice.start} disabled={disabled||uploading}
              className="w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-muted hover:text-teal hover:border-teal/40 transition shrink-0 hover:scale-105"
              title="اضغط باستمرار للتسجيل">
              🎙️
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ChannelItem ──────────────────────────────────────────────────
function ChannelItem({room,active,unread,lastMsg,onClick}){
  const label=room.display_name??room.name;
  return(
    <button onClick={onClick}
      className={`w-full text-start px-2.5 py-2 rounded-xl transition-all duration-150 flex items-center gap-2.5 ${active?'bg-teal/10 text-teal shadow-sm':'text-muted hover:bg-surface-alt hover:text-text'}`}>
      {room.avatar_url
        ? <img src={room.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-border" />
        : <span className={`text-[13px] w-5 text-center flex-shrink-0 font-bold ${active?'text-teal':'text-muted/50'}`}>
            {room.is_private?'🔒':room.type==='dm'?null:'#'}
          </span>}
      <div className="flex-1 min-w-0">
        <span className={`text-sm truncate block ${active?'font-bold':'font-medium'}`}>{label}</span>
        {lastMsg&&!active&&<span className="text-[10px] text-muted/60 truncate block">{lastMsg}</span>}
      </div>
      {unread>0&&(
        <span className="w-5 h-5 rounded-full bg-teal text-navy text-[9px] font-bold grid place-items-center flex-shrink-0 shadow-sm">
          {unread>9?'9+':unread}
        </span>
      )}
    </button>
  );
}

// ── DiscoverPanel ────────────────────────────────────────────────
function DiscoverPanel({allChannels,memberRoomIds,userId,userName,onClose,onRequestSent}){
  const[requests,setRequests]=useState({}),[loading,setLoading]=useState(true),[sending,setSending]=useState(null);
  const available=allChannels.filter(r=>!memberRoomIds.includes(r.id)&&!r.is_private);
  useEffect(()=>{
    (async()=>{
      if(!available.length){setLoading(false);return;}
      try{
        const{data}=await supabase.from('chat_join_requests').select('room_id,status').eq('user_id',userId).in('room_id',available.map(r=>r.id));
        const map={};(data??[]).forEach(r=>{map[r.room_id]=r.status;});
        setRequests(map);
      }catch{/* chat_join_requests table may not exist yet */}
      setLoading(false);
    })();
  },[userId]);
  const requestJoin=async room=>{
    setSending(room.id);
    try{
      if(!room.requires_approval){
        // Join directly — no approval needed
        await supabase.from('chat_room_members').upsert(
          {room_id:room.id,user_id:userId,user_name:userName,display_name:userName,role:'member',joined_at:new Date().toISOString()},
          {onConflict:'room_id,user_id'}
        );
        setRequests(p=>({...p,[room.id]:'approved'}));
        onRequestSent?.();
      }else{
        try{
          await supabase.from('chat_join_requests').upsert({room_id:room.id,room_name:room.name,user_id:userId,user_name:userName,status:'pending',requested_at:new Date().toISOString()},{onConflict:'room_id,user_id'});
          setRequests(p=>({...p,[room.id]:'pending'}));
        }catch{
          // Fallback: join directly if join_requests table missing
          await supabase.from('chat_room_members').upsert(
            {room_id:room.id,user_id:userId,user_name:userName,display_name:userName,role:'member',joined_at:new Date().toISOString()},
            {onConflict:'room_id,user_id'}
          );
          setRequests(p=>({...p,[room.id]:'approved'}));
        }
        onRequestSent?.();
      }
    }catch(e){alert('فشل: '+e.message);}finally{setSending(null);}
  };
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div><h2 className="font-bold text-text">🔍 اكتشف قنوات</h2><p className="text-[11px] text-muted mt-0.5">اطلب الانضمام لقناة</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>
        <div className="p-3 max-h-80 overflow-y-auto space-y-2">
          {loading?<div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin"/></div>
          :available.length===0?<div className="text-center py-8"><p className="text-3xl mb-2">🎉</p><p className="text-sm text-muted font-medium">أنت في كل القنوات المتاحة!</p></div>
          :available.map(room=>{
            const status=requests[room.id];
            return(
              <div key={room.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-alt border border-border hover:border-teal/30 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-teal/10 text-teal flex items-center justify-center text-lg font-bold shrink-0">#</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-text truncate">{room.name}</p><p className="text-xs text-muted truncate">{room.description}</p></div>
                {status==='pending'?<span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">⏳ معلق</span>
                :status==='approved'?<span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">✓ تم الانضمام</span>
                :status==='rejected'?<span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">✕ مرفوض</span>
                :<button onClick={()=>requestJoin(room)} disabled={sending===room.id} className="px-3 py-1.5 rounded-xl bg-teal text-navy text-[11px] font-bold hover:bg-teal/90 disabled:opacity-50 transition shrink-0">
                  {sending===room.id?'⏳':room.requires_approval?'طلب انضمام':'+ انضمام'}
                </button>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── JoinRequestsPanel ────────────────────────────────────────────
function JoinRequestsPanel({userName,onApproved,onClose}){
  const[requests,setRequests]=useState([]),[loading,setLoading]=useState(true),[acting,setActing]=useState(null);
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const{data}=await supabase.from('chat_join_requests').select('*').eq('status','pending').order('requested_at',{ascending:true});
      setRequests(data??[]);
    }catch{setRequests([]);}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);
  const approve=async req=>{
    setActing(req.id);
    try{
      await supabase.from('chat_room_members').upsert({room_id:req.room_id,user_id:req.user_id,user_name:req.user_name,display_name:req.user_name,role:'member',joined_at:new Date().toISOString()},{onConflict:'room_id,user_id'});
      await supabase.from('chat_join_requests').update({status:'approved',reviewed_by:userName,reviewed_at:new Date().toISOString()}).eq('id',req.id);
      setRequests(p=>p.filter(r=>r.id!==req.id));onApproved?.();
    }catch(e){alert('خطأ: '+e.message);}finally{setActing(null);}
  };
  const reject=async req=>{
    setActing(req.id);
    try{
      await supabase.from('chat_join_requests').update({status:'rejected',reviewed_by:userName,reviewed_at:new Date().toISOString()}).eq('id',req.id);
      setRequests(p=>p.filter(r=>r.id!==req.id));
    }catch(e){alert('خطأ: '+e.message);}finally{setActing(null);}
  };
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div><h2 className="font-bold text-text">📋 طلبات الانضمام</h2><p className="text-[11px] text-muted mt-0.5">{requests.length} طلب معلق</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>
        <div className="p-3 max-h-80 overflow-y-auto space-y-2">
          {loading?<div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin"/></div>
          :requests.length===0?<div className="text-center py-8"><p className="text-3xl mb-2">✅</p><p className="text-sm text-muted font-medium">لا توجد طلبات معلقة</p></div>
          :requests.map(req=>(
            <div key={req.id} className="px-3 py-3 rounded-xl bg-surface-alt border border-border space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${avatarColor(req.user_name)}`}>{req.user_name?.[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text">{req.user_name}</p>
                  <p className="text-xs text-muted">يريد الانضمام إلى <span className="font-medium text-text">{req.room_name}</span></p>
                </div>
                <span className="text-[10px] text-muted shrink-0">{timeLabel(req.requested_at)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>approve(req)} disabled={acting===req.id} className="flex-1 py-2 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 disabled:opacity-50 transition">✓ قبول</button>
                <button onClick={()=>reject(req)} disabled={acting===req.id} className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition">✕ رفض</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── LightboxModal ────────────────────────────────────────────────
function LightboxModal({url,onClose}){
  useEffect(()=>{
    const h=e=>{if(e.key==='Escape')onClose();};
    document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h);
  },[onClose]);
  return(
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 end-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition text-xl">✕</button>
      <img src={url} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl object-contain animate-in zoom-in-90 duration-200" onClick={e=>e.stopPropagation()} />
    </div>
  );
}

// ── CreateChannelPanel ───────────────────────────────────────────
function CreateChannelPanel({userId,userName,onCreated,onClose}){
  const[name,setName]=useState(''),[desc,setDesc]=useState(''),[team,setTeam]=useState('عام'),[needsApproval,setNeedsApproval]=useState(false),[saving,setSaving]=useState(false);
  const TEAMS=['عام','ميديا','سوريا','تركيا','إدارة','مبيعات','دبي'];
  const create=async()=>{
    if(!name.trim()){alert('أدخل اسم القناة');return;}setSaving(true);
    try{
      const{data:room,error}=await supabase.from('chat_rooms').insert({type:'group',name:name.trim(),description:desc.trim()||null,team,requires_approval:needsApproval,is_private:false,created_by:userId,created_by_name:userName}).select().single();
      if(error)throw error;
      try{ await supabase.from('chat_room_members').insert({room_id:room.id,user_id:userId,user_name:userName,display_name:userName,role:'admin',joined_at:new Date().toISOString()}); }catch{}
      onCreated?.(room);
    }catch(e){alert('خطأ: '+e.message);}finally{setSaving(false);}
  };
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div><h2 className="font-bold text-text"># قناة جديدة</h2><p className="text-[11px] text-muted mt-0.5">أنشئ قناة عامة للفريق</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">اسم القناة *</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: 🇸🇾 فريق سوريا" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">وصف (اختياري)</label>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="وصف القناة…" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">الفريق</label>
            <select value={team} onChange={e=>setTeam(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30">
              {TEAMS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer bg-surface-alt rounded-xl px-3 py-2.5 border border-border hover:border-teal/40 transition">
            <input type="checkbox" checked={needsApproval} onChange={e=>setNeedsApproval(e.target.checked)} className="w-4 h-4 accent-teal" />
            <div>
              <p className="text-sm text-text font-medium">يستلزم موافقة الانضمام</p>
              <p className="text-[10px] text-muted">الأعضاء الجدد يحتاجون موافقتك</p>
            </div>
          </label>
          <button onClick={create} disabled={saving||!name.trim()} className="w-full py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition shadow-sm">
            {saving?'⏳ جاري الإنشاء…':'✓ إنشاء القناة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CreateGroupPanel ─────────────────────────────────────────────
function CreateGroupPanel({userId,userName,onCreated,onClose}){
  const[name,setName]=useState(''),[desc,setDesc]=useState(''),[profiles,setProfiles]=useState([]),[selected,setSelected]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  useEffect(()=>{supabase.from('profiles').select('id,employee_name,team').eq('is_active',true).neq('id',userId).order('employee_name').then(({data})=>{setProfiles(data??[]);setLoading(false);});},[userId]);
  const toggle=id=>setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const create=async()=>{
    if(!name.trim()){alert('أدخل اسم المجموعة');return;}setSaving(true);
    try{
      const{data:room,error}=await supabase.from('chat_rooms').insert({type:'group',name:name.trim(),description:desc.trim()||null,created_by:userId,created_by_name:userName,requires_approval:false,is_private:true,team:'خاص'}).select().single();
      if(error)throw error;
      await supabase.from('chat_room_members').insert([
        {room_id:room.id,user_id:userId,user_name:userName,display_name:userName,role:'admin',joined_at:new Date().toISOString()},
        ...selected.map(uid=>{const p=profiles.find(x=>x.id===uid);return{room_id:room.id,user_id:uid,user_name:p?.employee_name,display_name:p?.employee_name,role:'member',joined_at:new Date().toISOString()};})
      ]);
      onCreated?.(room);
    }catch(e){alert('خطأ: '+e.message);}finally{setSaving(false);}
  };
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <div><h2 className="font-bold text-text">🔒 مجموعة خاصة جديدة</h2><p className="text-[11px] text-muted mt-0.5">اختر الأعضاء</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="اسم المجموعة *" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="وصف (اختياري)" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <div>
            <p className="text-[11px] font-bold text-muted mb-2">الأعضاء ({selected.length} مختار)</p>
            <div className="max-h-44 overflow-y-auto space-y-1 border border-border rounded-xl p-2">
              {loading?<div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-teal/30 border-t-teal rounded-full animate-spin"/></div>
              :profiles.map(p=>(
                <button key={p.id} onClick={()=>toggle(p.id)} className={`w-full text-start px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors ${selected.includes(p.id)?'bg-teal/10 text-teal':'hover:bg-surface-alt text-text'}`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${selected.includes(p.id)?'border-teal bg-teal':'border-border'}`}>
                    {selected.includes(p.id)&&<span className="text-white text-[10px]">✓</span>}
                  </div>
                  <span className="flex-1 truncate">{p.employee_name}</span>
                  <span className="text-[10px] text-muted">{p.team}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={create} disabled={saving||!name.trim()} className="w-full py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition shadow-sm">
            {saving?'⏳ جاري الإنشاء…':'✓ إنشاء المجموعة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GroupInfoPanel — members, photo, rename, add/remove, leave ───
function GroupInfoPanel({room,userId,userName,isApprover,onClose,onUpdated}){
  const[members,setMembers]=useState([]),[loading,setLoading]=useState(true);
  const[name,setName]=useState(room.name||'');
  const[desc,setDesc]=useState(room.description||'');
  const[avatar,setAvatar]=useState(room.avatar_url||null);
  const[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[acting,setActing]=useState(null);
  const[showAdd,setShowAdd]=useState(false),[candidates,setCandidates]=useState([]),[addSearch,setAddSearch]=useState('');
  const fileRef=useRef(null);
  // Group admin = approver role OR creator OR has admin role in this room's membership
  const myMembership=members.find(m=>m.user_id===userId);
  const canManage=isApprover||room.created_by===userId||myMembership?.role==='admin';

  const loadMembers=useCallback(async()=>{
    setLoading(true);
    try{
      const{data}=await supabase.from('chat_room_members').select('user_id,user_name,display_name,role,joined_at').eq('room_id',room.id).order('joined_at');
      setMembers(data??[]);
    }catch{setMembers([]);}
    setLoading(false);
  },[room.id]);
  useEffect(()=>{loadMembers();},[loadMembers]);

  const saveInfo=async()=>{
    if(!name.trim())return;setSaving(true);
    try{
      await supabase.from('chat_rooms').update({name:name.trim(),description:desc.trim()||null}).eq('id',room.id);
      onUpdated?.();
    }catch(e){alert('خطأ: '+e.message);}finally{setSaving(false);}
  };

  const onPhoto=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;setUploading(true);
    try{
      const ext=file.name.split('.').pop(),path=`group-avatars/${room.id}_${Date.now()}.${ext}`;
      const{data,error}=await supabase.storage.from('chat-files').upload(path,file,{contentType:file.type,upsert:true});
      if(error)throw error;
      const{data:u}=supabase.storage.from('chat-files').getPublicUrl(data.path);
      await supabase.from('chat_rooms').update({avatar_url:u.publicUrl}).eq('id',room.id);
      setAvatar(u.publicUrl);onUpdated?.();
    }catch(err){alert('فشل رفع الصورة: '+err.message);}finally{setUploading(false);}
  };

  const removeMember=async m=>{
    if(!confirm(`إزالة ${m.display_name||m.user_name} من المجموعة؟`))return;
    setActing(m.user_id);
    try{
      await supabase.from('chat_room_members').delete().eq('room_id',room.id).eq('user_id',m.user_id);
      setMembers(p=>p.filter(x=>x.user_id!==m.user_id));
    }catch(e){alert('خطأ: '+e.message);}finally{setActing(null);}
  };

  const leaveGroup=async()=>{
    if(!confirm('مغادرة هذه المجموعة؟'))return;
    setActing(userId);
    try{
      await supabase.from('chat_room_members').delete().eq('room_id',room.id).eq('user_id',userId);
      onUpdated?.();onClose?.();
    }catch(e){alert('خطأ: '+e.message);}finally{setActing(null);}
  };

  const openAdd=async()=>{
    setShowAdd(true);
    const memberIds=members.map(m=>m.user_id);
    const{data}=await supabase.from('profiles').select('id,employee_name,team').eq('is_active',true).order('employee_name');
    setCandidates((data??[]).filter(p=>!memberIds.includes(p.id)));
  };
  const addMember=async p=>{
    setActing(p.id);
    try{
      await supabase.from('chat_room_members').upsert({room_id:room.id,user_id:p.id,user_name:p.employee_name,display_name:p.employee_name,role:'member',joined_at:new Date().toISOString()},{onConflict:'room_id,user_id'});
      setMembers(prev=>[...prev,{user_id:p.id,user_name:p.employee_name,display_name:p.employee_name,role:'member',joined_at:new Date().toISOString()}]);
      setCandidates(prev=>prev.filter(x=>x.id!==p.id));
    }catch(e){alert('خطأ: '+e.message);}finally{setActing(null);}
  };
  const filteredCandidates=candidates.filter(p=>!addSearch||p.employee_name?.toLowerCase().includes(addSearch.toLowerCase()));

  return(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250 max-h-[85vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="font-bold text-text text-sm">معلومات المجموعة</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {/* Avatar + name */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              {avatar
                ? <img src={avatar} alt="" className="w-20 h-20 rounded-full object-cover border border-border" />
                : <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold ${avatarColor(name)}`}>{name?.[0]?.toUpperCase()||'#'}</div>}
              {canManage&&(
                <button onClick={()=>fileRef.current?.click()} disabled={uploading}
                  className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-teal text-navy flex items-center justify-center text-xs shadow hover:bg-teal/90 transition disabled:opacity-50">
                  {uploading?'⏳':'📷'}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </div>
          </div>
          {canManage?(
            <div className="space-y-2">
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="اسم المجموعة" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text text-center font-bold focus:outline-none focus:ring-2 focus:ring-teal/30" />
              <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="وصف (اختياري)" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text text-center focus:outline-none focus:ring-2 focus:ring-teal/30" />
              {(name!==room.name||desc!==(room.description||''))&&(
                <button onClick={saveInfo} disabled={saving||!name.trim()} className="w-full py-2 rounded-xl bg-teal text-navy text-xs font-bold hover:bg-teal/90 disabled:opacity-50 transition">{saving?'⏳ يحفظ…':'💾 حفظ التعديلات'}</button>
              )}
            </div>
          ):(
            <div className="text-center"><p className="font-bold text-text">{room.name}</p>{room.description&&<p className="text-xs text-muted mt-0.5">{room.description}</p>}</div>
          )}

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-muted">الأعضاء ({members.length})</p>
              {canManage&&<button onClick={openAdd} className="text-[11px] text-teal font-bold hover:underline">+ إضافة عضو</button>}
            </div>
            {loading?<div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-teal/30 border-t-teal rounded-full animate-spin"/></div>
            :<div className="space-y-1 max-h-52 overflow-y-auto">
              {members.map(m=>(
                <div key={m.user_id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-surface-alt transition">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${avatarColor(m.display_name||m.user_name)}`}>{(m.display_name||m.user_name)?.[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{m.display_name||m.user_name}{m.user_id===userId&&<span className="text-[10px] text-muted"> (أنت)</span>}</p>
                  </div>
                  {m.role==='admin'&&<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal/10 text-teal font-bold shrink-0">مشرف</span>}
                  {canManage&&m.user_id!==userId&&room.created_by!==m.user_id&&(
                    <button onClick={()=>removeMember(m)} disabled={acting===m.user_id} className="text-muted hover:text-red-500 transition text-xs shrink-0 disabled:opacity-40" title="إزالة">✕</button>
                  )}
                </div>
              ))}
            </div>}
          </div>

          {/* Leave */}
          {room.created_by!==userId&&(
            <button onClick={leaveGroup} disabled={acting===userId} className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-bold hover:bg-red-100 disabled:opacity-50 transition">🚪 مغادرة المجموعة</button>
          )}
        </div>
      </div>

      {/* Add member sub-panel */}
      {showAdd&&(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-bold text-text text-sm">إضافة عضو</h2>
              <button onClick={()=>setShowAdd(false)} className="w-7 h-7 rounded-lg bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
            </div>
            <div className="p-3">
              <input value={addSearch} onChange={e=>setAddSearch(e.target.value)} placeholder="بحث بالاسم…" autoFocus className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 mb-2" />
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {filteredCandidates.length===0?<p className="text-center text-muted text-sm py-4">لا يوجد أحد لإضافته</p>
                :filteredCandidates.map(p=>(
                  <button key={p.id} onClick={()=>addMember(p)} disabled={acting===p.id} className="w-full text-start px-3 py-2 rounded-xl hover:bg-surface-alt transition flex items-center gap-2.5 disabled:opacity-50">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${avatarColor(p.employee_name)}`}>{p.employee_name?.[0]?.toUpperCase()}</div>
                    <span className="flex-1 text-sm font-medium text-text truncate">{p.employee_name}</span>
                    <span className="text-[10px] text-muted">{p.team}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Main ChatScreen
// ══════════════════════════════════════════════════════════════════
export default function ChatScreen(){
  const{id:userId,name:userName,role,team:userTeam}=useAuth();
  const isApprover=APPROVER_ROLES.includes(role);
  const isAdmin=role===ROLES.ADMIN;
  const location=useLocation();
  const dmTarget=useMemo(()=>new URLSearchParams(location.search).get('dm'),[location.search]);

  // State
  const[rooms,setRooms]=useState([]);
  const[allChannels,setAllChannels]=useState([]);
  const[memberRoomIds,setMemberRoomIds]=useState([]);
  const[activeRoom,setActiveRoom]=useState(null);
  // Mobile WhatsApp-style nav: 'list' shows channels/DMs, 'chat' shows the
  // open conversation full-screen. On desktop (sm+) both panes show together.
  const[mobileView,setMobileView]=useState('list');
  const openRoom=(r)=>{setActiveRoom(r);setMobileView('chat');};
  const[messages,setMessages]=useState([]);
  const[reactions,setReactions]=useState({});
  const[lastMsgs,setLastMsgs]=useState({});
  const[unreadCounts,setUnreadCounts]=useState({});
  const[loading,setLoading]=useState(true);
  const[msgLoading,setMsgLoading]=useState(false);
  const[loadingOlder,setLoadingOlder]=useState(false);  // جلب الرسائل الأقدم (pagination)
  const[sending,setSending]=useState(false);
  const[sidebarOpen,setSidebarOpen]=useState(true);
  const[replyTo,setReplyTo]=useState(null);
  const[allProfiles,setAllProfiles]=useState([]);
  const[pendingCount,setPendingCount]=useState(0);
  const[typingUsers,setTypingUsers]=useState([]);
  const[pinnedMsg,setPinnedMsg]=useState(null);
  const[roomReadMap,setRoomReadMap]=useState({});  // {userId: read_at} for current room
  const[roomMembers,setRoomMembers]=useState([]);  // [{id, name}] for @mention
  const[forwardMsg,setForwardMsg]=useState(null);  // message to forward

  // Panels
  const[showDiscover,setShowDiscover]=useState(false);
  const[showRequests,setShowRequests]=useState(false);
  const[showCreateGroup,setShowCreateGroup]=useState(false);
  const[showCreateChannel,setShowCreateChannel]=useState(false);
  const[showNewDm,setShowNewDm]=useState(false);
  const[showGroupInfo,setShowGroupInfo]=useState(false);
  const[dmSearch,setDmSearch]=useState('');
  const[lightboxUrl,setLightboxUrl]=useState(null);
  const[showScrollBtn,setShowScrollBtn]=useState(false);
  const[searchQuery,setSearchQuery]=useState('');
  const[showSearch,setShowSearch]=useState(false);
  const[onlineUsers,setOnlineUsers]=useState([]);
  const[globalOnline,setGlobalOnline]=useState(()=>new Set());
  const[lastSeenMap,setLastSeenMap]=useState({});

  const msgEndRef=useRef(null),subRef=useRef(null),msgContainerRef=useRef(null),globalSubRef=useRef(null);
  const typingTimers=useRef({});
  const skipAutoScrollRef=useRef(false);  // عند تحميل الأقدم: لا تنزل للأسفل
  const loadingOlderRef=useRef(false);    // حارس إعادة دخول لجلب الأقدم
  const loadOlderRef=useRef(null);         // أحدث نسخة من loadOlder (لمعالج التمرير الثابت)
  const messagesRef=useRef([]);            // أحدث قائمة رسائل (بلا stale closure)
  const hasMoreOlderRef=useRef(false);     // هل بعد في أقدم (يمنع استعلامات فارغة متكرّرة)

  // ── Pending count ──────────────────────────────────────────────
  const loadPendingCount=useCallback(async()=>{
    if(!isApprover)return;
    try{
      const{count}=await supabase.from('chat_join_requests').select('*',{count:'exact',head:true}).eq('status','pending');
      setPendingCount(count??0);
    }catch{setPendingCount(0);}
  },[isApprover]);

  // ── Global presence (online dots + last seen) ─────────────────
  useEffect(()=>{
    if(!userId||!userName)return;
    const ch=supabase.channel('presence:global',{config:{presence:{key:userId}}});
    globalSubRef.current=ch;
    ch.on('presence',{event:'sync'},()=>{
      const state=ch.presenceState()??{};
      const names=new Set(Object.values(state).flat().map(p=>p.userName).filter(Boolean));
      setGlobalOnline(names);
    })
    .on('presence',{event:'leave'},({leftPresences})=>{
      const now=new Date().toISOString();
      setLastSeenMap(prev=>{
        const next={...prev};
        leftPresences.forEach(p=>{if(p.userName&&p.userName!==userName)next[p.userName]=now;});
        return next;
      });
    })
    .subscribe(async status=>{
      if(status==='SUBSCRIBED'){await ch.track({userId,userName}).catch(()=>{});}
    });
    return()=>{ch.unsubscribe();};
  },[userId,userName]);

  // ── Load unread counts (2 queries for all rooms) ───────────────
  const loadUnreadCounts=useCallback(async(allRooms)=>{
    if(!allRooms.length||!userId)return;
    const roomIds=allRooms.map(r=>r.id);
    const[{data:lastReads},{data:recentMsgs}]=await Promise.all([
      supabase.from('chat_last_read').select('room_id,read_at').eq('user_id',userId).in('room_id',roomIds),
      supabase.from('chat_messages').select('room_id,created_at,sender_id').in('room_id',roomIds).neq('sender_id',userId).order('created_at',{ascending:false}).limit(300),
    ]);
    const lastReadMap={};
    (lastReads??[]).forEach(lr=>{lastReadMap[lr.room_id]=new Date(lr.read_at);});
    const counts={};
    (recentMsgs??[]).forEach(m=>{
      const lr=lastReadMap[m.room_id];
      if(!lr||new Date(m.created_at)>lr) counts[m.room_id]=(counts[m.room_id]??0)+1;
    });
    setUnreadCounts(counts);
  },[userId]);

  // ── Mark room as read ──────────────────────────────────────────
  const markAsRead=useCallback(async(roomId)=>{
    await supabase.from('chat_last_read').upsert({room_id:roomId,user_id:userId,read_at:new Date().toISOString()},{onConflict:'room_id,user_id'});
    setUnreadCounts(p=>({...p,[roomId]:0}));
  },[userId]);

  // ── Load pinned message ────────────────────────────────────────
  const loadPinned=useCallback(async(roomId)=>{
    try{
      const{data}=await supabase.from('chat_pinned').select('*').eq('room_id',roomId).maybeSingle();
      setPinnedMsg(data??null);
    }catch{setPinnedMsg(null);}  // gracefully handle missing table
  },[]);

  // ── Load per-user last_read for read receipts ─────────────────
  const loadRoomReads=useCallback(async(roomId)=>{
    try{
      const{data}=await supabase.from('chat_last_read').select('user_id,read_at').eq('room_id',roomId);
      const m={};(data??[]).forEach(r=>{m[r.user_id]=r.read_at;});
      setRoomReadMap(m);
    }catch{setRoomReadMap({});}
  },[]);

  // ── Load room members for @mention ───────────────────────────
  const loadRoomMembers=useCallback(async(roomId)=>{
    try{
      const{data}=await supabase.from('chat_room_members').select('user_id,display_name,user_name').eq('room_id',roomId);
      setRoomMembers((data??[]).map(m=>({id:m.user_id,name:m.display_name||m.user_name||''})).filter(m=>m.name&&m.id!==userId));
    }catch{setRoomMembers([]);}
  },[userId]);

  // ── Load rooms ─────────────────────────────────────────────────
  const loadRooms=useCallback(async()=>{
    if(!userId)return;
    setLoading(true);
    try{
      let{data:allGroups,error}=await supabase.from('chat_rooms').select('id,type,name,team,description,requires_approval,is_private,avatar_url,created_by,created_at').eq('type','group').order('created_at');
      if(error?.code==='42P01'){setLoading(false);return;}
      if(!allGroups?.length){
        const{data:seeded}=await supabase.from('chat_rooms').insert(DEFAULT_CHANNELS.map(c=>({type:'group',...c,created_by:userId}))).select('id,type,name,team,description,requires_approval,is_private,avatar_url,created_by');
        allGroups=seeded??[];
      }
      setAllChannels(allGroups);

      // ── Memberships ───────────────────────────────────────────────
      // rowMemberIds = rooms with an actual chat_room_members row (source of truth).
      // memberIds    = display set (rows ∪ approved join requests).
      let rowMemberIds=[];
      try{
        const{data:memberships}=await supabase.from('chat_room_members').select('room_id').eq('user_id',userId);
        rowMemberIds=(memberships??[]).map(m=>m.room_id);
      }catch{}
      let memberIds=[...rowMemberIds];

      // Also include rooms where join request was approved
      try{
        const{data:approved}=await supabase.from('chat_join_requests').select('room_id').eq('user_id',userId).eq('status','approved');
        (approved??[]).forEach(r=>{if(!memberIds.includes(r.room_id))memberIds.push(r.room_id);});
      }catch{}

      // Auto-join ALL public channels that lack an actual membership row
      // (base on rowMemberIds, NOT memberIds, so approved-request rooms still get a real row).
      const toJoin=allGroups
        .filter(r=>!r.is_private&&!rowMemberIds.includes(r.id))
        .map(r=>({room_id:r.id,user_id:userId,user_name:userName,display_name:userName,role:'member',joined_at:new Date().toISOString()}));
      if(toJoin.length){
        try{ await supabase.from('chat_room_members').upsert(toJoin,{onConflict:'room_id,user_id'}); }catch{}
        toJoin.forEach(m=>{if(!memberIds.includes(m.room_id))memberIds.push(m.room_id);});
      }
      setMemberRoomIds([...memberIds]);

      const myGroups=allGroups.filter(r=>memberIds.includes(r.id));

      // DMs
      let dmRooms=[];
      try{
        if(memberIds.length){
          const{data:dms}=await supabase.from('chat_rooms').select('id,type,name,team').eq('type','dm').in('id',memberIds);
          if(dms?.length){
            const enriched=await Promise.all(dms.map(async r=>{
              try{
                const{data:members}=await supabase.from('chat_room_members').select('user_id,display_name').eq('room_id',r.id);
                const other=members?.find(m=>m.user_id!==userId);
                return{...r,display_name:other?.display_name??r.name};
              }catch{return r;}
            }));
            dmRooms=enriched;
          }
        }
      }catch{}

      const allRooms=[...myGroups,...dmRooms];
      setRooms(allRooms);

      // Last messages + unread counts
      if(allRooms.length){
        try{
          const{data:lms}=await supabase.from('chat_messages').select('room_id,content,message_type,created_at,sender_id').in('room_id',allRooms.map(r=>r.id)).order('created_at',{ascending:false}).limit(200);
          const map={};
          (lms??[]).forEach(m=>{if(!map[m.room_id])map[m.room_id]=m.message_type==='text'?m.content:m.message_type==='image'?'📷 صورة':m.message_type==='file'?`📎 ${m.file_name||'ملف'}`:'🎙️ رسالة صوتية';});
          setLastMsgs(map);
        }catch{}
        try{ await loadUnreadCounts(allRooms); }catch{}
      }

      if(allRooms.length&&!activeRoom)setActiveRoom(allRooms[0]);
    }finally{setLoading(false);}
  },[userId,userTeam,isApprover,loadUnreadCounts]);

  useEffect(()=>{loadRooms();loadPendingCount();},[loadRooms,loadPendingCount]);

  // ── Auto-open DM from ?dm= URL param ──────────────────────────
  useEffect(()=>{
    if(!dmTarget||!userId||!rooms.length)return;
    // Check if DM already exists
    const existing=rooms.find(r=>r.type==='dm'&&r.display_name===dmTarget);
    if(existing){setActiveRoom(existing);setSidebarOpen(false);setMobileView('chat');return;}
    // Create new DM room
    const createDm=async()=>{
      try{
        const{data:otherProfile}=await supabase.from('profiles').select('id,employee_name').eq('employee_name',dmTarget).single();
        if(!otherProfile)return;
        const dmName=[userName,otherProfile.employee_name].sort().join('::');
        const{data:room}=await supabase.from('chat_rooms').insert({type:'dm',name:dmName,team:'dm',created_by:userId,created_by_name:userName,requires_approval:false,is_private:true}).select().single();
        if(!room)return;
        await supabase.from('chat_room_members').insert([
          {room_id:room.id,user_id:userId,user_name:userName,display_name:userName,role:'member',joined_at:new Date().toISOString()},
          {room_id:room.id,user_id:otherProfile.id,user_name:otherProfile.employee_name,display_name:otherProfile.employee_name,role:'member',joined_at:new Date().toISOString()},
        ]);
        const roomWithDisplay={...room,display_name:dmTarget};
        setRooms(r=>[...r,roomWithDisplay]);
        setActiveRoom(roomWithDisplay);
        setSidebarOpen(false);setMobileView('chat');
      }catch{}
    };
    createDm();
  },[dmTarget,userId,userName,rooms.length]);

  // ── Load messages ──────────────────────────────────────────────
  const loadMessages=useCallback(async(roomId)=>{
    if(!roomId)return;setMsgLoading(true);
    // جيب أحدث 200 رسالة (تنازلي) ثم اعكس لعرض تصاعدي — وإلا تظهر أقدم 200 فقط
    const{data:latest}=await supabase.from('chat_messages').select('*').eq('room_id',roomId).order('created_at',{ascending:false}).limit(200);
    const data=(latest??[]).slice().reverse();
    setMessages(data);
    hasMoreOlderRef.current=(latest??[]).length>=200;  // في رسائل أقدم لو رجع 200 كاملة
    if(data?.length){
      const{data:rxs}=await supabase.from('chat_reactions').select('*').in('message_id',data.map(m=>m.id));
      const map={};(rxs??[]).forEach(r=>{if(!map[r.message_id])map[r.message_id]=[];map[r.message_id].push(r);});
      setReactions(map);
    }
    setMsgLoading(false);
  },[]);

  // ── إعادة جلب التفاعلات فقط (دون لمس مصفوفة الرسائل) ───────────
  // كان اشتراك chat_reactions يستدعي loadMessages الكامل على *أي* تفاعل
  // بأي غرفة → يمحو التاريخ المُرحّل ويقفز لأسفل («رسائل تختفي»). الآن
  // نُحدّث خريطة التفاعلات للرسائل المحمّلة فقط.
  const reloadReactions=useCallback(async()=>{
    const ids=messagesRef.current.map(m=>m.id).filter(Boolean).slice(-400);
    if(!ids.length)return;
    const{data}=await supabase.from('chat_reactions').select('*').in('message_id',ids);
    const map={};(data??[]).forEach(r=>{(map[r.message_id]=map[r.message_id]||[]).push(r);});
    setReactions(map);
  },[]);

  // ── شبكة أمان غير هدّامة عند رجوع التبويب ──────────────────────
  // تدمج أحدث 200 في المصفوفة الحالية (تلتقط ما فات أثناء الغياب) بلا
  // حذف التاريخ المُرحّل ولا قفز التمرير إن كان المستخدم يقرأ الأعلى.
  const catchUpMessages=useCallback(async(roomId)=>{
    if(!roomId)return;
    const{data:latest}=await supabase.from('chat_messages').select('*')
      .eq('room_id',roomId).order('created_at',{ascending:false}).limit(200);
    const fresh=(latest??[]).slice().reverse();
    if(!fresh.length)return;
    if(hasMessageChanges(messagesRef.current,fresh)){
      const el=msgContainerRef.current;
      const atBottom=!el||el.scrollHeight-el.scrollTop-el.clientHeight<150;
      if(!atBottom)skipAutoScrollRef.current=true; // أبقِ موضع القراءة
      setMessages(prev=>mergeMessagesById(prev,fresh));
    }
    const{data:rxs}=await supabase.from('chat_reactions').select('*').in('message_id',fresh.map(m=>m.id));
    if(rxs){const add={};rxs.forEach(r=>{(add[r.message_id]=add[r.message_id]||[]).push(r);});
      setReactions(prev=>{const map={...prev};fresh.forEach(m=>{map[m.id]=add[m.id]||[];});return map;});}
  },[]);

  // ── تحميل الرسائل الأقدم (pagination عند السحب للأعلى) ──────────
  // يجيب 200 رسالة أقدم من أقدم رسالة محمّلة ويُلصقها بالأعلى مع حفظ موضع
  // التمرير، حتى يشوف الفريق كل التاريخ مش آخر 200 فقط.
  const loadOlder=useCallback(async()=>{
    if(loadingOlderRef.current||!hasMoreOlderRef.current||!activeRoom?.id)return;
    const el=msgContainerRef.current;
    const oldest=messagesRef.current[0];
    if(!oldest||!el)return;
    loadingOlderRef.current=true;setLoadingOlder(true);
    const prevH=el.scrollHeight,prevTop=el.scrollTop;
    try{
      const{data:older}=await supabase.from('chat_messages').select('*')
        .eq('room_id',activeRoom.id).lt('created_at',oldest.created_at)
        .order('created_at',{ascending:false}).limit(200);
      const batch=(older??[]).slice().reverse();
      if(batch.length){
        skipAutoScrollRef.current=true;
        setMessages(p=>{const ids=new Set(p.map(m=>m.id));return[...batch.filter(m=>!ids.has(m.id)),...p];});
        const{data:rxs}=await supabase.from('chat_reactions').select('*').in('message_id',batch.map(m=>m.id));
        if(rxs?.length)setReactions(prev=>{const map={...prev};rxs.forEach(r=>{(map[r.message_id]=map[r.message_id]||[]).push(r);});return map;});
        // احفظ موضع التمرير: أبقِ نفس الرسالة أمام عين المستخدم بعد الإلصاق
        requestAnimationFrame(()=>{const e2=msgContainerRef.current;if(e2)e2.scrollTop=e2.scrollHeight-prevH+prevTop;});
      }
      hasMoreOlderRef.current=batch.length>=200;
    }catch{/* best-effort */}
    loadingOlderRef.current=false;setLoadingOlder(false);
  },[activeRoom?.id]);
  loadOlderRef.current=loadOlder;

  // ── Broadcast typing (debounced 2s) ───────────────────────────
  const broadcastTyping=useCallback(()=>{
    if(!subRef.current||!userId)return;
    try{subRef.current.send({type:'broadcast',event:'typing',payload:{userId,userName}});}catch{}
  },[userId,userName]);

  // ── Auto-refresh sidebar when membership changes ──────────────
  useEffect(()=>{
    if(!userId)return;
    const ch=supabase.channel(`members:${userId}:${Date.now()}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_room_members',filter:`user_id=eq.${userId}`},()=>{
        loadRooms();
      })
      .subscribe();
    return()=>{ch.unsubscribe();};
  },[userId,loadRooms]);

  // ── Room subscription ──────────────────────────────────────────
  useEffect(()=>{
    if(!activeRoom?.id)return;
    setReplyTo(null);setTypingUsers([]);setPinnedMsg(null);setRoomReadMap({});setRoomMembers([]);
    loadMessages(activeRoom.id);
    loadPinned(activeRoom.id);
    loadRoomReads(activeRoom.id);
    loadRoomMembers(activeRoom.id);
    markAsRead(activeRoom.id);

    subRef.current?.unsubscribe();
    setOnlineUsers([]);
    subRef.current=supabase.channel(`room4:${activeRoom.id}:${Date.now()}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`room_id=eq.${activeRoom.id}`},payload=>{
        setMessages(p=>p.some(m=>m.id===payload.new.id)?p:[...p,payload.new]);
        setLastMsgs(p=>({...p,[activeRoom.id]:payload.new.message_type==='text'?payload.new.content:payload.new.message_type==='image'?'📷 صورة':'🎙️ رسالة صوتية'}));
        markAsRead(activeRoom.id);
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'chat_messages',filter:`room_id=eq.${activeRoom.id}`},payload=>{
        setMessages(p=>p.map(m=>m.id===payload.new.id?payload.new:m));
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'chat_reactions'},()=>reloadReactions())
      .on('broadcast',{event:'typing'},({payload})=>{
        if(payload.userId===userId)return;
        setTypingUsers(p=>[...new Set([...p,payload.userName])]);
        clearTimeout(typingTimers.current[payload.userId]);
        typingTimers.current[payload.userId]=setTimeout(()=>setTypingUsers(p=>p.filter(n=>n!==payload.userName)),3000);
      })
      .on('presence',{event:'sync'},()=>{
        const state=subRef.current?.presenceState()??{};
        const names=[...new Set(Object.values(state).flat().map(p=>p.userName).filter(Boolean))];
        setOnlineUsers(names);
      })
      .subscribe(async status=>{
        if(status==='SUBSCRIBED'&&subRef.current){
          await subRef.current.track({userId,userName}).catch(()=>{});
        }
      });
    return()=>{subRef.current?.unsubscribe();};
  },[activeRoom?.id,loadMessages,reloadReactions,loadPinned,loadRoomReads,loadRoomMembers,markAsRead,userId]);

  useEffect(()=>{
    messagesRef.current=messages;
    // عند إلصاق رسائل أقدم (pagination) لا تنزل للأسفل — حافظ على موضع القراءة.
    if(skipAutoScrollRef.current){skipAutoScrollRef.current=false;return;}
    msgEndRef.current?.scrollIntoView({behavior:'smooth'});
  },[messages]);

  // ── شبكة أمان: أعد جلب الرسائل عند رجوع التركيز/ظهور التبويب ──────
  // على الموبايل/PWA ينقطع سوكِت realtime بالخلفية فتضيع رسائل وصلت
  // أثناء الغياب. عند العودة نعيد التحميل ونعلّم كمقروء.
  useEffect(()=>{
    if(!activeRoom?.id)return;
    const refetch=()=>{ if(document.visibilityState==='visible'){ catchUpMessages(activeRoom.id); markAsRead(activeRoom.id); } };
    window.addEventListener('focus',refetch);
    document.addEventListener('visibilitychange',refetch);
    return()=>{ window.removeEventListener('focus',refetch); document.removeEventListener('visibilitychange',refetch); };
  },[activeRoom?.id,catchUpMessages,markAsRead]);

  // ── Send ───────────────────────────────────────────────────────
  const handleSend=async msgData=>{
    if(!activeRoom||!userId)return;setSending(true);
    try{
      const payload={room_id:activeRoom.id,sender_id:userId,sender_name:userName,created_at:new Date().toISOString(),...msgData};
      if(replyTo){payload.reply_to=replyTo.id;payload.reply_preview=replyTo.content?replyTo.content.slice(0,60):replyTo.message_type==='image'?'📷 صورة':'🎙️ صوت';}
      // أدرج وأرجِع الصف فوراً — لا تعتمد على realtime وحده (لو تعطّل تختفي الرسالة).
      const{data:inserted,error}=await supabase.from('chat_messages').insert(payload).select().single();
      if(error)throw error;
      // optimistic add: تظهر الرسالة فوراً عند المرسِل؛ معالج realtime يزيل التكرار بالـid.
      if(inserted)setMessages(p=>p.some(m=>m.id===inserted.id)?p:[...p,inserted]);
      setLastMsgs(p=>({...p,[activeRoom.id]:msgData.message_type==='text'?msgData.content:msgData.message_type==='image'?'📷 صورة':msgData.message_type==='voice'?'🎙️ رسالة صوتية':`📎 ${msgData.file_name||'ملف'}`}));
      setReplyTo(null);
      if(msgData.message_type==='text'&&msgData.content?.startsWith('/'))
        buildBotResponse(msgData.content,activeRoom.id,userId,userName).then(b=>setMessages(p=>[...p,b])).catch(()=>{});
    }catch(e){alert('فشل الإرسال: '+e.message);}finally{setSending(false);}
  };

  // ── Edit ───────────────────────────────────────────────────────
  const handleEdit=async(msgId,newContent)=>{
    await supabase.from('chat_messages').update({content:newContent,edited_at:new Date().toISOString()}).eq('id',msgId);
    setMessages(p=>p.map(m=>m.id===msgId?{...m,content:newContent,edited_at:new Date().toISOString()}:m));
  };

  // ── Delete ─────────────────────────────────────────────────────
  const handleDelete=async msgId=>{
    if(!confirm('تأكيد حذف الرسالة؟'))return;
    await supabase.from('chat_messages').update({is_deleted:true,content:'',file_url:null}).eq('id',msgId);
    setMessages(p=>p.map(m=>m.id===msgId?{...m,is_deleted:true,content:''}:m));
  };

  // ── Pin ────────────────────────────────────────────────────────
  const handlePin=async msg=>{
    const content=msg.content||(msg.message_type==='image'?'📷 صورة':msg.message_type==='file'?`📎 ${msg.file_name}`:'🎙️ صوت');
    await supabase.from('chat_pinned').upsert({room_id:activeRoom.id,message_id:msg.id,content,pinned_by:userName,pinned_at:new Date().toISOString()},{onConflict:'room_id'});
    setPinnedMsg({content,pinned_by:userName});
  };
  const handleUnpin=async()=>{
    await supabase.from('chat_pinned').delete().eq('room_id',activeRoom.id);
    setPinnedMsg(null);
  };

  // ── React ──────────────────────────────────────────────────────
  const handleReact=async(msgId,emoji)=>{
    if(!userId)return;
    const existing=(reactions[msgId]??[]).find(r=>r.emoji===emoji&&r.user_id===userId);
    if(existing)await supabase.from('chat_reactions').delete().eq('message_id',msgId).eq('user_id',userId).eq('emoji',emoji);
    else await supabase.from('chat_reactions').insert({message_id:msgId,user_id:userId,user_name:userName,emoji});
    const{data}=await supabase.from('chat_reactions').select('*').eq('message_id',msgId);
    setReactions(p=>({...p,[msgId]:data??[]}));
  };

  // ── DM ─────────────────────────────────────────────────────────
  const openDmWith=async profile=>{
    const{data:myRooms}=await supabase.from('chat_room_members').select('room_id').eq('user_id',userId);
    const myIds=myRooms?.map(r=>r.room_id)??[];
    if(myIds.length){
      const{data:shared}=await supabase.from('chat_room_members').select('room_id').eq('user_id',profile.id).in('room_id',myIds);
      if(shared?.length){const ex=rooms.find(r=>r.id===shared[0].room_id&&r.type==='dm');if(ex){setActiveRoom(ex);setShowNewDm(false);setMobileView('chat');return;}}
    }
    const{data:room,error}=await supabase.from('chat_rooms').insert({type:'dm',name:profile.employee_name,created_by:userId}).select().single();
    if(error){alert('خطأ: '+error.message);return;}
    await supabase.from('chat_room_members').insert([
      {room_id:room.id,user_id:userId,display_name:userName,user_name:userName,role:'member',joined_at:new Date().toISOString()},
      {room_id:room.id,user_id:profile.id,display_name:profile.employee_name,user_name:profile.employee_name,role:'member',joined_at:new Date().toISOString()},
    ]);
    const enriched={...room,display_name:profile.employee_name};
    setRooms(p=>[...p,enriched]);setActiveRoom(enriched);setShowNewDm(false);setDmSearch('');setMobileView('chat');
  };
  const loadProfiles=async()=>{const{data}=await supabase.from('profiles').select('id,employee_name,role_type,team').eq('is_active',true).neq('id',userId).order('employee_name');setAllProfiles(data??[]);};

  // ── Scroll handler ─────────────────────────────────────────────
  const handleMsgScroll=useCallback(e=>{
    const el=e.currentTarget;
    setShowScrollBtn(el.scrollHeight-el.scrollTop-el.clientHeight>150);
    // قرب القمّة → حمّل الرسائل الأقدم (pagination)
    if(el.scrollTop<80)loadOlderRef.current?.();
  },[]);
  const scrollToBottom=()=>{msgEndRef.current?.scrollIntoView({behavior:'smooth'});};

  // ── Render ─────────────────────────────────────────────────────
  const groupRooms=rooms.filter(r=>r.type==='group');
  const privateRooms=groupRooms.filter(r=>r.is_private);
  const publicRooms=groupRooms.filter(r=>!r.is_private);
  const dmRooms=rooms.filter(r=>r.type==='dm');
  const displayedMessages=searchQuery.trim()
    ?messages.filter(m=>!m.is_deleted&&(m.content?.toLowerCase().includes(searchQuery.toLowerCase())||m.sender_name?.toLowerCase().includes(searchQuery.toLowerCase())))
    :messages;
  const grouped=groupByDay(displayedMessages);
  const filteredProfiles=allProfiles.filter(p=>!dmSearch||p.employee_name?.toLowerCase().includes(dmSearch.toLowerCase()));

  return(
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" dir="rtl">

      {/* ══ Sidebar (list) — full width on mobile, fixed on desktop ══ */}
      <div className={`${mobileView==='chat'?'hidden':'flex'} sm:flex w-full ${sidebarOpen?'sm:w-72':'sm:w-0'} shrink-0 overflow-hidden flex-col border-e border-border bg-surface`}>
        {/* Header */}
        <div className="px-3 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-text text-sm tracking-tight">Lowe's Pro 💙</h2>
            <div className="flex items-center gap-1">
              {isAdmin&&<button onClick={()=>setShowCreateChannel(true)} className="w-7 h-7 rounded-lg bg-surface-alt border border-border text-muted text-xs flex items-center justify-center hover:text-teal hover:border-teal/40 transition" title="قناة جديدة">#</button>}
              {isAdmin&&<button onClick={()=>setShowCreateGroup(true)} className="w-7 h-7 rounded-lg bg-surface-alt border border-border text-muted text-xs flex items-center justify-center hover:text-teal hover:border-teal/40 transition" title="مجموعة خاصة">🔒</button>}
              <button onClick={()=>{setShowNewDm(true);loadProfiles();}} className="w-7 h-7 rounded-lg bg-teal/10 text-teal flex items-center justify-center hover:bg-teal/20 transition" title="رسالة خاصة">✎</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
          {/* Pending requests badge */}
          {isApprover&&pendingCount>0&&(
            <button onClick={()=>setShowRequests(true)} className="w-full text-start px-2.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center gap-2.5 hover:bg-amber-100 transition">
              <span className="w-5 text-center shrink-0">📋</span>
              <span className="flex-1 text-sm font-bold">طلبات الانضمام</span>
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold grid place-items-center">{pendingCount}</span>
            </button>
          )}

          {/* Public channels */}
          {publicRooms.length>0&&(
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">القنوات</p>
              {loading?[1,2,3,4,5].map(i=><div key={i} className="h-9 rounded-xl bg-surface-alt animate-pulse mb-1"/>)
              :publicRooms.map(r=>(
                <ChannelItem key={r.id} room={r} active={activeRoom?.id===r.id} unread={unreadCounts[r.id]??0} lastMsg={lastMsgs[r.id]}
                  onClick={()=>openRoom(r)} />
              ))}
            </div>
          )}

          {/* Private groups */}
          {privateRooms.length>0&&(
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">مجموعات خاصة</p>
              {privateRooms.map(r=>(
                <ChannelItem key={r.id} room={r} active={activeRoom?.id===r.id} unread={unreadCounts[r.id]??0} lastMsg={lastMsgs[r.id]}
                  onClick={()=>openRoom(r)} />
              ))}
            </div>
          )}

          {/* DMs */}
          {dmRooms.length>0&&(
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider px-2 mb-1">رسائل خاصة</p>
              {dmRooms.map(r=>{
                const dmName=r.display_name??r.name;
                const isOnline=globalOnline.has(dmName);
                return(
                <button key={r.id} onClick={()=>openRoom(r)}
                  className={`w-full text-start px-2.5 py-2 rounded-xl transition-all flex items-center gap-2.5 ${activeRoom?.id===r.id?'bg-teal/10 text-teal':'text-muted hover:bg-surface-alt hover:text-text'}`}>
                  <div className="relative shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${avatarColor(dmName)}`}>
                      {dmName?.[0]?.toUpperCase()}
                    </div>
                    {isOnline&&<span className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-surface block"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{dmName}</span>
                    {isOnline
                      ? <span className="text-[10px] text-emerald-600 font-medium">متصل الآن</span>
                      : lastMsgs[r.id]
                        ? <span className="text-[10px] text-muted/60 truncate block">{lastMsgs[r.id]}</span>
                        : lastSeenMap[dmName]
                          ? <span className="text-[10px] text-muted/50">{formatLastSeen(lastSeenMap[dmName])}</span>
                          : null
                    }
                  </div>
                  {(unreadCounts[r.id]??0)>0&&<span className="w-5 h-5 rounded-full bg-teal text-navy text-[9px] font-bold grid place-items-center shrink-0">{unreadCounts[r.id]}</span>}
                </button>
              );})}
            </div>
          )}

          {/* Discover */}
          <button onClick={()=>setShowDiscover(true)} className="w-full text-start px-2.5 py-2 rounded-xl border border-dashed border-border text-muted hover:border-teal/40 hover:text-teal transition-all flex items-center gap-2.5">
            <span className="w-5 text-center shrink-0">🔍</span>
            <span className="text-sm font-medium">اكتشف قنوات</span>
          </button>
        </div>
      </div>

      {/* ══ Chat Area — full screen on mobile when a room is open ══ */}
      <div className={`${mobileView==='list'?'hidden':'flex'} sm:flex flex-1 flex-col min-w-0 overflow-hidden`}>

        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-3 shrink-0 bg-surface">
          {/* Mobile: back to list · Desktop: toggle sidebar */}
          <button onClick={()=>setMobileView('list')} className="sm:hidden w-9 h-9 rounded-xl bg-surface-alt border border-border flex items-center justify-center text-text transition shrink-0 active:scale-95" aria-label="رجوع">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button onClick={()=>setSidebarOpen(o=>!o)} className="hidden sm:flex w-8 h-8 rounded-xl bg-surface-alt border border-border items-center justify-center text-muted hover:text-text transition shrink-0 hover:scale-105">☰</button>
          {activeRoom?(
            <div className={`flex-1 min-w-0 flex items-center gap-2.5 ${activeRoom.type==='group'?'cursor-pointer rounded-xl hover:bg-surface-alt -mx-1 px-1 py-0.5 transition':''}`}
              onClick={()=>{if(activeRoom.type==='group')setShowGroupInfo(true);}}>
              {/* Avatar */}
              {activeRoom.avatar_url
                ? <img src={activeRoom.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />
                : <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${avatarColor(activeRoom.display_name??activeRoom.name)}`}>{(activeRoom.display_name??activeRoom.name)?.[0]?.toUpperCase()||'#'}</div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-text truncate">{activeRoom.display_name??activeRoom.name}</p>
                {activeRoom.type!=='dm'&&activeRoom.is_private&&<span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-surface-alt border border-border text-muted">🔒 خاص</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {activeRoom.description&&activeRoom.type!=='dm'&&<p className="text-[11px] text-muted truncate">{activeRoom.description}</p>}
                {activeRoom.type==='dm' ? (
                  globalOnline.has(activeRoom.display_name??activeRoom.name) ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                      متصل الآن
                    </span>
                  ) : lastSeenMap[activeRoom.display_name??activeRoom.name] ? (
                    <span className="text-[10px] text-muted">
                      آخر ظهور {formatLastSeen(lastSeenMap[activeRoom.display_name??activeRoom.name])}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted/60">غير متصل</span>
                  )
                ) : (
                  onlineUsers.length>0&&(
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                      {onlineUsers.length} متصل{onlineUsers.length>1?'ون':''}
                    </span>
                  )
                )}
              </div>
            </div>
            </div>
          ):null}
          {activeRoom&&(
            <button onClick={()=>{setShowSearch(v=>!v);setSearchQuery('');}}
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition shrink-0 hover:scale-105 ${showSearch?'bg-teal text-navy':'bg-surface-alt border border-border text-muted hover:text-teal hover:border-teal/40'}`}
              title="بحث في الرسائل">🔍</button>
          )}
        </div>
        {/* Search bar */}
        {showSearch&&(
          <div className="px-3 py-2 border-b border-border bg-surface-alt shrink-0 animate-in slide-in-from-top-2 duration-200">
            <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="ابحث في الرسائل…" autoFocus
              className="w-full border border-border rounded-xl px-4 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
            {searchQuery&&<p className="text-[10px] text-muted mt-1.5 px-1">{displayedMessages.length} نتيجة</p>}
          </div>
        )}

        {/* Pinned */}
        {pinnedMsg&&(
          <PinnedBanner pinned={pinnedMsg} onUnpin={handleUnpin} isApprover={isApprover} />
        )}

        {/* Messages + Input */}
        {(
          <>
            <div ref={msgContainerRef} onScroll={handleMsgScroll} className="flex-1 overflow-y-auto overscroll-contain relative" style={{background:'var(--color-surface-alt,#f8f7f4)'}}>
              {showScrollBtn&&(
                <button onClick={scrollToBottom} className="sticky bottom-4 end-4 float-end z-20 w-9 h-9 rounded-full bg-teal text-navy shadow-lg flex items-center justify-center hover:bg-teal/90 hover:scale-110 transition-all animate-in fade-in duration-200 me-3">
                  ↓
                </button>
              )}
              <div className="px-3 py-3 space-y-0.5 max-w-3xl mx-auto">
                {loadingOlder&&(
                  <div className="flex justify-center py-2"><div className="w-5 h-5 border-2 border-teal/30 border-t-teal rounded-full animate-spin"/></div>
                )}
                {!activeRoom?(
                  <div className="h-64 flex flex-col items-center justify-center text-muted">
                    <p className="text-5xl mb-3 opacity-20">💬</p>
                    <p className="text-sm font-medium">اختر قناة لتبدأ</p>
                  </div>
                ):msgLoading?(
                  <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-teal/30 border-t-teal rounded-full animate-spin"/></div>
                ):grouped.length===0?(
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-5xl mb-3 opacity-20">💬</p>
                    <p className="font-bold text-text">لا توجد رسائل بعد</p>
                    <p className="text-sm text-muted mt-1">كن أول من يبدأ النقاش!</p>
                  </div>
                ):(
                  grouped.map(item=>{
                    if(item.type==='divider')return(
                      <div key={item.key} className="flex items-center gap-3 py-3">
                        <div className="flex-1 h-px bg-border/50"/>
                        <span className="text-[10px] text-muted/60 font-medium px-3 py-0.5 bg-surface-alt rounded-full border border-border/50">{item.label}</span>
                        <div className="flex-1 h-px bg-border/50"/>
                      </div>
                    );
                    return(
                      <MessageBubble key={item.id} msg={item} isMine={item.sender_id===userId}
                        userId={userId} isApprover={isApprover}
                        onReply={setReplyTo} onReact={handleReact}
                        onEdit={handleEdit} onDelete={handleDelete} onPin={handlePin}
                        onImageClick={setLightboxUrl} onForward={setForwardMsg}
                        reactions={reactions[item.id]}
                        isOnline={item.sender_id!==userId&&globalOnline.has(item.sender_name)}
                        roomReadMap={roomReadMap} isDm={activeRoom?.type==='dm'}
                        othersOnline={activeRoom?.type==='dm'?globalOnline.has(activeRoom.display_name??activeRoom.name):onlineUsers.length>0}
                      />
                    );
                  })
                )}
                <div ref={msgEndRef}/>
              </div>
            </div>

            {/* Typing indicator */}
            <div className="shrink-0 px-4 min-h-[28px]" style={{background:'var(--color-surface-alt,#f8f7f4)'}}>
              <TypingIndicator users={typingUsers}/>
            </div>

            {activeRoom&&(
              <MessageInput onSend={handleSend} disabled={sending} replyTo={replyTo} onCancelReply={()=>setReplyTo(null)} onTyping={broadcastTyping} members={roomMembers}/>
            )}
          </>
        )}
      </div>

      {/* ══ Modals ════════════════════════════════════════════════ */}
      {lightboxUrl&&<LightboxModal url={lightboxUrl} onClose={()=>setLightboxUrl(null)}/>}
      {forwardMsg&&<ForwardPanel msg={forwardMsg} rooms={rooms} userId={userId} userName={userName} onClose={()=>setForwardMsg(null)}/>}
      {showCreateChannel&&(
        <CreateChannelPanel userId={userId} userName={userName}
          onCreated={room=>{setShowCreateChannel(false);loadRooms().then(()=>{});}}
          onClose={()=>setShowCreateChannel(false)}/>
      )}
      {showNewDm&&(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={e=>e.target===e.currentTarget&&setShowNewDm(false)}>
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-250" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
              <h2 className="font-bold text-text">رسالة خاصة جديدة</h2>
              <button onClick={()=>setShowNewDm(false)} className="w-8 h-8 rounded-xl bg-surface-alt flex items-center justify-center text-muted hover:text-text transition">✕</button>
            </div>
            <div className="p-3">
              <input value={dmSearch} onChange={e=>setDmSearch(e.target.value)} placeholder="بحث بالاسم…"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30 mb-3" autoFocus/>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {filteredProfiles.length===0?<p className="text-center text-muted text-sm py-4">لا توجد نتائج</p>
                :filteredProfiles.map(p=>(
                  <button key={p.id} onClick={()=>openDmWith(p)} className="w-full text-start px-3 py-2.5 rounded-xl hover:bg-surface-alt transition flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${avatarColor(p.employee_name)}`}>{p.employee_name?.[0]}</div>
                    <div><p className="text-sm font-semibold text-text">{p.employee_name}</p><p className="text-xs text-muted">{p.team??''}</p></div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDiscover&&<DiscoverPanel allChannels={allChannels} memberRoomIds={memberRoomIds} userId={userId} userName={userName} onClose={()=>setShowDiscover(false)} onRequestSent={()=>{setShowDiscover(false);loadPendingCount();}}/>}
      {showRequests&&<JoinRequestsPanel userName={userName} onApproved={()=>{loadRooms();loadPendingCount();}} onClose={()=>{setShowRequests(false);loadPendingCount();}}/>}
      {showCreateGroup&&<CreateGroupPanel userId={userId} userName={userName} onCreated={()=>{setShowCreateGroup(false);loadRooms();}} onClose={()=>setShowCreateGroup(false)}/>}
      {showGroupInfo&&activeRoom?.type==='group'&&(
        <GroupInfoPanel room={activeRoom} userId={userId} userName={userName} isApprover={isApprover}
          onClose={()=>setShowGroupInfo(false)}
          onUpdated={()=>{loadRooms();}}/>
      )}
    </div>
  );
}
