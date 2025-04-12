(function () {
  const RIVOX_VERSION = "2.26.1";

  const SESSION_TIMEOUT = 30 * 60 * 1000;
  const isBot = /bot|crawl|spider|yandex|googlebot/i.test(navigator.userAgent);
  if (isBot) return;

  const CTA_KEYWORDS = ["купить", "заказать", "оформить", "в корзину", "buy", "add to cart", "checkout", "pay", "acheter", "kaufen", "comprar"];
  const TAB_KEYWORDS = ["description", "reviews", "characteristics", "описание", "отзывы", "характеристики"];

  function nowISO() { return new Date().toISOString(); }
  function nowMs() { return performance.now(); }

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      try {
        return sessionStorage.getItem(key);
      } catch (e2) {
        return null;
      }
    }
  }

  function safeSet(key, value) {
    try {
      return localStorage.setItem(key, value);
    } catch (e) {
      try {
        return sessionStorage.setItem(key, value);
      } catch (e2) {}
    }
  }

  function getProductId(el) {
    try {
      const raw = el?.getAttribute("data-product-id") ||
                  el?.getAttribute("data-id") ||
                  el?.getAttribute("href") ||
                  el?.innerText;
      const id = raw?.toString().trim().replace(/\s+/g, "");
      if (!id) return null;
      if (id.length < 3 || /^(\+?1|\d{1,2})$/.test(id) || id === "-") return null;
      return id;
    } catch (e) {
      return null;
    }
  }

  const Rivox = {
    config: { debugMode: false, counterId: null },

    state: {
      pageContext: {
        product_ids_viewed: [],
      },
      missing_product_ids: [],
      ...window.Rivox?.state || {}
    },

    debugLog(...args) {
      if (this.config.debugMode) console.log("[Rivox debug]", ...args);
    },

    collectProductIds() {
      try {
        const products = document.querySelectorAll("[data-product-id], .product-card, .product");
        products.forEach(el => {
          const id = getProductId(el);
          if (id && !this.state.pageContext.product_ids_viewed.includes(id)) {
            this.state.pageContext.product_ids_viewed.push(id);
          }
        });
      } catch (e) { this.debugLog("collectProductIds error", e); }
    },

    observeProductMutations() {
      let timeout;
      const observer = new MutationObserver(() => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.collectProductIds(), 500);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    sendSessionSummary() {
      try {
        if (this.state.summarySent) return;
        this.state.summarySent = true;
        const summary = {
          session_id: this.state.sessionId,
          client_id: this.state.clientId || null,
          timestamp: nowISO(),
          ...this.state.trafficSource,
          ...this.state.sessionMetrics,
          ...this.state.pageContext,
          missing_product_ids: this.state.missing_product_ids || [],
        };

        const body = JSON.stringify(summary);
        const sendUrl = this.state.endpoint;

        let sent = false;

        try {
          if (navigator.sendBeacon) {
            sent = navigator.sendBeacon(sendUrl, body);
            if (sent) return;
          }
        } catch (e) {
          this.debugLog("sendBeacon failed", e);
        }

        try {
          fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true
          });
        } catch (e2) {
          this.debugLog("fetch fallback failed", e2);
        }
      } catch (e) {
        this.debugLog("sendSessionSummary error", e);
      }
    },

    trackAutoGoals() {
      document.addEventListener("click", (e) => {
        const el = e.target.closest("[data-product-id], .product-card, .product");
        if (el) {
          const id = getProductId(el);
          if (id && !this.state.pageContext.product_ids_viewed.includes(id)) {
            const entry = {
              id,
              tag: el.tagName.toLowerCase(),
              selector: el.outerHTML.slice(0, 100),
              timestamp: nowISO()
            };
            const alreadyExists = this.state.missing_product_ids.some(x => x.id === entry.id);
            if (!alreadyExists) {
              this.state.missing_product_ids.push(entry);
              this.debugLog("missing_product_id", entry);
            }
          }
        }
      }, true);
    },

    init(token, endpoint, sessionIdOverride) {
      this.state.clientToken = token;
      this.state.endpoint = endpoint;
      this.state.sessionId = sessionIdOverride || this.generateSessionId();
    },

    autoInitIfConfigFound() {
      try {
        const scriptTag = document.querySelector('script[src*="rivox.js"]');
        if (!scriptTag) return;
        const token = scriptTag.dataset.token;
        const endpoint = scriptTag.dataset.endpoint;
        const sessionId = scriptTag.dataset.sessionId;
        if (token && endpoint) {
          this.init(token, endpoint, sessionId);
        }
      } catch (e) {
        this.debugLog("autoInitIfConfigFound error", e);
      }
    },

    generateSessionId() {
      return 'rivox-' + Math.random().toString(36).substr(2, 9);
    },

    start() {
      this.collectProductIds();
      this.observeProductMutations();
      this.trackAutoGoals();
    }
  };

  window.Rivox = Rivox;
  Rivox.autoInitIfConfigFound();
})();
