(function () {
  const RIVOX_VERSION = "4.1.0";
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
      this.observeSPAChanges();
    },

    generateSessionId() {
      try {
        const crypto = window.crypto || window.msCrypto;
        const array = new Uint8Array(8);
        crypto.getRandomValues(array);
        return 'sess-' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('') + '-' + Date.now();
      } catch {
        return 'sess-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
      }
    },

    async getClientId() {
      const cookieId = document.cookie.match(/_ym_uid=([^;]+)/)?.[1];
      if (cookieId) {
        try { localStorage.setItem("rivox_client_id", cookieId); } catch {}
        this.log?.info?.("✅ client_id from cookie", cookieId);
        return cookieId;
      }

      const counterId = this.config.ymCounterId;
      if (!counterId || typeof ym !== "function") return "";

      return await new Promise(resolve => {
        let attempts = 0;
        const maxAttempts = 20;
        const interval = setInterval(() => {
          attempts++;
          if (typeof ym === "function") {
            try {
              ym(counterId, 'getClientID', id => {
                if (typeof id === "string" && id.length > 10) {
                  clearInterval(interval);
                  try { localStorage.setItem("rivox_client_id", id); } catch {}
                  this.log?.info?.("✅ client_id from ym(...)", id);
                  resolve(id);
                }
              });
            } catch {}
          }
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            this.log?.warn?.("⚠️ client_id not found via ym()");
            resolve("");
          }
        }, 250);
      });
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
      return {
        clientToken: state.clientToken,
        session_id: state.sessionId,
        client_id: state.clientId || localStorage.getItem("rivox_client_id") || "",
        user_agent: navigator.userAgent,
        device_type: /mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
        browser: navigator.userAgentData?.brands?.[0]?.brand || "",
        platform: navigator.userAgentData?.platform || navigator.platform || "",
        timestamp: new Date().toISOString(),
        rivox_version: RIVOX_VERSION,
        url: window.location.href,
        referrer: document.referrer || "",
        utm_source: this.getUTM("utm_source"),
        utm_medium: this.getUTM("utm_medium"),
        utm_campaign: this.getUTM("utm_campaign"),
        utm_content: this.getUTM("utm_content"),
        utm_term: this.getUTM("utm_term"),
        scroll_chunk_count: state.sessionMetrics.scroll_chunk_count || 0,
        scroll_depth_max: state.sessionMetrics.scroll_depth_max || 0,
        scroll_jerk_count: state.sessionMetrics.scroll_jerk_count || 0,
        scroll_idle_count: state.sessionMetrics.scroll_idle_count || 0,
        hover_time_on_cta_avg: state.sessionMetrics.hover_time_on_cta_avg || 0,
        hover_time_on_cta_max: state.sessionMetrics.hover_time_on_cta_max || 0,
        hover_time_on_product_avg: state.sessionMetrics.hover_time_on_product_avg || 0,
        hover_time_on_product_max: state.sessionMetrics.hover_time_on_product_max || 0,
        goals_count: state.goals?.length || 0,
        ecommerce_event_count: state.pageContext.ecommerce_event_count || 0,
        ecommerce_event_types: (state.pageContext.ecommerce_event_types || []).join(", "),
        ecommerce_add_to_cart_count: state.pageContext.ecommerce_add_to_cart_count || 0,
        ecommerce_purchase_value: state.pageContext.ecommerce_purchase_value || 0,
        ecommerce_currency: state.pageContext.ecommerce_currency || "RUB",
        session_duration_sec: Math.floor((now - state.sessionStart) / 1000),
        time_on_page_sec: Math.floor((now - state.sessionStart) / 1000),
        unknown_clicks_count: state.unknown_clicks.length || 0,
        form_interaction: state.pageContext.form_interaction || 0,
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
