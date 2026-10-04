const VIDEO_ID = "xKhBGvx4W98";

export function initMusic() {
    const button = document.getElementById("musicToggleBtn");
    const panel = document.getElementById("musicPanel");
    const host = document.getElementById("musicPlayerHost");
    const closeButton = document.getElementById("musicCloseBtn");

    function close(restoreFocus = true) {
        // Remove the embed to stop playback, including a player that is still loading.
        host.replaceChildren();
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "開啟音樂播放器");
        button.title = "播放音樂";
        if (restoreFocus && !document.getElementById("subjectHome").hidden) button.focus();
    }

    function open() {
        if (document.getElementById("subjectHome").hidden) return;
        panel.hidden = false;
        button.setAttribute("aria-expanded", "true");
        button.setAttribute("aria-label", "關閉音樂播放器");
        button.title = "關閉音樂";
        const player = document.createElement("iframe");
        player.src = "https://www.youtube.com/embed/" + VIDEO_ID + "?autoplay=1&playsinline=1";
        player.title = "YouTube 音樂播放器";
        player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        player.referrerPolicy = "strict-origin-when-cross-origin";
        player.allowFullscreen = true;
        host.replaceChildren(player);
        closeButton.focus({ preventScroll: true });
    }

    button.addEventListener("click", () => panel.hidden ? open() : close());
    closeButton.addEventListener("click", () => close());
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) close();
    });
    return { close };
}
