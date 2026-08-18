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

// ===== Ambient parallax background =====
// `#parallax-bg` is `position:fixed; inset:0`, so it already stays glued to
// the viewport (always full-bleed, zero gaps) while page content scrolls
// over it — that's the parallax illusion. No JS needed; translating this
// box on scroll used to push it off its own exactly-viewport-sized bounds,
// which is what caused the edge cropping.

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
  let animating = false;
  const ANIM_MS = 260;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const visibleItems = () => items.filter((item) => item.style.display !== "none");

  // The `download` attribute is silently ignored on file:// pages (common
  // when testing locally), which just navigates the tab instead of saving.
  // Opening the full image in a new tab works everywhere — the user can
  // save it from there themselves.
  const openImage = (src) => {
    window.open(src, "_blank", "noopener");
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
    item.addEventListener("click", (e) => {
      if (e.target.closest(".gi-download")) return; // handled separately below
      open(item);
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(item);
      }
    });
  });

  document.querySelectorAll(".gi-download").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openImage(btn.dataset.src);
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        openImage(btn.dataset.src);
      }
    });
  });

  prevBtn?.addEventListener("click", () => showAt(currentIndex - 1, -1));
  nextBtn?.addEventListener("click", () => showAt(currentIndex + 1, 1));
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  downloadBtn?.addEventListener("click", () => openImage(lightboxImage.src));

  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") showAt(currentIndex - 1, -1);
    if (e.key === "ArrowRight") showAt(currentIndex + 1, 1);
  });
})();
