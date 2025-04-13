/**
 * RIVOX SDK v4.6.2 — FULL TRACK MODE + ML + ECOMMERCE + SESSION END LOGIC
 * One-file tracking solution with no external dependencies
 */
(function () {
  const RIVOX_VERSION = "4.6.2";
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

    async getClientId() {
      let id = localStorage.getItem("rivox_client_id");
      if (!id) {
        id = Date.now() + Math.random().toString(36).slice(2);
        localStorage.setItem("rivox_client_id", id);
      }
      return id;
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

      window.addEventListener("beforeunload", () => {
        this.sendSessionSummary();
      });

      setTimeout(() => {
        this.sendSessionSummary();
      }, 20 * 60 * 1000); // 20 минут таймер

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

    trackScroll() {
      let maxDepth = 0, chunks = 0, jerk = 0, idleCount = 0, prevY = window.scrollY;
      let lastMove = Date.now();
      let lastIdleCheck = Date.now();
      const tick = () => {
        const y = window.scrollY;
        if (y !== prevY) {
          const d = Math.abs(y - prevY);
          chunks++;
          if (d > 200) jerk++;
          prevY = y;
          maxDepth = Math.max(maxDepth, y + window.innerHeight);
          lastMove = Date.now();
        } else if (Date.now() - lastIdleCheck > 300 && Date.now() - lastMove > 500) {
          idleCount++;
          lastIdleCheck = Date.now();
        }
        requestAnimationFrame(tick);
      };
      tick();
      this.state.sessionMetrics.scroll_chunk_count = () => chunks;
      this.state.sessionMetrics.scroll_jerk_count = () => jerk;
      this.state.sessionMetrics.scroll_idle_count = () => idleCount;
      this.state.sessionMetrics.scroll_depth_max = () => Math.floor(maxDepth);
    },

    trackClicks() {
      document.addEventListener("click", e => {
        const t = e.target;
        if (!t.closest(".cta-button, .product-card, .form, header, footer, nav")) {
          this.state.unknown_clicks.push({
            time: Date.now(),
            tag: t.tagName,
            text: t.innerText?.slice(0, 100)
          });
        }
      });
    },

    trackHover() {
      const hoverTracker = (selector, avgKey, maxKey) => {
        const times = [];
        document.querySelectorAll(selector).forEach(el => {
          let start = null;
          el.addEventListener("mouseenter", () => start = Date.now());
          el.addEventListener("mouseleave", () => {
            if (!start) return;
            const dur = Date.now() - start;
            times.push(dur);
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            this.state.sessionMetrics[avgKey] = Math.round(avg);
            this.state.sessionMetrics[maxKey] = Math.max(...times);
          });
        });
      };
      hoverTracker(".cta-button", "hover_time_on_cta_avg", "hover_time_on_cta_max");
      hoverTracker(".product-card", "hover_time_on_product_avg", "hover_time_on_product_max");
    },

    trackFormModals() {
      document.querySelectorAll("form, input, textarea").forEach(el => {
        el.addEventListener("focus", () => this.state.pageContext.form_interaction = 1);
      });
    },

    trackFocus() {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.state.pageContext.focus_time_on_product_card ??= 0;
          this._focusStart = Date.now();
        } else if (this._focusStart) {
          const dur = Date.now() - this._focusStart;
          this.state.pageContext.focus_time_on_product_card += dur;
        }
      });
    },

    trackReturnScroll() {
      let prev = 0;
      window.addEventListener("scroll", () => {
        const y = window.scrollY;
        if (y < prev) {
          this.state.pageContext.scroll_return_count ??= 0;
          this.state.pageContext.scroll_return_count++;
        }
        prev = y;
      });
    },

    trackEcommerce() {
      window.addEventListener("rivox:add_to_cart", () => {
        const ctx = this.state.pageContext;
        ctx.ecommerce_add_to_cart_count ??= 0;
        ctx.ecommerce_add_to_cart_count++;
        ctx.ecommerce_event_types ??= [];
        ctx.ecommerce_event_types.push("add_to_cart");
      });
    },

    trackEcommerceExtended() {
      const ctx = this.state.pageContext;
      const addEvent = (type) => {
        ctx.ecommerce_event_types ??= [];
        ctx.ecommerce_event_types.push(type);
        ctx.ecommerce_event_count = (ctx.ecommerce_event_count || 0) + 1;
      };
      window.addEventListener("rivox:purchase", e => {
        const detail = e.detail || {};
        ctx.ecommerce_purchase_value = Number(detail.value) || 0;
        ctx.ecommerce_currency = detail.currency || "USD";
        addEvent("purchase");
      });
      ["visited_cart", "submitted_order", "started_payment", "viewed_reviews", "viewed_specs"].forEach(event => {
        window.addEventListener(`rivox:${event}`, () => {
          ctx[`ecommerce_${event}`] = true;
          addEvent(event);
        });
      });
    },

    sendSessionSummary() {
      if (this.state.summarySent) return;
      this.state.summarySent = true;
      const now = Date.now();
      const data = {
        clientToken: this.state.clientToken,
        session_id: this.state.sessionId,
        client_id: this.state.clientId,
        timestamp: new Date().toISOString(),
        url: location.href,
        referrer: document.referrer,
        user_agent: navigator.userAgent,
        device_type: /mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
        browser: this.detectBrowser(),
        platform: navigator.platform,
        rivox_version: RIVOX_VERSION,
        ...this.getAllUTMs(),
        ...Object.fromEntries(Object.entries(this.state.sessionMetrics).map(([k, v]) => [k, typeof v === 'function' ? v() : v])),
        ...this.state.pageContext,
        goals_count: this.state.goals.length,
        goals: this.state.goals.join(", "),
        unknown_clicks_count: this.state.unknown_clicks.length,
        session_duration_sec: Math.floor((now - this.state.sessionStart) / 1000),
        time_on_page_sec: Math.floor((now - this.state.sessionStart) / 1000)
      };
      const body = JSON.stringify(data);
      const url = this.config.endpoint;
      const ok = navigator.sendBeacon(url, body);
      if (!ok) fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    },

    detectBrowser() {
      const ua = navigator.userAgent;
      if (ua.includes("Yandex")) return "YaBrowser";
      if (ua.includes("Chrome")) return "Chrome";
      if (ua.includes("Firefox")) return "Firefox";
      if (ua.includes("Safari")) return "Safari";
      return "Other";
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

    interceptYMGoals() {
      if (typeof ym !== "function") return;
      const originalYM = ym;
      window.ym = (...args) => {
        try {
          const [id, method, goal] = args;
          if (method === 'reachGoal' && goal) this.state.goals.push(goal);
        } catch {}
        return originalYM(...args);
      };
    },

    getUTM(key) {
      const url = new URL(location.href);
      return url.searchParams.get(key) || localStorage.getItem(`rivox_${key}`);
    },

    getAllUTMs() {
      return ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].reduce((acc, k) => {
        acc[k] = this.getUTM(k);
        return acc;
      }, {});
    },

    saveUTMs() {
      const url = new URL(location.href);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(key => {
        const val = url.searchParams.get(key);
        if (val) localStorage.setItem(`rivox_${key}`, val);
      });
    },

    observeSPAChanges() {
      new MutationObserver(() => {
        idle(() => this.sendSessionSummary());
      }).observe(document.body, { childList: true, subtree: true });
    },

    log: {
      info: (...args) => console.info("[RIVOX]", ...args),
      error: (...args) => console.error("[RIVOX]", ...args),
      warn: (...args) => console.warn("[RIVOX]", ...args)
    }
  };

  window.RIVOX = RIVOX;
})();
