(function () {
  const RIVOX_VERSION = "4.3.0";
  const idle = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 50 }), 200));

  const RIVOX = {
    config: {
      debugMode: false,
      endpoint: "",
      ymCounterId: null,
    },
    state: {
      clientToken: null,
      sessionId: null,
      clientId: null,
      sessionStart: Date.now(),
      summarySent: false,
      trafficSource: {},
      sessionMetrics: {},
      pageContext: {},
      missing_product_ids: [],
      unknown_clicks: [],
      goals: [],
    },

    async init(clientToken, endpoint, ymCounterId) {
      if (this._initialized) return;
      this._initialized = true;

      this.state.clientToken = clientToken;
      this.state.endpoint = endpoint;
      this.state.sessionId = this.generateSessionId();
      this.state.sessionStart = Date.now();
      this.config.ymCounterId = ymCounterId;

      this.state.clientId = await this.getClientId();
      this.saveUTMs();
      this.observeSPAChanges();
      this.interceptYMGoals();
    },

    start() {
      try {
        this.trackScroll();
        this.trackClicks();
        this.trackProductViews();
        this.trackFormModals();
        this.trackTabViews();
        this.trackFocus();
        this.trackReturnScroll();
        this.observeLateButtons();
      } catch (e) {
        this.log?.error?.("⚠️ error in start()", e);
      }
    },

    interceptYMGoals() {
      if (typeof ym !== "function") return;
      const originalYM = ym;
      window.ym = (...args) => {
        try {
          const [counterId, method, goalName] = args;
          if (method === 'reachGoal' && typeof goalName === 'string') {
            this.state.goals.push(goalName);
            this.log?.info?.("🎯 Goal intercepted:", goalName);
          }
        } catch (e) {
          this.log?.warn?.("⚠️ Failed to intercept goal", e);
        }
        return originalYM(...args);
      };
    },

    trackScroll() {
      let lastScrollTop = 0, maxDepth = 0, scrollChunks = 0, idleCount = 0, jerkCount = 0;
      let lastTime = Date.now();

      window.addEventListener("scroll", () => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

        const delta = Math.abs(scrollTop - lastScrollTop);
        if (delta > 30) jerkCount++;
        else idleCount++;

        scrollChunks++;
        maxDepth = Math.max(maxDepth, percent);
        lastScrollTop = scrollTop;
        lastTime = Date.now();

        Object.assign(this.state.sessionMetrics, {
          scroll_chunk_count: scrollChunks,
          scroll_depth_max: Math.floor(maxDepth),
          scroll_jerk_count: jerkCount,
          scroll_idle_count: idleCount
        });
      }, { passive: true });
    },

    trackClicks() {
      document.addEventListener("click", e => {
        const t = e.target.closest("a, button, input, [role='button']");
        if (!t) return;
        this.state.unknown_clicks.push({
          tag: t.tagName,
          id: t.id,
          class: t.className,
          name: t.name,
          text: t.innerText?.slice(0, 50),
          href: t.href || null
        });
      }, true);
    },

    trackFormModals() {
      const observer = new MutationObserver(() => {
        const forms = document.querySelectorAll("form, [class*='form'], [id*='form']");
        if (forms.length > 0) {
          this.state.pageContext.form_interaction = 1;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    trackProductViews() {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.state.pageContext.number_of_products_viewed =
              (this.state.pageContext.number_of_products_viewed || 0) + 1;
          }
        }
      }, { threshold: 0.5 });

      idle(() => {
        document.querySelectorAll(".product, [data-product-id], .product-card").forEach(el => observer.observe(el));
      });
    },

    trackTabViews() {
      window.addEventListener("focus", () => {
        this.state.pageContext.focus_time_on_product_card =
          (this.state.pageContext.focus_time_on_product_card || 0) + 1;
      });
    },

    trackFocus() {
      let focusTime = 0;
      let lastFocus = Date.now();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          lastFocus = Date.now();
        } else {
          focusTime += Date.now() - lastFocus;
          this.state.pageContext.focus_time_on_product_card = Math.floor(focusTime / 1000);
        }
      });
    },

    trackReturnScroll() {
      let lastY = window.scrollY;
      window.addEventListener("scroll", () => {
        const current = window.scrollY;
        if (current < lastY - 100) {
          this.state.pageContext.scroll_return_count =
            (this.state.pageContext.scroll_return_count || 0) + 1;
        }
        lastY = current;
      }, { passive: true });
    },

    observeLateButtons() {
      setTimeout(() => {
        document.querySelectorAll("button").forEach(b => {
          b.addEventListener("click", () => {
            this.state.pageContext.has_contact_info = 1;
          });
        });
      }, 3000);
    },

    sendSessionSummary() {
      if (this.state.summarySent) return;
      this.state.summarySent = true;

      const payload = this.flattenFeatures(this.state);
      const body = JSON.stringify(payload);
      const url = this.state.endpoint;

      const success = navigator.sendBeacon(url, body);
      if (!success) {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          mode: "no-cors"
        }).catch(err => {
          this.log?.error?.(err, { context: "sendSummary fallback" });
        });
      }
    },

    flattenFeatures(state) {
      const now = Date.now();
      const utms = this.getAllUTMs();
      return {
        clientToken: state.clientToken,
        session_id: state.sessionId,
        client_id: state.clientId || localStorage.getItem("rivox_client_id") || "",
        timestamp: new Date().toISOString(),
        url: window.location.href,
        referrer: document.referrer || "",
        user_agent: navigator.userAgent,
        device_type: /mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
        browser: this.detectBrowser(),
        platform: navigator.userAgentData?.platform || navigator.platform || "",
        rivox_version: RIVOX_VERSION,
        ...utms,
        scroll_chunk_count: state.sessionMetrics.scroll_chunk_count || 0,
        scroll_depth_max: state.sessionMetrics.scroll_depth_max || 0,
        scroll_jerk_count: state.sessionMetrics.scroll_jerk_count || 0,
        scroll_idle_count: state.sessionMetrics.scroll_idle_count || 0,
        hover_time_on_cta_avg: state.sessionMetrics.hover_time_on_cta_avg || 0,
        hover_time_on_cta_max: state.sessionMetrics.hover_time_on_cta_max || 0,
        hover_time_on_product_avg: state.sessionMetrics.hover_time_on_product_avg || 0,
        hover_time_on_product_max: state.sessionMetrics.hover_time_on_product_max || 0,
        goals_count: state.goals?.length || 0,
        goals: state.goals.join(", ") || "",
        ecommerce_event_count: state.pageContext.ecommerce_event_count || 0,
        ecommerce_event_types: (state.pageContext.ecommerce_event_types || []).join(", "),
        ecommerce_add_to_cart_count: state.pageContext.ecommerce_add_to_cart_count || 0,
        ecommerce_purchase_value: state.pageContext.ecommerce_purchase_value || 0,
        ecommerce_currency: state.pageContext.ecommerce_currency || "RUB",
        session_duration_sec: Math.floor((now - state.sessionStart) / 1000),
        time_on_page_sec: Math.floor((now - state.sessionStart) / 1000),
        unknown_clicks_count: state.unknown_clicks.length || 0,
        form_interaction: state.pageContext.form_interaction || 0,
        number_of_products_viewed: state.pageContext.number_of_products_viewed || 0,
        focus_time_on_product_card: state.pageContext.focus_time_on_product_card || 0,
        scroll_return_count: state.pageContext.scroll_return_count || 0,
        has_contact_info: state.pageContext.has_contact_info || 0
      };
    },

    getUTM(key) {
      try {
        const url = new URL(window.location.href);
        return url.searchParams.get(key) || localStorage.getItem(`rivox_${key}`);
      } catch {
        return null;
      }
    },

    getAllUTMs() {
      const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
      const obj = {};
      for (const k of keys) {
        obj[k] = this.getUTM(k);
      }
      return obj;
    },

    saveUTMs() {
      try {
        const url = new URL(window.location.href);
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(key => {
          const val = url.searchParams.get(key);
          if (val) localStorage.setItem(`rivox_${key}`, val);
        });
      } catch {}
    },

    detectBrowser() {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("yabrowser")) return "YaBrowser";
      if (ua.includes("chrome")) return "Chrome";
      if (ua.includes("safari")) return "Safari";
      if (ua.includes("firefox")) return "Firefox";
      if (ua.includes("edge")) return "Edge";
      if (ua.includes("opera") || ua.includes("opr")) return "Opera";
      return "Unknown";
    },

    observeSPAChanges() {
      const observer = new MutationObserver(() => {
        idle(() => this.sendSessionSummary());
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    log: {
      error: (msg, ctx) => console.error("[RIVOX]", msg, ctx),
      info: (msg, ctx) => console.info("[RIVOX]", msg, ctx),
      warn: (msg, ctx) => console.warn("[RIVOX]", msg, ctx)
    }
  };

  window.RIVOX = RIVOX;
})();
