const STORAGE_KEY = 'question_bank_notice_period_v1';
const HALF_DAY = 12 * 60 * 60 * 1000;
const OFFSET = 2 * 60 * 60 * 1000; // Taipei UTC+8, with each notice day starting at 06:00.

export function noticePeriod(now = Date.now()) {
    const id = Math.floor((now + OFFSET) / HALF_DAY);
    return { id, nextAt: (id + 1) * HALF_DAY - OFFSET };
}

export function initNotice() {
    const dialog = document.getElementById('siteNotice');
    if (!dialog) return;
    let shown = -Infinity;
    let timer;

    function lastShown() {
        for (const name of ['localStorage', 'sessionStorage']) {
            try {
                const value = window[name].getItem(STORAGE_KEY);
                if (value !== null && /^\d+$/.test(value)) shown = Math.max(shown, Number(value));
            } catch { /* Keep an in-memory record when browser storage is unavailable. */ }
        }
        return shown;
    }

    function check() {
        clearTimeout(timer);
        const period = noticePeriod();
        if (document.visibilityState !== 'hidden' && lastShown() < period.id && !dialog.open) {
            dialog.showModal();
            document.documentElement.classList.add('notice-open');
            shown = period.id;
            for (const name of ['localStorage', 'sessionStorage']) {
                try { window[name].setItem(STORAGE_KEY, String(shown)); } catch { /* Memory fallback. */ }
            }
        }
        timer = setTimeout(check, Math.max(1, period.nextAt - Date.now()));
    }

    dialog.addEventListener('close', () => {
        document.documentElement.classList.remove('notice-open');
        // If an old notice stayed open across a boundary, count the visible notice for this period too.
        const period = noticePeriod();
        if (shown < period.id) {
            shown = period.id;
            for (const name of ['localStorage', 'sessionStorage']) {
                try { window[name].setItem(STORAGE_KEY, String(shown)); } catch { /* Memory fallback. */ }
            }
        }
    });
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    window.addEventListener('storage', event => {
        if (event.key === STORAGE_KEY || event.key === null) check();
    });
    check();
}

if (typeof document !== 'undefined') initNotice();
