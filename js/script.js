/**
 * LIVE / 日语落地页交互脚本。
 *
 * 下载地址由 index.html 中的后台 download.js 接管。
 * 本文件不设置下载按钮的 href、target，也不绑定下载跳转事件。
 * 请在 HTML 中只保留一份正确的后台接入代码，选择器使用 .js-download。
 * 本文件不会重复加载后台脚本，也不会自动清除 HTML 中的旧 href。
 */
(() => {
  "use strict";

  // 视频未提供时留空。放入 videos/hero.mp4 后，改为 "videos/hero.mp4"。
  const BACKGROUND_VIDEO_URL = "";
  // 调整背景人物位置，例如 "50% 20%"、"50% 50%"。
  const BACKGROUND_VIDEO_POSITION = "50% 28%";

  function init() {
    const root = document.documentElement;
    // 防止本地交互重复初始化；HTML 中的重复 script 标签仍应删除。
    if (root.dataset.liveUiInitialized === "true") return;
    root.dataset.liveUiInitialized = "true";

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const year = document.getElementById("copyright-year");
    if (year) year.textContent = String(new Date().getFullYear());

    // 图片弹窗：仅展示静态预览。
    const dialog = document.getElementById("preview-dialog");
    const previewImage = document.getElementById("preview-image");
    const previewTitle = document.getElementById("preview-title");
    let lastFocus = null;

    if (dialog && previewImage && previewTitle && typeof dialog.showModal === "function") {
      root.classList.add("preview-enabled");
      document.querySelectorAll("[data-preview]").forEach((card) => {
        card.addEventListener("click", () => {
          if (!card.dataset.image) return;
          const label = card.dataset.label || "プレビュー";
          previewImage.src = card.dataset.image;
          previewImage.alt = `${label}の人物イメージ`;
          previewTitle.textContent = label;
          lastFocus = card;
          if (!dialog.open) dialog.showModal();
          root.classList.add("is-modal-open");
        });
      });
    }

    if (dialog) {
      const closeButton = dialog.querySelector(".dialog-close");
      if (closeButton) closeButton.addEventListener("click", () => dialog.close());

      dialog.addEventListener("click", (event) => {
        const rect = dialog.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom;
        if (event.target === dialog && outside) dialog.close();
      });
      dialog.addEventListener("close", () => {
        root.classList.remove("is-modal-open");
        if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
      });
    }

    // 图片风格筛选；不按真实在线状态筛选。
    const filterButtons = [...document.querySelectorAll("[data-filter]")];
    const gridCards = [...document.querySelectorAll("#portrait-grid .portrait-card")];
    const filterStatus = document.getElementById("filter-status");

    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        let visible = 0;
        const selected = button.dataset.filter || "all";
        filterButtons.forEach((other) => {
          const active = other === button;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-pressed", String(active));
        });
        gridCards.forEach((card) => {
          card.hidden = selected !== "all" && card.dataset.category !== selected;
          if (!card.hidden) visible += 1;
        });
        if (filterStatus) {
          filterStatus.textContent = `${visible}枚のイメージを表示しています。掲載写真は実際の配信状況を示すものではありません。`;
        }
      });
    });

    // 三排照片轻微来回滚动。触摸、悬停、键盘聚焦时暂停。
    const rails = [...document.querySelectorAll("[data-rail]")].map((element, index) => ({
      element,
      direction: Number(element.dataset.direction) || 1,
      speed: 9 + index * 2,
      visible: false,
      hover: false,
      focus: false,
      touching: false,
      pauseUntil: 0,
      position: 0,
    }));
    let paused = motion.matches;
    const motionButton = document.getElementById("motion-toggle");
    const playIcon = '<path d="m8 4 12 8-12 8Z"/>';
    const pauseIcon = '<path d="M8 5v14M16 5v14"/>';

    const syncMotionButton = () => {
      if (!motionButton) return;
      motionButton.setAttribute("aria-pressed", String(paused));
      const label = motionButton.querySelector("span");
      const icon = motionButton.querySelector("svg");
      if (label) label.textContent = paused ? "動きを再生" : "動きを止める";
      if (icon) icon.innerHTML = paused ? playIcon : pauseIcon;
    };
    if (motionButton) {
      motionButton.addEventListener("click", () => {
        paused = !paused;
        syncMotionButton();
      });
    }
    syncMotionButton();

    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            const rail = rails.find((item) => item.element === entry.target);
            if (rail) rail.visible = entry.isIntersecting;
          });
        }, { rootMargin: "40px" })
      : null;

    rails.forEach((rail) => {
      const el = rail.element;
      if (observer) observer.observe(el);
      else rail.visible = true;

      if (rail.direction < 0) el.scrollLeft = el.scrollWidth - el.clientWidth;
      rail.position = el.scrollLeft;

      el.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse") rail.hover = true;
      });
      el.addEventListener("pointerleave", () => { rail.hover = false; });
      el.addEventListener("pointerdown", () => {
        rail.touching = true;
        rail.pauseUntil = Infinity;
      });
      const release = () => {
        if (!rail.touching) return;
        rail.touching = false;
        rail.pauseUntil = performance.now() + 5500;
        rail.position = el.scrollLeft;
      };
      window.addEventListener("pointerup", release, { passive: true });
      window.addEventListener("pointercancel", release, { passive: true });
      window.addEventListener("blur", release);
      el.addEventListener("wheel", () => {
        rail.pauseUntil = performance.now() + 5500;
      }, { passive: true });
      el.addEventListener("scroll", () => {
        if (paused || rail.hover || rail.focus || rail.touching || performance.now() < rail.pauseUntil) {
          rail.position = el.scrollLeft;
        }
      }, { passive: true });
      el.addEventListener("focusin", () => { rail.focus = true; });
      el.addEventListener("focusout", (event) => {
        rail.focus = el.contains(event.relatedTarget);
        rail.position = el.scrollLeft;
      });
      el.addEventListener("keydown", (event) => {
        if (event.target !== el || !["ArrowRight", "ArrowLeft"].includes(event.key)) return;
        event.preventDefault();
        el.scrollBy({
          left: event.key === "ArrowRight" ? 180 : -180,
          behavior: motion.matches ? "auto" : "smooth",
        });
      });
    });

    let lastTime = performance.now();
    function animate(now) {
      const seconds = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (!paused && !document.hidden && !(dialog && dialog.open)) {
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
    if (rails.length) window.requestAnimationFrame(animate);

    // 背景视频：静音循环、行内播放；未配置、出错或自动播放受阻时保留封面。
    const video = document.getElementById("hero-video");
    const videoButton = document.getElementById("video-toggle");
    const media = document.querySelector(".hero-media");

    const updateVideoButton = () => {
      if (!video || !videoButton) return;
      const isPaused = video.paused;
      const label = videoButton.querySelector("span");
      const icon = videoButton.querySelector("svg");
      if (label) label.textContent = isPaused ? "動画を再生" : "動画を停止";
      videoButton.setAttribute("aria-label", isPaused ? "背景動画を再生" : "背景動画を一時停止");
      if (icon) icon.innerHTML = isPaused ? playIcon : pauseIcon;
    };

    const handlePlayFailure = () => {
      if (media) media.classList.remove("is-playing");
      // 自动播放受阻时允许手动播放；视频加载出错时隐藏按钮。
      if (videoButton) videoButton.hidden = Boolean(video && video.error);
      updateVideoButton();
    };
    const playVideo = () => {
      if (!video) return;
      try {
        const promise = video.play();
        if (promise && typeof promise.catch === "function") promise.catch(handlePlayFailure);
      } catch (error) {
        handlePlayFailure();
      }
    };

    if (video && BACKGROUND_VIDEO_URL.trim()) {
      video.style.objectPosition = BACKGROUND_VIDEO_POSITION;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = !motion.matches;

      video.addEventListener("loadeddata", () => {
        if (videoButton) videoButton.hidden = false;
        updateVideoButton();
      });
      video.addEventListener("playing", () => {
        if (media) media.classList.add("is-playing");
        if (videoButton) videoButton.hidden = false;
        updateVideoButton();
      });
      video.addEventListener("pause", updateVideoButton);
      video.addEventListener("error", () => {
        if (media) media.classList.remove("is-playing");
        if (videoButton) videoButton.hidden = true;
      });

      video.src = BACKGROUND_VIDEO_URL.trim();
      if (!motion.matches) playVideo();
      if (videoButton) {
        videoButton.addEventListener("click", () => {
          if (video.paused) playVideo();
          else video.pause();
        });
      }
    }

    const motionChange = (event) => {
      if (!event.matches) return;
      paused = true;
      syncMotionButton();
      if (video) video.pause();
    };
    if (typeof motion.addEventListener === "function") {
      motion.addEventListener("change", motionChange);
    } else if (typeof motion.addListener === "function") {
      motion.addListener(motionChange);
    }
  }

  // 兼容脚本放在页面底部，或使用 defer 加载。
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
