(function () {
  const RIVOX_VERSION = "1.0.8";
  const isBot = /bot|crawl|spider|yandex|googlebot/i.test(navigator.userAgent);
  if (isBot) return;

  window.Rivox = {
    init: function (clientToken, endpoint) {
      this.clientToken = clientToken;
      this.endpoint = endpoint;
      this.ym_uid = document.cookie.match(/_ym_uid=([^;]+)/)?.[1] || null;
      this.utm = new URLSearchParams(window.location.search);
      this.sessionStart = Date.now();
      this.sessionId = Date.now() + "-" + Math.random().toString(36).substring(2, 10);
      this.sentScroll = false;
      this.scrollCount = 0;
      this.clickCount = 0;
      this.eventCount = 0;
      this.productViews = new Set();
      this.productClickUrls = new Set();
      this.returnedToProduct = false;
      this.productFocusTime = 0;
      this.currentProductFocusStart = null;
      this.visitedCart = false;
      this.formSubmitted = false;
      this.purchaseCompleted = false;
      this.lastClickMeta = {};

      const cartPaths = ["/cart", "/basket", "/checkout", "/order", "/korzina"];
      const successPaths = ["/thank-you", "/order-success", "/spasibo", "/success"];
      const path = window.location.pathname.toLowerCase();
      if (cartPaths.some(p => path.includes(p))) this.visitedCart = true;
      if (successPaths.some(p => path.includes(p))) this.purchaseCompleted = true;

      this.waitForClientID = new Promise((resolve) => {
        if (typeof ym === "function") {
          try {
            ym(94550231, 'getClientID', (clientID) => {
              this.ym_uid = clientID;
              resolve();
            });
          } catch (e) {
            resolve();
          }
        } else {
          resolve();
        }
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
              idle_ping: true,
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
        const target = e.target.closest('*');
        if (!target) return;

        const tag = target.tagName || '';
        const text = (target.innerText || '').trim().slice(0, 100);
        const htmlText = (target.innerHTML || '').replace(/<[^>]+>/g, '').trim().slice(0, 100);
        const id = target.id || '';
        const className = target.className || '';
        const name = target.name || '';
        const href = target.href || '';

        const finalText = text || htmlText || '[no text]';

        this.lastClickMeta = {
          click_tag: tag,
          click_text: finalText,
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
          this.formSubmitted = true;
        });
      });
    },

    trackScroll: function () {
      window.addEventListener('scroll', () => {
        this.scrollCount++;
        if (this.sentScroll) return;
        const scrollPosition = window.scrollY + window.innerHeight;
        const fullHeight = document.body.scrollHeight;
        if (scrollPosition / fullHeight > 0.9) {
          this.sentScroll = true;
        }
      }, { passive: true });
    },

    trackProductViews: function () {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.target.dataset.productId) {
            const productId = entry.target.dataset.productId;
            if (this.productViews.has(productId)) {
              this.returnedToProduct = true;
            }
            this.productViews.add(productId);
          }
        });
      }, { threshold: 0.5 });

      document.querySelectorAll('[data-product-id]').forEach(el => observer.observe(el));
    },

    trackProductFocus: function () {
      document.querySelectorAll('[data-product-id]').forEach(el => {
        el.addEventListener('mouseenter', () => {
          this.currentProductFocusStart = Date.now();
        });
        el.addEventListener('mouseleave', () => {
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
          scroll_depth: this.sentScroll ? 90 : 0,
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
