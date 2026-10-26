/* Parlons — TCF French trainer (A1 → B2). No build step, no backend. */
(() => {
"use strict";
const LEVELS = ["A1","A2","B1","B2"];
const LKEY = "parlons-v1";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const DAY = 864e5;
const shuffle = a => { a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const lvlIdx = l => LEVELS.indexOf(l);
const upTo = l => LEVELS.slice(0, lvlIdx(l)+1);

/* ---------------- State ---------------- */
const DEFAULT = {v:1,onboarded:false,level:"A1",examDate:"",xp:0,streak:0,best:0,lastDay:"",days:{},
  srs:{},grammar:{},oral:{},ecrit:{},dictee:{n:0,sum:0},pron:{n:0,sum:0},writing:[],speaking:[],exams:[],
  daily:{date:"",steps:{}},
  settings:{voice:"",rate:0.95,recLang:"fr-FR",apiKey:"",model:"claude-sonnet-5-5",fbLang:"en",newPerDay:10,theme:"auto",transcript:true,autoSpeak:true}};
let S;
try { S = Object.assign(structuredClone(DEFAULT), JSON.parse(localStorage.getItem(LKEY)||"{}")); S.settings = Object.assign(structuredClone(DEFAULT.settings), S.settings||{}); }
catch(e){ S = structuredClone(DEFAULT); }
const save = () => { try { localStorage.setItem(LKEY, JSON.stringify(S)); } catch(e){} };

function addXP(n){
  const d = today();
  const before = cityStage(S.xp);
  S.xp += n;
  const after = cityStage(S.xp);
  if (after > before) setTimeout(() => toast(`${CITY[after].emoji} Nouveau dans votre quartier : ${CITY[after].name} !`, 3400), 600); S.days[d] = (S.days[d]||0) + n;
  if (S.lastDay !== d){
    const y = new Date(Date.now()-DAY); const yd = y.getFullYear()+"-"+String(y.getMonth()+1).padStart(2,"0")+"-"+String(y.getDate()).padStart(2,"0");
    S.streak = (S.lastDay === yd) ? S.streak+1 : 1; S.lastDay = d; S.best = Math.max(S.best, S.streak);
  }
  save();
}
function markDaily(step){
  if (S.daily.date !== today()) S.daily = {date:today(), steps:{}};
  if (!S.daily.steps[step]){ S.daily.steps[step] = true; save();
    if (Object.keys(S.daily.steps).length === 4) { addXP(20); toast("Séance du jour terminée ! +20 XP 🎉"); } }
}
const dailySteps = () => S.daily.date === today() ? S.daily.steps : {};

function toast(msg, ms=2400){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }

/* ---------------- Audio session (iOS) ---------------- */
// iOS mutes web audio with the Silent switch unless the session is "playback"; the mic needs "play-and-record".
const setAudioSession = t => { try { if (navigator.audioSession) navigator.audioSession.type = t; } catch(e){} };
const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

/* ---------------- Text-to-speech ---------------- */
const TTS = {
  voices:[], speaking:false, utts:[], gen:0, check:null,
  load(){ try { const v = speechSynthesis.getVoices().filter(v=>/^fr/i.test(v.lang)); if (v.length) this.voices = v; } catch(e){} return this.voices; },
  voice(i=0){ const vs=this.load(); if(!vs.length) return null;
    const rank = v => (v.name===S.settings.voice?10:0) + (/premium/i.test(v.name)?3:/enhanced|amélioré/i.test(v.name)?2:0) + (/fr-FR/i.test(v.lang)?1:0) + (/(Amélie|Audrey|Thomas|Google|Denise|Marie)/i.test(v.name)?.5:0);
    const sorted = vs.slice().sort((a,b)=>rank(b)-rank(a)); const pref = sorted[0];
    if (i===0) return pref;
    return sorted.find(v=>v!==pref && v.lang===pref.lang) || sorted.find(v=>v!==pref) || pref; },
  stop(){ this.gen++; this.speaking=false; this.utts=[]; clearTimeout(this.check); try { speechSynthesis.cancel(); } catch(e){} $$(".playing").forEach(b=>b.classList.remove("playing")); },
  speak(text, opts={}){
    if (!("speechSynthesis" in window)) { toast("La synthèse vocale n'est pas disponible sur cet appareil."); opts.onend && opts.onend(); return; }
    if (Mic.on) Mic.stop();
    this.stop(); setAudioSession("playback");
    const gen = this.gen, rate = (opts.rate ?? S.settings.rate);
    const queue = [];
    for (const raw of String(text).split("\n").filter(Boolean)){
      let who = 0, line = raw; const m = raw.match(/^([AB]):\s*(.*)$/); if (m){ who = m[1]==="A"?0:1; line = m[2]; }
      for (const part of line.split(/(?<=[.!?…;])\s+/)) if (part.trim()) queue.push({who, part:part.replace(/…/g,"...")});
    }
    if (!queue.length){ opts.onend && opts.onend(); return; }
    this.speaking = true; opts.btn && opts.btn.classList.add("playing");
    let i = 0, started = false;
    const finish = () => { if (gen!==this.gen) return; this.speaking=false; clearTimeout(this.check); opts.btn && opts.btn.classList.remove("playing"); opts.onend && opts.onend(); };
    const next = () => {
      if (gen!==this.gen) return;
      if (i >= queue.length) return finish();
      const {who, part} = queue[i++];
      const u = new SpeechSynthesisUtterance(part);
      this.utts.push(u); // keep a reference: iOS drops utterances that get garbage-collected (onend never fires)
      const v = this.voice(who); if (v){ u.voice = v; u.lang = v.lang; } else u.lang = "fr-FR";
      u.rate = rate; u.volume = 1; u.pitch = (who===1 && this.voice(1)===this.voice(0)) ? 0.8 : 1;
      u.onstart = () => { started = true; };
      u.onend = () => setTimeout(next, who!==(queue[i]?.who ?? who) ? 350 : 100);
      u.onerror = e => { if (e && (e.error==="interrupted"||e.error==="canceled")) return; setTimeout(next, 50); };
      speechSynthesis.speak(u); try { speechSynthesis.resume(); } catch(e){}
    };
    next();
    this.check = setTimeout(() => { if (gen===this.gen && !started && !speechSynthesis.speaking){ finish(); toast("Pas de son ? Montez le volume ou désactivez le mode silencieux, puis réessayez."); } }, 2500);
  }
};
if ("speechSynthesis" in window){ TTS.load(); speechSynthesis.onvoiceschanged = () => TTS.load(); }
// iOS only lets speech start from a tap. Prime it on the first tap so replies fetched later (AI conversation) can be spoken.
(function unlockSpeech(){
  const go = () => { try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch(e){}
    document.removeEventListener("touchend", go, true); document.removeEventListener("click", go, true); };
  document.addEventListener("touchend", go, true); document.addEventListener("click", go, true);
})();
const speakBtn = (text, extra="") => `<button class="speak" data-say="${esc(text)}" ${extra} aria-label="Écouter">🔊</button>`;

/* ---------------- Microphone (ported from Intersection's fixes) ----------------
   1. Open the mic with getUserMedia first (switching iOS to play-and-record) and always record audio,
      so there is a playback even when speech recognition fails.
   2. Restart recognition gently: at most 6 times, never faster than every 1.5 s (a tight restart loop is
      what made the Stop button unresponsive).
   3. Stopping keeps the unfinished (interim) words, which iOS often never finalises.
   4. A dedicated red Stop button, a double-tap guard and a hard time cap.                                   */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const Mic = {
  on:false, busy:false, stream:null, mr:null, chunks:[], url:null, recog:null, final:"", interim:"", t0:0, secs:0,
  restarts:0, lastRestart:0, timer:null, cap:null, silence:null, ctx:null, raf:0, opts:{}, heard:false,
  get text(){ return (this.final+" "+this.interim).replace(/\s+/g," ").trim(); },
  async start(opts={}){
    if (this.on || this.busy) return false;
    this.busy = true; TTS.stop(); this.opts = opts; this.final=""; this.interim=""; this.secs=0; this.chunks=[]; this.heard=false;
    if (this.url){ try { URL.revokeObjectURL(this.url); } catch(e){} this.url=null; }
    try { setAudioSession("play-and-record"); this.stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}); }
    catch(e){ this.busy=false; setAudioSession("playback"); toast("Micro bloqué. Autorisez-le dans Réglages › Safari › Microphone, ou écrivez votre réponse.", 4000); return false; }
    try {
      const has = t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t);
      const mime = has("audio/mp4") ? "audio/mp4" : has("audio/webm") ? "audio/webm" : "";
      const mr = new MediaRecorder(this.stream, mime ? {mimeType:mime} : undefined); this.mr = mr; const chunks = this.chunks;
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => { if (chunks.length){ this.url = URL.createObjectURL(new Blob(chunks, {type: mr.mimeType || "audio/mp4"})); } opts.onAudio && opts.onAudio(this.url); };
      mr.start(250);
    } catch(e){ this.mr = null; }
    try { // live level meter, so you can see the mic hears you
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(()=>{});
      const an = this.ctx.createAnalyser(); an.fftSize = 512; this.ctx.createMediaStreamSource(this.stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => { if (!this.on && !this.busy) return; an.getByteTimeDomainData(buf); let s=0; for (const v of buf){ const d=(v-128)/128; s+=d*d; }
        const lvl = Math.min(1, Math.sqrt(s/buf.length)*5); if (lvl > .12) this.heard = true; opts.onLevel && opts.onLevel(lvl); this.raf = requestAnimationFrame(tick); };
      this.raf = requestAnimationFrame(tick);
    } catch(e){ this.ctx = null; }
    if (SR && S.settings.transcript !== false){
      try {
        const r = new SR(); this.recog = r;
        r.lang = S.settings.recLang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
        r.onresult = ev => {
          if (this.recog !== r) return;
          let interim = "";
          for (let i=ev.resultIndex;i<ev.results.length;i++){ const res = ev.results[i]; if (res.isFinal) this.final += res[0].transcript.trim()+" "; else interim += res[0].transcript; }
          this.interim = interim; opts.onText && opts.onText(this.text);
          if (opts.autoStop && this.text){ clearTimeout(this.silence); this.silence = setTimeout(() => { if (this.on) this.finish(); }, opts.autoStop); }
        };
        r.onerror = () => {};
        r.onend = () => {
          if (!this.on || this.recog !== r) return;
          if (this.interim){ this.final += this.interim+" "; this.interim=""; }
          const now = Date.now(); if (this.restarts >= 6 || now - this.lastRestart < 1500) return;
          this.restarts++; this.lastRestart = now;
          setTimeout(() => { if (this.on && this.recog === r){ try { r.start(); } catch(e){} } }, 300);
        };
        r.start();
      } catch(e){ this.recog = null; }
    }
    this.on = true; this.busy = false; this.t0 = Date.now(); this.restarts = 0; this.lastRestart = Date.now();
    clearTimeout(this.cap); this.cap = setTimeout(() => { if (this.on) this.finish(); }, (opts.maxSecs || 180)*1000);
    this.timer = setInterval(() => { this.secs = Math.round((Date.now()-this.t0)/1000); opts.onTick && opts.onTick(this.secs); }, 250);
    return true;
  },
  stop(){
    if (!this.on) return this.text;
    this.on = false; clearInterval(this.timer); clearTimeout(this.cap); clearTimeout(this.silence); cancelAnimationFrame(this.raf);
    this.secs = Math.max(1, Math.round((Date.now()-this.t0)/1000));
    const text = this.text;
    try { this.mr && this.mr.state !== "inactive" && this.mr.stop(); } catch(e){}
    const r = this.recog; this.recog = null;
    try { r && r.stop(); } catch(e){}
    setTimeout(() => { try { r && r.abort && r.abort(); } catch(e){} }, 800);
    const st = this.stream; this.stream = null;
    setTimeout(() => { try { st && st.getTracks().forEach(t=>t.stop()); } catch(e){} setAudioSession("playback"); }, 300);
    try { this.ctx && this.ctx.close(); } catch(e){} this.ctx = null;
    return text;
  },
  finish(){ const t = this.stop(); const cb = this.opts.onStop; this.opts.onStop = null; cb && cb(t, this.secs, this.heard); }
};

window.Mic = Mic; // handy for debugging from the console

// Reusable recorder widget: big mic toggle, level meter, timer, live transcript, a separate red Stop button, playback.
function recorder(el, {autoStop=0, maxSecs=180, hint="Appuyez sur le micro, puis parlez", onStop, onStart, onLive, compact=false}={}){
  el.innerHTML = `<div class="rec ${compact?"compact":""}">
    <button class="mic" type="button" aria-label="Enregistrer">🎤</button>
    <div class="level" aria-hidden="true"><i></i></div>
    <div class="row" style="justify-content:center;gap:8px"><span class="timer rt">0:00</span><span class="small muted rh">${hint}</span></div>
    <div class="transcript rx" hidden></div>
    <button class="btn red rs" type="button" hidden>■ Arrêter l'enregistrement</button>
    <audio class="rp" controls hidden></audio></div>`;
  const q = s => el.querySelector(s);
  const mic=q(".mic"), lvl=q(".level i"), rt=q(".rt"), rh=q(".rh"), rx=q(".rx"), rs=q(".rs"), rp=q(".rp");
  const idle = () => { mic.classList.remove("on"); mic.textContent="🎤"; mic.setAttribute("aria-label","Enregistrer"); rs.hidden=true; lvl.style.width="0"; };
  const stopNow = () => { if (Mic.on) Mic.finish(); };
  mic.onclick = async () => {
    if (Mic.busy) return;
    if (Mic.on) return stopNow();
    rp.hidden = true; rx.hidden = compact; rx.textContent = SR && S.settings.transcript!==false ? "J'écoute…" : "Enregistrement en cours (transcription désactivée)";
    const ok = await Mic.start({autoStop, maxSecs,
      onText: t => { rx.textContent = t || "J'écoute…"; onLive && onLive(t); },
      onLevel: v => { lvl.style.width = Math.round(v*100)+"%"; },
      onTick: s => { rt.textContent = fmt(s); },
      onAudio: url => { if (url && !compact){ rp.src = url; rp.hidden = false; } },
      onStop: (text, secs, heard) => { idle(); rh.textContent = "Appuyez sur le micro pour recommencer";
        if (!text && !compact) rx.textContent = heard ? "Je vous ai entendu, mais la transcription n'a pas fonctionné. Réécoutez-vous ci-dessous." : "Aucun son capté. Vérifiez que le micro est autorisé et parlez plus près.";
        onStop && onStop(text, secs, heard); }});
    if (!ok){ rx.hidden = true; return; }
    mic.classList.add("on"); mic.textContent="■"; mic.setAttribute("aria-label","Arrêter"); rs.hidden = compact;
    rh.textContent = autoStop ? "Parlez… ça s'arrête tout seul après une pause" : "Parlez… puis appuyez sur ■";
    onStart && onStart();
  };
  rs.onclick = stopNow;
  onLeave(() => { if (Mic.on) Mic.stop(); });
  return {stop: stopNow, get playback(){ return rp; }};
}

/* ---------------- Text comparison ---------------- */
const NUM = {0:"zéro",1:"un",2:"deux",3:"trois",4:"quatre",5:"cinq",6:"six",7:"sept",8:"huit",9:"neuf",10:"dix",11:"onze",12:"douze",13:"treize",14:"quatorze",15:"quinze",16:"seize",17:"dix-sept",18:"dix-huit",19:"dix-neuf",20:"vingt",30:"trente",40:"quarante",50:"cinquante",60:"soixante",100:"cent",1000:"mille"};
const strip = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"");
function words(s){
  return String(s).toLowerCase().replace(/[’`]/g,"'").replace(/(\d+)\s*h\b/g,"$1 heures")
    .replace(/\b\d+\b/g, n => NUM[n] || n).replace(/'/g,"' ").replace(/[^\p{L}\p{N}'\- ]/gu," ")
    .split(/\s+/).filter(Boolean).flatMap(w => w.split(/-(?=\p{L})/u)).filter(Boolean);
}
function align(target, hyp, eq){
  const n=target.length, m=hyp.length, D=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=0;i<=n;i++) D[i][0]=i; for(let j=0;j<=m;j++) D[0][j]=j;
  for(let i=1;i<=n;i++) for(let j=1;j<=m;j++) D[i][j]=Math.min(D[i-1][j]+1,D[i][j-1]+1,D[i-1][j-1]+(eq(target[i-1],hyp[j-1])?0:1));
  const out=[]; let i=n,j=m;
  while(i>0||j>0){
    if(i>0&&j>0&&D[i][j]===D[i-1][j-1]+(eq(target[i-1],hyp[j-1])?0:1)){ out.unshift({t:target[i-1],h:hyp[j-1]}); i--; j--; }
    else if(i>0&&D[i][j]===D[i-1][j]+1){ out.unshift({t:target[i-1],h:null}); i--; }
    else { out.unshift({t:null,h:hyp[j-1]}); j--; }
  }
  return out;
}
function compare(targetStr, hypStr, {accents=true}={}){
  const t = words(targetStr), h = words(hypStr);
  const loose = (a,b) => strip(a)===strip(b);
  const al = align(t, h, loose);
  let ok=0, acc=0; const tokens=[];
  for (const p of al){
    if (p.t===null) continue;
    if (p.h===null){ tokens.push({w:p.t,c:"w-miss"}); continue; }
    if (p.t===p.h){ ok++; tokens.push({w:p.t,c:"w-ok"}); }
    else if (loose(p.t,p.h)){ if(accents){ acc++; tokens.push({w:p.h,c:"w-acc",fix:p.t}); } else { ok++; tokens.push({w:p.t,c:"w-ok"}); } }
    else tokens.push({w:p.h,c:"w-ko",fix:p.t});
  }
  const extra = al.filter(p=>p.t===null).length;
  const score = t.length ? Math.max(0, (ok + acc*0.5 - extra*0.25) / t.length) : 0;
  return {score:Math.round(score*100), tokens, ok, acc, total:t.length};
}
const renderTokens = toks => toks.map(t => `<span class="${t.c}" ${t.fix?`title="${esc(t.fix)}"`:""}>${esc(t.w)}</span>${t.fix&&t.c!=="w-ok"?`<sup class="small muted"> ${esc(t.fix)}</sup>`:""}`).join(" ");

/* ---------------- Vocabulary SRS ---------------- */
const INTERVALS = [0, 1, 2, 4, 8, 16, 35, 70];
const wordId = w => w[0];
function vocabPool(){ return VOCAB.filter(w => upTo(S.level).includes(w[2])); }
function srsQueue(limit=12){
  const now = Date.now(), due=[], fresh=[];
  for (const w of vocabPool()){ const c = S.srs[wordId(w)]; if (!c) fresh.push(w); else if (c.due <= now) due.push(w); }
  due.sort((a,b)=>S.srs[wordId(a)].due - S.srs[wordId(b)].due);
  const introducedToday = Object.values(S.srs).filter(c=>c.intro===today()).length;
  const newCount = Math.max(0, Math.min(S.settings.newPerDay - introducedToday, limit - due.length));
  return [...due.slice(0,limit), ...fresh.slice(0,newCount)];
}
function grade(w, q){ // q: 0 again, 1 hard, 2 good
  const id = wordId(w); const c = S.srs[id] || {box:0, due:0, intro:today(), seen:0};
  c.seen++;
  if (q===0){ c.box = 0; c.due = Date.now() + 10*60e3; }
  else if (q===1){ c.box = Math.max(1, c.box); c.due = Date.now() + DAY; }
  else { c.box = Math.min(INTERVALS.length-1, c.box+1); c.due = Date.now() + INTERVALS[c.box]*DAY; }
  S.srs[id] = c; save();
}
const mastered = lvl => VOCAB.filter(w=>(!lvl||w[2]===lvl) && (S.srs[wordId(w)]?.box||0) >= 4).length;
const learned = lvl => VOCAB.filter(w=>(!lvl||w[2]===lvl) && S.srs[wordId(w)]).length;

/* ---------------- Progress ---------------- */
function levelProgress(l){
  const v = VOCAB.filter(w=>w[2]===l), g = GRAMMAR.filter(x=>x.level===l), o = ORAL.filter(x=>x.level===l), e = ECRIT.filter(x=>x.level===l);
  const vs = v.reduce((a,w)=>a+Math.min(4,S.srs[wordId(w)]?.box||0)/4,0)/Math.max(1,v.length);
  const gs = g.filter(x=>(S.grammar[x.id]?.best||0)>=0.8).length/Math.max(1,g.length);
  const os = o.filter(x=>(S.oral[x.id]||0)>=0.5).length/Math.max(1,o.length);
  const es = e.filter(x=>(S.ecrit[x.id]||0)>=0.5).length/Math.max(1,e.length);
  return Math.round((vs*0.35+gs*0.3+os*0.175+es*0.175)*100);
}

/* ---------------- Router ---------------- */
const app = $("#app");
let cleanup = [];
function onLeave(fn){ cleanup.push(fn); }
function route(){
  cleanup.forEach(f=>{try{f();}catch(e){}}); cleanup=[]; TTS.stop();
  const [path, arg] = (location.hash.slice(2) || "home").split("/");
  if (!S.onboarded && path !== "onboard" && path !== "placement") { location.hash = "#/onboard"; return; }
  const view = VIEWS[path] || VIEWS.home;
  app.innerHTML = ""; window.scrollTo(0,0);
  view(arg ? decodeURIComponent(arg) : undefined);
  $$(".nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#/"+path || (path==="home"&&a.getAttribute("href")==="#/home")));
  document.querySelector(".nav").style.display = (path==="onboard"||path==="placement") ? "none" : "";
}
window.addEventListener("hashchange", route);
document.addEventListener("click", e => {
  const s = e.target.closest("[data-say]");
  if (s){ e.preventDefault(); if (s.classList.contains("playing")) TTS.stop(); else TTS.speak(s.dataset.say, {btn:s, rate: s.dataset.rate ? +s.dataset.rate : undefined}); }
  const g = e.target.closest("[data-go]"); if (g){ if (location.hash === g.dataset.go) route(); else location.hash = g.dataset.go; }
});
const top = (title, back="#/home", right="") => `<div class="top"><button class="back" data-go="${back}" aria-label="Retour">‹</button><h2>${title}</h2>${right}</div>`;
const html = (s) => { app.insertAdjacentHTML("beforeend", s); };

/* ---------------- Accent keyboard ---------------- */
function accentBar(target){
  const chars = ["é","è","ê","à","â","ç","ô","î","ù","û","ë","ï","œ","«","»"];
  const bar = document.createElement("div"); bar.className="accents";
  bar.innerHTML = chars.map(c=>`<button type="button" data-ch="${c}">${c}</button>`).join("");
  bar.addEventListener("click", e => { const b=e.target.closest("[data-ch]"); if(!b) return; e.preventDefault();
    const el = target; const s=el.selectionStart??el.value.length, en=el.selectionEnd??el.value.length;
    el.value = el.value.slice(0,s)+b.dataset.ch+el.value.slice(en); el.focus(); el.setSelectionRange(s+1,s+1); el.dispatchEvent(new Event("input")); });
  return bar;
}

/* ---------------- AI grading ---------------- */
function graderPrompt(kind, task, text){
  const lang = S.settings.fbLang==="fr" ? "French" : "English (keep all corrections and example sentences in French)";
  const what = kind==="write" ? `Expression écrite, tâche ${task.task} (${task.min}–${task.max} words)` : `Expression orale, tâche ${task.task} (transcribed by speech recognition, so ignore punctuation and minor transcription artifacts)`;
  return `You are a certified TCF Canada examiner. Grade my answer for the ${what}.

TASK: ${task.prompt}${task.docs?"\nDOCUMENTS:\n"+task.docs.join("\n"):""}

MY ANSWER:
"""
${text}
"""

Respond in ${lang}. Format exactly:
SCORE: <0-20>/20 · CECR: <A1–C2> · NCLC: <number>
Then these sections with short bullets:
## What worked
## Errors to fix (quote → correction → why)
## Upgrade to the next level (3 concrete techniques, vocabulary or structures)
## Improved version (a corrected and enriched version of my answer, same length range)`;
}
function mdLite(s){
  return esc(s).replace(/^## (.*)$/gm,"<h3 style='margin-top:14px'>$1</h3>").replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")
    .replace(/^[-•] (.*)$/gm,"<div style='padding-left:14px;text-indent:-10px'>• $1</div>").replace(/\n{2,}/g,"<br>");
}
async function gradeWithAPI(prompt){
  const r = await fetch("https://api.anthropic.com/v1/messages", {method:"POST", headers:{"content-type":"application/json","x-api-key":S.settings.apiKey,
    "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body: JSON.stringify({model:S.settings.model, max_tokens:2000, messages:[{role:"user",content:prompt}]})});
  if (!r.ok){ const t = await r.text(); throw new Error(r.status+" "+t.slice(0,200)); }
  const j = await r.json(); return j.content.map(c=>c.text||"").join("");
}
async function chatWithAPI(system, messages){
  const r = await fetch("https://api.anthropic.com/v1/messages", {method:"POST", headers:{"content-type":"application/json","x-api-key":S.settings.apiKey,
    "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body: JSON.stringify({model:S.settings.model, max_tokens:300, system, messages})});
  if (!r.ok) throw new Error(r.status+"");
  const j = await r.json(); return j.content.map(c=>c.text||"").join("");
}
function gradingPanel(container, kind, task, getText, onScore){
  container.innerHTML = `
    <div class="card stack">
      <h3>Correction</h3>
      ${S.settings.apiKey ? `<button class="btn" id="g-api">✨ Corriger maintenant</button>` : ""}
      <button class="btn ${S.settings.apiKey?"ghost":""}" id="g-app">Corriger dans l'app Claude</button>
      <p class="small muted">${S.settings.apiKey ? "Corrigé directement grâce à votre clé API." : "Ouvre Claude avec votre texte et la grille d'évaluation, gratuit avec votre abonnement. Le texte est aussi copié."}</p>
      <div id="g-out"></div>
      <div class="row"><input type="text" id="g-score" inputmode="numeric" placeholder="Note /20" style="max-width:120px"><button class="btn sm soft" id="g-save">Enregistrer la note</button></div>
    </div>`;
  const out = $("#g-out", container);
  $("#g-app", container).onclick = async () => {
    const text = getText(); if (!text.trim()) return toast("Écrivez ou dites quelque chose d'abord.");
    const p = graderPrompt(kind, task, text);
    window.open("https://claude.ai/new?q="+encodeURIComponent(p), "_blank");
    try { await navigator.clipboard.writeText(p); } catch(e){}
  };
  const api = $("#g-api", container);
  if (api) api.onclick = async () => {
    const text = getText(); if (!text.trim()) return toast("Écrivez ou dites quelque chose d'abord.");
    api.disabled = true; api.textContent = "Correction en cours…";
    try {
      const res = await gradeWithAPI(graderPrompt(kind, task, text));
      out.innerHTML = `<div class="grade-box">${mdLite(res)}</div>`;
      const m = res.match(/SCORE:\s*(\d{1,2})/i); if (m){ $("#g-score",container).value = m[1]; onScore(+m[1], res); }
    } catch(e){ out.innerHTML = `<div class="feedback ko">Erreur : ${esc(e.message)}. Vérifiez votre clé dans Réglages.</div>`; }
    api.disabled = false; api.textContent = "✨ Corriger à nouveau";
  };
  $("#g-save", container).onclick = () => { const v = parseInt($("#g-score",container).value,10); if (isNaN(v)||v<0||v>20) return toast("Note entre 0 et 20."); onScore(v); toast("Note enregistrée."); };
}

/* ================= VIEWS ================= */
const VIEWS = {};

/* ----- Onboarding ----- */
VIEWS.onboard = () => {
  html(`<div class="stack" style="padding-top:24px">
    <div class="confetti">🇫🇷</div>
    <h1 class="center">Bienvenue sur Parlons</h1>
    <p class="center muted">Votre coach quotidien pour le TCF, de A1 à B2. Écoute, lecture, vocabulaire, grammaire, écrit et oral.</p>
    <div class="card stack">
      <h3>Quel est votre niveau actuel ?</h3>
      ${[["A1","Je débute","Je connais quelques mots"],["A2","Je me débrouille","Je parle de ma vie quotidienne"],["B1","Intermédiaire","Je donne mon avis simplement"],["B2","Avancé","J'argumente avec nuance"]]
        .map(([l,t,s])=>`<button class="list-item" data-lvl="${l}"><span class="pill">${l}</span><span class="grow"><span class="t">${t}</span><br><span class="s">${s}</span></span>›</button>`).join("")}
      <button class="btn soft" data-go="#/placement">Je ne sais pas — faire le test (3 min)</button>
    </div></div>`);
  $$("[data-lvl]").forEach(b => b.onclick = () => { S.level=b.dataset.lvl; S.onboarded=true; save(); location.hash="#/home"; });
};

VIEWS.placement = () => {
  const qs = []; for (const l of LEVELS){ const pool = shuffle(GRAMMAR.filter(g=>g.level===l).flatMap(g=>g.quiz)); qs.push(...pool.slice(0,4).map(q=>({q,l}))); }
  let i=0; const right={A1:0,A2:0,B1:0,B2:0};
  html(`${top("Test de placement", "#/onboard")}<div id="pz"></div>`);
  const show = () => {
    if (i>=qs.length){
      let lvl="A1"; for (const l of LEVELS){ if (right[l]>=3) lvl=l; else break; }
      S.level = lvl; S.onboarded = true; save();
      $("#pz").innerHTML = `<div class="card stack center"><div class="confetti">🎯</div><h2>Votre niveau : ${lvl}</h2>
        <p class="muted">${LEVELS.map(l=>`${l} : ${right[l]}/4`).join(" · ")}</p><p class="small muted">Vous pouvez le changer à tout moment dans Réglages.</p>
        <button class="btn" data-go="#/home">Commencer</button></div>`; return;
    }
    const {q,l} = qs[i];
    $("#pz").innerHTML = `<div class="bar" style="margin-bottom:14px"><i style="width:${i/qs.length*100}%"></i></div>
      <div class="card"><span class="pill gray">${i+1}/${qs.length}</span><p class="fr" style="margin-top:10px">${esc(q[0])}</p>
      ${q[1].map((o,k)=>`<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}
      <button class="btn ghost" style="margin-top:12px" id="skip">Je ne sais pas</button></div>`;
    $$("#pz .opt").forEach(b=>b.onclick=()=>{ if(+b.dataset.k===q[2]) right[l]++; i++; show(); });
    $("#skip").onclick = () => { i++; show(); };
  };
  show();
};

/* ----- Home ----- */
VIEWS.home = () => {
  const steps = dailySteps(); const done = Object.keys(steps).length;
  const dueCount = srsQueue(99).length;
  const days = S.examDate ? Math.ceil((new Date(S.examDate+"T09:00") - Date.now())/DAY) : null;
  const h = new Date().getHours(); const hello = h<5?"Bonne nuit":h<18?"Bonjour":"Bonsoir";
  html(`
  <div class="row between" style="margin:6px 0 14px">
    <div><div class="muted small">${hello} 👋</div><h1>Parlons</h1></div>
    <div class="row"><span class="pill red">🔥 ${S.streak}</span><span class="pill">⭐ ${S.xp}</span></div>
  </div>
  ${cityCard()}
  <div class="card hero stack" style="margin-top:12px">
    <div class="row between"><span class="pill" style="background:rgba(255,255,255,.15);color:#fff">Niveau ${S.level}</span>${days!==null&&days>=0?`<span class="small muted">TCF dans ${days} j</span>`:""}</div>
    <h2 style="color:#fff">Séance du jour</h2>
    <div class="bar" style="background:rgba(255,255,255,.18)"><i style="width:${done/4*100}%;background:#fff"></i></div>
    <div class="small muted">${done}/4 étapes · environ 15 minutes</div>
    <button class="btn white" data-go="#/daily">${done===4?"Revoir la séance ✓":done?"Continuer":"Commencer"}</button>
  </div>
  <h3 style="margin:22px 0 10px">S'entraîner</h3>
  <div class="grid2">
    ${tile("#/vocab","🗂️","Vocabulaire",dueCount?`${dueCount} cartes à réviser`:"À jour !")}
    ${tile("#/grammar","🧩","Grammaire",`${GRAMMAR.filter(g=>(S.grammar[g.id]?.best||0)>=.8).length}/${GRAMMAR.length} leçons`)}
    ${tile("#/oral","🎧","Compréhension orale","Annonces, dialogues")}
    ${tile("#/ecrit","📖","Compréhension écrite","Textes et documents")}
    ${tile("#/dictee","✍️","Dictée","Écouter et écrire")}
    ${tile("#/pron","🗣️","Prononciation","Le micro vous note")}
    ${tile("#/write","📝","Expression écrite","Tâches 1, 2, 3")}
    ${tile("#/speak","🎙️","Expression orale","Tâches 1, 2, 3")}
  </div>
  <button class="list-item" data-go="#/talk" style="margin-top:12px"><span style="font-size:24px">💬</span><span class="grow"><span class="t">Conversation avec l'IA</span><br><span class="s">${CONVOS.length} scénarios : café, entretien, débats… Parlez ou écrivez, l'IA corrige.</span></span>›</button>
  <button class="list-item" data-go="#/exam"><span style="font-size:24px">⏱️</span><span class="grow"><span class="t">Examen blanc</span><br><span class="s">Compréhension orale + écrite chronométrées, score /699 et NCLC estimés</span></span>›</button>
  <div class="card" style="margin-top:12px">
    <div class="row between"><h3>Progression ${S.level}</h3><span class="pill gray">${levelProgress(S.level)} %</span></div>
    <div class="bar green" style="margin-top:10px"><i style="width:${levelProgress(S.level)}%"></i></div>
    <p class="small muted" style="margin-top:8px">${levelProgress(S.level)>=80 && S.level!=="B2" ? `Prêt pour ${LEVELS[lvlIdx(S.level)+1]} ? Changez de niveau dans Réglages.` : "Vocabulaire maîtrisé, leçons réussies et exercices de compréhension."}</p>
  </div>`);
};
const tile = (go, ico, t, s) => `<button class="tile" data-go="${go}"><span class="ico">${ico}</span><b>${t}</b><span>${s}</span></button>`;

/* ----- Daily ----- */
VIEWS.daily = () => {
  const st = dailySteps();
  const lesson = GRAMMAR.find(g=>upTo(S.level).includes(g.level) && (S.grammar[g.id]?.best||0)<.8) || shuffle(GRAMMAR.filter(g=>upTo(S.level).includes(g.level)))[0];
  const oral = ORAL.find(o=>upTo(S.level).includes(o.level) && S.oral[o.id]===undefined) || shuffle(ORAL.filter(o=>upTo(S.level).includes(o.level)))[0];
  const items = [
    ["vocab","🗂️","Vocabulaire","Révisez vos cartes du jour","#/vocab"],
    ["grammar","🧩","Grammaire",lesson.title,"#/grammar/"+lesson.id],
    ["oral","🎧","Écoute",oral.context,"#/oral/"+oral.id],
    ["speak","🗣️","Parler","Prononcez 3 phrases","#/pron"]];
  html(`${top("Séance du jour")}
  <p class="muted">Quatre étapes courtes. Faites-les dans l'ordre ou non : chacune se coche toute seule.</p>
  ${items.map(([k,ico,t,s,go])=>`<button class="list-item" data-go="${go}"><span class="check ${st[k]?"done":""}">${st[k]?"✓":""}</span><span class="grow"><span class="t">${ico} ${t}</span><br><span class="s">${esc(s)}</span></span>›</button>`).join("")}
  <div class="card" style="margin-top:14px"><b>Bonus de la semaine</b><p class="small muted">Une tâche d'expression écrite et une tâche orale par semaine suffisent pour progresser vers le B2.</p>
  <div class="row"><button class="btn sm soft" data-go="#/write">📝 Écrire</button><button class="btn sm soft" data-go="#/speak">🎙️ Parler</button></div></div>`);
};

/* ----- Vocabulary ----- */
VIEWS.vocab = () => {
  const q = srsQueue(12);
  html(`${top("Vocabulaire", "#/home", `<button class="btn sm ghost" data-go="#/words">Liste</button>`)}<div id="vz"></div>`);
  const box = $("#vz");
  if (!q.length){
    const fresh = vocabPool().filter(w=>!S.srs[wordId(w)]);
    box.innerHTML = `<div class="card center stack"><div class="confetti">✅</div><h2>Tout est révisé</h2><p class="muted">Vos révisions du jour sont faites. Envie de continuer ?</p>
      ${fresh.length?`<button class="btn" id="more">Apprendre 10 nouveaux mots</button>`:""}<button class="btn ghost" id="extra">10 cartes au hasard</button>
      <p class="small muted">${fresh.length} mots encore à découvrir jusqu'au niveau ${S.level}.</p></div>`;
    const mb = $("#more"); if (mb) mb.onclick = () => run(fresh.slice(0,10), false);
    $("#extra").onclick = () => run(shuffle(vocabPool()).slice(0,10), true); return;
  }
  run(q, false);
  function run(queue, free){
    let i=0, right=0; const total=queue.length; const again=[];
    const next = () => {
      if (i>=queue.length && again.length){ queue.push(...again.splice(0)); }
      if (i>=queue.length){
        addXP(total*2); if (total>=5) markDaily("vocab");
        box.innerHTML = `<div class="card center stack"><div class="confetti">🎉</div><h2>Session terminée</h2><p class="muted">${right}/${total} du premier coup · +${total*2} XP</p>
          <p class="small muted">${mastered()} mots maîtrisés · ${learned()} mots vus</p><button class="btn" data-go="#/home">Retour</button><button class="btn ghost" data-go="#/vocab">Continuer</button></div>`; return;
      }
      const w = queue[i++]; const c = S.srs[wordId(w)]; const box_ = c?.box||0;
      const mode = !c ? "learn" : box_<=1 ? "recog" : box_===2 ? "listen" : (Math.random()<.5?"produce":"listen");
      const header = `<div class="bar" style="margin-bottom:12px"><i style="width:${Math.min(100,(i-1)/total*100)}%"></i></div>`;
      const finish = (q) => { if(!free) grade(w,q); if(q===0) again.push(w); else if (!again.includes(w)) right++; next(); };
      const buttons = `<div class="grid2" style="grid-template-columns:1fr 1fr 1fr;margin-top:12px">
        <button class="btn red sm" data-q="0">À revoir</button><button class="btn soft sm" data-q="1">Difficile</button><button class="btn green sm" data-q="2">Facile</button></div>`;
      if (mode==="learn" || mode==="recog"){
        box.innerHTML = `${header}<div class="card flash"><div class="face">
          ${mode==="learn"?`<span class="pill green">Nouveau mot · ${w[2]}</span>`:`<span class="pill gray">${esc(w[3])}</span>`}
          <div class="big-fr">${esc(w[0])}</div>${speakBtn(w[0])}
          <div id="rev" style="display:${mode==="learn"?"block":"none"}"><p style="font-size:18px;margin-top:10px"><b>${esc(w[1])}</b></p>
          <p class="fr" style="font-size:16px">${esc(w[4])} ${speakBtn(w[4])}</p></div>
          ${mode==="recog"?`<button class="btn ghost" id="show" style="margin-top:12px">Afficher la réponse</button>`:""}
        </div></div><div id="gb" style="display:${mode==="learn"?"block":"none"}">${mode==="learn"?`<button class="btn" data-q="1" style="margin-top:12px">Je l'ai noté →</button>`:buttons}</div>`;
        setTimeout(()=>TTS.speak(w[0]),150);
        const sh = $("#show"); if (sh) sh.onclick = () => { $("#rev").style.display="block"; sh.remove(); $("#gb").style.display="block"; };
        $$("#gb [data-q]").forEach(b=>b.onclick=()=>finish(+b.dataset.q));
      } else {
        const prompt = mode==="listen" ? `<p class="muted">Écoutez et écrivez le mot ou l'expression</p><button class="mic" style="background:var(--blue);box-shadow:none" data-say="${esc(w[0])}">🔊</button>`
          : `<p class="muted">Traduisez en français</p><div class="big-fr" style="font-size:26px">${esc(w[1])}</div><p class="small muted">Thème : ${esc(w[3])}</p>`;
        box.innerHTML = `${header}<div class="card stack center">${prompt}
          <input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Votre réponse">
          <div id="acc"></div><button class="btn" id="chk">Vérifier</button><div id="res"></div></div>`;
        $("#acc").appendChild(accentBar($("#ans")));
        if (mode==="listen") setTimeout(()=>TTS.speak(w[0]),200); else $("#ans").focus();
        const check = () => {
          const v = $("#ans").value.trim(); if (!v) return;
          const target = w[0].replace(/\s*\(.*\)/,"");
          const alts = target.split(/\s*\/\s*/);
          const norm = s => words(s).join(" ").replace(/^(le|la|les|l'|un|une|des) /,"");
          const exact = alts.some(a => norm(a)===norm(v));
          const nearly = !exact && alts.some(a => strip(norm(a))===strip(norm(v)));
          $("#chk").remove();
          $("#res").innerHTML = `<div class="feedback ${exact?"ok":nearly?"info":"ko"}">${exact?"Parfait !":nearly?"Presque : attention aux accents.":"Pas tout à fait."}<br><b class="fr" style="font-size:18px">${esc(w[0])}</b> — ${esc(w[1])}<br><span class="small">${esc(w[4])}</span></div>
            ${exact?`<button class="btn green" data-q="2" style="margin-top:10px">Suivant →</button>`:nearly?`<button class="btn" data-q="1" style="margin-top:10px">Suivant →</button>`:`<button class="btn" data-q="0" style="margin-top:10px">Suivant →</button>`}`;
          TTS.speak(w[0]);
          $$("#res [data-q]").forEach(b=>b.onclick=()=>finish(+b.dataset.q));
        };
        $("#chk").onclick = check; $("#ans").onkeydown = e => { if(e.key==="Enter") { e.preventDefault(); ($("#chk")?check():$("#res [data-q]")?.click()); } };
      }
    };
    next();
  }
};
VIEWS.words = () => {
  html(`${top("Mots", "#/vocab")}<div class="seg" id="lv">${LEVELS.map(l=>`<button data-l="${l}" class="${l===S.level?"on":""}">${l}</button>`).join("")}</div><div id="wl"></div>`);
  const show = l => {
    $$("#lv button").forEach(b=>b.classList.toggle("on", b.dataset.l===l));
    const list = VOCAB.filter(w=>w[2]===l);
    $("#wl").innerHTML = `<p class="small muted" style="margin:10px 0">${mastered(l)} maîtrisés · ${learned(l)} vus · ${list.length} au total</p>` + list.map(w=>{
      const b = S.srs[wordId(w)]?.box; const st = b===undefined?"gray":b>=4?"green":b>=2?"":"amber";
      return `<div class="list-item">${speakBtn(w[0])}<span class="grow"><span class="t">${esc(w[0])}</span><br><span class="s">${esc(w[1])}</span></span><span class="pill ${st}">${b===undefined?"—":b>=4?"✓":"·".repeat(b+1)}</span></div>`; }).join("");
  };
  $$("#lv button").forEach(b=>b.onclick=()=>show(b.dataset.l)); show(S.level);
};

/* ----- Grammar ----- */
VIEWS.grammar = (id) => {
  if (id === "mix") return grammarMix();
  if (id) return grammarLesson(id);
  html(`${top("Grammaire")}<p class="muted">Les structures testées au TCF. Réussissez le quiz à 80 % pour valider une leçon.</p>
    <button class="list-item" data-go="#/grammar/mix"><span style="font-size:24px">🔀</span><span class="grow"><span class="t">Révision mixte</span><br><span class="s">10 questions tirées de toutes les leçons jusqu'au niveau ${S.level}</span></span>›</button>` +
    LEVELS.map(l=>`<h3 style="margin:18px 0 4px">${l} ${lvlIdx(l)>lvlIdx(S.level)?'<span class="pill gray">plus tard</span>':""}</h3>` +
    GRAMMAR.filter(g=>g.level===l).map(g=>{ const b=S.grammar[g.id]?.best; return `<button class="list-item" data-go="#/grammar/${g.id}">
      <span class="check ${b>=.8?"done":""}">${b>=.8?"✓":""}</span><span class="grow"><span class="t">${esc(g.title)}</span>${b!==undefined?`<br><span class="s">Meilleur score : ${Math.round(b*100)} %</span>`:""}</span>›</button>`; }).join("")).join(""));
};
function grammarMix(){
  const pool = shuffle(GRAMMAR.filter(g=>upTo(S.level).includes(g.level)).flatMap(g=>g.quiz.map(q=>({q:q[0],opts:q[1],ans:q[2],why:q[3]+" ("+g.title+")"})))).slice(0,10);
  html(`${top("Révision mixte", "#/grammar")}<p class="muted">Dix questions au hasard. Recommencez autant que vous voulez : le tirage change à chaque fois.</p><div id="qz"></div>`);
  quiz($("#qz"), pool, score => { addXP(Math.round(score*12)); markDaily("grammar"); });
}
function grammarLesson(id){
  const g = GRAMMAR.find(x=>x.id===id); if (!g) return VIEWS.grammar();
  html(`${top(esc(g.title), "#/grammar", `<span class="pill">${g.level}</span>`)}
    <div class="card"><p style="font-size:16.5px">${g.summary}</p></div>
    <div class="card" style="margin-top:12px"><h3>Exemples</h3>${g.examples.map(e=>`<div class="ex">${speakBtn(e)}<span class="fr" style="font-size:17px">${esc(e)}</span></div>`).join("")}</div>
    <button class="btn" id="startq" style="margin-top:14px">Faire le quiz (${g.quiz.length} questions)</button><div id="qz"></div>`);
  $("#startq").onclick = () => { $("#startq").remove(); quiz($("#qz"), g.quiz.map(q=>({q:q[0],opts:q[1],ans:q[2],why:q[3]})), score => {
    const prev = S.grammar[g.id]?.best||0; S.grammar[g.id] = {best:Math.max(prev,score), last:today()}; save(); addXP(Math.round(score*10)); markDaily("grammar");
  }); };
}
function quiz(el, items, onDone, {shuffleOpts=true, audio=false}={}){
  items = shuffle(items).map(it => { if(!shuffleOpts) return it; const order = shuffle(it.opts.map((o,k)=>k)); return {...it, opts:order.map(k=>it.opts[k]), ans:order.indexOf(it.ans)}; });
  let i=0, right=0;
  const show = () => {
    if (i>=items.length){ const sc = right/items.length; onDone(sc);
      el.innerHTML = `<div class="card center stack" style="margin-top:14px"><div class="score-ring" style="background:${sc>=.8?"var(--green-soft)":"var(--amber-soft)"};color:${sc>=.8?"var(--green)":"var(--amber)"}">${right}/${items.length}</div>
        <h3>${sc>=.8?"Leçon validée !":"Encore un petit effort"}</h3><button class="btn ${sc>=.8?"":"soft"}" id="again">${sc>=.8?"Refaire":"Réessayer"}</button><button class="btn ghost" data-go="#/grammar">Autres leçons</button></div>`;
      $("#again",el).onclick = () => { i=0; right=0; items=shuffle(items); show(); }; return; }
    const it = items[i];
    el.innerHTML = `<div class="card" style="margin-top:14px"><div class="row between"><span class="pill gray">${i+1}/${items.length}</span>${audio?speakBtn(it.q.replace(/___/g,"…")):""}</div>
      <p class="fr" style="margin-top:10px">${esc(it.q)}</p>${it.opts.map((o,k)=>`<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}<div id="fb"></div></div>`;
    $$(".opt",el).forEach(b=>b.onclick=()=>{
      const k=+b.dataset.k, ok = k===it.ans; if(ok) right++;
      $$(".opt",el).forEach((x,j)=>{ x.disabled=true; if(j===it.ans) x.classList.add("correct"); else if(j===k) x.classList.add("wrong"); });
      const full = it.q.replace("___", it.opts[it.ans]);
      $("#fb",el).innerHTML = `<div class="feedback ${ok?"ok":"ko"}">${ok?"✓ Correct.":"✗ La bonne réponse : <b>"+esc(it.opts[it.ans])+"</b>."} ${esc(it.why||"")}</div>
        <div class="row" style="margin-top:10px">${it.q.includes("___")?speakBtn(full):""}<button class="btn" id="nx">Suivant →</button></div>`;
      $("#nx",el).onclick = () => { i++; show(); };
    });
  };
  show();
}

/* ----- Comprehension (oral + écrit) ----- */
// Shuffle answer options each time so the correct answer isn't always in the same position
const shuffleDoc = x => ({...x, questions: x.questions.map(q => { const order = shuffle(q[1].map((_,k)=>k)); return [q[0], order.map(k=>q[1][k]), order.indexOf(q[2])]; })});
function compList(kind){
  const data = kind==="oral"?ORAL:ECRIT, store = S[kind];
  const left = data.filter(x=>upTo(S.level).includes(x.level) && store[x.id]===undefined).length;
  html(`${top(kind==="oral"?"Compréhension orale":"Compréhension écrite")}
    <p class="muted">${kind==="oral"?"Au TCF, chaque document n'est entendu qu'une fois : essayez d'abord sans réécouter.":"Lisez le document, puis répondez. Au TCF : 39 questions en 60 minutes."} ${left} documents pas encore faits jusqu'au niveau ${S.level}.</p>
    ${S.settings.apiKey ? `<button class="btn soft" id="gen">✨ Nouveau document ${S.level} créé par l'IA</button>` : `<p class="small muted">Astuce : avec une clé API (Réglages), l'IA crée des documents illimités à votre niveau.</p>`}` +
    LEVELS.map(l=>`<h3 style="margin:18px 0 4px">${l}</h3>`+data.filter(x=>x.level===l).map(x=>{ const s=store[x.id];
      return `<button class="list-item" data-go="#/${kind}/${x.id}"><span class="check ${s>=.5?"done":""}">${s>=.5?"✓":""}</span><span class="grow"><span class="t">${x.gen?"✨ ":""}${esc(x.context)}</span><br><span class="s">${x.questions.length} questions${s!==undefined?` · ${Math.round(s*100)} %`:""}</span></span>›</button>`; }).join("")).join(""));
  const g = $("#gen"); if (g) g.onclick = () => generateDoc(kind, g);
}
async function generateDoc(kind, btn){
  btn.disabled = true; btn.textContent = "L'IA écrit un document…";
  const data = kind==="oral"?ORAL:ECRIT;
  const recent = shuffle(data.map(d=>d.context)).slice(0,12).join(", ");
  const len = {A1:"40 to 60",A2:"60 to 90",B1:"100 to 140",B2:"140 to 190"}[S.level];
  const prompt = `Create one ORIGINAL TCF Canada ${kind==="oral"?"listening (compréhension orale) item, written as it would be heard":"reading (compréhension écrite) item"} at CEFR level ${S.level}.
Use a Canadian or Québec everyday, professional or societal context. Pick a different document type and topic from these existing ones: ${recent}.
Return ONLY valid JSON, nothing else:
{"context":"short French label of the document type (e.g. Message vocal, Annonce, Article de presse, Dialogue au travail)","text":"the document in French, ${len} words${kind==="oral"?". For a dialogue, put each line on its own line starting with \"A: \" or \"B: \"":". Use \\n for line breaks if needed"}","questions":[["question in French",["option 1","option 2","option 3","option 4"],0]]}
Write exactly 3 questions testing understanding (main idea, a detail, an inference${S.level==="B2"?" or the author's opinion":""}). Options are short, plausible, in French, with exactly one correct; vary the position of the correct answer (index 0-3).`;
  try {
    const raw = await callClaude("You write accurate, natural French exam material for TCF Canada preparation.", [{role:"user", content:prompt}], 1500);
    const o = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
    if (!o.text || !Array.isArray(o.questions) || !o.questions.length) throw new Error("format");
    o.questions = o.questions.filter(q => Array.isArray(q[1]) && q[1].length>=2 && q[2]>=0 && q[2]<q[1].length);
    const item = {id:"gen-"+kind+"-"+Date.now().toString(36), level:S.level, context:o.context||"Document", text:o.text, questions:o.questions, gen:true};
    S.gen = S.gen || {oral:[], ecrit:[]}; S.gen[kind].push(item); if (S.gen[kind].length>40) S.gen[kind].shift(); save();
    data.push(item); location.hash = "#/"+kind+"/"+item.id;
  } catch(e){ toast("Impossible de créer le document ("+(e.message||"erreur")+"). Réessayez.", 3500); btn.disabled = false; btn.textContent = "✨ Réessayer"; }
}
function compItem(kind, id){
  const data = kind==="oral"?ORAL:ECRIT; const x0 = data.find(d=>d.id===id); if(!x0) return compList(kind);
  const x = shuffleDoc(x0);
  let plays = 0;
  html(`${top(esc(x.context), "#/"+kind, `<span class="pill">${x.level}</span>`)}
    ${kind==="oral" ? `<div class="card center stack">
        <button class="mic" id="play" style="background:var(--blue);box-shadow:0 6px 20px rgba(35,70,201,.3)">▶</button>
        <div class="small muted" id="pc">Appuyez pour écouter</div>
        <div class="row" style="justify-content:center"><button class="btn sm ghost" id="slow">🐢 Plus lent</button><button class="btn sm ghost" id="stop">■ Stop</button></div>
        <p class="small muted">Pas de son ? Vérifiez que le mode silencieux est désactivé.</p></div>`
      : `<div class="card"><div class="passage">${esc(x.text)}</div></div>`}
    <div id="qs"></div><div id="tr"></div>`);
  if (kind==="oral"){
    const play = rate => { plays++; $("#pc").textContent = plays===1?"Écoute n° 1":"Écoute n° "+plays+" (à l'examen : une seule)"; TTS.speak(x.text, {rate, btn:$("#play")}); };
    $("#play").onclick = () => play(); $("#slow").onclick = () => play(0.72); $("#stop").onclick = () => TTS.stop();
  }
  const answers = [];
  $("#qs").innerHTML = x.questions.map((q,qi)=>`<div class="card" style="margin-top:12px" data-qi="${qi}"><p style="font-weight:600">${qi+1}. ${esc(q[0])}</p>
    ${q[1].map((o,k)=>`<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div>`).join("");
  $$("#qs [data-qi]").forEach(card => { const qi=+card.dataset.qi, q=x.questions[qi];
    $$(".opt",card).forEach(b=>b.onclick=()=>{ const k=+b.dataset.k; answers[qi]=k===q[2];
      $$(".opt",card).forEach((o,j)=>{o.disabled=true; if(j===q[2]) o.classList.add("correct"); else if(j===k) o.classList.add("wrong");});
      if (answers.filter(a=>a!==undefined).length===x.questions.length){
        const sc = answers.filter(Boolean).length/x.questions.length; S[kind][x.id]=Math.max(S[kind][x.id]||0,sc); save(); addXP(Math.round(sc*12));
        if (kind==="oral") markDaily("oral");
        $("#tr").innerHTML = `<div class="feedback ${sc>=.5?"ok":"ko"}">Score : ${Math.round(sc*100)} %</div>` +
          (kind==="oral" ? `<details class="card" style="margin-top:12px"><summary>Voir la transcription</summary><div class="passage" style="margin-top:8px">${esc(x.text.replace(/^A: /gm,"— ").replace(/^B: /gm,"— "))}</div></details>` : "") +
          `<button class="btn" style="margin-top:12px" data-go="#/${kind}">Document suivant</button>`;
      }
    }); });
}
VIEWS.oral = id => id ? compItem("oral", id) : compList("oral");
VIEWS.ecrit = id => id ? compItem("ecrit", id) : compList("ecrit");

/* ----- Dictée ----- */
VIEWS.dictee = () => {
  const pool = shuffle(SENTENCES.filter(s=>upTo(S.level).includes(s.level)));
  let i = 0;
  html(`${top("Dictée")}<p class="muted">Écoutez, puis écrivez exactement ce que vous entendez, avec les accents.</p><div id="dz"></div>`);
  const show = () => {
    const s = pool[i % pool.length];
    $("#dz").innerHTML = `<div class="card stack center"><span class="pill">${s.level}</span>
      <div class="row" style="justify-content:center"><button class="mic" style="background:var(--blue);box-shadow:none" data-say="${esc(s.fr)}">🔊</button></div>
      <button class="btn sm ghost" data-say="${esc(s.fr)}" data-rate="0.65" style="margin:0 auto">🐢 Lentement</button>
      <textarea id="dt" style="min-height:110px" autocapitalize="sentences" placeholder="Écrivez ici…"></textarea><div id="acc"></div>
      <button class="btn" id="chk">Vérifier</button><div id="res"></div></div>`;
    $("#acc").appendChild(accentBar($("#dt")));
    setTimeout(()=>TTS.speak(s.fr),200);
    $("#chk").onclick = () => {
      const v = $("#dt").value; if(!v.trim()) return;
      const r = compare(s.fr, v, {accents:true});
      S.dictee.n++; S.dictee.sum += r.score; save(); addXP(Math.round(r.score/10));
      $("#chk").remove();
      $("#res").innerHTML = `<div class="feedback ${r.score>=80?"ok":r.score>=50?"info":"ko"}"><b>${r.score} %</b>${r.acc?` · ${r.acc} erreur(s) d'accent`:""}</div>
        <div class="card" style="text-align:left;margin-top:10px"><div class="fr" style="font-size:18px">${renderTokens(r.tokens)}</div><hr><div class="small muted">Correction</div><div class="fr" style="font-size:18px">${esc(s.fr)}</div></div>
        <button class="btn" id="nx" style="margin-top:10px">Phrase suivante →</button>`;
      $("#nx").onclick = () => { i++; show(); };
    };
  };
  show();
};

/* ----- Pronunciation ----- */
VIEWS.pron = () => {
  const pool = shuffle(SENTENCES.filter(s=>upTo(S.level).includes(s.level)));
  let i = 0, sessionDone = 0;
  const record = score => { S.pron.n++; S.pron.sum += score; save(); addXP(Math.round(score/10)); sessionDone++; if (sessionDone>=3) markDaily("speak"); };
  html(`${top("Prononciation")}<p class="muted">Écoutez le modèle, appuyez sur le micro et répétez. L'enregistrement s'arrête tout seul après une pause, ou appuyez sur ■.</p><div id="pz"></div>`);
  const show = () => {
    const s = pool[i % pool.length];
    $("#pz").innerHTML = `<div class="card stack center">
      <div class="row between"><span class="pill">${s.level}</span><span class="pill gray">${esc(s.focus)}</span></div>
      <p class="fr" style="font-size:22px">${esc(s.fr)}</p>
      <div class="row" style="justify-content:center">${speakBtn(s.fr)}<button class="btn sm ghost" data-say="${esc(s.fr)}" data-rate="0.65">🐢 Lentement</button></div>
      <div id="rc"></div><div id="res"></div>
      <button class="btn ghost" id="skip">Phrase suivante →</button></div>`;
    $("#skip").onclick = () => { i++; show(); };
    recorder($("#rc"), {autoStop:1800, maxSecs:25, onStop:(text) => {
      if (!text){
        $("#res").innerHTML = `<div class="feedback info">Réécoutez-vous et comparez au modèle, puis notez-vous :</div>
          <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;margin-top:8px"><button class="btn sm red" data-self="40">À revoir</button><button class="btn sm soft" data-self="70">Bien</button><button class="btn sm green" data-self="95">Parfait</button></div>`;
        $$("#res [data-self]").forEach(b => b.onclick = () => { record(+b.dataset.self); $("#res").innerHTML = `<div class="feedback ok">Noté. Phrase suivante quand vous voulez.</div>`; });
        return;
      }
      const r = compare(s.fr, text, {accents:false});
      const rx = $("#rc .rx"); if (rx){ rx.hidden = false; rx.innerHTML = renderTokens(r.tokens); }
      record(r.score);
      $("#res").innerHTML = `<div class="feedback ${r.score>=85?"ok":r.score>=60?"info":"ko"}"><b>${r.score} %</b> · ${r.score>=85?"Excellent !":r.score>=60?"Bien. Encore un essai ?":"Écoutez le modèle lentement, puis réessayez."}</div>`;
    }});
  };
  show();
};

/* ----- Expression écrite ----- */
VIEWS.write = (id) => {
  if (!id){
    html(`${top("Expression écrite")}<div class="card small"><b>Format TCF Canada</b> · 60 minutes pour 3 tâches.<br>Tâche 1 : message (60–120 mots) · Tâche 2 : article ou récit (120–150 mots) · Tâche 3 : comparer deux points de vue et donner son avis (120–180 mots).</div>` +
      [1,2,3].map(t=>`<h3 style="margin:18px 0 4px">Tâche ${t}</h3>`+WRITING.filter(w=>w.task===t).map(w=>{ const last=[...S.writing].reverse().find(x=>x.id===w.id);
        return `<button class="list-item" data-go="#/write/${w.id}"><span class="check ${last?"done":""}">${last?"✓":""}</span><span class="grow"><span class="s">${esc(w.prompt.slice(0,110))}…</span>${last?.score!=null?`<br><span class="pill green" style="margin-top:4px">${last.score}/20</span>`:""}</span>›</button>`; }).join("")).join(""));
    return;
  }
  const w = WRITING.find(x=>x.id===id); if(!w) return VIEWS.write();
  const draftKey = "draft-"+w.id; let draft=""; try{ draft = localStorage.getItem(draftKey)||""; }catch(e){}
  html(`${top("Tâche "+w.task, "#/write", `<span class="timer" id="tm">${w.minutes}:00</span>`)}
    <div class="card"><p class="fr" style="font-size:17.5px">${esc(w.prompt)}</p>
    ${w.docs?w.docs.map(d=>`<div class="feedback info" style="color:var(--ink)">${esc(d)}</div>`).join(""):""}
    <details style="margin-top:10px"><summary>Conseils</summary><ul style="margin:6px 0 0;padding-left:20px">${w.tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul></details></div>
    <div class="row between" style="margin-top:14px"><button class="btn sm soft" id="go">⏱ Lancer le chrono (${w.minutes} min)</button><span class="pill gray" id="wc">0 mot</span></div>
    <textarea id="tx" style="margin-top:10px" placeholder="Rédigez votre texte ici…">${esc(draft)}</textarea><div id="acc"></div>
    ${w.model?`<details class="card" style="margin-top:12px"><summary>Voir un exemple de réponse</summary><div class="passage" style="margin-top:8px">${esc(w.model)}</div></details>`:""}
    <div id="gp" style="margin-top:12px"></div>`);
  const tx = $("#tx"); $("#acc").appendChild(accentBar(tx));
  const count = () => { const n = (tx.value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)||[]).length;
    const el=$("#wc"); el.textContent = n+" mot"+(n>1?"s":"")+` · ${w.min}–${w.max}`; el.className = "pill "+(n<w.min?"gray":n<=w.max?"green":"red");
    try{ localStorage.setItem(draftKey, tx.value); }catch(e){} return n; };
  tx.addEventListener("input", count); count();
  let timer=null; $("#go").onclick = () => { let left=w.minutes*60; $("#go").disabled=true; clearInterval(timer);
    timer=setInterval(()=>{ left--; const m=Math.floor(Math.max(0,left)/60), s=Math.max(0,left)%60; $("#tm").textContent=`${m}:${String(s).padStart(2,"0")}`; $("#tm").classList.toggle("warn", left<=60);
      if(left<=0){ clearInterval(timer); toast("Temps écoulé ! Relisez votre texte."); } },1000); };
  onLeave(()=>clearInterval(timer));
  gradingPanel($("#gp"), "write", w, ()=>tx.value, (score, fb) => {
    S.writing.push({id:w.id, task:w.task, date:today(), words:count(), score, text:tx.value.slice(0,3000)}); if (S.writing.length>60) S.writing.shift(); save(); addXP(30);
  });
};

/* ----- Expression orale ----- */
VIEWS.speak = (id) => {
  if (!id){
    html(`${top("Expression orale")}<div class="card small"><b>Format TCF Canada</b> · 12 minutes face à un examinateur.<br>Tâche 1 : entretien dirigé (2 min) · Tâche 2 : interaction, vous posez les questions (5 min 30 dont 2 min de préparation) · Tâche 3 : exprimer un point de vue (4 min 30).</div>
      <button class="list-item" data-go="#/talk"><span style="font-size:24px">💬</span><span class="grow"><span class="t">Conversation avec l'IA</span><br><span class="s">Une vraie discussion, à l'oral ou à l'écrit, avec corrections</span></span>›</button>` +
      [1,2,3].map(t=>`<h3 style="margin:18px 0 4px">Tâche ${t}</h3>`+SPEAKING.filter(s=>s.task===t).map(s=>{ const last=[...S.speaking].reverse().find(x=>x.id===s.id);
        return `<button class="list-item" data-go="#/speak/${s.id}"><span class="check ${last?"done":""}">${last?"✓":""}</span><span class="grow"><span class="s">${esc(s.prompt.slice(0,110))}${s.prompt.length>110?"…":""}</span>${last?.score!=null?`<br><span class="pill green" style="margin-top:4px">${last.score}/20</span>`:""}</span>›</button>`; }).join("")).join(""));
    return;
  }
  const t = SPEAKING.find(x=>x.id===id); if(!t) return VIEWS.speak();
  html(`${top("Tâche "+t.task, "#/speak", `<span class="timer" id="tm">${fmt(t.prep||t.seconds)}</span>`)}
    <div class="card"><p class="fr" style="font-size:17.5px">${esc(t.prompt)}</p>${speakBtn(t.prompt)}
    <details style="margin-top:10px"><summary>Conseils</summary><ul style="margin:6px 0 0;padding-left:20px">${t.tips.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details>
    ${t.questions?`<details style="margin-top:6px"><summary>Exemples de questions</summary><ul style="margin:6px 0 0;padding-left:20px">${t.questions.map(x=>`<li class="fr" style="font-size:16px">${esc(x)}</li>`).join("")}</ul></details>`:""}</div>
    ${t.task===2?`<button class="list-item" data-go="#/talk/eo-${t.id}"><span style="font-size:22px">💬</span><span class="grow"><span class="t">Faire cette tâche avec l'IA</span><br><span class="s">L'IA joue l'examinateur et vous répond vraiment</span></span>›</button>`:""}
    <div class="card center stack" style="margin-top:12px" id="stage">
      ${t.prep?`<div id="prepbox" class="stack"><p class="muted">Préparation : ${t.prep/60} min. Notez vos idées.</p><textarea id="notes" style="min-height:90px" placeholder="Vos notes…"></textarea>
        <button class="btn" id="prep">Lancer la préparation</button><button class="btn ghost" id="skip">Passer et parler</button></div>`
        :`<p class="muted" id="pre">Vous avez ${fmt(t.seconds)}. Le chrono démarre quand vous appuyez sur le micro.</p>`}
      <div id="rc" ${t.prep?"hidden":""}></div>
    </div>
    <div id="after"></div>`);
  let timer = null;
  onLeave(() => clearInterval(timer));
  const countdown = (secs, onEnd) => { let left = secs; clearInterval(timer); $("#tm").textContent = fmt(left);
    timer = setInterval(() => { left--; const el=$("#tm"); if(!el) return clearInterval(timer); el.textContent = fmt(Math.max(0,left)); el.classList.toggle("warn", left<=20); if (left<=0){ clearInterval(timer); onEnd(); } }, 1000); };
  const showRec = () => { const pb = $("#prepbox"); if (pb) pb.querySelector("#prep")?.remove(), pb.querySelector("#skip")?.remove(); $("#rc").hidden = false; $("#tm").textContent = fmt(t.seconds); $("#tm").classList.remove("warn"); };
  recorder($("#rc"), {maxSecs: t.seconds + 5,
    onStart: () => { const p=$("#pre"); if(p) p.remove(); countdown(t.seconds, () => { if (Mic.on) Mic.finish(); }); },
    onStop: (text, secs) => { clearInterval(timer); results(text, secs); }});
  const pb = $("#prep"); if (pb) pb.onclick = () => { pb.remove(); $("#skip").textContent = "J'ai fini, je parle"; countdown(t.prep, () => { showRec(); toast("À vous ! Appuyez sur le micro."); }); };
  const sk = $("#skip"); if (sk) sk.onclick = () => { clearInterval(timer); showRec(); };
  const results = (text, secs) => {
    const wc = (text.match(/\p{L}+/gu)||[]).length; const wpm = secs ? Math.round(wc/(secs/60)) : 0;
    const fillers = (text.toLowerCase().match(/\b(euh+|heu+|bah|ben|genre|du coup|en fait|tu vois)\b/g)||[]).length;
    $("#after").innerHTML = `<div class="card stack" style="margin-top:12px"><h3>Terminé · ${fmt(secs)}</h3>
      <div class="grid2" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><b>${wc}</b><span>mots</span></div><div class="stat"><b>${wpm}</b><span>mots/min</span></div><div class="stat"><b>${fillers}</b><span>hésitations</span></div></div>
      <p class="small muted">Transcription (corrigez-la si besoin, ou dictez avec le micro du clavier) :</p>
      <textarea id="ft" style="min-height:140px">${esc(text)}</textarea>
      <button class="btn ghost" data-go="#/speak/${t.id}">↻ Recommencer</button></div><div id="gp" style="margin-top:12px"></div>`;
    gradingPanel($("#gp"), "speak", t, () => $("#ft").value, score => { S.speaking.push({id:t.id, task:t.task, date:today(), score, words:wc}); if(S.speaking.length>60) S.speaking.shift(); save(); addXP(30); });
    addXP(10); markDaily("speak");
    $("#after").scrollIntoView({behavior:"smooth"});
  };
};

/* ----- AI conversation ----- */
const LEVEL_STYLE = {
  A1:"avec des phrases très courtes et très simples, au présent, avec le vocabulaire de base",
  A2:"avec des phrases simples et courtes, au présent, au passé composé et au futur proche, avec un vocabulaire courant",
  B1:"avec des phrases naturelles de longueur moyenne, des temps variés et quelques connecteurs",
  B2:"de façon naturelle et nuancée, avec des connecteurs logiques, le subjonctif et le conditionnel quand c'est naturel"};
function convFor(id){
  if (id && id.startsWith("eo-")){ const t = SPEAKING.find(x=>x.id===id.slice(3)); if (t) return {id, level:S.level, emoji:"🎙️", title:"TCF · tâche 2",
    role:"l'examinateur du TCF Canada qui joue le personnage décrit dans la consigne et répond aux questions du candidat avec des détails concrets", situation:t.prompt,
    goal:"Poser des questions variées et pertinentes pour obtenir les informations", opener:"Bonjour ! Je vous écoute, posez-moi vos questions."}; }
  return CONVOS.find(c=>c.id===id);
}
function claudePrompt(c){
  return `Jouons une conversation en français pour m'entraîner au TCF Canada. Mon niveau est ${S.level}.
Ton rôle : ${c.role}.
Situation : ${c.situation}
Mon objectif : ${c.goal}.
Règles : parle uniquement en français, ${LEVEL_STYLE[S.level]}. Réponds en 1 à 3 phrases et relance-moi avec une question. Si je fais une erreur, ajoute à la fin une ligne « ✎ » avec ma phrase corrigée. Quand je dis « fin », fais un bilan : note sur 20, niveau CECR estimé, mes 3 erreurs principales et 5 mots utiles.
Commence maintenant en disant : « ${c.opener} »`;
}
async function openInClaude(c){
  const p = claudePrompt(c);
  window.open("https://claude.ai/new?q="+encodeURIComponent(p), "_blank");
  try { await navigator.clipboard.writeText(p); } catch(e){}
}
VIEWS.talk = id => id ? talkChat(id) : talkList();
function talkList(){
  const key = !!S.settings.apiKey;
  const order = [S.level, ...LEVELS.filter(l=>l!==S.level)];
  const done = id => (S.convos||[]).filter(x=>x.id===id).length;
  html(`${top("Conversation IA")}
    <p class="muted">Discutez avec une IA qui joue un rôle. Elle parle à votre niveau (${S.level}), corrige vos phrases et propose des idées de réponse. Parlez avec le micro ou écrivez.</p>
    ${key ? "" : `<div class="card stack small"><b>Deux façons de discuter</b>
      <div>💬 <b>Dans Parlons</b> : ajoutez une clé API Anthropic dans Réglages. Compter quelques centimes par conversation.</div>
      <div>🆓 <b>Gratuit</b> : touchez « Claude ↗ » sur un scénario. L'app Claude s'ouvre avec le jeu de rôle prêt ; utilisez son mode vocal pour parler.</div>
      <button class="btn sm soft" data-go="#/settings">Ajouter une clé API</button></div>`}
    ${order.map(l => `<h3 style="margin:18px 0 4px">${l}${l===S.level?' <span class="pill">votre niveau</span>':""}</h3>` + CONVOS.filter(c=>c.level===l).map(c => `
      <div class="list-item" style="cursor:default;flex-wrap:wrap"><span style="font-size:24px">${c.emoji}</span>
        <span class="grow"><span class="t">${esc(c.title)}</span>${done(c.id)?` <span class="pill green">✓ ${done(c.id)}</span>`:""}<br><span class="s">${esc(c.goal)}</span></span>
        <span class="row" style="gap:8px;width:100%;padding-left:36px">${key?`<button class="btn sm" style="flex:1" data-go="#/talk/${c.id}">💬 Parler</button>`:""}<button class="btn sm ghost" style="flex:1" data-claude="${c.id}">App Claude ↗</button></span></div>`).join("")).join("")}`);
  $$("[data-claude]").forEach(b => b.onclick = () => openInClaude(convFor(b.dataset.claude)));
}
async function callClaude(system, messages, max_tokens=700){
  const r = await fetch("https://api.anthropic.com/v1/messages", {method:"POST", headers:{"content-type":"application/json","x-api-key":S.settings.apiKey,
    "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body: JSON.stringify({model:S.settings.model, max_tokens, system, messages})});
  if (!r.ok){ let m = r.status+""; try { const j = await r.json(); m += " " + (j.error?.message||""); } catch(e){} throw new Error(m); }
  const j = await r.json(); return j.content.map(c=>c.text||"").join("");
}
function parseTurn(txt){
  try { const m = txt.match(/\{[\s\S]*\}/); const o = JSON.parse(m[0]); if (o && o.reply) return o; } catch(e){}
  return {reply: txt.replace(/```(json)?/g,"").trim(), translation:"", correction:"", note:"", suggestions:[]};
}
function talkChat(id){
  const c = convFor(id); if (!c) return talkList();
  if (!S.settings.apiKey){
    html(`${top(c.emoji+" "+esc(c.title), "#/talk")}<div class="card stack"><p>${esc(c.situation)}</p>
      <p class="small muted">La conversation dans Parlons utilise votre propre clé API Anthropic. Sans clé, faites-la gratuitement dans l'app Claude avec le mode vocal.</p>
      <button class="btn" id="oc">Ouvrir dans Claude ↗</button><button class="btn ghost" data-go="#/settings">Ajouter une clé API</button></div>`);
    $("#oc").onclick = () => openInClaude(c); return;
  }
  const fbLang = S.settings.fbLang==="fr" ? "français" : "anglais";
  const sys = `Tu joues un rôle dans une conversation de pratique orale avec un apprenant de français de niveau ${S.level} (CECR) qui prépare le TCF Canada.
Ton rôle : ${c.role}.
Situation : ${c.situation}
Objectif de l'apprenant : ${c.goal}.
Règles :
- Parle uniquement en français, ${LEVEL_STYLE[S.level]}.
- Réponds en 1 à 3 phrases, de façon naturelle et chaleureuse, puis relance avec une question pour faire parler l'apprenant.
- Reste dans ton rôle et invente des détails concrets et cohérents.
- Les messages de l'apprenant viennent souvent de la reconnaissance vocale : ignore la ponctuation et les majuscules manquantes.
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format :
{"reply":"ta réplique en français","translation":"traduction de ta réplique en anglais","correction":"le dernier message de l'apprenant corrigé et rendu naturel, ou une chaîne vide s'il était déjà correct","note":"explication très courte, en ${fbLang}, de l'erreur principale, ou une chaîne vide","suggestions":["deux ou trois réponses courtes que l'apprenant pourrait dire ensuite, à son niveau"]}`;
  const opener = {reply:c.opener, translation:"", correction:"", note:"", suggestions:[]};
  const history = [{role:"user", content:"(Début de la conversation. Commence.)"}, {role:"assistant", content:JSON.stringify(opener)}];
  const log = [{role:"ai", text:c.opener}];
  let busy = false, turns = 0, autoSpeak = S.settings.autoSpeak !== false;
  html(`<div class="top"><button class="back" data-go="#/talk" aria-label="Retour">‹</button><h2 style="font-size:19px">${c.emoji} ${esc(c.title)}</h2>
      <button class="btn sm ghost" id="as" title="Lecture automatique">${autoSpeak?"🔊":"🔇"}</button><button class="btn sm soft" id="end">Bilan</button></div>
    <div class="small muted" style="margin:-6px 2px 10px">${esc(c.situation)}</div>
    <div id="chat" class="chat"></div><div id="sugg" class="chips"></div><div id="fb"></div>
    <div class="composer"><div id="rc"></div><textarea id="msg" rows="1" placeholder="Écrivez, ou appuyez sur 🎤 et parlez…"></textarea><button class="btn sm" id="send" aria-label="Envoyer">➤</button></div>`);
  const chat = $("#chat"), msg = $("#msg");
  const scroll = () => { const last = chat.lastElementChild; last && last.scrollIntoView({block:"end", behavior:"smooth"}); };
  const aiBubble = t => { const d = document.createElement("div"); d.className = "bubble ai";
    d.innerHTML = `<div class="fr">${esc(t.reply)}</div><div class="tools">${speakBtn(t.reply)}${t.translation?`<button class="btn sm ghost tr">EN</button>`:""}</div>${t.translation?`<div class="small muted trx" hidden>${esc(t.translation)}</div>`:""}`;
    const tr = d.querySelector(".tr"); if (tr) tr.onclick = () => { const x = d.querySelector(".trx"); x.hidden = !x.hidden; };
    chat.appendChild(d); scroll(); return d; };
  const meBubble = text => { const d = document.createElement("div"); d.className = "bubble me"; d.innerHTML = `<div>${esc(text)}</div>`; chat.appendChild(d); scroll(); return d; };
  const suggest = list => { $("#sugg").innerHTML = (list||[]).slice(0,3).map(s=>`<button class="chip">${esc(s)}</button>`).join("");
    $$("#sugg .chip").forEach(b => b.onclick = () => { msg.value = b.textContent; msg.focus(); grow(); }); };
  const grow = () => { msg.style.height = "auto"; msg.style.height = Math.min(140, msg.scrollHeight)+"px"; };
  msg.addEventListener("input", grow);
  aiBubble(opener); if (autoSpeak) TTS.speak(c.opener);
  suggest(S.level==="A1"||S.level==="A2" ? ["Bonjour !", "Oui, merci.", "Pouvez-vous répéter, s'il vous plaît ?"] : []);
  $("#as").onclick = () => { autoSpeak = !autoSpeak; S.settings.autoSpeak = autoSpeak; save(); $("#as").textContent = autoSpeak?"🔊":"🔇"; if (!autoSpeak) TTS.stop(); };
  const send = async () => {
    const text = msg.value.trim(); if (!text || busy) return;
    busy = true; msg.value = ""; grow(); $("#sugg").innerHTML = ""; TTS.stop();
    const me = meBubble(text); log.push({role:"me", text}); history.push({role:"user", content:text}); turns++;
    const typing = document.createElement("div"); typing.className = "bubble ai typing"; typing.innerHTML = "<span></span><span></span><span></span>"; chat.appendChild(typing); scroll();
    try {
      const raw = await callClaude(sys, history, 700);
      const t = parseTurn(raw); typing.remove();
      history.push({role:"assistant", content:JSON.stringify(t)}); log.push({role:"ai", text:t.reply});
      if (t.correction && t.correction.trim().toLowerCase().replace(/[^\p{L}]/gu,"") !== text.toLowerCase().replace(/[^\p{L}]/gu,""))
        me.insertAdjacentHTML("beforeend", `<div class="corr">✎ ${esc(t.correction)}${t.note?`<div class="small">${esc(t.note)}</div>`:""}</div>`);
      aiBubble(t); suggest(t.suggestions); addXP(3);
      if (autoSpeak) TTS.speak(t.reply);
    } catch(e){ typing.remove(); history.pop(); log.pop(); turns--; msg.value = text; grow(); toast("Erreur de l'API : "+e.message.slice(0,80), 4000); }
    busy = false;
  };
  $("#send").onclick = send;
  msg.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } });
  recorder($("#rc"), {compact:true, autoStop:2000, maxSecs:90,
    onLive: t => { msg.value = t; grow(); },
    onStop: (text, secs, heard) => { if (text){ msg.value = text; grow(); send(); }
      else toast(heard ? "Je vous ai entendu, mais pas compris. Réessayez, ou utilisez la dictée du clavier." : "Aucun son capté. Vérifiez le micro, ou écrivez votre message.", 3800); }});
  $("#end").onclick = async () => {
    if (turns < 2) return toast("Échangez au moins deux messages avant le bilan.");
    if (busy) return; busy = true; TTS.stop(); if (Mic.on) Mic.stop();
    const b = $("#end"); b.disabled = true; b.textContent = "…";
    const transcript = log.map(m => (m.role==="me"?"Apprenant : ":"Interlocuteur : ")+m.text).join("\n");
    const lang = S.settings.fbLang==="fr" ? "French" : "English (keep all corrections and examples in French)";
    const prompt = `Here is a French speaking-practice conversation. Learner's target level: ${S.level} (TCF Canada). Scenario: ${c.title} — ${c.situation}

${transcript}

Evaluate ONLY the learner's messages (they may come from speech recognition, so ignore punctuation and capitalisation). Respond in ${lang}. Format exactly:
SCORE: <0-20>/20 · CECR: <A1–C2>
## What went well
## Errors to fix (quote → correction → why)
## 5 useful words or phrases for this situation
## Next goal`;
    try {
      const res = await callClaude("You are a warm, precise TCF Canada speaking examiner.", [{role:"user", content:prompt}], 1500);
      const m = res.match(/SCORE:\s*(\d{1,2})/i); const score = m ? +m[1] : null;
      S.convos = S.convos || []; S.convos.push({id:c.id, date:today(), turns, score}); if (S.convos.length>100) S.convos.shift(); save();
      addXP(15 + Math.min(turns, 10)*2); markDaily("speak");
      $("#fb").innerHTML = `<div class="card stack" style="margin-top:12px"><h3>Bilan${score!=null?` · ${score}/20`:""}</h3><div class="grade-box">${mdLite(res)}</div>
        <div class="row"><button class="btn sm soft" data-go="#/talk/${c.id}">↻ Recommencer</button><button class="btn sm ghost" data-go="#/talk">Autres scénarios</button></div></div>`;
      $("#fb").scrollIntoView({behavior:"smooth"});
    } catch(e){ toast("Erreur de l'API : "+e.message.slice(0,80), 4000); }
    b.disabled = false; b.textContent = "Bilan"; busy = false;
  };
}

/* ----- Mock exam ----- */
VIEWS.exam = () => {
  const hist = S.exams.slice(-5).reverse();
  html(`${top("Examen blanc")}
    <div class="card stack"><p>Deux épreuves chronométrées comme au TCF, avec des documents de difficulté croissante (A1 → B2).</p>
    <div class="list-item" style="cursor:default"><span>🎧</span><span class="grow"><span class="t">Compréhension orale</span><br><span class="s">≈ 12 questions · 12 min · une seule écoute</span></span></div>
    <div class="list-item" style="cursor:default"><span>📖</span><span class="grow"><span class="t">Compréhension écrite</span><br><span class="s">≈ 12 questions · 18 min</span></span></div>
    <button class="btn" id="go">Commencer l'examen</button>
    <p class="small muted">Le score sur 699 et le niveau NCLC sont des estimations pour suivre vos progrès, pas une note officielle.</p></div>
    ${hist.length?`<h3 style="margin:18px 0 6px">Historique</h3>`+hist.map(e=>`<div class="list-item" style="cursor:default"><span class="grow"><span class="t">${e.date}</span><br><span class="s">CO ${e.co}/699 (NCLC ${e.nco}) · CE ${e.ce}/699 (NCLC ${e.nce})</span></span><span class="pill">${e.cefr}</span></div>`).join(""):""}
    <hr><h3>Écrit et oral</h3><p class="small muted">Pour simuler les épreuves de production, enchaînez les tâches 1, 2 et 3 en respectant le chrono.</p>
    <div class="row"><button class="btn sm soft" data-go="#/write">📝 Expression écrite</button><button class="btn sm soft" data-go="#/speak">🎙️ Expression orale</button></div>`);
  $("#go").onclick = () => runExam();
};
function pickExamItems(data, target){
  const out=[]; let n=0;
  for (const l of LEVELS){ const items = shuffle(data.filter(d=>d.level===l)); let k=0; while(k<items.length && n < target*(lvlIdx(l)+1)/4){ out.push(items[k]); n+=items[k].questions.length; k++; } }
  return out;
}
function runExam(){
  const parts = [{kind:"oral",label:"Compréhension orale",items:pickExamItems(ORAL,12),secs:12*60},{kind:"ecrit",label:"Compréhension écrite",items:pickExamItems(ECRIT,12),secs:18*60}];
  const res = {oral:[],ecrit:[]}; let p=0, timer=null;
  onLeave(()=>clearInterval(timer));
  const W = {A1:1,A2:2,B1:3,B2:4};
  const startPart = () => {
    if (p>=parts.length) return results();
    const part = parts[p]; let it=0, left=part.secs;
    app.innerHTML = `${top(part.label, "#/exam", `<span class="timer" id="tm">${fmt(left)}</span>`)}<div id="ez"></div>`;
    clearInterval(timer); timer=setInterval(()=>{ left--; $("#tm").textContent=fmt(Math.max(0,left)); $("#tm").classList.toggle("warn",left<=60); if(left<=0){ clearInterval(timer); toast("Temps écoulé"); p++; startPart(); } },1000);
    const showItem = () => {
      if (it>=part.items.length){ clearInterval(timer); p++; TTS.stop();
        app.innerHTML = `<div class="card center stack" style="margin-top:30px"><h2>${part.label} terminée</h2>${p<parts.length?`<button class="btn" id="nx">Épreuve suivante →</button>`:`<button class="btn" id="nx">Voir mes résultats</button>`}</div>`;
        $("#nx").onclick = startPart; return; }
      const x = shuffleDoc(part.items[it]); const qsAnswered = [];
      $("#ez").innerHTML = `<span class="pill gray">Document ${it+1}/${part.items.length}</span> <span class="pill">${esc(x.context)}</span>
        ${part.kind==="oral"?`<div class="card center" style="margin-top:10px"><button class="mic" id="pl" style="background:var(--blue);box-shadow:none">▶</button><div class="small muted" id="pc">Une seule écoute</div></div>`:`<div class="card" style="margin-top:10px"><div class="passage">${esc(x.text)}</div></div>`}
        ${x.questions.map((q,qi)=>`<div class="card" style="margin-top:10px" data-qi="${qi}"><p style="font-weight:600">${esc(q[0])}</p>${q[1].map((o,k)=>`<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div>`).join("")}
        <button class="btn" id="nxt" style="margin-top:12px" disabled>Suivant →</button>`;
      if (part.kind==="oral"){ let used=false; $("#pl").onclick=()=>{ if(used) return; used=true; $("#pl").disabled=true; $("#pl").style.opacity=.4; $("#pc").textContent="Écoute en cours…"; TTS.speak(x.text,{onend:()=>$("#pc").textContent="Répondez aux questions"}); }; }
      $$("#ez [data-qi]").forEach(card=>{ const qi=+card.dataset.qi;
        $$(".opt",card).forEach(b=>b.onclick=()=>{ $$(".opt",card).forEach(o=>o.style.borderColor=""); b.style.borderColor="var(--blue)"; qsAnswered[qi]=+b.dataset.k;
          if (qsAnswered.filter(v=>v!==undefined).length===x.questions.length) $("#nxt").disabled=false; }); });
      $("#nxt").onclick = () => { x.questions.forEach((q,qi)=>res[part.kind].push({ok:qsAnswered[qi]===q[2], w:W[x.level]})); TTS.stop(); it++; showItem(); window.scrollTo(0,0); };
    };
    showItem();
  };
  const toScore = arr => { const tot=arr.reduce((a,b)=>a+b.w,0)||1, got=arr.filter(a=>a.ok).reduce((a,b)=>a+b.w,0); return Math.round(100 + 500*got/tot); };
  const nclc = (sc, tbl) => { for (const [min,n] of tbl) if (sc>=min) return n; return sc>=300?"< 4":"—"; };
  const cefr = sc => sc>=600?"C2":sc>=500?"C1":sc>=400?"B2":sc>=300?"B1":sc>=200?"A2":"A1";
  const results = () => {
    const co=toScore(res.oral), ce=toScore(res.ecrit); const e={date:today(),co,ce,nco:nclc(co,NCLC.co),nce:nclc(ce,NCLC.ce),cefr:cefr(Math.round((co+ce)/2))};
    S.exams.push(e); save(); addXP(50);
    app.innerHTML = `${top("Résultats", "#/exam")}<div class="card center stack"><div class="confetti">📊</div><h2>Niveau estimé : ${e.cefr}</h2>
      <div class="grid2"><div class="card"><div class="stat"><span>Compréhension orale</span><b>${co}</b><span>/699 · ${cefr(co)} · NCLC ${e.nco}</span></div></div>
      <div class="card"><div class="stat"><span>Compréhension écrite</span><b>${ce}</b><span>/699 · ${cefr(ce)} · NCLC ${e.nce}</span></div></div></div>
      <p class="small muted">${res.oral.filter(a=>a.ok).length}/${res.oral.length} bonnes réponses à l'oral, ${res.ecrit.filter(a=>a.ok).length}/${res.ecrit.length} à l'écrit. Ce test ne va pas au-delà du B2, donc 600 est le maximum.</p>
      <button class="btn" data-go="#/home">Retour à l'accueil</button></div>`;
  };
  startPart();
}

/* ----- Votre quartier ----- */
const isNight = () => { const h = new Date().getHours(); return h < 7 || h >= 19; };
function cityCard(){
  const st = cityStage(S.xp);
  const seen = S.citySeen === undefined ? st : S.citySeen;
  const fresh = st > seen ? st : -1;
  S.citySeen = st; save();
  const next = CITY[st+1];
  const pct = next ? Math.round((S.xp - CITY[st].xp) / (next.xp - CITY[st].xp) * 100) : 100;
  return `${fresh >= 0 ? `<div class="feedback ok center" style="margin:0 0 10px">🎉 Nouveau : <b>${esc(CITY[st].name)}</b> ${CITY[st].emoji}</div>` : ""}
  <button class="card city" data-go="#/ville">
    ${citySVG(st, {night:isNight(), fresh, flag:S.streak>=3})}
    <div style="padding:12px 14px 14px">
      <div class="row between"><b style="font-family:var(--serif);font-size:17px">Votre quartier</b><span class="pill gray">${st+1}/${CITY.length}</span></div>
      <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      <div class="small muted" style="margin-top:6px">${next ? `${next.xp - S.xp} XP avant : ${next.emoji} ${esc(next.name)}` : "Quartier terminé. Magnifique !"}</div>
    </div>
  </button>`;
}
VIEWS.ville = () => {
  const st = cityStage(S.xp);
  html(`${top("Votre quartier")}
    <div class="card city" style="cursor:default">${citySVG(st, {night:isNight(), flag:S.streak>=3})}</div>
    <p class="muted" style="margin:12px 2px">Chaque XP gagné construit votre quartier parisien. Révisez, écoutez, écrivez, parlez : la ville grandit avec votre français.${S.streak>=3?" Le drapeau flotte tant que votre série dépasse 3 jours.":" Gardez une série de 3 jours pour hisser le drapeau."}</p>
    ${CITY.map((c,i)=>{ const done = i<=st; return `<div class="list-item" style="cursor:default;${done?"":"opacity:.55"}">
      <span style="font-size:24px;${done?"":"filter:grayscale(1)"}">${done?c.emoji:"🔒"}</span>
      <span class="grow"><span class="t">${esc(c.name)}</span><br><span class="s">${done?esc(c.desc):c.xp+" XP"}</span></span>
      ${done?'<span class="check done">✓</span>':`<span class="pill gray">${c.xp-S.xp} XP</span>`}</div>`; }).join("")}
    <div class="card small" style="margin-top:12px"><b>Comment gagner de l'XP</b><br>Carte de vocabulaire +2 · Quiz de grammaire jusqu'à +10 · Document compris jusqu'à +12 · Séance du jour complète +20 · Tâche écrite ou orale +30 · Examen blanc +50</div>`);
};

/* ----- Progress ----- */
VIEWS.progress = () => {
  const last14 = [...Array(14)].map((_,k)=>{ const d=new Date(Date.now()-(13-k)*DAY); const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); return {d, xp:S.days[key]||0}; });
  const mx = Math.max(20, ...last14.map(x=>x.xp));
  const avg = a => a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10 : "—";
  html(`${top("Progrès")}
    <div class="card"><div class="grid2" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><b>🔥 ${S.streak}</b><span>jours de suite</span></div><div class="stat"><b>${S.xp}</b><span>XP total</span></div><div class="stat"><b>${mastered()}</b><span>mots maîtrisés</span></div></div></div>
    <button class="list-item" data-go="#/ville"><span style="font-size:24px">${CITY[cityStage(S.xp)].emoji}</span><span class="grow"><span class="t">Votre quartier</span><br><span class="s">Étape ${cityStage(S.xp)+1}/${CITY.length} · ${esc(CITY[cityStage(S.xp)].name)}</span></span>›</button>
    <div class="card" style="margin-top:12px"><h3>14 derniers jours</h3>
      <div style="display:flex;align-items:flex-end;gap:5px;height:90px;margin-top:12px">${last14.map(x=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;height:${Math.max(3,x.xp/mx*70)}px;background:${x.xp?"var(--blue)":"var(--line)"};border-radius:5px"></div><span style="font-size:10px" class="muted">${x.d.getDate()}</span></div>`).join("")}</div></div>
    <div class="card" style="margin-top:12px"><h3>Niveaux</h3>${LEVELS.map(l=>`<div style="margin-top:12px"><div class="row between"><b>${l}</b><span class="small muted">${levelProgress(l)} %</span></div><div class="bar green" style="margin-top:6px"><i style="width:${levelProgress(l)}%"></i></div></div>`).join("")}</div>
    <div class="card" style="margin-top:12px"><h3>Compétences</h3>
      <div class="list-item" style="cursor:default">🎧<span class="grow">Compréhension orale</span><b>${Object.keys(S.oral).length}/${ORAL.length}</b></div>
      <div class="list-item" style="cursor:default">📖<span class="grow">Compréhension écrite</span><b>${Object.keys(S.ecrit).length}/${ECRIT.length}</b></div>
      <div class="list-item" style="cursor:default">✍️<span class="grow">Dictée (moyenne)</span><b>${S.dictee.n?Math.round(S.dictee.sum/S.dictee.n)+" %":"—"}</b></div>
      <div class="list-item" style="cursor:default">🗣️<span class="grow">Prononciation (moyenne)</span><b>${S.pron.n?Math.round(S.pron.sum/S.pron.n)+" %":"—"}</b></div>
      <div class="list-item" style="cursor:default">📝<span class="grow">Expression écrite</span><b>${avg(S.writing.filter(w=>w.score!=null).map(w=>w.score))}/20</b></div>
      <div class="list-item" style="cursor:default">🎙️<span class="grow">Expression orale</span><b>${avg(S.speaking.filter(w=>w.score!=null).map(w=>w.score))}/20</b></div>
    </div>
    ${S.exams.length?`<div class="card" style="margin-top:12px"><h3>Dernier examen blanc</h3><p>${(e=>`${e.date} · CO ${e.co} · CE ${e.ce} · <b>${e.cefr}</b>`)(S.exams[S.exams.length-1])}</p></div>`:""}`);
};

/* ----- Settings ----- */
VIEWS.settings = () => {
  const vs = TTS.load();
  html(`${top("Réglages")}
    <div class="card stack"><h3>Niveau et objectif</h3>
      <div class="seg" id="lv">${LEVELS.map(l=>`<button data-l="${l}" class="${l===S.level?"on":""}">${l}</button>`).join("")}</div>
      <label class="small muted">Date de votre TCF</label><input type="text" id="ed" placeholder="AAAA-MM-JJ" value="${esc(S.examDate)}" inputmode="numeric">
      <label class="small muted">Nouveaux mots par jour</label><select id="np">${[5,8,10,15,20].map(n=>`<option ${n==S.settings.newPerDay?"selected":""}>${n}</option>`).join("")}</select>
    </div>
    <div class="card stack" style="margin-top:12px"><h3>Apparence</h3>
      <div class="seg" id="th"><button data-v="auto" class="${(S.settings.theme||"auto")==="auto"?"on":""}">Auto</button><button data-v="light" class="${S.settings.theme==="light"?"on":""}">☀️ Clair</button><button data-v="dark" class="${S.settings.theme==="dark"?"on":""}">🌙 Sombre</button></div>
      <p class="small muted">Auto suit le mode sombre de votre téléphone.</p>
    </div>
    <div class="card stack" style="margin-top:12px"><h3>Micro</h3>
      <label class="row between"><span>Transcription en direct</span><input type="checkbox" id="trs" ${S.settings.transcript!==false?"checked":""}></label>
      <p class="small muted">Si le micro bloque, désactivez-la : l'app enregistre quand même votre voix pour que vous puissiez vous réécouter.</p>
      <label class="row between"><span>Lire les réponses de l'IA à voix haute</span><input type="checkbox" id="asp" ${S.settings.autoSpeak!==false?"checked":""}></label>
      <details><summary>Tester le micro</summary><p class="small muted">Dites une phrase. La barre bouge si le micro vous entend.</p><div id="mt"></div></details>
    </div>
    <div class="card stack" style="margin-top:12px"><h3>Voix</h3>
      ${vs.length?`<select id="vc">${vs.map(v=>`<option value="${esc(v.name)}" ${v.name===S.settings.voice?"selected":""}>${esc(v.name)} (${v.lang})</option>`).join("")}</select>`:`<p class="small muted">Aucune voix française détectée. Sur iPhone : Réglages › Accessibilité › Contenu énoncé › Voix › Français, et téléchargez une voix « améliorée ».</p>`}
      <label class="small muted">Vitesse : <span id="rv">${S.settings.rate}</span></label><input type="range" id="rt" min="0.6" max="1.2" step="0.05" value="${S.settings.rate}" style="width:100%">
      <button class="btn soft" data-say="Bonjour ! Je suis votre professeur de français. On commence ?">🔊 Tester la voix</button>
      <p class="small muted">Pas de son sur iPhone ? Désactivez le mode silencieux (interrupteur sur le côté).</p>
      <label class="small muted">Accent pour la reconnaissance vocale</label>
      <div class="seg" id="rl"><button data-v="fr-FR" class="${S.settings.recLang==="fr-FR"?"on":""}">France</button><button data-v="fr-CA" class="${S.settings.recLang==="fr-CA"?"on":""}">Canada</button></div>
    </div>
    <div class="card stack" style="margin-top:12px"><h3>Correction par l'IA</h3>
      <p class="small muted">Sans clé, la correction s'ouvre dans l'app Claude (gratuit avec votre abonnement). Avec une clé API, elle est instantanée et l'IA joue l'examinateur en tâche 2 orale. La clé reste sur ce téléphone.</p>
      <input type="password" id="ak" placeholder="sk-ant-…" value="${esc(S.settings.apiKey)}" autocomplete="off">
      <select id="md">${["claude-sonnet-5-5","claude-haiku-5-5","claude-opus-5-5"].map(m=>`<option ${m===S.settings.model?"selected":""}>${m}</option>`).join("")}</select>
      <label class="small muted">Langue des explications</label>
      <div class="seg" id="fl"><button data-v="en" class="${S.settings.fbLang==="en"?"on":""}">English</button><button data-v="fr" class="${S.settings.fbLang==="fr"?"on":""}">Français</button></div>
    </div>
    <div class="card stack" style="margin-top:12px"><h3>Sauvegarde</h3>
      <p class="small muted">Votre progression est stockée sur ce téléphone. Exportez-la de temps en temps.</p>
      <div class="row"><button class="btn soft sm" id="ex">⬇ Exporter</button><label class="btn soft sm" style="margin:0">⬆ Importer<input type="file" id="im" accept="application/json,.json" hidden></label><button class="btn sm ghost" id="rs" style="color:var(--red)">Réinitialiser</button></div>
    </div>
    <div class="card stack" style="margin-top:12px"><h3>Installer l'app</h3>
      <p class="small">iPhone : ouvrez ce site dans Safari › bouton Partager › <b>Sur l'écran d'accueil</b>.<br>Android : Chrome › menu ⋮ › <b>Installer l'application</b>.</p></div>
    <p class="center small muted" style="margin-top:16px">Parlons v2.0 · ${VOCAB.length} mots · ${GRAMMAR.length} leçons · ${ORAL.length+ECRIT.length} documents · ${CONVOS.length} conversations</p>`);
  $$("#lv button").forEach(b=>b.onclick=()=>{ S.level=b.dataset.l; save(); $$("#lv button").forEach(x=>x.classList.toggle("on",x===b)); toast("Niveau : "+S.level); });
  $("#ed").onchange = e => { const v=e.target.value.trim(); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return toast("Format : 2027-03-15"); S.examDate=v; save(); toast("Date enregistrée"); };
  $("#np").onchange = e => { S.settings.newPerDay=+e.target.value; save(); };
  const vc=$("#vc"); if(vc) vc.onchange = e => { S.settings.voice=e.target.value; save(); TTS.speak("Voici ma voix."); };
  $("#rt").oninput = e => { S.settings.rate=+e.target.value; $("#rv").textContent=S.settings.rate; save(); };
  $$("#th button").forEach(b=>b.onclick=()=>{ S.settings.theme=b.dataset.v; save(); applyTheme(); $$("#th button").forEach(x=>x.classList.toggle("on",x===b)); });
  $("#trs").onchange = e => { S.settings.transcript = e.target.checked; save(); };
  $("#asp").onchange = e => { S.settings.autoSpeak = e.target.checked; save(); };
  recorder($("#mt"), {autoStop:2000, maxSecs:15, onStop:(t, secs, heard) => toast(t ? "✓ Le micro fonctionne." : heard ? "Le micro vous entend, mais la transcription ne marche pas. Désactivez-la ci-dessus." : "Aucun son capté. Autorisez le micro pour Safari.", 4000)});
  $$("#rl button").forEach(b=>b.onclick=()=>{ S.settings.recLang=b.dataset.v; save(); $$("#rl button").forEach(x=>x.classList.toggle("on",x===b)); });
  $$("#fl button").forEach(b=>b.onclick=()=>{ S.settings.fbLang=b.dataset.v; save(); $$("#fl button").forEach(x=>x.classList.toggle("on",x===b)); });
  $("#ak").onchange = e => { S.settings.apiKey=e.target.value.trim(); save(); toast(S.settings.apiKey?"Clé enregistrée":"Clé supprimée"); };
  $("#md").onchange = e => { S.settings.model=e.target.value; save(); };
  $("#ex").onclick = async () => {
    const data = JSON.stringify({...S, settings:{...S.settings, apiKey:""}}, null, 1);
    const file = new File([data], `parlons-${today()}.json`, {type:"application/json"});
    if (navigator.canShare && navigator.canShare({files:[file]})) { try { await navigator.share({files:[file], title:"Sauvegarde Parlons"}); return; } catch(e){ if (e.name==="AbortError") return; } }
    const a=document.createElement("a"); a.href=URL.createObjectURL(file); a.download=file.name; a.click();
  };
  $("#im").onchange = e => { const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); if(!d.srs) throw 0; const key=S.settings.apiKey; S=Object.assign(structuredClone(DEFAULT), d); S.settings=Object.assign(structuredClone(DEFAULT.settings), d.settings||{}, {apiKey:key}); save(); toast("Progression importée"); route(); }catch(err){ toast("Fichier invalide"); } }; r.readAsText(f); };
  $("#rs").onclick = () => { if (confirm("Effacer toute votre progression ? Cette action est définitive.")) { localStorage.removeItem(LKEY); location.hash="#/onboard"; location.reload(); } };
};

/* ---------------- Boot ---------------- */
if (S.gen){ (S.gen.oral||[]).forEach(x=>ORAL.push(x)); (S.gen.ecrit||[]).forEach(x=>ECRIT.push(x)); }
if (S.settings.newPerDay === 8) { S.settings.newPerDay = 10; save(); }
function applyTheme(){ const t = S.settings.theme || "auto"; if (t==="auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const dark = t==="dark" || (t==="auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#0F1424" : "#16213E"; }
applyTheme(); try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch(e){}
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
route();
})();
