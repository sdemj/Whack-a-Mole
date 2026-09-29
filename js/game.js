"use strict";

const AUDIO_DIR = "audio_260824";

const DIFFICULTIES = {
  /* exposure = 올라와 있는 시간, maxUp = 동시에 올라와 있는 최대 마릿수(칸은 6개) */
  easy:{label:"쉬움",exposure:7000,maxUp:6},
  normal:{label:"보통",exposure:5000,maxUp:5},
  hard:{label:"어려움",exposure:3000,maxUp:4}
};
const BASE_TIME = 100;   /* 10문제 제한 시간 100초 */
const TOTAL_ROUNDS = 10;
const SPELLING_BONUS = 5; /* 철자 익히기에서 철자를 정확히 입력하면 주는 보너스 */

/* 뜻이 비슷해 함께 보기로 나오면 정답이 둘처럼 보이는 단어 묶음.
   이 중 하나가 문제로 나오면 같은 묶음의 다른 단어는 오답 보기로 쓰지 않는다. */
const SIMILAR_WORD_GROUPS = [
  ["cap","hat"],
  ["nice","kind","good"],
  ["class","lesson"],
  ["ship","boat"],
  ["slim","thin"],
  ["small","short"],
  ["big","large"],
  ["happy","glad"],
  ["watch","see","look"],
  ["talk","say","tell"],
  ["bag","backpack"],
  ["meat","beef"],
  ["down","under","bottom"],
  ["back","behind"]
];
const SIMILAR_WORD_MAP = new Map();
SIMILAR_WORD_GROUPS.forEach(group=>{
  group.forEach(word=>{
    const key=word.toLowerCase();
    const set=SIMILAR_WORD_MAP.get(key)||new Set();
    group.forEach(other=>{if(other.toLowerCase()!==key)set.add(other.toLowerCase())});
    SIMILAR_WORD_MAP.set(key,set);
  });
});

const state = {
  screen:"intro",
  categoryIndex:null,
  selectedSubs:new Set(),
  mode:"word",
  difficulty:"normal",
  questions:[],
  results:[],
  currentIndex:0,
  score:0,
  streak:0,
  maxStreak:0,
  currentWrongHits:0,
  timeLeft:BASE_TIME,
  elapsed:0,
  bonusScore:0,
  wrongHitCount:0,
  paused:false,
  lock:false,
  gameActive:false,
  timerId:null,
  lastTick:0,
  options:[],
  sfxOn:true,
  bgmOn:true,
  resumeAfterHelp:false,
  afterHelp:null,
  taskToken:0
};

const delayedTasks = new Set();
function delay(callback, milliseconds){
  const token=state.taskToken;
  const id=setTimeout(()=>{delayedTasks.delete(id);if(token===state.taskToken)callback()},milliseconds);
  delayedTasks.add(id);
  return id;
}
function clearDelayedTasks(){
  state.taskToken++;
  delayedTasks.forEach(clearTimeout);
  delayedTasks.clear();
}

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const screens = {
  intro:$("#introScreen"), category:$("#categoryScreen"), sub:$("#subScreen"),
  settings:$("#settingsScreen"), game:$("#gameScreen"), result:$("#resultScreen")
};

/* ================= 공통 유틸 ================= */
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function sample(arr,n){return shuffle(arr).slice(0,n)}
function escapeHtml(text){
  return String(text).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}
function selectedPool(){
  const cat=WORD_BANK[state.categoryIndex];
  if(!cat)return[];
  const pool=[];
  cat.subcategories.forEach((sub,i)=>{
    if(state.selectedSubs.has(i)){
      sub.words.forEach(w=>pool.push({...w,subcategory:sub.name,category:cat.ko}));
    }
  });
  return pool;
}

/* ================= 게임 진행 ================= */
function createQuestions(){
  const pool=selectedPool();
  return sample(pool,Math.min(TOTAL_ROUNDS,pool.length));
}
function startGame(){
  clearConfetti();
  stopGameLoops();stopWordAudio();clearDelayedTasks();
  state.questions=createQuestions();
  state.results=state.questions.map(word=>({word,status:"pending",wrongHits:0,spellingBonus:false}));
  state.currentIndex=0;state.score=0;state.streak=0;state.maxStreak=0;state.currentWrongHits=0;
  state.timeLeft=BASE_TIME;state.elapsed=0;state.bonusScore=0;state.wrongHitCount=0;
  state.paused=false;state.lock=false;state.gameActive=true;state.lastTick=performance.now();state.afterHelp=null;
  preloadQuestionAudio();
  showScreen("game");startTimer();renderQuestion();
}
/* How to Play를 보는 동안에는 시간이 줄지 않는다 */
function isHelpOpen(){
  return $("#helpModal").classList.contains("open");
}
function startTimer(){
  clearInterval(state.timerId);
  state.lastTick=performance.now();
  state.timerId=setInterval(()=>{
    if(!state.gameActive||state.paused||isHelpOpen()){state.lastTick=performance.now();return}
    const now=performance.now();
    const delta=(now-state.lastTick)/1000;
    state.lastTick=now;
    state.timeLeft=Math.max(0,state.timeLeft-delta);
    state.elapsed+=delta;
    updateHud();
    if(state.timeLeft<=0)finishGame(false);
  },100);
}
function stopGameLoops(){
  if(state.timerId){clearInterval(state.timerId);state.timerId=null}
  clearDelayedTasks();
}
function pauseGame(){
  state.paused=true;
  clearDelayedTasks();
}
function resumeGame(){
  state.paused=false;state.lastTick=performance.now();
  if(state.gameActive)startMoleShow();
}
function updateHud(){
  $("#roundStat").textContent=`${Math.min(state.currentIndex+1,TOTAL_ROUNDS)}/${TOTAL_ROUNDS}`;
  $("#scoreStat").textContent=state.score.toLocaleString();
  $("#streakStat").textContent=state.streak;
  $("#timeStat").textContent=state.timeLeft.toFixed(1);
  $("#timeStat").classList.toggle("timer-danger",state.timeLeft<=10);
  $("#progressBar").style.width=`${(state.currentIndex/TOTAL_ROUNDS)*100}%`;
}
/* 대소문자만 다른 단어는 오답이라고 보기 어려우므로 선지로 만들지 않는다 */
function makeSpellingVariants(word,count=5){
  const variants=new Set();
  const lower=word.toLowerCase();
  const alphabet="abcdefghijklmnopqrstuvwxyz";
  const add=v=>{
    if(!v||v.length===0)return;
    if(v===word)return;
    if(v.toLowerCase()===lower)return;
    variants.add(v);
  };
  const idx=[...word].map((c,i)=>/[A-Za-z]/.test(c)?i:-1).filter(i=>i>=0);
  if(idx.length>=2){
    for(let k=0;k<idx.length-1;k++){
      const a=[...word],i=idx[k],j=idx[k+1];[a[i],a[j]]=[a[j],a[i]];add(a.join(""));
    }
  }
  idx.forEach(i=>add(word.slice(0,i)+word.slice(i+1)));
  idx.forEach(i=>{
    const ch=word[i];
    const repl=alphabet[(alphabet.indexOf(ch.toLowerCase())+7+Math.floor(Math.random()*10))%26];
    add(word.slice(0,i)+(ch===ch.toUpperCase()?repl.toUpperCase():repl)+word.slice(i+1));
  });
  idx.forEach(i=>add(word.slice(0,i)+word[i]+word.slice(i)));
  let guard=0;
  while(variants.size<count && guard<160){
    guard++;
    if(!idx.length){add(word+"x");continue}
    const i=idx[Math.floor(Math.random()*idx.length)];
    const repl=alphabet[Math.floor(Math.random()*alphabet.length)];
    add(word.slice(0,i)+repl+word.slice(i+1));
  }
  return sample([...variants],count);
}
function buildOptions(word){
  if(state.mode==="spelling"){
    const variants=makeSpellingVariants(word.en,5);
    /* 철자 변형을 5개까지 못 만든 짧은 단어는 다른 단어로 자리를 채운다 */
    if(variants.length<5){
      const taken=new Set([word.en.toLowerCase(),...variants.map(v=>v.toLowerCase())]);
      for(const w of shuffle(selectedPool())){
        if(variants.length>=5)break;
        if(taken.has(w.en.toLowerCase()))continue;
        taken.add(w.en.toLowerCase());variants.push(w.en);
      }
    }
    return shuffle([{text:word.en,correct:true},...variants.map(text=>({text,correct:false}))]);
  }
  const excluded=new Set([word.en.toLowerCase(),...(SIMILAR_WORD_MAP.get(word.en.toLowerCase())||[])]);
  /* 뜻이 겹치는 단어(예: ship/boat "배", watch/see "보다")는 오답으로 내지 않는다 */
  const meanings=ko=>ko.split(",").map(s=>s.trim()).filter(Boolean);
  const answerMeanings=new Set(meanings(word.ko));
  const pool=selectedPool().filter(w=>!excluded.has(w.en.toLowerCase())&&!meanings(w.ko).some(m=>answerMeanings.has(m)));
  const distractors=[];
  for(const w of shuffle(pool)){
    if(!distractors.some(d=>d.text===w.en)){distractors.push({text:w.en,correct:false})}
    if(distractors.length===5)break;
  }
  return shuffle([{text:word.en,correct:true},...distractors]);
}
function moleMarkup(option,index){
  /* 그리는 순서대로 뒤 → 앞: 두더지 · 흙더미 · 단어 카드. 버튼은 맨 앞에서 클릭만 받는다
     (버튼을 맨 앞에 두면 두더지·카드가 버튼 안에 들어가지 못해, 흙더미를 사이에 끼울 수 없다) */
  return `<div class="mole-slot">
    <button type="button" class="mole-button" data-index="${index}" data-correct="${option.correct}" aria-label="${escapeHtml(option.text)}"></button>
    <img class="mole-back" src="img/mole.png" alt="두더지" loading="lazy">
    <img class="mound" src="img/dirt-mound.png" alt="" aria-hidden="true">
    <span class="slot-no" aria-hidden="true">${index+1}</span>
    <div class="card-front">
      <div class="word-card"><span class="wb-text">${escapeHtml(option.text)}</span></div>
    </div>
  </div>`;
}
function ensureMoleSlots(){
  const grid=$("#moleGrid");
  if(grid.children.length===6)return;
  grid.innerHTML=Array.from({length:6},(_,index)=>moleMarkup({text:"",correct:false},index)).join("");
  grid.addEventListener("click",event=>{
    const button=event.target.closest(".mole-button");
    if(!button||!grid.contains(button)||!button.classList.contains("visible"))return;
    const option=state.options[Number(button.dataset.optionIndex)];
    if(option)hitMole(button,option);
  });
}
function fitAllWordBoards(){
  $$(".word-card").forEach(board => {
    const textEl = board.querySelector(".wb-text");
    if (!textEl) return;
    const style = window.getComputedStyle(board);
    const paddingLeft = parseFloat(style.paddingLeft) || 8;
    const paddingRight = parseFloat(style.paddingRight) || 8;
    const availWidth = Math.max(10, board.clientWidth - paddingLeft - paddingRight);
    if (availWidth <= 0) return;
    let fontSize = 30;
    textEl.style.fontSize = fontSize + "px";
    textEl.style.whiteSpace = "nowrap";
    while (textEl.offsetWidth > availWidth && fontSize > 8) {
      fontSize -= 0.5;
      textEl.style.fontSize = fontSize + "px";
    }
  });
}
function renderQuestion(){
  if(state.currentIndex>=state.questions.length){finishGame(true);return}
  const word=state.questions[state.currentIndex];
  state.currentWrongHits=0;state.lock=false;
  if($("#questionModeLabel"))$("#questionModeLabel").textContent=state.mode==="word"?"단어 익히기":"철자 익히기";
  $("#questionWord").textContent=word.ko;
  if($("#questionInstruction"))$("#questionInstruction").textContent=state.mode==="word"?"우리말 뜻에 맞는 영어 단어를 잡으세요!":"철자가 정확한 영어 단어를 잡으세요!";
  state.options=buildOptions(word);
  updateHud();startMoleShow();
}
/* ===== 두더지 등장: 칸마다 따로 오르내린다 =====
   규칙 ① 동시에 올라와 있는 두더지는 최대 4마리
        ② 지금 올라와 있거나 내려가는 중인 두더지가 든 단어는 다시 고르지 않는다(같은 단어가 겹치지 않게)
        ③ 단어는 완전히 내려간 뒤에만 바꾼다
        ④ 정답이 3초 넘게 안 보이면 다음 두더지는 반드시 정답을 든다
   시간 예약은 전부 delay()로 — 화면을 나가거나 창을 열면 한꺼번에 취소된다 */
const SPAWN_MIN = 400, SPAWN_MAX = 1200; /* 다음 두더지가 올라오기까지(밀리초) */
const DUCK_MS = 320;                     /* 내려가는 데 걸리는 시간 (CSS와 맞춤) */
const CORRECT_GAP = 2000;                /* 정답이 이만큼 안 보이면 다음 차례는 정답 (자리가 없으면 한 마리를 먼저 내려보낸다) */
let correctLastShown = 0;
const lastSlotOf = new Map();    /* 단어 → 직전에 올라왔던 칸 */
const lastShownAt = new Map();   /* 단어 → 마지막으로 올라온 시각 */

function moleButtons(){return $$(".mole-button",$("#moleGrid"))}
function molePhase(button){return button.dataset.phase||"down"}   /* down · up · ducking */

/* 새 문제를 시작하거나, 창을 닫고 게임으로 돌아올 때 */
function startMoleShow(){
  ensureMoleSlots();
  moleButtons().forEach(button=>{
    button.classList.remove("visible","ducking","correct","wrong");
    button.dataset.phase="down";
    button.dataset.correct="false";
    delete button.dataset.optionIndex;
    button.setAttribute("aria-label","");
    button.closest(".mole-slot").querySelector(".wb-text").textContent="";
  });
  correctLastShown=performance.now();
  lastSlotOf.clear();lastShownAt.clear();
  /* 내려가 있는 모습을 브라우저가 한 번 그리게 한 뒤에 올려야 '올라오는 동작'이 보인다.
     바로 올리면 내려간 상태를 거치지 않아 이미 올라와 있는 채로 시작한 것처럼 보인다 */
  void $("#moleGrid").offsetWidth;
  scheduleSpawn(160);
}
function scheduleSpawn(ms){
  delay(()=>{
    if(!state.gameActive||state.paused)return;
    /* 한 번 실패해도 다음 예약은 반드시 건다 — 예약이 끊기면 두더지가 영영 안 올라온다 */
    try{spawnMole()}finally{scheduleSpawn(SPAWN_MIN+Math.random()*(SPAWN_MAX-SPAWN_MIN))}
  },ms);
}
function spawnMole(){
  const buttons=moleButtons();
  const busy=buttons.filter(b=>molePhase(b)!=="down");
  const free=buttons.filter(b=>molePhase(b)==="down");
  const taken=new Set(busy.map(b=>Number(b.dataset.optionIndex)));
  if(state.options.some((o,i)=>o.correct&&taken.has(i)))correctLastShown=performance.now();
  const pool=state.options.filter((o,i)=>!taken.has(i));
  const correct=pool.find(o=>o.correct);
  const overdue=performance.now()-correctLastShown>CORRECT_GAP;
  if(busy.length>=DIFFICULTIES[state.difficulty].maxUp||!free.length){
    /* 정답이 오래 안 보였는데 자리가 없으면, 가장 오래 올라와 있던 오답을 먼저 내려보내 자리를 만든다 */
    if(overdue&&correct){
      const oldest=busy.filter(b=>molePhase(b)==="up"&&b.dataset.correct!=="true")
        .sort((a,b)=>Number(a.dataset.upAt||0)-Number(b.dataset.upAt||0))[0];
      if(oldest)duckMole(oldest);
    }
    return;
  }
  if(!pool.length)return;
  /* 오래 안 나온 단어부터 고른다(앞쪽 절반 중 무작위) — 같은 단어만 계속 나오지 않게 */
  const waited=pool.slice().sort((a,b)=>(lastShownAt.get(a.text)||0)-(lastShownAt.get(b.text)||0));
  const head=waited.slice(0,Math.max(1,Math.ceil(waited.length/2)));
  const option=(overdue&&correct)?correct:head[Math.floor(Math.random()*head.length)];
  /* 직전에 있던 칸은 피한다. 피할 칸이 없으면(빈 칸이 하나뿐이면) 다른 두더지도 하나 내려보내 다음 번에 자리가 섞이게 한다 */
  const elsewhere=free.filter(b=>b!==lastSlotOf.get(option.text));
  const button=elsewhere.length?elsewhere[Math.floor(Math.random()*elsewhere.length)]:free[0];
  if(!elsewhere.length){
    const others=busy.filter(b=>molePhase(b)==="up"&&b.dataset.correct!=="true")
      .sort((a,b)=>Number(a.dataset.upAt||0)-Number(b.dataset.upAt||0));
    if(others.length>1)duckMole(others[0]);
  }
  lastSlotOf.set(option.text,button);
  lastShownAt.set(option.text,performance.now());
  setMoleOption(button,option);
  button.dataset.phase="up";
  button.dataset.upAt=String(performance.now());
  button.classList.remove("ducking","correct","wrong");
  button.classList.add("visible");
  fitAllWordBoards();
  if(option.correct)correctLastShown=performance.now();
  delay(()=>duckMole(button),DIFFICULTIES[state.difficulty].exposure);
}
function duckMole(button){
  if(molePhase(button)!=="up")return;
  button.dataset.phase="ducking";
  button.classList.remove("visible");
  button.classList.add("ducking");
  delay(()=>{
    button.dataset.phase="down";
    button.classList.remove("ducking","correct","wrong");
    button.dataset.correct="false";
    delete button.dataset.optionIndex;   /* 단어는 완전히 내려간 뒤에만 비운다 */
  },DUCK_MS);
}
function setMoleOption(button,option){
  button.dataset.optionIndex=String(state.options.indexOf(option));
  button.dataset.correct=String(option.correct);
  button.setAttribute("aria-label",option.text);
  /* 단어 카드는 버튼 밖(흙더미 앞)에 있으므로 같은 칸에서 찾는다 */
  button.closest(".mole-slot").querySelector(".wb-text").textContent=option.text;
}

function hitMole(button,option){
  if(state.lock||state.paused||!state.gameActive)return;
  state.lock=true;
  const result=state.results[state.currentIndex];
  const word=state.questions[state.currentIndex];
  if(option.correct){
    button.classList.add("correct");
    state.score+=10;
    state.streak++;
    state.maxStreak=Math.max(state.maxStreak,state.streak);
    result.status="correct";result.wrongHits=state.currentWrongHits;
    let bonusText="+10 정답!";
    if(state.streak%3===0){
      state.score+=5;
      state.bonusScore+=5;
      bonusText="+10 정답 · 3연속 보너스 +5점!";
      showToast(bonusText,"bonus",1450);
    }else showToast(bonusText,"good",850);
    updateHud();
    /* 정답을 맞히면 그 단어의 발음을 들려준다. 듣는 동안에는 타이머를 멈춘다. */
    pauseGame();
    const afterAudio=()=>{
      if(!state.gameActive)return;
      if(isHelpOpen()){state.afterHelp=afterAudio;return}
      if(state.mode==="spelling"){openSpellModal();return}
      state.paused=false;state.lastTick=performance.now();
      setTimeout(nextQuestion,280);
    };
    playSfx("correct");
    playWordAudio(word,afterAudio);
  }else{
    button.classList.add("wrong");
    playSfx("wrong");
    state.score=Math.max(0,state.score-3);
    state.streak=0;state.currentWrongHits++;state.wrongHitCount++;
    showToast("-3 오답! 다시 찾아보세요.","bad",850);
    updateHud();
    delay(()=>{state.lock=false;duckMole(button)},520);
  }
}
function nextQuestion(){
  if(!state.gameActive)return;
  state.currentIndex++;
  $("#progressBar").style.width=`${(state.currentIndex/TOTAL_ROUNDS)*100}%`;
  if(state.currentIndex>=TOTAL_ROUNDS)finishGame(true);else renderQuestion();
}
function openSpellModal(){
  if(!state.gameActive)return;
  const word=state.questions[state.currentIndex];
  $("#spellKo").textContent=word.ko;
  $("#caseNotice").textContent="";
  $("#spellInput").value="";$("#spellFeedback").textContent="";
  $("#spellInput").classList.remove("error");
  $("#spellModal").classList.add("open");
  delay(()=>$("#spellInput").focus(),80);
}
function closeSpellModal(resume=false){
  $("#spellModal").classList.remove("open");
  if(resume&&state.gameActive)resumeGame();
}
function submitSpelling(){
  const word=state.questions[state.currentIndex];
  if(!word)return;
  const raw=$("#spellInput").value.trim();
  const correct=raw===word.en;
  if(correct){
    playSfx("correct");
    /* 철자 보너스: How to Play의 점수 규칙과 맞춘다 (확인 버튼을 여러 번 눌러도 한 번만 준다) */
    if(!state.results[state.currentIndex].spellingBonus){
      state.results[state.currentIndex].spellingBonus=true;
      state.score+=SPELLING_BONUS;state.bonusScore+=SPELLING_BONUS;
    }
    $("#spellFeedback").style.color="var(--good)";$("#spellFeedback").textContent="정확해요!";
    showToast(`참 잘했어요! 철자 보너스 +${SPELLING_BONUS}점`,"bonus",900);updateHud();
    delay(()=>{closeSpellModal(false);state.paused=false;state.lastTick=performance.now();nextQuestion()},650);
  }else{
    playSfx("wrong");
    $("#spellFeedback").style.color="var(--bad)";
    $("#spellFeedback").textContent="철자와 띄어쓰기, 대소문자를 다시 확인하세요.";
    const input=$("#spellInput");input.classList.remove("error");void input.offsetWidth;input.classList.add("error");input.select();
  }
}
function skipSpelling(){
  closeSpellModal(false);state.paused=false;state.lastTick=performance.now();nextQuestion();
}
function finishGame(completed){
  if(!state.gameActive)return;
  state.gameActive=false;stopGameLoops();stopWordAudio();
  state.paused=false;state.lock=true;
  closeSpellModal(false);
  $("#toastLayer").innerHTML="";
  playSfx("complete");
  renderResults(completed);showScreen("result");launchConfetti();
}
function renderResults(completed){
  const correct=state.results.filter(r=>r.status==="correct").length;
  $("#resultTitle").textContent=completed?`${TOTAL_ROUNDS}문제 완료!`:"시간 종료!";
  $("#resultMessage").textContent=completed
    ? `${WORD_BANK[state.categoryIndex].ko} 단어를 끝까지 연습했습니다.`
    : `${correct}문제를 해결했습니다. 남은 문제는 다음 도전에서 다시 만나 보세요.`;
  $("#finalScore").textContent=state.score.toLocaleString();
  $("#correctKpi").textContent=`${correct}/${TOTAL_ROUNDS}`;
  $("#timeKpi").textContent=`${state.elapsed.toFixed(1)}초`;
  $("#streakKpi").textContent=state.maxStreak;
  $("#bonusKpi").textContent=`+${state.bonusScore}점`;
  $("#answerList").innerHTML=state.results.map((r,i)=>{
    const ok=r.status==="correct";
    const meta=ok
      ? `${r.wrongHits?`오답 ${r.wrongHits}회 · `:""}${r.spellingBonus?"철자 확인 완료":"완료"}`
      :"시간 내 미완료";
    return `<div class="answer-row ${ok?"ok":"pending"}">
      <div class="answer-mark">${ok?"○":"×"}</div>
      <div class="answer-word"><div class="answer-word-line"><strong>${i+1}. ${escapeHtml(r.word.en)}</strong>
      <button type="button" class="answer-audio-button" data-result-index="${i}" title="${escapeHtml(r.word.en)} 발음 듣기" aria-label="${escapeHtml(r.word.en)} 발음 듣기">🔊</button>
      </div><small>${escapeHtml(r.word.ko)}</small></div>
      <div class="answer-meta">${meta}</div>
    </div>`;
  }).join("");
}

/* ================= 축하 색종이 (화면을 벗어나면 즉시 정리) ================= */
let confettiPieces=[];
function clearConfetti(){
  confettiPieces.forEach(p=>{if(p&&p.remove)p.remove()});
  confettiPieces=[];
}
function launchConfetti(){
  clearConfetti();
  const colors=["#ef9fbe","#9d7bc6","#79c9e7","#8bd5a8","#ffd36d"];
  for(let i=0;i<42;i++){
    const p=document.createElement("span");p.className="confetti-piece";
    /* 무대(#app) 기준 위치. document.body에 붙이면 무대가 줄어들어도
       진짜 화면 전체(vw) 기준으로 떨어져 무대와 따로 논다 */
    p.style.left=Math.random()*100+"%";p.style.background=colors[i%colors.length];
    p.style.setProperty("--dur",(2.8+Math.random()*2.5)+"s");
    p.style.setProperty("--rot",(Math.random()*360)+"deg");
    p.style.setProperty("--drift",(-80+Math.random()*160)+"px");
    p.style.animationDelay=(Math.random()*.8)+"s";
    $("#app").appendChild(p);
    confettiPieces.push(p);
    delay(()=>{
      p.remove();
      const at=confettiPieces.indexOf(p);
      if(at>=0)confettiPieces.splice(at,1);
    },6000);
  }
}
