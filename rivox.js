(function () {
  const RIVOX_VERSION = "4.0.0";
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

    init(clientToken, endpoint, ymCounterId) {
      if (this._initialized) return;
      this._initialized = true;

      this.state.clientToken = clientToken;
      this.state.endpoint = endpoint;
      this.state.sessionId = this.generateSessionId();
      this.state.sessionStart = Date.now();
      this.config.ymCounterId = ymCounterId;

      this.getClientId();
      this.observeSPAChanges();
    },

    generateSessionId() {
      try {
        const crypto = window.crypto || window.msCrypto;
        const array = new Uint8Array(8);
        crypto.getRandomValues(array);
        return 'sess-' + Array.from(array)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('') + '-' + Date.now();
      } catch {
        return 'sess-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
      }
    },

    getClientId() {
      try {
        const counterId = this.config.ymCounterId;
        if (typeof ym === "function" && counterId) {
          ym(counterId, 'getClientID', id => {
            this.state.clientId = id;
            try {
              localStorage.setItem('rivox_client_id', id);
            } catch (_) {}
          });
        } else {
          this.state.clientId = localStorage.getItem('rivox_client_id') || this.generateSessionId();
        }
      } catch (e) {
        this.state.clientId = this.generateSessionId();
        this.log?.error?.(e, { context: "getClientId fallback" });
      }
    },

    sendSessionSummary() {
      if (this.state.summarySent) return;
      this.state.summarySent = true;

      const payload = this.flattenFeatures(this.state);
      const body = JSON.stringify(payload);
      const url = this.state.endpoint;

      // Надежная отправка через sendBeacon (обход CORS)
      const success = navigator.sendBeacon(url, body);
      if (!success) {
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body,
          mode: "no-cors"
        }).catch(err => {
          this.log?.error?.(err, { context: "sendSummary fallback" });
        });
      }
    },

    flattenFeatures(state) {
      return {
        clientToken: state.clientToken,
        session_id: state.sessionId,
        client_id: state.clientId,
        user_agent: navigator.userAgent,
        device_type: /mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
        utm_source: this.getUTM("utm_source"),
        utm_medium: this.getUTM("utm_medium"),
        utm_campaign: this.getUTM("utm_campaign"),
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
        ecommerce_event_types: state.pageContext.ecommerce_event_types || [],
        ecommerce_add_to_cart_count: state.pageContext.ecommerce_add_to_cart_count || 0,
        ecommerce_purchase_value: state.pageContext.ecommerce_purchase_value || 0,
        ecommerce_currency: state.pageContext.ecommerce_currency || "RUB",
        session_duration_sec: Math.floor((Date.now() - state.sessionStart) / 1000),
        time_on_page_sec: Math.floor((Date.now() - state.sessionStart) / 1000),
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
      error: (msg, ctx) => console.error("[RIVOX]", msg, ctx)
    }
  };

  window.RIVOX = RIVOX;
})();
