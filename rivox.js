(function () {
  const RIVOX_VERSION = "4.3.1";
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
      this.state.sessionStart = Date.now();
      this.config.ymCounterId = ymCounterId;

      this.state.sessionId = this.generateSessionId();
      this.state.clientId = await this.getClientId();

      this.saveUTMs();
      this.observeSPAChanges();
      this.interceptYMGoals();

      this.log?.info?.("RIVOX INIT", {
        sessionId: this.state.sessionId,
        clientId: this.state.clientId
      });
    },

    start() {
      if (!this.state.sessionId || !this.state.clientId) {
        this.log?.warn?.("⏳ Tracking skipped: session/client ID missing");
        return;
      }
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

    // All track* methods unchanged

    sendSessionSummary() {
      if (this.state.summarySent) return;
      if (!this.state.sessionId || !this.state.clientId) {
        this.log?.warn?.("⏳ Skipping sendSessionSummary: identifiers not ready");
        return;
      }
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

    // All flattenFeatures, getUTM, getAllUTMs, saveUTMs, detectBrowser, observeSPAChanges, log unchanged
  };

  window.RIVOX = RIVOX;
})();
