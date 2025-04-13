/**
 * RIVOX SDK v4.6.0 — FULL TRACK MODE + ML FEATURES
 * One-file tracking solution with no external dependencies
 */
(function () {
  const RIVOX_VERSION = "4.6.0";
  const idle = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 50 }), 200));

  const RIVOX = {
    config: {
      debugMode: true,
      endpoint: "",
      ymCounterId: null
    },

    state: {
      clientToken: null,
      sessionId: null,
      clientId: null,
      sessionStart: Date.now(),
      summarySent: false,
      trafficSource: {},
      sessionMetrics: {},
      pageContext: {
        product_ids_viewed: [],
        action_history: [],
        intent_stages: [],
      },
      unknown_clicks: [],
      goals: []
    },

    async init(token, endpoint, ymId) {
      if (this._initialized) return;
      this._initialized = true;

      this.state.clientToken = token;
      this.config.endpoint = endpoint;
      this.config.ymCounterId = ymId;
      this.state.sessionId = `sess-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
      this.state.clientId = await this.getClientId();
      this.state.sessionStart = Date.now();

      this.saveUTMs();
      this.interceptYMGoals();
      this.observeSPAChanges();
      this.detectReturnVisit();
      this.checkContactInfo();
      this.detectPageType();
      this.observeCTA();

      this.log.info("RIVOX INIT", {
        sessionId: this.state.sessionId,
        clientId: this.state.clientId
      });
    },

    start() {
      const waitUntilReady = (attempt = 0) => {
        const ready = this.state.sessionId && this.state.clientId;
        if (ready) {
          try {
            this.trackScroll();
            this.trackClicks();
            this.trackHover();
            this.trackFormModals();
            this.trackFocus();
            this.trackReturnScroll();
            this.trackEcommerce();
            this.trackEcommerceExtended();
            this.trackProductViews();
            this.trackActionHistory();
            this.trackScrollSpeed();
            this.log.info("🟢 RIVOX tracking start");
          } catch (e) {
            this.log.error("⚠️ error in start()", e);
          }
        } else {
          if (attempt > 50) return;
          setTimeout(() => waitUntilReady(attempt + 1), 100);
        }
      };
      waitUntilReady();
    },

    detectPageType() {
      const url = location.pathname;
      const ctx = this.state.pageContext;
      if (url.includes("/cart")) ctx.page_type = "cart";
      else if (url.includes("/product")) ctx.page_type = "product";
      else if (url.includes("/catalog")) ctx.page_type = "catalog";
      else ctx.page_type = "other";
    },

    detectReturnVisit() {
      const key = "rivox_visited";
      if (localStorage.getItem(key)) {
        this.state.pageContext.return_visits = true;
      } else {
        localStorage.setItem(key, "1");
      }
    },

    checkContactInfo() {
      const bodyText = document.body.innerText;
      const hasEmail = bodyText.includes("@");
      const hasPhone = /\+?\d[\d\s\-()]{7,}/.test(bodyText);
      this.state.pageContext.has_contact_info = hasEmail || hasPhone;
    },

    observeCTA() {
      const el = document.querySelector(".cta-button");
      if (!el) return;
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.state.pageContext.cta_visible = true;
          }
        });
      });
      observer.observe(el);
    },

    trackProductViews() {
      const ctx = this.state.pageContext;
      const observer = new MutationObserver(() => {
        document.querySelectorAll(".product-card[data-product-id]").forEach(card => {
          const pid = card.getAttribute("data-product-id");
          if (pid && !ctx.product_ids_viewed.includes(pid)) {
            ctx.product_ids_viewed.push(pid);
            ctx.number_of_products_viewed = ctx.product_ids_viewed.length;
          } else if (pid && ctx.product_ids_viewed.includes(pid)) {
            ctx.returned_to_same_product = true;
          }
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    trackActionHistory() {
      const ctx = this.state.pageContext;
      const logAction = (type) => {
        const now = Date.now();
        ctx.action_history.push({ type, time: now });
        if (ctx.action_history.length > 1) {
          const deltas = ctx.action_history.map((a, i, arr) => i > 0 ? a.time - arr[i - 1].time : 0).filter(Boolean);
          ctx.delta_between_events = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
        }
      };
      ["rivox:add_to_cart", "rivox:purchase", "rivox:visited_cart", "click"].forEach(event => {
        window.addEventListener(event, () => logAction(event));
      });
    },

    trackScrollSpeed() {
      let lastY = window.scrollY;
      let lastTime = Date.now();
      const ctx = this.state.pageContext;
      const loop = () => {
        const now = Date.now();
        const dy = Math.abs(window.scrollY - lastY);
        const dt = now - lastTime;
        if (dt > 0) ctx.scroll_speed = Math.round(dy / (dt / 1000));
        lastY = window.scrollY;
        lastTime = now;
        requestAnimationFrame(loop);
      };
      loop();
    },

    // Остальные методы без изменений (trackScroll, trackClicks и т.д.) — см. предыдущую версию v4.5.0

    // sendSessionSummary остаётся прежним и включает все новые поля из pageContext/sessionMetrics

    log: {
      info: (...args) => console.info("[RIVOX]", ...args),
      error: (...args) => console.error("[RIVOX]", ...args),
      warn: (...args) => console.warn("[RIVOX]", ...args)
    }
  };

  window.RIVOX = RIVOX;
})();
