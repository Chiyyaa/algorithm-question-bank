export function parseTrackName(filename) {
    const name = String(filename).split(/[\\/]/).pop()
        .replace(/\.(mp3|m4a|ogg|wav|flac)$/i, "").replace(/\s+/g, " ").trim();
    const solo = name.match(/^(.+?)\s*[（(]\s*(.+?)\s+solo\s*[）)]$/i);
    if (solo) return { title: solo[1].trim(), artist: solo[2].trim() };
    const separated = name.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (separated) return { title: separated[2].trim(), artist: separated[1].trim() };
    return { title: name, artist: "" };
}

// Keep original filenames as metadata, even when URLs use shorter deployment filenames.
const TRACKS = [
    { filename: "BLUE (WINTER Solo).mp3", path: "../music/blue.mp3" },
    { filename: "WINTER-Speed of Summer.mp3", path: "../music/speed-of-summer.mp3" },
    { filename: "aespa -Supernova.mp3", path: "../music/supernova.mp3" },
    { filename: "UP (KARINA Solo).mp3", path: "../music/up.mp3" }
].map(track => ({ ...parseTrackName(track.filename), url: new URL(track.path, import.meta.url).href }));

export function initMusic() {
    const button = document.getElementById("musicToggleBtn");
    const panel = document.getElementById("musicPanel");
    const audio = document.getElementById("bgMusic");
    const status = document.getElementById("musicStatus");
    const playButton = document.getElementById("musicPlayBtn");
    const nextButton = document.getElementById("musicNextBtn");
    const seek = document.getElementById("musicSeek");
    const volume = document.getElementById("musicVolume");
    const trackList = document.getElementById("musicTrackList");
    let trackIndex = 0;
    let wantsPlayback = false;
    let playRequest = 0;
    let seeking = false;
    audio.volume = Number(volume.value) / 100;

    function formatTime(seconds) {
        const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
        return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
    }

    function updateProgress(previewTime) {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const time = previewTime ?? audio.currentTime;
        document.getElementById("musicElapsed").textContent = formatTime(time);
        document.getElementById("musicDuration").textContent = formatTime(duration);
        seek.disabled = duration <= 0 || !!audio.error;
        if (!seeking) seek.value = duration > 0 ? String(Math.round(time / duration * 1000)) : "0";
        seek.style.setProperty("--range-progress", Number(seek.value) / 10 + "%");
        seek.setAttribute("aria-valuetext", formatTime(time) + " / " + formatTime(duration));
    }

    function updateTrack() {
        const track = TRACKS[trackIndex];
        document.getElementById("musicTitle").textContent = track.title;
        document.getElementById("musicArtist").textContent = track.artist;
        trackList.querySelectorAll("[data-track]").forEach(item => {
            const current = Number(item.dataset.track) === trackIndex;
            item.classList.toggle("is-current", current);
            if (current) item.setAttribute("aria-current", "true");
            else item.removeAttribute("aria-current");
        });
    }

    function setState(state, message) {
        const playing = state === "playing";
        button.classList.toggle("is-playing", playing);
        button.dataset.state = state;
        playButton.setAttribute("aria-label", (wantsPlayback ? "暫停 " : "播放 ") + TRACKS[trackIndex].title);
        playButton.title = wantsPlayback ? "暫停" : "播放";
        playButton.firstElementChild.textContent = wantsPlayback ? "Ⅱ" : "▶";
        if (message) status.textContent = message;
    }

    function hidePanel(restoreFocus = false) {
        if (panel.hidden) return;
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "展開音樂面板");
        button.title = "展開音樂面板";
        if (restoreFocus && !document.getElementById("subjectHome").hidden) button.focus();
    }

    function pause() {
        wantsPlayback = false;
        playRequest++;
        audio.pause();
        setState("paused", "音樂已暫停");
    }

    // Called when entering the question bank; collapsing the panel alone does not pause.
    function close(restoreFocus = false) {
        pause();
        hidePanel(restoreFocus);
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
                ? "請再點一次播放按鈕。"
                : "音樂暫時無法播放，請檢查網路後再試。");
        }
    }

    function selectTrack(index) {
        if (!Number.isInteger(index) || !TRACKS[index]) return;
        if (index !== trackIndex || !audio.getAttribute("src")) {
            trackIndex = index;
            seeking = false;
            audio.src = TRACKS[index].url;
            updateTrack();
            updateProgress(0);
        }
        play();
    }

    button.addEventListener("click", () => {
        if (document.getElementById("subjectHome").hidden) return;
        if (!panel.hidden) hidePanel(panel.contains(document.activeElement));
        else {
            panel.hidden = false;
            button.setAttribute("aria-expanded", "true");
            button.setAttribute("aria-label", "收起音樂面板");
            button.title = "收起音樂面板";
        }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) hidePanel(true);
    });
    playButton.addEventListener("click", () => wantsPlayback ? pause() : play());
    nextButton.addEventListener("click", () => selectTrack((trackIndex + 1) % TRACKS.length));
    trackList.addEventListener("click", event => {
        const item = event.target.closest("[data-track]");
        if (item) selectTrack(Number(item.dataset.track));
    });

    seek.addEventListener("input", () => {
        seeking = true;
        if (Number.isFinite(audio.duration)) updateProgress(Number(seek.value) / 1000 * audio.duration);
    });
    seek.addEventListener("change", () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
            audio.currentTime = Number(seek.value) / 1000 * audio.duration;
        }
        seeking = false;
        updateProgress();
    });
    seek.addEventListener("pointercancel", () => { seeking = false; updateProgress(); });
    volume.addEventListener("input", () => {
        audio.volume = Number(volume.value) / 100;
        volume.style.setProperty("--range-progress", volume.value + "%");
        volume.setAttribute("aria-valuetext", volume.value + "%");
    });
    ["loadedmetadata", "durationchange", "timeupdate", "emptied"].forEach(event =>
        audio.addEventListener(event, () => { if (!seeking) updateProgress(); }));
    audio.addEventListener("playing", () => {
        if (!wantsPlayback || document.getElementById("subjectHome").hidden) { close(); return; }
        setState("playing", "正在播放 " + TRACKS[trackIndex].title);
    });
    audio.addEventListener("waiting", () => { if (wantsPlayback) setState("loading"); });
    audio.addEventListener("pause", () => {
        if (!wantsPlayback || !audio.paused || audio.ended) return;
        wantsPlayback = false;
        playRequest++;
        setState("paused", "音樂已暫停");
    });
    audio.addEventListener("error", () => {
        wantsPlayback = false;
        playRequest++;
        audio.pause();
        setState("paused", "音樂載入失敗，請檢查網路後再點播放重試。");
        updateProgress();
    });
    audio.addEventListener("ended", () => {
        if (wantsPlayback && !document.getElementById("subjectHome").hidden) {
            selectTrack((trackIndex + 1) % TRACKS.length);
        }
    });

    TRACKS.forEach((track, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "music-track";
        item.dataset.track = index;
        item.setAttribute("aria-label", track.title + (track.artist ? " — " + track.artist : ""));
        const title = document.createElement("span");
        title.className = "track-title";
        title.textContent = track.title;
        const artist = document.createElement("span");
        artist.className = "track-artist";
        artist.textContent = track.artist;
        item.append(title, artist);
        trackList.append(item);
    });
    volume.style.setProperty("--range-progress", volume.value + "%");
    volume.setAttribute("aria-valuetext", volume.value + "%");
    updateTrack();
    updateProgress();
    setState("paused");
    return { close };
}
