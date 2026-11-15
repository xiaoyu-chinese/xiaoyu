
const firebaseConfig = {
  apiKey: "AIzaSyAeeTVhAnTds9pPxCPcgNWAbc4zAiVsP3I",
  authDomain: "xiaoyu-chinese.firebaseapp.com",
  projectId: "xiaoyu-chinese",
  storageBucket: "xiaoyu-chinese.firebasestorage.app",
  messagingSenderId: "333044970276",
  appId: "1:333044970276:web:356bb1af3eda4649eb79b1"
};
let db=null, FB_OK=false;
try{ if(firebaseConfig.apiKey && firebaseConfig.apiKey!=="DAN_VAO_DAY"){
  firebase.initializeApp(firebaseConfig); db=firebase.firestore(); FB_OK=true; } }catch(e){ console.warn(e); }

/* ---- tiện ích ---- */
const root=document.getElementById('app');
const landing=document.getElementById('landing');
const $=s=>document.querySelector(s);
const todayKey=()=> new Date().toISOString().slice(0,10);
const now=()=>Date.now();
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2600);}
function lsGet(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
const render=h=>{landing.hidden=true;root.hidden=false;root.innerHTML=h;window.scrollTo(0,0);};
function showLanding(){root.hidden=true;root.innerHTML='';landing.hidden=false;window.scrollTo(0,0);}
function initLanding(){ document.querySelectorAll('[data-course]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();pickCourse(b.dataset.course);})); }

/* ---- dữ liệu từ vựng (vocab.js) ---- */
const LESSONS=(window.VOCAB&&window.VOCAB.lessons)||[];
const WORDMAP={}; const ALLWORDS=[];
LESSONS.forEach(l=>(l.words||[]).forEach(w=>{const o={...w,lessonId:l.id,lessonTitle:l.title};WORDMAP[w.id]=o;ALLWORDS.push(o);}));
const TOTAL_WORDS=ALLWORDS.length;

const CONGRATS=["Hôm nay lại chăm nữa rồi! 🔥","Giữ lửa đỉnh thật đó nha 😎","Một ngày không bỏ, một bước tiến bộ 🚀",
 "Não nay thêm vài từ mới 🧠✨","Chuỗi lửa đang cháy ngùn ngụt! 🔥","Đỉnh của chóp, học tiếp thôi 💪",
 "Người chăm nhất lớp đây rồi 🏆","Từ vựng sợ bạn luôn á 😏","Tuyệt vời ông mặt trời ☀️"];

let STATE={code:null,cls:null,sid:null,role:null,authTab:'student'};
let ME=null;            // dữ liệu học viên
let CARDS={};           // {wid: card}
let ROUTE='home';

const clsRef=c=>db.collection('classes').doc(c);
const stuCol=c=>clsRef(c).collection('students');
const stuRef=(c,s)=>stuCol(c).doc(s);
const cardsCol=(c,s)=>stuRef(c,s).collection('cards');
const sessCol=(c,s)=>stuRef(c,s).collection('sessions');

/* ---- lịch lặp lại ngắt quãng (SM-2 rút gọn) + mức thành thạo chung ---- */
function schedule(card,grade){
  card.reps=card.reps||0; card.ease=card.ease||2.3; card.interval=card.interval||0;
  card.seen=(card.seen||0)+1;
  if(grade===0){ card.reps=0; card.interval=1; card.ease=Math.max(1.6,card.ease-0.2); card.wrong=(card.wrong||0)+1;
    card.mastery=Math.max(0,(card.mastery||0)-1); }
  else{ card.correct=(card.correct||0)+1; card.reps++;
    if(grade===1){ card.ease=Math.max(1.7,card.ease-0.1); }
    else { card.mastery=Math.min(5,(card.mastery||0)+1); }
    if(card.reps===1) card.interval=1; else if(card.reps===2) card.interval=3;
    else card.interval=Math.round(card.interval*card.ease);
    if(grade===1) card.interval=Math.max(1,Math.round(card.interval*0.6)); }
  const d=new Date(); d.setDate(d.getDate()+card.interval); card.due=d.toISOString().slice(0,10);
  return card;
}
const isDue=card=> card && (!card.due || card.due<=todayKey());
const masteryOf=wid=>{const c=CARDS[wid];return c?(c.mastery||0):0;};
function mbar(lv){let h='<span class="mbar">';for(let i=1;i<=5;i++)h+=`<i class="${i<=lv?'f'+lv:''}"></i>`;return h+'</span>';}

/* ---- chuẩn hoá để tự chấm ---- */
function normPinyin(s){return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ü/g,'u').replace(/[^a-z]/g,'');}
function normHan(s){return (s||'').replace(/\s+/g,'').replace(/[，。！？、,.!?]/g,'');}

/* ================= TẢI / LƯU ================= */
async function loadMe(){ ME=(await stuRef(STATE.code,STATE.sid).get()).data();
  const tk=todayKey();
  if(ME.lastDay!==tk){ const y=new Date(Date.now()-864e5).toISOString().slice(0,10);
    ME.streak=(ME.lastDay===y)?(ME.streak||0)+1:1; ME.lastDay=tk; ME.days=ME.days||[]; if(!ME.days.includes(tk))ME.days.push(tk);
    ME._newday=true; await stuRef(STATE.code,STATE.sid).update({streak:ME.streak,lastDay:tk,days:ME.days}); }
}
async function loadCards(){ const snap=await cardsCol(STATE.code,STATE.sid).get(); CARDS={}; snap.docs.forEach(d=>CARDS[d.id]=d.data()); }
async function saveCard(c){ const {_word,...save}=c; await cardsCol(STATE.code,STATE.sid).doc(c.wid).set(save,{merge:true}); CARDS[c.wid]=save; }

/* ================= SHELL 3 CỘT (topbar + sidebar khóa học + main + rail) ================= */
const NAV_GROUPS=[
  {items:[{id:'classroom',ic:'🏫',t:'Lớp học trực tuyến',live:true}]},
  {items:[
    {id:'lessons', ic:'📚', t:'Danh sách bài học'},
    {id:'home',    ic:'📘', t:'Tổng quan khóa học'},
    {id:'exercise',ic:'📝', t:'Bài tập SBT'},
  ]},
  {label:'CÔNG CỤ HỌC TẬP',items:[
    {id:'review', ic:'🔁', t:'Ôn tập thông minh'},
    {id:'list',   ic:'📖', t:'Sổ tay từ vựng'},
    {id:'mywords',ic:'⭐', t:'Từ vựng của tôi'},
    {id:'stats',  ic:'📊', t:'Thống kê & Tiến bộ'},
    {id:'rank',   ic:'🏆', t:'Xếp hạng'},
  ]},
];
function xtopbar(){return `<div class="xtop">
  <a class="xbrand" href="#" data-r="home"><img src="avatar.png" alt="XiaoYu"><div><b>XiaoYu Chinese</b><small>Học tiếng Trung – Vững tương lai</small></div></a>
  <div class="xtop-r"><div class="xbell">🔔</div><img class="xava" src="avatar.png" alt="Avatar"></div>
</div>`;}
function xcourse(){const cid=esc(STATE.courseId||'HSK3');
  return `<div class="xcourse" style="background-image:url(hsk3.jpg)"><span class="xtag">KHÓA HỌC ${cid}</span><h2>${cid}</h2><small>Tự tin nói – Hiểu sâu hơn</small></div>`;}
function xmenu(){let h='';
  NAV_GROUPS.forEach(g=>{ if(g.label)h+=`<div class="xlbl">${g.label}</div>`;
    g.items.forEach(n=>{h+=`<button class="xnav ${ROUTE===n.id?'on':''} ${n.live?'live':''}" data-r="${n.id}"><span class="xic">${n.ic}</span><span class="xt">${n.t}</span>${n.live?'<span class="xlive">LIVE</span>':''}</button>`;});
  });
  h+=`<button class="xnav out" data-r="_out"><span class="xic">🚪</span><span class="xt">Đăng xuất</span></button>`;
  return h;
}
function shell(inner,rail){
  render(`${xtopbar()}<div class="xshell ${rail?'has-rail':''}">
    <aside class="xside">${xcourse()}<nav class="xmenu">${xmenu()}</nav></aside>
    <main class="xmain">${inner}</main>
    ${rail?`<aside class="xrail">${rail}</aside>`:''}
  </div>`);
  root.querySelectorAll('[data-r]').forEach(b=>b.onclick=e=>{e.preventDefault();
    const r=b.dataset.r;
    if(r==='_out'){STATE.sid=null;STATE.role=null;ME=null;CARDS={};viewLanding();return;}
    go(r);
  });
}
function go(r){ ROUTE=r;
  if(r==='home')return pageHome();
  if(r==='lessons')return pageLesson();
  if(r==='exercise'||r==='sbt')return pageSBT();
  if(r==='review')return pageReview();
  if(r==='list')return pageList();
  if(r==='mywords')return pageMyWords();
  if(r==='stats')return pageStats();
  if(r==='rank')return pageRank();
  if(r==='classroom')return pageClassroom();
}

/* ---- phân loại trạng thái từ cho donut / ô thống kê ---- */
function isWeakCard(c){return c&&((c.wrong||0)>(c.correct||0));}
function vocabStates(){
  let g=0,b=0,a=0,wt=0;        // nắm vững / đang học / cần củng cố / chờ ôn
  ALLWORDS.forEach(w=>{const c=CARDS[w.id];
    if(!c){wt++;return;}
    if((c.mastery||0)>=5)g++;
    else if(isWeakCard(c))a++;
    else if((c.mastery||0)>=1)b++;
    else wt++;
  });
  return {g,b,a,wt,total:ALLWORDS.length};
}
function dueOnKey(k){return ALLWORDS.filter(w=>{const c=CARDS[w.id];return c&&c.due===k;}).length;}
function keyPlus(n){const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}

/* ================= DANH SÁCH BÀI HỌC = DASHBOARD ================= */
function dueList(){return ALLWORDS.filter(w=>{const c=CARDS[w.id];return c&&isDue(c);});}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const POS_FULL={'đgt':'Động từ','dt':'Danh từ','tt':'Tính từ','trt':'Trạng từ','gt':'Giới từ','lt':'Lượng từ','đt':'Đại từ','pt':'Phó từ','lgt':'Liên từ','st':'Số từ','tht':'Thán từ','k':'Trợ từ'};
let DASH=null;
function dashInit(){
  DASH={ queue:shuffle(dueList().slice()).slice(0,15), i:0, wrong:false,
         session:{startedAt:now(),game:'review_dash',reviewed:0,correct:0,wrong:0,scope:'due'} };
}
function pageLesson(id){
  STATE.lesson=id||STATE.lesson||(LESSONS[0]&&LESSONS[0].id);
  const lesson=LESSONS.find(l=>l.id===STATE.lesson)||LESSONS[0];
  if(!lesson){ shell(`<div class="card center muted">Chưa có dữ liệu bài học.</div>`); return; }
  const zh=lesson.title.split('·').pop().trim();
  const lesNo=LESSONS.indexOf(lesson)+1;
  if(!DASH) dashInit();
  // tiến độ bài: số từ của bài đã "học" (có card) & đã thuộc
  const lw=lesson.words; const lLearned=lw.filter(w=>CARDS[w.id]).length; const lMastered=lw.filter(w=>masteryOf(w.id)>=5).length;
  const lessonTabs=LESSONS.map(l=>`<button class="xls ${l.id===lesson.id?'on':''}" data-les="${l.id}">Bài ${LESSONS.indexOf(l)+1}</button>`).join('');

  const main=`
    <div class="xhero" style="background-image:url(hsk3.jpg)">
      <div class="xhero-in">
        <div class="xcrumb">Khóa học › ${esc(STATE.courseId||'HSK3')} › <b>Bài ${lesNo}</b></div>
        <div class="xhero-t"><h1>${esc(STATE.courseId||'HSK3')} – Bài ${lesNo}: ${esc(zh)}</h1><button class="xplay" id="les-audio">▶</button></div>
        <div class="xhero-s">${esc(lesson.titleVi||'')}</div>
      </div>
    </div>

    <div class="xlstabs">${lessonTabs}</div>

    <div class="xcard xflowc">
      <div class="xflow">
        <div class="xstep done"><div class="xn">✓</div><div><div class="zh">间隔复习</div><div class="vi">Ôn tập từ cũ</div></div></div>
        <div class="xstep cur"><div class="xn">2</div><div><div class="zh">今日新词</div><div class="vi">Từ mới bài này</div></div></div>
        <div class="xstep"><div class="xn">3</div><div><div class="zh">SBT 练习</div><div class="vi">Bài tập sách</div></div></div>
        <div class="xstep"><div class="xn">4</div><div><div class="zh">自由练习</div><div class="vi">Luyện tập tự chọn</div></div></div>
      </div>
    </div>

    <div class="xcard">
      <div class="xsec"><div class="xsec-ic">🔁</div><h3>间隔复习 – Ôn tập từ cũ</h3><span class="xreq">📌 Bắt buộc</span></div>
      <p class="muted" style="margin:2px 0 0;font-size:.9rem">Ôn lại từ vựng theo lịch cá nhân hóa dựa trên kết quả học tập và mức độ ghi nhớ.</p>
      <div class="xstats4">
        <div class="xsc c-blue"><div class="si">🗂️</div><div><b id="st-today">0</b><span>từ trong lượt ôn</span></div></div>
        <div class="xsc c-green"><div class="si">🎯</div><div><b id="st-due">0</b><span>từ đến hạn ôn</span></div></div>
        <div class="xsc c-amber"><div class="si">⚠️</div><div><b id="st-weak">0</b><span>từ cần củng cố</span></div></div>
        <div class="xsc c-grey"><div class="si">🗓️</div><div><b id="st-wait">0</b><span>từ đang chờ ôn</span></div></div>
      </div>
      <div class="xfc" id="dash-fc"></div>
    </div>`;

  const rail=`
    <div class="xpanel">
      <h4><span class="pi">📈</span> Tiến độ học Bài ${lesNo} <a id="les-pct">${Math.round(lMastered/Math.max(1,lw.length)*100)}%</a></h4>
      <div class="xpbar"><i style="width:${Math.round(lLearned/Math.max(1,lw.length)*100)}%"></i></div>
      <div class="xchk done"><span class="b">✓</span><span class="zh">间隔复习</span> – Ôn tập từ cũ <span class="val">Đang ôn</span></div>
      <div class="xchk"><span class="b"></span><span class="zh">今日新词</span> – Từ mới <span class="val">${lLearned}/${lw.length}</span></div>
      <div class="xchk"><span class="b"></span><span class="zh">SBT 练习</span> – Bài tập <span class="val">0/3</span></div>
      <div class="xchk"><span class="b"></span><span class="zh">自由练习</span> – Tự chọn <span class="val">--</span></div>
    </div>
    <div class="xpanel">
      <h4><span class="pi">🫧</span> Tình trạng từ vựng của bạn</h4>
      <div class="xdonut-wrap">
        <div class="xdonut"><svg viewBox="0 0 42 42" width="118" height="118">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="#eef3f9" stroke-width="5"></circle>
          <circle id="dg" cx="21" cy="21" r="15.9" fill="none" stroke="#23b386" stroke-width="5" stroke-dasharray="0 100" stroke-dashoffset="25" stroke-linecap="round"></circle>
          <circle id="db" cx="21" cy="21" r="15.9" fill="none" stroke="#2f9fd6" stroke-width="5" stroke-dasharray="0 100" stroke-dashoffset="25" stroke-linecap="round"></circle>
          <circle id="da" cx="21" cy="21" r="15.9" fill="none" stroke="#f0a500" stroke-width="5" stroke-dasharray="0 100" stroke-dashoffset="25" stroke-linecap="round"></circle>
          <circle id="dw" cx="21" cy="21" r="15.9" fill="none" stroke="#b9c7d6" stroke-width="5" stroke-dasharray="0 100" stroke-dashoffset="25" stroke-linecap="round"></circle>
        </svg><div class="ctr"><b id="d-total">0</b><span>Từ vựng</span></div></div>
        <div class="xlegend">
          <div class="lg"><span class="dot" style="background:#23b386"></span>Đã nắm vững <b id="lg-g">0</b><small id="lg-gp">0%</small></div>
          <div class="lg"><span class="dot" style="background:#2f9fd6"></span>Đang học <b id="lg-b">0</b><small id="lg-bp">0%</small></div>
          <div class="lg"><span class="dot" style="background:#f0a500"></span>Cần củng cố <b id="lg-a">0</b><small id="lg-ap">0%</small></div>
          <div class="lg"><span class="dot" style="background:#b9c7d6"></span>Đang chờ ôn <b id="lg-w">0</b><small id="lg-wp">0%</small></div>
        </div>
      </div>
    </div>
    <div class="xpanel">
      <h4><span class="pi">🗓️</span> Lịch ôn tập sắp tới</h4>
      <div class="xsch"><span class="dot" style="background:#2f9fd6"></span><span class="d">Hôm nay</span><span class="v" id="sc0">0 từ</span></div>
      <div class="xsch"><span class="dot" style="background:#f0a500"></span><span class="d">Ngày mai</span><span class="v" id="sc1">0 từ</span></div>
      <div class="xsch"><span class="dot" style="background:#b9c7d6"></span><span class="d">Sau 2 ngày</span><span class="v" id="sc2">0 từ</span></div>
    </div>
    <div class="xtip"><h4>✨ Gợi ý cho bạn</h4><p id="tip-txt"></p></div>`;

  shell(main,rail);
  root.querySelectorAll('[data-les]').forEach(b=>b.onclick=()=>{STATE.lesson=b.dataset.les;pageLesson(b.dataset.les);});
  $('#les-audio')&&($('#les-audio').onclick=()=>toast('Audio bài học sẽ bổ sung sau nhé'));
  updateDashStats();
  renderDashCard();
}
function updateDashStats(){
  const s=vocabStates(); const due=dueList().length; const weak=s.a;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('d-total',s.total);
  const segs=[['dg',s.g],['db',s.b],['da',s.a],['dw',s.wt]]; let off=25;
  segs.forEach(([id,v])=>{const el=document.getElementById(id);if(!el)return;const pct=s.total?v/s.total*100:0;
    el.setAttribute('stroke-dasharray',pct.toFixed(2)+' '+(100-pct).toFixed(2));el.setAttribute('stroke-dashoffset',off.toFixed(2));off=(off-pct+100)%100;});
  const pc=(v)=>s.total?Math.round(v/s.total*100)+'%':'0%';
  set('lg-g',s.g);set('lg-gp',pc(s.g));set('lg-b',s.b);set('lg-bp',pc(s.b));
  set('lg-a',s.a);set('lg-ap',pc(s.a));set('lg-w',s.wt);set('lg-wp',pc(s.wt));
  set('st-due',due);set('st-weak',weak);set('st-wait',s.wt);
  set('st-today',DASH?DASH.queue.length:Math.min(due,15));
  set('sc0',dueList().length+' từ');set('sc1',dueOnKey(keyPlus(1))+' từ');set('sc2',dueOnKey(keyPlus(2))+' từ');
  const tip=document.getElementById('tip-txt');
  if(tip){ tip.innerHTML = weak>0
    ? `Bạn có <b>${weak}</b> từ hay quên. Ôn kỹ ở phần <b>间隔复习</b> hoặc <b>Ôn tập thông minh</b> để củng cố nhé!`
    : (due>0?`Có <b>${due}</b> từ đến hạn ôn hôm nay. Hoàn thành lượt ôn để giữ tiến độ nhé!`:`Tuyệt vời! Hôm nay không còn từ đến hạn. Học <b>今日新词</b> để tiến xa hơn nhé!`); }
}
function renderDashCard(){
  const box=document.getElementById('dash-fc'); if(!box)return;
  if(!DASH||DASH.i>=DASH.queue.length){
    const n=DASH?DASH.session.reviewed:0, acc=n?Math.round(DASH.session.correct/n*100):0;
    box.innerHTML = n
      ? `<div class="xfc-done"><div class="big">${acc>=80?'🎉':'💪'}</div><h3>Hoàn thành lượt ôn!</h3>
          <p class="muted">Đã ôn <b>${n}</b> từ · đúng ngay <b>${acc}%</b></p>
          <button class="xbtn primary" id="fc-more">🔁 Ôn thêm lượt nữa</button></div>`
      : `<div class="xfc-done"><div class="big">☀️</div><h3>Hôm nay không có từ đến hạn</h3>
          <p class="muted">Giỏi lắm! Qua <b>Ôn tập thông minh</b> để ôn thêm, hoặc học từ mới của bài.</p>
          <button class="xbtn primary" id="fc-more">🔁 Ôn lại toàn bộ</button></div>`;
    const m=document.getElementById('fc-more'); if(m)m.onclick=()=>{DASH={queue:shuffle((dueList().length?dueList():ALLWORDS).slice()).slice(0,15),i:0,wrong:false,session:{startedAt:now(),game:'review_dash',reviewed:0,correct:0,wrong:0,scope:'due'}};renderDashCard();updateDashStats();};
    return;
  }
  const item=DASH.queue[DASH.i]; const w=item;
  DASH.wrong=false;
  const others=shuffle(ALLWORDS.filter(x=>x.id!==w.id).slice()).slice(0,3).map(x=>x.vi);
  const opts=shuffle([w.vi,...others]); const LT=['A','B','C','D'];
  box.innerHTML=`
    <div class="xfc-top"><span class="cnt">${DASH.i+1} / ${DASH.queue.length}</span>
      <div class="prog"><i style="width:${(DASH.i+1)/DASH.queue.length*100}%"></i></div></div>
    <div class="xfc-body">
      <div class="xfc-word">
        <div class="zh">${esc(w.hanzi)}</div>
        <div class="hint" id="fc-hint">Chọn nghĩa đúng để xem phiên âm &amp; ví dụ</div>
        <div id="fc-detail" hidden>
          <div class="py">${esc(w.pinyin)}</div>
          <div><span class="pos">${esc(POS_FULL[w.pos]||w.pos||'')}</span></div>
          <div class="mean">${esc(w.vi)}</div>
          <div class="ex"><span class="lbl">例句</span><span class="zhs">${esc(w.ex||'')}</span><span class="vis">${esc(w.exVi||'')}</span></div>
        </div>
      </div>
      <div class="xopts"><div class="ohd">Chọn nghĩa phù hợp</div><div id="fc-opts">
        ${opts.map((o,i)=>`<button class="xopt" data-v="${esc(o)}"><span class="k">${LT[i]}</span><span>${esc(o)}</span></button>`).join('')}
      </div></div>
    </div>
    <div class="xfc-fb" id="fc-fb"></div>
    <div class="xfc-act">
      <button class="xbtn ghost" id="fc-skip">🕒 Bỏ qua, ôn sau</button>
      <button class="xbtn primary" id="fc-next" disabled>Tiếp theo ›</button>
    </div>`;
  root.querySelectorAll('#fc-opts .xopt').forEach(btn=>btn.onclick=()=>dashPick(btn,btn.dataset.v,item));
  document.getElementById('fc-skip').onclick=()=>{ const c=getCard(w); c.due=keyPlus(1); saveCard(c); DASH.i++; renderDashCard(); updateDashStats(); };
  document.getElementById('fc-next').onclick=()=>{ DASH.i++; renderDashCard(); updateDashStats(); };
}
function getCard(w){ return CARDS[w.id] || {wid:w.id,lessonId:w.lessonId,reps:0,ease:2.3,interval:0,due:'',correct:0,wrong:0,seen:0,mastery:0}; }
function dashPick(btn,val,w){
  const fb=document.getElementById('fc-fb');
  if(val!==w.vi){ btn.classList.add('wrong'); btn.style.pointerEvents='none'; DASH.wrong=true;
    fb.className='xfc-fb no'; fb.innerHTML='❌ <b>Chưa đúng.</b>&nbsp;Thử lại nhé!'; return; }
  // ĐÚNG
  btn.classList.add('correct');
  root.querySelectorAll('#fc-opts .xopt').forEach(o=>o.style.pointerEvents='none');
  document.getElementById('fc-detail').hidden=false;
  document.getElementById('fc-hint').hidden=true;
  fb.className='xfc-fb ok'; fb.innerHTML='✅ <b>Chính xác!</b>&nbsp;'+esc(w.hanzi)+' ('+esc(w.pinyin)+'): '+esc(w.vi);
  document.getElementById('fc-next').disabled=false;
  // chấm & lưu Firestore (như game Chọn nghĩa)
  const c=getCard(w); c.wid=w.id; c.lessonId=w.lessonId;
  schedule(c, DASH.wrong?0:2);
  DASH.session.reviewed++; DASH.wrong?DASH.session.wrong++:DASH.session.correct++;
  saveCard(c);
  // lưu buổi ôn khi xong lượt
  if(DASH.i+1>=DASH.queue.length) flushDashSession();
  updateDashStats();
}
function flushDashSession(){
  if(!DASH||!DASH.session.reviewed||DASH.session._saved)return;
  DASH.session._saved=true;
  const s=DASH.session; s.endedAt=now(); s.dur=Math.round((s.endedAt-s.startedAt)/1000); s.week=weekOf(new Date());
  try{ if(FB_OK) sessCol(STATE.code,STATE.sid).add({startedAt:s.startedAt,endedAt:s.endedAt,dur:s.dur,week:s.week,game:s.game,reviewed:s.reviewed,correct:s.correct,wrong:s.wrong,scope:s.scope}); }catch(e){}
}

/* ================= TỪ VỰNG CỦA TÔI (từ yếu + đã học) ================= */
function pageMyWords(){
  const cards=Object.values(CARDS);
  const weak=cards.filter(isWeakCard).map(c=>WORDMAP[c.wid]).filter(Boolean);
  const mastered=cards.filter(c=>(c.mastery||0)>=5).map(c=>WORDMAP[c.wid]).filter(Boolean);
  const vrow=w=>`<div class="vrow"><div class="vtop"><span class="vh">${esc(w.hanzi)}</span><span class="vp">${esc(w.pinyin)}</span><span class="vpos">${esc(w.pos)}</span><span style="margin-left:auto">${mbar(masteryOf(w.id))}</span></div><div class="vvi">${esc(w.vi)}</div></div>`;
  shell(`
    <div class="xcard"><div class="spread"><h2>⭐ Từ vựng của tôi</h2><span class="pill">${cards.length} đã học</span></div>
      <p class="muted" style="margin-top:4px">Theo dõi từ bạn hay sai và từ đã nắm vững.</p></div>
    <div class="xcard"><div class="spread"><h3>⚠️ Cần củng cố (${weak.length})</h3>${weak.length?`<button class="xbtn primary sm" id="fixweak">🎯 Ôn ngay</button>`:''}</div>
      ${weak.length?`<div style="margin-top:10px">${weak.slice(0,40).map(vrow).join('')}</div>`:`<p class="muted" style="margin-top:8px">Chưa có từ nào bị sai nhiều — giỏi quá! 🌟</p>`}
    </div>
    <div class="xcard"><h3>💎 Đã nắm vững (${mastered.length})</h3>
      ${mastered.length?`<div style="margin-top:10px">${mastered.slice(0,60).map(vrow).join('')}</div>`:`<p class="muted" style="margin-top:8px">Hãy ôn tập để đưa từ lên mức thành thạo nhé!</p>`}
    </div>`);
  if(weak.length){const b=$('#fixweak');if(b)b.onclick=()=>startGameFromWords('mean',weak);}
}

/* ================= LỚP HỌC TRỰC TUYẾN (đang xây dựng) ================= */
function pageClassroom(){
  shell(`<div class="xcard center" style="padding:40px 22px">
    <div class="big">🏫</div>
    <h2 style="margin-top:8px">Lớp học trực tuyến</h2>
    <p class="muted" style="max-width:520px;margin:10px auto 0">Phòng học tương tác thời gian thực (giáo viên tổ chức luyện tập, học sinh trả lời trên thiết bị, AI chấm & ghi nhận lỗi) đang được xây dựng theo từng giai đoạn.</p>
    <span class="pill coral" style="margin-top:14px;display:inline-block">🚧 Sắp ra mắt</span>
  </div>`);
}
function pageHome(){
  const learned=Object.keys(CARDS).length;
  const due=dueList().length;
  const mastered=ALLWORDS.filter(w=>masteryOf(w.id)>=5).length;
  shell(`
    <div class="card" style="padding:0;overflow:hidden">
      <div class="apphero"><div class="spread">
        <div><p>Chào ${esc(ME.name)} 👋</p><h1 style="font-size:1.7rem;margin-top:4px">Giữ lửa nào!</h1></div>
        <div class="center"><div style="font-size:2.3rem">🔥</div><div class="big" style="line-height:1">${ME.streak||0}</div><span class="muted" style="font-weight:800">ngày</span></div>
      </div></div>
    </div>
    ${ME._newday?`<div style="margin:12px 0"><span class="pill coral">+1 giữ chuỗi hôm nay! ${CONGRATS[Math.floor(Math.random()*CONGRATS.length)]}</span></div>`:''}
    <div class="card">
      <div class="grid cols3">
        <div class="stat"><b>${due}</b><span>CẦN ÔN</span></div>
        <div class="stat"><b>${learned}</b><span>ĐÃ HỌC</span></div>
        <div class="stat"><b>${mastered}/${TOTAL_WORDS}</b><span>ĐÃ THUỘC</span></div>
      </div>
      <button class="btn block ${due?'coral':''}" id="rev" style="margin-top:16px;${due?'':'opacity:.6'}">${due?`🔁 Ôn ${due} từ đến hạn`:'✅ Hôm nay không có từ đến hạn'}</button>
      <button class="btn block ghost" id="learn" style="margin-top:10px">📖 Vào List từ vựng</button>
    </div>
    <div class="card">
      <h3>📚 Học / ôn theo bài</h3>
      <div class="grid" style="margin-top:10px">
        ${LESSONS.map(l=>{const tot=l.words.length;const done=l.words.filter(w=>CARDS[w.id]).length;const mas=l.words.filter(w=>masteryOf(w.id)>=5).length;
          return `<button class="listbtn" data-les="${l.id}"><div class="spread"><span style="font-weight:800">${esc(l.title)}</span><span class="pill ${mas===tot?'jade':''}">${done}/${tot}${mas?` · 💎${mas}`:''}</span></div></button>`;}).join('')}
      </div>
    </div>`);
  $('#rev').onclick=()=> dueList().length?startGame('flash','due',null):toast('Chưa có từ đến hạn — học bài mới nhé!');
  $('#learn').onclick=()=>go('list');
  root.querySelectorAll('[data-les]').forEach(b=>b.onclick=()=>{ROUTE='review';reviewPickGame('lesson',b.dataset.les);});
}

/* ================= LIST TỪ VỰNG ================= */
let LIST_SORT='lesson', LIST_Q='';
function pageList(){
  shell(`
    <div class="card">
      <div class="spread"><h2>📖 List từ vựng</h2><span class="pill">${TOTAL_WORDS} từ</span></div>
      <div class="field ico" style="margin:14px 0 10px"><span class="ic">🔍</span><input id="q" placeholder="Tìm 汉字 / pinyin / nghĩa…" value="${esc(LIST_Q)}" style="padding-left:42px"></div>
      <div class="seg"><button data-s="lesson" class="${LIST_SORT==='lesson'?'on':''}">Theo bài</button><button data-s="abc" class="${LIST_SORT==='abc'?'on':''}">ABC (pinyin)</button></div>
    </div>
    <div id="vlist"></div>`);
  $('#q').oninput=e=>{LIST_Q=e.target.value;drawList();};
  root.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{LIST_SORT=b.dataset.s;root.querySelectorAll('[data-s]').forEach(x=>x.classList.toggle('on',x===b));drawList();});
  drawList();
}
function drawList(){
  const box=$('#vlist'); if(!box)return;
  const q=LIST_Q.trim().toLowerCase(), qn=normPinyin(q);
  let ws=ALLWORDS.filter(w=> !q || w.hanzi.includes(q) || normPinyin(w.pinyin).includes(qn) || (w.vi||'').toLowerCase().includes(q));
  if(LIST_SORT==='abc') ws=[...ws].sort((a,b)=>normPinyin(a.pinyin)<normPinyin(b.pinyin)?-1:1);
  if(!ws.length){box.innerHTML=`<div class="card center muted">Không tìm thấy từ nào 🤔</div>`;return;}
  let cur=null, html='';
  ws.forEach(w=>{
    if(LIST_SORT==='lesson' && w.lessonId!==cur){cur=w.lessonId; html+=`<h3 style="margin:18px 4px 8px;color:var(--ink);text-shadow:0 1px 10px rgba(255,255,255,.7)">${esc(w.lessonTitle)}</h3>`;}
    const lv=masteryOf(w.id);
    const exHi=esc(w.ex).replace(esc(w.hanzi),`<b>${esc(w.hanzi)}</b>`);
    html+=`<div class="vrow">
      <div class="vtop"><span class="vh">${esc(w.hanzi)}</span><span class="vp">${esc(w.pinyin)}</span><span class="vpos">${esc(w.pos)}</span><span style="margin-left:auto">${mbar(lv)}</span></div>
      <div class="vvi">${esc(w.vi)}</div>
      <div class="vex">${exHi}<br><span style="opacity:.85">${esc(w.exVi)}</span></div>
    </div>`;
  });
  box.innerHTML=html;
}

/* ================= ÔN TỪ VỰNG ================= */
function pageReview(){
  shell(`
    <div class="card">
      <h2>🎮 Ôn từ vựng</h2>
      <p class="muted" style="margin-top:4px">Chọn phạm vi rồi chọn kiểu chơi. Mọi game cùng tính vào một mức thành thạo cho mỗi từ.</p>
      <label style="margin-top:14px">Phạm vi ôn</label>
      <select id="scope">
        <option value="due">🔁 Từ đến hạn hôm nay (${dueList().length})</option>
        <option value="all">🌊 Tất cả ${TOTAL_WORDS} từ</option>
        ${LESSONS.map(l=>`<option value="les:${l.id}">${esc(l.title)} (${l.words.length})</option>`).join('')}
      </select>
    </div>
    <div class="card">
      <h3>Chọn kiểu chơi</h3>
      <div class="grid cols2" style="margin-top:12px">
        <div class="gamecard" data-g="flash"><div class="gi">📇</div><b>Thẻ lật</b><small>Xem Hán → tự nhớ nghĩa</small></div>
        <div class="gamecard" data-g="pinyin"><div class="gi">🔤</div><b>Gõ pinyin</b><small>Nhìn Hán, gõ pinyin</small></div>
        <div class="gamecard" data-g="hanzi"><div class="gi">✍️</div><b>Gõ chữ Hán</b><small>Nghe nghĩa, gõ 汉字</small></div>
        <div class="gamecard" data-g="mean"><div class="gi">🎯</div><b>Chọn nghĩa</b><small>Trắc nghiệm nghĩa tiếng Việt</small></div>
      </div>
    </div>`);
  const scopeSel=$('#scope');
  root.querySelectorAll('[data-g]').forEach(c=>c.onclick=()=>{
    const v=scopeSel.value; let scope='all',lid=null;
    if(v==='due')scope='due'; else if(v==='all')scope='all'; else {scope='lesson';lid=v.slice(4);}
    startGame(c.dataset.g,scope,lid);
  });
}
function reviewPickGame(scope,lid){ // vào thẳng từ nút bài ở trang chính
  startGame('flash',scope,lid);
}

function buildQueue(scope,lid){
  let words=[];
  if(scope==='due') words=dueList();
  else if(scope==='lesson'){ const l=LESSONS.find(x=>x.id===lid); words=l?l.words.map(w=>WORDMAP[w.id]):[]; }
  else words=ALLWORDS.slice();
  // xáo trộn
  for(let i=words.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[words[i],words[j]]=[words[j],words[i]];}
  return words.map(w=>({w, card: CARDS[w.id]||{wid:w.id,lessonId:w.lessonId,reps:0,ease:2.3,interval:0,due:'',correct:0,wrong:0,seen:0,mastery:0}}));
}
const GAME_NAMES={flash:'Thẻ lật',pinyin:'Gõ pinyin',hanzi:'Gõ chữ Hán',mean:'Chọn nghĩa'};

function startGame(game,scope,lid){
  const queue=buildQueue(scope,lid);
  if(!queue.length) return toast('Không có từ trong phạm vi này');
  const session={startedAt:now(),game,reviewed:0,correct:0,wrong:0,scope:(scope==='lesson'?lid:scope)};
  let i=0, tStart=0;
  function frame(inner){
    shell(`<div class="card">
      <div class="spread"><span class="pill">${GAME_NAMES[game]} · ${i+1}/${queue.length}</span><button class="linklike" id="x">Thoát</button></div>
      <div class="progressbar" style="margin:12px 0"><i style="width:${Math.round(i/queue.length*100)}%"></i></div>
      ${inner}</div>`);
    $('#x').onclick=()=>finish(true);
  }
  async function grade(item,g){
    const ms=Date.now()-tStart; item.card.timeMs=(item.card.timeMs||0)+ms;
    schedule(item.card,g); session.reviewed++; g===0?session.wrong++:session.correct++;
    item.card.wid=item.w.id; item.card.lessonId=item.w.lessonId;
    await saveCard(item.card); i++; step();
  }
  function step(){
    if(i>=queue.length) return finish(false);
    const item=queue[i], w=item.w; tStart=Date.now();
    if(game==='flash') return flashCard(item);
    if(game==='pinyin') return typeCard(item,'pinyin');
    if(game==='hanzi') return typeCard(item,'hanzi');
    if(game==='mean') return meanCard(item);
  }
  function flashCard(item){const w=item.w;
    frame(`<div class="flash" id="fc"><div class="hz">${esc(w.hanzi)}</div><p class="muted" id="hint">Chạm để xem đáp án 👆</p></div>
      <div id="ans" hidden class="center" style="margin-top:14px">
        <div style="font-size:1.25rem;font-weight:800;color:var(--brand-d)">${esc(w.pinyin)} <span class="vpos">${esc(w.pos)}</span></div>
        <div style="font-size:1.2rem;margin:4px 0">${esc(w.vi)}</div>
        <div class="muted" style="margin-top:6px">${esc(w.ex)}<br>${esc(w.exVi)}</div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <button class="btn bad" data-g="0">Quên</button><button class="btn warn" data-g="1">Mơ hồ</button><button class="btn good" data-g="2">Nhớ</button></div>
      </div>`);
    $('#fc').onclick=()=>{const h=$('#hint');if(h)h.remove();$('#ans').hidden=false;};
    root.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>grade(item,+b.dataset.g));
  }
  function typeCard(item,kind){const w=item.w;
    const prompt = kind==='pinyin'
      ? `<div class="hz">${esc(w.hanzi)}</div><p class="muted">Gõ pinyin (có hoặc không dấu đều được)</p>`
      : `<div style="font-size:1.4rem;font-weight:800">${esc(w.vi)}</div><p class="muted">${esc(w.pinyin)} — gõ chữ Hán 汉字</p>`;
    frame(`<div class="center" style="padding:10px 0 4px">${prompt}</div>
      <input id="in" class="ansbox" autocomplete="off" autocapitalize="off" placeholder="${kind==='pinyin'?'vd: fuxi':'gõ 汉字'}" style="margin-top:12px">
      <button class="btn block" id="ck" style="margin-top:12px">Kiểm tra</button>
      <div id="fb" style="margin-top:12px"></div>`);
    const inp=$('#in'); inp.focus();
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')check();});
    $('#ck').onclick=check;
    function check(){
      const val=inp.value.trim(); if(!val)return;
      const ok = kind==='pinyin' ? normPinyin(val)===normPinyin(w.pinyin) : normHan(val)===normHan(w.hanzi);
      inp.disabled=true;$('#ck').disabled=true;
      $('#fb').innerHTML=`<div class="${ok?'opt ok':'opt no'}">${ok?'✅ Chính xác!':'❌ Chưa đúng'} &nbsp; <b style="font-family:Baloo 2,sans-serif;font-size:1.15rem">${esc(w.hanzi)}</b> · ${esc(w.pinyin)} · ${esc(w.vi)}</div>
        <button class="btn block ${ok?'good':'coral'}" id="nx" style="margin-top:10px">Tiếp →</button>`;
      $('#nx').onclick=()=>grade(item, ok?2:0);
    }
  }
  function meanCard(item){const w=item.w;
    const others=ALLWORDS.filter(x=>x.id!==w.id).sort(()=>Math.random()-0.5).slice(0,3).map(x=>x.vi);
    const opts=[w.vi,...others].sort(()=>Math.random()-0.5);
    frame(`<div class="center" style="padding:8px 0"><div class="hz">${esc(w.hanzi)}</div><p class="muted">${esc(w.pinyin)} — chọn nghĩa đúng</p></div>
      <div id="opts">${opts.map(o=>`<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`);
    root.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
      const ok=b.dataset.v===w.vi;
      root.querySelectorAll('.opt').forEach(x=>{x.disabled=true; if(x.dataset.v===w.vi)x.classList.add('ok'); else if(x===b)x.classList.add('no');});
      setTimeout(()=>grade(item, ok?2:0), ok?650:1300);
    });
  }
  async function finish(early){
    session.endedAt=now(); session.dur=Math.round((session.endedAt-session.startedAt)/1000); session.week=weekOf(new Date());
    if(session.reviewed) await sessCol(STATE.code,STATE.sid).add(session);
    if(early && !session.reviewed){ pageReview(); return; }
    const acc=session.reviewed?Math.round(session.correct/session.reviewed*100):0;
    shell(`<div class="card center"><div class="big">${acc>=80?'🎉':'💪'}</div><h2>${early?'Tạm dừng':'Hoàn thành'}!</h2>
      <p class="muted">${GAME_NAMES[game]}</p>
      <div class="grid cols3" style="margin-top:14px"><div class="stat"><b>${session.reviewed}</b><span>TỪ</span></div><div class="stat"><b>${acc}%</b><span>ĐÚNG</span></div><div class="stat"><b>${fmtDur(session.dur)}</b><span>THỜI GIAN</span></div></div>
      <button class="btn block" id="again" style="margin-top:16px">🎮 Ôn tiếp</button>
      <button class="btn block ghost" id="home" style="margin-top:10px">🏠 Về trang chính</button></div>`);
    $('#again').onclick=()=>pageReview();
    $('#home').onclick=()=>go('home');
  }
  step();
}

/* ================= BÀI TẬP SBT ================= */
function pageSBT(){
  shell(`<div class="card center">
    <div class="big">📝</div><h2 style="margin-top:6px">Bài tập Sách bài tập</h2>
    <p class="muted" style="margin-top:8px">Phần chữa bài tập 6 bài (tự động chấm, hiện đáp án & điểm) đang được cô cập nhật.</p>
    <p class="muted">Trong lúc chờ, hãy luyện thật chắc từ vựng ở mục <b>Ôn từ vựng</b> nhé! 💪</p>
    <button class="btn" id="go" style="margin-top:14px">🎮 Qua ôn từ vựng</button>
  </div>`);
  $('#go').onclick=()=>go('review');
}

/* ================= TỔNG QUAN ================= */
async function pageStats(){
  shell(`<div class="card center muted">Đang tổng hợp…</div>`);
  const sess=(await sessCol(STATE.code,STATE.sid).get()).docs.map(d=>d.data());
  const cards=Object.values(CARDS);
  const totSec=sess.reduce((n,s)=>n+(s.dur||0),0);
  const rev=sess.reduce((n,s)=>n+(s.reviewed||0),0), corr=sess.reduce((n,s)=>n+(s.correct||0),0);
  const acc=rev?Math.round(corr/rev*100):0;
  const mastered=ALLWORDS.filter(w=>masteryOf(w.id)>=5).length;
  const learned=cards.length;
  const weak=cards.filter(c=>(c.wrong||0)>(c.correct||0)).map(c=>WORDMAP[c.wid]).filter(Boolean);
  const lesDone=LESSONS.filter(l=>l.words.every(w=>masteryOf(w.id)>=5)).length;
  shell(`
    <div class="card"><h2>📊 Tổng quan học tập</h2>
      <div class="grid cols3" style="margin-top:14px">
        <div class="stat"><b>${ME.streak||0}</b><span>CHUỖI 🔥</span></div>
        <div class="stat"><b>${(ME.days||[]).length}</b><span>NGÀY HỌC</span></div>
        <div class="stat"><b>${fmtDur(totSec)}</b><span>TỔNG T.GIAN</span></div>
        <div class="stat"><b>${learned}</b><span>TỪ ĐÃ HỌC</span></div>
        <div class="stat"><b>${mastered}</b><span>TỪ ĐÃ THUỘC</span></div>
        <div class="stat"><b>${acc}%</b><span>ĐỘ CHÍNH XÁC</span></div>
      </div>
      <p class="muted" style="margin-top:12px">Đã học xong <b>${lesDone}/${LESSONS.length}</b> bài · tổng <b>${rev}</b> lượt ôn trong <b>${sess.length}</b> buổi.</p>
    </div>
    <div class="card"><h3>📈 Tiến độ từng bài</h3>
      <div style="margin-top:10px">${LESSONS.map(l=>{const tot=l.words.length;const mas=l.words.filter(w=>masteryOf(w.id)>=5).length;const pct=Math.round(mas/tot*100);
        return `<div style="margin-bottom:12px"><div class="spread" style="margin-bottom:5px"><span style="font-weight:800">${esc(l.title)}</span><span class="muted" style="font-weight:800">${mas}/${tot}</span></div><div class="progressbar"><i style="width:${pct}%"></i></div></div>`;}).join('')}</div>
    </div>
    <div class="card"><h3>⚠️ Từ cần ôn thêm (${weak.length})</h3>
      ${weak.length?`<div style="margin-top:10px">${weak.slice(0,30).map(w=>`<div class="vrow"><div class="vtop"><span class="vh">${esc(w.hanzi)}</span><span class="vp">${esc(w.pinyin)}</span><span style="margin-left:auto">${mbar(masteryOf(w.id))}</span></div><div class="vvi">${esc(w.vi)}</div></div>`).join('')}</div>
        <button class="btn block coral" id="fixweak" style="margin-top:12px">🎯 Ôn ngay nhóm từ yếu</button>`
      :`<p class="muted" style="margin-top:8px">Chưa có từ nào bị sai nhiều — giỏi quá! 🌟</p>`}
    </div>`);
  if(weak.length){ $('#fixweak').onclick=()=>{ // ôn riêng nhóm yếu bằng thẻ lật
    startGameFromWords('flash',weak); }; }
}
function startGameFromWords(game,words){
  // tạm thời dùng chọn nghĩa/flash trên danh sách tuỳ ý
  const ids=new Set(words.map(w=>w.id));
  const saved=ALLWORDS.slice();
  // dùng buildQueue 'all' rồi lọc — đơn giản: gọi startGame với scope all nhưng lọc
  const queue=words.map(w=>({w,card:CARDS[w.id]||{wid:w.id,lessonId:w.lessonId,reps:0,ease:2.3,interval:0,due:'',correct:0,wrong:0,seen:0,mastery:0}}));
  // tái dùng startGame bằng cách tạm thay thế: đơn giản hoá -> gọi startGame trên 1 "ảo"
  _customQueue=queue; startGame(game,'_custom',null);
}
let _customQueue=null;
// mở rộng buildQueue cho scope _custom
const _origBuildQueue=buildQueue;
buildQueue=function(scope,lid){ if(scope==='_custom'&&_customQueue){const q=_customQueue;_customQueue=null;return q;} return _origBuildQueue(scope,lid); };

/* ================= BẢNG XẾP HẠNG ================= */
async function pageRank(){
  shell(`<div class="card center muted">Đang xếp hạng…</div>`);
  const stus=await stuCol(STATE.code).get();
  const rows=[];
  for(const s of stus.docs){ const d=s.data();
    const cards=(await cardsCol(STATE.code,s.id).get()).docs.map(x=>x.data());
    const pts=cards.reduce((n,c)=>n+(c.mastery||0),0);
    const mastered=cards.filter(c=>(c.mastery||0)>=5).length;
    rows.push({id:s.id,name:d.name,streak:d.streak||0,learned:cards.length,mastered,pts});
  }
  rows.sort((a,b)=> b.pts-a.pts || b.mastered-a.mastered || b.streak-a.streak);
  const medal=i=>i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
  shell(`<div class="card">
    <div class="spread"><h2>🏆 Bảng xếp hạng lớp ${esc(STATE.codeShort||STATE.code)}</h2><span class="pill">${rows.length} bạn</span></div>
    <p class="muted" style="margin-top:4px">Điểm = tổng mức thành thạo của tất cả các từ. Chăm ôn là leo hạng! 🚀</p>
    <div style="margin-top:14px">${rows.map((r,i)=>`<div class="rankrow ${r.id===STATE.sid?'me':''}">
      <div class="rankno">${medal(i)}</div>
      <div style="flex:1;min-width:0"><b>${esc(r.name)}${r.id===STATE.sid?' (bạn)':''}</b><div class="muted" style="font-size:.82rem;font-weight:700">💎 ${r.mastered} thuộc · 📖 ${r.learned} đã học · 🔥 ${r.streak}</div></div>
      <div class="big" style="font-size:1.4rem;color:var(--brand-d)">${r.pts}</div>
    </div>`).join('')}</div>
  </div>`);
}

/* ================= tiện ích thời gian ================= */
function weekOf(d){const o=new Date(d);const day=(o.getDay()+6)%7;o.setDate(o.getDate()-day);return o.toISOString().slice(0,10);}
function fmtDur(s){s=s||0;const h=Math.floor(s/3600),m=Math.floor(s%3600/60);if(h)return `${h}h${String(m).padStart(2,'0')}`;return m?`${m}p${String(s%60).padStart(2,'0')}`:`${s}s`;}

/* ================= TRANG CHỦ / ĐĂNG NHẬP ================= */
const COURSES=[
  {id:'HSK1',sub:'Bắt đầu từ con số 0',       img:'c1.png',color:'#e8573f',ready:false},
  {id:'HSK2',sub:'Giao tiếp cơ bản',          img:'c2.png',color:'#2f7fd6',ready:false},
  {id:'HSK3',sub:'Tự tin nói – Hiểu sâu hơn', img:'c3.png',color:'#17936b',ready:true },
  {id:'HSK4',sub:'Nâng cao kỹ năng',          img:'c4.png',color:'#8257c4',ready:false},
  {id:'HSK5',sub:'Thành thạo tiếng Trung',    img:'c5.png',color:'#2f6fd6',ready:false}
];
function slug(s){return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');}
const mkCid=(lvl,ts,code)=>lvl+'__'+ts+'__'+code;
const ZALO='https://zalo.me/0368280988';
const soon=()=>toast('🚧 Mục này sắp ra mắt nha');

function viewLanding(){ showLanding(); }
function pickCourse(id){ const c=COURSES.find(x=>x.id===id); if(!c)return; if(!c.ready) return toast('🚧 '+id+' sắp ra mắt nha'); if(!FB_OK) return toast('Chưa kết nối máy chủ, thử lại sau'); viewLogin(id); }

function viewLogin(courseId){
  STATE.courseId=courseId; STATE.authTab=STATE.authTab||'student';
  const tab=STATE.authTab;
  render(`<div class="wrap" style="max-width:560px"><div class="card login-compact">
    <p style="margin:0 0 4px"><button class="linklike" id="back">← Về trang chủ</button></p>
    <div class="center"><div class="avatar" style="width:52px;height:52px;margin-bottom:6px"><img src="avatar.png" alt=""></div><div><span class="coursebadge">📘 ${esc(courseId)}</span></div></div>
    <h2 class="center" style="margin-top:6px">Vào lớp ${esc(courseId)}</h2>
    <div class="seg" style="margin-top:16px"><button data-tab="student" class="${tab==='student'?'on':''}">🧑‍🎓 Học viên</button><button data-tab="teacher" class="${tab==='teacher'?'on':''}">👩‍🏫 Giáo viên</button></div>
    <div id="form" style="margin-top:16px"></div>
  </div></div>`);
  $('#back').onclick=viewLanding;
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{STATE.authTab=b.dataset.tab;viewLogin(courseId);});
  const f=$('#form');
  if(tab==='student'){
    f.innerHTML=`
      <div class="field ico"><label>Mã lớp</label><span class="ic">🎫</span><input id="code" placeholder="VD: A1" autocapitalize="characters" value="${esc(lsGet('lastCode',''))}"></div>
      <div class="field ico"><label>Tên giáo viên</label><span class="ic">👩‍🏫</span><input id="tname" placeholder="VD: Cô Ngọ" value="${esc(lsGet('lastTeacher',''))}"></div>
      <div class="field ico"><label>Tên của bạn</label><span class="ic">🙂</span><input id="name" placeholder="VD: Minh Anh"></div>
      <div class="field ico"><label>Mã PIN (4 số, tự đặt)</label><span class="ic">🔒</span><input id="pin" inputmode="numeric" placeholder="VD: 1234"></div>
      <button class="btn block" id="go">Vào học 🚀</button>
      <p class="muted" style="margin-top:10px;font-size:.84rem">Nhập đúng mã lớp + tên cô của lớp bạn. Lần đầu nhập tên + PIN để tạo tài khoản; lần sau dùng lại đúng tên + PIN.</p>`;
    $('#go').onclick=async()=>{
      const code=$('#code').value.trim().toUpperCase(), tn=$('#tname').value.trim(), name=$('#name').value.trim(), pin=$('#pin').value.trim();
      if(!code||!tn||!name||!pin) return toast('Điền đủ thông tin nha');
      const cid=mkCid(courseId,slug(tn),code);
      try{
        const snap=await clsRef(cid).get();
        if(!snap.exists) return toast('Chưa có lớp này — kiểm tra lại mã lớp & tên cô');
        STATE.code=cid; STATE.codeShort=code; STATE.cls=snap.data(); STATE.teacher=snap.data().teacher||tn;
        lsSet('lastCode',code); lsSet('lastTeacher',tn);
        const sid=slug(name)+'_'+pin; const ref=stuRef(cid,sid); const ss=await ref.get();
        if(!ss.exists) await ref.set({name,pin,createdAt:now(),streak:0,lastDay:'',days:[]});
        else if(ss.data().pin!==pin) return toast('Sai PIN rồi nha');
        STATE.sid=sid; STATE.role='student';
        await loadMe(); await loadCards(); DASH=null; ROUTE='lessons'; pageLesson();
      }catch(e){ console.error(e); toast('Lỗi kết nối, thử lại'); }
    };
  }else{
    f.innerHTML=`
      <div class="field ico"><label>Tên giáo viên</label><span class="ic">👩‍🏫</span><input id="tname" placeholder="VD: Cô Ngọ" value="${esc(lsGet('lastTeacher',''))}"></div>
      <div class="field ico"><label>Mật khẩu giáo viên</label><span class="ic">🔑</span><input id="pw" placeholder="mật khẩu"></div>
      <button class="btn block" id="go">Vào bảng điều khiển</button>
      <p class="muted" style="margin-top:10px">Chưa có lớp? <button class="linklike" id="mk">Tạo lớp mới</button></p>`;
    $('#mk').onclick=()=>viewCreateClass(courseId);
    $('#go').onclick=async()=>{
      const tn=$('#tname').value.trim(), pw=$('#pw').value.trim(); if(!tn||!pw) return toast('Điền tên + mật khẩu');
      try{
        const q=await db.collection('classes').where('level','==',courseId).where('teacherSlug','==',slug(tn)).where('pin','==',pw).get();
        if(q.empty) return toast('Sai tên giáo viên hoặc mật khẩu');
        lsSet('lastTeacher',tn);
        if(q.docs.length===1){ enterTeacher(q.docs[0]); }
        else{
          render(`<div class="wrap"><div class="card"><h2>Chọn lớp để quản lý</h2><div class="grid" style="margin-top:12px" id="pick"></div>
            <p class="center" style="margin-top:12px"><button class="linklike" id="b">← Quay lại</button></p></div></div>`);
          $('#b').onclick=()=>viewLogin(courseId);
          const pk=$('#pick'); q.docs.forEach(d=>{const b=document.createElement('button');b.className='listbtn';b.innerHTML=`<div class="spread"><b>Lớp ${esc(d.data().code)}</b><span class="pill">${esc(d.data().level)}</span></div>`;b.onclick=()=>enterTeacher(d);pk.appendChild(b);});
        }
      }catch(e){ console.error(e); toast('Lỗi kết nối'); }
    };
  }
}
function enterTeacher(doc){ const d=doc.data(); STATE.code=doc.id; STATE.codeShort=d.code; STATE.courseId=d.level; STATE.cls=d; STATE.teacher=d.teacher; STATE.role='teacher'; viewTeacher(); }

function viewCreateClass(courseId){
  courseId=courseId||STATE.courseId||'HSK3';
  render(`<div class="wrap"><div class="card"><h2>Tạo lớp mới · ${esc(courseId)}</h2><p class="muted">Dành cho giáo viên.</p>
    <div style="margin-top:14px">
    <div class="field ico"><label>Tên giáo viên</label><span class="ic">👩‍🏫</span><input id="tn" placeholder="VD: Cô Ngọ"></div>
    <div class="field ico"><label>Mã lớp (học viên sẽ nhập)</label><span class="ic">🎫</span><input id="c" placeholder="VD: A1" autocapitalize="characters"></div>
    <div class="field ico"><label>Mật khẩu giáo viên</label><span class="ic">🔑</span><input id="p" placeholder="VD: 2468"></div>
    <button class="btn block" id="save">Tạo lớp</button>
    <p class="center" style="margin-top:12px"><button class="linklike" id="back">← Quay lại</button></p></div></div></div>`);
  $('#back').onclick=()=>viewLogin(courseId);
  $('#save').onclick=async()=>{
    const tn=$('#tn').value.trim(), c=$('#c').value.trim().toUpperCase(), p=$('#p').value.trim();
    if(!tn||!c||!p) return toast('Điền đủ tên cô + mã lớp + mật khẩu');
    const cid=mkCid(courseId,slug(tn),c);
    const ex=await clsRef(cid).get(); if(ex.exists) return toast('Lớp này (cô + mã) đã tồn tại');
    const data={level:courseId,teacher:tn,teacherSlug:slug(tn),code:c,pin:p,createdAt:now()};
    await clsRef(cid).set(data);
    toast('Đã tạo lớp 🎉'); STATE.code=cid; STATE.codeShort=c; STATE.courseId=courseId; STATE.cls=data; STATE.teacher=tn; STATE.role='teacher'; viewTeacher();
  };
}

/* ================= GIÁO VIÊN ================= */
function viewTeacher(tab){
  tab=tab||'dash';
  render(`<div class="wrap"><div class="card">
    <div class="apphero"><div class="spread"><div class="brand"><span class="mark" style="width:46px;height:46px"><img src="avatar.png" alt=""></span><span><b style="font-family:'Baloo 2';font-size:1.1rem">XiaoYu Class</b><small style="display:block;color:var(--muted);font-weight:700">Bảng điều khiển · ${esc(STATE.courseId||'')} · Lớp ${esc(STATE.codeShort||STATE.code)}</small></span></div><span style="font-size:1.8rem">📊</span></div></div>
    <div class="seg" style="margin-top:16px"><button data-t="dash" class="${tab==='dash'?'on':''}">Học viên</button><button data-t="content" class="${tab==='content'?'on':''}">Nội dung bài</button></div>
    <div id="panel" style="margin-top:14px"><p class="muted">Đang tải…</p></div>
    <p class="center muted" style="margin-top:8px"><button class="linklike" id="out">Đăng xuất</button></p></div></div>`);
  root.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>viewTeacher(b.dataset.t));
  $('#out').onclick=()=>{STATE.role=null;viewLanding();};
  tab==='dash'?teacherDash():teacherContent();
}
async function teacherDash(){
  const panel=$('#panel'); const stus=await stuCol(STATE.code).get();
  if(stus.empty){ panel.innerHTML=`<div class="soft" style="padding:16px">Chưa có học viên nào đăng nhập.<br>Chia sẻ mã lớp <b>${esc(STATE.codeShort||STATE.code)}</b> + tên cô cho các em nhé.</div>`; return; }
  const rows=[];
  for(const s of stus.docs){ const d=s.data();
    const cards=(await cardsCol(STATE.code,s.id).get()).docs.map(x=>x.data());
    const sess=(await sessCol(STATE.code,s.id).get()).docs.map(x=>x.data());
    const weak=cards.filter(c=>(c.wrong||0)>(c.correct||0)).length;
    const mastered=cards.filter(c=>(c.mastery||0)>=5).length;
    const totSec=sess.reduce((n,x)=>n+(x.dur||0),0), rev=sess.reduce((n,x)=>n+(x.reviewed||0),0), corr=sess.reduce((n,x)=>n+(x.correct||0),0);
    rows.push({name:d.name,streak:d.streak||0,learned:cards.length,mastered,weak,sessions:sess.length,time:totSec,acc:rev?Math.round(corr/rev*100):0,_sess:sess}); }
  const avgAcc=rows.length?Math.round(rows.reduce((n,r)=>n+r.acc,0)/rows.length):0;
  let html=`<div class="grid cols3"><div class="stat"><b>${rows.length}</b><span>HỌC VIÊN</span></div><div class="stat"><b>${avgAcc}%</b><span>ĐÚNG TB</span></div><div class="stat"><b>${rows.reduce((n,r)=>n+r.mastered,0)}</b><span>TỪ THUỘC</span></div></div>
    <div class="row" style="margin:14px 0"><button class="btn sm" id="csv">⬇️ Xuất CSV để phân tích</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>Tên</th><th>🔥</th><th>Đã học</th><th>Thuộc</th><th>Từ yếu</th><th>Buổi</th><th>T.gian</th><th>Đúng</th></tr></thead><tbody>`;
  rows.forEach(r=>html+=`<tr><td>${esc(r.name)}</td><td>${r.streak}</td><td>${r.learned}</td><td>${r.mastered}</td><td class="${r.weak?'weak':''}">${r.weak}</td><td>${r.sessions}</td><td>${fmtDur(r.time)}</td><td>${r.acc}%</td></tr>`);
  html+='</tbody></table></div>'; panel.innerHTML=html;
  $('#csv').onclick=()=>exportCSV(rows);
}
function exportCSV(rows){
  let lines=[['Tên','Chuỗi','Đã học','Thuộc','Từ yếu','Số buổi','Tổng giây','% đúng'].join(',')];
  rows.forEach(r=>lines.push([r.name,r.streak,r.learned,r.mastered,r.weak,r.sessions,r.time,r.acc].join(',')));
  lines.push(''); lines.push(['Tên','Tuần','Ngày','Kiểu','Số từ','Đúng','Sai','Giây'].join(','));
  rows.forEach(r=>r._sess.forEach(s=>lines.push([r.name,s.week||'',new Date(s.startedAt).toISOString().slice(0,10),s.game||'',s.reviewed||0,s.correct||0,s.wrong||0,s.dur||0].join(','))));
  const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='xiaoyu_'+(STATE.codeShort||'lop')+'_'+todayKey()+'.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function teacherContent(){
  const panel=$('#panel');
  let html=`<p class="muted">Nội dung 6 bài (${TOTAL_WORDS} từ) đã nạp sẵn trong hệ thống. Học viên học & ôn theo đây.</p>`;
  LESSONS.forEach(l=>{
    html+=`<div class="soft" style="padding:14px;margin-top:12px"><div class="spread"><b>${esc(l.title)}</b><span class="pill">${l.words.length} từ</span></div>
      <div class="tbl-wrap" style="margin-top:8px"><table><tbody>`;
    l.words.forEach(w=>html+=`<tr><td style="font-family:'Baloo 2'">${esc(w.hanzi)}</td><td>${esc(w.pinyin)}</td><td class="muted">${esc(w.pos)}</td><td>${esc(w.vi)}</td></tr>`);
    html+=`</tbody></table></div></div>`;
  });
  panel.innerHTML=html;
}

initLanding();
