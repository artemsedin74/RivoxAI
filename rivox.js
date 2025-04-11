(function () {
  window.Rivox = {
    init: function (clientToken, endpoint) {
      this.clientToken = clientToken;
      this.endpoint = endpoint;
      this.ym_uid = document.cookie.match(/_ym_uid=([^;]+)/)?.[1] || null;
      this.utm = new URLSearchParams(window.location.search);
      this.sessionStart = Date.now();
      this.sentScroll = false;
    },

    start: function () {
      this.trackPageView();
      this.trackProductView();
      this.trackClicks();
      this.trackForms();
      this.trackUnload();
      this.trackScroll();
    },

    goal: function (event, data = {}) {
      this.send(event, data);
    },

    send: function (event, data = {}) {
      if (!this.endpoint) {
        console.warn('[RIVOX] Endpoint не задан в init()');
        return;
      }

      const payload = {
        event,
        clientToken: this.clientToken,
        client_id: this.ym_uid,
        utm_source: this.utm.get('utm_source'),
        utm_campaign: this.utm.get('utm_campaign'),
        utm_medium: this.utm.get('utm_medium'),
        url: window.location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        ...data
      };

      navigator.sendBeacon(this.endpoint, JSON.stringify(payload));
      console.log("[RIVOX]", payload);
    },

    trackPageView: function () {
      this.send('page_view', {
        title: document.title
      });
    },

    trackProductView: function () {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/product') || path.includes('/catalog') || path.includes('/item')) {
        this.send('product_view', {
          product_url: window.location.href
        });
      }
    },

    trackClicks: function () {
      document.querySelectorAll('button, a, input[type=submit]').forEach(el => {
        el.addEventListener('click', () => {
          const label = el.getAttribute('data-track') || el.innerText || el.id || 'unknown';
          this.send('click', { label });
        });
      });
    },

    trackForms: function () {
      document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', () => {
          this.send('form_submit', { formName: form.getAttribute('name') || form.id || 'unnamed_form' });
        });
      });
    },

    trackUnload: function () {
      window.addEventListener('beforeunload', () => {
        const timeOnPage = Math.round((Date.now() - this.sessionStart) / 1000);
        this.send('time_on_site', { seconds: timeOnPage });
      });
    },

    trackScroll: function () {
      window.addEventListener('scroll', () => {
        if (this.sentScroll) return;
        const scrollPosition = window.scrollY + window.innerHeight;
        const fullHeight = document.body.scrollHeight;
        if (scrollPosition / fullHeight > 0.9) {
          this.sentScroll = true;
          this.send('scroll_depth', { depth: '90%' });
        }
      });
    }
  };
})();
