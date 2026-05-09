(function() {
    "use strict";
    var K = (e => (e[e.DEBUG = 0] = "DEBUG",
    e[e.INFO = 1] = "INFO",
    e[e.WARN = 2] = "WARN",
    e[e.ERROR = 3] = "ERROR",
    e[e.NONE = 4] = "NONE",
    e))(K || {});
    const l = {
        level: 4,
        restoreFromStorage: function() {
            const e = localStorage.getItem("rivox-debug-level");
            e && l.setLevel(e)
        },
        setLevel: function(e) {
            if (typeof e != "string" || !(e in K)) {
                const n = Object.keys(K).filter(s => isNaN(Number(s))).join(", ");
                throw new Error(`[RivoxSDK.Logger] Unknown log level: "${String(e)}". Valid levels are: ${n}.`)
            }
            const t = K[e];
            if (typeof t != "number")
                throw new Error(`[RivoxSDK.Logger] Invalid log level mapping for: "${e}"`);
            localStorage.setItem("rivox-debug-level", e),
            l.level = t
        },
        debug: function(...e) {
            l.level === 0 && console.log("rivox.js ℹ️", ...e)
        },
        info: function(...e) {
            l.level > 1 || console.info("rivox.js ℹ️", ...e)
        },
        warn: function(...e) {
            l.level > 2 || console.warn("rivox.js ℹ️", ...e)
        },
        error: function(...e) {
            console.error("rivox.js ℹ️", ...e)
        }
    };
    function yt() {
        try {
            return bt()
        } catch (e) {
            return l.error("Could not start SDK", e),
            null
        }
    }
    function bt() {
        const e = document.querySelector("script[data-token]");
        if (!e)
            throw new Error("RIVOX SDK script tag with data-token not found");
        const t = e.dataset
          , n = t == null ? void 0 : t.token;
        if (!n)
            throw new Error("RIVOX SDK token not specified");
        return l.debug("RIVOX SDK Configuration:", {
            token: n
        }),
        {
            token: n
        }
    }
    const St = {
        mouseMovementQuantSize: 5,
        mouseMoveListenerThrottle: 100
    }
      , _t = {
        idleTickInterval: 5e3,
        delayBeforeIdleStart: 1 * 3e4,
        maxIdleDuration: 10 * 6e4
    }
      , Et = {
        minHoverDurationToInteraction: 3e3
    }
      , W = "https://api.rivox.io"
      , D = {
        saveSessionEndpoint: W + "/session/",
        saveEventEndpoint: W + "/session/v2",
        sessionTimeout: 30 * 60 * 1e3,
        scrollChunkSize: 50,
        initDelay: 700,
        sendDelay: 1e4,
        retryDelay: 12e4,
        maxRetries: 3,
        checkGoalInterval: 5e3,
        ...St,
        ..._t,
        ...Et
    }
      , J = "6.4.12";
    function Q(e) {
        try {
            return e ? JSON.parse(e) : null
        } catch {
            return null
        }
    }
    function kt(e) {
        const t = localStorage.getItem(e);
        return Q(t)
    }
    function Ct(e, t) {
        try {
            localStorage.setItem(e, JSON.stringify(t))
        } catch (n) {
            l.error(`Failed to stringify value for key "${e}"`, n)
        }
    }
    function It(e) {
        localStorage.removeItem(e)
    }
    function Z(e=8) {
        const t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let n = "";
        for (let s = 0; s < e; s++) {
            const i = Math.floor(Math.random() * t.length);
            n += t[i]
        }
        return n
    }
    const $ = "rivox_session";
    function Mt() {
        const e = kt($);
        return e ? Date.now() - e.last_activity < D.sessionTimeout ? (l.info("Session restored from storage", e.snapshot_id),
        e.clicks = e.clicks ?? [],
        e) : (et(),
        null) : null
    }
    function tt(e) {
        e.snapshot_id = Z(),
        Ct($, e),
        l.info("Session save to storage", e.snapshot_id)
    }
    function et() {
        It($)
    }
    function xt(e) {
        const t = ["cart", "basket", "add_to_cart"];
        return e.filter(n => {
            const s = (n.element || "").toLowerCase();
            return t.some(i => s.includes(i))
        }
        ).length
    }
    function Tt(e) {
        const t = ["catalog", "product"];
        return e.filter(n => {
            const s = n.url.toLowerCase();
            return t.some(i => s.includes(i))
        }
        ).length
    }
    function H(e, t=2) {
        const n = Number(e);
        return isFinite(n) ? parseFloat(n.toFixed(t)) : 0
    }
    class G {
        constructor(t) {
            this.session = t
        }
        getSession() {
            return this.session
        }
        getSessionId() {
            return this.session.session_id
        }
        setSession(t) {
            this.session = t
        }
        getServerProjection() {
            const {timeOnSiteM: t, timeOnSiteS: n} = this.getTimeOnSite();
            return {
                session_id: this.session.session_id,
                counter_id: this.session.counter_id,
                client_token: this.session.client_token,
                client_id: this.session.client_id,
                start_time: this.session.start_time,
                hour: this.session.hour,
                weekDay: this.session.weekDay,
                device_info: this.session.device_info,
                traffic_source: this.session.traffic_source,
                utm_data: this.session.utm_data,
                cta_clicks_count: this.session.cta_clicks.length,
                clicks_count: this.session.clicks.length,
                cart_interactions: xt(this.session.cta_clicks),
                click_frequency: H(this.session.cta_clicks.length / t),
                duration: this.session.duration,
                hover_duration_avg: this.getAverageHoverDuration(this.session.hover_events),
                idle: this.session.idle,
                interaction_rate: H(this.session.total_interactions / t),
                last_activity: this.session.last_activity,
                mouse: this.getMouseSummary(this.session.mouse_events),
                page_views: this.session.page_history.length,
                product_views: Tt(this.session.page_history),
                scroll_depth_max: this.session.scroll_depth_max,
                scroll_speed: H(this.session.scroll_chunks.length / t),
                time_between_clicks: this.session.time_between_clicks,
                time_on_site: n,
                time_to_first_interaction: this.session.time_to_first_interaction,
                total_interactions: this.session.total_interactions,
                total_keypresses: this.session.total_keypresses
            }
        }
        getUtmData() {
            return this.session.utm_data
        }
        getStartTime() {
            return this.session.start_time
        }
        addIdleTick(t) {
            this.session.idle += t,
            this.session.duration = Date.now() - this.session.start_time
        }
        registerHoverEvent(t) {
            this.updateActivity(),
            this.session.hover_events.push(t),
            t[2] >= D.minHoverDurationToInteraction && this.registerInteraction()
        }
        registerInteraction() {
            this.session.total_interactions++,
            this.session.time_to_first_interaction || (this.session.time_to_first_interaction = Date.now() - this.session.start_time)
        }
        registerKeydownEvent() {
            this.updateActivity(),
            this.session.total_keypresses += 1,
            this.registerInteraction()
        }
        registerClickEvent(t) {
            this.updateActivity(),
            this.session.cta_clicks.push(t),
            this.registerInteraction(),
            t.is_cta && this.session.clicks.push(t);
            const n = this.session.time_between_clicks
              , s = this.session.start_time + n.reduce( (o, a) => o + a, 0)
              , i = Date.now() - s;
            n.push(i)
        }
        registerScrollEvent(t) {
            this.updateActivity(),
            this.session.scroll_chunks.push(t),
            this.session.scroll_depth_max = Math.max(this.session.scroll_depth_max || 0, t.depth),
            this.registerInteraction()
        }
        updateCurrentPageTimestamp() {
            const t = this.session.page_history[this.session.page_history.length - 1];
            t && (t.time_spent = Date.now() - t.timestamp)
        }
        registerMouseEvents(t) {
            this.updateActivity(),
            this.session.mouse_events.push(t)
        }
        registerHistoryChange() {
            this.updateActivity();
            const t = this.session.page_history[this.session.page_history.length - 1];
            t && (t.time_spent = Date.now() - t.timestamp),
            this.session.page_history.push({
                timestamp: Date.now(),
                url: window.location.href,
                referrer: document.referrer,
                time_spent: 0
            }),
            this.registerInteraction()
        }
        getTimeOnSite() {
            const t = Date.now() - this.session.start_time
              , n = t / 1e3
              , s = n / 60;
            return {
                timeOnSiteMs: t,
                timeOnSiteS: n,
                timeOnSiteM: s
            }
        }
        getMouseSummary(t) {
            if (t.length < 2)
                return {
                    movement_count: t.length,
                    area_coverage: 0,
                    avg_speed: 0,
                    max_speed: 0,
                    total_distance: 0,
                    avg_interval_ms: 0
                };
            let n = 0
              , s = 0;
            const i = []
              , o = new Set;
            for (let u = 1; u < t.length; u++) {
                const [h,d,,m] = t[u - 1]
                  , [v,g,,E] = t[u]
                  , b = (E - m) / 1e3
                  , k = Math.hypot(v - h, g - d);
                if (n += k,
                b > 0) {
                    const S = k / b;
                    s = Math.max(s, S)
                }
                i.push(E - m);
                const L = Math.floor(v / 100)
                  , p = Math.floor(g / 100);
                o.add(`${L}-${p}`)
            }
            const a = t[t.length - 1][3] - t[0][3]
              , r = H(n / (a / 1e3))
              , c = i.length === 0 ? 0 : i.reduce( (u, h) => u + h, 0) / i.length;
            return {
                movement_count: t.length,
                area_coverage: o.size,
                avg_speed: r,
                max_speed: H(s),
                total_distance: H(n),
                avg_interval_ms: Math.round(isFinite(c) ? c : 0)
            }
        }
        getAverageHoverDuration(t) {
            if (t.length === 0)
                return 0;
            const n = t.reduce( (s, i) => s + i[2], 0);
            return H(n / t.length, 0)
        }
        updateActivity() {
            const t = Date.now();
            this.session.last_activity = t,
            this.session.duration = t - this.session.start_time
        }
    }
    function Dt() {
        return "temp_" + Date.now() + "_" + Math.random().toString(36).substr(2)
    }
    function X(e) {
        if (!e)
            return "";
        const t = [];
        let n = e;
        for (; n; ) {
            let s = n.tagName ? n.tagName.toLowerCase() : "";
            n.id ? s += `#${n.id}` : n.className && typeof n.className == "string" && (s += `.${n.className.split(" ").join(".")}`),
            t.unshift(s),
            n = n.parentElement
        }
        return t.join(" > ")
    }
    function Lt(e) {
        var a;
        if (!e || e === document)
            return !1;
        const t = ["a", "button", "input", "select", "textarea", "label", "form", "img", "video", "iframe", "svg", "path", "details", "summary", "nav", "aside", "section", "article", "table", "td", "th", "ul", "li"]
          , n = ["btn", "button", "link", "cta", "submit", "form", "input", "buy", "cart", "checkout", "order", "payment", "subscribe", "login", "signup", "modal", "popup", "tooltip", "dropdown", "menu", "navbar", "tab", "accordion", "card", "product", "price", "item", "offer", "deal", "sale", "promo", "banner", "comment", "review", "rating", "share", "like", "follow", "slider", "carousel", "scroll", "load-more", "pagination", "filter", "sort"]
          , s = ["data-rivox-important", "data-important", "data-track", "data-analytics", "data-product", "data-sku", "data-price", "data-category", "data-id", "data-name", "data-action", "data-target", "data-toggle", "data-href", "data-link", "data-modal", "data-popup", "data-submit", "data-order", "tabindex"]
          , i = (a = e.tagName) == null ? void 0 : a.toLowerCase();
        if (i && t.includes(i))
            return l.debug("isImportantElement because of tag", i, e),
            !0;
        const o = typeof e.className == "string" ? e.className.toLowerCase() : "";
        return !!(n.some(r => o.includes(r) ? (l.debug("isImportantElement because of className", r, e),
        !0) : !1) || s.some(r => e.hasAttribute(r) ? (l.debug("isImportantElement because of data-attribute", r, e),
        !0) : !1))
    }
    function At(e) {
        if (!e || e === document)
            return !1;
        const t = ["a", "button"]
          , n = ["submit", "button"]
          , s = ["data-product-id", "data-product-buy", "data-buy", "data-cta", "data-rivox-cta"]
          , i = ["btn", "button", "cta", "buy", "add-to-cart", "checkout", "order", "submit", "callback", "contact", "phone", "price", "price_matrix_block", "buy_block", "product-item", "product-card", "product-detail", "add_to_cart", "quick_buy", "fast_order"]
          , o = ["купить", "заказать", "добавить", "корзин", "оформить", "позвонить", "заказать звонок", "отправить", "оставить заявку", "в 1 клик", "быстрый заказ", "быстрая покупка"];
        let a = e;
        for (; a && a !== document; ) {
            const r = a.tagName.toLowerCase();
            if (r && t.includes(r))
                return l.debug("isCTAElement because of tag", r, e),
                !0;
            if (r === "input" && n.includes(a.type.toLowerCase()))
                return l.debug("isCTAElement because of input type", r, e),
                !0;
            if (s.some(h => a.hasAttribute(h) ? (l.debug("isCTAElement because of data-attribute", h, e),
            !0) : !1))
                return !0;
            const c = typeof a.className == "string" ? a.className.toLowerCase() : "";
            if (i.some(h => c.includes(h) ? (l.debug("isCTAElement because of className", h, e),
            !0) : !1))
                return !0;
            const u = (a.textContent || a.value || "").toLowerCase();
            if (o.some(h => u.includes(h) ? (l.debug("isCTAElement because of text", h, e),
            !0) : !1))
                return !0;
            a = a.parentElement
        }
        return !1
    }
    function Rt(e=navigator.userAgent) {
        const t = e.toLowerCase();
        return /iphone|ipad|ipod/.test(t) ? "iOS" : /android/.test(t) ? "Android" : /windows phone/.test(t) ? "Windows Phone" : /macintosh|mac os x/.test(t) ? "macOS" : /windows nt/.test(t) ? "Windows" : /linux/.test(t) ? "Linux" : /cros/.test(t) ? "Chrome OS" : "Unknown"
    }
    function nt() {
        const e = navigator.userAgent || navigator.vendor || window.opera
          , t = /ipad|tablet|(android(?!.*mobile))/i.test(e) || navigator.maxTouchPoints > 1 && window.innerWidth >= 768 && window.innerWidth <= 1024
          , n = /iphone|ipod|android.*mobile|blackberry|windows phone|opera mini/i.test(e) || navigator.maxTouchPoints > 1 && window.innerWidth < 768;
        return t ? "tablet" : n ? "mobile" : "desktop"
    }
    function Ot() {
        const e = navigator.userAgent
          , t = {
            device_type: nt(),
            browser: "unknown",
            platform: Rt(e),
            user_agent: e
        };
        return e.indexOf("Chrome") > -1 ? t.browser = "Chrome" : e.indexOf("Safari") > -1 ? t.browser = "Safari" : e.indexOf("Firefox") > -1 ? t.browser = "Firefox" : e.indexOf("MSIE") > -1 || e.indexOf("Trident/") > -1 ? t.browser = "IE" : e.indexOf("Edge") > -1 ? t.browser = "Edge" : (e.indexOf("Opera") > -1 || e.indexOf("OPR") > -1) && (t.browser = "Opera"),
        t
    }
    function Nt() {
        const e = Mt();
        return e ? (e.page_history.push({
            timestamp: Date.now(),
            url: window.location.href,
            referrer: document.referrer,
            time_spent: 0
        }),
        new G(e)) : null
    }
    function st(e, t, n) {
        const s = Pt(e, t, n);
        return tt(s),
        new G(s)
    }
    function Pt(e, t, n) {
        const s = new Date
          , i = Date.now();
        return {
            snapshot_id: "",
            hour: s.getHours(),
            weekDay: s.getDay(),
            client_id: e.clientId ?? Dt(),
            counter_id: e.counterId ?? null,
            client_token: t,
            session_id: Bt(),
            start_time: i,
            device_info: Ot(),
            utm_data: n,
            traffic_source: {
                referrer: document.referrer,
                landing_page: window.location.href,
                entry_point: window.location.pathname
            },
            last_activity: Date.now(),
            cta_clicks: [],
            clicks: [],
            duration: 0,
            hover_events: [],
            idle: 0,
            mouse_events: [],
            page_history: [],
            scroll_chunks: [],
            scroll_depth_max: 0,
            time_between_clicks: [],
            time_to_first_interaction: null,
            total_interactions: 0,
            total_keypresses: 0
        }
    }
    function Bt() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2)
    }
    class Ft {
        constructor(t, n) {
            this.context = t,
            this._isBlocked = !1,
            this.sesionReactivationCallback = void 0,
            this._session = n,
            this.utm = n.getUtmData(),
            this.lastSessionId = n.getSessionId()
        }
        get session() {
            return this._session
        }
        get isBlocked() {
            return this._isBlocked
        }
        getLastSessionId() {
            return this.lastSessionId
        }
        onSessionReactivated(t) {
            this.sesionReactivationCallback = t
        }
        set(t) {
            var n;
            if (!t) {
                l.info("[📝❌ SESSION] Session was cleared"),
                this.destroy();
                return
            }
            this._session ? (l.info(`[📝🧘 SESSION] Session ${t.session_id} was updated with snapshot ${t.snapshot_id}`),
            this._session.setSession(t)) : (l.info(`[📝🧘 SESSION] Session in this tab was reactivated from outside with session_id ${(n = this.session) == null ? void 0 : n.getSession().session_id}`),
            this._session = new G(t)),
            this.lastSessionId = t.session_id
        }
        save() {
            this._session && tt(this._session.getSession())
        }
        destroy() {
            this._session = null
        }
        registerHistoryChange() {
            this.tryToReactivate(),
            this.session.registerHistoryChange()
        }
        registerHoverEvent(t) {
            this.tryToReactivate(),
            this.session.registerHoverEvent(t)
        }
        registerKeydownEvent() {
            this.tryToReactivate(),
            this.session.registerKeydownEvent()
        }
        registerScrollEvent(t) {
            this.tryToReactivate(),
            this.session.registerScrollEvent(t)
        }
        registerMouseEvents(t) {
            this.tryToReactivate(),
            this.session.registerMouseEvents(t)
        }
        registerClickEvent(t) {
            this.tryToReactivate(),
            this.session.registerClickEvent(t)
        }
        registerIdleTick(t) {
            this.session && this.session.addIdleTick(t)
        }
        tryToReactivate() {
            var n, s;
            if (this._session)
                return;
            const t = st(this.context.yandexMetricaData, this.context.clientToken, this.utm);
            this._session = t,
            l.info(`[📝✅ SESSION]Session was reactivated after inactivity with ${(n = this.session) == null ? void 0 : n.getSession().session_id}`),
            (s = this.sesionReactivationCallback) == null || s.call(this),
            this.lastSessionId = t.getSessionId()
        }
    }
    function Ht(e) {
        const t = n => {
            const s = n.target;
            if (!s)
                return;
            let i = null
              , o = s;
            for (; o && o.parentElement; ) {
                if (At(o)) {
                    i = o;
                    break
                }
                o = o.parentElement
            }
            const a = i || s
              , r = {
                timestamp: Date.now(),
                element: X(a),
                element_text: (a.textContent || a.value || "").trim(),
                is_cta: !!i
            };
            e(r)
        }
        ;
        return document.addEventListener("click", t),
        () => {
            document.removeEventListener("click", t)
        }
    }
    function Y(e, t) {
        let n, s;
        return function(...i) {
            const o = this;
            s ? (clearTimeout(n),
            n = setTimeout(function() {
                Date.now() - (s ?? 0) >= t && (e.apply(o, i),
                s = Date.now())
            }, t - (Date.now() - (s ?? 0)))) : (e.apply(o, i),
            s = Date.now())
        }
    }
    function Yt(e) {
        let t = null
          , n = null;
        function s() {
            t = null,
            n = null
        }
        const i = Y(r => {
            const c = r.target;
            Lt(c) && (n = c,
            t = Date.now())
        }
        , 50)
          , o = Y(r => {
            const c = r.target;
            c !== n || !t || (l.debug("rivox.js register hover event", {
                element: X(c),
                duration: Date.now() - t
            }),
            e([X(c), t, Date.now() - t]),
            s())
        }
        , 50)
          , a = () => {
            document.visibilityState === "hidden" && s()
        }
        ;
        return document.addEventListener("pointerover", i),
        document.addEventListener("pointerout", o),
        window.addEventListener("blur", s),
        document.addEventListener("visibilitychange", a),
        () => {
            document.removeEventListener("pointerover", i),
            document.removeEventListener("pointerout", o),
            window.removeEventListener("blur", s),
            document.removeEventListener("visibilitychange", a)
        }
    }
    function Kt(e) {
        return window.addEventListener("keydown", e),
        () => {
            window.removeEventListener("keydown", e)
        }
    }
    function $t(e) {
        const t = D.mouseMovementQuantSize;
        return Math.round(e / t) * t
    }
    function Vt(e) {
        if (nt() === "desktop") {
            const s = it(i => [i.clientX, i.clientY], e);
            return document.addEventListener("mousemove", s),
            () => document.removeEventListener("mousemove", s)
        }
        const n = it(s => s.touches[0] ? [s.touches[0].clientX, s.touches[0].clientY] : null, e);
        return document.addEventListener("touchmove", n),
        () => document.removeEventListener("touchmove", n)
    }
    function it(e, t) {
        let n = -1
          , s = -1
          , i = 0;
        return Y(o => {
            const a = e(o);
            if (!a)
                return;
            const [r,c] = a.map($t);
            if (r === n && c === s) {
                i++;
                return
            }
            const u = Date.now();
            n !== -1 && s !== -1 && t([n, s, i, u]),
            n = r,
            s = c,
            i = 1
        }
        , D.mouseMoveListenerThrottle)
    }
    function jt(e) {
        const t = () => e();
        window.addEventListener("popstate", t);
        let n;
        return window.history.pushState && (n = window.history.pushState,
        window.history.pushState = function(...s) {
            n.apply(this, s),
            e()
        }
        ),
        () => {
            window.removeEventListener("popstate", t),
            n && (window.history.pushState = n)
        }
    }
    function qt(e) {
        let t = 0;
        const n = Y( () => {
            const s = window.scrollY
              , i = Math.abs(s - t);
            if (i >= D.scrollChunkSize) {
                const o = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
                  , a = window.innerHeight
                  , r = s / (o - a) * 100;
                e({
                    timestamp: Date.now(),
                    position: s,
                    delta: i,
                    viewport_height: a,
                    document_height: o,
                    depth: r
                }),
                t = s
            }
        }
        , 100);
        return window.addEventListener("scroll", n),
        () => {
            window.removeEventListener("scroll", n)
        }
    }
    class Gt {
        constructor(t) {
            this.context = t,
            this.unsubscribers = []
        }
        start() {
            l.info("🎃 Event Manager is started"),
            this.unsubscribers.push(Yt(t => this.handleHoverEvent(t)), Ht(t => this.handleClick(t)), qt(t => this.handleScrollEvent(t)), jt( () => this.handlePageHistoryChange()), Kt( () => this.handleKeydownEvent()), Vt(t => this.handleMouseMoveEvent(t)))
        }
        stop() {
            l.info("🎃 Event Manager is stopped"),
            this.unsubscribers.forEach(t => t()),
            this.unsubscribers = []
        }
        handlePageHistoryChange() {
            this.context.sessionContext.registerHistoryChange()
        }
        handleHoverEvent(t) {
            this.context.sessionContext.registerHoverEvent(t)
        }
        handleKeydownEvent() {
            this.context.sessionContext.registerKeydownEvent()
        }
        handleScrollEvent(t) {
            this.context.sessionContext.registerScrollEvent(t)
        }
        handleMouseMoveEvent(t) {
            this.context.sessionContext.registerMouseEvents(t)
        }
        handleClick(t) {
            this.context.sessionContext.registerClickEvent(t)
        }
    }
    async function Xt(e) {
        if (!e || e.length === 0)
            return Promise.resolve({
                ok: !0
            });
        try {
            const t = await fetch(D.saveEventEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Origin: window.location.origin
                },
                body: JSON.stringify(e)
            });
            return t.ok ? l.debug("✅ Events sent successfully with keepalive") : l.warn(`⚠️ Failed to send events, status: ${t.status}`),
            {
                ok: t.ok
            }
        } catch (t) {
            return l.error("keepalive request failed", {
                error: t
            }),
            {
                ok: !1
            }
        }
    }
    async function Ut(e) {
        try {
            if ((await fetch(D.saveSessionEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Origin: window.location.origin
                },
                body: JSON.stringify(e)
            })).ok) {
                l.debug("✅ Data sent successfully via POST");
                return
            }
            throw new Error("Failed send with post")
        } catch {
            throw new Error("Could not send data")
        }
    }
    async function zt(e) {
        try {
            const t = await Ut(e);
            return l.debug("✅ Data was send to server"),
            t
        } catch (t) {
            throw t
        }
    }
    const ot = {
        saveSession: zt,
        saveEvents: Xt
    }
      , Wt = 20
      , Jt = 1e3
      , U = 5
      , Qt = 5e3;
    class Zt {
        constructor() {
            this.buffer = [],
            this.pendingEvents = [],
            this.isSending = !1,
            this.retryCount = 0,
            this.retryTimer = null,
            this.isStarted = !1,
            this.autoFlushTimer = null
        }
        addEvent(t) {
            if (!this.isStarted) {
                l.debug(`Event buffer is not started. Ignoring event: ${t.event}`);
                return
            }
            this.buffer.push(t),
            l.debug(`Event added to buffer: ${t.event}`),
            this.buffer.length >= Wt && this.flush()
        }
        addEventOnce(t, n=!0) {
            this.buffer.push(t),
            n && this.flush()
        }
        start() {
            if (this.isStarted) {
                l.debug("Event buffer is already started");
                return
            }
            this.isStarted = !0,
            this.startAutoFlush(),
            l.debug("Event buffer started")
        }
        stop() {
            if (!this.isStarted) {
                l.debug("Event buffer is already stopped");
                return
            }
            this.isStarted = !1,
            this.stopAutoFlush(),
            this.buffer.length > 0 && (l.debug("Sending final batch of events before stopping"),
            this.flush()),
            l.debug("Event buffer stopped")
        }
        startAutoFlush() {
            this.stopAutoFlush(),
            this.autoFlushTimer = setInterval( () => {
                this.buffer.length > 0 && (l.debug("Auto-flushing buffer"),
                this.flush())
            }
            , Qt)
        }
        stopAutoFlush() {
            this.autoFlushTimer && (clearInterval(this.autoFlushTimer),
            this.autoFlushTimer = null)
        }
        destroy() {
            this.stop(),
            this.retryTimer && (clearTimeout(this.retryTimer),
            this.retryTimer = null),
            l.debug("Event buffer destroyed")
        }
        isRunning() {
            return this.isStarted
        }
        flush() {
            this.isSending || this.buffer.length === 0 || this.sendEvents()
        }
        async sendEvents() {
            if (this.isSending)
                return;
            this.isSending = !0;
            const t = [...this.pendingEvents, ...this.buffer];
            if (this.pendingEvents = t,
            this.buffer = [],
            t.length !== 0)
                try {
                    const {ok: n} = await ot.saveEvents(t);
                    n ? (this.pendingEvents = [],
                    this.retryCount = 0,
                    l.debug(`Successfully sent ${t.length} events`)) : this.scheduleRetry()
                } catch (n) {
                    l.error("Error sending events:", n),
                    this.scheduleRetry()
                } finally {
                    this.isSending = !1
                }
        }
        scheduleRetry() {
            if (this.retryCount++,
            this.retryCount > U) {
                l.error(`Max retries (${U}) exceeded. Dropping ${this.pendingEvents.length} events`),
                this.pendingEvents = [],
                this.retryCount = 0;
                return
            }
            const t = Jt * Math.pow(2, this.retryCount - 1);
            l.warn(`Failed to send events. Retry ${this.retryCount}/${U} in ${t}ms`),
            this.retryTimer = setTimeout( () => {
                this.retryTimer = null,
                this.sendEvents()
            }
            , t)
        }
    }
    function rt(e, t=0) {
        const i = new TextEncoder().encode(e)
          , o = i.length
          , a = o / 4 | 0;
        let r = t >>> 0;
        for (let h = 0; h < a; h++) {
            const d = h * 4;
            let m = (i[d] | i[d + 1] << 8 | i[d + 2] << 16 | i[d + 3] << 24) >>> 0;
            m = Math.imul(m, 3432918353) >>> 0,
            m = (m << 15 | m >>> 17) >>> 0,
            m = Math.imul(m, 461845907) >>> 0,
            r ^= m,
            r = (r << 13 | r >>> 19) >>> 0,
            r = Math.imul(r, 5) + 3864292196 >>> 0
        }
        let c = 0;
        const u = a * 4;
        switch (o & 3) {
        case 3:
            c ^= i[u + 2] << 16;
        case 2:
            c ^= i[u + 1] << 8;
        case 1:
            c ^= i[u],
            c = Math.imul(c, 3432918353) >>> 0,
            c = (c << 15 | c >>> 17) >>> 0,
            c = Math.imul(c, 461845907) >>> 0,
            r ^= c
        }
        return r ^= o >>> 0,
        r ^= r >>> 16,
        r = Math.imul(r, 2246822507) >>> 0,
        r ^= r >>> 13,
        r = Math.imul(r, 3266489909) >>> 0,
        r ^= r >>> 16,
        r >>> 0
    }
    function te(e) {
        const t = {
            capture: !0,
            passive: !0
        }
          , n = s => {
            var i;
            try {
                const o = (i = s.composedPath) == null ? void 0 : i.call(s);
                let a = (o && o[0]instanceof Element ? o[0] : null) || s.target || document.activeElement;
                if (!a)
                    return;
                a.nodeType === Node.TEXT_NODE && (a = a.parentElement);
                const r = (a == null ? void 0 : a.closest("button, a, [role='button'], [role='link'], [data-cta]")) || a;
                if (!r)
                    return;
                const c = r.getBoundingClientRect()
                  , u = (r.tagName || "").toLowerCase()
                  , h = r.getAttribute("role") || null
                  , d = r.type || r.type || null
                  , m = ne(r)
                  , v = m ? lt(rt(m + "RIVOX_2025", 0)) : null
                  , g = lt(rt(se(r), 0))
                  , E = ie(r)
                  , b = ee(c)
                  , k = at((c.left + c.width / 2) / window.innerWidth)
                  , L = at((c.top + c.height / 2) / window.innerHeight)
                  , {pointer: p, buttonName: S} = oe(s)
                  , M = {
                    scroll_y: Math.max(0, Math.round(window.scrollY)),
                    el_tag: u,
                    el_role: h,
                    el_type: d,
                    el_text_hash: v,
                    el_structure_hash: g,
                    el_selector_short: E,
                    el_size_w: Math.round(c.width),
                    el_size_h: Math.round(c.height),
                    el_center_x: +k.toFixed(4),
                    el_center_y: +L.toFixed(4),
                    el_in_viewport: b,
                    el_within_modal: !!r.closest("[role='dialog'], .modal, [data-modal='true']"),
                    input_pointer: p,
                    input_button: S
                };
                e(M, !0)
            } catch {}
        }
        ;
        return document.addEventListener("click", n, t),
        () => {
            document.removeEventListener("click", n, t)
        }
    }
    function at(e) {
        return Math.max(0, Math.min(1, e))
    }
    function ee(e) {
        return e.width > 0 && e.height > 0 && e.bottom > 0 && e.right > 0 && e.top < (window.innerHeight || 0) && e.left < (window.innerWidth || 0)
    }
    function ne(e) {
        return (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120).toLowerCase()
    }
    function se(e) {
        const t = e.tagName.toLowerCase()
          , n = e.getAttribute("role") || ""
          , s = e.type || e.type || ""
          , i = typeof e.className == "string" ? e.className.split(/\s+/).filter(Boolean).slice(0, 2) : []
          , o = {};
        ["cta", "testid"].forEach(c => {
            var h;
            const u = (h = e.dataset) == null ? void 0 : h[c];
            u && (o[c] = u)
        }
        );
        const a = Array.from(e.children).map(c => c.tagName.toLowerCase()).slice(0, 5)
          , r = !!e.closest("[role='dialog'], .modal, [data-modal='true']");
        return JSON.stringify({
            tag: t,
            role: n,
            type: s,
            classes: i,
            data: o,
            children: a,
            withinModal: r
        })
    }
    function ie(e) {
        const t = [];
        let n = e
          , s = 0;
        for (; n && s < 5; ) {
            const i = n.tagName ? n.tagName.toLowerCase() : "node"
              , o = n.id ? `#${n.id}` : ""
              , a = n.className && typeof n.className == "string" ? "." + n.className.split(/\s+/).slice(0, 2).join(".") : "";
            let r = "";
            if (n.parentElement) {
                const u = Array.from(n.parentElement.children).filter(h => h.tagName === n.tagName).indexOf(n);
                u > 0 && (r = `:${u + 1}`)
            }
            t.unshift(`${i}${o || a}${r}`),
            n = n.parentElement,
            s++
        }
        return t.join(" > ")
    }
    function oe(e) {
        if (e instanceof KeyboardEvent)
            return {
                pointer: "keyboard",
                buttonName: null
            };
        if (typeof e.pointerType == "string") {
            const s = e.pointerType
              , i = s === "mouse" || s === "touch" || s === "pen" ? s : "mouse"
              , o = ct(e.button);
            return {
                pointer: i,
                buttonName: o
            }
        }
        return {
            pointer: "mouse",
            buttonName: ct(e.button)
        }
    }
    function ct(e) {
        switch (e) {
        case 0:
            return "left";
        case 1:
            return "middle";
        case 2:
            return "right";
        default:
            return null
        }
    }
    function lt(e) {
        return (e >>> 0).toString(16).padStart(8, "0")
    }
    let V = []
      , ut = !1;
    function re() {
        if (ut)
            return;
        let e = window.dataLayer || [];
        function t(i) {
            try {
                i && typeof i == "object" && !Array.isArray(i) && V.forEach(o => o(i))
            } catch {}
        }
        function n(i) {
            const o = i.push.bind(i);
            return function(...a) {
                for (const r of a)
                    t(r);
                return o(...a)
            }
        }
        const s = e;
        s.push = n(e);
        for (const i of e)
            t(i);
        Object.defineProperty(window, "dataLayer", {
            configurable: !0,
            enumerable: !0,
            get() {
                return s
            },
            set(i) {
                if (Array.isArray(i) && i !== s) {
                    const o = i.filter(a => !s.includes(a));
                    o.length && s.push(...o)
                }
                s.push = n(s)
            }
        }),
        ut = !0
    }
    function ae(e) {
        return re(),
        V.push(e),
        () => {
            V = V.filter(t => t !== e)
        }
    }
    const dt = new Set
      , ht = new Set;
    function ce(e) {
        let t = 2166136261;
        for (let n = 0; n < e.length; n++)
            t ^= e.charCodeAt(n),
            t = (t >>> 0) * 16777619;
        return ("0000000" + (t >>> 0).toString(16)).slice(-8)
    }
    function le(e) {
        if (e["gtm.uniqueEventId"])
            return dt.has(e["gtm.uniqueEventId"]) ? !1 : (dt.add(e["gtm.uniqueEventId"]),
            !0);
        const t = ce(JSON.stringify(e));
        return ht.has(t) ? !1 : (ht.add(t),
        !0)
    }
    function ue(e) {
        return ae(n => {
            !n.ecommerce || !le(n) || e(n)
        }
        )
    }
    const de = ["uid", "userid", "user_id", "user", "account", "login", "name", "nickname", "profile", "member", "customer", "client", "contact", "email", "e_mail", "mail", "phone", "tel", "mobile", "token", "access_token", "refresh_token", "auth", "auth_token", "key", "api_key", "secret", "signature", "sig", "hash", "code", "password", "pass", "card", "credit", "cc", "iban", "swift", "account_number", "fbclid", "msclkid", "ttclid", "yclid", "dclid", "gclsrc", "reset", "verify", "confirmation", "invite", "link", "recovery", "_ga", "_gid", "_gl", "ga_session_id", "ga_session", "ga_tracking_id", "session", "sessionid", "sid", "phpsessid", "jsessionid", "address", "city", "country", "zip", "postcode"];
    function z(e=location.href) {
        const t = new URL(e)
          , n = new URLSearchParams;
        for (const [s,i] of t.searchParams.entries())
            de.includes(s) || n.set(s, i);
        return {
            path: window.location.pathname,
            title: document.title,
            params: n.toString()
        }
    }
    function he(e) {
        const n = () => Date.now();
        let s = 0
          , i = null;
        function o(h) {
            const d = n();
            if (d - s < 150)
                return;
            const {params: m, path: v, title: g} = z(location.href);
            s = d;
            try {
                e({
                    path: v,
                    params: m,
                    title: g,
                    history_action: h
                })
            } catch {}
        }
        const a = history.pushState
          , r = history.replaceState;
        history.pushState = function(...h) {
            const d = a.apply(this, h);
            return queueMicrotask( () => o("push")),
            d
        }
        ,
        history.replaceState = function(...h) {
            const d = r.apply(this, h);
            return queueMicrotask( () => o("replace")),
            d
        }
        ;
        const c = () => o("pop");
        window.addEventListener("popstate", c);
        const u = () => {
            i && (clearTimeout(i),
            i = null),
            i = window.setTimeout( () => {
                o("hash"),
                i && (clearTimeout(i),
                i = null)
            }
            , 50)
        }
        ;
        return window.addEventListener("hashchange", u),
        () => {
            history.pushState = a,
            history.replaceState = r,
            window.removeEventListener("popstate", c),
            window.removeEventListener("hashchange", u),
            i && (clearTimeout(i),
            i = null)
        }
    }
    function fe(e) {
        let s = 0, i = 0, o = new Set, a = 0, r = 0, c = 0, u = 0, h = 0, d = 0, m = 0, v;
        const g = [];
        let E = 0, b = !1, k;
        const L = () => Date.now();
        function p(f) {
            if (f.ctrlKey || f.metaKey)
                return !1;
            const w = f.key;
            return w.length === 1 || w === " " || w === "Spacebar"
        }
        function S(f) {
            if (!f.repeat) {
                switch (s++,
                o.add(f.key),
                f.key) {
                case "Backspace":
                    a++;
                    break;
                case "Delete":
                    r++;
                    break;
                case "Enter":
                    c++;
                    break;
                case "Tab":
                    u++;
                    break;
                case "ArrowUp":
                case "ArrowDown":
                case "ArrowLeft":
                case "ArrowRight":
                    h++;
                    break;
                case "Shift":
                case "Control":
                case "Alt":
                case "Meta":
                    d++;
                    break
                }
                if (p(f)) {
                    i++;
                    const w = L();
                    if (v !== void 0) {
                        const y = w - v;
                        g.push(y),
                        y <= 200 ? b || (b = !0,
                        E++) : b = !1
                    }
                    v = w
                }
            }
        }
        function M(f) {
            m++
        }
        function A(f) {
            if (f.length === 0)
                return 0;
            const w = (f.length - 1) * .95
              , y = Math.floor(w)
              , _ = Math.ceil(w);
            if (y === _)
                return f[y];
            const I = w - y;
            return f[y] * (1 - I) + f[_] * I
        }
        function N() {
            if (s === 0 && i === 0 && o.size === 0 && a === 0 && r === 0 && c === 0 && u === 0 && h === 0 && d === 0 && m === 0 && g.length === 0 && E === 0)
                return;
            const f = g.length ? Math.round(g.reduce( (_, I) => _ + I, 0) / g.length) : 0
              , w = g.length ? Math.round(A([...g].sort( (_, I) => _ - I))) : 0
              , y = {
                winMs: 15e3,
                totalKeys: s,
                printableKeys: i,
                uniqueKeys: o.size,
                backspace: a,
                delete: r,
                enter: c,
                tab: u,
                arrows: h,
                modifiers: d,
                paste: m,
                ikiAvgMs: f,
                ikiP95Ms: w,
                bursts: E
            };
            try {
                e(y)
            } catch {}
            s = 0,
            i = 0,
            o.clear(),
            a = 0,
            r = 0,
            c = 0,
            u = 0,
            h = 0,
            d = 0,
            m = 0,
            g.length = 0,
            E = 0,
            b = !1,
            v = void 0
        }
        return window.addEventListener("keydown", S, {
            passive: !0
        }),
        window.addEventListener("paste", M, {
            passive: !0
        }),
        k = window.setInterval(N, 15e3),
        function() {
            window.removeEventListener("keydown", S),
            window.removeEventListener("paste", M),
            k != null && clearInterval(k)
        }
    }
    function me(e) {
        let o, a, r, c, u, h = 0, d = 0, m = 0, v = 0, g = [], E = 0, b = 0, k = 0, L = 0, p = 0, S = !1, M = 0, A;
        const N = Math.hypot;
        function f(C, P) {
            if (C.length === 0)
                return 0;
            const T = (C.length - 1) * P
              , x = Math.floor(T)
              , B = Math.ceil(T);
            if (x === B)
                return C[x];
            const F = T - x;
            return C[x] * (1 - F) + C[B] * F
        }
        function w() {
            m = 0,
            v = 0,
            g.length = 0,
            E = 0,
            b = 0,
            k = 0,
            L = 0,
            p = 0,
            S = !1
        }
        function y() {
            if (!S) {
                w();
                return
            }
            const C = g.length > 0 ? g.reduce( (x, B) => x + B, 0) / g.length : 0
              , P = ( () => {
                if (g.length === 0)
                    return 0;
                const x = [...g].sort( (B, F) => B - F);
                return f(x, .95)
            }
            )()
              , T = {
                winMs: 15e3,
                frames: m,
                dist: Math.round(v),
                spdAvg: Math.round(C),
                spdP95: Math.round(P),
                micro: E,
                turns: b,
                idleMs: Math.min(15e3, Math.round(k)),
                stops: L
            };
            try {
                e(T)
            } catch {}
            w()
        }
        function _(C) {
            if (o != null && a != null)
                if (r == null || c == null || u == null)
                    r = o,
                    c = a,
                    u = C;
                else {
                    const P = C - u
                      , T = o - r
                      , x = a - c
                      , B = T !== 0 || x !== 0;
                    if (P > 0) {
                        if (m++,
                        B) {
                            S = !0,
                            v += Math.abs(T) + Math.abs(x);
                            const F = N(T, x)
                              , Ze = F / P * 1e3;
                            g.push(Ze),
                            F <= 5 && E++;
                            const vt = N(h, d)
                              , wt = F;
                            if (vt > 0 && wt > 0) {
                                const tn = h * T + d * x
                                  , en = Math.min(1, Math.max(-1, tn / (vt * wt)));
                                Math.acos(en) > .3 && b++
                            }
                            h = T,
                            d = x,
                            p >= 150 && L++,
                            p = 0
                        } else
                            k += P,
                            p += P;
                        r = o,
                        c = a,
                        u = C
                    }
                }
            M = requestAnimationFrame(_)
        }
        const I = C => {
            o = C.clientX,
            a = C.clientY
        }
        ;
        return document.addEventListener("mousemove", I, {
            passive: !0
        }),
        M = requestAnimationFrame(_),
        A = window.setInterval(y, 15e3),
        function() {
            document.removeEventListener("mousemove", I),
            M && cancelAnimationFrame(M),
            A != null && clearInterval(A)
        }
    }
    function ge(e) {
        const s = Math.min(50, Math.max(1, 10));
        let i, o, a, r, c = 0, u = 0, h = 0, d = 0, m = 0;
        const v = [];
        let g = 0, E = 0, b = !1, k = 0, L;
        function p() {
            const f = document.scrollingElement || document.documentElement || document.body;
            return {
                x: f.scrollLeft ?? window.scrollX ?? 0,
                y: f.scrollTop ?? window.scrollY ?? 0
            }
        }
        function S() {
            const f = document.scrollingElement || document.documentElement || document.body
              , w = f.scrollTop ?? 0
              , y = f.scrollHeight ?? 1
              , _ = f.clientHeight ?? window.innerHeight ?? 1
              , I = Math.max(1, y - _)
              , C = Math.min(1, Math.max(0, w / I));
            return Math.round(C * 1e4)
        }
        function M(f) {
            if (f.length === 0)
                return 0;
            const w = (f.length - 1) * .95
              , y = Math.floor(w)
              , _ = Math.ceil(w);
            if (y === _)
                return f[y];
            const I = w - y;
            return f[y] * (1 - I) + f[_] * I
        }
        function A(f) {
            const {x: w, y} = p();
            if (i === void 0 || o === void 0 || a === void 0)
                i = w,
                o = y,
                a = f,
                g = Math.max(g, S());
            else {
                const _ = f - a;
                if (_ > 0) {
                    c++;
                    const I = w - i
                      , C = y - o;
                    if (I !== 0 || C !== 0) {
                        b = !0,
                        u += Math.abs(I),
                        h += Math.abs(C),
                        v.push(Math.abs(C) / _ * 1e3);
                        const T = Math.sign(C);
                        T !== 0 && (r !== void 0 && T !== r && m++,
                        r = T);
                        const x = S();
                        g = Math.max(g, x),
                        x >= (100 - s) * 100 && (E += _)
                    } else
                        d += _;
                    i = w,
                    o = y,
                    a = f
                }
            }
            k = requestAnimationFrame(A)
        }
        function N() {
            if (!b) {
                c = 0,
                d = 0,
                v.length = 0,
                m = 0,
                g = 0,
                E = 0,
                u = 0,
                h = 0,
                b = !1;
                return
            }
            const f = v.length ? Math.round(v.reduce( (_, I) => _ + I, 0) / v.length) : 0
              , w = v.length ? Math.round(M([...v].sort( (_, I) => _ - I))) : 0
              , y = {
                winMs: 15e3,
                frames: c,
                distX: Math.round(u),
                distY: Math.round(h),
                spdAvgY: f,
                spdP95Y: w,
                dirChangesY: m,
                idleMs: Math.min(15e3, Math.round(d)),
                maxDepthPct1e2: g,
                timeNearBottomMs: Math.round(E)
            };
            try {
                e(y)
            } catch {}
            c = 0,
            u = 0,
            h = 0,
            d = 0,
            m = 0,
            v.length = 0,
            g = 0,
            E = 0,
            b = !1
        }
        return k = requestAnimationFrame(A),
        L = window.setInterval(N, 15e3),
        function() {
            k && cancelAnimationFrame(k),
            L != null && clearInterval(L)
        }
    }
    function pe(e, t) {
        if (!e)
            return () => {}
            ;
        const n = e.getReachGoalFn()
          , s = n.fn;
        return n.fn = function(i, o={}, ...a) {
            return l.info(`🎯 Metrika reachGoal intercepted: ${i}`, o),
            t({
                name: i,
                params: o
            }),
            s.call(this, i, o, ...a)
        }
        ,
        () => {
            n.fn = s
        }
    }
    const j = "rivox-tab";
    class ve {
        constructor() {
            this.onChangeCallback = void 0
        }
        cleanStorage() {
            localStorage.removeItem(j)
        }
        registerNewTab(t, n) {
            const s = this.getState() ?? {
                masterTabId: "",
                tabs: []
            };
            return s.tabs.find(i => i.id === t) || s.tabs.push({
                id: t,
                visits: 1,
                leaves: 0,
                isClosed: !1,
                createdAt: Date.now()
            }),
            n && (s.masterTabId = t),
            this.save(s),
            this
        }
        registerTabLeave(t) {
            const n = this.getState();
            if (!n)
                return;
            const s = n.tabs.find(i => i.id === t);
            s && (s.leaves += 1,
            n.masterTabId = "",
            this.save(n))
        }
        registerTabReturn(t) {
            const n = this.getState();
            if (!n)
                return;
            const s = n.tabs.find(i => i.id === t);
            s && (s.visits += 1,
            n.masterTabId = t,
            this.save(n))
        }
        registerTabClose(t) {
            const n = this.getState();
            if (!n)
                return;
            const s = n.tabs.find(i => i.id === t);
            s && (s.isClosed = !0,
            n.masterTabId === t && (n.masterTabId = ""),
            this.save(n))
        }
        onChange(t) {
            return this.onChangeCallback = t,
            window.addEventListener("storage", n => {
                if (n.key !== j)
                    return;
                const s = this.getState();
                s && this.fireCallback(s)
            }
            ),
            this
        }
        getState() {
            try {
                const t = localStorage.getItem(j);
                return t ? JSON.parse(t) : null
            } catch {
                return null
            }
        }
        reset() {
            const t = this.getState();
            t && this.save({
                masterTabId: t.masterTabId,
                tabs: t.tabs.map(n => ({
                    ...n,
                    createdAt: Date.now(),
                    leaves: 0,
                    visits: 0
                }))
            })
        }
        save(t) {
            localStorage.setItem(j, JSON.stringify(t)),
            this.fireCallback(t)
        }
        fireCallback(t) {
            this.onChangeCallback && this.onChangeCallback(t)
        }
    }
    const R = new ve;
    class we {
        constructor() {
            this.tabId = Z(),
            this.masterAcquiredCallback = void 0,
            this.masterReleasedCallback = void 0,
            this.isMaster = !1,
            this.isCurrentlyVisible = document.visibilityState === "visible",
            document.addEventListener("visibilitychange", () => {
                const t = document.visibilityState === "visible";
                !t && this.isCurrentlyVisible && R.registerTabLeave(this.tabId),
                t && !this.isCurrentlyVisible && R.registerTabReturn(this.tabId),
                this.isCurrentlyVisible = t
            }
            ),
            window.addEventListener("beforeunload", () => {
                R.registerTabClose(this.tabId)
            }
            ),
            window.addEventListener("pagehide", t => {
                R.registerTabClose(this.tabId)
            }
            ),
            R.onChange(t => this.onStateChange(t))
        }
        init() {
            R.registerNewTab(this.tabId, this.isCurrentlyVisible)
        }
        onMasterAcquired(t) {
            return this.masterAcquiredCallback = t,
            this
        }
        onMasterRelease(t) {
            return this.masterReleasedCallback = t,
            this
        }
        isLastTab() {
            const t = R.getState();
            return t ? t.tabs.every(n => n.isClosed || n.id === this.tabId) : !0
        }
        onStateChange(t) {
            var s, i;
            const n = t.masterTabId === this.tabId;
            n !== this.isMaster && (this.isMaster = n,
            n ? (s = this.masterAcquiredCallback) == null || s.call(this) : (i = this.masterReleasedCallback) == null || i.call(this))
        }
    }
    const q = new we;
    function ye(e) {
        return Math.max(0, Math.min(1, e))
    }
    function be(e) {
        return Math.round(ye(e) * 100)
    }
    function O(e) {
        try {
            return e()
        } catch {
            return null
        }
    }
    function Se(e, t) {
        var r, c;
        const n = (u, h) => h in u
          , s = ((c = (r = e.document) == null ? void 0 : r.documentElement) == null ? void 0 : c.style) ?? {}
          , i = [n(t, "webkitPersistentStorage"), n(t, "webkitTemporaryStorage"), (t.vendor || "").indexOf("Google") === 0, n(e, "webkitResolveLocalFileSystemURL"), n(e, "BatteryManager"), n(e, "webkitMediaStream"), n(e, "webkitSpeechGrammar")].filter(Boolean).length
          , o = [n(e, "ApplePayError"), n(e, "CSSPrimitiveValue"), n(e, "Counter"), (t.vendor || "").indexOf("Apple") === 0, n(t, "getStorageUpdates"), n(e, "WebKitMediaKeys")].filter(Boolean).length
          , a = [n(t, "buildID"), "MozAppearance"in s, "onmozfullscreenchange"in e, "mozInnerScreenX"in e, "CSSMozDocumentRule"in e, "CanvasCaptureMediaStream"in e].filter(Boolean).length;
        return i >= 5 ? "chromium" : o >= 4 ? "webkit" : a >= 4 ? "gecko" : "unknown"
    }
    function _e(e) {
        const t = e.toLowerCase()
          , n = s => t.includes(s);
        return n("edg/") ? "edge" : n("trident") || n("msie") ? "internet_explorer" : n("wechat") ? "wechat" : n("firefox") ? "firefox" : n("opera") || n("opr") ? "opera" : n("chrome") ? "chrome" : n("safari") ? "safari" : "unknown"
    }
    async function Ee(e) {
        const t = e.Notification
          , n = navigator.permissions;
        if (!t || !n)
            return null;
        try {
            const s = await n.query({
                name: "notifications"
            })
              , i = t.permission
              , o = s.state;
            return [i === "denied" && o === "prompt" || i === "granted" && o === "denied", i, o]
        } catch {
            return null
        }
    }
    function ke() {
        const e = document.createElement("canvas")
          , t = O( () => e.getContext("webgl"));
        if (!t)
            return null;
        const n = O( () => t.getParameter(t.VENDOR))
          , s = O( () => t.getParameter(t.RENDERER));
        return !n && !s ? null : {
            vendor: n ?? void 0,
            renderer: s ?? void 0
        }
    }
    async function Ce() {
        const e = [];
        let t = 0;
        const n = (p, S, ...M) => {
            t += p / 100;
            const A = M.length ? "_" + M.map(String).join("_") : "";
            e.push(`${p}r${S}${A}`)
        }
        ;
        if (typeof window > "u" || typeof document > "u")
            return {
                isBotScore: 100,
                explanations: ["100r0_nonbrowser"]
            };
        const s = window
          , i = navigator
          , o = i.webdriver;
        o === !0 ? n(40, 1) : o == null && n(5, 17);
        const a = O( () => Se(s, i))
          , r = O( () => _e(i.userAgent || ""));
        a && r && (r === "chrome" && a !== "chromium" || r === "safari" && a !== "webkit" || r === "firefox" && a !== "gecko") && n(10, 2, r, a);
        const c = i.plugins;
        if (c === void 0)
            n(5, 3);
        else {
            const p = O( () => c.length);
            O( () => c instanceof s.PluginArray) === !1 && n(10, 4),
            !/android|iphone|ipad|mobile/i.test(i.userAgent || "") && typeof p == "number" && p === 0 && n(10, 5)
        }
        const u = i.mimeTypes;
        u && O( () => {
            var A, N;
            let M = Object.getPrototypeOf(u) === ((A = s.MimeTypeArray) == null ? void 0 : A.prototype);
            for (let f = 0; f < u.length; f++)
                M = M && Object.getPrototypeOf(u[f]) === ((N = s.MimeType) == null ? void 0 : N.prototype);
            return M
        }
        ) === !1 && n(10, 6);
        const h = ke();
        if (!h)
            n(5, 7);
        else {
            const p = (h.renderer || "").toLowerCase()
              , S = (h.vendor || "").toLowerCase();
            (p.includes("swiftshader") || p.includes("angle") || p.includes("llvmpipe") || S === "" || p === "" && S !== "") && n(15, 8, h.vendor ?? "", h.renderer ?? "")
        }
        const d = i.language || i.userLanguage || i.browserLanguage || i.systemLanguage
          , m = i.languages;
        !d && !m ? n(5, 9) : Array.isArray(m) && m.length === 0 ? n(5, 10) : Array.isArray(m) && d && !m.includes(d) && n(5, 11);
        const v = O( () => eval.toString().length);
        typeof v == "number" && (v < 30 || v > 200) && n(5, 12, v);
        const g = O( () => Function.prototype.bind.toString());
        g && !/native code/.test(g) && n(5, 13);
        const E = O( () => {
            try {
                null[0]()
            } catch (p) {
                const S = String((p == null ? void 0 : p.stack) || "");
                return S.length < 20 ? S.length : 0
            }
            return 1
        }
        );
        typeof E == "number" && E > 0 && n(5, 14, E);
        const b = await Ee(s);
        b && b[0] === !0 && n(5, 15, b[1], b[2]);
        const k = {
            ow: window.outerWidth,
            oh: window.outerHeight,
            iw: window.innerWidth,
            ih: window.innerHeight
        };
        return [k.ow, k.oh, k.iw, k.ih].some(p => typeof p != "number" || !isFinite(p) || p <= 0) && n(5, 16),
        {
            isBotScore: be(t),
            explanations: e
        }
    }
    async function Ie() {
        var o;
        const e = typeof navigator < "u" ? navigator : {}
          , t = e.connection || {}
          , n = typeof screen < "u" ? screen : {};
        function s(a, r, c) {
            return new Promise(u => {
                const h = setTimeout( () => u(c), r);
                a.then(d => {
                    clearTimeout(h),
                    u(d)
                }
                ).catch( () => {
                    clearTimeout(h),
                    u(c)
                }
                )
            }
            )
        }
        let i = {};
        try {
            typeof e.getBattery == "function" && (i = await s(e.getBattery(), 500, {}))
        } catch {
            i = {}
        }
        return {
            connectionDownlink: t.downlink ?? null,
            connectionEffectiveType: t.effectiveType ?? null,
            connectionRtt: t.rtt ?? null,
            deviceMemory: e.deviceMemory ?? null,
            hardwareConcurrency: e.hardwareConcurrency ?? null,
            isBatteryCharging: typeof i.charging == "boolean" ? i.charging : null,
            batteryLevel: typeof i.level == "number" && i.level >= 0 && i.level <= 1 ? i.level : null,
            userScreenColorDepth: n.colorDepth ?? null,
            userScreenOrientation: ((o = n.orientation) == null ? void 0 : o.type) ?? null,
            devicePixelRatio: typeof window < "u" ? window.devicePixelRatio ?? null : null
        }
    }
    function ft() {
        var n, s, i, o, a, r;
        const e = []
          , t = document.querySelectorAll('script[type="application/ld+json"]');
        for (const c of t)
            try {
                const u = JSON.parse(c.textContent || "null");
                if (!u || typeof u != "object")
                    continue;
                const h = Array.isArray(u["@graph"]) ? u["@graph"] : [u];
                for (const d of h)
                    typeof d != "object" || !d["@type"] || e.push({
                        type: Array.isArray(d["@type"]) ? d["@type"].join(",") : d["@type"],
                        name: d.name || d.headline || d.alternativeHeadline || null,
                        description: d.description || null,
                        brand: ((n = d.brand) == null ? void 0 : n.name) || d.brand || null,
                        sku: d.sku || null,
                        productID: d.productID || null,
                        model: d.model || null,
                        offers: {
                            price: ((s = d.offers) == null ? void 0 : s.price) || null,
                            currency: ((i = d.offers) == null ? void 0 : i.priceCurrency) || null,
                            availability: ((o = d.offers) == null ? void 0 : o.availability) || null
                        },
                        rating: {
                            value: ((a = d.aggregateRating) == null ? void 0 : a.ratingValue) || null,
                            count: ((r = d.aggregateRating) == null ? void 0 : r.reviewCount) || null
                        },
                        breadcrumbs: Array.isArray(d.itemListElement) ? d.itemListElement.map(m => {
                            var v;
                            return ((v = m.item) == null ? void 0 : v.name) || m.name
                        }
                        ).filter(Boolean) : null
                    })
            } catch {}
        if (e.length === 0) {
            const c = document.querySelector('[itemtype*="Product"]');
            if (c) {
                const u = h => {
                    var d, m;
                    return ((m = (d = c.querySelector(`[itemprop="${h}"]`)) == null ? void 0 : d.innerText) == null ? void 0 : m.trim()) || null
                }
                ;
                e.push({
                    type: "Product",
                    name: u("name"),
                    brand: u("brand"),
                    offers: {
                        price: u("price"),
                        currency: u("priceCurrency"),
                        availability: u("availability")
                    },
                    rating: {
                        value: u("ratingValue"),
                        count: u("reviewCount")
                    }
                })
            }
        }
        return e.length === 0 ? null : e
    }
    class Me {
        constructor(t) {
            this.context = t,
            this.unsubscribers = [],
            this.buffer = new Zt,
            this.isStarted = !1
        }
        start() {
            this.isStarted || (this.isStarted = !0,
            l.debug("🎃 Event Manager2 is started"),
            this.buffer.start(),
            this.unsubscribers.push(pe(this.context.counter, t => this.handleYandexGoal(t)), ue(t => {
                this.handleEcommerce(t)
            }
            ), te( (t, n) => {
                this.handleClick(t, n)
            }
            ), me(t => {
                this.handleMouseKinematic(t)
            }
            ), fe(t => {
                this.handleKeyborad(t)
            }
            ), ge(t => {
                this.handleScroll(t)
            }
            ), he(t => this.handleHistoryChange(t))))
        }
        stop() {
            this.isStarted && (this.isStarted = !1,
            l.debug("🎃 Event Manager2 is stopped"),
            this.buffer.stop(),
            this.unsubscribers.forEach(t => t()),
            this.unsubscribers = [])
        }
        handleNewSession(t, n) {
            Ce().then(i => {
                this.buffer.addEventOnce({
                    ...this.getBaseDetails(),
                    event: "bot-detection",
                    payload: {
                        e: i.explanations,
                        score: i.isBotScore
                    }
                })
            }
            ),
            Ie().then(i => {
                this.buffer.addEventOnce({
                    ...this.getBaseDetails(),
                    event: "device-info",
                    payload: i
                })
            }
            );
            const s = ft();
            s && s.length && this.buffer.addEventOnce({
                ...this.getBaseDetails(),
                event: "schema-org",
                payload: s
            }, !1),
            this.buffer.addEventOnce({
                ...this.getBaseDetails(),
                event: "new-session",
                payload: t,
                session_id: n
            }),
            this.buffer.flush()
        }
        handlePageOpen(t, n) {
            const s = ft();
            s && s.length && this.buffer.addEventOnce({
                ...this.getBaseDetails(),
                event: "schema-org",
                payload: s
            }, !1),
            this.buffer.addEventOnce({
                ...this.getBaseDetails(),
                session_id: n,
                event: "page-open",
                payload: t
            })
        }
        handleTabEvent(t) {}
        handleYandexGoal(t) {
            this.buffer.addEvent({
                ...this.getBaseDetails(),
                event: "yandex-goal",
                payload: t
            })
        }
        handleEcommerce(t) {
            this.buffer.addEvent({
                ...this.getBaseDetails(),
                event: "ecommerce",
                payload: t
            })
        }
        handleClick(t, n) {
            this.buffer.addEvent({
                ...this.getBaseDetails(),
                event: "click",
                payload: t
            }),
            n && (l.debug("🚀 Force flushing buffer for critical click"),
            this.buffer.flush())
        }
        handleMouseKinematic(t) {
            this.buffer.addEvent({
                ...this.getBaseDetails(),
                event: "mouse-kinematic",
                payload: t
            })
        }
        handleScroll(t) {
            this.buffer.addEvent({
                ...this.getBaseDetails(),
                event: "scroll",
                payload: t
            })
        }
        handleKeyborad(t) {
            this.buffer.addEvent({
                ...this.getBaseDetails(),
                event: "keyboard",
                payload: t
            })
        }
        handleHistoryChange(t) {
            this.buffer.addEvent({
                ...this.getBaseDetails(),
                event: "history",
                payload: t
            })
        }
        getBaseDetails() {
            return {
                client_id: this.context.yandexMetricaData.clientId ?? "",
                client_token: this.context.clientToken,
                session_id: this.context.sessionContext.getLastSessionId(),
                tab_id: q.tabId,
                timestamp: Date.now()
            }
        }
    }
    class xe {
        constructor(t) {
            this.context = t,
            this.isEnabled = !1
        }
        enable() {
            this.isEnabled || (l.info("🛟 Background save is enabled"),
            this.isEnabled = !0,
            this.save())
        }
        disable() {
            this.isEnabled && (l.info("🛟 Background save is disabled"),
            this.isEnabled = !1,
            this.clearSaveTimer())
        }
        save() {
            var n, s;
            this.scheduleNextSave();
            const t = (n = this.context.sessionContext.session) == null ? void 0 : n.getServerProjection();
            return t ? (ot.saveSession({
                ...t,
                tabs: ((s = R.getState()) == null ? void 0 : s.tabs) ?? [],
                timestamp: Date.now(),
                sdk_version: J
            }),
            this) : this
        }
        clearSaveTimer() {
            return this.saveTimer && clearTimeout(this.saveTimer),
            this
        }
        scheduleNextSave() {
            return !this.context.sessionContext.session || !this.isEnabled ? this : (this.clearSaveTimer(),
            l.info("🛟 Background save scheduled"),
            this.saveTimer = window.setTimeout( () => {
                this.save()
            }
            , D.sendDelay),
            this)
        }
    }
    class Te {
        constructor(t) {
            this.context = t,
            this.accumulatedIdleTime = 0
        }
        reset() {
            this.stop(),
            this.delayBeforeIdleStartTimer = window.setTimeout( () => {
                this.delayBeforeIdleStartTimer = void 0,
                this.startIdleTracking()
            }
            , D.delayBeforeIdleStart)
        }
        stop() {
            this.delayBeforeIdleStartTimer && (clearTimeout(this.delayBeforeIdleStartTimer),
            this.delayBeforeIdleStartTimer = void 0),
            this.idleIntervalId && (clearInterval(this.idleIntervalId),
            this.idleIntervalId = void 0),
            this.accumulatedIdleTime = 0
        }
        onTimerOver(t) {
            return this.onMaxIdleDurationCallback = t,
            this
        }
        startIdleTracking() {
            this.idleIntervalId || (l.debug("Idle timer started"),
            this.accumulatedIdleTime = 0,
            this.idleIntervalId = window.setInterval( () => {
                var t;
                this.accumulatedIdleTime += D.idleTickInterval,
                this.context.sessionContext.registerIdleTick(D.idleTickInterval),
                this.accumulatedIdleTime >= D.maxIdleDuration && (l.debug("Idle timer session expired"),
                (t = this.onMaxIdleDurationCallback) == null || t.call(this),
                this.stop())
            }
            , D.idleTickInterval))
        }
    }
    function De() {
        const e = new URLSearchParams(window.location.search)
          , t = ["source", "medium", "campaign", "term", "content"]
          , n = {
            traffic_type: "direct",
            landing_page_type: "unknown",
            referrer_domain: document.referrer ? new URL(document.referrer).hostname : "",
            campaign: null,
            content: null,
            medium: null,
            source: null,
            term: null
        };
        return t.forEach(s => {
            const i = e.get(`utm_${s}`);
            i && (n[s] = i,
            s === "medium" && (n.traffic_type = i))
        }
        ),
        n
    }
    class Le {
        constructor(t, n, s) {
            this.clientToken = t,
            this.yandexMetricaData = n,
            this.counter = n.counter;
            const i = s ?? st(n, t, De());
            this.eventManager = new Gt(this),
            this.sessionContext = new Ft(this,i),
            this.sessionSaver = new xe(this),
            this.idleTimer = new Te(this),
            this.eventManager2 = new Me(this);
            const o = i.getServerProjection();
            s ? this.eventManager2.handlePageOpen(z(), o.session_id) : this.eventManager2.handleNewSession({
                client_id: o.client_id,
                client_token: o.client_token,
                counter_id: o.counter_id,
                start_time: o.start_time,
                hour: o.hour,
                weekDay: o.weekDay,
                ...z(),
                device_browser: o.device_info.browser,
                device_platform: o.device_info.platform,
                device_type: o.device_info.device_type,
                device_user_agent: o.device_info.user_agent,
                traffic_source_entry_point: o.traffic_source.entry_point,
                traffic_source_landing_page: o.traffic_source.landing_page,
                traffic_source_referrer: o.traffic_source.referrer,
                utm_campaign: o.utm_data.campaign,
                utm_content: o.utm_data.content,
                utm_landing_page_type: o.utm_data.landing_page_type,
                utm_medium: o.utm_data.medium,
                utm_referrer_domain: o.utm_data.referrer_domain,
                utm_source: o.utm_data.source,
                utm_term: o.utm_data.term,
                utm_traffic_type: o.utm_data.traffic_type
            }, i.getSessionId())
        }
    }
    function Ae(e, t) {
        const n = Nt();
        return n || R.cleanStorage(),
        n ? l.info("Session was restored from local storage") : l.info("Session was inited"),
        new Le(e,t,n)
    }
    function Re(e) {
        const t = Y( () => e(), 500);
        document.addEventListener("keydown", t),
        document.addEventListener("mousemove", t),
        document.addEventListener("click", t),
        window.addEventListener("scroll", t)
    }
    class Oe {
        constructor(t) {
            this.context = t,
            this.isActive = !1,
            Re( () => this.context.idleTimer.reset()),
            this.context.sessionContext.onSessionReactivated( () => this.onSessionReactivated())
        }
        onTimeout(t) {
            this.context.idleTimer.onTimerOver( () => t())
        }
        onTabFocusLose() {
            this.context.sessionContext.save(),
            this.context.eventManager2.handleTabEvent("tab-focus-out")
        }
        activate() {
            var t;
            this.isActive || (l.info(`👨‍💼 Current tab is master with session ${(t = this.context.sessionContext.session) == null ? void 0 : t.getSessionId()}`),
            this.isActive = !0,
            this.context.eventManager.start(),
            this.context.sessionSaver.enable(),
            this.context.eventManager2.handleTabEvent("tab-focus-in"),
            this.context.eventManager2.start())
        }
        deactivate() {
            this.isActive && (l.info("👨‍💼 Current tab is not master anymore"),
            this.isActive = !1,
            this.sleep(),
            this.context.eventManager.stop(),
            this.context.eventManager2.stop())
        }
        updateSession(t) {
            if (l.info(`👨‍💼 Current tab need update session with id ${t == null ? void 0 : t.session_id}`),
            this.context.sessionContext.set(t),
            !t) {
                this.sleep();
                return
            }
        }
        closeSession(t) {
            this.context.sessionContext.destroy(),
            this.sleep(),
            l.info(`Session was closed because of ${t}`)
        }
        save() {
            this.context.sessionSaver.save()
        }
        getLastSessionId() {
            return this.context.sessionContext.getLastSessionId()
        }
        onSessionReactivated() {
            this.isActive && (R.reset(),
            this.context.sessionSaver.enable())
        }
        sleep() {
            l.info("Current tab is sleeping"),
            this.context.sessionSaver.disable(),
            this.context.idleTimer.stop()
        }
    }
    function Ne(e, t) {
        try {
            const n = new URL(window.location.href)
              , s = n.searchParams;
            s.set(e, String(t)),
            n.search = s.toString(),
            window.history.replaceState({}, "", n.toString())
        } catch {}
    }
    function Pe() {
        return new URLSearchParams(window.location.search).get("rivox-debug") === "true"
    }
    function Be(e) {
        Pe() && Ne("rivox-client-id", e)
    }
    const Fe = ["http://www.bing.com/bingbot.htm", "http://yandex.com/bots"];
    function He() {
        const e = navigator.userAgent.toLowerCase();
        return Fe.some(t => e.includes(t.toLowerCase()))
    }
    function Ye(e) {
        return new Promise(t => setTimeout(t, e))
    }
    async function mt(e, t) {
        const {attemptsCount: n, delay: s} = t;
        for (let i = 1; i <= n; i++) {
            const o = await e();
            if (o != null)
                return o;
            i < n && await Ye(s)
        }
        return null
    }
    class Ke {
        constructor(t, n) {
            this.counterId = t,
            this.counter = n;
            const s = this.counter.reachGoal.bind(this.counter);
            this.reachGoalRef = {
                fn: s
            },
            this.counter.reachGoal = (i, o={}, ...a) => this.reachGoalRef.fn(i, o, ...a)
        }
        async getClientId() {
            return this.counter.getClientID() || null
        }
        getReachGoalFn() {
            return this.reachGoalRef
        }
    }
    class $e {
        constructor(t, n) {
            this.counterId = t,
            this.originalYm = n,
            this.reachGoalRef = {
                fn: (o, a={}, ...r) => this.originalYm.apply(null, [this.counterId, "reachGoal", o, a, ...r])
            };
            const s = this
              , i = window.ym ?? n;
            window.ym = function(...a) {
                try {
                    const [r,c,u,h,...d] = a;
                    if (Number(r) === s.counterId && c === "reachGoal")
                        return s.reachGoalRef.fn(String(u), h ?? {}, ...d)
                } catch {}
                return i.apply(this, a)
            }
        }
        async getClientId() {
            return new Promise(t => {
                this.originalYm(this.counterId, "getClientID", n => {
                    t(n || null)
                }
                )
            }
            )
        }
        getReachGoalFn() {
            return this.reachGoalRef
        }
    }
    function Ve(e) {
        const t = "yaCounter" + e
          , n = window[t]
          , s = window.ym;
        return n && typeof n.getClientID == "function" ? new Ke(e,n) : typeof s == "function" ? new $e(e,s) : null
    }
    function je() {
        for (const e in window)
            if (e.startsWith("yaCounter")) {
                const t = e.replace("yaCounter", "");
                if (t && !isNaN(Number(t)))
                    return Number(t)
            }
        return null
    }
    function qe(e=5e3) {
        return new Promise(t => {
            let s = 0;
            const i = () => {
                const o = typeof window.ym == "function"
                  , a = Object.keys(window).some(r => r.startsWith("yaCounter"));
                o && a ? t({
                    counterReady: a,
                    typeofYm: typeof window.ym,
                    reason: "success"
                }) : s >= e ? t({
                    counterReady: a,
                    typeofYm: typeof window.ym,
                    reason: "timeout"
                }) : (s += 100,
                setTimeout(i, 100))
            }
            ;
            i()
        }
        )
    }
    async function Ge() {
        const e = await qe();
        l.info("✅ RIVOX SDK metrica is ready", e);
        const t = await mt( () => je(), {
            attemptsCount: 20,
            delay: 100
        });
        if (l.info("✅ RIVOX SDK metrica counter is", t),
        !t)
            return {
                counterId: null,
                clientId: null,
                meta: e,
                counter: null
            };
        const n = Ve(t);
        if (!n)
            return {
                counterId: t,
                clientId: null,
                meta: e,
                counter: n
            };
        const s = await mt( () => n.getClientId(), {
            attemptsCount: 30,
            delay: 100
        });
        return l.info("✅ RIVOX SDK metrica clientId is", s),
        s ? {
            counterId: t,
            clientId: s,
            meta: e,
            counter: n
        } : {
            counterId: t,
            clientId: null,
            meta: e,
            counter: n
        }
    }
    function pushRivoxParamsToMetrika(counterId, sessionId, clientToken, retry = 0) {
        const delay = Math.min(3e4, 1500 * Math.pow(retry + 1, 1.5));
        if (!counterId || !sessionId)
            return;
        if (typeof window.ym === "function") {
            try {
                window.ym(counterId, "params", {
                    rivox: {
                        sid: sessionId,
                        ct: clientToken
                    }
                });
                l.info("✅ RIVOX SDK pushed params to Metrika", {
                    counterId: counterId,
                    sessionId: sessionId
                })
            } catch (e) {
                retry < 6 && setTimeout( () => pushRivoxParamsToMetrika(counterId, sessionId, clientToken, retry + 1), delay)
            }
        } else
            retry < 6 && setTimeout( () => pushRivoxParamsToMetrika(counterId, sessionId, clientToken, retry + 1), delay)
    }
    let gt = !1;
    function Xe(e) {
        return gt || He() || !e ? Promise.resolve(null) : (gt = !0,
        new Promise(t => {
            setTimeout(async () => {
                const n = await Ge();
                Be(n.clientId);
                const s = Ae(e, n)
                  , i = new Oe(s);
                try {
                    pushRivoxParamsToMetrika(n.counterId, s.sessionContext.getLastSessionId(), e)
                } catch (r) {}
                l.info("✅ RIVOX SDK initialization completed with version", J),
                t(i)
            }
            , D.initDelay)
        }
        ))
    }
    function Ue(e) {
        q.onMasterAcquired(e)
    }
    function ze(e) {
        q.onMasterRelease(e)
    }
    function We(e) {
        document.addEventListener("visibilitychange", () => {
            document.visibilityState === "hidden" && (l.info("Current tab focus lost"),
            e())
        }
        )
    }
    function Je(e) {
        window.addEventListener("storage", t => {
            t.key === $ && (l.info("Session was updated in local storage"),
            e(Q(t.newValue)))
        }
        )
    }
    async function Qe(e) {
        l.restoreFromStorage();
        const t = await Xe(e);
        if (!t)
            return;
        function n(s) {
            t == null || t.closeSession(s),
            et(),
            R.reset()
        }
        We( () => t.onTabFocusLose()),
        Ue( () => t.activate()),
        ze( () => {
            t.deactivate()
        }
        ),
        t.onTimeout( () => n("timeout")),
        Je(s => t.updateSession(s)),
        q.init(),
        window.RIVOX_SDK = {
            setLogLevel: l.setLevel,
            getLastSessionId: () => t.getLastSessionId()
        }
    }
    async function pt() {
        const e = yt();
        Qe(e == null ? void 0 : e.token)
    }
    l.restoreFromStorage(),
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => pt(), {
        once: !0
    }) : pt()
}
)();
