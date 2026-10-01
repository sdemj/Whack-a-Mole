(function () {
    var overlay = document.getElementById('rotate-overlay');
    if (!overlay) return;
    var dismissed = false;
    // 태블릿(짧은 쪽이 대략 600px 이상, 아이패드 세로 768px 등)은 제외하고
    // 휴대폰 화면 크기에서 세로로 시작했을 때만 보여준다. screen.width/height는
    // 회전해도 "짧은 쪽" 값 자체는 기기 고유값이라 방향과 무관하게 안정적으로 쓸 수 있다.
    function isPhoneSized() {
        var shortSide = Math.min(window.screen.width, window.screen.height);
        return shortSide > 0 && shortSide < 600;
    }
    function shouldShow() {
        return !dismissed && isPhoneSized() && window.innerHeight > window.innerWidth;
    }
    function updateRotateOverlay() {
        var show = shouldShow();
        overlay.style.display = show ? 'flex' : 'none';
        // 상단바는 안내창과 z-index가 같고 나중에 만들어져 안내창 위에 그려진다.
        // 안내창이 떠 있는 동안에는 body 클래스로 상단바를 숨긴다 (css/style.css).
        document.body.classList.toggle('rotate-overlay-on', show);
    }
    window.dismissRotateOverlay = function () {
        dismissed = true;
        updateRotateOverlay();
    };
    window.addEventListener('resize', updateRotateOverlay);
    window.addEventListener('orientationchange', updateRotateOverlay);
    updateRotateOverlay();
})();
