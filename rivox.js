/**
 * RIVOX SDK - Client-side tracking and analytics
 * Version: 4.6.3
 */
// RIVOX SDK v4.6.3
// Enhanced version with ML data collection capabilities

// Utility functions for Yandex.Metrika
function isYandexMetrikaReady() {
  return (
    typeof ym !== "undefined" || typeof Ya !== "undefined" || !!window.yaCounter
  );
}

// Updated function to be more robust
function getYandexCounterId() {
  // 1. Check explicitly set variable
  if (window.ymCounterId) return window.ymCounterId;

  // 2. Look for yaCounter object and extract ID
  for (const key in window) {
    if (key.startsWith("yaCounter")) {
      const counterId = key.replace("yaCounter", "");
      if (counterId && !isNaN(Number(counterId))) {
        Logger.debug("Found counter ID via yaCounter object:", counterId);
        return counterId;
      }
    }
  }

  // 3. Look for ym object and its counters
  if (typeof ym !== "undefined") {
    try {
      // Try common internal properties
      const counters = ym.a || ym.counters || ym.__counters || [];
      if (counters.length > 0 && counters[0] && counters[0].id) {
        Logger.debug(
          "Found counter ID via ym internal property:",
          counters[0].id
        );
        return counters[0].id;
      }
    } catch (e) {
      Logger.warn("Error checking ym internal properties:", e);
    }
  }

  Logger.debug(
    "Yandex.Metrika counter ID not found after checking multiple sources."
  );
  return null;
}

// Define a placeholder Logger globally first
let Logger = {
  setLevel: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

(function (window) {
  "use strict";

  const SDK_VERSION = "4.6.3";

  // Configuration
  const config = {
    endpoint: "https://rivox-data-handler-779203791697.europe-central2.run.app",
    debug: false, // Set debug to false for production
    sessionTimeout: 30 * 60 * 1000, // 30 минут
    scrollChunkSize: 100, // Увеличиваем размер чанка
    scrollSendInterval: 5000, // Интервал отправки скролл-данных
    minScrollChunksForSend: 20, // Минимальное количество чанков для отправки
    minTimeBeforeScrollSend: 25000, // Минимальное время перед отправкой скролл-данных
    maxScrollChunksPerBatch: 50, // Максимальное количество чанков в одной отправке
    minInteractionGap: 500,
    maxInactiveTime: 300000,
    minScrollSpeed: 0.1,
    maxScrollSpeed: 10,
    viewportGridSize: 10,
    minHoverDuration: 100,
    maxHoverDuration: 30000,
    interactionTimeWindow: 5000,
    minFormDuration: 1000,
    maxFormDuration: 300000,
    minClickGap: 100,
    maxClickGap: 10000,
    allowedDomains: ["spb.sotovik.shop", "www.spb.sotovik.shop", "inoxhub.ru"],
    initDelay: 300,
    sendDelay: 300000, // 5 минут
    retryDelay: 120000, // 2 минуты
    maxRetries: 3,
    maxQueueSize: 10,
    deduplicationWindow: 60000, // 1 минута
  };

  // Re-define the global Logger with minimal functionality inside the IIFE
  Logger = {
    LEVELS: {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    },
    level: 3, // Default to ERROR level for production

    setLevel: function (level) {
      this.level = level;
    },

    debug: function () {},

    info: function (msg) {
      // Only log SDK initialization and Metrika goal capture
      if (
        msg === "✅ RIVOX SDK initialization completed" ||
        msg.includes("🎯 Metrika reachGoal intercepted")
      ) {
        console.log(`rivox.js ℹ️: ${msg}`);
      }
    },

    warn: function () {},

    error: function () {},
  };

  // Session data
  let sessionData = null;
  let isSessionActive = false;
  let lastActivityTime = Date.now();
  let queuedData = [];
  let sendTimer = null;

  // Add failed queue
  const failedQueue = [];
  let retryTimer = null;

  // Add sent data tracking
  const sentData = new Set();

  function getDataHash(data) {
    return `${data.session_id}_${data.timestamp}`;
  }

  function isDuplicate(data) {
    const hash = getDataHash(data);
    if (sentData.has(hash)) {
      return true;
    }

    // Clean up old hashes
    const now = Date.now();
    for (const oldHash of sentData) {
      const [, timestamp] = oldHash.split("_");
      if (now - Number(timestamp) > config.deduplicationWindow) {
        sentData.delete(oldHash);
      }
    }

    sentData.add(hash);
    return false;
  }

  // Update last activity time
  function updateActivity() {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime;

    // If session was inactive and now active again
    if (timeSinceLastActivity > config.maxInactiveTime) {
      Logger.info("Session reactivated after inactivity");
      startNewSession();
      return;
    }

    lastActivityTime = now;
    if (sessionData) {
      sessionData.last_activity = now;
      // Update session duration
      sessionData.duration = now - sessionData.start_time;
    }
  }

  // Start new session
  function startNewSession() {
    if (sessionData) {
      // Send current session data before starting new
      sendSessionSummary();
    }

    sessionData = {
      client_id: generateClientId(),
      client_token: config.token,
      session_id: generateSessionId(),
      start_time: Date.now(),
      last_activity: Date.now(),
      page_views: [
        {
          timestamp: Date.now(),
          url: window.location.href,
          referrer: document.referrer,
        },
      ],
      scroll_chunks: [],
      hover_events: [],
      form_interactions: [],
      cta_clicks: [],
      modal_interactions: [],
      utm_data: extractUTMData(),
      metrika_goals: [],
      conversion_data: {
        goals_reached: [],
        ecommerce_data: [],
        last_goal_timestamp: null,
        conversion_path: [],
      },
      traffic_source: {
        referrer: document.referrer,
        landing_page: window.location.href,
        entry_point: window.location.pathname,
      },
      user_behavior: {
        time_to_first_interaction: null,
        total_interactions: 0,
        interaction_frequency: [],
        scroll_depth_percentages: [],
        time_between_clicks: [],
        mouse_movement_heatmap: [],
        viewport_size: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
      ml_features: {
        interest_signals: [],
        behavior_patterns: [],
        user_segment: null,
        conversion_probability: null,
        funnel_analysis: {},
      },
    };

    isSessionActive = true;
    Logger.info("New session started:", sessionData.session_id);
  }

  // Extract UTM data
  function extractUTMData() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmFields = ["source", "medium", "campaign", "term", "content"];
    const utmData = {
      traffic_type: "direct",
      landing_page_type: "unknown",
      referrer_domain: document.referrer
        ? new URL(document.referrer).hostname
        : "",
    };

    utmFields.forEach((field) => {
      const value = urlParams.get(`utm_${field}`);
      if (value) {
        utmData[field] = value;
        if (field === "medium") {
          utmData.traffic_type = value;
        }
      }
    });

    return utmData;
  }

  // Queue data for sending
  function queueData(data) {
    queuedData.push({
      timestamp: new Date().toISOString(),
      data: data,
    });

    // If queue is getting large, send immediately
    if (queuedData.length >= 5) {
      sendQueuedData();
    }
  }

  // Send queued data
  async function sendQueuedData() {
    if (queuedData.length === 0) return;

    const dataToSend = queuedData;
    queuedData = [];

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      // Return failed items to queue
      queuedData = [...dataToSend, ...queuedData];
    }
  }

  // Get current session duration
  function getSessionDuration() {
    return sessionData ? lastActivityTime - sessionData.start_time : 0;
  }

  function isAllowedDomain(hostname) {
    if (!hostname) return false;

    // Нормализуем домен (убираем www. если есть)
    const normalizedHostname = hostname.replace(/^www\./, "");

    // Проверяем домен и его поддомены
    const isAllowed = config.allowedDomains.some((domain) => {
      const normalizedDomain = domain.replace(/^www\./, "");
      // Проверяем точное совпадение или поддомен
      return (
        normalizedHostname === normalizedDomain ||
        normalizedHostname.endsWith("." + normalizedDomain)
      );
    });

    if (config.debug) {
      Logger.debug("Checking domain:", {
        original: hostname,
        normalized: normalizedHostname,
        allowed: isAllowed,
        allowedDomains: config.allowedDomains,
      });
    }

    return isAllowed;
  }

  // Get endpoint URL
  function getEndpointUrl() {
    if (config.debug) {
      Logger.debug("Using endpoint:", config.endpoint);
    }
    return config.endpoint;
  }

  // Load configuration from script data attributes
  function loadConfig() {
    const script = document.querySelector("script[data-token]");
    if (!script) {
      Logger.error("RIVOX SDK script tag with data-token not found");
      return null;
    }

    // Get token
    const token = script.dataset.token;
    if (!token) {
      Logger.error("RIVOX SDK token not specified");
      return null;
    }

    // Get optional delays
    const initDelay = parseInt(script.dataset.initDelay) || config.initDelay;
    const sendDelay = parseInt(script.dataset.sendDelay) || config.sendDelay;

    // Update config with token
    config.token = token;

    if (config.debug) {
      Logger.debug("RIVOX SDK Configuration:", {
        token,
        initDelay,
        sendDelay,
      });
    }

    return {
      token,
      initDelay,
      sendDelay,
    };
  }

  function waitForMetrika(callback) {
    let attempts = 0;
    const maxAttempts = 50;

    function check() {
      attempts++;

      // Проверяем все возможные варианты существования Метрики
      if (typeof ym !== "undefined" && typeof ym.a !== "undefined") {
        Logger.info("Metrika ready (ym object)");
        callback();
        return;
      }

      if (window.Ya && window.Ya.Metrika) {
        Logger.info("Metrika ready (Ya.Metrika)");
        callback();
        return;
      }

      // Ищем счетчик через объекты window
      for (const key in window) {
        if (key.startsWith("yaCounter")) {
          Logger.info("Metrika ready (counter object)");
          callback();
          return;
        }
      }

      if (attempts >= maxAttempts) {
        Logger.info("Proceeding without waiting for Metrika");
        callback();
        return;
      }

      Logger.debug(
        `Waiting for Metrika (attempt ${attempts}/${maxAttempts})...`
      );
      setTimeout(check, 100);
    }

    check();
  }

  // Initialize SDK
  async function init() {
    const currentDomain = window.location.hostname;
    if (!isAllowedDomain(currentDomain)) {
      return; // Прерываем инициализацию для неразрешенных доменов
    }

    // Load configuration
    const userConfig = loadConfig();
    if (!userConfig) return;

    // Wait for Metrika to be ready
    await new Promise((resolve) => {
      waitForMetrika(resolve);
    });

    // Get client ID
    const clientId = await generateClientId();

    // Initialize or restore session data
    const savedSession = loadSessionFromStorage();
    if (savedSession) {
      sessionData = savedSession;
    } else {
      sessionData = createSessionData(clientId);
    }

    // Ensure all required arrays exist
    sessionData.page_history = sessionData.page_history || [];
    sessionData.scroll_chunks = sessionData.scroll_chunks || [];
    sessionData.hover_events = sessionData.hover_events || [];
    sessionData.form_interactions = sessionData.form_interactions || [];
    sessionData.cta_clicks = sessionData.cta_clicks || [];
    sessionData.metrika_goals = sessionData.metrika_goals || [];

    // Add current page to history
    sessionData.page_history.push({
      timestamp: Date.now(),
      url: window.location.href,
      referrer: document.referrer,
      time_spent: 0,
    });

    isSessionActive = true;
    setupEventListeners();
    saveSessionToStorage();

    // Start activity tracking
    document.addEventListener("mousemove", updateActivity);
    document.addEventListener("keydown", updateActivity);
    document.addEventListener("scroll", updateActivity);
    document.addEventListener("click", updateActivity);

    // Start trackers with configured delay
    setTimeout(() => {
      if (typeof RIVOX.start === "function") {
        RIVOX.start();
      }
    }, userConfig.initDelay);

    // Set up periodic data sending
    startPeriodicSending();

    // Set up session timeout check
    setInterval(() => {
      const inactiveTime = Date.now() - lastActivityTime;
      if (inactiveTime > config.sessionTimeout) {
        isSessionActive = false;
        sendDataGuaranteed("session_timeout");
      }
    }, 60000);

    setupMetrikaTracking();
    Logger.info("✅ RIVOX SDK initialization completed");
  }

  // Add new scroll data buffer and timeout variables
  let scrollDataBuffer = [];
  let scrollSendTimeout = null;

  // Enhanced event listeners setup
  function setupEventListeners() {
    // Scroll tracking with heatmap
    let lastScrollY = window.scrollY;

    window.addEventListener(
      "scroll",
      throttle(() => {
        updateActivity();
        const currentScrollY = window.scrollY;
        const scrollDelta = Math.abs(currentScrollY - lastScrollY);

        if (scrollDelta >= config.scrollChunkSize) {
          const documentHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          );
          const viewportHeight = window.innerHeight;
          const scrollPercent =
            (currentScrollY / (documentHeight - viewportHeight)) * 100;

          // Add scroll data to buffer
          scrollDataBuffer.push({
            timestamp: Date.now(),
            position: currentScrollY,
            delta: scrollDelta,
            viewport_height: viewportHeight,
            document_height: documentHeight,
            percent: scrollPercent,
          });

          // Update scroll depth percentages
          if (!sessionData.user_behavior.scroll_depth_percentages) {
            sessionData.user_behavior.scroll_depth_percentages = [];
          }
          sessionData.user_behavior.scroll_depth_percentages.push({
            depth: scrollPercent,
            timestamp: Date.now(),
          });

          // Update max scroll depth
          sessionData.scroll_depth_max = Math.max(
            sessionData.scroll_depth_max || 0,
            scrollPercent
          );

          lastScrollY = currentScrollY;

          // Clear existing timeout
          if (scrollSendTimeout) {
            clearTimeout(scrollSendTimeout);
          }

          // Set new timeout for sending data
          scrollSendTimeout = setTimeout(() => {
            if (scrollDataBuffer.length > 0) {
              // Ensure scroll_chunks array exists
              if (!sessionData.scroll_chunks) {
                sessionData.scroll_chunks = [];
              }

              // Add buffered data to session
              sessionData.scroll_chunks.push(...scrollDataBuffer);
              scrollDataBuffer = [];

              // Check if we should send data
              if (shouldSendScrollData()) {
                sendSessionSummary();
              }
            }
          }, config.scrollSendInterval);
        }
      }, 100)
    );

    // Hover tracking
    let hoverStartTime;
    let hoveredElement;

    document.addEventListener(
      "mouseover",
      throttle((e) => {
        updateActivity();
        const target = e.target;
        if (isImportantElement(target)) {
          hoverStartTime = Date.now();
          hoveredElement = target;
        }

        // Check if we should send data
        if (shouldSendData()) {
          sendSessionSummary();
        }
      }, 100)
    );

    document.addEventListener(
      "mouseout",
      throttle((e) => {
        updateActivity();
        const target = e.target;
        if (
          isImportantElement(target) &&
          hoverStartTime &&
          target === hoveredElement
        ) {
          const hoverDuration = Date.now() - hoverStartTime;

          sessionData.hover_events.push({
            timestamp: Date.now(),
            element: getElementPath(target),
            duration: hoverDuration,
            start_time: hoverStartTime,
          });

          hoverStartTime = null;
          hoveredElement = null;
        }
      }, 100)
    );

    // Click tracking
    document.addEventListener("click", (e) => {
      updateActivity();

      // Найдем ближайший важный элемент
      let target = e.target;
      let closestCTA = null;

      // Поищем ближайший CTA элемент вверх по DOM
      while (target && target !== document) {
        if (isCTAElement(target)) {
          closestCTA = target;
          break;
        }
        target = target.parentElement;
      }

      // Используем найденный CTA или исходный элемент
      const clickTarget = closestCTA || e.target;

      // Получаем точные координаты относительно страницы
      const rect = clickTarget.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      const clickData = {
        timestamp: Date.now(),
        element: getElementPath(clickTarget),
        element_text: (
          clickTarget.textContent ||
          clickTarget.value ||
          ""
        ).trim(),
        position: {
          x: Math.round(e.clientX + scrollX), // абсолютная позиция
          y: Math.round(e.clientY + scrollY),
          relative: {
            x: Math.round(e.clientX), // относительно viewport
            y: Math.round(e.clientY),
          },
          element: {
            // позиция элемента
            top: Math.round(rect.top + scrollY),
            left: Math.round(rect.left + scrollX),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        },
        is_cta: isCTAElement(clickTarget),
      };

      sessionData.cta_clicks.push(clickData);
      sessionData.user_behavior.total_interactions++;

      if (!sessionData.user_behavior.time_to_first_interaction) {
        sessionData.user_behavior.time_to_first_interaction =
          Date.now() - sessionData.start_time;
      }

      // Update time between clicks
      if (!sessionData.user_behavior.time_between_clicks) {
        sessionData.user_behavior.time_between_clicks = [];
      }
      const lastClick =
        sessionData.user_behavior.time_between_clicks[
          sessionData.user_behavior.time_between_clicks.length - 1
        ];
      if (lastClick) {
        sessionData.user_behavior.time_between_clicks.push({
          timestamp: Date.now(),
          delta: Date.now() - lastClick.timestamp,
        });
      } else {
        sessionData.user_behavior.time_between_clicks.push({
          timestamp: Date.now(),
          delta: 0,
        });
      }

      // Проверяем условия отправки вместо немедленной отправки
      if (shouldSendData()) {
        sendDataGuaranteed("events_threshold").catch(() => {});
      }
    });

    // Mouse movement tracking
    let mouseMoveTimeout;
    let mousePoints = new Map(); // Используем Map для оптимизации

    document.addEventListener(
      "mousemove",
      throttle((e) => {
        updateActivity();

        const x = Math.floor(e.clientX / 10) * 10; // группируем по 10px
        const y = Math.floor(e.clientY / 10) * 10;
        const key = `${x},${y}`;

        mousePoints.set(key, (mousePoints.get(key) || 0) + 1);

        // Очищаем предыдущий таймаут
        if (mouseMoveTimeout) {
          clearTimeout(mouseMoveTimeout);
        }

        // Сохраняем данные каждые 5 секунд
        mouseMoveTimeout = setTimeout(() => {
          if (!sessionData.user_behavior.mouse_movement_heatmap) {
            sessionData.user_behavior.mouse_movement_heatmap = [];
          }

          mousePoints.forEach((count, key) => {
            const [x, y] = key.split(",").map(Number);
            sessionData.user_behavior.mouse_movement_heatmap.push({
              x,
              y,
              count,
              timestamp: Date.now(),
            });
          });

          mousePoints.clear();
        }, 5000);
      }, 100)
    );

    // Form tracking
    document.addEventListener("submit", (e) => {
      // Проверяем, что форма существует и не пустая
      if (!e.target || !e.target.elements) return;

      if (!sessionData.form_interactions) {
        sessionData.form_interactions = [];
      }

      const formData = {
        timestamp: Date.now(),
        form_id: e.target.id || e.target.name || "unknown",
        fields: Array.from(e.target.elements)
          .filter((el) => el.name) // Фильтруем только элементы с именем
          .map((el) => ({
            name: el.name,
            type: el.type,
            value: el.value,
          })),
      };

      sessionData.form_interactions.push(formData);

      // Проверяем условия отправки данных
      if (shouldSendData()) {
        sendSessionSummary();
      }
    });
  }

  // Send data using JSONP
  function sendDataJSONP(data) {
    return new Promise((resolve, reject) => {
      try {
        const callbackName = "rivox_callback_" + Date.now();
        const script = document.createElement("script");
        const endpoint = getEndpointUrl();

        // Add origin to data for CORS
        data.origin = window.location.origin;

        // Create URL with parameters
        const params = new URLSearchParams({
          callback: callbackName,
          data: JSON.stringify(data),
          token: config.token,
          origin: window.location.origin,
        });

        script.src = `${endpoint}?${params.toString()}`;

        // Setup callback
        window[callbackName] = function (response) {
          document.body.removeChild(script);
          delete window[callbackName];
          resolve(response);
        };

        // Setup error handling
        script.onerror = () => {
          document.body.removeChild(script);
          delete window[callbackName];
          reject(new Error("JSONP request failed"));
        };

        // Setup timeout
        const timeout = setTimeout(() => {
          if (window[callbackName]) {
            document.body.removeChild(script);
            delete window[callbackName];
            reject(new Error("JSONP request timeout"));
          }
        }, 5000);

        // Append script to document
        document.body.appendChild(script);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Modify sendSessionSummary to remove logging
  async function sendSessionSummary() {
    if (!sessionData || !isSessionActive) {
      return;
    }

    // Update final duration before sending
    const now = Date.now();
    sessionData.duration = now - sessionData.start_time;
    sessionData.end_time = new Date(now).toISOString();

    // Update ML features before sending
    updateMLFeatures();

    // Prepare data for sending
    const summary = {
      client_id: sessionData.client_id,
      client_token: config.token,
      session_id: sessionData.session_id,
      timestamp: new Date().toISOString(),
      sdk_version: SDK_VERSION,

      // Page info
      page_url: window.location.href,
      domain: window.location.hostname,
      path: window.location.pathname,

      // Session metrics
      session_duration: Date.now() - sessionData.start_time,
      time_to_first_interaction:
        sessionData.user_behavior.time_to_first_interaction,
      total_interactions: sessionData.user_behavior.total_interactions,

      // Scroll data
      scroll_depth_max: sessionData.user_behavior.scroll_depth_percentages
        ? Math.max(
            ...sessionData.user_behavior.scroll_depth_percentages.map(
              (d) => d.depth
            )
          )
        : 0,
      scroll_count: sessionData.scroll_chunks.length,
      scroll_chunks: sessionData.scroll_chunks,

      // Click data
      click_count: sessionData.cta_clicks.length,
      clicks: sessionData.cta_clicks,

      // Hover data
      hover_count: sessionData.hover_events.length,
      hovers: sessionData.hover_events,

      // UTM Data
      utm_data: sessionData.utm_data,

      // Metrika Goals and Conversion Data
      metrika_goals: sessionData.metrika_goals || [],
      conversion_data: sessionData.conversion_data || {},

      // User Behavior
      user_behavior: sessionData.user_behavior,

      // ML Features
      ml_features: sessionData.ml_features,
    };

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    while (retryCount < maxRetries) {
      try {
        // Try direct POST first
        try {
          const response = await fetch(config.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: window.location.origin,
            },
            body: JSON.stringify(summary),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          return result;
        } catch (error) {
          // If we're out of retries, try beacon API as last resort
          if (retryCount === maxRetries - 1 && navigator.sendBeacon) {
            try {
              const blob = new Blob([JSON.stringify(summary)], {
                type: "application/json",
              });
              const success = navigator.sendBeacon(config.endpoint, blob);
              if (success) {
                return { success: true, method: "beacon" };
              }
            } catch (beaconError) {
              // Silent fail
            }
          }

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          retryCount++;
        }
      } catch (error) {
        if (retryCount === maxRetries - 1) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryCount++;
      }
    }

    throw new Error(`Failed to send data after ${maxRetries} attempts`);
  }

  // Start periodic sending
  function startPeriodicSending() {
    if (sendTimer) {
      clearInterval(sendTimer);
    }

    sendTimer = setInterval(() => {
      if (isSessionActive) {
        sendQueuedData();
      }
    }, config.sendDelay);
  }

  // Helper functions
  function throttle(fn, delay) {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        return fn.apply(this, args);
      }
    };
  }

  function generateClientId() {
    return new Promise((resolve) => {
      // 1. Сначала пробуем получить из бэкапа
      const backupId = localStorage.getItem("_ym_client_id_backup");
      if (backupId) {
        Logger.info("Using backed up Yandex.Metrika client ID:", backupId);
        resolve(backupId);
        return;
      }

      // 2. Пробуем получить из куки Метрики
      const ymUid = getCookie("_ym_uid");
      if (ymUid) {
        Logger.info("Using Yandex.Metrika cookie ID:", ymUid);
        try {
          localStorage.setItem("_ym_client_id_backup", ymUid);
        } catch (e) {
          Logger.warn("Could not save client ID to localStorage:", e);
        }
        resolve(ymUid);
        return;
      }

      // 3. Пробуем получить напрямую из Метрики
      const getFromMetrika = (attempts = 0, maxAttempts = 5) => {
        if (attempts >= maxAttempts) {
          // Если не удалось получить ID, используем временный
          const tempId =
            "temp_" + Date.now() + "_" + Math.random().toString(36).substr(2);
          Logger.info("Using temporary client ID:", tempId);
          resolve(tempId);
          return;
        }

        // Получаем ID счетчика
        let counterId = getYandexCounterId();

        if (!counterId) {
          setTimeout(() => getFromMetrika(attempts + 1), 1000);
          return;
        }

        try {
          ym(counterId, "getClientID", function (clientID) {
            if (clientID) {
              Logger.info("Got client ID from Yandex.Metrika:", clientID);
              try {
                localStorage.setItem("_ym_client_id_backup", clientID);
              } catch (e) {
                Logger.warn("Could not save client ID to localStorage:", e);
              }
              resolve(clientID);
            } else {
              setTimeout(() => getFromMetrika(attempts + 1), 1000);
            }
          });
        } catch (e) {
          setTimeout(() => getFromMetrika(attempts + 1), 1000);
        }
      };

      getFromMetrika();
    });
  }

  function getCookie(name) {
    const matches = document.cookie.match(
      new RegExp(
        "(?:^|; )" +
          name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, "\\$1") +
          "=([^;]*)"
      )
    );
    return matches ? decodeURIComponent(matches[1]) : null;
  }

  function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  function getElementPath(element) {
    if (!element) return "";

    const path = [];
    let currentElement = element;

    while (currentElement) {
      let selector = currentElement.tagName
        ? currentElement.tagName.toLowerCase()
        : "";
      if (currentElement.id) {
        selector += `#${currentElement.id}`;
      } else if (
        currentElement.className &&
        typeof currentElement.className === "string"
      ) {
        selector += `.${currentElement.className.split(" ").join(".")}`;
      }
      path.unshift(selector);
      currentElement = currentElement.parentElement;
    }
    return path.join(" > ");
  }

  function isImportantElement(element) {
    if (!element) return false;

    // Расширенный список важных тегов
    const importantTags = [
      "A",
      "BUTTON",
      "INPUT",
      "SELECT",
      "TEXTAREA",
      "LABEL",
      "FORM",
      "IMG",
      "VIDEO",
      "IFRAME",
    ];

    // Важные классы и атрибуты
    const importantClasses = [
      "btn",
      "button",
      "link",
      "cta",
      "card",
      "product",
      "price",
      "buy",
      "cart",
      "checkout",
      "modal",
      "popup",
      "form",
      "submit",
      "order",
    ];

    // Важные data-атрибуты
    const importantDataAttrs = [
      "data-rivox-important",
      "data-product",
      "data-sku",
      "data-price",
      "data-category",
    ];

    return (
      importantTags.includes(element.tagName) ||
      (element.className &&
        typeof element.className === "string" &&
        importantClasses.some((cls) =>
          element.className.toLowerCase().includes(cls)
        )) ||
      importantDataAttrs.some((attr) => element.hasAttribute(attr))
    );
  }

  function isCTAElement(element) {
    if (!element) return false;

    // CTA теги
    const ctaTags = [
      "A",
      "BUTTON",
      'INPUT[type="submit"]',
      'INPUT[type="button"]',
      "IMG[data-product-id]", // Картинки товаров
      "DIV.price_matrix_block", // Блоки с ценами
      "DIV.buy_block", // Блоки покупки
    ];

    // CTA классы
    const ctaClasses = [
      "btn",
      "button",
      "cta",
      "buy",
      "add-to-cart",
      "checkout",
      "order",
      "submit",
      "callback",
      "contact",
      "phone",
      "price",
      "price_matrix_block",
      "buy_block",
      "product-item",
      "product-card",
      "product-detail",
      "add_to_cart",
      "quick_buy",
      "fast_order",
    ];

    // CTA текст
    const ctaTexts = [
      "купить",
      "заказать",
      "добавить",
      "корзин",
      "оформить",
      "позвонить",
      "заказать звонок",
      "отправить",
      "оставить заявку",
      "в 1 клик",
      "быстрый заказ",
      "быстрая покупка",
    ];

    // Проверяем элемент и его родителей
    let currentElement = element;
    while (currentElement && currentElement !== document) {
      // Проверка по тегу
      const isCtaTag = ctaTags.some((tag) => {
        const [tagName, type] = tag.split('[type="');
        if (type) {
          return (
            currentElement.tagName === tagName &&
            currentElement.type === type.slice(0, -1)
          );
        }
        if (tag.includes(".")) {
          const [tagNameOnly, className] = tag.split(".");
          return (
            currentElement.tagName === tagNameOnly &&
            currentElement.className &&
            currentElement.className.includes(className)
          );
        }
        return currentElement.tagName === tag;
      });

      // Проверка по классам
      const hasCtaClass =
        currentElement.className &&
        typeof currentElement.className === "string" &&
        ctaClasses.some((cls) =>
          currentElement.className.toLowerCase().includes(cls)
        );

      // Проверка по тексту
      const elementText = (
        currentElement.textContent ||
        currentElement.value ||
        ""
      ).toLowerCase();
      const hasCtaText = ctaTexts.some((text) => elementText.includes(text));

      // Проверка по data-атрибутам
      const hasCtaAttr =
        currentElement.hasAttribute("data-rivox-cta") ||
        currentElement.hasAttribute("data-cta") ||
        currentElement.hasAttribute("data-buy") ||
        currentElement.hasAttribute("data-product-buy") ||
        currentElement.hasAttribute("data-product-id");

      if (isCtaTag || hasCtaClass || hasCtaText || hasCtaAttr) {
        return true;
      }

      currentElement = currentElement.parentElement;
    }

    return false;
  }

  // Expose public API
  window.RIVOX = {
    init: init,
    sendSessionSummary,
    getSessionData: () => sessionData,
    config,
    sendDataGuaranteed,
    getSessionData: () => sessionData,
  };

  // Initialize when Metrika is ready
  (function waitForYaMetrika(attempts = 0, maxAttempts = 20) {
    if (attempts >= maxAttempts) {
      Logger.error(
        "Failed to detect Yandex.Metrika after",
        maxAttempts,
        "attempts"
      );
      return;
    }

    if (
      typeof ym === "undefined" &&
      typeof Ya === "undefined" &&
      !window.yaCounter
    ) {
      setTimeout(() => waitForYaMetrika(attempts + 1), 500);
      return;
    }

    // Initialize SDK only after Metrika is detected
    init().catch((error) => {
      Logger.error("Failed to initialize RIVOX SDK:", error);
    });
  })();

  // Auto-initialize after DOM is loaded
  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(window.RIVOX.init, config.initDelay);
  });

  Logger.info("SDK loaded successfully");

  function addToFailedQueue(data) {
    if (failedQueue.length >= config.maxQueueSize) {
      failedQueue.shift(); // Remove oldest item if queue is full
    }
    failedQueue.push({
      data,
      attempts: 0,
      timestamp: Date.now(),
    });

    // Start retry timer if not running
    if (!retryTimer) {
      startRetryTimer();
    }
  }

  function startRetryTimer() {
    if (retryTimer) {
      clearInterval(retryTimer);
    }

    retryTimer = setInterval(processFailedQueue, config.retryDelay);
  }

  async function processFailedQueue() {
    if (failedQueue.length === 0) {
      clearInterval(retryTimer);
      retryTimer = null;
      return;
    }

    const item = failedQueue[0];

    // Skip if duplicate
    if (isDuplicate(item.data)) {
      failedQueue.shift();
      return;
    }

    if (item.attempts >= config.maxRetries) {
      Logger.warn(
        `Dropping data after ${config.maxRetries} failed attempts`,
        item.data
      );
      failedQueue.shift();
      return;
    }

    try {
      await sendDataWithFallback(item.data);
      failedQueue.shift();
      Logger.info("Successfully sent queued data");
    } catch (error) {
      item.attempts++;
      Logger.warn(`Retry attempt ${item.attempts} failed`, error);

      // Move to end of queue if more retries available
      if (item.attempts < config.maxRetries) {
        failedQueue.push(failedQueue.shift());
      }
    }
  }

  // Modify sendDataWithFallback to add logging
  async function sendDataWithFallback(data) {
    const preparedData = {
      ...data,
      token: config.token,
      origin: window.location.origin,
    };

    const dataSize = JSON.stringify(preparedData).length;
    Logger.info(`📦 Data size: ${(dataSize / 1024 / 1024).toFixed(2)}MB`);

    // Пробуем основной метод - POST
    try {
      const response = await fetch(getEndpointUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: window.location.origin,
        },
        body: JSON.stringify(preparedData),
      });

      if (response.ok) {
        Logger.info("✅ Data sent successfully via POST");
        return { success: true, method: "post" };
      }
    } catch (error) {
      Logger.debug("POST failed, trying alternative methods");
    }

    // Пробуем beacon API
    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify(preparedData)], {
          type: "application/json",
        });

        if (navigator.sendBeacon(getEndpointUrl(), blob)) {
          Logger.info("✅ Data sent via beacon API");
          return { success: true, method: "beacon" };
        }
      } catch (error) {
        Logger.debug("Beacon failed, trying JSONP");
      }
    }

    // Для маленьких данных пробуем JSONP
    if (JSON.stringify(preparedData).length < 1500) {
      try {
        const result = await sendDataJSONP(preparedData);
        Logger.info("✅ Data sent via JSONP");
        return { success: true, method: "jsonp" };
      } catch (error) {
        Logger.debug("JSONP failed, adding to queue");
      }
    }

    // Если все методы не сработали, добавляем в очередь
    addToFailedQueue(preparedData);
    return { queued: true };
  }

  function shouldSendData() {
    if (!sessionData) return false;

    // 1. Всегда отправляем при конверсиях/важных событиях
    if (
      sessionData.metrika_goals.length > 0 || // Есть цели
      sessionData.form_interactions.length > 0 // Есть заполнения форм
    ) {
      Logger.debug("Sending data due to conversion events");
      return true;
    }

    // 2. Проверка минимального времени на сайте
    const timeOnSite = Date.now() - sessionData.start_time;
    if (timeOnSite < 25000) {
      // меньше 25 секунд
      Logger.debug("Session too short (<25s), skipping data send");
      return false;
    }

    // 3. Для сессий дольше 25 секунд отправляем при накоплении данных
    const shouldSend =
      sessionData.scroll_chunks.length >= 5 || // Хотя бы немного скроллили
      timeOnSite >= 60000 || // 1 минута на сайте
      sessionData.cta_clicks.length > 0; // Хотя бы один клик

    if (shouldSend) {
      Logger.debug(
        "Sending data: session longer than 25s and has enough events"
      );
    }

    return shouldSend;
  }

  // Yandex.Metrika goal tracking
  function setupMetrikaTracking(attempts = 0, maxAttempts = 5) {
    const counterId = getYandexCounterId();

    if (!counterId) {
      if (attempts < maxAttempts) {
        setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
        return;
      }
      return;
    }

    // Check if counter object exists
    if (!window[`yaCounter${counterId}`]) {
      if (attempts < maxAttempts) {
        setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
        return;
      }
      return;
    }

    // Store original reachGoal function
    const originalReachGoal = window[`yaCounter${counterId}`].reachGoal;

    if (!originalReachGoal) {
      if (attempts < maxAttempts) {
        setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
        return;
      }
      return;
    }

    // Override reachGoal to capture goals
    window[`yaCounter${counterId}`].reachGoal = function (goalName, params) {
      // Log the call immediately
      Logger.info(
        `🎯 Metrika reachGoal intercepted: ${goalName}`,
        params || {}
      );

      // Call original function first
      const result = originalReachGoal.apply(this, arguments);

      // Track goal in our system
      if (sessionData && sessionData.metrika_goals) {
        const goalData = {
          name: goalName,
          params: params || {},
          timestamp: Date.now(),
        };

        // Ensure arrays exist
        if (!sessionData.metrika_goals) {
          sessionData.metrika_goals = [];
        }
        if (!sessionData.conversion_data) {
          sessionData.conversion_data = {
            goals_reached: [],
            ecommerce_data: [],
            last_goal_timestamp: null,
            conversion_path: [],
          };
        }
        if (!sessionData.conversion_data.goals_reached) {
          sessionData.conversion_data.goals_reached = [];
        }
        if (!sessionData.conversion_data.conversion_path) {
          sessionData.conversion_data.conversion_path = [];
        }

        // Add goal to arrays
        sessionData.metrika_goals.push(goalData);
        sessionData.conversion_data.goals_reached.push(goalData);
        sessionData.conversion_data.last_goal_timestamp = Date.now();
        sessionData.conversion_data.conversion_path.push({
          type: "goal",
          name: goalName,
          timestamp: Date.now(),
        });

        // Send data after important goals
        if (isImportantGoal(goalName)) {
          sendSessionSummary().catch(() => {});
        }
      }

      return result;
    };
  }

  // Important goals that should trigger immediate data send
  function isImportantGoal(goalName) {
    const importantGoals = [
      "order",
      "purchase",
      "lead",
      "contact",
      "form",
      "callback",
      "phone",
    ];
    return importantGoals.some((g) => goalName.toLowerCase().includes(g));
  }

  // Add reliable data collection and transmission
  function saveSessionToStorage() {
    try {
      localStorage.setItem(
        "rivox_current_session",
        JSON.stringify(sessionData)
      );
      Logger.debug("Session data saved to localStorage");
    } catch (e) {
      Logger.warn("Failed to save session to localStorage:", e);
    }
  }

  function loadSessionFromStorage() {
    try {
      const saved = localStorage.getItem("rivox_current_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if session is recent (last 30 minutes)
        if (Date.now() - parsed.last_activity < config.sessionTimeout) {
          Logger.info("Restoring previous session");
          return parsed;
        }
      }
    } catch (e) {
      Logger.warn("Failed to load session from localStorage:", e);
    }
    return null;
  }

  // Enhanced session data structure
  function createSessionData(clientId) {
    const now = Date.now();
    return {
      client_id: clientId,
      client_token: config.token,
      session_id: generateSessionId(),
      start_time: now,
      last_activity: now,
      device_info: getBrowserInfo(),
      page_history: [
        {
          timestamp: now,
          url: window.location.href,
          referrer: document.referrer,
          time_spent: 0,
        },
      ],
      scroll_chunks: [],
      hover_events: [],
      form_interactions: [],
      cta_clicks: [],
      modal_interactions: [],
      utm_data: extractUTMData(),
      metrika_goals: [],
      conversion_data: {
        goals_reached: [],
        ecommerce_data: [],
        last_goal_timestamp: null,
        conversion_path: [],
      },
      traffic_source: {
        referrer: document.referrer,
        landing_page: window.location.href,
        entry_point: window.location.pathname,
      },
      user_behavior: {
        time_to_first_interaction: null,
        total_interactions: 0,
        interaction_frequency: [],
        scroll_depth_percentages: [],
        time_between_clicks: [],
        mouse_movement_heatmap: [],
        viewport_size: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
      ml_features: {
        interest_signals: [],
        behavior_patterns: [],
        user_segment: null,
        conversion_probability: null,
        funnel_analysis: {},
      },
    };
  }

  // Get browser and device info
  function getBrowserInfo() {
    const ua = navigator.userAgent;
    const browserData = {
      device_type: "desktop",
      browser: "unknown",
      platform: navigator.platform,
    };

    // Determine device type
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      browserData.device_type = "tablet";
    } else if (
      /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
        ua
      )
    ) {
      browserData.device_type = "mobile";
    }

    // Determine browser
    if (ua.indexOf("Chrome") > -1) {
      browserData.browser = "Chrome";
    } else if (ua.indexOf("Safari") > -1) {
      browserData.browser = "Safari";
    } else if (ua.indexOf("Firefox") > -1) {
      browserData.browser = "Firefox";
    } else if (ua.indexOf("MSIE") > -1 || ua.indexOf("Trident/") > -1) {
      browserData.browser = "IE";
    } else if (ua.indexOf("Edge") > -1) {
      browserData.browser = "Edge";
    } else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) {
      browserData.browser = "Opera";
    }

    return browserData;
  }

  // Update page history on navigation
  function updatePageHistory() {
    if (!sessionData || !sessionData.page_history) return;

    const currentPage =
      sessionData.page_history[sessionData.page_history.length - 1];
    if (currentPage) {
      currentPage.time_spent = Date.now() - currentPage.timestamp;
    }

    sessionData.page_history.push({
      timestamp: Date.now(),
      url: window.location.href,
      referrer: document.referrer,
      time_spent: 0,
    });

    saveSessionToStorage();
  }

  // Guaranteed data sending on important events
  function sendDataGuaranteed(reason = "manual") {
    return new Promise((resolve, reject) => {
      if (!sessionData) {
        resolve();
        return;
      }

      // Update time spent on current page
      const currentPage =
        sessionData.page_history[sessionData.page_history.length - 1];
      if (currentPage) {
        currentPage.time_spent = Date.now() - currentPage.timestamp;
      }

      // Update ML features before sending
      updateMLFeatures();

      // Prepare complete session summary
      const summary = {
        ...sessionData,
        send_reason: reason,
        timestamp: new Date().toISOString(),
        sdk_version: SDK_VERSION,
        total_session_duration: Date.now() - sessionData.start_time,
      };

      // --- Add Duplicate Check ---
      if (isDuplicate(summary)) {
        Logger.info(`Duplicate data detected, skipping send (${reason})`);
        resolve(); // Resolve successfully as we don't need to send
        return;
      }
      // --- End of Duplicate Check ---

      // Try to send data
      sendDataWithFallback(summary)
        .then(() => {
          Logger.info(`Data sent successfully (${reason})`);
          // Clear localStorage after successful send
          localStorage.removeItem("rivox_current_session");
          resolve();
        })
        .catch((error) => {
          Logger.error(`Failed to send data (${reason}):`, error);
          // Save to localStorage as backup
          saveSessionToStorage();
          reject(error);
        });
    });
  }

  // Add beforeunload handler
  window.addEventListener("beforeunload", () => {
    sendDataGuaranteed("page_close");
  });

  // Add history change handler
  window.addEventListener("popstate", updatePageHistory);
  if (window.history.pushState) {
    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = function () {
      originalPushState.apply(this, arguments);
      updatePageHistory();
    };
  }

  // Expose additional methods for debugging
  window.RIVOX = {
    ...window.RIVOX,
    sendDataGuaranteed,
    getSessionData: () => sessionData,
  };

  // ---- New ML Features Function ----
  function updateMLFeatures() {
    if (!sessionData || !sessionData.ml_features) return;

    const now = Date.now();
    const timeOnSite = now - sessionData.start_time;

    // Добавляем новые признаки только если они не существуют
    if (!sessionData.ml_features.interest_signals) {
      sessionData.ml_features.interest_signals = [];
    }

    // Добавляем новые признаки с проверкой на существование
    const newSignals = [
      {
        type: "time_on_site",
        value: parseFloat((timeOnSite / 1000).toFixed(2)),
        timestamp: now,
      },
      {
        type: "scroll_depth",
        value: sessionData.user_behavior.scroll_depth_percentages
          ? Math.max(
              0,
              ...sessionData.user_behavior.scroll_depth_percentages.map(
                (d) => d.depth
              )
            )
          : 0,
        timestamp: now,
      },
      {
        type: "interaction_rate",
        value: parseFloat(
          (
            sessionData.user_behavior.total_interactions /
            (timeOnSite / 60000)
          ).toFixed(2)
        ),
        timestamp: now,
      },
    ];

    // Добавляем только новые сигналы
    newSignals.forEach((signal) => {
      if (
        !sessionData.ml_features.interest_signals.some(
          (s) => s.type === signal.type
        )
      ) {
        sessionData.ml_features.interest_signals.push(signal);
      }
    });

    // Обновляем паттерны поведения
    if (!sessionData.ml_features.behavior_patterns) {
      sessionData.ml_features.behavior_patterns = [];
    }

    // Рассчитываем среднюю длительность наведения
    const totalHoverDuration = sessionData.hover_events.reduce(
      (sum, h) => sum + h.duration,
      0
    );
    const avgHoverDuration =
      totalHoverDuration / (sessionData.hover_events.length || 1);

    // Обновляем паттерны
    sessionData.ml_features.behavior_patterns = [
      {
        type: "scroll_speed",
        value: parseFloat(
          (sessionData.scroll_chunks.length / (timeOnSite / 60000)).toFixed(2)
        ),
      },
      {
        type: "click_frequency",
        value: parseFloat(
          (sessionData.cta_clicks.length / (timeOnSite / 60000)).toFixed(2)
        ),
      },
      {
        type: "hover_duration_avg",
        value: parseFloat(avgHoverDuration.toFixed(0)),
      },
    ];

    // Обновляем анализ воронки
    if (!sessionData.ml_features.funnel_analysis) {
      sessionData.ml_features.funnel_analysis = {};
    }

    sessionData.ml_features.funnel_analysis = {
      page_views: sessionData.page_views?.length || 0,
      product_views:
        sessionData.page_views?.filter(
          (p) => p.url.includes("/catalog/") || p.url.includes("/product/")
        ).length || 0,
      cart_interactions: sessionData.cta_clicks.filter(
        (c) =>
          c.element &&
          (c.element.toLowerCase().includes("cart") ||
            c.element.toLowerCase().includes("basket") ||
            c.element.toLowerCase().includes("add_to_cart"))
      ).length,
      checkout_attempts: sessionData.metrika_goals.filter(
        (g) =>
          g.name &&
          (g.name.toLowerCase().includes("checkout") ||
            g.name.toLowerCase().includes("order") ||
            g.name.toLowerCase().includes("purchase"))
      ).length,
    };
  }
  // ---- End of New ML Features Function ----

  // New function to check if scroll data should be sent
  function shouldSendScrollData() {
    if (!sessionData) return false;

    const timeOnSite = Date.now() - sessionData.start_time;

    // Don't send data in first 25 seconds
    if (timeOnSite < config.minTimeBeforeScrollSend) return false;

    // Send if:
    // 1. More than 5 minutes passed
    // 2. More than 20 scroll chunks collected
    // 3. There are important events (goals, forms)
    return (
      timeOnSite >= 300000 || // 5 minutes
      sessionData.scroll_chunks.length >= config.minScrollChunksForSend ||
      sessionData.metrika_goals.length > 0 ||
      sessionData.form_interactions.length > 0
    );
  }
})(window);
