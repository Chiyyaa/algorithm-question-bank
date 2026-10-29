// Appearance is loaded only by the subject chooser and the algorithm/OS shell.
// English and collaboration keep their existing independent styles and scripts.
export function getTaipeiSchedule(now = Date.now()) {
    // Taipei standard time is UTC+08:00; never use the device's local timezone.
    const hour = 60 * 60 * 1000;
    const shifted = new Date(now + 8 * hour);
    const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * hour;
    const morning = dayStart + 6 * hour;
    const evening = dayStart + 18 * hour;
    return {
        theme: now >= morning && now < evening ? 'day' : 'night',
        nextSwitchAt: now < morning ? morning : now < evening ? evening : morning + 24 * hour
    };
}

export function initAppearance() {
    const home = document.getElementById('subjectHome');
    const homeButton = document.getElementById('homeThemeBtn');
    const studyButton = homeButton.cloneNode(true);
    studyButton.id = 'studyThemeBtn';
    studyButton.className = 'study-theme-toggle';
    studyButton.hidden = true;
    document.body.append(studyButton);

    const storageKey = 'question_bank_taipei_theme_v1';
    let preference = null;
    let timer = 0;
    function readPreference(value) {
        try {
            const parsed = JSON.parse(value);
            const now = Date.now();
            if ((parsed?.theme === 'day' || parsed?.theme === 'night') &&
                Number.isFinite(parsed.expiresAt) && parsed.expiresAt > now &&
                parsed.expiresAt === getTaipeiSchedule(now).nextSwitchAt) return parsed;
        } catch { /* Ignore invalid or outdated saved values. */ }
        return null;
    }
    try {
        preference = readPreference(localStorage.getItem(storageKey));
    } catch { /* Storage restrictions must not disable theme switching. */ }

    function apply() {
        const now = Date.now();
        const schedule = getTaipeiSchedule(now);
        if (preference && (preference.expiresAt <= now || preference.expiresAt !== schedule.nextSwitchAt)) preference = null;
        const theme = preference?.theme || schedule.theme;
        const night = theme === 'night';
        document.body.dataset.theme = theme;
        home.dataset.theme = theme;
        for (const button of [homeButton, studyButton]) {
            button.setAttribute('aria-pressed', String(night));
            button.setAttribute('aria-label', night ? '切換日間模式' : '切換夜間模式');
            button.title = button.getAttribute('aria-label') + '；依台北時間 06:00／18:00 自動切換，手動設定保留至下一次切換';
            button.querySelector('.theme-icon').textContent = '';
            button.querySelector('.theme-label').textContent = night ? '日間模式' : '夜間模式';
        }
        clearTimeout(timer);
        // Recheck the clock at most once a minute, and exactly at the next boundary.
        timer = setTimeout(apply, Math.max(1, Math.min(schedule.nextSwitchAt - now, 60000)));
    }
    function toggle() {
        preference = {
            theme: document.body.dataset.theme === 'night' ? 'day' : 'night',
            expiresAt: getTaipeiSchedule().nextSwitchAt
        };
        try { localStorage.setItem(storageKey, JSON.stringify(preference)); } catch { /* Session fallback. */ }
        apply();
    }
    homeButton.addEventListener('click', toggle);
    studyButton.addEventListener('click', toggle);
    window.addEventListener('storage', event => {
        if (event.key !== storageKey && event.key !== null) return;
        preference = readPreference(event.newValue);
        apply();
    });
    window.addEventListener('focus', apply);
    window.addEventListener('pageshow', apply);
    window.addEventListener('pagehide', () => clearTimeout(timer));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearTimeout(timer);
        else apply();
    });
    const syncVisibility = () => { studyButton.hidden = !home.hidden; };
    new MutationObserver(syncVisibility).observe(home, { attributes: true, attributeFilter: ['hidden'] });
    syncVisibility();
    apply();
}

export function initHomeMotion() {
    const home = document.getElementById('subjectHome');
    const layer = document.getElementById('homeSparkles');
    const glow = document.createElement('span');
    const ring = document.createElement('span');
    glow.className = 'home-pointer-glow';
    ring.className = 'home-pointer-ring';
    layer.replaceChildren(glow, ring);
    layer.setAttribute('aria-hidden', 'true');
    const enabled = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, active = false, targetX = 0, targetY = 0, x = 0, y = 0, previousTime = 0;

    function clear() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        previousTime = 0;
        active = false;
        layer.classList.remove('is-following', 'is-over-control');
    }
    function animate(time) {
        frame = 0;
        if (!active) return;
        const elapsed = previousTime ? Math.min(time - previousTime, 32) : 16.67;
        previousTime = time;
        const easing = 1 - Math.pow(.86, elapsed / 16.67);
        x += (targetX - x) * easing;
        y += (targetY - y) * easing;
        const transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        glow.style.transform = transform;
        ring.style.transform = transform;
        if (Math.abs(targetX - x) + Math.abs(targetY - y) > .1) frame = requestAnimationFrame(animate);
        else previousTime = 0;
    }
    home.addEventListener('pointermove', event => {
        if (home.hidden || document.hidden || event.pointerType !== 'mouse' || !enabled.matches || reduced.matches) return;
        targetX = event.clientX;
        targetY = event.clientY;
        if (!active) { x = targetX; y = targetY; active = true; }
        layer.classList.add('is-following');
        layer.classList.toggle('is-over-control', !!event.target.closest('button, a, input'));
        const card = event.target.closest('.subject-card');
        if (card) {
            const bounds = card.getBoundingClientRect();
            card.style.setProperty('--pointer-x', `${event.clientX - bounds.left}px`);
            card.style.setProperty('--pointer-y', `${event.clientY - bounds.top}px`);
        }
        if (!frame) frame = requestAnimationFrame(animate);
    }, { passive: true });
    home.addEventListener('pointerleave', clear);
    enabled.addEventListener('change', clear);
    reduced.addEventListener('change', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    window.addEventListener('blur', clear);
    window.addEventListener('pagehide', clear);
    window.addEventListener('scroll', clear, { passive: true });
    return clear;
}
