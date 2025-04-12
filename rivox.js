// rivox.js v2.26.3
const RIVOX_VERSION = "2.26.3";

window.Rivox = {
  state: {
    sessionId: null,
    clientId: null,
    sessionStart: Date.now(),
    endpoint: "",
    clientToken: "",
    summarySent: false,
    trafficSource: {},
    sessionMetrics: {},
    pageContext: {},
    missing_product_ids: []
  },

  config: {
    debugMode: true,
  },

  debugLog(...args) {
    if (this.config.debugMode) console.log("[Rivox]", ...args);
  },

  init(token, endpoint) {
    try {
      this.state.clientToken = token;
      this.state.endpoint = endpoint;
      this.state.sessionId = this.generateSessionId();
      this.state.sessionStart = Date.now();
      this.debugLog("✅ Rivox initialized", this.state.sessionId);
    } catch (e) {
      this.debugLog("❌ init error", e);
    }
  },

  start() {
    try {
      // Fallback через 15 сек
      setTimeout(() => {
        if (!this.state.summarySent) {
          this.debugLog("🔁 Fallback sendSessionSummary()");
          this.sendSessionSummary();
        }
      }, 15000);

      // Отправка при закрытии вкладки
      window.addEventListener("beforeunload", () => {
        try { this.sendSessionSummary(); } catch (e) {}
      });
      window.addEventListener("pagehide", () => {
        try { this.sendSessionSummary(); } catch (e) {}
      });
    } catch (e) {
      this.debugLog("❌ Rivox.start() error", e);
    }
  },

  sendSessionSummary() {
    try {
      this.debugLog("🚀 sendSessionSummary triggered");
      if (this.state.summarySent) return;
      this.state.summarySent = true;

      const summary = {
        session_id: this.state.sessionId,
        client_id: this.state.clientId || null,
        timestamp: new Date().toISOString(),
        ...this.state.trafficSource,
        ...this.state.sessionMetrics,
        ...this.state.pageContext,
        missing_product_ids: this.state.missing_product_ids || []
      };

      const body = JSON.stringify(summary);
      const sendUrl = this.state.endpoint;

      this.debugLog("📦 Payload:", summary);

      // Попытка отправить через sendBeacon
      if (navigator.sendBeacon) {
        const sent = navigator.sendBeacon(sendUrl, body);
        this.debugLog("🛰 sendBeacon status:", sent);
        if (sent) return;
      }

      // Fallback через fetch (без no-cors)
      const formData = new URLSearchParams();
      formData.append("data", body);

      fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString()
      })
        .then(() => this.debugLog("✅ fetch fallback succeeded"))
        .catch(e => this.debugLog("❌ fetch fallback error:", e));

    } catch (e) {
      this.debugLog("❌ sendSessionSummary error:", e);
    }
  },

  generateSessionId() {
    return "sess-" + Math.random().toString(36).substring(2, 12) + "-" + Date.now();
  },

  debugFlush() {
    try {
      const summary = {
        session_id: this.state.sessionId,
        client_id: this.state.clientId || null,
        timestamp: new Date().toISOString(),
        ...this.state.trafficSource,
        ...this.state.sessionMetrics,
        ...this.state.pageContext,
        missing_product_ids: this.state.missing_product_ids || []
      };
      this.debugLog("SUMMARY PREVIEW", summary);
    } catch (e) {
      this.debugLog("debugFlush error", e);
    }
  }
};
