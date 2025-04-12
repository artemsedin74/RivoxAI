(function () {
  const RIVOX_VERSION = "1.1.7";
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
      this.ym_uid = document.cookie.match(/_ym_uid=([^;]+)/)?.[1] || null;
      this.utm = new URLSearchParams(window.location.search);
      this.sessionStart = Date.now();
      this.sessionId = Date.now() + "-" + Math.random().toString(36).substring(2, 10);

      // Поведенческие параметры
      this.scrollDepth = 0;
      this.scrollCount = 0;
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

      // Устройство
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
            console.log('[RIVOX] Перехвачена цель Метрики:', goalName, goalData);
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

        const formKeywords = ["оставить заявку", "получить программу", "записаться", "купить", "заказать", "купить в 1 клик", "оплатить", "купить в кредит", "купить в рассрочку", "кредит", "рассрочка", "сплит", "выбор оплаты", "выбор метода оплаты"];
        const cartKeywords = ["в корзину", "добавить в корзину"];

        if (formKeywords.some(kw => lowered.includes(kw))) this.formSubmitted = 1;
        if (cartKeywords.some(kw => lowered.includes(kw))) this.visitedCart = 1;

        this.lastClickMeta = {
          click_tag: tag,
          click_text: finalText || '[no text]',
          click_id: id,
          click_class: className,
          click_name: name,
          click_href: href
        };
      }, { passive: true });
    },

    trackForms: function () {
      document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', () => {
          this.formSubmitted = 1;
        });
      });
    },

    trackScroll: function () {
      window.addEventListener('scroll', () => {
        this.scrollCount++;
        const scrollPosition = window.scrollY + window.innerHeight;
        const fullHeight = document.body.scrollHeight;
        const scrollDepth = (scrollPosition / fullHeight) * 100;
        if (scrollDepth > this.scrollDepth) {
          this.scrollDepth = scrollDepth.toFixed(0);
        }
      }, { passive: true });
    },

    trackProductViews: function () {
      const links = Array.from(document.querySelectorAll('a[href*="/product"], a[href*="/catalog"]'));
      const uniqueUrls = new Set();

      links.forEach(link => {
        const href = link.href;
        if (!href || uniqueUrls.has(href)) return;
        uniqueUrls.add(href);

        const wrapper = link.closest('[class]');
        if (!wrapper) return;

        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              if (this.productViews.has(href)) {
                this.returnedToProduct = 1;
              }
              this.productViews.add(href);
            }
          });
        }, { threshold: 0.5 });

        observer.observe(wrapper);
      });
    },

    trackProductFocus: function () {
      const links = Array.from(document.querySelectorAll('a[href*="/product"], a[href*="/catalog"]'));
      const uniqueUrls = new Set();

      links.forEach(link => {
        const href = link.href;
        if (!href || uniqueUrls.has(href)) return;
        uniqueUrls.add(href);

        const wrapper = link.closest('[class]');
        if (!wrapper) return;

        wrapper.addEventListener('mouseenter', () => {
          this.currentProductFocusStart = Date.now();
        });

        wrapper.addEventListener('mouseleave', () => {
          if (this.currentProductFocusStart) {
            this.productFocusTime += (Date.now() - this.currentProductFocusStart) / 1000;
            this.currentProductFocusStart = null;
          }
        });
      });
    },

    trackUnload: function () {
      window.addEventListener('beforeunload', () => {
        const timeOnPage = Math.round((Date.now() - this.sessionStart) / 1000);
        this.send('session_summary', {
          time_on_page: timeOnPage,
          scroll_depth: this.scrollDepth,
          scroll_count: this.scrollCount,
          click_count: this.clickCount,
          product_clicks: Array.from(this.productClickUrls),
          form_submitted: this.formSubmitted,
          visited_cart: this.visitedCart,
          purchase_completed: this.purchaseCompleted,
          number_of_products_viewed: this.productViews.size,
          returned_to_same_product: this.returnedToProduct,
          focus_time_on_product_card: Math.round(this.productFocusTime),
          ...(this.lastClickMeta || {})
        });
      });
    }
  };
})();
