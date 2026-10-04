const TRACKS = [
    { title: "BLUE (WINTER Solo)", url: new URL("../music/blue.mp3", import.meta.url).href },
    { title: "WINTER - Speed of Summer", url: new URL("../music/speed-of-summer.mp3", import.meta.url).href }
];

export function initMusic() {
    const button = document.getElementById("musicToggleBtn");
    const audio = document.getElementById("bgMusic");
    const status = document.getElementById("musicStatus");
    const action = button.querySelector(".music-action");
    let trackIndex = 0;
    let wantsPlayback = false;
    let playRequest = 0;
    audio.volume = 0.5;

    function setState(state, message) {
        const playing = state === "playing";
        button.classList.toggle("is-playing", playing);
        button.dataset.state = state;
        button.setAttribute("aria-pressed", String(playing));
        const verb = wantsPlayback ? "暫停" : "播放";
        const label = verb + " " + TRACKS[trackIndex].title;
        button.setAttribute("aria-label", label);
        button.title = label;
        action.textContent = wantsPlayback ? "Ⅱ" : "▶";
        if (message) status.textContent = message;
    }

    function close(restoreFocus = false) {
        wantsPlayback = false;
        playRequest++;
        audio.pause();
        setState("paused", "音樂已暫停");
        if (restoreFocus && !document.getElementById("subjectHome").hidden) button.focus();
    }

    async function play() {
        const request = ++playRequest;
        wantsPlayback = true;
        if (!audio.getAttribute("src") || audio.error) audio.src = TRACKS[trackIndex].url;
        setState("loading", "正在載入 " + TRACKS[trackIndex].title);
        try {
            await audio.play();
            if (request !== playRequest) return;
            setState("playing", "正在播放 " + TRACKS[trackIndex].title);
        } catch (error) {
            if (request !== playRequest) return;
            wantsPlayback = false;
            setState("paused", error.name === "NotAllowedError"
                ? "瀏覽器尚未允許播放，請再點一次唱片。"
                : "音樂暫時無法播放，請檢查網路後再試。");
        }
    }

    button.addEventListener("click", () => {
        if (document.getElementById("subjectHome").hidden) return;
        if (wantsPlayback) close();
        else play();
    });
    audio.addEventListener("playing", () => {
        if (!wantsPlayback || document.getElementById("subjectHome").hidden) {
            close();
            return;
        }
        setState("playing", "正在播放 " + TRACKS[trackIndex].title);
    });
    audio.addEventListener("waiting", () => {
        if (wantsPlayback) setState("loading");
    });
    audio.addEventListener("pause", () => {
        // A delayed pause event from switching tracks must not cancel the new play request.
        if (!wantsPlayback || !audio.paused || audio.ended) return;
        wantsPlayback = false;
        playRequest++;
        setState("paused", "音樂已暫停");
    });
    audio.addEventListener("error", () => {
        wantsPlayback = false;
        playRequest++;
        audio.pause();
        setState("paused", "音樂載入失敗，請檢查網路後再點唱片重試。");
    });
    audio.addEventListener("ended", () => {
        if (!wantsPlayback || document.getElementById("subjectHome").hidden) return;
        trackIndex = (trackIndex + 1) % TRACKS.length;
        audio.src = TRACKS[trackIndex].url;
        play();
    });
    setState("paused");
    return { close };
}
