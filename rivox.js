(function () {
  const RIVOX_VERSION = "1.1.11";
  const isBot = /bot|crawl|spider|yandex|googlebot/i.test(navigator.userAgent);
  if (isBot) return;

  function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    if (/mobile|android|iphone|ipod|blackberry|phone/.test(ua)) return 'mobile';
    if (/tablet|ipad/.test(ua)) return 'tablet';
    return 'desktop';
  }

  window.Rivox = {
    init: function (clientToken, endpoint) {
      this.clientToken = clientToken;
      this.endpoint = endpoint;

      this.utm = new URLSearchParams(window.location.search);
      this.ym_uid = document.cookie.match(/_ym_uid=([^;]+)/)?.[1] || localStorage.getItem("rivox_client_id") || null;

      if (this.ym_uid) localStorage.setItem("rivox_client_id", this.ym_uid);
      ["utm_source", "utm_campaign", "utm_medium"].forEach(param => {
        const value = this.utm.get(param);
        if (value) localStorage.setItem(`rivox_${param}`, value);
      });
      ["utm_source", "utm_campaign", "utm_medium"].forEach(param => {
        if (!this.utm.get(param)) {
          const saved = localStorage.getItem(`rivox_${param}`);
          if (saved) this.utm.set(param, saved);
        }
      });

      this.sessionStart = Date.now();
      this.sessionId = Date.now() + "-" + Math.random().toString(36).substring(2, 10);

      // Поведенческие параметры
      this.scrollDepth = 0;
      this.scrollCount = 0;
      this.scrollSpeed = 0;
      this.lastScrollTime = Date.now();
      this.clickCount = 0;
      this.eventCount = 0;
      this.productViews = new Set();
      this.productClickUrls = new Set();
      this.returnedToProduct = 0;
      this.productFocusTime = 0;
      this.currentProductFocusStart = null;

      // События
      this.visitedCart = 0;
      this.formSubmitted = 0;
      this.purchaseCompleted = 0;
      this.intentStages = [];

      // Доп. фичи
      this.pagesViewed = 1;
      this.pageType = document.body.getAttribute("data-page-type") || '';
      this.actionHistory = [];
      this.returnVisits = localStorage.getItem("rivox_return_visits") || 0;
      this.formInteraction = 0;
      this.ctaVisible = 0;
      this.hasContactInfo = /(\+7|8\d{10}|@|\d{3}-\d{3}-\d{4})/.test(document.body.innerText) ? 1 : 0;

      localStorage.setItem("rivox_return_visits", Number(this.returnVisits) + 1);

      this.deviceType = detectDevice();
      this.browser = navigator.userAgentData?.brands?.[0]?.brand || navigator.userAgent;
      this.platform = navigator.userAgentData?.platform || navigator.platform;

      this.lastClickMeta = {};

      const cartPaths = ["/cart", "/basket", "/checkout", "/order", "/korzina"];
      const successPaths = ["/thank-you", "/order-success", "/spasibo", "/success"];
      const path = window.location.pathname.toLowerCase();
      if (cartPaths.some(p => path.includes(p))) this.visitedCart = 1;
      if (successPaths.some(p => path.includes(p))) this.purchaseCompleted = 1;

      this.waitForClientID = new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (typeof ym === 'function') {
            try {
              ym(94550231, 'getClientID', (clientID) => {
                this.ym_uid = clientID;
                localStorage.setItem("rivox_client_id", clientID);
                clearInterval(interval);
                resolve();
              });
            } catch (e) {
              clearInterval(interval);
              resolve();
            }
          }
          if (attempts > 20) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    },

    start: function () {
      this.waitForClientID.then(() => {
        try {
          this.trackClicks();
          this.trackForms();
          this.trackScroll();
          this.trackProductViews();
          this.trackProductFocus();
          this.trackUnload();
          this.interceptYandexGoals();

          this.send("session_start", {
            url: window.location.href,
            client_id: this.ym_uid,
            referrer: document.referrer
          });

          setTimeout(() => {
            this.send("session_idle_ping", {
              idle_ping: 1,
              url: window.location.href,
              client_id: this.ym_uid
            });
          }, 15000);
        } catch (err) {
          this.send("error", { debug: err.toString() });
        }
      });
    },

    send: function (event, data = {}) {
      if (!this.endpoint || this.eventCount > 50) return;
      this.eventCount++;

      const truncate = (v) => typeof v === "string" ? v.slice(0, 150) : v;

      const payload = {
        event,
        session_id: this.sessionId,
        clientToken: this.clientToken,
        client_id: this.ym_uid,
        utm_source: this.utm.get('utm_source'),
        utm_campaign: this.utm.get('utm_campaign'),
        utm_medium: this.utm.get('utm_medium'),
        url: window.location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        device_type: this.deviceType,
        browser: this.browser,
        platform: this.platform,
        timestamp: new Date().toISOString(),
        rivox_version: RIVOX_VERSION,
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, truncate(v)]))
      };

      navigator.sendBeacon(this.endpoint, JSON.stringify(payload));
      console.log("[RIVOX]", payload);
    },

    interceptYandexGoals: function () {
      const originalYm = window.ym;
      window.ym = function (...args) {
        try {
          if (args[1] === 'reachGoal') {
            const goalName = args[2];
            const goalData = args[3] || {};
            if (window.Rivox?.send) {
              window.Rivox.send('yandex_goal', {
                goal_name: goalName,
                ...goalData
              });
            }
          }
        } catch (e) {
          console.warn('[RIVOX] Ошибка при перехвате ym:', e);
        }
        return originalYm?.apply?.(this, args);
      };
    },

    trackClicks: function () {
      document.addEventListener('click', (e) => {
        this.clickCount++;
        this.actionHistory.push(`click:${e.target?.innerText?.slice(0, 20)}`);

        let el = e.target;
        while (el && el.tagName && el.tagName !== 'BODY') {
          const text = (el.innerText || '').trim();
          if (text.length >= 3) break;
          el = el.parentElement;
        }

        if (!el) return;

        const tag = el.tagName || '';
        const text = (el.innerText || '').trim().slice(0, 100);
        const htmlText = (el.innerHTML || '').replace(/<[^>]+>/g, '').trim().slice(0, 100);
        const id = el.id || '';
        const className = el.className || '';
        const name = el.name || '';
        const href = el.href || '';
        const finalText = text || htmlText || '';
        const lowered = finalText.toLowerCase();

        const matchAny = (keywords) => keywords.some(k => lowered.includes(k));
        if (matchAny(["купить", "заказать", "оплатить", "в 1 клик"])) {
          this.formSubmitted = 1;
          this.intentStages.push("clicked_buy");
        }
        if (matchAny(["в корзину", "добавить в корзину", "корзина"])) {
          this.vis
