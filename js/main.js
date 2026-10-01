"use strict";

/* ================= 이벤트 연결 ================= */
$("#nav-home-btn").addEventListener("click",navHome);
$("#nav-back-btn").addEventListener("click",navBack);
$("#nav-forward-btn").addEventListener("click",navForward);
$("#nav-htp-btn").addEventListener("click",()=>openHelp(false));
$("#sfx-toggle-btn").addEventListener("click",toggleSfx);
$("#music-toggle-btn").addEventListener("click",toggleMusic);
$("#fullscreen-toggle-btn").addEventListener("click",toggleFullscreen);

$("#coverStart").addEventListener("click",enterCategoryScreen);
$("#coverHelp").addEventListener("click",()=>openHelp(true));
$("#selectAllBtn").addEventListener("click",()=>{
  const cat=WORD_BANK[state.categoryIndex];
  if(state.selectedSubs.size===cat.subcategories.length)state.selectedSubs.clear();
  else state.selectedSubs=new Set(cat.subcategories.map((_,i)=>i));
  renderSubcategories();
});
$("#toSettingsBtn").addEventListener("click",()=>{updateSettingsSummary();showScreen("settings")});
$("#modeChoices").addEventListener("click",e=>{
  const b=e.target.closest("[data-mode]");if(!b)return;
  state.mode=b.dataset.mode;setChoice("#modeChoices","mode",state.mode);updateSettingsSummary();
});
$("#difficultyChoices").addEventListener("click",e=>{
  const b=e.target.closest("[data-difficulty]");if(!b)return;
  state.difficulty=b.dataset.difficulty;setChoice("#difficultyChoices","difficulty",state.difficulty);updateSettingsSummary();
});
$("#startGameBtn").addEventListener("click",startGame);
$("#helpCloseBtn").addEventListener("click",()=>closeHelp(true));
$("#helpModal").addEventListener("click",e=>{if(e.target===$("#helpModal"))closeHelp(true)});
$("#exitContinueBtn").addEventListener("click",closeExitModal);
$("#exitConfirmBtn").addEventListener("click",confirmExit);
$("#exitModal").addEventListener("click",e=>{if(e.target===$("#exitModal"))closeExitModal()});
$("#spellSubmitBtn").addEventListener("click",submitSpelling);
$("#spellSkipBtn").addEventListener("click",skipSpelling);
$("#spellInput").addEventListener("keydown",e=>{if(e.key==="Enter")submitSpelling()});
$("#retryBtn").addEventListener("click",startGame);
$("#reselectBtn").addEventListener("click",()=>{state.selectedSubs=new Set();renderSubcategories();showScreen("sub")});
$("#answerList").addEventListener("click",event=>{
  const button=event.target.closest(".answer-audio-button");
  if(!button)return;
  const result=state.results[Number(button.dataset.resultIndex)];
  if(result)playWordAudio(result.word);
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&$("#helpModal").classList.contains("open"))closeHelp(true);
  if(e.key==="Escape"&&$("#exitModal").classList.contains("open"))closeExitModal();
  if(!state.gameActive||state.paused||state.lock||$("#spellModal").classList.contains("open")||$("#helpModal").classList.contains("open")||$("#exitModal").classList.contains("open"))return;
  if(e.target.matches("input,textarea,select"))return;
  const keyIndex=Number(e.key)-1;
  if(keyIndex<0||keyIndex>=6)return;
  /* 숫자키는 칸 번호에 고정한다(위줄 1·2·3, 아래줄 4·5·6). 그 칸이 비어 있으면 아무 일도 없다 */
  const button=$$(".mole-button",$("#moleGrid"))[keyIndex];
  if(!button||!button.classList.contains("visible"))return;
  e.preventDefault();
  const option=state.options[Number(button.dataset.optionIndex)];
  if(option)hitMole(button,option);
});
window.addEventListener("beforeunload",e=>{
  if(state.gameActive){e.preventDefault();e.returnValue=""}
});
document.addEventListener("contextmenu",event=>event.preventDefault());

/* 화면 클래스가 어떤 경로로 바뀌든 앞으로/뒤로 버튼 상태를 따라가도록 감시 */
NAV_SCREEN_IDS.forEach(id=>{
  const el=document.getElementById(id);
  if(el)new MutationObserver(updateNavButtonStates).observe(el,{attributes:true,attributeFilter:["class"]});
});

/* 공통 상단바가 [상단바 + 무대 카드]를 창 가운데 여백을 두고 맞춘다 (무대 1280×720).
   무대 안 요소는 전부 이 배율 하나로 같이 커지고 작아진다 — 화면마다 따로 계산하지 않는다 */
function fitStage(){ TopNav.fit(document.getElementById("app"), 1280, 800); }
window.addEventListener("resize", fitStage);
fitStage();

renderCategories();
syncAudioButtons();
updateFullscreenIcon();
updateNavButtonStates();
initBgm();
if(document.fonts&&document.fonts.ready&&document.fonts.ready.then){
  document.fonts.ready.then(checkIconFont).catch(()=>{});
}
delay(checkIconFont,2500);
/* ================= 모바일·태블릿 화면 고정 =================
   아이패드·갤럭시탭에서 손가락으로 확대하면 고정 무대(1280×800)의 비율이 틀어져 화면이 깨진다.
   viewport 설정만으로는 iOS에서 막히지 않으므로 확대 동작을 직접 막는다 */
["gesturestart","gesturechange","gestureend"].forEach(type=>{
  document.addEventListener(type,e=>e.preventDefault(),{passive:false});
});
document.addEventListener("touchmove",e=>{
  if(e.touches.length>1)e.preventDefault();      /* 손가락 두 개 = 확대 */
},{passive:false});
let lastTouchEnd=0;
document.addEventListener("touchend",e=>{
  const now=Date.now();
  if(now-lastTouchEnd<=350)e.preventDefault();   /* 두 번 빠르게 누르기 = 확대 */
  lastTouchEnd=now;
},{passive:false});
document.addEventListener("wheel",e=>{
  if(e.ctrlKey)e.preventDefault();               /* 트랙패드·Ctrl+휠 확대 */
},{passive:false});
