"use strict";

/* 아이콘 글꼴(FontAwesome)을 못 불러온 환경에서도 버튼이 비어 보이지 않도록 대체 문자를 쓴다 */
let iconFontReady=true;
function setIcon(el,faClass,fallbackText){
  if(!el)return;
  if(iconFontReady){el.textContent="";el.className=faClass}
  else{el.className="";el.textContent=fallbackText}
}
function checkIconFont(){
  /* document.fonts.check()는 CDN 스타일시트가 막혀 글꼴이 아예 등록되지 않았을 때도 true를 돌려주므로,
     실제로 등록된 Font Awesome 글꼴이 불러와졌는지(또는 불러오는 중인지)로 판단한다 */
  try{
    if(document.fonts&&typeof document.fonts.forEach==="function"){
      let usable=false;
      document.fonts.forEach(face=>{
        if(/Font Awesome 6 Free/i.test(face.family)&&(face.status==="loaded"||face.status==="loading"))usable=true;
      });
      iconFontReady=usable;
    }else iconFontReady=true;
  }catch(e){iconFontReady=true}
  if(!iconFontReady){
    const fallback={"nav-home-btn":"HOME","nav-back-btn":"BACK","nav-forward-btn":"NEXT","nav-htp-btn":"HELP"};
    Object.keys(fallback).forEach(id=>{
      const btn=$("#"+id);
      if(btn)btn.textContent=fallback[id];
    });
  }
  syncAudioButtons();
  updateFullscreenIcon();
}
function syncAudioButtons(){
  setIcon($("#sfx-toggle-icon"),state.sfxOn?"fa-solid fa-bell":"fa-solid fa-bell-slash",state.sfxOn?"ON":"OFF");
  setIcon($("#music-toggle-icon"),state.bgmOn?"fa-solid fa-music":"fa-solid fa-volume-xmark",state.bgmOn?"ON":"OFF");
}

/* ================= 전체화면 ================= */
function getFullscreenElement(){
  return document.fullscreenElement || document.webkitFullscreenElement;
}
function toggleFullscreen(){
  const el=document.documentElement;
  if(!getFullscreenElement()){
    const request=el.requestFullscreen||el.webkitRequestFullscreen;
    if(request){
      const result=request.call(el);
      if(result&&result.catch)result.catch(()=>{});
    }
  }else{
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    if(exit)exit.call(document);
  }
}
function updateFullscreenIcon(){
  const on=!!getFullscreenElement();
  setIcon($("#fullscreen-toggle-icon"),on?"fa-solid fa-compress":"fa-solid fa-expand",on?"🗗":"⛶");
}
document.addEventListener("fullscreenchange",updateFullscreenIcon);
document.addEventListener("webkitfullscreenchange",updateFullscreenIcon);

/* ================= 화면 전환 ================= */
function showScreen(name){
  clearDelayedTasks();
  if(name!=="result")clearConfetti();
  Object.values(screens).forEach(s=>s.classList.remove("active"));
  screens[name].classList.add("active");
  state.screen=name;
  screens[name].scrollTop=0;
  hideWordPreview();
  setBgmForScreen(name);
  syncAudioButtons();
  updateNavButtonStates();
}

/* ================= 상단 네비게이션(홈/뒤로/앞으로) ================= */
const NAV_SCREEN_IDS = ["introScreen","categoryScreen","subScreen","settingsScreen","gameScreen","resultScreen"];
const SCREEN_ID_TO_KEY = {
  introScreen:"intro",categoryScreen:"category",subScreen:"sub",
  settingsScreen:"settings",gameScreen:"game",resultScreen:"result"
};
function getCurrentScreenId(){
  for(const id of NAV_SCREEN_IDS){
    const el=document.getElementById(id);
    if(el&&el.classList.contains("active"))return id;
  }
  return "introScreen";
}
function navHome(){
  if(getCurrentScreenId()==="introScreen")return;
  goHome();
}
function navBack(){
  switch(getCurrentScreenId()){
    case "categoryScreen": showScreen("intro"); break;
    case "subScreen": showScreen("category"); break;
    case "settingsScreen": showScreen("sub"); break;
    case "gameScreen": exitGameToSettings(); break;
    case "resultScreen": updateSettingsSummary(); showScreen("settings"); break;
    default: break;
  }
}
function navForward(){
  switch(getCurrentScreenId()){
    case "introScreen": enterCategoryScreen(); break;
    case "subScreen": if(!$("#toSettingsBtn").disabled){updateSettingsSummary();showScreen("settings")} break;
    case "settingsScreen": startGame(); break;
    default: break;
  }
}
function canGoForward(){
  const id=getCurrentScreenId();
  if(id==="introScreen"||id==="settingsScreen")return true;
  if(id==="subScreen")return !$("#toSettingsBtn").disabled;
  return false;
}
function updateNavButtonStates(){
  const isFirst=getCurrentScreenId()==="introScreen";
  const forwardOk=canGoForward();
  const setState=(btn,disabled)=>{
    if(!btn)return;
    btn.disabled=disabled;
    btn.style.opacity=disabled?"0.35":"1";
    btn.style.pointerEvents=disabled?"none":"";
  };
  setState($("#nav-home-btn"),isFirst);
  setState($("#nav-back-btn"),isFirst);
  setState($("#nav-forward-btn"),!forwardOk);
}

/* ================= 화면별 로직 ================= */
function enterCategoryScreen(){
  renderCategories();
  showScreen("category");
}
function goHome(){
  if(state.gameActive){openExitModal("home");return}
  stopGameLoops();stopWordAudio();
  state.gameActive=false;
  closeSpellModal(false);closeHelp(false);
  showScreen("intro");
}
function exitGameToSettings(){
  if(state.gameActive){openExitModal("settings");return}
  stopGameLoops();stopWordAudio();
  state.gameActive=false;
  closeSpellModal(false);closeHelp(false);
  updateSettingsSummary();
  showScreen("settings");
}
let pendingExitTarget=null;
function openExitModal(target){
  pendingExitTarget=target;
  pauseGame();
  $("#exitModal").classList.add("open");
}
function closeExitModal(){
  $("#exitModal").classList.remove("open");
  pendingExitTarget=null;
  if(state.gameActive)resumeGame();
}
function confirmExit(){
  const target=pendingExitTarget;
  if(!target)return;
  $("#exitModal").classList.remove("open");
  pendingExitTarget=null;
  stopGameLoops();stopWordAudio();state.gameActive=false;
  closeSpellModal(false);closeHelp(false);
  if(target==="home")showScreen("intro");
  else{updateSettingsSummary();showScreen("settings")}
}
function showToast(text,type="good",duration=900){
  const toast=document.createElement("div");
  toast.className=`toast ${type}`;
  toast.textContent=text;
  $("#toastLayer").appendChild(toast);
  requestAnimationFrame(()=>toast.classList.add("show"));
  setTimeout(()=>{
    toast.classList.remove("show");
    setTimeout(()=>toast.remove(),250);
  },duration);
}
function renderCategories(){
  const grid=$("#categoryGrid");grid.innerHTML="";
  WORD_BANK.forEach((cat,i)=>{
    const count=cat.subcategories.reduce((s,x)=>s+x.words.length,0);
    const b=document.createElement("button");
    b.type="button";
    b.className="category-card";
    b.innerHTML=`<span class="category-ko">${escapeHtml(cat.ko)}</span>
      <span class="category-en">${escapeHtml(cat.en)}</span>
      <span class="count-pill">${count}개 단어</span>`;
    b.addEventListener("click",()=>{
      state.categoryIndex=i;state.selectedSubs=new Set();
      renderSubcategories();showScreen("sub");
    });
    grid.appendChild(b);
  });
}
function renderSubcategories(){
  const cat=WORD_BANK[state.categoryIndex];
  const grid=$("#subGrid");grid.innerHTML="";
  cat.subcategories.forEach((sub,i)=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="sub-card"+(state.selectedSubs.has(i)?" selected":"");
    b.dataset.subIndex=String(i);
    b.innerHTML=`<span class="sub-check">${state.selectedSubs.has(i)?"✓":""}</span>
      <span class="sub-name">${escapeHtml(sub.name)}</span>
      <span class="count-pill">${sub.words.length}개 단어</span>`;
    b.addEventListener("mouseenter",()=>showWordPreview(b,sub));
    b.addEventListener("mouseleave",hideWordPreview);
    b.addEventListener("focus",()=>showWordPreview(b,sub));
    b.addEventListener("blur",hideWordPreview);
    b.addEventListener("click",()=>{
      hideWordPreview();
      if(state.selectedSubs.has(i))state.selectedSubs.delete(i);else state.selectedSubs.add(i);
      renderSubcategories();
    });
    grid.appendChild(b);
  });
  const count=selectedPool().length;
  const totalCount=cat.subcategories.reduce((n,s)=>n+s.words.length,0);
  const allSelected=state.selectedSubs.size===cat.subcategories.length;
  $("#selectionSummary").textContent=`주제 ${state.selectedSubs.size}개 · 선택된 단어 ${count}개`;
  $("#toSettingsBtn").disabled=count<10;
  $("#selectAllBtn").textContent=`${allSelected?"전체 단어 선택 해제하기":"전체 단어 선택하기"} (${totalCount})`;
  $("#selectAllBtn").classList.toggle("selected",allSelected);
  updateNavButtonStates();
}
function updateSettingsSummary(){
  const pool=selectedPool();
  $("#settingsSummaryTitle").textContent=`${state.mode==="word"?"단어 익히기":"철자 익히기"} · ${DIFFICULTIES[state.difficulty].label}`;
  $("#settingsSummaryText").textContent=`${WORD_BANK[state.categoryIndex].ko} / 주제 ${state.selectedSubs.size}개 / ${pool.length}개 단어 중 ${TOTAL_ROUNDS}문제`;
}
function setChoice(containerSelector,dataKey,value){
  $$(`${containerSelector} .choice-card`).forEach(b=>b.classList.toggle("selected",b.dataset[dataKey]===value));
}

/* ================= How to Play (게임 중에는 타이머를 멈춘다) ================= */
function openHelp(fromIntro=false){
  state.resumeAfterHelp=state.gameActive && !state.paused;
  if(state.resumeAfterHelp)pauseGame();
  $("#helpCloseBtn").classList.toggle("hidden",fromIntro);
  $("#helpActions").innerHTML=fromIntro
    ? '<button type="button" id="helpCloseActionBtn" class="secondary-btn">닫기</button><button type="button" id="helpStartBtn" class="primary-btn">GAME START</button>'
    : "";
  if(fromIntro){
    $("#helpCloseActionBtn").addEventListener("click",()=>closeHelp(false));
    $("#helpStartBtn").addEventListener("click",()=>{
      closeHelp(false);enterCategoryScreen();
    });
  }
  $("#helpModal").classList.add("open");
}
function closeHelp(shouldResume=true){
  $("#helpModal").classList.remove("open");
  /* 도움말을 보는 동안 끝난 정답 발음의 다음 진행은 도움말을 닫을 때 이어서 한다 */
  const pending=state.afterHelp;state.afterHelp=null;
  if(shouldResume && pending && state.gameActive)pending();
  else if(shouldResume && state.resumeAfterHelp && state.gameActive)resumeGame();
  state.resumeAfterHelp=false;
}

/* ================= 주제 미리보기 (공간 문제로 영어 단어만 보여 준다) ================= */
function showWordPreview(card,sub){
  if(!window.matchMedia("(hover:hover) and (pointer:fine)").matches && document.activeElement!==card)return;
  const tooltip=$("#wordPreviewTooltip");
  tooltip.innerHTML=`<div class="preview-head"><strong>단어 미리보기: ${escapeHtml(sub.name)}</strong><span class="preview-count">${sub.words.length}개</span></div>
    <div class="preview-word-list">${sub.words.map(w=>escapeHtml(w.en)).join(", ")}</div>
    <div class="preview-tip">카드를 클릭하면 이 단어 묶음이 선택돼요!</div>`;
  tooltip.classList.add("show");
  tooltip.setAttribute("aria-hidden","false");
  positionWordPreview();
}
function positionWordPreview(){
  const tooltip=$("#wordPreviewTooltip");
  if(!tooltip.classList.contains("show"))return;
  /* 카드 위치와 상관없이 항상 무대 위쪽 가운데에 띄운다 (마우스 위치에 따라 자리가 바뀌면 읽기 불편하다) */
  const margin=12;
  const tw=tooltip.offsetWidth||420;
  const left=Math.round(Math.max(margin,(1280-tw)/2));
  tooltip.style.left=`${left}px`;
  tooltip.style.top=`${margin}px`;
}
function hideWordPreview(){
  const tooltip=$("#wordPreviewTooltip");
  if(!tooltip)return;
  tooltip.classList.remove("show");
  tooltip.setAttribute("aria-hidden","true");
}
window.addEventListener("resize",()=>{hideWordPreview();fitAllWordBoards()});
window.addEventListener("scroll",hideWordPreview,true);
