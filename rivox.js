(function () {
  const RIVOX_VERSION = "1.1.16";
  const isBot = /bot|crawl|spider|yandex|googlebot/i.test(navigator.userAgent);
  if (isBot) return;

  function detectDevice() {
    const ua = navigator.userAgent.toLowerCase();
    if (/mobile|android|iphone|ipod|blackberry|phone/.test(ua)) return 'mobile';
    if (/tablet|ipad/.test(ua)) return 'tablet';
    return 'desktop';
  }

  function cleanURL(url) {
    try {
      const u = new URL(url, window.location.origin);
      u.search = "";
      u.hash = "";
      return u.pathname;
    } catch (e) {
      return url;
    }
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

      this.scrollDepth = 0;
      this.scrollCount = 0;
      this.scrollSpeed = 0;
      this.lastScrollTime = Date.now();
      this.lastScrollY = window.scrollY;
      this.clickCount = 0;
      this.eventCount = 0;
      this.productViews = new Set();
      this.productClickUrls = new Set();
      this.returnedToProduct = 0;
      this.productFocusTime = 0;
      this.currentProductFocusStart = null;

      this.visitedCart = 0;
      this.formSubmitted = 0;
      this.purchaseCompleted = 0;
      this.submittedOrder = 0;
      this.startedPayment = 0;
      this.viewedReviews = 0;
      this.viewedSpecs = 0;
      this.intentStages = [];

      this.pagesViewed = 1;
      const path = window.location.pathname.toLowerCase();
      this.pageType = document.body.getAttribute("data-page-type") || (path.includes("/catalog/") ? "catalog" : '');
      this.actionHistory = [];
      this.returnVisits = localStorage.getItem("rivox_return_visits") || 0;
      this.formInteraction = 0;
      this.ctaVisible = 0;
      this.hasContactInfo = /(\u000b|\+7|8\d{10}|@|\d{3}-\d{3}-\d{4})/.test(document.body.innerText) ? 1 : 0;

      localStorage.setItem("rivox_return_visits", Number(this.returnVisits) + 1);

      const lastVisit = localStorage.getItem("rivox_last_visit") || Date.now();
      this.timeSinceLastVisit = Math.floor((Date.now() - lastVisit) / 1000);
      localStorage.setItem("rivox_last_visit", Date.now());

      this.deviceType = detectDevice();
      this.browser = navigator.userAgentData?.brands?.[0]?.brand || navigator.userAgent;
      this.platform = navigator.userAgentData?.platform || navigator.platform;

      const cartPaths = ["/cart", "/basket", "/checkout", "/order", "/korzina"];
      const successPaths = ["/thank-you", "/order-success", "/spasibo", "/success"];
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
          this.trackScroll();
          this.trackProductViews();
          this.trackClicks();
          this.trackTabViews();
          this.observeLateButtons();

          this.send("session_start", {
            url: window.location.href,
            client_id: this.ym_uid,
            referrer: document.referrer,
            time_since_last_visit: this.timeSinceLastVisit,
            scroll_speed: this.scrollSpeed
          });
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
        time_since_last_visit: this.timeSinceLastVisit,
        scroll_speed: this.scrollSpeed,
        viewed_reviews: this.viewedReviews,
        viewed_specs: this.viewedSpecs,
        submitted_order: this.submittedOrder,
        started_payment: this.startedPayment,
        intent_stages: this.intentStages,
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, truncate(v)]))
      };

      navigator.sendBeacon(this.endpoint, JSON.stringify(payload));
      console.log("[RIVOX]", payload);
    },

    trackScroll: function () {
      window.addEventListener('scroll', () => {
        const now = Date.now();
        const delta = now - this.lastScrollTime;
        const distance = Math.abs(window.scrollY - this.lastScrollY);
        const speed = delta > 0 ? distance / (delta / 1000) : 0;

        this.scrollSpeed = Math.round(speed);
        this.scrollCount++;
        this.lastScrollTime = now;
        this.lastScrollY = window.scrollY;

        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        this.scrollDepth = Math.round((window.scrollY / docHeight) * 100);
      });
    },

    trackProductViews: function () {
      document.querySelectorAll('.catalog-item__link').forEach(link => {
        const href = link.getAttribute('href');
        const title = link.querySelector('.catalog-item__name')?.innerText?.trim();

        if (href && !this.productViews.has(href)) {
          this.productViews.add(href);
          this.send("product_view", {
            href,
            title,
            product_id: cleanURL(href)
          });
        }
      });
    },

    trackClicks: function () {
      document.addEventListener('click', (e) => {
        const el = e.target;
        const text =
          el.innerText?.toLowerCase().trim() ||
          el.getAttribute("aria-label")?.toLowerCase() ||
          el.getAttribute("alt")?.toLowerCase() ||
          el.getAttribute("title")?.toLowerCase() ||
          "";

        if (text.includes("оформить заказ")) {
          this.submittedOrder = 1;
          this.intentStages.push("submitted_order");
        }
        if (text.includes("оплатить") || text.includes("перейти к оплате")) {
          this.startedPayment = 1;
          this.intentStages.push("started_payment");
        }
        if (text.includes("в 1 клик") || text.includes("купить")) {
          this.formSubmitted = 1;
          this.intentStages.push("clicked_buy");
        }
      });
    },

    trackTabViews: function () {
      const reviews = document.querySelector('a[href="#comments"]');
      if (reviews) {
        reviews.addEventListener('click', () => {
          this.viewedReviews = 1;
          this.intentStages.push("viewed_reviews");
        });
      }
      const specs = document.querySelector('a[href="#description"]');
      if (specs) {
        specs.addEventListener('click', () => {
          this.viewedSpecs = 1;
          this.intentStages.push("viewed_specs");
        });
      }
    },

    observeLateButtons: function () {
      const observer = new MutationObserver(() => {
        this.trackClicks();
        this.trackTabViews();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  };
})();
