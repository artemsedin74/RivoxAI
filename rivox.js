(function () {
  const RIVOX_VERSION = "4.3.5";
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
        click_count: 0,
        scroll_chunk_count: 0,
        scroll_jerk_count: 0,
        scroll_idle_count: 0,
        scroll_depth_max: 0,
        scroll_count: 0
      },
      pageContext: {
        product_clicks: [],
        intent_stages: [],
      },
      unknown_clicks: [],
      missing_product_ids: [],
      goals: [],
    },

    async init(clientToken, endpoint, ymCounterId) {
      if (this._initialized) return;
      this._initialized = true;

      this.state.clientToken = clientToken;
      this.state.endpoint = endpoint;
      this.config.ymCounterId = ymCounterId;
      this.state.sessionStart = Date.now();
      this.state.sessionId = this.generateSessionId();

      const clientId = await this.getClientId();
      this.state.clientId = clientId || String(Date.now()) + Math.random().toString(36).substring(2);
      localStorage.setItem("rivox_client_id", this.state.clientId);

      this.saveUTMs();
      this.observeSPAChanges();
      this.interceptYMGoals();
    },

    start() {
      const wait = (n = 0) => {
        if (this.state.sessionId && this.state.clientId) {
          try {
            this.trackScroll();
            this.trackClicks();
            this.trackProductViews();
            this.trackHover();
            this.trackFormModals();
            this.trackTabViews();
            this.trackFocus();
            this.trackReturnScroll();
            this.observeLateButtons();
          } catch (e) {
            this.log?.error?.("RIVOX start error", e);
          }
        } else {
          if (n > 20) return;
          setTimeout(() => wait(n + 1), 150);
        }
      };
      wait();
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

    trackClicks() {
      document.addEventListener("click", (e) => {
        const t = e.target.closest("a, button, input, [role='button']");
        if (!t) return;
        this.state.sessionMetrics.click_count += 1;
        this.state.unknown_clicks.push({
          tag: t.tagName,
          id: t.id,
          class: t.className,
          name: t.name,
          text: t.innerText?.slice(0, 100),
          href: t.href || null
        });
      }, true);
    },

    trackScroll() {
      let lastY = window.scrollY;
      let maxDepth = 0;

      window.addEventListener("scroll", () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

        const delta = Math.abs(scrollTop - lastY);
        if (delta > 30) this.state.sessionMetrics.scroll_jerk_count++;
        else this.state.sessionMetrics.scroll_idle_count++;

        this.state.sessionMetrics.scroll_chunk_count++;
        this.state.sessionMetrics.scroll_count++;
        this.state.sessionMetrics.scroll_depth_max = Math.max(this.state.sessionMetrics.scroll_depth_max, Math.floor(percent));

        if (scrollTop < lastY - 100) {
          this.state.pageContext.scroll_return_count = (this.state.pageContext.scroll_return_count || 0) + 1;
        }

        lastY = scrollTop;
      }, { passive: true });
    },

    trackHover() {
      let hoverStart = null;
      const track = (selector, avgKey, maxKey) => {
        document.querySelectorAll(selector).forEach((el) => {
          el.addEventListener("mouseenter", () => {
            hoverStart = Date.now();
          });
          el.addEventListener("mouseleave", () => {
            const dur = Date.now() - hoverStart;
            const s = this.state.sessionMetrics;
            s[avgKey] = ((s[avgKey] || 0) + dur) / 2;
            s[maxKey] = Math.max(s[maxKey] || 0, dur);
          });
        });
      };
      idle(() => {
        track(".product", "hover_time_on_product_avg", "hover_time_on_product_max");
        track("button, .cta", "hover_time_on_cta_avg", "hover_time_on_cta_max");
      });
    },

    trackFormModals() {
      const observer = new MutationObserver(() => {
        const forms = document.querySelectorAll("form, [id*='form'], [class*='form']");
        if (forms.length > 0) {
          this.state.pageContext.form_interaction = 1;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    trackTabViews() {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.state.pageContext.intent_stages.push("tab_focus");
        }
      });
    },

    trackFocus() {
      let focusStart = Date.now();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          focusStart = Date.now();
        } else {
          const dur = Date.now() - focusStart;
          this.state.pageContext.focus_time_on_product_card =
            (this.state.pageContext.focus_time_on_product_card || 0) + Math.floor(dur / 1000);
        }
      });
    },

    trackReturnScroll() {
      // already handled inside trackScroll
    },

    observeLateButtons() {
      setTimeout(() => {
        document.querySelectorAll("button").forEach(b => {
          b.addEventListener("click", () => {
            this.state.pageContext.has_contact_info = 1;
          });
        });
      }, 2000);
    },

    trackProductViews() {
      const observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            this.state.pageContext.number_of_products_viewed =
              (this.state.pageContext.number_of_products_viewed || 0) + 1;
          }
        }
      }, { threshold: 0.5 });

      idle(() => {
        document.querySelectorAll(".product, .product-card, [data-product-id]").forEach(el => observer.observe(el));
      });
    },

    sendSessionSummary() {
      if (this.state.summarySent) return;
      if (!this.state.sessionId || !this.state.clientId) return;
      this.state.summarySent = true;

      const payload = this.flattenFeatures(this.state);
      const body = JSON.stringify(payload);
      const url = this.state.endpoint;

      const ok = navigator.sendBeacon(url, body);
      if (!ok) {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          mode: "no-cors"
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
        ...state.sessionMetrics,
        ...state.pageContext,
        goals_count: state.goals.length,
        goals: state.goals.join(", "),
        time_on_page_sec: Math.floor((now - state.sessionStart) / 1000),
        session_duration_sec: Math.floor((now - state.sessionStart) / 1000),
        unknown_clicks_count: state.unknown_clicks.length
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
      } catch {
        return null;
      }
    },

    generateSessionId() {
      return "sess-" + Math.random().toString(36).substring(2, 10) + "-" + Date.now();
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
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(k => {
          const v = url.searchParams.get(k);
          if (v) localStorage.setItem(`rivox_${k}`, v);
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
