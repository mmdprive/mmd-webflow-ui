(() => {
  "use strict";

  const root = document.querySelector("[data-tmib-home-v3]");
  if (!root || root.dataset.tmibBound === "true") return;

  root.dataset.tmibBound = "true";
  root.classList.add("is-js");

  const intro = root.querySelector("[data-intro]");
  const scenes = Array.from(root.querySelectorAll("[data-scene]"));
  const dots = Array.from(root.querySelectorAll("[data-scene-dot]"));
  const skipButton = root.querySelector("[data-intro-skip]");
  const nextButton = root.querySelector("[data-intro-next]");
  const replayButton = root.querySelector("[data-replay-intro]");
  const timerBar = root.querySelector("[data-timer-bar]");
  const status = root.querySelector("[data-intro-status]");
  const introExitLinks = Array.from(root.querySelectorAll("[data-intro-exit]"));
  const revealItems = Array.from(root.querySelectorAll(".tmibv3-reveal"));

  const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const rawAutoMs = Number.parseInt(root.dataset.autoMs || "6200", 10);
  const autoMs = Number.isFinite(rawAutoMs) ? Math.min(Math.max(rawAutoMs, 3500), 12000) : 6200;
  const storageKey = root.dataset.storageKey || "tmib_home_intro_v3";

  let activeIndex = 0;
  let timerId = 0;
  let paused = false;
  let pointerStartX = null;
  let destroyed = false;

  root.style.setProperty("--tmibv3-scene-ms", `${autoMs}ms`);

  function announce(message) {
    if (status) status.textContent = message || "";
  }

  function readSeenState() {
    try {
      return window.sessionStorage.getItem(storageKey) === "seen";
    } catch (_error) {
      return false;
    }
  }

  function markSeen() {
    try {
      window.sessionStorage.setItem(storageKey, "seen");
    } catch (_error) {
      // The experience remains usable when storage is unavailable.
    }
  }

  function lockPage() {
    document.documentElement.classList.add("tmibv3-lock");
    document.body.classList.add("tmibv3-lock");
  }

  function unlockPage() {
    document.documentElement.classList.remove("tmibv3-lock");
    document.body.classList.remove("tmibv3-lock");
  }

  function clearTimer() {
    window.clearTimeout(timerId);
    timerId = 0;
    root.classList.remove("is-timer-running");
  }

  function restartTimerAnimation() {
    if (!timerBar) return;
    root.classList.remove("is-timer-running");
    void timerBar.offsetWidth;
    root.classList.add("is-timer-running");
  }

  function scheduleNext() {
    clearTimer();

    if (
      paused ||
      reduceMotion.matches ||
      !root.classList.contains("is-intro-active") ||
      activeIndex >= scenes.length - 1
    ) {
      return;
    }

    restartTimerAnimation();
    timerId = window.setTimeout(() => {
      showScene(activeIndex + 1, true);
    }, autoMs);
  }

  function updateControls() {
    dots.forEach((dot, index) => {
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });

    if (nextButton) {
      nextButton.textContent = activeIndex === scenes.length - 1 ? "เข้า Home" : "ถัดไป";
      nextButton.setAttribute(
        "aria-label",
        activeIndex === scenes.length - 1 ? "จบ Intro และเข้าสู่ Home" : "ไป Scene ถัดไป"
      );
    }
  }

  function showScene(index, shouldAnnounce = false) {
    if (!scenes.length) return;

    activeIndex = Math.min(Math.max(index, 0), scenes.length - 1);

    scenes.forEach((scene, sceneIndex) => {
      const isActive = sceneIndex === activeIndex;
      scene.classList.toggle("is-active", isActive);
      scene.setAttribute("aria-hidden", isActive ? "false" : "true");

      if ("inert" in scene) {
        scene.inert = !isActive;
      }
    });

    updateControls();

    if (shouldAnnounce) {
      announce(`Scene ${activeIndex + 1} จาก ${scenes.length}`);
    }

    scheduleNext();
  }

  function startIntro(fromReplay = false) {
    if (!intro || !scenes.length) return;

    clearTimer();
    paused = false;
    root.classList.remove("is-complete");
    root.classList.add("is-intro-active");
    lockPage();
    showScene(0, fromReplay);
  }

  function finishIntro(options = {}) {
    const { remember = true, moveToHome = false } = options;

    clearTimer();
    root.classList.remove("is-intro-active");
    root.classList.add("is-complete");
    unlockPage();

    if (remember) markSeen();
    announce("เข้าสู่หน้า Home แล้ว");

    if (moveToHome) {
      window.requestAnimationFrame(() => {
        root.querySelector("[data-home-content]")?.scrollIntoView({
          block: "start",
          behavior: reduceMotion.matches ? "auto" : "smooth"
        });
      });
    }
  }

  function nextScene() {
    if (activeIndex >= scenes.length - 1) {
      finishIntro({ remember: true, moveToHome: true });
      return;
    }

    showScene(activeIndex + 1, true);
  }

  function previousScene() {
    showScene(activeIndex - 1, true);
  }

  function pauseIntro() {
    if (!root.classList.contains("is-intro-active")) return;
    paused = true;
    clearTimer();
  }

  function resumeIntro() {
    if (!root.classList.contains("is-intro-active")) return;
    paused = false;
    scheduleNext();
  }

  function bindImageFallbacks() {
    root.querySelectorAll("img").forEach((image) => {
      image.addEventListener(
        "error",
        () => {
          const fallback = image.dataset.fallbackSrc;

          if (fallback && image.src !== fallback) {
            image.src = fallback;
            return;
          }

          image.classList.add("has-image-error");
        },
        { once: true }
      );
    });
  }

  function bindRevealMotion() {
    if (!revealItems.length || reduceMotion.matches || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -9%", threshold: 0.08 }
    );

    revealItems.forEach((item) => observer.observe(item));
  }

  function onKeydown(event) {
    if (!root.classList.contains("is-intro-active")) return;

    const target = event.target;
    const tagName = target && target.tagName ? target.tagName.toLowerCase() : "";
    if (["input", "select", "textarea"].includes(tagName)) return;

    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      nextScene();
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousScene();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      finishIntro({ remember: true, moveToHome: true });
    }
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const index = Number.parseInt(dot.dataset.sceneDot || "0", 10);
      showScene(Number.isFinite(index) ? index : 0, true);
    });
  });

  skipButton?.addEventListener("click", () => {
    finishIntro({ remember: true, moveToHome: true });
  });

  nextButton?.addEventListener("click", nextScene);

  replayButton?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    startIntro(true);
  });

  introExitLinks.forEach((link) => {
    link.addEventListener("click", markSeen);
  });

  intro?.addEventListener("pointerdown", (event) => {
    pointerStartX = event.clientX;
  });

  intro?.addEventListener("pointerup", (event) => {
    if (pointerStartX === null) return;

    const distance = event.clientX - pointerStartX;
    pointerStartX = null;

    if (Math.abs(distance) < 48) return;
    if (distance < 0) nextScene();
    else previousScene();
  });

  intro?.addEventListener("pointercancel", () => {
    pointerStartX = null;
  });

  intro?.addEventListener("mouseenter", pauseIntro);
  intro?.addEventListener("mouseleave", resumeIntro);
  intro?.addEventListener("focusin", pauseIntro);
  intro?.addEventListener("focusout", () => {
    window.setTimeout(resumeIntro, 0);
  });

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseIntro();
    else resumeIntro();
  });

  window.addEventListener(
    "pagehide",
    () => {
      if (destroyed) return;
      destroyed = true;
      clearTimer();
      unlockPage();
    },
    { once: true }
  );

  bindImageFallbacks();
  bindRevealMotion();

  if (!intro || scenes.length < 2) {
    finishIntro({ remember: false, moveToHome: false });
    announce("Intro ไม่พร้อมใช้งาน แต่หน้า Home ยังเปิดได้ตามปกติ");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const introMode = params.get("intro");
  const shouldForceIntro = introMode === "1" || introMode === "replay";
  const shouldSkipIntro = introMode === "skip" || (readSeenState() && !shouldForceIntro);

  if (shouldSkipIntro) {
    finishIntro({ remember: false, moveToHome: false });
  } else {
    startIntro(false);
  }
})();
