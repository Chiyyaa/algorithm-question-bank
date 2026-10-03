export function initNavigation() {
document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
        document.getElementById("panel-" + btn.dataset.panel).classList.add("active");
        if (mobileViewport.matches) setSidebarOpen(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        updateBackToTop();
    });
});

document.getElementById("openCurrentUnitBtn").addEventListener("click", () => {
    document.querySelector('.nav-btn[data-panel="bank"]').click();
    document.getElementById("searchInput").focus({ preventScroll: true });
});

const sidebar = document.getElementById("sidebar");
const menuButton = document.getElementById("mobileMenuBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const mobileViewport = window.matchMedia("(max-width: 850px)");
let desktopSidebarOpen = false;
let mobileSidebarOpen = false;

function updateSidebar() {
    const open = mobileViewport.matches ? mobileSidebarOpen : desktopSidebarOpen;
    sidebar.classList.toggle("open", mobileViewport.matches && open);
    sidebar.classList.toggle("collapsed", !mobileViewport.matches && !open);
    sidebar.inert = !open;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "收合選單" : "展開選單");
    sidebarBackdrop.hidden = !mobileViewport.matches || !open;
    if (!open && sidebar.contains(document.activeElement)) menuButton.focus();
}
function setSidebarOpen(open) {
    if (mobileViewport.matches) mobileSidebarOpen = open;
    else desktopSidebarOpen = open;
    updateSidebar();
}
menuButton.addEventListener("click", () => {
    setSidebarOpen(!(mobileViewport.matches ? mobileSidebarOpen : desktopSidebarOpen));
});
sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));
document.addEventListener("keydown", event => {
    if (event.key === "Escape") setSidebarOpen(false);
});
mobileViewport.addEventListener("change", () => {
    mobileSidebarOpen = false;
    updateSidebar();
});
updateSidebar();

function updateBackToTop() {
    const scrollRoot = document.scrollingElement || document.documentElement;
    const maxScroll = scrollRoot.scrollHeight - scrollRoot.clientHeight;
    const onBank = document.getElementById("panel-bank").classList.contains("active");
    const visible = onBank && maxScroll > 0 && scrollRoot.scrollTop >= maxScroll * 0.75;
    const button = document.getElementById("backToTopBtn");
    button.hidden = !visible;
}
window.addEventListener("scroll", updateBackToTop, { passive: true });
window.addEventListener("resize", updateBackToTop);
document.getElementById("backToTopBtn").addEventListener("click", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" });
    document.getElementById("searchInput").focus({ preventScroll: true });
});

    return { updateBackToTop };
}

