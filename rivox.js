// rivox.full.js — Финальный SDK для сбора поведения и ML с логгером
(function () {
  const RIVOX_VERSION = "4.0.0";
  const idle = window.requestIdleCallback || (cb => setTimeout(() => cb({ timeRemaining: () => 50 }), 200));

  function flattenFeatures(state) {
    const out = {};
    const ctx = state.pageContext || {};
    const scroll = ctx.scroll_pattern || [];
    const hover = ctx.hover_time_on_cta || {};
    const hoverProduct = ctx.hover_time_on_product || {};
    const ecommerce = ctx.ecommerce_events || [];
    const goals = state.goals || [];
    const now = Date.now();

    out.user_agent = navigator.userAgent;
    out.device_type = /mobile/i.test(navigator.userAgent)
      ? "mobile"
      : /tablet|ipad/i.test(navigator.userAgent)
      ? "tablet"
      : "desktop";
    out.referer = document.referrer || null;

    const searchParams = new URLSearchParams(location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      out[key] = searchParams.get(key) || null;
    }

    out.scroll_chunk_count = scroll.length;
    out.scroll_jerk_count = scroll.filter(s => s.jerk).length;
    out.scroll_return_count = scroll.filter(s => s.return).length;
    out.scroll_idle_count = scroll.filter(s => s.idle).length;
    out.scroll_depth_max = scroll.reduce((max, s) => Math.max(max, s.pos || 0), 0);

    const hoverTimes = Object.values(hover).map(Number);
    out.hover_time_on_cta_avg = hoverTimes.length ? Math.round(hoverTimes.reduce((a, b) => a + b, 0) / hoverTimes.length) : 0;
    out.hover_time_on_cta_max = hoverTimes.length ? Math.max(...hoverTimes) : 0;

    const hoverTimesProd = Object.values(hoverProduct).map(Number);
    out.hover_time_on_product_avg = hoverTimesProd.length ? Math.round(hoverTimesProd.reduce((a, b) => a + b, 0) / hoverTimesProd.length) : 0;
    out.hover_time_on_product_max = hoverTimesProd.length ? Math.max(...hoverTimesProd) : 0;

    out.goals_count = goals.length;
    goals.forEach(g => {
      if (typeof g === "string") out[`goal_${g}`] = 1;
      else if (typeof g === "object" && g.name) out[`goal_${g.name}`] = 1;
    });

    out.ecommerce_event_count = ecommerce.length;
    const types = new Set();
    let cartCount = 0;
    let purchaseSum = 0;
    let currency = null;

    ecommerce.forEach(e => {
      if (!e || typeof e !== "object") return;
      if (e.type) types.add(e.type);
      if (e.type === "add_to_cart") cartCount++;
      if (e.type === "purchase") {
        purchaseSum += Number(e.revenue || 0);
        currency = e.currency || currency;
      }
    });

    out.ecommerce_event_types = [...types].join(",");
    out.ecommerce_add_to_cart_count = cartCount;
    out.ecommerce_purchase_value = Math.round(purchaseSum);
    out.ecommerce_currency = currency || "unknown";

    out.session_duration_sec = Math.round((now - state.sessionStart) / 1000);
    out.time_on_page_sec = Math.round(performance.now() / 1000);
    out.unknown_clicks_count = (state.unknown_clicks || []).length;
    out.form_interaction = ctx.form_interaction ? 1 : 0;

    out.clientToken = state.clientToken;
    out.session_id = state.sessionId;
    out.client_id = state.clientId;
    out.timestamp = new Date().toISOString();

    return out;
  }

  function sendWithRetry(url, body, retries = 3) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(err => {
      if (retries > 0) {
        setTimeout(() => sendWithRetry(url, body, retries - 1), 1000);
      } else {
        RIVOX.log?.error?.(err, { context: "fetch retry failed" });
      }
    });
  }

  const RIVOX = {
    config: { debugMode: false, endpoint: "", ymCounterId: null },
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

      this.log.init({ debugMode: this.config.debugMode, logEndpoint: endpoint + "/log" });
      this.getClientId();
      this.observeSPAChanges();
      this.trackHoverEnhanced();
      this.trackScrollPattern();
      this.trackEcommerceDataLayer();
      this.trackGoals();
      this.trackUnknownClicks();
      this.detectSuccessfulPayment();
      this.autoFlush();

      this.log.info(`✅ RIVOX v${RIVOX_VERSION} Initialized`, this.state.sessionId);
    },

    generateSessionId() {
      try {
        const crypto = window.crypto || window.msCrypto;
        const array = new Uint8Array(8);
        crypto.getRandomValues(array);
        return 'sess-' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('') + '-' + Date.now();
      } catch (e) {
        return 'sess-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
      }
    },

    getClientId() {
      try {
        const counterId = this.config.ymCounterId;
        if (typeof ym === "function" && counterId) {
          ym(counterId, 'getClientID', id => {
            this.state.clientId = id;
            try { localStorage.setItem('rivox_client_id', id); } catch (_) {}
          });
        } else {
          this.state.clientId = localStorage.getItem('rivox_client_id') || this.generateSessionId();
        }
      } catch (e) {
        this.state.clientId = this.generateSessionId();
        this.log?.error?.(e, { context: "getClientId fallback" });
      }
    },

    autoFlush() {
      window.addEventListener("beforeunload", () => this.sendSessionSummary());
      window.addEventListener("pagehide", () => this.sendSessionSummary());
      setTimeout(() => this.sendSessionSummary(), 15000);
    },

    sendSessionSummary() {
      if (this.state.summarySent) return;
      this.state.summarySent = true;

      const payload = flattenFeatures(this.state);
      const body = JSON.stringify(payload);
      const url = this.state.endpoint;

      if (navigator.sendBeacon) {
        const success = navigator.sendBeacon(url, body);
        if (success) return;
      }

      sendWithRetry(url, body);
    },

    reinitTrackers() {
      this.trackHoverEnhanced?.();
      this.trackScrollPattern?.();
      this.trackEcommerceDataLayer?.();
      this.trackGoals?.();
    },

    observeSPAChanges: function () {
      let lastURL = location.href;
      const debouncedHandle = () => {
        clearTimeout(this._spaTimer);
        this._spaTimer = setTimeout(() => {
          if (location.href !== lastURL) {
            lastURL = location.href;
            this.reinitTrackers?.();
          }
        }, 150);
      };
      const patch = (method) => {
        const orig = history[method];
        history[method] = function (...args) {
          const result = orig.apply(this, args);
          window.dispatchEvent(new Event("spa:navigation"));
          return result;
        };
      };
      patch("pushState");
      patch("replaceState");
      ["popstate", "hashchange", "spa:navigation", "changestate", "routeChanged", "locationchange"]
        .forEach(evt => window.addEventListener(evt, debouncedHandle, { passive: true }));
    },

    trackHoverEnhanced: function () {},
    trackScrollPattern: function () {},
    trackEcommerceDataLayer: function () {},
    trackGoals: function () {},
    trackUnknownClicks: function () {},
    detectSuccessfulPayment: function () {},
    sendGoal: function () {},
    defineGoal: function () {},
    generateStableSelector: function () {},
  };

  // логгер
  RIVOX.log = (function () {
    let config = { debugMode: false, logEndpoint: "", batch: [], batchTimeout: null, dedupErrors: new Set(), batchInterval: 3000 };

    function init(options = {}) {
      config.debugMode = !!options.debugMode;
      config.logEndpoint = options.logEndpoint || "";
    }

    function safe(fn) {
      try { fn(); } catch (e) {
        if (config.debugMode) console.warn("[RIVOX:logger error]", e);
      }
    }

    function logToConsole(level, ...args) {
      if (config.debugMode) console[level]?.("[RIVOX]", ...args);
    }

    function send(data) {
      if (!config.logEndpoint) return;
      const payload = JSON.stringify(data);
      navigator.sendBeacon?.(config.logEndpoint, new Blob([payload], { type: 'application/json' })) ||
        fetch(config.logEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    }

    function batch(entry) {
      config.batch.push(entry);
      if (!config.batchTimeout) {
        config.batchTimeout = setTimeout(() => {
          const b = [...config.batch];
          config.batch = [];
          config.batchTimeout = null;
          send({ type: "batch", logs: b });
        }, config.batchInterval);
      }
    }

    return {
      init,
      info(...args) {
        safe(() => { logToConsole("info", ...args); if (!config.debugMode) batch({ level: "info", args, timestamp: Date.now() }); });
      },
      error(error, ctx = {}) {
        safe(() => {
          logToConsole("error", error, ctx);
          const sig = error?.stack || error?.message || String(error);
          if (!config.dedupErrors.has(sig)) {
            config.dedupErrors.add(sig);
            send({ level: "error", message: error?.message, stack: error?.stack, context: ctx, timestamp: Date.now() });
          }
        });
      },
      event(type, payload = {}) {
        safe(() => { logToConsole("log", `[event] ${type}`, payload); if (!config.debugMode) batch({ level: "event", type, payload, timestamp: Date.now() }); });
      }
    };
  })();

  window.RIVOX = RIVOX;
})();
