(function () {
  const RIVOX_VERSION = "4.3.6";
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
      sessionMetrics: {
        scroll_chunk_count: 0,
        scroll_depth_max: 0,
        scroll_jerk_count: 0,
        scroll_idle_count: 0,
        hover_time_on_cta_avg: 0,
        hover_time_on_cta_max: 0,
        hover_time_on_product_avg: 0,
        hover_time_on_product_max: 0,
      },
      pageContext: {
        ecommerce_event_types: [],
      },
      unknown_clicks: [],
      goals: [],
    },

    async init(clientToken, endpoint, ymCounterId) {
      if (this._initialized) return;
      this._initialized = true;

      this.state.clientToken = clientToken;
      this.state.endpoint = endpoint;
      this.config.ymCounterId = ymCounterId;
      this.state.sessionStart = Date.now();

      this.state.sessionId = `sess-${Math.random().toString(36).substring(2)}-${Date.now()}`;
      this.state.clientId = await this.getClientId();

      this.log.info("RIVOX INIT", {
        sessionId: this.state.sessionId,
        clientId: this.state.clientId
      });

      this.saveUTMs();
      this.observeSPAChanges();
      this.interceptYMGoals();
    },

    start() {
      this.trackScroll();
      this.trackClicks();
      this.trackProductViews();
      this.trackFormModals();
      this.trackTabViews();
      this.trackFocus();
      this.trackReturnScroll();
      this.observeLateButtons();
      this.log.info("🟢 RIVOX tracking start");
    },

    trackScroll() {
      let lastY = window.scrollY, lastTime = Date.now();

      window.addEventListener("scroll", () => {
        const now = Date.now();
        const deltaY = Math.abs(window.scrollY - lastY);
        const deltaTime = now - lastTime;

        if (deltaY > 20) {
          this.state.sessionMetrics.scroll_chunk_count++;
          this.state.sessionMetrics.scroll_depth_max = Math.max(
            this.state.sessionMetrics.scroll_depth_max,
            Math.round((window.scrollY + window.innerHeight) / document.body.scrollHeight * 100)
          );
        }

        if (deltaY > 150) this.state.sessionMetrics.scroll_jerk_count++;
        if (deltaTime > 1000) this.state.sessionMetrics.scroll_idle_count++;

        lastY = window.scrollY;
        lastTime = now;
      });
    },

    trackClicks() {
      document.addEventListener("click", e => {
        const el = e.target.closest("a, button, .product, .cta");
        if (!el) return;

        const text = el.textContent?.trim()?.substring(0, 100);
        const cls = el.className || "";
        const href = el.href || "";
        const id = el.id || "";
        const tag = el.tagName;
        const name = el.name || "";

        this.state.unknown_clicks.push({ text, cls, href, id, tag, name });
      });
    },

    trackFocus() {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.state.sessionStart = Date.now();
        }
      });
    },

    observeLateButtons() {
      const observer = new MutationObserver(() => {
        // In future: auto-track appearing buttons
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    trackProductViews() {},
    trackFormModals() {},
    trackTabViews() {},
    trackReturnScroll() {},

    async getClientId() {
      try {
        let id = localStorage.getItem("rivox_client_id");
        if (!id) {
          id = String(Date.now()) + Math.random().toString(36).substring(2);
          localStorage.setItem("rivox_client_id", id);
        }
        return id;
      } catch (e) {
        this.log.error("getClientId failed", e);
        return null;
      }
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

    observeSPAChanges() {
      const observer = new MutationObserver(() => {
        idle(() => this.sendSessionSummary());
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    interceptYMGoals() {
      if (typeof ym !== "function") return;
      const originalYM = ym;
      window.ym = (...args) => {
        try {
          const [counterId, method, goalName] = args;
          if (method === 'reachGoal' && typeof goalName === 'string') {
            this.state.goals.push(goalName);
          }
        } catch {}
        return originalYM(...args);
      };
    },

    sendSessionSummary() {
      if (this.state.summarySent) return;
      this.state.summarySent = true;

      const payload = {
        ...this.state.sessionMetrics,
        ...this.getAllUTMs(),
        ...this.state.pageContext,
        session_id: this.state.sessionId,
        client_id: this.state.clientId,
        clientToken: this.state.clientToken,
        user_agent: navigator.userAgent,
        device_type: /mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
        browser: this.detectBrowser(),
        platform: navigator.platform,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        referrer: document.referrer || "",
        rivox_version: RIVOX_VERSION,
        product_clicks: this.state.unknown_clicks,
        goals_count: this.state.goals.length,
        goals: this.state.goals.join(","),
        session_duration_sec: Math.floor((Date.now() - this.state.sessionStart) / 1000),
        time_on_page_sec: Math.floor((Date.now() - this.state.sessionStart) / 1000),
        unknown_clicks_count: this.state.unknown_clicks.length
      };

      const body = JSON.stringify(payload);
      navigator.sendBeacon(this.state.endpoint, body);
    },

    getAllUTMs() {
      const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
      const obj = {};
      for (const k of keys) {
        obj[k] = localStorage.getItem(`rivox_${k}`) || null;
      }
      return obj;
    },

    detectBrowser() {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes("yabrowser")) return "YaBrowser";
      if (ua.includes("edge")) return "Microsoft Edge";
      if (ua.includes("chrome")) return "Chrome";
      if (ua.includes("safari")) return "Safari";
      if (ua.includes("firefox")) return "Firefox";
      if (ua.includes("opera") || ua.includes("opr")) return "Opera";
      return "Unknown";
    },

    log: {
      error: (msg, ctx) => console.error("[RIVOX]", msg, ctx),
      info: (msg, ctx) => console.info("[RIVOX]", msg, ctx),
      warn: (msg, ctx) => console.warn("[RIVOX]", msg, ctx),
    }
  };

  window.RIVOX = RIVOX;
})();
