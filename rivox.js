(function () {
  const RIVOX_VERSION = "4.3.7";
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
      this.config.endpoint = endpoint;
      this.state.sessionStart = Date.now();
      this.config.ymCounterId = ymCounterId;

      this.state.sessionId = `sess-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;

      const clientId = await this.getClientId();
      this.state.clientId = clientId;

      this.saveUTMs();
      this.observeSPAChanges();
      this.interceptYMGoals();

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
            this.trackScroll?.();
            this.trackClicks?.();
            this.trackProductViews?.();
            this.trackFormModals?.();
            this.trackTabViews?.();
            this.trackFocus?.();
            this.trackReturnScroll?.();
            this.observeLateButtons?.();
            this.log.info("🟢 RIVOX tracking start");
          } catch (e) {
            this.log.error("⚠️ error in start()", e);
          }
        } else {
          if (attempt > 50) {
            this.log.warn("⏳ Tracking aborted after timeout");
            return;
          }
          setTimeout(() => waitUntilReady(attempt + 1), 100);
        }
      };
      waitUntilReady();
    },

    interceptYMGoals() {
      if (typeof ym !== "function") return;
      const originalYM = ym;
      window.ym = (...args) => {
        try {
          const [counterId, method, goalName] = args;
          if (method === 'reachGoal' && typeof goalName === 'string') {
            this.state.goals.push(goalName);
            this.log.info("🎯 Goal intercepted:", goalName);
          }
        } catch (e) {
          this.log.warn("⚠️ Failed to intercept goal", e);
        }
        return originalYM(...args);
      };
    },

    sendSessionSummary() {
      if (this.state.summarySent) return;
      if (!this.state.sessionId || !this.state.clientId) {
        this.log.warn("⏳ Skipping sendSessionSummary: identifiers not ready");
        return;
      }
      this.state.summarySent = true;

      const payload = this.flattenFeatures(this.state);
      const body = JSON.stringify(payload);
      const url = this.config.endpoint;

      const success = navigator.sendBeacon(url, body);
      if (!success) {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          mode: "no-cors"
        }).catch(err => {
          this.log.error(err, { context: "sendSummary fallback" });
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
      if (ua.includes("edge")) return "Microsoft Edge";
      if (ua.includes("chrome")) return "Chrome";
      if (ua.includes("safari")) return "Safari";
      if (ua.includes("firefox")) return "Firefox";
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
