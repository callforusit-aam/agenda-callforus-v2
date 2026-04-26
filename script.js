// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
const PWD = "giuseppe90";
const PANTRY_ID = "e39b701d-95a9-48c0-ae96-d13b53856c94";
const GCAL_1 = "https://script.google.com/macros/s/AKfycbxKEBpzjP6zbrato19rFr1YrTU6hKEy9iy712jVmpVa5Lfw2FKtgCX7Lmv_FHnStvwr/exec";
const GCAL_2 = "https://script.google.com/macros/s/AKfycbx7qYTrubG_KHBkesRUmBxUu3CRI3SC_jhNLH4pxIB0NA5Rgd2nKlgRvmpsToxdJrbN4A/exec";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// JSONBin — database principale (stesso della v1)
const JSONBIN_URL = "https://api.jsonbin.io/v3/b/695e8223d0ea881f405b10f2";
const JSONBIN_KEY = "$2a$10$/b3gwPG1OcyJYyOgtNM.iujzuvPXS5bPnyJvDz5UI9StDI.nQFMQG";

const isLocal = ["localhost","127.0.0.1",""].includes(location.hostname);
const BASKET = isLocal ? "Dashboard_TEST_FINAL_V3" : "Dashboard_FINAL_V3";
const PANTRY_URL = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/${BASKET}`;
const LS_KEY  = `cfu_v3_${BASKET}`;
const LS_DIRTY = `cfu_dirty_v3_${BASKET}`;

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let currentMon = getRealMonday();
let globalData = {};
let companyList = [];
let gcalData = [];
let googleMixData = { email:[], drive:[] };
let saveTimer;
let isDataLoaded = false;
let pendingBacklogIdx = null;
let mobileActiveDay = null;  // for mobile day tab selection
let activeFilter = null;     // company filter
let aiGenerated = false;
let callNotifTimer = null;
let isMobile = () => window.innerWidth < 768;

// ═══════════════════════════════════════════════════════════
// CACHE (offline-first)
// ═══════════════════════════════════════════════════════════
const saveToCache = d => { try { localStorage.setItem(LS_KEY, JSON.stringify({data:d,ts:Date.now()})); } catch(e){} };
const loadFromCache = () => { try { const r=localStorage.getItem(LS_KEY); return r?JSON.parse(r).data:null; } catch(e){return null;} };
const getCacheTs = () => { try { const r=localStorage.getItem(LS_KEY); return r?JSON.parse(r).ts||0:0; } catch(e){return 0;} };
const markDirty = () => localStorage.setItem(LS_DIRTY,'1');
const clearDirty = () => localStorage.removeItem(LS_DIRTY);
const isDirty = () => localStorage.getItem(LS_DIRTY)==='1';

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
function getRealMonday() {
    const d=new Date(), day=d.getDay();
    const m=new Date(d); m.setDate(d.getDate()-day+(day===0?-6:1)); m.setHours(0,0,0,0); return m;
}
function getWeekKey() { return "W_"+currentMon.toISOString().split('T')[0]; }
function escAttr(s) { return (s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;'); }

// Try to match a gcal event title to a known company
function guessCompany(title) {
    if (!title) return null;
    const t = title.toUpperCase();
    return companyList.find(c => t.includes(c.name.toUpperCase())) || null;
}
function todayIdx() { return new Date().getDay(); }  // 1=mon..5=fri
function todayCode() {
    const i=todayIdx(); return i>=1&&i<=5?['mon','tue','wed','thu','fri'][i-1]:null;
}
function dayLabel(code) { return {mon:'Lunedì',tue:'Martedì',wed:'Mercoledì',thu:'Giovedì',fri:'Venerdì'}[code]||code; }

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════
function showToast(msg, dur=2200) {
    const t=document.getElementById('toast');
    t.innerText=msg; t.classList.add('show');
    clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),dur);
}

// ═══════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════
function setStatus(state) {
    const dot=document.getElementById('statusDot'), txt=document.getElementById('statusText');
    if(!dot||!txt) return;
    const map={ok:['ok','Online'],wait:['wait','Salvataggio...'],offline:['off','Offline'],sync:['wait','Sync...']};
    const [cls,label]=map[state]||['ok','Online'];
    dot.className='status-dot '+cls; txt.innerText=label;
}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
if (localStorage.getItem('auth')==='1') {
    document.getElementById('loginScreen').style.display='none';
    setTimeout(initApp,100);
}
function tryLogin() {
    if (document.getElementById('passwordInput').value===PWD) {
        localStorage.setItem('auth','1');
        document.getElementById('loginScreen').style.display='none';
        initApp();
    } else { document.getElementById('loginError').style.display='block'; }
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
    if (!isDataLoaded) return;
    const tag=document.activeElement.tagName;
    const isInp=tag==='INPUT'||tag==='TEXTAREA'||document.activeElement.contentEditable==='true';
    if (e.key==='Escape') { closeAllModals(); closeQuickAdd(); return; }
    if (e.key===' '&&!isInp) { e.preventDefault(); openQuickAdd(); return; }
    if (!isInp) {
        if (e.key==='s'||e.key==='S') { e.preventDefault(); manualSave(); }
        if (e.key==='e'||e.key==='E') { e.preventDefault(); openExport(); }
        if (e.key==='n'||e.key==='N') {
            if (document.getElementById('page-calendar').classList.contains('active'))
                { e.preventDefault(); openModal('groupModal'); }
        }
    }
});

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
function initApp() {
    document.getElementById('app-shell').style.display='grid';
    document.getElementById('loadingScreen').style.display='flex';

    if (isLocal) setStatus('offline'); // show TEST mode visually
    if (localStorage.getItem('theme')==='dark') document.body.setAttribute('data-theme','dark');

    // default mobile day = today or mon
    mobileActiveDay = todayCode()||'mon';

    // instant render from cache
    const cached=loadFromCache();
    if (cached) {
        globalData=cached; companyList=globalData.COMPANIES||[];
        document.getElementById('loadingScreen').style.display='none';
        isDataLoaded=true; renderAll();
    }

    updateDateDisplay();
    loadData(false);
    setTimeout(()=>{ if(!isDataLoaded){document.getElementById('loadingScreen').style.display='none';isDataLoaded=true;setStatus('ok');} },6000);
    setInterval(()=>loadData(true),300000);

    window.addEventListener('online',()=>{ if(isDirty()){showToast('Connessione ripristinata — sincronizzazione...');saveData(true);} });
    document.addEventListener('visibilitychange',async()=>{ if(!document.hidden&&isDataLoaded) await checkConflict(); });
    startCallNotifications();
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════
function nav(page, btn) {
    // sidebar buttons
    document.querySelectorAll('.sb-btn').forEach(b=>b.classList.remove('active'));
    const sbBtn=document.getElementById('sb-'+page); if(sbBtn) sbBtn.classList.add('active');

    // bottom nav buttons
    document.querySelectorAll('.bn-btn').forEach(b=>b.classList.remove('active'));
    const bnBtn=document.getElementById('bn-'+page); if(bnBtn) bnBtn.classList.add('active');

    // pages
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    const pg=document.getElementById('page-'+page); if(pg) pg.classList.add('active');

    // toolbar visibility
    const tb=document.getElementById('toolbar');
    const show=page==='calendar';
    if(tb) tb.classList.toggle('visible',show);
    const grpBtn=document.getElementById('groupBtn');
    const grpSep=document.getElementById('toolbarSep');
    if(grpBtn) grpBtn.style.display=show?'inline-flex':'none';
    if(grpSep) grpSep.style.display=show?'block':'none';

    // page title
    const titles={home:'Dashboard',calendar:'Calendario',backlog:'Da Pianificare',notes:'Note'};
    document.getElementById('pageTitle').innerText=titles[page]||page;

    // renders
    if(page==='home') { renderHome(); renderExternalData(); }
    if(page==='calendar') { renderCalendar(); }
    if(page==='backlog') { renderBacklog(); }
    if(page==='notes') {
        const qn=document.getElementById('quickNotes'); const qn2=document.getElementById('quickNotes2');
        if(qn&&qn2) qn2.value=qn.value;
    }
}

// ═══════════════════════════════════════════════════════════
// LOAD / SAVE
// ═══════════════════════════════════════════════════════════
async function loadData(silent) {
    if (!silent) setStatus('sync');
    try {
        const res = await fetch(JSONBIN_URL, {
            method: 'GET',
            headers: { 'X-Master-Key': JSONBIN_KEY, 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) throw new Error('JSONBin error ' + res.status);
        const json = await res.json();
        globalData = json.record || {};
        if (!globalData.backlog) globalData.backlog = [];
        saveToCache(globalData); clearDirty();
        companyList = globalData.COMPANIES || [];
        isDataLoaded = true;
        document.getElementById('loadingScreen').style.display = 'none';
        if (!silent) setStatus('ok');
        renderAll(); fetchGoogle();
    } catch(e) {
        const c = loadFromCache();
        if (c && !isDataLoaded) { globalData = c; companyList = globalData.COMPANIES || []; renderAll(); }
        setStatus('offline'); isDataLoaded = true;
        document.getElementById('loadingScreen').style.display = 'none';
    }
}

function renderAll() {
    renderCallStrip();
    renderCompanyTags();
    if(document.getElementById('page-home').classList.contains('active')) { renderHome(); renderExternalData(); }
    if(document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
    if(document.getElementById('page-backlog').classList.contains('active')) renderBacklog();
    const qn = document.getElementById('quickNotes');
    if (qn && globalData.home) qn.value = globalData.home.quick || '';
}

function deferredSave() {
    if (!isDataLoaded) return;
    clearTimeout(saveTimer); setStatus('wait');
    saveTimer = setTimeout(() => saveData(false), 2000);
}
window.manualSave = () => saveData(true);

async function saveData(immediate) {
    if (!isDataLoaded) return;
    if (immediate) clearTimeout(saveTimer);
    setStatus('wait');
    const qn = document.getElementById('quickNotes');
    if (qn) globalData.home = { quick: qn.value };
    globalData.COMPANIES = companyList;
    globalData._savedAt = Date.now();
    saveToCache(globalData);
    if (!navigator.onLine) { markDirty(); setStatus('offline'); if (immediate) showToast('Salvato in locale'); return; }
    try {
        await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
            body: JSON.stringify(globalData)
        });
        clearDirty(); setStatus('ok'); if (immediate) showToast('Salvato');
    } catch(e) { markDirty(); setStatus('offline'); if (immediate) showToast('Salvato in locale'); }
}

// ═══════════════════════════════════════════════════════════
// CONFLICT
// ═══════════════════════════════════════════════════════════
async function checkConflict() {
    try {
        const res = await fetch(JSONBIN_URL, { method: 'GET', headers: { 'X-Master-Key': JSONBIN_KEY, 'Cache-Control': 'no-cache' } });
        if (!res.ok) return;
        const json = await res.json();
        const remoteTs = (json.record || {})._savedAt || 0;
        if (remoteTs > getCacheTs() + 5000) showConflictBanner();
    } catch(e) {}
}
function showConflictBanner() {
    if(document.getElementById('conflictBanner')) return;
    const b=document.createElement('div'); b.id='conflictBanner';
    b.innerHTML=`<span>⚠️ I dati sono stati modificati da un'altra sessione.</span><div style="display:flex;gap:8px;"><button onclick="forceSync();this.closest('#conflictBanner').remove();" style="background:var(--c-yellow);color:#000;border:none;padding:5px 12px;border-radius:5px;font-weight:600;cursor:pointer;font-size:12px;">Ricarica</button><button onclick="this.closest('#conflictBanner').remove();" style="background:transparent;border:1px solid rgba(146,64,14,.4);color:#92400E;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:12px;">Ignora</button></div>`;
    document.body.prepend(b);
}

// ═══════════════════════════════════════════════════════════
// GOOGLE
// ═══════════════════════════════════════════════════════════
async function fetchGoogle() {
    if(GCAL_1.includes("LINK")) return;
    const s=new Date(currentMon),e=new Date(currentMon);e.setDate(e.getDate()+5);
    try {
        const [ev1,ev2,d1,d2]=await Promise.all([
            fetch(`${GCAL_1}?action=calendar&start=${s.toISOString()}&end=${e.toISOString()}`).then(r=>r.json()).catch(()=>[]),
            fetch(`${GCAL_2}?action=calendar&start=${s.toISOString()}&end=${e.toISOString()}`).then(r=>r.json()).catch(()=>[]),
            fetch(`${GCAL_1}?action=data`).then(r=>r.json()).catch(()=>({email:[],drive:[]})),
            fetch(`${GCAL_2}?action=data`).then(r=>r.json()).catch(()=>({email:[],drive:[]}))
        ]);
        gcalData=[...ev1,...ev2];
        googleMixData={
            email:[...(d1.email||[]),...(d2.email||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)),
            drive:[...(d1.drive||[]),...(d2.drive||[])]
        };
        renderCallStrip();
        if(document.getElementById('page-home').classList.contains('active')) renderExternalData();
        if(document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
        startCallNotifications();
    }catch(e){console.error("Google:",e);}
}

// ═══════════════════════════════════════════════════════════
// NEXT-CALL CHIP (header)
// ═══════════════════════════════════════════════════════════
function renderCallStrip() {
    const chip = document.getElementById('nextCallChip'); if(!chip) return;
    const now = new Date();
    const next = gcalData
        .filter(ev => new Date(ev.startTime) >= now && ev.link)
        .sort((a,b) => new Date(a.startTime) - new Date(b.startTime))[0];

    if (next) {
        const time = new Date(next.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        chip.style.display = 'flex';
        chip.style.cursor = 'pointer';
        chip.onclick = () => window.open(next.link, '_blank');
        chip.innerHTML = `
            <span style="font-size:9px;font-weight:700;background:var(--c-yellow);color:#000;padding:2px 6px;border-radius:3px;letter-spacing:.04em;">CALL</span>
            <span style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--c-text);">${time}</span>
            <span style="font-size:12px;color:var(--c-text-2);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${next.title}</span>
            <span style="font-size:11px;font-weight:600;color:var(--c-accent);">Entra →</span>`;
    } else {
        chip.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════
// CALL NOTIFICATIONS (5 min before)
// ═══════════════════════════════════════════════════════════
function startCallNotifications() {
    if(callNotifTimer) clearInterval(callNotifTimer);
    checkCalls(); callNotifTimer=setInterval(checkCalls,60000);
}
function checkCalls() {
    const now=new Date(),in5=new Date(now.getTime()+5*60000),in6=new Date(now.getTime()+6*60000);
    const hit=gcalData.find(ev=>{const t=new Date(ev.startTime);return t>=in5&&t<in6&&ev.link;});
    if(hit) showCallBanner(hit.title,new Date(hit.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),hit.link);
}
function showCallBanner(title,time,link) {
    let b=document.getElementById('callBanner');if(b)b.remove();
    b=document.createElement('div');b.id='callBanner';
    b.innerHTML=`<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;"><span style="background:#fff;color:var(--c-accent);font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;white-space:nowrap;">CALL TRA 5 MIN</span><span style="font-weight:600;font-size:13px;white-space:nowrap;">${time}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85;font-size:13px;">${title}</span></div><div style="display:flex;gap:8px;flex-shrink:0;"><a href="${link}" target="_blank" style="background:#fff;color:var(--c-accent);border:none;padding:6px 14px;border-radius:6px;font-weight:600;text-decoration:none;font-size:12px;">Apri Meet →</a><button onclick="this.closest('#callBanner').remove();" style="background:rgba(255,255,255,.2);border:none;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;">✕</button></div>`;
    document.body.prepend(b);
    setTimeout(()=>{if(b.parentNode)b.remove();},180000);
}

// ═══════════════════════════════════════════════════════════
// AI BRIEFING
// ═══════════════════════════════════════════════════════════
async function generateAI() {
    const el=document.getElementById('aiCard'); if(!el||aiGenerated) return;
    const dc=todayCode(),key=getWeekKey();
    const all=(globalData[key]?.[dc])||[];
    const open=all.filter(t=>!t.isHeader&&t.txt?.trim()&&!t.done);
    const done=all.filter(t=>!t.isHeader&&t.txt?.trim()&&t.done);
    const bl=globalData.backlog||[],now=new Date();
    const calls=gcalData.filter(ev=>new Date(ev.startTime).toDateString()===now.toDateString());
    const next=gcalData.filter(ev=>new Date(ev.startTime)>=now&&ev.link).sort((a,b)=>new Date(a.startTime)-new Date(b.startTime))[0];
    const prompt=`Sei un assistente operativo. Briefing mattutino brevissimo (max 3 frasi, tono diretto e concreto).
Task aperti oggi: ${open.map(t=>t.txt).join(', ')||'nessuno'}. Completati: ${done.length}. Backlog non pianificato: ${bl.length}. Call oggi: ${calls.map(ev=>new Date(ev.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' '+ev.title).join(', ')||'nessuna'}. Prossima: ${next?new Date(next.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' — '+next.title:'—'}.
Niente markdown né liste. Solo testo scorrevole. Concludi con cosa prioritizzare.`;
    try {
        const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-ipc":"true"},body:JSON.stringify({model:CLAUDE_MODEL,max_tokens:1000,messages:[{role:"user",content:prompt}]})});
        const data=await res.json();
        const text=data.content?.map(c=>c.text||'').join('')||'Non disponibile.';
        el.innerHTML=`<div class="ai-label"><span class="material-icons-round" style="font-size:14px;">auto_awesome</span> AI Briefing</div><p class="ai-text">${text}</p>`;
        const notesAI=document.getElementById('aiCardNotes');
        if(notesAI) notesAI.innerHTML=`<p style="font-size:13px;line-height:1.7;color:var(--c-text-2);">${text}</p>`;
        aiGenerated=true;
    } catch(e) {
        el.innerHTML=`<div class="ai-label"><span class="material-icons-round" style="font-size:14px;">auto_awesome</span> AI Briefing</div><p class="ai-text" style="color:var(--c-text-3);">Non disponibile.</p>`;
    }
}

// ═══════════════════════════════════════════════════════════
// DATE DISPLAY
// ═══════════════════════════════════════════════════════════
function updateDateDisplay() {
    const s=new Date(currentMon),e=new Date(currentMon);e.setDate(s.getDate()+4);
    const strDay=s.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
    const strWeek=`${s.getDate()} – ${e.getDate()} ${e.toLocaleDateString('it-IT',{month:'long'})}`;
    const dl=document.getElementById('currentDayLabel'); if(dl) dl.innerText=strDay.charAt(0).toUpperCase()+strDay.slice(1);
    const wr=document.getElementById('currentWeekRange'); if(wr) wr.innerText=strWeek;
    const cd=document.getElementById('calDateDisplay'); if(cd) cd.innerText=strWeek;
}
window.changeWeek=async function(dir){
    await saveData(true);
    document.getElementById('loadingScreen').style.display='flex';
    currentMon.setDate(currentMon.getDate()+(dir*7));
    updateDateDisplay(); activeFilter=null; clearFilterBadge();
    loadData(false);
};
window.forceSync=()=>{ document.getElementById('loadingScreen').style.display='flex'; loadData(false); };
window.toggleTheme=()=>{
    const d=document.body.getAttribute('data-theme')==='dark';
    document.body.setAttribute('data-theme',d?'light':'dark');
    localStorage.setItem('theme',d?'light':'dark');
};

// ═══════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════
function renderHome() {
    const dc=todayCode(),key=getWeekKey();
    const tasks=dc?(globalData[key]?.[dc])||[]:[];
    const active=tasks.filter(t=>!t.isHeader&&t.txt?.trim());
    const el=document.getElementById('homeTasks');
    const cnt=document.getElementById('homeTaskCount');
    if(cnt) cnt.innerText=active.length;
    if(!el) return;
    if(!active.length){el.innerHTML=`<div class="empty">Nessuna attività per oggi.</div>`;return;}
    el.innerHTML=active.map(t=>{
        const ri=tasks.indexOf(t);
        let co='';
        for(let i=ri-1;i>=0;i--){if(tasks[i].isHeader){co=tasks[i].tag?.name||'';break;}}
        return `<div class="home-task">
            <div class="home-task-chk ${t.done?'done':''}" onclick="toggleTask('${dc}',${ri})"></div>
            <div class="home-task-body">
                ${co?`<div class="home-task-co">${co}</div>`:''}
                <div class="home-task-txt ${t.done?'done':''}">${escAttr(t.txt)}</div>
            </div>
        </div>`;
    }).join('');
    generateAI();
}

function renderExternalData() {
    const ml=document.getElementById('mailList');
    if(ml){const em=googleMixData.email||[];ml.innerHTML=em.length?em.slice(0,7).map(m=>`<div class="side-item"><div class="side-item-label">${escAttr(m.sender||'')}</div>${escAttr(m.subject||'')}</div>`).join(''):`<div class="empty">Nessuna mail recente</div>`;}
    const dl=document.getElementById('driveList');
    if(dl){const fi=googleMixData.drive||[];dl.innerHTML=fi.length?fi.slice(0,8).map(f=>`<div class="side-item"><a href="${f.url||'#'}" target="_blank" style="color:var(--c-accent);text-decoration:none;font-size:12px;">📄 ${escAttr(f.name)}</a></div>`).join(''):`<div class="empty">Nessun file recente</div>`;}
}

function syncNotes(el) {
    const qn=document.getElementById('quickNotes'); if(qn) qn.value=el.value;
    deferredSave();
}

// ═══════════════════════════════════════════════════════════
// CALENDAR — 5 columns (desktop) / day tabs (mobile)
// ═══════════════════════════════════════════════════════════
function renderCalendar() {
    renderDayTabsMobile();
    renderCalGrid();
    renderCompanyTags();
}

function renderDayTabsMobile() {
    const el=document.getElementById('dayTabsMobile'); if(!el) return;
    const days=['mon','tue','wed','thu','fri'],names=['LUN','MAR','MER','GIO','VEN'];
    const key=getWeekKey(),d=globalData[key]||{};
    const wStart=new Date(currentMon);
    el.innerHTML=days.map((code,i)=>{
        const date=new Date(wStart);date.setDate(wStart.getDate()+i);
        const hasTasks=(Array.isArray(d[code])?d[code]:[]).some(t=>!t.isHeader&&t.txt?.trim());
        const isTodayCls=todayIdx()===i+1?'is-today':'';
        const activeCls=mobileActiveDay===code?'active':'';
        return `<button class="day-tab-m ${activeCls} ${isTodayCls}" onclick="selectMobileDay('${code}')">
            <span class="dm-name">${names[i]}</span>
            <span class="dm-num">${date.getDate()}</span>
            <span class="day-dot ${hasTasks?'has':''}"></span>
        </button>`;
    }).join('');
}

window.selectMobileDay=function(code) {
    mobileActiveDay=code;
    renderDayTabsMobile();
    // toggle mobile-active class on columns
    document.querySelectorAll('.day-col').forEach((col,i)=>{
        const dayCode=['mon','tue','wed','thu','fri'][i];
        col.classList.toggle('mobile-active',dayCode===code);
    });
};

function renderCalGrid() {
    const key=getWeekKey(),d=globalData[key]||{};
    const days=['mon','tue','wed','thu','fri'],labels=['LUN','MAR','MER','GIO','VEN'];
    const ti=todayIdx(),wStart=new Date(currentMon);
    const grid=document.getElementById('calGrid'); if(!grid) return;

    grid.innerHTML=days.map((code,i)=>{
        const date=new Date(wStart);date.setDate(wStart.getDate()+i);
        let dayData=Array.isArray(d[code])?d[code]:[];

        // company filter
        if(activeFilter){
            const f=[];let inT=false;
            for(const t of dayData){if(t.isHeader){inT=t.tag?.name===activeFilter;if(inT)f.push(t);}else if(inT)f.push(t);}
            dayData=f;
        }

        const tasks=dayData.filter(t=>!t.isHeader&&t.txt?.trim());
        const done=tasks.filter(t=>t.done).length,total=tasks.length;
        const pct=total?Math.round(done/total*100):0;

        // gcal events for this day
        const dayIdx2=i+1;
        const calls=gcalData.filter(ev=>{
            const dv=new Date(ev.startTime);
            return dv.getDay()===dayIdx2&&isInCurrentWeek(dv);
        });

        const isToday=ti===i+1,isMobileActive=mobileActiveDay===code;
        const rawData=Array.isArray(d[code])?d[code]:[];

        const callsHtml=calls.map(ev=>{
            const t=new Date(ev.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
            const co=guessCompany(ev.title);
            const coTag=co
                ?`<span class="gcal-co-tag" style="background:${co.color};color:${getContrast(co.color)};">${co.name}</span>`
                :'';
            const hasLink=ev.link&&ev.link.length>5;
            const inner=`
                ${hasLink?'<span class="call-pill">CALL</span>':''}
                <span class="gcal-time">${t}</span>
                <span class="gcal-title">${escAttr(ev.title)}</span>
                ${coTag}`;
            return hasLink
                ?`<a href="${ev.link}" target="_blank" class="gcal-event">${inner}</a>`
                :`<div class="gcal-event no-link">${inner}</div>`;
        }).join('');

        const tasksHtml=dayData.map(task=>{
            const ri=rawData.indexOf(task);
            if(task.isHeader){
                const bg=task.tag?.bg||'#E5E7EB',col=task.tag?.col||'#000';
                return `<div class="co-header">
                    <span class="co-header-tag" style="background:${bg};color:${col};">${escAttr(task.tag?.name||'')}</span>
                    <span class="co-header-line"></span>
                    <button class="co-del" onclick="deleteTask(event,'${code}',${ri})" title="Elimina gruppo"><span class="material-icons-round" style="font-size:13px;">delete</span></button>
                </div>`;
            }
            return `<div class="task-row" draggable="true"
                    ondragstart="dragStart(event,'${code}',${ri})"
                    ondragover="dragOver(event)"
                    ondrop="dragDrop(event,'${code}',${ri})">
                <span class="drag-handle"><span class="material-icons-round">drag_indicator</span></span>
                <div class="task-chk ${task.done?'done':''}" onclick="toggleTask('${code}',${ri})"></div>
                <input class="task-inp ${task.done?'done':''}" value="${escAttr(task.txt)}" oninput="updateTask('${code}',${ri},this.value)">
                <button class="task-del" onclick="deleteTask(event,'${code}',${ri})"><span class="material-icons-round">close</span></button>
            </div>`;
        }).join('');

        const emptySlots=activeFilter?'':Array.from({length:Math.max(0,5-dayData.length)},(_,ei)=>`
            <div class="empty-slot"><input placeholder="+ aggiungi task" onchange="addTaskManually('${code}',this.value);this.value='';"></div>`).join('');

        return `<div class="day-col ${isToday?'today':''} ${isMobileActive?'mobile-active':''}" id="col-${code}">
            <div class="day-head">
                <div class="day-head-top">
                    <span class="day-name">${labels[i]}</span>
                    ${activeFilter?`<span style="font-size:9px;color:var(--c-accent);font-weight:600;">${activeFilter}</span>`:''}
                </div>
                <div class="day-date">${date.getDate()}</div>
            </div>
            <div class="day-prog"><div class="day-prog-fill" style="width:${pct}%"></div></div>
            ${calls.length?`<div class="gcal-strip">${callsHtml}</div>`:''}
            <div class="day-body">${tasksHtml}${emptySlots}</div>
        </div>`;
    }).join('');
}

function isInCurrentWeek(date) {
    const s=new Date(currentMon),e=new Date(currentMon);e.setDate(s.getDate()+5);
    return date>=s&&date<e;
}

// ═══════════════════════════════════════════════════════════
// COMPANY TAGS & FILTER
// ═══════════════════════════════════════════════════════════
function renderCompanyTags() {
    const cont=document.getElementById('companyTagsContainer'); if(!cont) return;
    cont.innerHTML=companyList.map((c,i)=>`<button class="co-tag-btn ${activeFilter===c.name?'filtered':''}"
        style="${activeFilter===c.name?`background:${c.color};color:${getContrast(c.color)};`:''}"
        onclick="toggleFilter('${c.name}')"
        oncontextmenu="deleteCompany(event,${i})"
        title="${c.name} — click: filtra, click destro: elimina">${c.name}</button>`).join('');
}

function getContrast(hex) {
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return (0.299*r+0.587*g+0.114*b)>128?'#000':'#fff';
}

window.toggleFilter=function(name){
    activeFilter=activeFilter===name?null:name;
    renderCompanyTags(); renderCalGrid();
    if(activeFilter){
        document.getElementById('filterBadge').style.display='flex';
        document.getElementById('filterBadgeName').innerText=activeFilter;
        showToast(`Filtro: ${activeFilter}`);
    } else clearFilterBadge();
};
window.clearFilter=()=>{ activeFilter=null; renderCompanyTags(); renderCalGrid(); clearFilterBadge(); };
function clearFilterBadge(){
    const fb=document.getElementById('filterBadge');
    if(fb) fb.style.display='none';
}

window.addNewCompany=function(){
    const name=document.getElementById('newCompName').value.trim().toUpperCase();
    const color=document.getElementById('newCompColor').value;
    if(!name) return;
    if(companyList.find(c=>c.name===name)){showToast('Azienda già esistente');return;}
    companyList.push({name,color});
    document.getElementById('newCompName').value='';
    saveData(true); renderCompanyTags(); showToast(`+ ${name} aggiunta`);
};
window.deleteCompany=function(e,i){
    e.preventDefault();
    if(confirm(`Eliminare ${companyList[i].name}?`)){companyList.splice(i,1);renderCompanyTags();saveData(true);}
};

// ═══════════════════════════════════════════════════════════
// TASK OPERATIONS
// ═══════════════════════════════════════════════════════════
window.addTaskManually=function(day,val){
    if(!val?.trim()) return;
    const key=getWeekKey();
    if(!globalData[key])globalData[key]={};
    if(!globalData[key][day])globalData[key][day]=[];
    globalData[key][day].push({txt:val.trim(),done:false});
    saveData(true); renderCalGrid(); renderDayTabsMobile();
    if(document.getElementById('page-home').classList.contains('active')) renderHome();
};
function updateTask(day,row,val){
    const key=getWeekKey();
    if(globalData[key]?.[day]?.[row]){globalData[key][day][row].txt=val;deferredSave();}
}
function toggleTask(day,row){
    const key=getWeekKey();
    if(globalData[key]?.[day]?.[row]){
        globalData[key][day][row].done=!globalData[key][day][row].done;
        saveData(true);
        if(document.getElementById('page-home').classList.contains('active'))renderHome();
        if(document.getElementById('page-calendar').classList.contains('active'))renderCalGrid();
    }
}
window.deleteTask=function(e,day,idx){
    if(e)e.stopPropagation();
    if(!confirm('Eliminare questa riga?'))return;
    const key=getWeekKey();
    globalData[key][day].splice(idx,1);
    saveData(true); renderCalGrid();
};

// drag & drop
let _dragDay,_dragIdx;
window.dragStart=function(e,day,idx){_dragDay=day;_dragIdx=idx;e.target.style.opacity='.4';e.dataTransfer.effectAllowed='move';};
window.dragOver=function(e){e.preventDefault();e.dataTransfer.dropEffect='move';return false;};
window.dragDrop=function(e,tDay,tIdx){
    e.preventDefault();e.stopPropagation();
    if(_dragDay===tDay&&_dragIdx!==tIdx){
        const key=getWeekKey(),list=globalData[key][tDay];
        const[m]=list.splice(_dragIdx,1);list.splice(tIdx,0,m);
        saveData(true);renderCalGrid();
    }
    document.querySelectorAll('.task-row').forEach(r=>r.style.opacity='');
    return false;
};

// ═══════════════════════════════════════════════════════════
// GROUP MODAL
// ═══════════════════════════════════════════════════════════
window.openModal=function(id){document.getElementById(id).classList.add('open');};
window.closeModal=function(id){document.getElementById(id).classList.remove('open');};
function closeAllModals(){document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open'));}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-bg'))e.target.classList.remove('open');});

// pre-fill group modal
const _origOpenModal=window.openModal;
window.openModal=function(id){
    if(id==='groupModal'){
        const sel=document.getElementById('formCompany');
        sel.innerHTML=!companyList.length?'<option>Crea prima un\'azienda</option>':companyList.map((c,i)=>`<option value="${i}">${c.name}</option>`).join('');
        const dc=isMobile()?mobileActiveDay:(todayCode()||'mon');
        document.getElementById('formDay').value=dc;
        setTimeout(()=>document.getElementById('formTasks').focus(),200);
    }
    document.getElementById(id).classList.add('open');
};

window.saveFromForm=function(){
    const day=document.getElementById('formDay').value;
    const ci=document.getElementById('formCompany').value;
    const raw=document.getElementById('formTasks').value;
    if(!companyList[ci])return showToast('Seleziona un\'azienda');
    if(!raw.trim())return showToast('Scrivi almeno un task');
    const co=companyList[ci],key=getWeekKey();
    if(!globalData[key])globalData[key]={};
    if(!globalData[key][day])globalData[key][day]=[];
    globalData[key][day].push({txt:'',done:false,isHeader:true,tag:{name:co.name,bg:co.color,col:getContrast(co.color),bd:co.color}});
    raw.split('\n').forEach(l=>{const c=l.replace(/^[-•*]\s*/,'').trim();if(c)globalData[key][day].push({txt:c,done:false});});
    saveData(true); closeModal('groupModal'); document.getElementById('formTasks').value='';
    renderCalGrid(); renderDayTabsMobile(); showToast('Gruppo aggiunto');
};

// ═══════════════════════════════════════════════════════════
// QUICK ADD  (Spazio)
// ═══════════════════════════════════════════════════════════
function openQuickAdd(){
    if(document.getElementById('qaOverlay'))return;
    const ol=document.createElement('div');ol.id='qaOverlay';ol.className='qa-overlay';
    const dc=isMobile()?mobileActiveDay:(todayCode()||'mon');
    const dayOpts=['mon','tue','wed','thu','fri'].map(c=>`<option value="${c}" ${c===dc?'selected':''}>${dayLabel(c)}</option>`).join('');
    ol.innerHTML=`<div class="qa-box">
        <p style="font-size:11px;font-weight:600;color:var(--c-text-3);letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px;">Quick add</p>
        <input id="qaInput" class="qa-input" placeholder="Aggiungi task...">
        <div style="display:flex;gap:8px;align-items:center;">
            <select id="qaDay" class="modal-select" style="flex:1;margin:0;">${dayOpts}</select>
            <button class="btn btn-primary" onclick="confirmQuickAdd()">Aggiungi →</button>
        </div>
        <p class="qa-hint">Invio per aggiungere · Esc per chiudere</p>
    </div>`;
    document.body.appendChild(ol);
    ol.addEventListener('click',e=>{if(e.target===ol)closeQuickAdd();});
    ol.querySelector('#qaInput').addEventListener('keydown',e=>{if(e.key==='Enter')confirmQuickAdd();if(e.key==='Escape')closeQuickAdd();});
    setTimeout(()=>ol.querySelector('#qaInput').focus(),50);
}
function closeQuickAdd(){const ol=document.getElementById('qaOverlay');if(ol)ol.remove();}
function confirmQuickAdd(){
    const txt=document.getElementById('qaInput')?.value.trim();
    const day=document.getElementById('qaDay')?.value;
    if(!txt)return;
    addTaskManually(day,txt); closeQuickAdd();
}

// ═══════════════════════════════════════════════════════════
// BACKLOG
// ═══════════════════════════════════════════════════════════
function getBacklog(){return globalData.backlog||[];}
function saveBacklog(l){globalData.backlog=l;saveData(true);}

function getSuggestedDay(){
    const key=getWeekKey(),d=globalData[key]||{};
    return ['mon','tue','wed','thu','fri']
        .map(day=>({day,count:(Array.isArray(d[day])?d[day].filter(t=>!t.isHeader&&t.txt?.trim()):[]).length}))
        .sort((a,b)=>a.count-b.count)[0].day;
}

window.addToBacklog=function(){
    const co=document.getElementById('blCompany').value.trim().toUpperCase();
    const tx=document.getElementById('blText').value.trim();
    if(!co){document.getElementById('blCompany').focus();return;}
    if(!tx){document.getElementById('blText').focus();return;}
    const l=getBacklog();l.push({id:Date.now(),company:co,text:tx,createdAt:new Date().toISOString()});
    saveBacklog(l);
    document.getElementById('blCompany').value='';document.getElementById('blText').value='';
    document.getElementById('blCompany').focus();
    renderBacklog();showToast('Attività aggiunta al backlog');
};

function renderBacklog(){
    const list=getBacklog();
    const cnt=document.getElementById('backlogCount');if(cnt)cnt.innerText=list.length;
    const sb=document.getElementById('suggestBar');
    const el=document.getElementById('backlogList');if(!el)return;
    if(!list.length){
        if(sb)sb.innerHTML='';
        el.innerHTML=`<div class="empty">Nessuna attività in backlog.</div>`;return;
    }
    const sug=getSuggestedDay();
    if(sb)sb.innerHTML=`<div class="suggest-bar"><span class="material-icons-round">lightbulb</span><span><b>${dayLabel(sug)}</b> è il giorno più libero questa settimana.</span></div>`;
    el.innerHTML=list.map((item,idx)=>{
        const comp=companyList.find(c=>c.name===item.company);
        const bg=comp?comp.color:'#E5E7EB',col=getContrast(bg);
        const age=Math.floor((Date.now()-new Date(item.createdAt).getTime())/86400000);
        const ageStr=age===0?'oggi':age===1?'ieri':`${age}g fa`;
        return `<div class="bl-item">
            <div class="bl-item-body">
                <span class="bl-co" style="background:${bg};color:${col};">${escAttr(item.company)}</span>
                <div class="bl-txt">${escAttr(item.text)}</div>
                <div class="bl-age">${ageStr}</div>
            </div>
            <div class="bl-acts">
                <button class="bl-act" onclick="openScheduleFor(${idx})" title="Pianifica"><span class="material-icons-round">event</span></button>
                <button class="bl-act del" onclick="deleteBacklogItem(${idx})" title="Elimina"><span class="material-icons-round">close</span></button>
            </div>
        </div>`;
    }).join('');
}

window.deleteBacklogItem=function(idx){
    const l=getBacklog();if(!l[idx])return;
    if(!confirm(`Eliminare "${l[idx].text}"?`))return;
    l.splice(idx,1);saveBacklog(l);renderBacklog();showToast('Eliminata');
};

window.openScheduleFor=function(idx){
    pendingBacklogIdx=idx;
    document.getElementById('scheduleDay').value=getSuggestedDay();
    openModal('scheduleModal');
};
window.confirmSchedule=function(){
    if(pendingBacklogIdx===null)return;
    const l=getBacklog(),item=l[pendingBacklogIdx];if(!item)return;
    const day=document.getElementById('scheduleDay').value,key=getWeekKey();
    if(!globalData[key])globalData[key]={};
    if(!globalData[key][day])globalData[key][day]=[];
    const comp=companyList.find(c=>c.name===item.company);
    const bg=comp?comp.color:'#E5E7EB',col=getContrast(bg);
    const dd=globalData[key][day];
    if(!dd.some(t=>t.isHeader&&t.tag?.name===item.company)) dd.push({txt:'',done:false,isHeader:true,tag:{name:item.company,bg,col,bd:bg}});
    dd.push({txt:item.text,done:false});
    l.splice(pendingBacklogIdx,1);saveBacklog(l);renderBacklog();closeModal('scheduleModal');
    renderCalGrid();renderDayTabsMobile();
    showToast(`Spostato a ${dayLabel(day)}`);
};

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════
window.openExport=()=>openModal('exportModal');

window.exportCSV=function(){
    const key=getWeekKey(),d=globalData[key]||{};
    const days=['mon','tue','wed','thu','fri'];
    let rows=[['Giorno','Azienda','Task','Stato']],co='';
    days.forEach(day=>{
        (Array.isArray(d[day])?d[day]:[]).forEach(t=>{
            if(t.isHeader)co=t.tag?.name||'';
            else if(t.txt?.trim())rows.push([dayLabel(day),co,`"${t.txt.replace(/"/g,'""')}"`,t.done?'Completato':'Aperto']);
        });co='';
    });
    const bl=globalData.backlog||[];
    bl.forEach(b=>rows.push(['Backlog',b.company,`"${b.text.replace(/"/g,'""')}"`,`${Math.floor((Date.now()-new Date(b.createdAt).getTime())/86400000)}g fa`]));
    const csv=rows.map(r=>r.join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const s=new Date(currentMon),e=new Date(currentMon);e.setDate(s.getDate()+4);
    a.href=url;a.download=`settimana_${s.getDate()}-${e.getDate()}.csv`;a.click();URL.revokeObjectURL(url);
    showToast('CSV esportato');
};

window.exportPrint=function(){
    const key=getWeekKey(),d=globalData[key]||{};
    const days=['mon','tue','wed','thu','fri'];
    const s=new Date(currentMon),e=new Date(currentMon);e.setDate(s.getDate()+4);
    const weekStr=`${s.getDate()} – ${e.getDate()} ${e.toLocaleDateString('it-IT',{month:'long',year:'numeric'})}`;
    let html=`<html><head><meta charset="UTF-8"><title>Settimana ${weekStr}</title><style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:32px;color:#111;}h1{font-size:20px;font-weight:700;margin-bottom:4px;}p{color:#6b7280;font-size:13px;margin-bottom:24px;}.day{margin-bottom:24px;break-inside:avoid;}.dn{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;}.co{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;margin:6px 0 4px;}.task{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 0;}.chk{width:12px;height:12px;border:1.5px solid #d1d5db;border-radius:3px;flex-shrink:0;}.done-chk{background:#2563eb;border-color:#2563eb;}.done-txt{text-decoration:line-through;color:#9ca3af;}.bl{font-size:13px;padding:6px 0;border-bottom:1px solid #f3f4f6;}@media print{@page{margin:1cm}}</style></head><body><h1>CallForUs · Settimana</h1><p>${weekStr}</p>`;
    days.forEach(day=>{
        const tasks=Array.isArray(d[day])?d[day]:[];if(!tasks.length)return;
        html+=`<div class="day"><div class="dn">${dayLabel(day)}</div>`;
        tasks.forEach(t=>{
            if(t.isHeader)html+=`<div class="co" style="background:${t.tag?.bg||'#e5e7eb'};color:${t.tag?.col||'#000'};">${t.tag?.name||''}</div>`;
            else if(t.txt?.trim())html+=`<div class="task"><div class="chk ${t.done?'done-chk':''}"></div><span class="${t.done?'done-txt':''}">${t.txt}</span></div>`;
        });
        html+=`</div>`;
    });
    const bl=globalData.backlog||[];
    if(bl.length){html+=`<div class="day"><div class="dn">Backlog (${bl.length})</div>`;bl.forEach(b=>{html+=`<div class="bl"><strong>${b.company}</strong> — ${b.text}</div>`;});html+=`</div>`;}
    html+=`</body></html>`;
    const win=window.open('','_blank');win.document.write(html);win.document.close();setTimeout(()=>win.print(),400);
};

// ═══════════════════════════════════════════════════════════
// VOICE INPUT
// ═══════════════════════════════════════════════════════════
let recognition = null;
let voiceTranscript = '';
let pendingVoiceTasks = []; // [{company, color, tasks:[]}]

function voiceSetState(state) {
    ['voiceIdle','voiceRecording','voiceProcessing','voiceResult','voiceError']
        .forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
    const el = document.getElementById(state);
    if (el) el.style.display = 'block';
}

window.toggleVoice = function() {
    openModal('voiceModal');
    voiceSetState('voiceIdle');
    voiceTranscript = '';
    pendingVoiceTasks = [];
};

window.startVoice = function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        voiceSetState('voiceError');
        document.getElementById('voiceErrorMsg').innerText = 'Il tuo browser non supporta la registrazione vocale. Usa Chrome o Safari.';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = true;
    recognition.interimResults = true;

    const btn = document.getElementById('voiceBtn');
    if (btn) btn.classList.add('recording');
    voiceSetState('voiceRecording');
    voiceTranscript = '';

    recognition.onresult = e => {
        voiceTranscript = Array.from(e.results).map(r => r[0].transcript).join(' ');
    };

    recognition.onerror = e => {
        if (btn) btn.classList.remove('recording');
        voiceSetState('voiceError');
        document.getElementById('voiceErrorMsg').innerText =
            e.error === 'not-allowed'
                ? 'Microfono non autorizzato. Controlla i permessi del browser.'
                : `Errore: ${e.error}. Riprova.`;
    };

    recognition.onend = () => {
        if (btn) btn.classList.remove('recording');
        if (voiceTranscript.trim()) processVoiceTranscript();
        else { voiceSetState('voiceError'); document.getElementById('voiceErrorMsg').innerText = 'Non ho sentito nulla. Riprova parlando più vicino al microfono.'; }
    };

    recognition.start();
};

window.stopVoice = function() {
    if (recognition) recognition.stop();
    const btn = document.getElementById('voiceBtn');
    if (btn) btn.classList.remove('recording');
};

async function processVoiceTranscript() {
    voiceSetState('voiceProcessing');
    const transcriptEl = document.getElementById('voiceTranscript');
    if (transcriptEl) transcriptEl.innerText = `"${voiceTranscript}"`;

    const companiesCtx = companyList.length
        ? `Aziende disponibili: ${companyList.map(c=>c.name).join(', ')}.`
        : 'Non ci sono aziende registrate, usa il nome esatto che senti nella frase.';

    const prompt = `Sei un assistente che analizza testo vocale e crea task lavorativi.
${companiesCtx}
Testo vocale: "${voiceTranscript}"

Estrai le aziende e i loro task. Abbina ogni azienda a quelle disponibili (ignora maiuscole/minuscole, accetta varianti fonetico-simili es. "gearks pro" → GEARXPRO).
Rispondi SOLO con un array JSON valido, nessun testo prima o dopo:
[{"company":"NOME_AZIENDA","tasks":["task1","task2"]}]
Se non riesci a identificare aziende o task, rispondi: []`;

    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "anthropic-dangerous-direct-browser-ipc": "true"
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 1000,
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await res.json();
        const raw = data.content?.map(c => c.text || '').join('').trim() || '[]';

        // Strip markdown fences if present
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);

        if (!Array.isArray(parsed) || parsed.length === 0) {
            voiceSetState('voiceError');
            document.getElementById('voiceErrorMsg').innerText = 'Non ho trovato task o aziende nel testo. Riprova con frasi tipo: "Per GearXPro controlla il PPC"';
            return;
        }

        // Attach company colors
        pendingVoiceTasks = parsed.map(item => {
            const comp = companyList.find(c => c.name.toUpperCase() === item.company.toUpperCase());
            return { company: item.company.toUpperCase(), color: comp?.color || '#E5E7EB', tasks: item.tasks };
        });

        renderVoicePreview();
        voiceSetState('voiceResult');

    } catch(e) {
        voiceSetState('voiceError');
        document.getElementById('voiceErrorMsg').innerText = 'Errore durante l\'elaborazione. Controlla la connessione e riprova.';
    }
}

function renderVoicePreview() {
    const el = document.getElementById('voicePreview'); if (!el) return;
    el.innerHTML = pendingVoiceTasks.map((group, gi) => {
        const comp = companyList.find(c => c.name.toUpperCase() === group.company);
        const bg = comp?.color || '#E5E7EB';
        const col = getContrast(bg);
        const tasksHtml = group.tasks.map((t, ti) => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--c-border);">
                <div style="width:14px;height:14px;border:1.5px solid var(--c-border-2);border-radius:3px;flex-shrink:0;"></div>
                <input value="${escAttr(t)}" oninput="pendingVoiceTasks[${gi}].tasks[${ti}]=this.value"
                    style="flex:1;border:none;background:transparent;font-family:var(--font);font-size:13px;color:var(--c-text);outline:none;">
                <button onclick="pendingVoiceTasks[${gi}].tasks.splice(${ti},1);renderVoicePreview();"
                    style="background:none;border:none;color:var(--c-text-3);cursor:pointer;font-size:16px;line-height:1;padding:0;">×</button>
            </div>`).join('');
        return `
            <div style="margin-bottom:14px;">
                <span style="display:inline-block;background:${bg};color:${col};font-size:10px;font-weight:700;letter-spacing:.06em;padding:3px 9px;border-radius:4px;margin-bottom:8px;text-transform:uppercase;">${group.company}</span>
                ${tasksHtml}
            </div>`;
    }).join('');
}

window.confirmVoiceTasks = function() {
    if (!pendingVoiceTasks.length) return;

    const dc = todayCode() || 'mon';
    const key = getWeekKey();
    if (!globalData[key]) globalData[key] = {};
    if (!globalData[key][dc]) globalData[key][dc] = [];

    let added = 0;
    pendingVoiceTasks.forEach(group => {
        if (!group.tasks.length) return;
        const comp = companyList.find(c => c.name.toUpperCase() === group.company);
        const bg = comp?.color || '#E5E7EB';
        const col = getContrast(bg);

        // Add header if not already present for today
        const dayData = globalData[key][dc];
        const hasHeader = dayData.some(t => t.isHeader && t.tag?.name === group.company);
        if (!hasHeader) {
            dayData.push({ txt:'', done:false, isHeader:true, tag:{ name:group.company, bg, col, bd:bg } });
        }

        group.tasks.forEach(t => {
            if (t.trim()) { dayData.push({ txt: t.trim(), done: false }); added++; }
        });
    });

    saveData(true);
    if (document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
    if (document.getElementById('page-home').classList.contains('active')) renderHome();

    closeModal('voiceModal');
    resetVoice();
    showToast(`✓ ${added} task aggiunt${added===1?'o':'i'} per oggi`);
};

window.resetVoice = function() {
    voiceTranscript = '';
    pendingVoiceTasks = [];
    voiceSetState('voiceIdle');
};
