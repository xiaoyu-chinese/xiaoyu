
const firebaseConfig = {
  apiKey: "AIzaSyAeeTVhAnTds9pPxCPcgNWAbc4zAiVsP3I",
  authDomain: "xiaoyu-chinese.firebaseapp.com",
  projectId: "xiaoyu-chinese",
  storageBucket: "xiaoyu-chinese.firebasestorage.app",
  messagingSenderId: "333044970276",
  appId: "1:333044970276:web:356bb1af3eda4649eb79b1"
};
let db=null, auth=null, FB_OK=false;
try{ if(firebaseConfig.apiKey && firebaseConfig.apiKey!=="DAN_VAO_DAY"){
  firebase.initializeApp(firebaseConfig); db=firebase.firestore(); auth=firebase.auth(); FB_OK=true; } }catch(e){ console.warn(e); }

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
const testsCol=c=>clsRef(c).collection('tests');
const resCol=(c,s)=>stuRef(c,s).collection('results');

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
    {id:'test',    ic:'🧪', t:'Kiểm tra'},
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
  if(r==='test')return pageTest();
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
async function pageTest(){
  shell('<div class="xcard"><p class="muted">Đang tải bài kiểm tra…</p></div>');
  let tests=[],results={};
  try{ const q=await testsCol(STATE.code).get(); tests=q.docs.map(d=>({id:d.id,...d.data()})); }catch(e){}
  tests.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  try{ const r=await resCol(STATE.code,STATE.sid).get(); r.docs.forEach(d=>results[d.id]=d.data()); }catch(e){}
  let html=`<div class="xcard"><h2 style="margin:0">🧪 Kiểm tra</h2><p class="muted" style="margin-top:4px">Làm bài kiểm tra cô giao. Kết quả tự gửi về cho giáo viên.</p></div>`;
  if(!tests.length){
    html+=`<div class="xcard center" style="padding:30px"><div class="big">📝</div><p class="muted" style="margin-top:8px">Chưa có bài kiểm tra nào. Khi cô giao đề, bài sẽ hiện ở đây.</p></div>`;
  }else{
    html+='<div class="card">';
    tests.forEach(t=>{const r=results[t.id];const nq=(t.questions||[]).length;
      html+=`<div class="listbtn" style="cursor:default"><div class="spread"><div><b>${esc(t.title||'Bài kiểm tra')}</b><small class="muted" style="display:block">${nq} câu${t.lessonTitle?' · '+esc(t.lessonTitle):''}</small></div>`;
      if(r){ html+=`<span class="pill jade">${r.score==null?'Chờ chấm':('Điểm '+r.score+'/100')}</span>`; }
      else { html+=`<button class="btn sm do" data-id="${esc(t.id)}">Làm bài →</button>`; }
      html+='</div></div>';
    });
    html+='</div>';
  }
  shell(html);
  root.querySelectorAll('.do').forEach(b=>b.onclick=()=>{const t=tests.find(x=>x.id===b.dataset.id);if(t)takeTest(t);});
}
function takeTest(test){
  const qs=test.questions||[];
  let html=`<div class="xcard"><div class="spread"><h2 style="margin:0">${esc(test.title||'Bài kiểm tra')}</h2><button class="linklike" id="bk">← Thoát</button></div><p class="muted" style="margin-top:4px">${qs.length} câu · làm xong bấm Nộp bài.</p></div><div class="card" id="qbox">`;
  qs.forEach((q,i)=>{
    html+=`<div style="padding:12px 0;border-bottom:1px solid #eef2f7"><div style="font-weight:700;margin-bottom:8px">Câu ${i+1}. ${esc(q.q||'')}</div>`;
    if(q.type==='mc'||q.type==='tf'){
      const opts=q.type==='tf'?['Đúng','Sai']:(q.options||[]);
      html+=opts.map((o,j)=>`<label class="opt" style="display:block;cursor:pointer;margin:4px 0;text-align:left"><input type="radio" name="q${i}" value="${j}" style="margin-right:8px">${esc(o)}</label>`).join('');
    }else if(q.type==='fill'){
      html+=`<input class="ansbox fillin" data-i="${i}" placeholder="Nhập đáp án" style="width:100%">`;
    }else{
      html+=`<textarea class="fillin" data-i="${i}" rows="3" placeholder="Viết câu trả lời…" style="width:100%;padding:10px;border:1px solid #e2e8f1;border-radius:9px;font:inherit"></textarea><small class="muted">Câu tự luận — giáo viên sẽ chấm.</small>`;
    }
    html+='</div>';
  });
  html+=`</div><button class="btn block" id="submit" style="margin-top:14px">Nộp bài</button>`;
  shell(html);
  $('#bk').onclick=()=>go('test');
  $('#submit').onclick=()=>{
    const ans=qs.map((q,i)=>{
      if(q.type==='mc'||q.type==='tf'){const sel=root.querySelector(`input[name="q${i}"]:checked`);return sel?+sel.value:null;}
      const el=root.querySelector(`.fillin[data-i="${i}"]`);return el?el.value.trim():'';
    });
    submitTest(test,ans);
  };
}
async function submitTest(test,ans){
  const qs=test.questions||[];
  const norm=s=>(s==null?'':s).toString().trim().toLowerCase().replace(/\s+/g,' ');
  let earned=0,autoMax=0,hasEssay=false;
  const detail=qs.map((q,i)=>{const pts=q.points||1;let ok=null;
    if(q.type==='mc'||q.type==='tf'){autoMax+=pts;ok=(ans[i]===q.answer);if(ok)earned+=pts;}
    else if(q.type==='fill'){autoMax+=pts;const acc=(q.accept||[q.answer]).map(norm);ok=acc.includes(norm(ans[i]));if(ok)earned+=pts;}
    else{hasEssay=true;}
    return {ok};});
  const score=autoMax?Math.round(earned/autoMax*100):null;
  const rec={tid:test.id,title:test.title||'Bài kiểm tra',score,earned,autoMax,answers:ans,hasEssay,graded:!hasEssay,submittedAt:now()};
  try{ await resCol(STATE.code,STATE.sid).doc(test.id).set(rec); }catch(e){ toast('Lưu kết quả lỗi: '+authErr(e)); }
  let html=`<div class="xcard center" style="padding:28px"><div class="big">${score==null?'📝':score>=80?'🎉':score>=50?'👍':'💪'}</div><h2 style="margin-top:6px">${score==null?'Đã nộp bài!':'Điểm của bạn: '+score+'/100'}</h2>${hasEssay?'<p class="muted">Có câu tự luận — giáo viên sẽ chấm và cập nhật điểm.</p>':''}</div><div class="card"><h3>Chi tiết</h3>`;
  qs.forEach((q,i)=>{const d=detail[i];const mark=d.ok==null?'·':d.ok?'✅':'❌';
    html+=`<div style="padding:8px 0;border-bottom:1px solid #eef2f7"><div style="font-weight:600">${mark} Câu ${i+1}. ${esc(q.q||'')}</div>`;
    if(q.type==='mc')html+=`<div class="muted" style="font-size:.86rem">Đáp án đúng: ${esc((q.options||[])[q.answer]||'')}</div>`;
    else if(q.type==='tf')html+=`<div class="muted" style="font-size:.86rem">Đáp án đúng: ${q.answer===0?'Đúng':'Sai'}</div>`;
    else if(q.type==='fill')html+=`<div class="muted" style="font-size:.86rem">Đáp án: ${esc(q.answer||'')}</div>`;
    html+='</div>';
  });
  html+='</div><button class="btn block" id="done" style="margin-top:14px">Xong</button>';
  shell(html);
  $('#done').onclick=()=>go('test');
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
function pickCourse(id){ const c=COURSES.find(x=>x.id===id); if(!c)return; if(!c.ready) return toast('🚧 '+id+' sắp ra mắt nha'); if(!FB_OK) return toast('Chưa kết nối máy chủ, thử lại sau'); STATE.courseId=id; STATE.authMode='login'; if(auth&&auth.currentUser){ return accountGate(id); } viewLogin(id); }
function accountGate(courseId){
  const u=auth.currentUser;
  if(!u) return viewLogin(courseId);
  authShell(courseId,'Tiếp tục', `
    <p style="text-align:center;line-height:1.7">Bạn đang đăng nhập bằng:<br><b>${esc(u.email||'')}</b></p>
    <button class="btn block" id="go">Tiếp tục vào học →</button>
    <p class="center" style="margin-top:12px"><button class="linklike" id="sw">Đăng nhập bằng tài khoản khác</button></p>`);
  $('#go').onclick=()=>routeByRole();
  $('#sw').onclick=async()=>{ try{ await auth.signOut(); }catch(e){} STATE.me=null; STATE.code=null; STATE.sid=null; STATE.authMode='login'; viewLogin(courseId); };
}

/* ================= AUTH (Firebase Authentication) ================= */
const usersCol=()=>db.collection('users');
const userRef=u=>usersCol().doc(u);
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode(level){
  const pre=(level||'HSK0').replace(/[^0-9]/g,'')||'0';
  let r=''; for(let i=0;i<5;i++) r+=CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];
  return 'H'+pre+'-'+r;
}
function authErr(e){
  const c=(e&&e.code)||'';
  if(c.includes('email-already-in-use')) return 'Email này đã đăng ký — thử Đăng nhập';
  if(c.includes('invalid-email')) return 'Email không hợp lệ';
  if(c.includes('weak-password')) return 'Mật khẩu quá yếu (cần ≥ 6 ký tự)';
  if(c.includes('wrong-password')||c.includes('invalid-credential')||c.includes('invalid-login')) return 'Sai email hoặc mật khẩu';
  if(c.includes('user-not-found')) return 'Chưa có tài khoản này — thử Đăng ký';
  if(c.includes('user-disabled')) return 'Tài khoản đã bị khóa';
  if(c.includes('too-many-requests')) return 'Thử lại sau ít phút nhé';
  if(c.includes('network')) return 'Lỗi mạng — kiểm tra kết nối (VPN?)';
  console.error(e); return 'Có lỗi, thử lại';
}
async function routeByRole(){
  const u=auth.currentUser; if(!u) return viewLogin(STATE.courseId);
  let us; try{ us=(await userRef(u.uid).get()).data(); }catch(e){ return toast(authErr(e)); }
  if(!us){ us={email:u.email,name:u.displayName||'',role:'student',createdAt:now()}; try{ await userRef(u.uid).set(us); }catch(e){} }
  try{ await userRef(u.uid).update({lastActive:now()}); }catch(e){}
  STATE.me=us; STATE.uid=u.uid;
  if(us.role==='owner') return viewOwner();
  if(us.role==='teacher') return viewTeacherHome();
  return enterStudent(us);
}
async function enterStudent(us){
  if(!us.classId) return viewJoinClass();
  const cls=await clsRef(us.classId).get();
  if(!cls.exists) return viewJoinClass('Lớp cũ không còn — nhập lại mã lớp mới nhé.');
  try{ const bn=await clsRef(us.classId).collection('banned').doc(auth.currentUser.uid).get(); if(bn.exists){ try{ await userRef(auth.currentUser.uid).update({classId:''}); }catch(e){} STATE.me.classId=''; return viewJoinClass('Bạn không còn trong lớp này. Liên hệ giáo viên nếu cần.'); } }catch(e){}
  const d=cls.data();
  STATE.code=us.classId; STATE.codeShort=d.code; STATE.courseId=d.level; STATE.cls=d; STATE.teacher=d.teacherName; STATE.sid=auth.currentUser.uid; STATE.role='student';
  const ref=stuRef(STATE.code,STATE.sid); const ss=await ref.get();
  if(!ss.exists) await ref.set({name:us.name||'',email:us.email||'',createdAt:now(),streak:0,lastDay:'',days:[]});
  await loadMe(); await loadCards(); DASH=null; ROUTE='lessons'; pageLesson();
}
function authShell(courseId,title,body){
  render(`<div class="wrap" style="max-width:520px"><div class="card login-compact">
    <p style="margin:0 0 4px"><button class="linklike" id="back">← Về trang chủ</button></p>
    <div class="center"><div class="avatar" style="width:52px;height:52px;margin-bottom:6px"><img src="avatar.png" alt=""></div><div><span class="coursebadge">📘 ${esc(courseId||'XiaoYu')}</span></div></div>
    <h2 class="center" style="margin-top:6px">${title}</h2>
    <div id="form" style="margin-top:16px">${body}</div>
  </div></div>`);
  $('#back').onclick=viewLanding;
}
function viewLogin(courseId){
  courseId=courseId||STATE.courseId||'HSK3'; STATE.courseId=courseId;
  STATE.authMode=STATE.authMode||'login';
  const mode=STATE.authMode;
  const seg=`<div class="seg" style="margin-bottom:16px"><button data-m="login" class="${mode==='login'?'on':''}">Đăng nhập</button><button data-m="signup" class="${mode==='signup'?'on':''}">Đăng ký</button></div>`;
  let body;
  if(mode==='login'){
    body=seg+`
      <div class="field ico"><label>Email</label><span class="ic">✉️</span><input id="email" type="email" autocomplete="email" placeholder="email@..." value="${esc(lsGet('lastEmail',''))}"></div>
      <div class="field ico"><label>Mật khẩu</label><span class="ic">🔑</span><input id="pw" type="password" autocomplete="current-password" placeholder="mật khẩu"></div>
      <button class="btn block" id="go">Đăng nhập</button>
      <p class="center" style="margin-top:10px"><button class="linklike" id="forgot">Quên mật khẩu?</button></p>`;
  }else{
    const r=STATE.signupRole||'student';
    body=seg+`
      <div class="seg" style="margin-bottom:12px"><button data-r="student" class="${r==='student'?'on':''}">🧑‍🎓 Học viên</button><button data-r="teacher" class="${r==='teacher'?'on':''}">👩‍🏫 Giáo viên</button></div>
      <div class="field ico"><label>Họ tên</label><span class="ic">🙂</span><input id="name" placeholder="VD: Minh Anh"></div>
      <div class="field ico"><label>Email</label><span class="ic">✉️</span><input id="email" type="email" autocomplete="email" placeholder="email@..."></div>
      <div class="field ico"><label>Mật khẩu (≥ 6 ký tự)</label><span class="ic">🔑</span><input id="pw" type="password" autocomplete="new-password" placeholder="mật khẩu"></div>
      ${r==='student'?`<div class="field ico"><label>Mã lớp (cô cấp)</label><span class="ic">🎫</span><input id="code" placeholder="VD: H3-ABC12" autocapitalize="characters"></div>`:''}
      <button class="btn block" id="go">Đăng ký</button>`;
  }
  authShell(courseId, (mode==='login'?'Đăng nhập':'Đăng ký')+' · '+esc(courseId), body);
  root.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{STATE.authMode=b.dataset.m;viewLogin(courseId);});
  root.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{STATE.signupRole=b.dataset.r;viewLogin(courseId);});
  if(mode==='login'){
    $('#go').onclick=doLogin; $('#forgot').onclick=doForgot;
    $('#pw').onkeydown=e=>{ if(e.key==='Enter') doLogin(); };
  }else{
    $('#go').onclick=doSignup;
  }
}
async function doLogin(){
  const email=($('#email').value||'').trim(), pw=$('#pw').value||'';
  if(!email||!pw) return toast('Nhập email + mật khẩu nha');
  const btn=$('#go'); btn.disabled=true; btn.textContent='Đang vào…';
  try{ await auth.signInWithEmailAndPassword(email,pw); lsSet('lastEmail',email); await routeByRole(); }
  catch(e){ btn.disabled=false; btn.textContent='Đăng nhập'; toast(authErr(e)); }
}
async function doSignup(){
  const role=STATE.signupRole||'student';
  const name=($('#name').value||'').trim(), email=($('#email').value||'').trim(), pw=$('#pw').value||'';
  if(!name||!email||!pw) return toast('Điền đủ họ tên, email, mật khẩu');
  if(pw.length<6) return toast('Mật khẩu cần từ 6 ký tự');
  let code='';
  if(role==='student'){
    code=($('#code').value||'').trim().toUpperCase(); if(!code) return toast('Nhập mã lớp cô cấp');
    const cls=await clsRef(code).get(); if(!cls.exists) return toast('Mã lớp không đúng — hỏi lại cô nhé');
  }
  const btn=$('#go'); btn.disabled=true; btn.textContent='Đang tạo…';
  try{
    const cred=await auth.createUserWithEmailAndPassword(email,pw);
    const uid=cred.user.uid;
    const doc={email,name,role,createdAt:now(),lastActive:now()};
    if(role==='student') doc.classId=code;
    await userRef(uid).set(doc);
    try{ await cred.user.updateProfile({displayName:name}); }catch(e){}
    lsSet('lastEmail',email);
    await routeByRole();
    toast('Tạo tài khoản thành công 🎉');
  }catch(e){ btn.disabled=false; btn.textContent='Đăng ký'; toast(authErr(e)); }
}
async function doForgot(){
  const email=(($('#email')&&$('#email').value)||'').trim();
  const to=email||prompt('Nhập email để nhận link đặt lại mật khẩu:');
  if(!to) return;
  try{ await auth.sendPasswordResetEmail(to); toast('Đã gửi mail đặt lại mật khẩu — kiểm tra hộp thư (cả Spam) nhé'); }
  catch(e){ toast(authErr(e)); }
}
function viewJoinClass(msg){
  authShell(STATE.courseId,'Vào lớp', `
    ${msg?`<p class="muted" style="margin-bottom:10px">${esc(msg)}</p>`:''}
    <div class="field ico"><label>Mã lớp (cô cấp)</label><span class="ic">🎫</span><input id="code" placeholder="VD: H3-ABC12" autocapitalize="characters"></div>
    <button class="btn block" id="go">Vào lớp</button>
    <p class="center muted" style="margin-top:10px"><button class="linklike" id="out">Đăng xuất</button></p>`);
  $('#out').onclick=doLogout;
  $('#go').onclick=async()=>{
    const code=($('#code').value||'').trim().toUpperCase(); if(!code) return toast('Nhập mã lớp');
    const cls=await clsRef(code).get(); if(!cls.exists) return toast('Mã lớp không đúng');
    const bn=await clsRef(code).collection('banned').doc(auth.currentUser.uid).get(); if(bn.exists) return toast('Bạn bị cấm vào lớp này');
    await userRef(auth.currentUser.uid).update({classId:code});
    STATE.me.classId=code; await enterStudent(STATE.me);
  };
}
async function doLogout(){ try{ await auth.signOut(); }catch(e){} STATE.role=null; STATE.me=null; STATE.code=null; STATE.sid=null; viewLanding(); }

/* ====== GIÁO VIÊN: chọn / tạo lớp ====== */
async function viewTeacherHome(){
  render(`<div class="wrap"><div class="card">
    <div class="apphero"><div class="spread"><div class="brand"><span class="mark" style="width:46px;height:46px"><img src="avatar.png" alt=""></span><span><b style="font-family:'Baloo 2';font-size:1.1rem">XiaoYu Class</b><small style="display:block;color:var(--muted);font-weight:700">Giáo viên · ${esc((STATE.me&&STATE.me.name)||'')}</small></span></div><span style="font-size:1.8rem">👩‍🏫</span></div></div>
    <div class="row" style="margin-top:16px"><button class="btn" id="mk">+ Tạo lớp mới</button></div>
    <div id="list" style="margin-top:14px"><p class="muted">Đang tải lớp…</p></div>
    <p class="center muted" style="margin-top:8px"><button class="linklike" id="out">Đăng xuất</button></p></div></div>`);
  $('#out').onclick=doLogout; $('#mk').onclick=()=>viewCreateClass(STATE.courseId);
  const list=$('#list');
  try{
    const q=await db.collection('classes').where('teacherUid','==',auth.currentUser.uid).get();
    if(q.empty){ list.innerHTML=`<div class="soft" style="padding:16px">Cô chưa có lớp nào. Bấm <b>+ Tạo lớp mới</b> — hệ thống sẽ cấp <b>mã lớp</b> để gửi cho học viên.</div>`; return; }
    list.innerHTML='';
    q.docs.forEach(dd=>{const c=dd.data();const b=document.createElement('button');b.className='listbtn';b.innerHTML=`<div class="spread"><b>Lớp ${esc(c.code)}</b><span class="pill">${esc(c.level)}</span></div>`;b.onclick=()=>{STATE.code=dd.id;STATE.codeShort=c.code;STATE.courseId=c.level;STATE.cls=c;STATE.teacher=c.teacherName;STATE.role='teacher';viewTeacher();};list.appendChild(b);});
  }catch(e){ list.innerHTML='<p class="muted">'+esc(authErr(e))+'</p>'; }
}
function viewCreateClass(courseId){
  courseId=courseId||STATE.courseId||'HSK3';
  render(`<div class="wrap"><div class="card"><h2>Tạo lớp mới</h2>
    <p class="muted">Hệ thống sẽ tự cấp <b>mã lớp</b> để cô gửi cho học viên.</p>
    <div style="margin-top:14px">
    <div class="field ico"><label>Trình độ</label><span class="ic">📘</span>
      <select id="lvl">${COURSES.map(c=>`<option value="${c.id}" ${c.id===courseId?'selected':''}>${c.id}</option>`).join('')}</select></div>
    <button class="btn block" id="save">Tạo lớp &amp; cấp mã</button>
    <p class="center" style="margin-top:12px"><button class="linklike" id="back">← Quay lại</button></p></div></div></div>`);
  $('#back').onclick=viewTeacherHome;
  $('#save').onclick=async()=>{
    const lvl=$('#lvl').value||courseId;
    const btn=$('#save'); btn.disabled=true; btn.textContent='Đang tạo…';
    try{
      let code, tries=0; do{ code=genCode(lvl); tries++; }while((await clsRef(code).get()).exists && tries<8);
      const data={code,level:lvl,teacherUid:auth.currentUser.uid,teacherName:(STATE.me&&STATE.me.name)||'',createdAt:now()};
      await clsRef(code).set(data);
      STATE.code=code; STATE.codeShort=code; STATE.courseId=lvl; STATE.cls=data; STATE.teacher=data.teacherName; STATE.role='teacher';
      toast('Đã tạo lớp 🎉 Mã: '+code); viewTeacher();
    }catch(e){ btn.disabled=false; btn.textContent='Tạo lớp & cấp mã'; toast(authErr(e)); }
  };
}

/* ================= CHỦ (OWNER) ================= */
async function viewOwner(){
  render(`<div class="wrap"><div class="card">
    <div class="apphero"><div class="spread"><div class="brand"><span class="mark" style="width:46px;height:46px"><img src="avatar.png" alt=""></span><span><b style="font-family:'Baloo 2';font-size:1.1rem">XiaoYu · Quản trị</b><small style="display:block;color:var(--muted);font-weight:700">Tài khoản chủ</small></span></div><span style="font-size:1.8rem">🛡️</span></div></div>
    <div class="seg" style="margin-top:16px"><button data-o="users" class="on">Tài khoản</button><button data-o="classes">Lớp học</button></div>
    <div id="opanel" style="margin-top:14px"><p class="muted">Đang tải…</p></div>
    <p class="center muted" style="margin-top:8px"><button class="linklike" id="teach">👩‍🏫 Chế độ giáo viên</button> &nbsp;·&nbsp; <button class="linklike" id="out">Đăng xuất</button></p></div></div>`);
  $('#out').onclick=doLogout; $('#teach').onclick=viewTeacherHome;
  root.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{root.querySelectorAll('[data-o]').forEach(x=>x.classList.remove('on'));b.classList.add('on'); b.dataset.o==='users'?ownerUsers():ownerClasses();});
  ownerUsers();
}
async function ownerUsers(){
  const p=$('#opanel'); p.innerHTML='<p class="muted">Đang tải tài khoản…</p>';
  try{
    const q=await usersCol().get();
    const rows=q.docs.map(d=>({uid:d.id,...d.data()}));
    const roleName={owner:'Chủ',teacher:'Giáo viên',student:'Học viên'};
    let html=`<div class="grid cols3"><div class="stat"><b>${rows.length}</b><span>TÀI KHOẢN</span></div><div class="stat"><b>${rows.filter(r=>r.role==='teacher').length}</b><span>GIÁO VIÊN</span></div><div class="stat"><b>${rows.filter(r=>r.role==='student').length}</b><span>HỌC VIÊN</span></div></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Email</th><th>Tên</th><th>Vai trò</th><th>Lớp</th><th>Hoạt động</th><th></th></tr></thead><tbody>`;
    rows.sort((a,b)=>(b.lastActive||0)-(a.lastActive||0)).forEach(r=>{
      html+=`<tr><td>${esc(r.email||'')}</td><td>${esc(r.name||'')}</td><td>${esc(roleName[r.role]||r.role||'')}</td><td>${esc(r.classId||'—')}</td><td class="muted">${r.lastActive?new Date(r.lastActive).toISOString().slice(0,10):'—'}</td><td><button class="btn sm reset" data-email="${esc(r.email||'')}">Reset MK</button></td></tr>`;
    });
    html+='</tbody></table></div><p class="muted" style="margin-top:8px">Mật khẩu được mã hóa — không hiển thị được. Dùng <b>Reset MK</b> để gửi mail đặt lại cho tài khoản.</p>';
    p.innerHTML=html;
    p.querySelectorAll('.reset').forEach(b=>b.onclick=async()=>{const em=b.dataset.email;if(!em)return;try{await auth.sendPasswordResetEmail(em);toast('Đã gửi mail đặt lại cho '+em);}catch(e){toast(authErr(e));}});
  }catch(e){ p.innerHTML='<p class="muted">Lỗi tải tài khoản — kiểm tra Security Rules đã cho owner đọc <b>users</b> chưa.</p>'; }
}
async function ownerClasses(){
  const p=$('#opanel'); p.innerHTML='<p class="muted">Đang tải lớp…</p>';
  try{
    const q=await db.collection('classes').get();
    if(q.empty){ p.innerHTML='<p class="muted">Chưa có lớp nào.</p>'; return; }
    let html=`<div class="tbl-wrap"><table><thead><tr><th>Mã lớp</th><th>Trình độ</th><th>Giáo viên</th><th>Tạo ngày</th></tr></thead><tbody>`;
    q.docs.forEach(d=>{const c=d.data();html+=`<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.level)}</td><td>${esc(c.teacherName||'')}</td><td class="muted">${c.createdAt?new Date(c.createdAt).toISOString().slice(0,10):'—'}</td></tr>`;});
    html+='</tbody></table></div>'; p.innerHTML=html;
  }catch(e){ p.innerHTML='<p class="muted">Lỗi tải lớp.</p>'; }
}

/* ================= GIÁO VIÊN ================= */
/* ================= CONSOLE GIÁO VIÊN ================= */
const TC_CSS=`<style>
.tconsole{display:flex;gap:16px;max-width:1280px;margin:0 auto;padding:12px}
.tc-side{width:234px;flex:0 0 234px;background:var(--card,#fff);border:1px solid #e9eef5;border-radius:16px;padding:12px;position:sticky;top:12px;align-self:flex-start}
.tc-brand{display:flex;gap:10px;align-items:center;padding:6px 6px 12px;border-bottom:1px solid #eef2f7;margin-bottom:8px}
.tc-brand img{width:40px;height:40px;border-radius:50%}
.tc-nav{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;padding:9px 12px;border-radius:10px;font-weight:600;color:var(--fg,#243b53);cursor:pointer;font-size:.9rem}
.tc-nav:hover{background:#f1f5fb}
.tc-nav.on{background:#eef0ff;color:#4b43c4}
.tc-nav span{width:20px;text-align:center}
.tc-main{flex:1;min-width:0}
.tc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.tc-top h2{margin:0;font-family:'Baloo 2'}
.tc-ctx{background:#eef0ff;color:#4b43c4;padding:6px 12px;border-radius:999px;font-weight:700;font-size:.85rem;white-space:nowrap}
.dotc{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
.tc-tabs{display:flex;gap:2px;border-bottom:1px solid #eef2f7;margin:0 0 14px;flex-wrap:wrap}
.tc-tab{background:none;border:none;padding:8px 13px;font-weight:700;color:#8aa0b2;cursor:pointer;border-bottom:2px solid transparent;font-size:.88rem}
.tc-tab.on{color:#4b43c4;border-bottom-color:#4b43c4}
.tc-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tc-filters select,.tc-filters input{padding:7px 10px;border:1px solid #e2e8f1;border-radius:9px;font:inherit;background:var(--card,#fff);color:inherit}
.tc-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.tc-head h3{margin:0;font-family:'Baloo 2';font-size:1.25rem}
.pbar{height:7px;background:#eef3f9;border-radius:5px;overflow:hidden;min-width:64px}
.pbar>span{display:block;height:100%;background:#6d5cf0;border-radius:5px}
.pbar.pg>span{background:#23b386}.pbar.py>span{background:#f0a500}.pbar.pr>span{background:#e5484d}
.barcell{display:flex;align-items:center;gap:8px}.barcell .pbar{flex:1}
.chip{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.78rem;font-weight:700;white-space:nowrap}
.chip.g{background:#e3f6ee;color:#17805a}.chip.y{background:#fdf1d6;color:#9a6a00}.chip.r{background:#fde8e8;color:#c0362f}.chip.b{background:#e7ecfb;color:#3a46b0}.chip.n{background:#eef2f7;color:#5b6b7b}
.avatarc{width:30px;height:30px;border-radius:50%;background:#e7ecfb;color:#3a46b0;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:.8rem;flex:0 0 30px}
.kv{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #f0f3f8;font-size:.88rem}
.kv:last-child{border-bottom:none}.kv b{text-align:right}
.dcard{border:1px dashed #cdd6e4!important}
.bubble{max-width:82%;padding:8px 11px;border-radius:12px;font-size:.88rem;line-height:1.5;margin:6px 0}
.bubble.ai{background:#f1f5fb;border-bottom-left-radius:3px}
.bubble.hs{background:#eef0ff;margin-left:auto;border-bottom-right-radius:3px}
.critbar{display:grid;grid-template-columns:120px 1fr 38px;gap:8px;align-items:center;margin:7px 0;font-size:.85rem}
.sk{background:linear-gradient(90deg,#f0f3f8,#e7edf4,#f0f3f8);border-radius:6px;color:transparent;user-select:none}
@media(max-width:760px){.tconsole{flex-direction:column;padding:8px}.tc-side{width:auto;flex:none;position:static;display:flex;gap:6px;overflow-x:auto;padding:8px}.tc-brand{display:none}.tc-nav{white-space:nowrap;width:auto}}
</style>`;
const TC_NAV=[['overview','📊','Tổng quan'],['classes','🏫','Quản lý lớp học'],['students','👥','Học viên'],['vocab','📖','Phân tích từ vựng'],['convo','💬','Lịch sử hội thoại AI'],['report','📋','Báo cáo buổi học'],['tests','📝','Kiểm tra & đánh giá'],['progress','📈','Phân tích tiến bộ'],['settings','⚙️','Cài đặt']];
function viewTeacher(screen){
  screen=screen||STATE.tcScreen||'overview'; STATE.tcScreen=screen;
  render(`${TC_CSS}<div class="tconsole">
    <aside class="tc-side">
      <div class="tc-brand"><img src="avatar.png" alt=""><div><b style="font-family:'Baloo 2'">XiaoYu Chinese</b><small style="display:block;color:var(--muted)">Giáo viên${STATE.me&&STATE.me.name?' · '+esc(STATE.me.name):''}</small></div></div>
      ${TC_NAV.map(([k,ic,lb])=>`<button class="tc-nav ${k===screen?'on':''}" data-s="${k}"><span>${ic}</span>${lb}</button>`).join('')}
      <button class="tc-nav" id="tc-out" style="margin-top:6px;color:#e5484d"><span>🚪</span>Đăng xuất</button>
    </aside>
    <main class="tc-main">
      <div class="tc-top"><div><h2 id="tc-title">…</h2><p class="muted" id="tc-sub" style="margin:2px 0 0;font-size:.9rem"></p></div><span class="tc-ctx">Lớp ${esc(STATE.codeShort||STATE.code)}</span></div>
      <div id="panel"><p class="muted">Đang tải…</p></div>
    </main></div>`);
  root.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>viewTeacher(b.dataset.s));
  $('#tc-out').onclick=doLogout;
  tcRoute(screen);
}
function tcRoute(s){
  const meta={overview:['Bảng điều khiển giáo viên','Theo dõi & đánh giá quá trình học từ vựng của học viên'],classes:['Quản lý lớp học','Danh sách lớp, lịch học & tài liệu'],students:['Học viên','Danh sách & hồ sơ từng học viên'],vocab:['Phân tích từ vựng','Tình trạng từ vựng của cả lớp'],convo:['Lịch sử hội thoại AI','Transcript & phân tích các buổi luyện nói'],report:['Báo cáo buổi học','Tổng kết từng buổi Live'],tests:['Kiểm tra & đánh giá','Bài kiểm tra & ngân hàng câu hỏi'],progress:['Phân tích tiến bộ','Xu hướng kết quả theo thời gian'],settings:['Cài đặt','Thông tin lớp học']};
  const t=$('#tc-title'),sub=$('#tc-sub'); if(t)t.textContent=(meta[s]||['',''])[0]; if(sub)sub.textContent=(meta[s]||['',''])[1];
  const body=$('#panel');
  if(s==='overview')return tcOverview(body);
  if(s==='classes')return tcClasses(body);
  if(s==='students')return teacherDash();
  if(s==='vocab')return tcVocab(body);
  if(s==='convo')return tcConvo(body);
  if(s==='report')return tcReport(body);
  if(s==='tests')return tcTests(body);
  if(s==='progress')return tcProgress(body);
  if(s==='settings')return tcSettings(body);
  body.innerHTML='<p class="muted">—</p>';
}
async function classData(force){
  if(!force && STATE._rowsCode===STATE.code && STATE._rows) return STATE._rows;
  const d=await loadClassRows(); STATE._rows=d; STATE._rowsCode=STATE.code; return d;
}
function classAgg(rows){
  const curr=(typeof ALLWORDS!=='undefined'?ALLWORDS.length:0);
  const n=rows.length;
  const avgAcc=n?Math.round(rows.reduce((a,r)=>a+r.acc,0)/n):0;
  const totTime=rows.reduce((a,r)=>a+r.time,0);
  const totSess=rows.reduce((a,r)=>a+(r.sessions||0),0);
  const avgProg=(curr&&n)?Math.round(rows.reduce((a,r)=>a+Math.min(r.learned,curr)/curr,0)/n*100):0;
  const classBk=rows.reduce((o,r)=>({g:o.g+r.bk.g,b:o.b+r.bk.b,a:o.a+r.bk.a,wt:o.wt+r.bk.wt,total:o.total+r.bk.total}),{g:0,b:0,a:0,wt:0,total:0});
  return {curr,n,avgAcc,totTime,totSess,avgProg,classBk};
}
function pctOf(v,t){ return t?Math.round(v/t*100):0; }
function tcShell(body,ic,title,desc){
  body.innerHTML=`<div class="soft" style="padding:40px 20px;text-align:center"><div style="font-size:2.4rem">${ic}</div><h3 style="margin:8px 0">${esc(title)}</h3><p class="muted" style="max-width:480px;margin:0 auto;line-height:1.6">${esc(desc)}</p><p style="margin-top:14px"><span class="pill">⏳ Sắp ra mắt</span></p></div>`;
}
async function loadClassRows(){
  const stus=await stuCol(STATE.code).get(); const WM=wordMap(); const rows=[]; const classWeak={};
  for(const s of stus.docs){ const d=s.data();
    const cards=(await cardsCol(STATE.code,s.id).get()).docs.map(x=>x.data());
    const sess=(await sessCol(STATE.code,s.id).get()).docs.map(x=>x.data());
    const cardMap={}; cards.forEach(c=>cardMap[c.wid]=c);
    const bk=bucketsFromCards(cardMap);
    cards.forEach(c=>{ if((c.wrong||0)>(c.correct||0)) classWeak[c.wid]=(classWeak[c.wid]||0)+1; });
    const totSec=sess.reduce((n,x)=>n+(x.dur||0),0), rev=sess.reduce((n,x)=>n+(x.reviewed||0),0), corr=sess.reduce((n,x)=>n+(x.correct||0),0);
    let results=[]; try{ results=(await resCol(STATE.code,s.id).get()).docs.map(x=>x.data()); }catch(e){}
    const scored=results.filter(x=>typeof x.score==='number');
    const testAvg=scored.length?Math.round(scored.reduce((n,x)=>n+x.score,0)/scored.length):null;
    rows.push({uid:s.id,name:d.name||'(chưa đặt tên)',email:d.email||'',streak:d.streak||0,learned:cards.length,mastered:bk.g,learning:bk.b,weak:bk.a,wait:bk.wt,bk,sessions:sess.length,time:totSec,acc:rev?Math.round(corr/rev*100):0,testAvg,results,cards,sess,cardMap});
  }
  return {rows,classWeak,WM};
}
function donutSvg(bk){
  const segs=[['#23b386',bk.g],['#2f9fd6',bk.b],['#f0a500',bk.a],['#e5484d',bk.wt]];
  const tot=bk.total||1; let off=25; let arcs='';
  segs.forEach(([c,v])=>{ const pct=tot?v/tot*100:0; if(pct>0.01){ arcs+=`<circle cx="21" cy="21" r="15.9" fill="none" stroke="${c}" stroke-width="5" stroke-dasharray="${pct.toFixed(2)} ${(100-pct).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"></circle>`; } off-=pct; });
  return `<svg viewBox="0 0 42 42" width="126" height="126"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#eef3f9" stroke-width="5"></circle>${arcs}</svg>`;
}
function lineChart(points){
  const w=520,h=170,pad=28;
  if(!points||points.length<2) return '<p class="muted" style="padding:24px 0;text-align:center">Chưa đủ dữ liệu để vẽ biểu đồ (cần ít nhất 2 buổi học).</p>';
  const mx=w-pad,my=h-pad;
  const xs=i=>pad+(i/(points.length-1))*(mx-pad), ys=v=>my-(v/100)*(my-pad);
  const d=points.map((p,i)=>`${i?'L':'M'}${xs(i).toFixed(1)} ${ys(p.y).toFixed(1)}`).join(' ');
  const dots=points.map((p,i)=>`<circle cx="${xs(i).toFixed(1)}" cy="${ys(p.y).toFixed(1)}" r="3.2" fill="#6d5cf0"></circle>`).join('');
  let grid=''; [0,25,50,75,100].forEach(v=>{const y=ys(v).toFixed(1);grid+=`<line x1="${pad}" y1="${y}" x2="${mx}" y2="${y}" stroke="#eef2f7"></line><text x="4" y="${(+y+3).toFixed(1)}" font-size="9" fill="#9aa8b8">${v}</text>`;});
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;margin-top:8px">${grid}<path d="${d}" fill="none" stroke="#6d5cf0" stroke-width="2.5" stroke-linejoin="round"></path>${dots}</svg>`;
}
async function tcOverview(body){
  body.innerHTML='<p class="muted">Đang tổng hợp dữ liệu lớp…</p>';
  let data; try{ data=await loadClassRows(); }catch(e){ body.innerHTML='<p class="muted">Lỗi tải dữ liệu. Thử lại.</p>'; return; }
  const {rows,classWeak,WM}=data;
  const curr=(typeof ALLWORDS!=='undefined'?ALLWORDS.length:0);
  const n=rows.length;
  const avgAcc=n?Math.round(rows.reduce((a,r)=>a+r.acc,0)/n):0;
  const totTime=rows.reduce((a,r)=>a+r.time,0);
  const avgProg=(curr&&n)?Math.round(rows.reduce((a,r)=>a+Math.min(r.learned,curr)/curr,0)/n*100):0;
  const classBk=rows.reduce((o,r)=>({g:o.g+r.bk.g,b:o.b+r.bk.b,a:o.a+r.bk.a,wt:o.wt+r.bk.wt,total:o.total+r.bk.total}),{g:0,b:0,a:0,wt:0,total:0});
  const wa={}; rows.forEach(r=>r.cards.forEach(c=>{const x=wa[c.wid]||(wa[c.wid]={cr:0,wr:0});x.cr+=(c.correct||0);x.wr+=(c.wrong||0);}));
  const hard=Object.keys(classWeak).map(id=>{const a=wa[id]||{cr:0,wr:0};return{w:WM[id],n:classWeak[id],pct:(a.cr+a.wr)?Math.round(a.cr/(a.cr+a.wr)*100):0};}).filter(x=>x.w).sort((a,b)=>b.n-a.n).slice(0,5);
  const br={good:rows.filter(r=>r.acc>=90).length,ok:rows.filter(r=>r.acc>=75&&r.acc<90).length,help:rows.filter(r=>r.acc>=60&&r.acc<75).length,fail:rows.filter(r=>r.acc<60).length};
  const byDate={}; rows.forEach(r=>r.sess.forEach(s=>{const k=s.startedAt?new Date(s.startedAt).toISOString().slice(0,10):null;const rev=s.reviewed||0;if(!k||!rev)return;byDate[k]=byDate[k]||{rev:0,cr:0};byDate[k].rev+=rev;byDate[k].cr+=(s.correct||0);}));
  const linePts=Object.keys(byDate).sort().map(k=>({y:Math.round(byDate[k].cr/byDate[k].rev*100)}));
  const cm=[];
  if(!n) cm.push('Chưa có học sinh — gửi mã lớp để các em đăng ký.');
  else{
    cm.push(`Lớp có <b>${n}</b> học sinh, độ đúng trung bình <b>${avgAcc}%</b>.`);
    if(hard.length) cm.push(`Từ cả lớp hay sai: <b>${hard.slice(0,3).map(h=>esc(h.w.hanzi)).join('、')}</b> — nên ôn chung.`);
    if(br.fail) cm.push(`<b>${br.fail}</b> học viên dưới 60% — cần hỗ trợ thêm.`);
    if(totTime===0) cm.push('Chưa có hoạt động học — nhắc học sinh bắt đầu luyện.');
  }
  const dashed='border:1px dashed #cdd6e4';
  body.innerHTML=`
  ${!n?`<div class="soft" style="padding:14px;margin-bottom:12px"><p class="muted" style="margin:0">👋 Lớp chưa có học sinh. Gửi mã lớp <b>${esc(STATE.codeShort||STATE.code)}</b> để các em đăng ký — <b>mọi số liệu dưới đây sẽ tự cập nhật</b> khi học sinh bắt đầu học.</p></div>`:''}
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
    <div class="stat"><b>${n}</b><span>SỐ HỌC SINH</span></div>
    <div class="stat"><b>${avgProg}%</b><span>TIẾN ĐỘ GIÁO TRÌNH TB</span></div>
    <div class="stat"><b>${avgAcc}%</b><span>TỶ LỆ TRẢ LỜI ĐÚNG</span></div>
    <div class="stat"><b>${curr}</b><span>TỪ VỰNG GIÁO TRÌNH</span></div>
    <div class="stat"><b>${fmtDur(totTime)}</b><span>TỔNG THỜI GIAN HỌC</span></div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;margin-top:14px">
    <div class="soft" style="padding:14px;min-width:0"><b>📈 Tiến độ trung bình của lớp</b>${lineChart(linePts)}</div>
    <div class="soft" style="padding:14px"><b>🫧 Mức độ nắm vững từ vựng (toàn lớp)</b>
      <div style="display:flex;gap:16px;align-items:center;margin-top:10px;flex-wrap:wrap">${donutSvg(classBk)}
      <div style="font-size:.85rem;line-height:2">
        <div><span class="dotc" style="background:#23b386"></span>Vận dụng tốt <b>${classBk.g}</b></div>
        <div><span class="dotc" style="background:#2f9fd6"></span>Đã nhận biết <b>${classBk.b}</b></div>
        <div><span class="dotc" style="background:#f0a500"></span>Chưa vững <b>${classBk.a}</b></div>
        <div><span class="dotc" style="background:#e5484d"></span>Chưa ghi nhớ <b>${classBk.wt}</b></div>
      </div></div></div>
    <div class="soft" style="padding:14px;${dashed}"><div class="spread"><b>🎥 Lớp học trực tuyến (Live)</b><button class="linklike" id="toLive">Xem chi tiết →</button></div>
      <p class="muted" style="margin-top:10px">Chưa có buổi Live. Khu vực luyện nghe–nói với AI — <b>sắp ra mắt</b> (cần backend AI Speaking Tutor).</p>
      <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px">
        <div class="stat" style="padding:8px"><b>—</b><span>BUỔI LIVE</span></div>
        <div class="stat" style="padding:8px"><b>—</b><span>TỶ LỆ THAM GIA</span></div>
      </div></div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:14px">
    <div class="soft" style="padding:14px"><b>🔥 Top từ vựng cần ôn tập của lớp</b>${hard.length?`<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Từ</th><th>Nghĩa</th><th>% đúng</th><th>Số em sai</th></tr></thead><tbody>${hard.map(h=>`<tr><td style="font-size:1.05rem">${esc(h.w.hanzi)}</td><td>${esc(h.w.vi)}</td><td>${h.pct}%</td><td><b>${h.n}</b></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin-top:8px">Chưa có từ khó nổi bật.</p>'}</div>
    <div class="soft" style="padding:14px"><b>✨ Nhận xét & đề xuất</b><ul style="margin:8px 0 0;padding-left:18px;line-height:1.8;font-size:.9rem">${cm.map(c=>`<li>${c}</li>`).join('')}</ul><p class="muted" style="margin-top:8px;font-size:.76rem">*Tổng hợp tự động từ dữ liệu. Nhận xét bằng AI sẽ bổ sung sau.</p></div>
    <div class="soft" style="padding:14px"><div class="spread"><b>👥 Quản lý học viên</b><button class="linklike" id="toStu2">Chi tiết →</button></div><div style="margin-top:10px;font-size:.9rem;line-height:2.2">
      <div class="spread"><span>🟢 Đạt tốt (≥90%)</span><b>${br.good}</b></div>
      <div class="spread"><span>🔵 Đạt (75–89%)</span><b>${br.ok}</b></div>
      <div class="spread"><span>🟠 Cần hỗ trợ (60–74%)</span><b>${br.help}</b></div>
      <div class="spread"><span>🔴 Chưa đạt (&lt;60%)</span><b>${br.fail}</b></div>
    </div></div>
    <div class="soft" style="padding:14px"><div class="spread"><b>📖 Phân tích từ vựng</b><button class="linklike" id="toVocab">Chi tiết →</button></div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:10px;flex-wrap:wrap">${donutSvg(classBk)}
      <div style="font-size:.84rem;line-height:1.95">
        <div>Tổng số từ <b>${curr}</b></div>
        <div><span class="dotc" style="background:#23b386"></span>Vận dụng tốt <b>${classBk.g}</b></div>
        <div><span class="dotc" style="background:#f0a500"></span>Chưa vững <b>${classBk.a}</b></div>
        <div><span class="dotc" style="background:#e5484d"></span>Cần ôn <b>${classBk.wt}</b></div>
      </div></div></div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:14px">
    <div class="soft" style="padding:14px;${dashed}"><div class="spread"><b>📋 Báo cáo buổi học (tổng hợp)</b><button class="linklike" id="toReport">→</button></div><p class="muted" style="margin-top:10px">Báo cáo mỗi buổi Live (tỷ lệ đúng, vận dụng từ, nhận xét) — hiện khi có buổi Live.</p></div>
    <div class="soft" style="padding:14px;${dashed}"><div class="spread"><b>📝 Kiểm tra & đánh giá</b><button class="linklike" id="toTests">→</button></div><p class="muted" style="margin-top:10px">Chưa có bài kiểm tra. Tạo bài kiểm tra & ngân hàng câu hỏi — giai đoạn sau.</p></div>
    <div class="soft" style="padding:14px"><div class="spread"><b>📈 Phân tích tiến bộ</b><button class="linklike" id="toProg">→</button></div>${linePts.length>=2?lineChart(linePts):'<p class="muted" style="margin-top:10px">Cần ≥2 buổi học để thấy xu hướng tiến bộ.</p>'}</div>
  </div>`;
  const on=(id,s)=>{const b=$(id);if(b)b.onclick=()=>viewTeacher(s);};
  on('#toLive','report');on('#toStu2','students');on('#toVocab','vocab');on('#toReport','report');on('#toTests','tests');on('#toProg','progress');
}
function bucketsForIds(rows, ids){
  let g=0,b=0,a=0,wt=0;
  rows.forEach(r=>{ ids.forEach(id=>{ const c=r.cardMap[id];
    if(!c){wt++;return;}
    if((c.mastery||0)>=5)g++;
    else if((c.wrong||0)>(c.correct||0))a++;
    else if((c.mastery||0)>=1)b++;
    else wt++;
  });});
  return {g,b,a,wt,total:g+b+a+wt};
}
function vocLegend(bk){
  const t=bk.total||1;
  return `<div style="font-size:.86rem;line-height:2.1">
    <div class="spread"><span><span class="dotc" style="background:#23b386"></span>Vận dụng tốt</span><b>${pctOf(bk.g,t)}% (${bk.g})</b></div>
    <div class="spread"><span><span class="dotc" style="background:#2f9fd6"></span>Đã nhận biết</span><b>${pctOf(bk.b,t)}% (${bk.b})</b></div>
    <div class="spread"><span><span class="dotc" style="background:#f0a500"></span>Chưa vững</span><b>${pctOf(bk.a,t)}% (${bk.a})</b></div>
    <div class="spread"><span><span class="dotc" style="background:#e5484d"></span>Chưa ghi nhớ</span><b>${pctOf(bk.wt,t)}% (${bk.wt})</b></div>
  </div>`;
}
async function tcVocab(body){
  body.innerHTML='<p class="muted">Đang phân tích từ vựng…</p>';
  let data; try{ data=await classData(); }catch(e){ body.innerHTML='<p class="muted">Lỗi tải dữ liệu.</p>'; return; }
  const {rows,classWeak,WM}=data;
  const curr=(typeof ALLWORDS!=='undefined'?ALLWORDS.length:0);
  const lessons=(typeof LESSONS!=='undefined'?LESSONS:[]);
  const wa={}; rows.forEach(r=>r.cards.forEach(c=>{const x=wa[c.wid]||(wa[c.wid]={cr:0,wr:0});x.cr+=(c.correct||0);x.wr+=(c.wrong||0);}));
  const waPct=id=>{const x=wa[id]||{cr:0,wr:0};const t=x.cr+x.wr;return t?Math.round(x.cr/t*100):null;};
  const allIds=(typeof ALLWORDS!=='undefined'?ALLWORDS.map(w=>w.id):[]);
  let tab='tq', lesId='all';
  const empty=!rows.length;
  function weakRows(ids){
    const set=ids?new Set(ids):null;
    return Object.keys(classWeak).map(id=>({w:WM[id],n:classWeak[id],pct:waPct(id)}))
      .filter(x=>x.w && (!set||set.has(x.w.id))).sort((a,b)=>b.n-a.n);
  }
  function wbar(pct){ const cls=pct==null?'':pct>=75?'pg':pct>=50?'py':'pr'; return `<div class="barcell"><div class="pbar ${cls}"><span style="width:${pct==null?0:pct}%"></span></div><span>${pct==null?'—':pct+'%'}</span></div>`; }
  function render(){
    const ids=lesId==='all'?allIds:(lessons.find(l=>l.id===lesId)||{words:[]}).words.map(w=>w.id);
    const bk=lesId==='all'?classAgg(rows).classBk:bucketsForIds(rows,ids);
    const centerN=lesId==='all'?curr:ids.length;
    const lesSel=`<select id="vles"><option value="all">Toàn giáo trình</option>${lessons.map(l=>`<option value="${l.id}" ${l.id===lesId?'selected':''}>${esc(l.title)}</option>`).join('')}</select>`;
    let html=`<div class="tc-head"><div class="tc-filters">${lesSel}<span class="chip b">Toàn lớp · ${rows.length} HV</span></div></div>
      <div class="tc-tabs">
        ${[['tq','Tổng quan'],['bai','Theo bài học'],['hv','Theo học viên'],['on','Từ cần ôn tập']].map(([k,l])=>`<button class="tc-tab ${tab===k?'on':''}" data-t="${k}">${l}</button>`).join('')}
      </div><div id="vbody"></div>`;
    body.innerHTML=html;
    body.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();});
    const vl=$('#vles')||$('#vles'); if(vl)vl.onchange=()=>{lesId=vl.value;render();};
    const vb=$('#vbody');
    if(empty){ vb.innerHTML='<div class="soft" style="padding:28px;text-align:center"><p class="muted">Chưa có dữ liệu học — số liệu từ vựng sẽ tự hiện khi học sinh bắt đầu học. Cấu trúc phân tích đã sẵn sàng.</p></div>'; return; }
    if(tab==='tq'){
      const hw=weakRows(lesId==='all'?null:ids).slice(0,8);
      vb.innerHTML=`<div class="grid" style="grid-template-columns:1fr 1.25fr;gap:14px">
        <div class="soft" style="padding:16px"><b>🫧 Mức độ nắm vững (lượt từ · toàn lớp)</b>
          <div style="display:flex;gap:18px;align-items:center;margin-top:12px;flex-wrap:wrap">
            <div style="position:relative;width:126px;height:126px">${donutSvg(bk)}<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><b style="font-size:1.3rem;font-family:'Baloo 2'">${centerN}</b><small class="muted">từ vựng</small></div></div>
            <div style="flex:1;min-width:150px">${vocLegend(bk)}</div></div></div>
        <div class="soft" style="padding:16px"><b>⚠️ Từ vựng cần ôn tập nhiều nhất</b>${hw.length?`<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Từ vựng</th><th>Nghĩa</th><th>Tỷ lệ dùng đúng</th></tr></thead><tbody>${hw.map(h=>`<tr><td style="font-size:1.1rem">${esc(h.w.hanzi)} <small class="muted" style="font-size:.72rem">${esc(h.w.pinyin)}</small></td><td>${esc(h.w.vi)}</td><td>${wbar(h.pct)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin-top:8px">Chưa có từ nào bị sai nổi bật. 👍</p>'}</div></div>`;
    } else if(tab==='bai'){
      vb.innerHTML=lessons.length?lessons.map(l=>{const lb=bucketsForIds(rows,l.words.map(w=>w.id));return `<div class="soft" style="padding:14px;margin-bottom:10px"><div class="spread"><b>${esc(l.title)}</b><span class="pill">${l.words.length} từ · nắm vững ${pctOf(lb.g,lb.total)}%</span></div>${statusBar(lb)}<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:600;font-size:.86rem;color:#4b43c4">Xem danh sách từ</summary><div class="tbl-wrap" style="margin-top:6px"><table><tbody>${l.words.map(w=>`<tr><td style="font-size:1.05rem">${esc(w.hanzi)}</td><td class="muted">${esc(w.pinyin)}</td><td>${esc(w.vi)}</td><td style="width:120px">${wbar(waPct(w.id))}</td></tr>`).join('')}</tbody></table></div></details></div>`;}).join(''):'<p class="muted">Chưa nạp danh sách bài.</p>';
    } else if(tab==='hv'){
      vb.innerHTML=`<div class="soft" style="padding:12px"><div class="tbl-wrap"><table><thead><tr><th>Học viên</th><th>Vận dụng tốt</th><th>Đã nhận biết</th><th>Chưa vững</th><th>Chưa ghi nhớ</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td><span class="chip g">${r.bk.g}</span></td><td><span class="chip b">${r.bk.b}</span></td><td><span class="chip y">${r.bk.a}</span></td><td><span class="chip n">${r.bk.wt}</span></td></tr>`).join('')}</tbody></table></div></div>`;
    } else {
      const wr=weakRows(lesId==='all'?null:ids);
      vb.innerHTML=`<div class="soft" style="padding:12px"><b>Từ cần ôn tập (${wr.length})</b>${wr.length?`<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Từ</th><th>Pinyin</th><th>Nghĩa</th><th>Số em sai</th><th>Tỷ lệ đúng</th></tr></thead><tbody>${wr.map(h=>`<tr><td style="font-size:1.1rem">${esc(h.w.hanzi)}</td><td class="muted">${esc(h.w.pinyin)}</td><td>${esc(h.w.vi)}</td><td><b>${h.n}</b></td><td style="width:130px">${wbar(h.pct)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted" style="margin-top:8px">Chưa có từ cần ôn nổi bật. 👍</p>'}</div>`;
    }
  }
  render();
}
function tcSettings(body){
  const c=STATE.cls||{};
  body.innerHTML=`<div class="soft" style="padding:16px"><b>Thông tin lớp</b>
    <div class="tbl-wrap" style="margin-top:10px"><table><tbody>
      <tr><td class="muted">Mã lớp</td><td><b>${esc(STATE.codeShort||STATE.code)}</b></td></tr>
      <tr><td class="muted">Trình độ</td><td>${esc(c.level||STATE.courseId||'')}</td></tr>
      <tr><td class="muted">Giáo viên</td><td>${esc(c.teacherName||(STATE.me&&STATE.me.name)||'')}</td></tr>
      <tr><td class="muted">Ngày tạo</td><td>${c.createdAt?new Date(c.createdAt).toISOString().slice(0,10):'—'}</td></tr>
    </tbody></table></div>
    <p class="muted" style="margin-top:10px;font-size:.85rem">Chia sẻ <b>mã lớp</b> cho học sinh để các em đăng ký vào lớp.</p>
    <p style="margin-top:12px"><button class="linklike" id="home">← Về danh sách lớp</button></p></div>`;
  const h=$('#home'); if(h)h.onclick=viewTeacherHome;
}
async function tcClasses(body){
  body.innerHTML='<p class="muted">Đang tải danh sách lớp…</p>';
  let tab='list', classes=[];
  try{ const q=await db.collection('classes').where('teacherUid','==',auth.currentUser.uid).get(); classes=q.docs.map(d=>({id:d.id,...d.data()})); }
  catch(e){ body.innerHTML='<p class="muted">Lỗi tải lớp.</p>'; return; }
  for(const c of classes){ try{ c._n=(await stuCol(c.id).get()).size; }catch(e){ c._n='—'; } }
  let agg=null; try{ agg=classAgg((await classData()).rows); }catch(e){}
  const cur=classes.find(c=>c.id===STATE.code)||classes[0]||{};
  function render(){
    const tabs=[['list','Danh sách lớp'],['sched','Lịch học'],['assign','Phân công'],['mat','Tài liệu lớp']];
    const trs=classes.map(c=>`<tr><td><b>Lớp ${esc(c.code)}</b></td><td>${esc(c.level||'')}</td><td>${c._n}</td><td class="muted">—</td><td><span class="chip g">Đang học</span></td><td><button class="btn sm go" data-id="${esc(c.id)}" title="Mở lớp">Mở</button></td></tr>`).join('');
    const other=tab==='sched'?'Lịch học từng lớp — sẽ bổ sung khi cô thiết lập thời khoá biểu.':tab==='assign'?'Phân công giáo viên/trợ giảng — dành cho giai đoạn nhiều lớp.':'Tài liệu & giáo trình của lớp — sắp bổ sung.';
    body.innerHTML=`<div class="tc-head"><div class="tc-tabs">${tabs.map(([k,l])=>`<button class="tc-tab ${tab===k?'on':''}" data-t="${k}">${l}</button>`).join('')}</div><button class="btn sm" id="mk">+ Tạo lớp học</button></div>
    <div class="grid" style="grid-template-columns:1.6fr 1fr;gap:14px">
      <div class="soft" style="padding:10px">${tab==='list'?`<div class="tbl-wrap"><table><thead><tr><th>Tên lớp</th><th>Khóa học</th><th>Số học viên</th><th>Lịch học</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${classes.length?trs:`<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Chưa có lớp nào.</td></tr>`}</tbody></table></div>`:`<div style="padding:28px;text-align:center" class="muted">${other}</div>`}</div>
      <div class="soft" style="padding:16px"><b>Thông tin lớp: ${esc(cur.code||'—')}</b><div style="margin-top:10px">
        <div class="kv"><span>Khóa học</span><b>${esc(cur.level||'—')}</b></div>
        <div class="kv"><span>Số học viên</span><b>${agg?agg.n:(cur._n||'—')}</b></div>
        <div class="kv"><span>Đã tổ chức</span><b>${agg?agg.totSess+' buổi':'—'}</b></div>
        <div class="kv"><span>Tổng thời lượng</span><b>${agg?fmtDur(agg.totTime):'—'}</b></div>
        <div class="kv"><span>Tỷ lệ tham gia TB</span><b>—</b></div>
        <div class="kv"><span>Ngày tạo</span><b>${cur.createdAt?new Date(cur.createdAt).toISOString().slice(0,10):'—'}</b></div>
      </div><button class="btn block" id="detail" style="margin-top:12px">Xem chi tiết lớp →</button></div>
    </div>`;
    body.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();});
    const mk=$('#mk'); if(mk)mk.onclick=()=>viewCreateClass(STATE.courseId);
    const dt=$('#detail'); if(dt)dt.onclick=()=>viewTeacher('students');
    body.querySelectorAll('.go').forEach(b=>b.onclick=()=>{const c=classes.find(x=>x.id===b.dataset.id);if(!c)return;STATE.code=c.id;STATE.codeShort=c.code;STATE.courseId=c.level;STATE.cls=c;STATE._rows=null;viewTeacher('overview');});
  }
  render();
}
function tcConvo(body){
  const demo=(a,b)=>`<div class="bubble ai">${a}</div><div class="bubble hs">${b}</div>`;
  body.innerHTML=`
  <div class="soft dcard" style="padding:12px;margin-bottom:12px"><p class="muted" style="margin:0">💬 <b>Lịch sử hội thoại AI</b> — hiển thị từng lượt luyện nói của học viên với AI kèm chấm điểm tự động. Cần hệ <b>AI Speaking Tutor</b> (nhận giọng → AI phản hồi → chấm). Giao diện đã dựng sẵn; khi backend AI hoạt động, mỗi lượt nói + đánh giá sẽ tự lưu vào đây.</p></div>
  <div class="tc-filters" style="margin-bottom:12px"><select disabled><option>Học viên: (chưa có dữ liệu)</option></select><select disabled><option>Buổi học</option></select><select disabled><option>Loại: Tất cả</option></select></div>
  <div class="grid" style="grid-template-columns:.9fr 1.3fr 1fr;gap:12px">
    <div class="soft" style="padding:12px"><b>Danh sách lượt hội thoại</b><div style="margin-top:8px">${[1,2,3,4].map(i=>`<div class="soft" style="padding:8px;margin-bottom:6px"><b class="sk">Lượt ${i}</b><div class="sk" style="margin-top:4px">———————</div></div>`).join('')}</div></div>
    <div class="soft" style="padding:12px"><b>Chi tiết hội thoại</b><div style="margin-top:8px;opacity:.55">${demo('你周末打算做什么？','我打算去爬山。')}${demo('你为什么喜欢爬山？','因为爬山让我放松。')}</div><p class="muted" style="margin-top:8px;font-size:.8rem">(Nội dung minh hoạ cấu trúc)</p></div>
    <div class="soft" style="padding:12px"><b>Đánh giá lượt nói</b><div style="margin-top:8px">
      <div class="kv"><span>Điểm</span><b>—/100</b></div>
      <div class="kv"><span>Từ vựng</span><b>—</b></div>
      <div class="kv"><span>Ngữ pháp</span><b>—</b></div>
      <div class="kv"><span>Phản hồi</span><b>—</b></div>
      <div class="kv"><span>Phát âm</span><b>—</b></div>
      <div class="kv"><span>Lưu loát</span><b>—</b></div>
    </div><div class="soft dcard" style="padding:10px;margin-top:10px"><b>Phân tích & nhận xét AI</b><p class="muted" style="margin:6px 0 0;font-size:.84rem">Nhận xét tự động về cách dùng từ, ngữ pháp và gợi ý mở rộng câu sẽ hiện ở đây.</p></div></div>
  </div>`;
}
async function tcReport(body){
  body.innerHTML='<p class="muted">Đang tải…</p>';
  let agg=null; try{ agg=classAgg((await classData()).rows); }catch(e){}
  const crit=[['Độ chính xác (tỷ lệ đúng)',agg?agg.avgAcc:null],['Vận dụng từ đã học',null],['Ngữ pháp',null],['Phản hồi hội thoại',null],['Hoàn thành nhiệm vụ',null]];
  const bar=(l,v)=>`<div class="critbar"><span>${l}</span><div class="pbar ${v==null?'':v>=75?'pg':v>=50?'py':'pr'}"><span style="width:${v==null?0:v}%"></span></div><span>${v==null?'—':v+'%'}</span></div>`;
  body.innerHTML=`
  <div class="soft dcard" style="padding:12px;margin-bottom:12px"><p class="muted" style="margin:0">📋 Báo cáo tổng kết <b>mỗi buổi học Live</b>. Các chỉ số buổi Live (thời lượng, tham gia, vận dụng từ, nhận xét AI) sẽ tự tạo khi có buổi Live với AI. Chỉ số tỷ lệ đúng dưới đây lấy từ dữ liệu tự luyện thật.</p></div>
  <div class="tc-head"><h3>Báo cáo lớp học Live</h3><div class="tc-filters"><select disabled><option>Lớp ${esc(STATE.codeShort||STATE.code)}</option></select><select disabled><option>Chọn buổi (chưa có)</option></select></div></div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
    <div class="stat"><b>—</b><span>THỜI LƯỢNG</span></div>
    <div class="stat"><b>${agg&&agg.n?agg.n+'/'+agg.n:'—'}</b><span>THAM GIA</span></div>
    <div class="stat"><b>${agg?agg.avgAcc+'%':'—'}</b><span>TỶ LỆ ĐÚNG</span></div>
    <div class="stat"><b>—</b><span>VẬN DỤNG TỪ</span></div>
  </div>
  <div class="grid" style="grid-template-columns:1.3fr 1fr;gap:14px;margin-top:14px">
    <div class="soft" style="padding:16px"><b>Kết quả theo tiêu chí (toàn lớp)</b><div style="margin-top:10px">${crit.map(([l,v])=>bar(l,v)).join('')}</div></div>
    <div class="soft" style="padding:16px"><b>✨ Nhận xét & đề xuất AI</b><p class="muted" style="margin-top:8px;font-size:.86rem">Nhận xét tổng hợp của AI về buổi học (điểm mạnh, lỗi thường gặp, từ cần ôn, đề xuất bài sau) sẽ hiện sau mỗi buổi Live.</p><button class="btn block" id="toStu" style="margin-top:10px">Xem danh sách chi tiết học viên →</button></div>
  </div>`;
  const b=$('#toStu'); if(b)b.onclick=()=>viewTeacher('students');
}
async function tcTests(body){
  body.innerHTML='<p class="muted">Đang tải…</p>';
  let tests=[],rows=[];
  try{ const q=await testsCol(STATE.code).get(); tests=q.docs.map(d=>({id:d.id,...d.data()})); }catch(e){}
  tests.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  try{ rows=(await classData()).rows; }catch(e){}
  const resAgg={}; rows.forEach(r=>(r.results||[]).forEach(x=>{const a=resAgg[x.tid]||(resAgg[x.tid]={done:0,sum:0,scored:0});a.done++;if(typeof x.score==='number'){a.sum+=x.score;a.scored++;}}));
  let tab='list';
  function render(){
    const tabs=[['list','Bài kiểm tra'],['crit','Đánh giá theo tiêu chí'],['bank','Ngân hàng câu hỏi']];
    let inner;
    if(tab==='list'){
      const trs=tests.map(t=>{const a=resAgg[t.id]||{done:0,sum:0,scored:0};const avg=a.scored?Math.round(a.sum/a.scored):null;return `<tr><td><b>${esc(t.title||'—')}</b></td><td>${esc(t.lessonTitle||'—')}</td><td>Trắc nghiệm</td><td>${(t.questions||[]).length}</td><td>${a.done}/${rows.length||0}</td><td>${avg==null?'—':'<b>'+avg+'</b>'}</td><td><span class="chip ${a.done?'g':'n'}">${a.done?'Đang mở':'Chưa có bài làm'}</span></td><td><button class="btn sm del" data-id="${esc(t.id)}" style="background:#e5484d;color:#fff" title="Xóa">Xóa</button></td></tr>`;}).join('');
      inner=tests.length?`<div class="tbl-wrap"><table><thead><tr><th>Tên bài kiểm tra</th><th>Bài học</th><th>Hình thức</th><th>Số câu</th><th>Đã làm</th><th>Điểm TB</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${trs}</tbody></table></div>`:`<div style="padding:22px;text-align:center" class="muted">Chưa có bài kiểm tra.<br>Bấm <b>➕ Tạo đề mẫu</b> để thử ngay, hoặc gửi đề cho Claude để nạp đề thật của cô.</div>`;
    }else if(tab==='crit'){ inner=`<div style="padding:24px;text-align:center" class="muted">Thiết lập thang điểm theo tiêu chí (từ vựng, ngữ pháp, phát âm, phản hồi…) để chấm đồng bộ — sắp ra mắt.</div>`; }
    else{ inner=`<div style="padding:24px;text-align:center" class="muted">Ngân hàng câu hỏi theo bài học để tái sử dụng khi tạo đề — sắp ra mắt.</div>`; }
    body.innerHTML=`<div class="tc-head"><div class="tc-tabs">${tabs.map(([k,l])=>`<button class="tc-tab ${tab===k?'on':''}" data-t="${k}">${l}</button>`).join('')}</div><button class="btn sm" id="seed">➕ Tạo đề mẫu</button></div><div class="soft" style="padding:10px">${inner}</div><p class="muted" style="margin-top:8px;font-size:.82rem">Học sinh làm bài ở mục <b>Kiểm tra</b> bên giao diện học viên; điểm tự động đổ về đây và vào cột Điểm TB của trang Học viên. Gửi đề của cô cho Claude để nạp đề thật (trắc nghiệm / điền từ / tự luận).</p>`;
    body.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();});
    const sd=$('#seed'); if(sd)sd.onclick=seedSampleTest;
    body.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{if(!confirm('Xóa bài kiểm tra này?'))return;try{await testsCol(STATE.code).doc(b.dataset.id).delete();toast('Đã xóa');tcTests(body);}catch(e){toast(authErr(e));}});
  }
  render();
}
async function seedSampleTest(){
  try{
    const words=(typeof ALLWORDS!=='undefined'?ALLWORDS:[]).slice();
    if(words.length<4){ toast('Chưa có từ vựng để tạo đề'); return; }
    const pick=shuffle(words.slice()).slice(0,5);
    const questions=pick.map(w=>{const others=shuffle(words.filter(x=>x.id!==w.id)).slice(0,3).map(x=>x.vi);const opts=shuffle([w.vi,...others]);return {type:'mc',q:`Nghĩa của 「${w.hanzi}」(${w.pinyin}) là gì?`,options:opts,answer:opts.indexOf(w.vi),points:1};});
    const lesTitle=(typeof LESSONS!=='undefined'&&LESSONS[0])?LESSONS[0].title:'';
    await testsCol(STATE.code).add({title:'Đề mẫu – Trắc nghiệm nghĩa từ',lessonTitle:lesTitle,questions,createdAt:now()});
    toast('Đã tạo đề mẫu 🎉');
    const body=$('#panel'); if(body)tcTests(body);
  }catch(e){ toast('Lỗi tạo đề: '+authErr(e)); }
}
async function tcProgress(body){
  body.innerHTML='<p class="muted">Đang tải…</p>';
  let data; try{ data=await classData(); }catch(e){ body.innerHTML='<p class="muted">Lỗi tải dữ liệu.</p>'; return; }
  const {rows}=data; const agg=classAgg(rows);
  const byDate={}; rows.forEach(r=>r.sess.forEach(s=>{const k=s.startedAt?new Date(s.startedAt).toISOString().slice(0,10):null;const rev=s.reviewed||0;if(!k||!rev)return;byDate[k]=byDate[k]||{rev:0,cr:0};byDate[k].rev+=rev;byDate[k].cr+=(s.correct||0);}));
  const days=Object.keys(byDate).sort();
  const linePts=days.map(k=>({y:Math.round(byDate[k].cr/byDate[k].rev*100)}));
  let dAcc=null;
  if(days.length>=4){const h=Math.floor(days.length/2);const avg=ks=>{let r=0,c=0;ks.forEach(k=>{r+=byDate[k].rev;c+=byDate[k].cr;});return r?Math.round(c/r*100):0;};dAcc=avg(days.slice(h))-avg(days.slice(0,h));}
  let tab='chung';
  function render(){
    const tabs=[['chung','Tiến bộ chung'],['hv','Theo học viên'],['tv','Theo từ vựng'],['gd','So sánh giai đoạn']];
    const sign=v=>v==null?'—':(v>0?'+'+v:''+v);
    let main;
    if(tab==='chung'){
      main=`<div class="grid" style="grid-template-columns:1.4fr 1fr;gap:14px">
        <div class="soft" style="padding:16px"><b>📈 Xu hướng điểm trung bình của lớp</b>${linePts.length>=2?lineChart(linePts):'<p class="muted" style="margin-top:10px">Cần ≥2 buổi học để vẽ xu hướng.</p>'}</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="soft" style="padding:16px"><b>Mức tiến bộ (so với giai đoạn trước)</b><div style="margin-top:8px">
            <div class="kv"><span>Tỷ lệ đúng</span><b style="color:${dAcc>0?'#17805a':dAcc<0?'#c0362f':'inherit'}">${sign(dAcc)}${dAcc==null?'':'%'}</b></div>
            <div class="kv"><span>Số từ vận dụng tốt</span><b>${agg.classBk.g}</b></div>
          </div></div>
          <div class="soft" style="padding:16px"><b>Thời gian học tập</b><div style="margin-top:8px">
            <div class="kv"><span>Tổng thời gian lớp</span><b>${fmtDur(agg.totTime)}</b></div>
            <div class="kv"><span>TB mỗi học viên</span><b>${agg.n?fmtDur(Math.round(agg.totTime/agg.n)):'—'}</b></div>
            <div class="kv"><span>Thời gian/buổi TB</span><b>${agg.totSess?fmtDur(Math.round(agg.totTime/agg.totSess)):'—'}</b></div>
          </div></div>
        </div></div>`;
    } else if(tab==='hv'){
      main=`<div class="soft" style="padding:12px"><div class="tbl-wrap"><table><thead><tr><th>Học viên</th><th>Tỷ lệ đúng</th><th>Từ nắm vững</th><th>Số buổi</th><th>Thời gian</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${r.acc}%</td><td>${r.bk.g}</td><td>${r.sessions}</td><td class="muted">${fmtDur(r.time)}</td></tr>`).join('')}</tbody></table></div></div>`;
    } else if(tab==='tv'){
      main=`<div class="soft" style="padding:12px"><p class="muted">Tiến bộ theo nhóm từ (số từ vận dụng tốt tăng dần theo thời gian) — cần tích lũy nhiều buổi để so sánh. Dữ liệu sẽ tự tổng hợp.</p></div>`;
    } else {
      main=`<div class="soft" style="padding:12px"><p class="muted">So sánh giữa hai giai đoạn (ví dụ trước/sau giữa kỳ) — cần đủ dữ liệu theo mốc thời gian.</p></div>`;
    }
    body.innerHTML=`<div class="tc-tabs">${tabs.map(([k,l])=>`<button class="tc-tab ${tab===k?'on':''}" data-t="${k}">${l}</button>`).join('')}</div>${main}`;
    body.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;render();});
  }
  render();
}
function wordMap(){ const m={}; (typeof ALLWORDS!=='undefined'?ALLWORDS:[]).forEach(w=>m[w.id]=w); return m; }
function bucketsFromCards(cardMap){
  let g=0,b=0,a=0,wt=0; const words=(typeof ALLWORDS!=='undefined'?ALLWORDS:[]);
  words.forEach(w=>{const c=cardMap[w.id];
    if(!c){wt++;return;}
    if((c.mastery||0)>=5)g++;
    else if((c.wrong||0)>(c.correct||0))a++;
    else if((c.mastery||0)>=1)b++;
    else wt++;
  });
  return {g,b,a,wt,total:words.length};
}
function statusBar(bk){
  const seg=[['#23b386',bk.g,'Nắm vững'],['#2f9fd6',bk.b,'Đang học'],['#f0a500',bk.a,'Cần củng cố'],['#b9c7d6',bk.wt,'Chờ ôn']];
  const tot=bk.total||1;
  let bar='<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;margin:8px 0;background:#eef3f9">';
  seg.forEach(([c,v])=>{ if(v) bar+=`<span style="background:${c};width:${(v/tot*100).toFixed(1)}%"></span>`; });
  bar+='</div><div style="display:flex;flex-wrap:wrap;gap:12px;font-size:.84rem">';
  seg.forEach(([c,v,lb])=>bar+=`<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:4px;vertical-align:middle"></span>${lb}: <b>${v}</b></span>`);
  bar+='</div>'; return bar;
}
async function teacherDash(){
  const panel=$('#panel'); panel.innerHTML='<p class="muted">Đang tải dữ liệu học viên…</p>';
  let data; try{ data=await classData(); }catch(e){ panel.innerHTML='<p class="muted">Lỗi tải dữ liệu học viên.</p>'; return; }
  const {rows,classWeak,WM}=data;
  const curr=(typeof ALLWORDS!=='undefined'?ALLWORDS.length:0);
  if(!rows.length){ panel.innerHTML=`<div class="soft" style="padding:16px">Chưa có học viên nào vào lớp.<br>Gửi <b>mã lớp ${esc(STATE.codeShort||STATE.code)}</b> cho các em để đăng ký nhé.</div>`; return; }
  const hard=Object.keys(classWeak).map(id=>({w:WM[id],n:classWeak[id]})).filter(x=>x.w).sort((a,b)=>b.n-a.n).slice(0,8);
  const prog=r=>curr?Math.round(Math.min(r.learned,curr)/curr*100):0;
  const statusOf=r=>!(r.sessions)?['n','Chưa học']:r.acc>=75?['g','Đang học']:['y','Cần hỗ trợ'];
  const initials=nm=>{const p=(nm||'?').trim().split(/\s+/);return (((p[0]||'')[0]||'')+((p[p.length-1]||'')[0]||'')).toUpperCase();};
  let q='',fSt='all',fLv='all';
  function pass(r){
    if(q){const s=(r.name+' '+r.email).toLowerCase();if(!s.includes(q.toLowerCase()))return false;}
    const st=statusOf(r)[1];
    if(fSt==='active'&&st!=='Đang học')return false;
    if(fSt==='help'&&st!=='Cần hỗ trợ')return false;
    if(fSt==='none'&&st!=='Chưa học')return false;
    if(fLv==='good'&&!(r.acc>=90))return false;
    if(fLv==='ok'&&!(r.acc>=75&&r.acc<90))return false;
    if(fLv==='weak'&&!(r.acc<75))return false;
    return true;
  }
  function draw(){
    const list=rows.filter(pass); const tb=$('#stub');
    tb.innerHTML=list.length?list.map(r=>{const idx=rows.indexOf(r);const st=statusOf(r);const pv=prog(r);return `<tr>
      <td>${idx+1}</td>
      <td><div style="display:flex;align-items:center;gap:9px"><span class="avatarc">${esc(initials(r.name))}</span><div style="min-width:0"><b>${esc(r.name)}</b>${r.email?`<small class="muted" style="display:block">${esc(r.email)}</small>`:''}</div></div></td>
      <td style="min-width:120px"><div class="barcell"><div class="pbar"><span style="width:${pv}%"></span></div><span>${pv}%</span></div></td>
      <td title="Điểm trung bình các bài kiểm tra">${r.testAvg==null?'—':'<b>'+r.testAvg+'</b>'}</td>
      <td><b>${r.acc}%</b></td>
      <td class="muted">${fmtDur(r.time)}</td>
      <td><span class="chip ${st[0]}">${st[1]}</span></td>
      <td style="white-space:nowrap"><button class="btn sm open" data-i="${idx}" title="Xem chi tiết">👁</button> <button class="btn sm reset" data-email="${esc(r.email)}" title="Gửi mail đặt lại mật khẩu">MK</button> <button class="btn sm kick" data-uid="${esc(r.uid)}" data-name="${esc(r.name)}" data-email="${esc(r.email)}" style="background:#e5484d;color:#fff" title="Xóa & cấm">🚫</button></td></tr>`;}).join(''):`<tr><td colspan="8" class="muted" style="text-align:center;padding:16px">Không có học viên khớp bộ lọc.</td></tr>`;
    tb.querySelectorAll('.open').forEach(b=>b.onclick=()=>studentDetail(rows[+b.dataset.i]));
    tb.querySelectorAll('.reset').forEach(b=>b.onclick=async()=>{const em=b.dataset.email;if(!em)return toast('Học viên này chưa có email');try{await auth.sendPasswordResetEmail(em);toast('Đã gửi mail đặt lại cho '+em);}catch(e){toast(authErr(e));}});
    tb.querySelectorAll('.kick').forEach(b=>b.onclick=async()=>{const uid=b.dataset.uid,nm=b.dataset.name||'học viên này',em=b.dataset.email||'';if(!confirm('Xóa & cấm '+nm+' khỏi lớp?\nBạn này sẽ không vào lại được (có thể Bỏ cấm sau).'))return;b.disabled=true;try{await removeAndBan(STATE.code,uid,em,nm);toast('Đã xóa & cấm '+nm);await classData(true);teacherDash();}catch(e){b.disabled=false;toast(authErr(e));}});
  }
  panel.innerHTML=`
    <div class="tc-head"><h3>Danh sách học viên <span class="muted" style="font-weight:600;font-size:.9rem">· ${esc(STATE.codeShort||STATE.code)}</span></h3>
      <div class="tc-filters">
        <input id="fq" placeholder="🔎 Tìm theo tên, email…" style="min-width:170px">
        <select id="fst"><option value="all">Tất cả trạng thái</option><option value="active">Đang học</option><option value="help">Cần hỗ trợ</option><option value="none">Chưa học</option></select>
        <select id="flv"><option value="all">Tất cả mức độ</option><option value="good">Tốt (≥90%)</option><option value="ok">Khá (75–89%)</option><option value="weak">Yếu (&lt;75%)</option></select>
        <button class="btn sm" id="csv">⬇️ Xuất Excel</button>
      </div></div>
    ${hard.length?`<div class="soft" style="padding:12px;margin-bottom:12px"><b>🔥 Từ khó của cả lớp</b> <small class="muted">(nhiều em đang sai)</small><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${hard.map(h=>`<span class="pill" title="${esc(h.w.pinyin)} · ${esc(h.w.vi)}">${esc(h.w.hanzi)} <b>×${h.n}</b></span>`).join('')}</div></div>`:''}
    <div class="soft" style="padding:10px"><div class="tbl-wrap"><table><thead><tr><th>STT</th><th>Học viên</th><th>Tiến độ</th><th>Điểm TB</th><th>Tỷ lệ đúng</th><th>Thời gian tích luỹ</th><th>Trạng thái</th><th></th></tr></thead><tbody id="stub"></tbody></table></div></div>
    <div id="banbox" style="margin-top:14px"></div>`;
  $('#csv').onclick=()=>exportCSV(rows);
  $('#fq').oninput=e=>{q=e.target.value;draw();};
  $('#fst').onchange=e=>{fSt=e.target.value;draw();};
  $('#flv').onchange=e=>{fLv=e.target.value;draw();};
  draw();
  await renderBanned();
}
function studentDetail(r){
  const panel=$('#panel'); const WM=wordMap();
  const weakWords=r.cards.filter(c=>(c.wrong||0)>(c.correct||0)).map(c=>({c,w:WM[c.wid]})).filter(x=>x.w)
    .sort((x,y)=>((y.c.wrong||0)-(y.c.correct||0))-((x.c.wrong||0)-(x.c.correct||0)));
  const sess=r.sess.slice().sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
  const bk=bucketsFromCards(r.cardMap);
  let html=`<div class="row" style="margin-bottom:10px"><button class="linklike" id="back">← Danh sách lớp</button></div>
    <h3 style="margin:0">${esc(r.name)} ${r.email?`<small class="muted" style="font-weight:600">· ${esc(r.email)}</small>`:''}</h3>
    <div class="grid cols3" style="margin-top:12px">
      <div class="stat"><b>${r.acc}%</b><span>ĐÚNG TB</span></div>
      <div class="stat"><b>${r.mastered}</b><span>TỪ NẮM VỮNG</span></div>
      <div class="stat"><b>${r.weak}</b><span>TỪ CẦN CỦNG CỐ</span></div>
      <div class="stat"><b>${r.streak}</b><span>CHUỖI NGÀY 🔥</span></div>
      <div class="stat"><b>${r.sessions}</b><span>BUỔI HỌC</span></div>
      <div class="stat"><b>${fmtDur(r.time)}</b><span>THỜI GIAN</span></div>
    </div>
    <div class="soft" style="padding:12px;margin-top:14px"><b>🫧 Tình trạng ${bk.total} từ</b>${statusBar(bk)}</div>
    <div style="margin-top:14px"><b>⚠️ Từ cần củng cố (${weakWords.length})</b>`;
  if(weakWords.length){
    html+=`<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Từ</th><th>Pinyin</th><th>Nghĩa</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>`;
    weakWords.forEach(({c,w})=>html+=`<tr><td style="font-size:1.15rem">${esc(w.hanzi)}</td><td class="muted">${esc(w.pinyin)}</td><td>${esc(w.vi)}</td><td>${c.correct||0}</td><td class="weak">${c.wrong||0}</td></tr>`);
    html+='</tbody></table></div>';
  } else html+='<p class="muted">Chưa có từ nào sai nhiều hơn đúng. 👍</p>';
  html+=`</div><div style="margin-top:14px"><b>🗓️ Lịch sử buổi học (${sess.length})</b>`;
  if(sess.length){
    html+=`<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Ngày</th><th>Số từ ôn</th><th>Đúng</th><th>Tỷ lệ</th><th>Thời lượng</th></tr></thead><tbody>`;
    sess.slice(0,30).forEach(x=>{const rev=x.reviewed||0,cr=x.correct||0;const dt=x.startedAt?new Date(x.startedAt):null;html+=`<tr><td class="muted">${dt?dt.toISOString().slice(0,10)+' '+dt.toTimeString().slice(0,5):'—'}</td><td>${rev}</td><td>${cr}</td><td>${rev?Math.round(cr/rev*100):0}%</td><td>${fmtDur(x.dur||0)}</td></tr>`;});
    html+='</tbody></table></div>';
  } else html+='<p class="muted">Chưa có buổi học nào.</p>';
  html+='</div>';
  panel.innerHTML=html;
  $('#back').onclick=teacherDash;
}
async function removeAndBan(code, uid, email, name){
  const batch=db.batch();
  (await cardsCol(code,uid).get()).docs.forEach(d=>batch.delete(d.ref));
  (await sessCol(code,uid).get()).docs.forEach(d=>batch.delete(d.ref));
  batch.delete(stuRef(code,uid));
  batch.set(clsRef(code).collection('banned').doc(uid), {email:email||'',name:name||'',bannedAt:now()});
  await batch.commit();
}
async function renderBanned(){
  const box=$('#banbox'); if(!box) return;
  try{
    const q=await clsRef(STATE.code).collection('banned').get();
    if(q.empty){ box.innerHTML=''; return; }
    let h=`<div class="soft" style="padding:12px"><b>🚫 Danh sách bị cấm (${q.size})</b><div class="tbl-wrap" style="margin-top:8px"><table><tbody>`;
    q.docs.forEach(d=>{const b=d.data();h+=`<tr><td>${esc(b.name||'')}</td><td class="muted">${esc(b.email||'')}</td><td><button class="btn sm unban" data-uid="${esc(d.id)}">Bỏ cấm</button></td></tr>`;});
    h+='</tbody></table></div></div>'; box.innerHTML=h;
    box.querySelectorAll('.unban').forEach(b=>b.onclick=async()=>{try{await clsRef(STATE.code).collection('banned').doc(b.dataset.uid).delete();toast('Đã bỏ cấm');renderBanned();}catch(e){toast(authErr(e));}});
  }catch(e){ box.innerHTML=''; }
}
function exportCSV(rows){
  let lines=[['Tên','Chuỗi','Đã học','Thuộc','Từ yếu','Số buổi','Tổng giây','% đúng'].join(',')];
  rows.forEach(r=>lines.push([r.name,r.streak,r.learned,r.mastered,r.weak,r.sessions,r.time,r.acc].join(',')));
  lines.push(''); lines.push(['Tên','Tuần','Ngày','Kiểu','Số từ','Đúng','Sai','Giây'].join(','));
  rows.forEach(r=>(r.sess||[]).forEach(s=>lines.push([r.name,s.week||'',s.startedAt?new Date(s.startedAt).toISOString().slice(0,10):'',s.game||'',s.reviewed||0,s.correct||0,s.wrong||0,s.dur||0].join(','))));
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
