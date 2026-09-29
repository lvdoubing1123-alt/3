/**
 * LIVE / 日语落地页交互脚本 — 平滑轨道版 smooth-20260929-1。
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

    // 横向自动滚动：整排 transform 动画，不再每一帧写入 scrollLeft。
    // 保留原来的 9 / 11 / 13 px/s 速度和到边缘折返的方式。
    // 手动滑动时交还原生滚动；恢复前记录当前位置，不跳回起点。
    const RAIL_SPEEDS = [9, 11, 13];
    const RAIL_RESUME_DELAY = 5500;
    const playIcon = '<path d="m8 4 12 8-12 8Z"/>';
    const pauseIcon = '<path d="M8 5v14M16 5v14"/>';
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const translate = (x) => `translate3d(${x}px, 0, 0)`;
    let paused = motion.matches;
    let keyboardNavigation = false;
    let pageActive = true;
    const motionButton = document.getElementById("motion-toggle");

    const rails = [...document.querySelectorAll("[data-rail]")].map((element, index) => {
      // CSS 未同时更新或浏览器不支持时，保留原生手动滚动，不破坏布局。
      if (typeof element.animate !== "function" ||
          getComputedStyle(element).getPropertyValue("--rail-transform-ready").trim() !== "1") {
        return null;
      }
      const track = document.createElement("div");
      track.className = "portrait-track";
      // 移动原节点而不克隆：图片点击事件、卡片顺序与可访问名称都保留。
      while (element.firstChild) track.appendChild(element.firstChild);
      element.appendChild(track);
      element.classList.add("rail-enhanced");
      const max = Math.max(0, element.scrollWidth - element.clientWidth);
      const direction = Number(element.dataset.direction) < 0 ? -1 : 1;
      element.scrollLeft = direction < 0 ? max : 0;
      return {
        element, track, max, direction,
        speed: RAIL_SPEEDS[index % RAIL_SPEEDS.length],
        animation: null, duration: 0, offset: 0,
        visible: false, warmed: false, hover: false, focused: false,
        touching: false, pointerId: null, drag: null,
        pauseUntil: 0, timer: 0, suppressClickUntil: 0,
        lastScroll: element.scrollLeft,
      };
    }).filter(Boolean);

    const syncMotionButton = () => {
      if (!motionButton) return;
      motionButton.setAttribute("aria-pressed", String(paused));
      const label = motionButton.querySelector("span");
      const icon = motionButton.querySelector("svg");
      if (label) label.textContent = paused ? "動きを再生" : "動きを止める";
      if (icon) icon.innerHTML = paused ? playIcon : pauseIcon;
    };

    // 只在交互、暂停或尺寸变化时读取动画进度；没有常驻的 JS 逐帧循环。
    function readRail(rail) {
      if (rail.animation && rail.duration > 0) {
        const time = Math.max(0, Number(rail.animation.currentTime) || 0);
        const phase = (time % (rail.duration * 2)) / rail.duration;
        const direction = phase < 1 ? 1 : -1;
        const progress = phase < 1 ? phase : 2 - phase;
        return {
          position: clamp(progress * rail.max + rail.element.scrollLeft, 0, rail.max),
          direction,
        };
      }
      return {
        position: clamp(rail.element.scrollLeft - rail.offset, 0, rail.max),
        direction: rail.direction,
      };
    }

    function writeNativePosition(rail, position) {
      const target = clamp(position, 0, rail.max);
      rail.track.style.transform = "none";
      rail.element.scrollLeft = target;
      rail.lastScroll = rail.element.scrollLeft;
      // 保留浏览器滚动坐标取整后的不足一个像素的差值，减少接管时的跳位。
      rail.offset = rail.lastScroll - target;
      rail.track.style.transform = translate(rail.offset);
    }

    function stopRail(rail) {
      if (!rail.animation) return;
      const state = readRail(rail);
      rail.animation.cancel();
      rail.animation = null;
      rail.direction = state.direction;
      writeNativePosition(rail, state.position);
      rail.element.classList.remove("is-auto-scrolling");
    }

    function canPlayRail(rail) {
      return !paused && pageActive && !document.hidden && !(dialog && dialog.open) &&
        rail.visible && !rail.hover && !rail.focused && !rail.touching &&
        performance.now() >= rail.pauseUntil && rail.max > 1;
    }

    function syncRail(rail) {
      if (!canPlayRail(rail)) {
        stopRail(rail);
        return;
      }
      if (rail.animation) return;
      const state = readRail(rail);
      rail.offset = 0;
      rail.track.style.transform = translate(-state.position);
      rail.element.scrollLeft = 0;
      rail.lastScroll = 0;
      rail.duration = rail.max / rail.speed * 1000;
      rail.element.classList.add("is-auto-scrolling");
      try {
        rail.animation = rail.track.animate([
          { transform: translate(0) },
          { transform: translate(-rail.max) },
        ], {
          duration: rail.duration,
          iterations: Infinity,
          direction: "alternate",
          easing: "linear",
          fill: "both",
        });
        rail.animation.pause();
        rail.animation.currentTime = state.direction > 0
          ? state.position / rail.speed * 1000
          : rail.duration + (rail.max - state.position) / rail.speed * 1000;
        rail.animation.play();
      } catch (error) {
        // 动画不可用时退回手动滚动；不会中断下方的图片、视频或下载功能。
        if (rail.animation) rail.animation.cancel();
        rail.animation = null;
        rail.element.classList.remove("is-auto-scrolling");
        writeNativePosition(rail, state.position);
      }
    }

    function syncRails() {
      rails.forEach(syncRail);
    }

    function holdRail(rail, delay = RAIL_RESUME_DELAY) {
      stopRail(rail);
      rail.pauseUntil = performance.now() + delay;
      clearTimeout(rail.timer);
      rail.timer = window.setTimeout(() => {
        rail.timer = 0;
        syncRail(rail);
      }, delay + 40);
    }

    if (motionButton) {
      motionButton.addEventListener("click", () => {
        paused = !paused;
        syncMotionButton();
        syncRails();
      });
    }
    syncMotionButton();

    document.addEventListener("keydown", (event) => {
      if (event.key === "Tab") keyboardNavigation = true;
    }, true);
    document.addEventListener("pointerdown", () => {
      keyboardNavigation = false;
    }, true);

    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            const rail = rails.find((item) => item.element === entry.target);
            if (!rail) return;
            rail.visible = entry.isIntersecting;
            if (rail.visible && !rail.warmed) {
              // 轨道接近视口时提前请求该排图片，避免边移动边等下一张加载。
              rail.warmed = true;
              rail.track.querySelectorAll('img[loading="lazy"]').forEach((img) => {
                img.loading = "eager";
              });
            }
            syncRail(rail);
          });
        }, { rootMargin: "80px 0px" })
      : null;

    rails.forEach((rail) => {
      const el = rail.element;
      if (observer) observer.observe(el);
      else rail.visible = true;

      el.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "mouse") return;
        rail.hover = true;
        syncRail(rail);
      });
      el.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "mouse") return;
        rail.hover = false;
        syncRail(rail);
      });
      el.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        rail.touching = true;
        rail.focused = false;
        rail.pointerId = event.pointerId;
        stopRail(rail);
        clearTimeout(rail.timer);
        rail.pauseUntil = Infinity;
        rail.drag = event.pointerType === "mouse" ? {
          x: event.clientX, y: event.clientY, scroll: el.scrollLeft, moved: false,
        } : null;
      }, { passive: true });
      el.addEventListener("pointermove", (event) => {
        const drag = rail.drag;
        if (!drag || event.pointerId !== rail.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved) {
          if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return;
          drag.moved = true;
          el.classList.add("is-dragging");
          try { el.setPointerCapture(event.pointerId); } catch (error) { /* 原生滚动仍可用。 */ }
        }
        event.preventDefault();
        el.scrollLeft = clamp(drag.scroll - dx, 0, rail.max);
        rail.suppressClickUntil = performance.now() + 400;
      });
      const release = (event) => {
        if (!rail.touching || (event && event.pointerId != null && event.pointerId !== rail.pointerId)) return;
        rail.touching = false;
        if (rail.drag && rail.drag.moved) rail.suppressClickUntil = performance.now() + 400;
        rail.drag = null;
        rail.pointerId = null;
        el.classList.remove("is-dragging");
        holdRail(rail);
      };
      window.addEventListener("pointerup", release, { passive: true });
      window.addEventListener("pointercancel", release, { passive: true });
      window.addEventListener("blur", release);
      el.addEventListener("lostpointercapture", release);
      el.addEventListener("dragstart", (event) => event.preventDefault());
      el.addEventListener("click", (event) => {
        if (performance.now() >= rail.suppressClickUntil) return;
        // 拖动只移动图片，不误触打开图片弹窗。
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      // 不拦截滚轮默认行为，上下浏览页面、触控板横滑和手机原生滑动都保留。
      el.addEventListener("wheel", () => holdRail(rail), { passive: true });
      el.addEventListener("scroll", () => {
        const current = el.scrollLeft;
        if (Math.abs(current - rail.lastScroll) < 0.01) return;
        if (rail.animation) stopRail(rail);
        rail.lastScroll = el.scrollLeft;
        if (!rail.touching) holdRail(rail);
      }, { passive: true });
      el.addEventListener("focusin", () => {
        rail.focused = keyboardNavigation;
        if (rail.focused) stopRail(rail);
      });
      el.addEventListener("focusout", (event) => {
        rail.focused = keyboardNavigation && el.contains(event.relatedTarget);
        syncRail(rail);
      });
      el.addEventListener("keydown", (event) => {
        if (event.target !== el || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        keyboardNavigation = true;
        rail.focused = true;
        holdRail(rail);
        const left = event.key === "Home" ? 0 : event.key === "End" ? rail.max :
          el.scrollLeft + (event.key === "ArrowRight" ? 180 : -180);
        el.scrollTo({ left: clamp(left, 0, rail.max), behavior: motion.matches ? "auto" : "smooth" });
      });
    });

    // 缓存轨道范围；仅窗口/卡片尺寸变化时重新测量，避免逐帧读写布局。
    let resizeFrame = 0;
    const measureRails = () => {
      resizeFrame = 0;
      rails.forEach((rail) => {
        const style = getComputedStyle(rail.element);
        const nextMax = Math.max(0, Math.round(rail.track.getBoundingClientRect().width +
          parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) - rail.element.clientWidth));
        if (Math.abs(nextMax - rail.max) < 1) return;
        const state = readRail(rail);
        stopRail(rail);
        rail.max = nextMax;
        writeNativePosition(rail, state.position);
        syncRail(rail);
      });
    };
    const queueMeasure = () => {
      if (!resizeFrame) resizeFrame = requestAnimationFrame(measureRails);
    };
    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(queueMeasure);
      rails.forEach((rail) => {
        resizeObserver.observe(rail.element);
        resizeObserver.observe(rail.track);
      });
    } else {
      window.addEventListener("resize", queueMeasure, { passive: true });
      window.addEventListener("load", queueMeasure, { once: true });
    }
    document.addEventListener("visibilitychange", syncRails);
    window.addEventListener("blur", () => { pageActive = false; syncRails(); });
    window.addEventListener("focus", () => { pageActive = true; syncRails(); });
    window.addEventListener("pagehide", () => { pageActive = false; syncRails(); });
    window.addEventListener("pageshow", () => { pageActive = true; syncRails(); queueMeasure(); });
    if (dialog) {
      const dialogObserver = new MutationObserver(syncRails);
      dialogObserver.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    }
    if (!observer) syncRails();

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
      syncRails();
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
