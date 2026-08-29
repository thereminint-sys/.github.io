// ===== Content protection (deterrent only, not real security — anyone can
// still view-source, disable JS, or use the browser menu to open devtools) =====
(function contentProtection() {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("selectstart", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    const key = e.key.toUpperCase();
    if (key === "F12") { e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (key === "U" || key === "S")) {
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === "I" || key === "J" || key === "C" || key === "K")) {
      e.preventDefault();
    }
  });
})();

// ===== Ambient parallax background scroll drift =====
// `#parallax-bg` is `position:fixed; inset:0`, so it always fully covers
// the viewport with zero gaps — translating that box itself on scroll (the
// usual parallax technique) used to push its edge past the viewport,
// cropping it. Instead this animates *which part* of the tall source image
// shows within that same always-full box: background-position-y slides
// from 0% (image top, at the top of the page) to 100% (image bottom, at
// the bottom of the page) as the visitor scrolls the full document height —
// same "background drifts at a different rate than the content" feel,
// with no risk of ever exposing an edge.
(function parallaxDrift() {
  const bg = document.getElementById("parallax-bg");
  if (!bg) return;

  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? window.scrollY / max : 0;
    bg.style.backgroundPositionY = `${progress * 100}%`;
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
})();

// ===== Wishlist click tracking (GA4) =====
// Fires a `wishlist_click` event with a `location` label (nav / hero /
// footer / drawer) so GA4 Explore can build a page_view -> wishlist_click
// funnel by traffic source. This only measures the click-through on our
// own domain — the actual "added to wishlist" action happens on Steam, and
// those numbers live in Steamworks > Traffic Stats (which already tracks
// this site as a referrer automatically, no code needed there).
(function wishlistTracking() {
  document.querySelectorAll("[data-wl-loc]").forEach((link) => {
    link.addEventListener("click", () => {
      if (typeof gtag === "function") {
        gtag("event", "wishlist_click", {
          location: link.dataset.wlLoc,
          page_language: document.documentElement.lang || "en",
        });
      }
    });
  });
})();

// ===== Demo CTA click tracking (GA4) =====
// Same pattern as wishlist_click above, for the "Play Free Demo" buttons
// (hero / footer / drawer). Kept as a separate event rather than folded
// into wishlist_click so the two calls-to-action can be compared in GA4
// Explore instead of blending into one number.
(function demoTracking() {
  document.querySelectorAll("[data-demo-loc]").forEach((link) => {
    link.addEventListener("click", () => {
      if (typeof gtag === "function") {
        gtag("event", "demo_click", {
          location: link.dataset.demoLoc,
          page_language: document.documentElement.lang || "en",
        });
      }
    });
  });
})();

// ===== Press card click tracking (GA4) =====
// Fires which outlet a visitor followed through to, so GA4 Explore can
// show which press mentions actually drive traffic off-site rather than
// just sitting on the page for trust.
(function pressTracking() {
  document.querySelectorAll(".press-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (typeof gtag === "function") {
        gtag("event", "press_click", {
          outlet: card.querySelector(".press-outlet")?.textContent || "",
          page_language: document.documentElement.lang || "en",
        });
      }
    });
  });
})();

// ===== Nav scroll state + wishlist button reveal =====
(function nav() {
  const nav = document.getElementById("site-nav");
  const navWishlist = document.getElementById("nav-wishlist");
  const hero = document.getElementById("hero");
  const footer = document.getElementById("site-footer");
  if (!nav || !hero) return;

  const onScroll = () => {
    nav.classList.toggle("nav-scrolled", window.scrollY > 40);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Nav's own Wishlist button only makes sense between the hero and footer,
  // since both of those sections already have their own Wishlist CTA.
  let heroVisible = true;
  let footerVisible = false;
  const updateWishlist = () => {
    navWishlist?.classList.toggle("show", !heroVisible && !footerVisible);
  };

  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      heroVisible = entry.isIntersecting;
      updateWishlist();
    },
    { threshold: 0.15 }
  );
  heroObserver.observe(hero);

  if (footer) {
    const footerObserver = new IntersectionObserver(
      ([entry]) => {
        footerVisible = entry.isIntersecting;
        updateWishlist();
      },
      { threshold: 0.15 }
    );
    footerObserver.observe(footer);
  }
})();

// ===== Mobile drawer =====
(function mobileMenu() {
  const toggle = document.getElementById("menu-toggle");
  const drawer = document.getElementById("mobile-drawer");
  const close = document.getElementById("drawer-close");
  if (!toggle || !drawer) return;

  const open = () => {
    drawer.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
  };
  const shut = () => {
    drawer.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", open);
  close?.addEventListener("click", shut);
  drawer.querySelectorAll("a").forEach((a) => a.addEventListener("click", shut));
})();

// ===== Language switcher (nav <details> + mobile drawer list) =====
(function langSwitch() {
  const details = document.querySelector(".lang-switch");
  if (details) {
    document.addEventListener("click", (e) => {
      if (details.open && !details.contains(e.target)) details.open = false;
    });
    details.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => { details.open = false; });
    });
  }
})();

// ===== Lazy-loaded feature videos =====
// The 5 feature videos (~1.8-3.8MB each) used to carry `autoplay`, which
// makes browsers start fetching all of them the moment the page loads —
// paid for by every visitor's first-load time whether they scroll down to
// see them or not. `preload="none"` plus a `poster` frame stops that
// upfront fetch; this only assigns `src` (triggering the download) and
// calls `.play()` once a video is actually about to enter the viewport,
// and pauses+releases it once scrolled away so looping videos further
// down the page don't all keep decoding in the background at once.
(function lazyVideos() {
  const videos = [...document.querySelectorAll("video[data-lazy-video]")];
  if (!videos.length) return;

  // `src` is deliberately not set in the HTML (it lives in data-src
  // instead) so no browser starts fetching until this assigns it —
  // toggling the `preload` attribute post-hoc doesn't reliably force a
  // fetch across browsers, but assigning `src` always does.
  const load = (video) => {
    if (video.dataset.loaded) return;
    video.dataset.loaded = "true";
    video.src = video.dataset.src;
    video.load();
  };

  if (!("IntersectionObserver" in window)) {
    videos.forEach((v) => { load(v); v.play().catch(() => {}); });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) {
          load(video);
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    },
    { rootMargin: "200px 0px" }
  );
  videos.forEach((v) => observer.observe(v));
})();

// ===== Scroll-triggered reveal animations =====
(function reveal() {
  const targets = document.querySelectorAll(".reveal, .reveal-stagger");
  if (!("IntersectionObserver" in window) || targets.length === 0) {
    targets.forEach((t) => t.classList.add("in-view"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
  );
  targets.forEach((t) => observer.observe(t));
})();

// ===== Media gallery tabs + horizontal nav =====
(function gallery() {
  const tabs = document.querySelectorAll(".gallery-tab");
  const items = document.querySelectorAll(".gallery-item");
  const track = document.getElementById("gallery-track");
  const prevBtn = document.getElementById("gallery-prev");
  const nextBtn = document.getElementById("gallery-next");
  if (!tabs.length || !track) return;

  const applyFilter = (filter) => {
    items.forEach((item) => {
      const show = filter === "all" || item.dataset.category === filter;
      item.style.display = show ? "" : "none";
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      applyFilter(tab.dataset.filter);
      track.scrollTo({ left: 0, behavior: "smooth" });
    });
  });

  const initialTab = document.querySelector(".gallery-tab.active") || tabs[0];
  applyFilter(initialTab.dataset.filter);

  const scrollAmount = () => track.clientWidth * 0.9;
  prevBtn?.addEventListener("click", () => track.scrollBy({ left: -scrollAmount(), behavior: "smooth" }));
  nextBtn?.addEventListener("click", () => track.scrollBy({ left: scrollAmount(), behavior: "smooth" }));
})();

// ===== Character roster horizontal nav =====
(function characterCarousel() {
  const track = document.getElementById("character-track");
  const prevBtn = document.getElementById("character-prev");
  const nextBtn = document.getElementById("character-next");
  if (!track) return;

  const scrollAmount = () => track.clientWidth * 0.9;
  prevBtn?.addEventListener("click", () => track.scrollBy({ left: -scrollAmount(), behavior: "smooth" }));
  nextBtn?.addEventListener("click", () => track.scrollBy({ left: scrollAmount(), behavior: "smooth" }));
})();

// ===== Prologue: Steam popup on click =====
(function prologueCarousel() {
  const track = document.getElementById("prologue-track");
  if (!track) return;

  // Steam news posts open as a real popup window rather than a new tab.
  track.querySelectorAll(".prologue-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(card.href, "steamNews", "width=1000,height=800,noopener,noreferrer");
    });
  });
})();

// ===== Press coverage: reveal in batches so a large, growing list stays
// light to paint and scannable instead of dumping everything at once =====
(function pressGrid() {
  const PAGE_SIZE = 12;
  const cards = [...document.querySelectorAll("#press-grid .press-card")];
  const loadMoreBtn = document.getElementById("press-load-more");
  if (!cards.length || !loadMoreBtn) return;

  // Below 768px, #press-grid becomes a horizontal scroll-snap track (see
  // CSS) instead of a wrapping grid — same pattern as Gallery/Prologue,
  // neither of which gates itself behind a "Load More" click either, so
  // press coverage shouldn't be the one section on mobile making you tap
  // a button before you can swipe through the rest.
  const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

  let shown = 0;
  const revealNext = () => {
    const pageSize = isMobile() ? cards.length : PAGE_SIZE;
    cards.slice(shown, shown + pageSize).forEach((card) => card.removeAttribute("hidden"));
    shown = Math.min(shown + pageSize, cards.length);
    loadMoreBtn.hidden = isMobile() || shown >= cards.length;
  };

  cards.forEach((card) => card.setAttribute("hidden", ""));
  revealNext();
  loadMoreBtn.addEventListener("click", revealNext);
})();

// ===== Gallery lightbox (full-screen view + prev/next/close/download) =====
(function galleryLightbox() {
  const items = [...document.querySelectorAll(".gallery-item")];
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightbox-image");
  const closeBtn = document.getElementById("lightbox-close");
  const downloadBtn = document.getElementById("lightbox-download");
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");
  const backdrop = lightbox?.querySelector(".lightbox-backdrop");
  if (!items.length || !lightbox || !lightboxImage) return;

  let currentIndex = -1;
  let currentOriginalSrc = "";
  let animating = false;
  const ANIM_MS = 260;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const visibleItems = () => items.filter((item) => item.style.display !== "none");

  // A real download via a temporary anchor's `download` attribute —
  // works because these images are same-origin, no CORS needed. Just
  // opening the image in a new tab (the old approach, needed back when
  // this was only ever tested over file://, where `download` is
  // silently ignored) left mobile visitors with no obvious way to save
  // it beyond a long-press; this triggers the OS's actual save/share
  // flow instead, on both mobile and desktop.
  const downloadImage = (src) => {
    const filename = src.split("/").pop().split("?")[0] || "download";
    const a = document.createElement("a");
    a.href = src;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // dir: 0 = no animation (initial open), 1 = advancing to next, -1 = back to prev.
  const showAt = (index, dir = 0) => {
    const visible = visibleItems();
    if (!visible.length || (animating && dir !== 0)) return;
    const newIndex = (index + visible.length) % visible.length;

    const applyImage = () => {
      currentIndex = newIndex;
      const item = visible[currentIndex];
      lightboxImage.src = item.dataset.full;
      lightboxImage.alt = item.dataset.alt || "";
      // `dataset.full` is a compressed webp used for on-screen viewing;
      // `dataset.original` (falls back to `full` for items without one)
      // is the uncompressed source the download button should save instead.
      currentOriginalSrc = item.dataset.original || item.dataset.full;
    };

    if (dir === 0 || reduceMotion) {
      applyImage();
      return;
    }

    animating = true;
    lightboxImage.classList.add(dir > 0 ? "lb-out-next" : "lb-out-prev");
    window.setTimeout(() => {
      applyImage();
      lightboxImage.classList.remove("lb-out-next", "lb-out-prev");
      lightboxImage.classList.add(dir > 0 ? "lb-in-next" : "lb-in-prev");
      void lightboxImage.offsetWidth; // force reflow so the entering position registers
      requestAnimationFrame(() => {
        lightboxImage.classList.remove("lb-in-next", "lb-in-prev");
        window.setTimeout(() => { animating = false; }, ANIM_MS);
      });
    }, ANIM_MS);
  };

  const open = (item) => {
    const visible = visibleItems();
    const startIndex = visible.indexOf(item);
    showAt(startIndex === -1 ? 0 : startIndex, 0);
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    lightbox.hidden = true;
    document.body.style.overflow = "";
  };

  items.forEach((item) => {
    item.addEventListener("click", () => open(item));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(item);
      }
    });
  });

  prevBtn?.addEventListener("click", () => showAt(currentIndex - 1, -1));
  nextBtn?.addEventListener("click", () => showAt(currentIndex + 1, 1));
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  downloadBtn?.addEventListener("click", () => downloadImage(currentOriginalSrc));

  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") showAt(currentIndex - 1, -1);
    if (e.key === "ArrowRight") showAt(currentIndex + 1, 1);
  });
})();
