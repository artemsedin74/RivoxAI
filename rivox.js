/**
 * RIVOX SDK - Client-side tracking and analytics
 * Version: 4.6.3
 */
// RIVOX SDK v4.6.3
// Enhanced version with ML data collection capabilities

function logEvent(eventName, payload = {}) {
  try {
    const data = {
      event: eventName,
      payload,
      timestamp: Date.now(),
      host: window.location.hostname,
    };
    navigator.sendBeacon('https://rivox-data-handler-779203791697.europe-central2.run.app/logs', JSON.stringify(data));
  } catch (e) {
    // Ошибки логирования не должны влиять на работу SDK
  }
}

// Utility functions for Yandex.Metrika
function isYandexMetrikaReady() {
    return typeof ym !== 'undefined' || typeof Ya !== 'undefined' || !!window.yaCounter;
}

// Updated function to be more robust
function getYandexCounterId() {
    // 1. Check explicitly set variable
    if (window.ymCounterId) return window.ymCounterId;
    
    // 2. Look for yaCounter object and extract ID
    for (const key in window) {
        if (key.startsWith('yaCounter')) {
            const counterId = key.replace('yaCounter', '');
            if (counterId && !isNaN(Number(counterId))) {
                logEvent('counter_id_found', { source: 'yaCounter_object', counterId });
                return counterId;
            }
        }
    }
    
    // 3. Look for ym object and its counters
    if (typeof ym !== 'undefined') {
        try {
            // Try common internal properties
            const counters = ym.a || ym.counters || ym.__counters || []; 
            if (counters.length > 0 && counters[0] && counters[0].id) {
                 logEvent('counter_id_found', { source: 'ym_internal_property', id: counters[0].id });
                 return counters[0].id;
            }
        } catch (e) {
            logEvent('counter_check_error', { error: e.message });
        }
    }

    logEvent('counter_id_not_found', { sources_checked: ['window.ymCounterId', 'yaCounter*', 'ym.counters'] });
    return null;
}

// Define a placeholder Logger globally first
let Logger = {
    setLevel: () => {},
    debug: (msg, data) => {
        logEvent('debug', { message: msg, data });
    },
    info: (msg, data) => {
        logEvent('info', { message: msg, data });
    },
    warn: (msg, data) => {
        logEvent('warning', { message: msg, data });
    },
    error: (msg, error) => {
        logEvent('error', { message: msg, error: error?.message || error });
    }
};

(function(window) {
    'use strict';

    const SDK_VERSION = '4.6.3';
    
    // Добавляем переменные для контроля отправки данных
    let lastSendTime = 0;
    let dataSubmissionInProgress = false;
    let consecErrorCount = 0;
    const retryStrategy = {
        initialDelay: 500,
        maxRetries: 3,
        backoffFactor: 1.5
    };

    // Configuration
    const config = {
        endpoint: 'https://rivox-data-handler-779203791697.europe-central2.run.app/',
        apiEndpoint: 'https://rivox-data-handler-779203791697.europe-central2.run.app/', // Добавлено для совместимости
        debug: true,
        sessionTimeout: 30 * 60 * 1000, // 30 минут
        scrollChunkSize: 10, // Уменьшено с 25 для более частого отслеживания
        minInteractionGap: 300, // Уменьшено с 500 для захвата большего числа взаимодействий
        maxInactiveTime: 300000,
        minScrollSpeed: 0.05, // Уменьшено с 0.1 для захвата медленных прокруток
        maxScrollSpeed: 10,
        viewportGridSize: 10,
        minHoverDuration: 100,
        maxHoverDuration: 30000,
        interactionTimeWindow: 5000,
        minFormDuration: 500, // Уменьшено с 1000 для захвата коротких взаимодействий с формами
        maxFormDuration: 300000,
        minClickGap: 50, // Уменьшено со 100 для большей детализации
        maxClickGap: 10000,
        allowedDomains: ['spb.sotovik.shop', 'www.spb.sotovik.shop', 'inoxhub.ru', 'xn--90aala0adcvdb6p.xn--p1ai', 'белоеяблоко.рф'],
        initDelay: 300,
        sendDelay: 300000, // 5 минут
        retryDelay: 120000, // 2 минуты
        maxRetries: 3,
        maxQueueSize: 10,
        deduplicationWindow: 60000, // 1 минута
        beaconSupport: true,
        
        // Новые оптимизации
        useCompression: true,         // Использовать сжатие данных
        minSendInterval: 15000,       // Минимум 15 секунд между отправками
        maxEventsPerBatch: 50,        // Макс событий в одной отправке
        errorBackoffTime: 60000,      // Задержка после ошибок (1 минута)
        maxRequestSize: 500000,       // Макс размер запроса (500KB)

        // ML-оптимизированные параметры с улучшенными порогами
        formInteractionThreshold: 1, 
        timeToFirstInteractionThreshold: 5000, // Уменьшено с 10000 для захвата более быстрых взаимодействий
        avgTimeBetweenClicksThreshold: 1500, // Уменьшено с 2000 для большей чувствительности
        maxScrollDepthThreshold: 15, // Уменьшено с 25 для более ранней фиксации
        scrollEventsThreshold: 5, // Уменьшено с 10 для захвата меньшего числа прокруток
        
        // Новые дополнительные параметры
        adaptiveThresholds: true, // Включаем адаптивные пороги в зависимости от устройства
        validateTimeValues: true, // Включаем валидацию временных значений
        mobileAdjustmentFactor: 0.7, // Коэффициент для мобильных устройств

        // Параметры для предсказания конверсии (без изменений)
        conversionPredictionThresholds: {
            formInteractionsWeight: 0.433,
            timeToFirstInteractionWeight: 0.114,
            clickTimingWeight: 0.089,
            scrollDepthWeight: 0.070,
            scrollEventsWeight: 0.070
        }
    };

    // Re-define the global Logger with full functionality inside the IIFE
    Logger = {
        LEVELS: {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        },
        level: 1, // Default to INFO level
        
        setLevel: function(level) {
            this.level = level;
        },
        
        debug: function(msg, data) {
            if (this.level <= this.LEVELS.DEBUG && config.debug) {
                logEvent('debug', { message: msg, data: data || '' });
            }
        },
        
        info: function(msg, data) {
            if (this.level <= this.LEVELS.INFO && config.debug) { 
                logEvent('info', { message: msg, data: data || '' });
            }
        },
        
        warn: function(msg, data) {
            if (this.level <= this.LEVELS.WARN) {
                logEvent('warning', { message: msg, data: data || '' });
            }
        },
        
        error: function(msg, error) {
            if (this.level <= this.LEVELS.ERROR) {
                logEvent('error', { message: msg, error: error?.message || error || '' });
            }
        }
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
            const [, timestamp] = oldHash.split('_');
            if (now - Number(timestamp) > config.deduplicationWindow) {
                sentData.delete(oldHash);
            }
        }
        
        sentData.add(hash);
        return false;
    }

    // Функции для валидации временных значений и адаптивного сбора данных
    
    // Проверка и исправление временных значений
    function validateTimeValue(timestamp, defaultValue = Date.now()) {
        // Проверка на null/undefined
        if (timestamp === null || timestamp === undefined) {
            Logger.debug('Пустое значение timestamp, применяю значение по умолчанию');
            return defaultValue;
        }
        
        // Проверка на корректный тип данных
        if (typeof timestamp !== 'number') {
            Logger.debug('Некорректный тип timestamp, применяю значение по умолчанию');
            return defaultValue;
        }
        
        // Проверка на отрицательное значение
        if (timestamp < 0) {
            Logger.debug('Отрицательное значение timestamp, применяю значение по умолчанию');
            return defaultValue;
        }
        
        // Проверка на значение в будущем
        const now = Date.now();
        if (timestamp > now + 10000) { // Допускаем небольшую погрешность (10 сек)
            Logger.debug('Timestamp в будущем, корректирую');
            return now;
        }
        
        // Проверка на слишком старое значение (более 24 часов)
        if (now - timestamp > 24 * 60 * 60 * 1000) {
            Logger.debug('Timestamp слишком старый (>24 часа), корректирую');
            return now - 60 * 60 * 1000; // Устанавливаем на 1 час назад
        }
        
        return timestamp;
    }
    
    // Безопасный расчет временного интервала
    function calculateSafeInterval(startTime, endTime) {
        const validStart = validateTimeValue(startTime);
        const validEnd = validateTimeValue(endTime);
        
        // Гарантируем, что интервал не отрицательный
        return Math.max(0, validEnd - validStart);
    }
    
    // НОВАЯ ФУНКЦИЯ: Обеспечение безопасного client_id (всегда строка)
    function safeClientId(id) {
        if (id === null || id === undefined) {
            Logger.warn('Null/undefined client_id, создаю временный');
            return 'temp_' + Date.now();
        }
        
        if (typeof id === 'object') {
            if (id instanceof Promise) {
                Logger.warn('Promise в client_id, создаю временный');
                return 'promise_' + Date.now();
            }
            
            if (id.toString && typeof id.toString === 'function' && id.toString() !== '[object Object]') {
                Logger.warn('Object в client_id, преобразую в строку через toString');
                return id.toString();
            }
            
            Logger.warn('Невалидный object в client_id, создаю временный');
            return 'obj_' + Date.now();
        }
        
        // Гарантированно возвращаем строку
        return String(id);
    }
    
    // Адаптация порогов в зависимости от устройства и поведения пользователя
    function getAdaptiveThresholds() {
        // Базовые значения из конфигурации
        const thresholds = {
            scrollChunk: config.scrollChunkSize,
            minInteraction: config.minInteractionGap,
            minScroll: config.minScrollSpeed,
            minHover: config.minHoverDuration,
            minClick: config.minClickGap
        };
        
        // Если адаптивные пороги отключены, возвращаем базовые значения
        if (!config.adaptiveThresholds) {
            return thresholds;
        }
        
        // Определяем тип устройства
        const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Адаптируем пороги для мобильных устройств
        if (isMobile) {
            const factor = config.mobileAdjustmentFactor;
            thresholds.scrollChunk = Math.round(thresholds.scrollChunk * factor);
            thresholds.minInteraction = Math.round(thresholds.minInteraction * factor);
            thresholds.minScroll = thresholds.minScroll * factor;
            thresholds.minHover = Math.round(thresholds.minHover * 1.5); // Увеличиваем минимальную длительность наведения
            thresholds.minClick = Math.round(thresholds.minClick * 1.2); // Увеличиваем минимальный интервал между кликами
            
            Logger.debug('Применяю адаптивные пороги для мобильного устройства:', thresholds);
        }
        
        // Можно добавить дополнительную адаптацию на основе поведения
        if (sessionData && sessionData.user_behavior) {
            // Если пользователь скроллит быстро, уменьшаем порог
            if (sessionData.scroll_chunks && sessionData.scroll_chunks.length > 10) {
                const avgScrollSpeed = sessionData.scroll_chunks.reduce((sum, chunk) => sum + chunk.delta, 0) / sessionData.scroll_chunks.length;
                if (avgScrollSpeed > 100) {
                    thresholds.scrollChunk = Math.max(5, Math.round(thresholds.scrollChunk * 0.8));
                    Logger.debug('Адаптация: снижаю порог скролла для быстро скроллящего пользователя:', thresholds.scrollChunk);
                }
            }
            
            // Если пользователь активно взаимодействует, уменьшаем пороги для более точного отслеживания
            if (sessionData.user_behavior.total_interactions > 20) {
                thresholds.minInteraction = Math.max(100, Math.round(thresholds.minInteraction * 0.9));
                Logger.debug('Адаптация: снижаю порог взаимодействий для активного пользователя:', thresholds.minInteraction);
            }
        }
        
        return thresholds;
    }
    
    // Обновляем временные метрики с валидацией
    function updateTemporalMetrics(eventType) {
        if (!sessionData) return;
        
        const now = Date.now();
        
        // Валидируем start_time, если необходимо
        if (config.validateTimeValues) {
            // Проверяем и исправляем start_time
            if (!sessionData.start_time || sessionData.start_time < 0) {
                Logger.warn('Некорректное start_time, устанавливаю текущее время');
                sessionData.start_time = now - 1000; // 1 секунда назад
            }
            
            // Проверяем и исправляем last_activity
            if (!sessionData.last_activity || sessionData.last_activity < sessionData.start_time) {
                Logger.warn('Некорректное last_activity, корректирую');
                sessionData.last_activity = Math.max(sessionData.start_time, now - 60000); // Не более 1 минуты назад
            }
        }
        
        // Обновляем last_activity
        sessionData.last_activity = now;
        
        // Корректно вычисляем duration
        sessionData.duration = calculateSafeInterval(sessionData.start_time, now);
        
        // Обновляем время до первого взаимодействия, если это первое взаимодействие
        if (eventType === 'interaction' && !sessionData.user_behavior.time_to_first_interaction) {
            const firstInteractionTime = Math.max(0, now - sessionData.start_time);
            sessionData.user_behavior.time_to_first_interaction = firstInteractionTime;
            
            Logger.debug(`Зафиксировано первое взаимодействие через ${firstInteractionTime}ms после старта сессии`);
            
            // Увеличиваем total_interactions
            sessionData.user_behavior.total_interactions = (sessionData.user_behavior.total_interactions || 0) + 1;
            
            // Добавляем в список частоты взаимодействий
            if (!sessionData.user_behavior.interaction_frequency) {
                sessionData.user_behavior.interaction_frequency = [];
            }
            
            sessionData.user_behavior.interaction_frequency.push({
                type: eventType,
                timestamp: now,
                time_from_start: firstInteractionTime
            });
        } else if (eventType) {
            // Увеличиваем total_interactions для всех последующих взаимодействий
            sessionData.user_behavior.total_interactions = (sessionData.user_behavior.total_interactions || 0) + 1;
            
            // Добавляем в список частоты взаимодействий
            if (!sessionData.user_behavior.interaction_frequency) {
                sessionData.user_behavior.interaction_frequency = [];
            }
            
            sessionData.user_behavior.interaction_frequency.push({
                type: eventType,
                timestamp: now,
                time_from_start: now - sessionData.start_time
            });
        }
        
        // Сохраняем данные сессии
        saveSessionToStorage();
    }

    // Update last activity time
    function updateActivity() {
        const now = Date.now();
        
        if (!sessionData) return;
        
        // Валидируем временные значения
        if (config.validateTimeValues) {
            sessionData.last_activity = validateTimeValue(sessionData.last_activity, now);
            sessionData.start_time = validateTimeValue(sessionData.start_time, now - 1000);
        } else {
            sessionData.last_activity = now;
        }
        
        const timeSinceLastActivity = now - sessionData.last_activity;
        
        // Если сессия была неактивна и сейчас снова активна
        if (timeSinceLastActivity > config.maxInactiveTime) {
            Logger.info('Сессия реактивирована после неактивности');
            startNewSession();
            return;
        }

        // Обновляем временные метрики
        updateTemporalMetrics();
    }

    // Start new session
    function startNewSession() {
        if (sessionData) {
            // Send current session data before starting new
            sendSessionSummary();
        }

        const rawClientId = generateClientId();
        
        sessionData = {
            client_id: rawClientId instanceof Promise 
                ? rawClientId.then(id => safeClientId(id)).catch(() => safeClientId(null))
                : safeClientId(rawClientId),
            client_token: config.token,
            session_id: generateSessionId(),
            start_time: Date.now(),
            last_activity: Date.now(),
            page_views: [{
                timestamp: Date.now(),
                url: window.location.href,
                referrer: document.referrer
            }],
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
                conversion_path: []
            },
            traffic_source: {
                referrer: document.referrer,
                landing_page: window.location.href,
                entry_point: window.location.pathname
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
                    height: window.innerHeight
                }
            },
            ml_features: {
                interest_signals: [],
                behavior_patterns: [],
                user_segment: null,
                conversion_probability: null,
                funnel_analysis: {}
            }
        };

        isSessionActive = true;
        Logger.info('New session started:', sessionData.session_id);
        
        // Сохраняем идентификаторы сессии отдельно в localStorage
        try {
            localStorage.setItem('rivox_session_id', sessionData.session_id);
            localStorage.setItem('rivox_session_active', 'true');
            // Сохраняем ID клиента, когда он будет доступен
            if (sessionData.client_id instanceof Promise) {
                sessionData.client_id.then(id => {
                    localStorage.setItem('rivox_client_id', safeClientId(id));
                }).catch(() => {
                    localStorage.setItem('rivox_client_id', safeClientId(null));
                });
            } else {
                localStorage.setItem('rivox_client_id', safeClientId(sessionData.client_id));
            }
        } catch (e) {
            Logger.warn('Failed to save session IDs to localStorage:', e);
        }
    }

    // Extract UTM data
    function extractUTMData() {
        const urlParams = new URLSearchParams(window.location.search);
        const utmFields = ['source', 'medium', 'campaign', 'term', 'content'];
        const utmData = {
            traffic_type: 'direct',
            landing_page_type: 'unknown',
            referrer_domain: document.referrer ? new URL(document.referrer).hostname : ''
        };

        utmFields.forEach(field => {
            const value = urlParams.get(`utm_${field}`);
            if (value) {
                utmData[field] = value;
                if (field === 'medium') {
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
            data: data
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
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                body: JSON.stringify(dataToSend)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            Logger.info('✅ Queued data sent successfully');
        } catch (error) {
            Logger.error('Failed to send queued data:', error);
            // Return failed items to queue
            queuedData = [...dataToSend, ...queuedData];
        }
    }

    // Get current session duration
    function getSessionDuration() {
        return sessionData ? (lastActivityTime - sessionData.start_time) : 0;
    }

    function isAllowedDomain(hostname) {
        if (!hostname) return false;
        
        // Нормализуем домен (убираем www. если есть)
        const normalizedHostname = hostname.replace(/^www\./, '');
        
        // Проверяем домен и его поддомены
        const isAllowed = config.allowedDomains.some(domain => {
            const normalizedDomain = domain.replace(/^www\./, '');
            // Проверяем точное совпадение или поддомен
            return normalizedHostname === normalizedDomain || 
                   normalizedHostname.endsWith('.' + normalizedDomain);
        });

        if (config.debug) {
            Logger.debug('Checking domain:', {
                original: hostname,
                normalized: normalizedHostname,
                allowed: isAllowed,
                allowedDomains: config.allowedDomains
            });
        }

        return isAllowed;
    }

    // Get endpoint URL
    function getEndpointUrl() {
        if (config.debug) {
            Logger.debug('Using endpoint:', config.endpoint);
        }
        return config.endpoint;
    }

    // Load configuration from script data attributes
    function loadConfig() {
        const script = document.querySelector('script[data-token]');
        if (!script) {
            Logger.error('RIVOX SDK script tag with data-token not found');
            return null;
        }

        // Get token
        const token = script.dataset.token;
        if (!token) {
            Logger.error('RIVOX SDK token not specified');
            return null;
        }

        // Get optional delays
        const initDelay = parseInt(script.dataset.initDelay) || config.initDelay;
        const sendDelay = parseInt(script.dataset.sendDelay) || config.sendDelay;

        // Update config with token
        config.token = token;

        if (config.debug) {
            Logger.debug('RIVOX SDK Configuration:', {
                token,
                initDelay,
                sendDelay
            });
        }

        return {
            token,
            initDelay,
            sendDelay
        };
    }

    // Загрузка данных сессии из localStorage
    function loadSessionFromStorage() {
        try {
            const sessionStr = localStorage.getItem('rivox_session');
            if (!sessionStr) {
                Logger.debug('Сессия не найдена в localStorage');
                return null;
            }
            
            const session = JSON.parse(sessionStr);
            
            // Проверяем время последней активности
            if (session && session.last_activity) {
                const now = Date.now();
                const timeSinceLastActivity = now - session.last_activity;
                
                // Если прошло больше времени таймаута сессии, считаем сессию устаревшей
                if (timeSinceLastActivity > config.sessionTimeout) {
                    Logger.info(`Сессия устарела (${timeSinceLastActivity}ms > ${config.sessionTimeout}ms), создаю новую`);
                    localStorage.removeItem('rivox_session');
                    return null;
                }
                
                Logger.info('Сессия восстановлена из localStorage');
                return session;
            }
            
            return null;
        } catch (error) {
            Logger.error('Ошибка при загрузке сессии из localStorage:', error);
            localStorage.removeItem('rivox_session');
            return null;
        }
    }
    
    // Сохранение данных сессии в localStorage
    function saveSessionToStorage() {
        if (!sessionData) return;
        
        try {
            // Убедимся, что client_id всегда строка перед сохранением
            if (sessionData.client_id) {
                if (sessionData.client_id instanceof Promise) {
                    sessionData.client_id.then(id => {
                        const safeId = safeClientId(id);
                        sessionData.client_id = safeId;
                        localStorage.setItem('rivox_client_id', safeId);
                    }).catch(() => {
                        const safeId = safeClientId(null);
                        sessionData.client_id = safeId;
                        localStorage.setItem('rivox_client_id', safeId);
                    });
                } else {
                    const safeId = safeClientId(sessionData.client_id);
                    sessionData.client_id = safeId;
                    localStorage.setItem('rivox_client_id', safeId);
                }
            }
            
            // Ограничиваем размер данных для localStorage
            const sessionCopy = JSON.parse(JSON.stringify(sessionData));
            
            // Удаляем большие массивы данных для экономии места
            if (sessionCopy.scroll_chunks && sessionCopy.scroll_chunks.length > 10) {
                sessionCopy.scroll_chunks = sessionCopy.scroll_chunks.slice(-10);
            }
            
            if (sessionCopy.hover_events && sessionCopy.hover_events.length > 5) {
                sessionCopy.hover_events = sessionCopy.hover_events.slice(-5);
            }
            
            if (sessionCopy.user_behavior && sessionCopy.user_behavior.mouse_movement_heatmap && 
                sessionCopy.user_behavior.mouse_movement_heatmap.length > 10) {
                sessionCopy.user_behavior.mouse_movement_heatmap = 
                    sessionCopy.user_behavior.mouse_movement_heatmap.slice(-10);
            }
            
            localStorage.setItem('rivox_session', JSON.stringify(sessionCopy));
            localStorage.setItem('rivox_session_active', isSessionActive ? 'true' : 'false');
            localStorage.setItem('rivox_session_id', sessionData.session_id);
            
            Logger.debug('Сессия сохранена в localStorage');
        } catch (error) {
            Logger.error('Ошибка при сохранении сессии в localStorage:', error);
        }
    }
    
    // Создание новых данных сессии
    function createSessionData(clientId) {
        const safeId = clientId instanceof Promise 
            ? clientId.then(id => safeClientId(id)).catch(() => safeClientId(null))
            : safeClientId(clientId);
            
        const sessionData = {
            client_id: safeId,
            client_token: config.token,
            session_id: generateSessionId(),
            start_time: Date.now(),
            last_activity: Date.now(),
            page_views: [{
                timestamp: Date.now(),
                url: window.location.href,
                referrer: document.referrer
            }],
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
                conversion_path: []
            },
            traffic_source: {
                referrer: document.referrer,
                landing_page: window.location.href,
                entry_point: window.location.pathname
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
                    height: window.innerHeight
                }
            },
            ml_features: {
                interest_signals: [],
                behavior_patterns: [],
                user_segment: null,
                conversion_probability: null,
                funnel_analysis: {}
            }
        };
        
        // Сохраняем идентификаторы сессии отдельно в localStorage
        try {
            localStorage.setItem('rivox_session_id', sessionData.session_id);
            localStorage.setItem('rivox_session_active', 'true');
            // Сохраняем ID клиента, когда он будет доступен
            if (sessionData.client_id instanceof Promise) {
                sessionData.client_id.then(id => {
                    localStorage.setItem('rivox_client_id', safeClientId(id));
                }).catch(() => {
                    localStorage.setItem('rivox_client_id', safeClientId(null));
                });
            } else {
                localStorage.setItem('rivox_client_id', safeClientId(sessionData.client_id));
            }
        } catch (e) {
            Logger.warn('Failed to save session IDs to localStorage:', e);
        }
        
        Logger.debug('Создана новая сессия:', sessionData.session_id);
        return sessionData;
    }
    
    // Проверка условий для отправки данных на сервер
    function shouldSendData() {
        if (!sessionData) return false;
        
        // Проверяем, что не слишком много запросов
        if (dataSubmissionInProgress) {
            Logger.debug('Данные уже отправляются, пропускаю отправку');
            return false;
        }
        
        // Проверяем минимальный интервал между отправками
        const now = Date.now();
        const timeSinceLastSend = now - (sessionData.last_send_time || sessionData.start_time);
        if (timeSinceLastSend < config.minSendInterval) {
            Logger.debug(`Слишком короткий интервал между отправками (${Math.round(timeSinceLastSend / 1000)}с < ${Math.round(config.minSendInterval / 1000)}с)`);
            return false;
        }
        
        // Если были ошибки - увеличиваем интервал между отправками
        if (consecErrorCount > 0) {
            const backoffTime = config.errorBackoffTime * Math.min(consecErrorCount, 5);
            if (timeSinceLastSend < backoffTime) {
                Logger.debug(`Увеличенный интервал после ошибок: ${Math.round(timeSinceLastSend / 1000)}с < ${Math.round(backoffTime / 1000)}с`);
                return false;
            }
        }
        
        // Если достаточно скроллов
        if (sessionData.scroll_chunks && sessionData.scroll_chunks.length >= 5) {
            return true;
        }
        
        // Если достаточно кликов
        if (sessionData.cta_clicks && sessionData.cta_clicks.length >= 3) {
            return true;
        }
        
        // Если есть взаимодействия с формами
        if (sessionData.form_interactions && sessionData.form_interactions.length > 0) {
            return true;
        }
        
        // Если прошло много времени с момента последней отправки
        if (timeSinceLastSend > 60000) { // 1 минута
            return true;
        }
        
        return false;
    }
    
    // Функция для настройки отслеживания целей Metrika
    function setupMetrikaTracking() {
        if (!isYandexMetrikaReady()) {
            Logger.warn('Yandex.Metrika не найдена, отслеживание целей не будет работать');
            return;
        }
        
        try {
            const counterId = getYandexCounterId();
            if (!counterId) {
                Logger.warn('Не удалось определить ID счетчика Yandex.Metrika');
                return;
            }
            
            // Проверяем, что функция ym доступна
            if (typeof ym !== 'function') {
                Logger.warn('Функция ym не доступна');
                return;
            }
            
            // Переопределяем функцию reachGoal для отслеживания
            const originalReachGoal = ym;
            
            window.ym = function(counterId, method, goalName, params) {
                // Вызываем оригинальную функцию
                const result = originalReachGoal.apply(this, arguments);
                
                // Если это вызов reachGoal, добавляем в наши данные
                if (method === 'reachGoal' && goalName && sessionData) {
                    Logger.info(`🎯 Цель Metrika: ${goalName}`);
                    
                    if (!sessionData.metrika_goals) {
                        sessionData.metrika_goals = [];
                    }
                    
                    sessionData.metrika_goals.push({
                        name: goalName,
                        params: params || {},
                        timestamp: Date.now()
                    });
                    
                    // Сохраняем сессию и отправляем данные
                    saveSessionToStorage();
                    sendDataGuaranteed('metrika_goal').catch(Logger.error);
                }
                
                return result;
            };
            
            Logger.info('✅ Отслеживание целей Metrika настроено');
        } catch (error) {
            Logger.error('Ошибка при настройке отслеживания целей Metrika:', error);
        }
    }

    function waitForMetrika(callback) {
        let attempts = 0;
        const maxAttempts = 50;
        
        function check() {
            attempts++;
            
            // Проверяем все возможные варианты существования Метрики
            if (typeof ym !== 'undefined' && typeof ym.a !== 'undefined') {
                Logger.info('Metrika ready (ym object)');
                callback();
                return;
            }

            if (window.Ya && window.Ya.Metrika) {
                Logger.info('Metrika ready (Ya.Metrika)');
                callback();
                return;
            }

            // Ищем счетчик через объекты window
            for (const key in window) {
                if (key.startsWith('yaCounter')) {
                    Logger.info('Metrika ready (counter object)');
                    callback();
                    return;
                }
            }

            if (attempts >= maxAttempts) {
                Logger.info('Proceeding without waiting for Metrika');
                callback();
                return;
            }

            Logger.debug(`Waiting for Metrika (attempt ${attempts}/${maxAttempts})...`);
            setTimeout(check, 100);
        }
        
        check();
    }

    // Initialize SDK
    async function init() {
        const currentDomain = window.location.hostname;
        if (!isAllowedDomain(currentDomain)) {
            Logger.error(`Domain ${currentDomain} is not allowed. SDK initialization aborted.`);
            return; // Прерываем инициализацию для неразрешенных доменов
        }
        
        Logger.info('RIVOX SDK initializing...');
        
        // Проверяем и пытаемся отправить данные, которые не были отправлены ранее
        checkAndSendFailedData();
        
        // Load configuration
        const userConfig = loadConfig();
        if (!userConfig) return;

        // Wait for Metrika to be ready
        await new Promise(resolve => {
            waitForMetrika(resolve);
        });

        // Get client ID
        const clientId = await generateClientId();
        if (!clientId) {
            Logger.warn('Proceeding with initialization despite missing client ID');
        } else {
            Logger.info('RIVOX SDK initialized with client ID:', clientId);
        }

        // Initialize or restore session data
        const savedSession = loadSessionFromStorage();
        if (savedSession) {
            Logger.info('Restoring previous session');
            sessionData = savedSession;
            isSessionActive = true; // Активируем сессию при восстановлении
        } else {
            Logger.info('Creating new session');
            sessionData = createSessionData(clientId);
            isSessionActive = true; // Активируем новую сессию
        }
        
        // Ensure all required arrays exist
        sessionData.page_history = sessionData.page_history || [];
        sessionData.scroll_chunks = sessionData.scroll_chunks || [];
        sessionData.hover_events = sessionData.hover_events || [];
        sessionData.form_interactions = sessionData.form_interactions || [];
        sessionData.cta_clicks = sessionData.cta_clicks || [];
        sessionData.metrika_goals = sessionData.metrika_goals || [];
        
        // Убедимся, что client_id всегда строка
        if (sessionData.client_id) {
            sessionData.client_id = safeClientId(sessionData.client_id);
        }
        
        setupEventListeners();
        saveSessionToStorage();

        // Start activity tracking
        document.addEventListener('mousemove', updateActivity);
        document.addEventListener('keydown', updateActivity);
        document.addEventListener('scroll', updateActivity);
        document.addEventListener('click', updateActivity);

        // Start trackers with configured delay
        setTimeout(() => {
            if (typeof RIVOX.start === 'function') {
                Logger.info("🟢 RIVOX tracking start");
                RIVOX.start();
            }
        }, userConfig.initDelay);

        // Set up periodic data sending
        startPeriodicSending();

        // Set up session timeout check
        setInterval(() => {
            const inactiveTime = Date.now() - lastActivityTime;
            if (inactiveTime > config.sessionTimeout) {
                Logger.info("⏹️ Session timeout due to inactivity");
                isSessionActive = false;
                sendDataGuaranteed('session_timeout');
            }
        }, 60000);

        setupMetrikaTracking();
        Logger.info('✅ RIVOX SDK initialization completed');
    }

    // Enhanced event listeners setup
    function setupEventListeners() {
        Logger.info('Настраиваю обработчики событий...');
        
        // Получаем адаптивные пороги
        const thresholds = getAdaptiveThresholds();
        Logger.debug('Установлены адаптивные пороги для взаимодействий:', thresholds);
        
        // Scroll tracking with heatmap
        let lastScrollY = window.scrollY;
        let scrollTimeout;
        
        window.addEventListener('scroll', throttle(() => {
            updateActivity();
            const currentScrollY = window.scrollY;
            const scrollDelta = Math.abs(currentScrollY - lastScrollY);
            
            // Используем адаптивный порог для скролла
            if (scrollDelta >= thresholds.scrollChunk) {
                const documentHeight = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                );
                const viewportHeight = window.innerHeight;
                const scrollPercent = (currentScrollY / (documentHeight - viewportHeight)) * 100;
                
                Logger.debug('Событие скролла:', {
                    position: currentScrollY,
                    delta: scrollDelta,
                    percent: scrollPercent.toFixed(2) + '%'
                });
                
                // Гарантируем, что массивы существуют
                if (!sessionData.scroll_chunks) {
                    sessionData.scroll_chunks = [];
                }
                if (!sessionData.user_behavior.scroll_depth_percentages) {
                    sessionData.user_behavior.scroll_depth_percentages = [];
                }
                
                // Добавляем данные о скролле
                sessionData.scroll_chunks.push({
                    timestamp: Date.now(),
                    position: currentScrollY,
                    delta: scrollDelta,
                    viewport_height: viewportHeight,
                    document_height: documentHeight,
                    percent: scrollPercent
                });

                // Обновляем проценты глубины скролла
                sessionData.user_behavior.scroll_depth_percentages.push({
                    depth: scrollPercent,
                    timestamp: Date.now()
                });
                
                // Обновляем максимальную глубину скролла
                sessionData.scroll_depth_max = Math.max(
                    sessionData.scroll_depth_max || 0,
                    scrollPercent
                );
                
                // Отмечаем взаимодействие
                updateTemporalMetrics('scroll');
                
                lastScrollY = currentScrollY;
            }

            // Clear existing timeout
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }

            // Set new timeout
            scrollTimeout = setTimeout(() => {
                const maxScrollPercent = Math.max(
                    ...sessionData.user_behavior.scroll_depth_percentages.map(d => d.depth)
                );
                Logger.debug('Max scroll depth:', maxScrollPercent.toFixed(2) + '%');
            }, 1000);

            // Check if we should send data
            if (shouldSendData()) {
                Logger.info('Sending data after accumulating events');
                sendSessionSummary();
            }
        }, 100));

        // Hover tracking
        let hoverStartTime;
        let hoveredElement;

            document.addEventListener('mouseover', throttle((e) => {
            updateActivity();
                const target = e.target;
                if (isImportantElement(target)) {
                hoverStartTime = Date.now();
                hoveredElement = target;
                
                Logger.debug('Hover event started:', {
                    element: getElementPath(target)
                });
            }

            // Check if we should send data
            if (shouldSendData()) {
                Logger.info('Sending data after accumulating events');
                sendSessionSummary();
            }
            }, 100));

            document.addEventListener('mouseout', throttle((e) => {
            updateActivity();
                const target = e.target;
            if (isImportantElement(target) && hoverStartTime && target === hoveredElement) {
                const hoverDuration = Date.now() - hoverStartTime;
                
                Logger.debug('Hover event completed:', {
                    element: getElementPath(target),
                    duration: hoverDuration + 'ms'
                });
                
                    sessionData.hover_events.push({
                        timestamp: Date.now(),
                        element: getElementPath(target),
                    duration: hoverDuration,
                    start_time: hoverStartTime
                    });

                hoverStartTime = null;
                hoveredElement = null;
                }
            }, 100));

        // Click tracking
            document.addEventListener('click', (e) => {
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

            const now = Date.now();
            const clickData = {
                        timestamp: now,
                element: getElementPath(clickTarget),
                element_text: (clickTarget.textContent || clickTarget.value || '').trim(),
                position: {
                    x: Math.round(e.clientX + scrollX), // абсолютная позиция
                    y: Math.round(e.clientY + scrollY),
                    relative: {
                        x: Math.round(e.clientX), // относительно viewport
                        y: Math.round(e.clientY)
                    },
                    element: { // позиция элемента
                        top: Math.round(rect.top + scrollY),
                        left: Math.round(rect.left + scrollX),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                },
                is_cta: isCTAElement(clickTarget),
                // Добавляем более детальную информацию
                page_url: window.location.href,
                page_title: document.title || '',
                element_type: clickTarget.tagName || '',
                element_id: clickTarget.id || '',
                element_class: clickTarget.className || '',
                has_href: clickTarget.tagName === 'A' && !!clickTarget.href,
                href: clickTarget.tagName === 'A' ? clickTarget.href : null
            };

            Logger.debug('🖱️ Зафиксирован клик:', clickData);
            
            sessionData.cta_clicks.push(clickData);
            
            // Отмечаем взаимодействие
            updateTemporalMetrics('click');
            
            // Обновляем временные интервалы между кликами
            if (!sessionData.user_behavior.time_between_clicks) {
                sessionData.user_behavior.time_between_clicks = [];
            }
            
            const lastClicks = sessionData.user_behavior.time_between_clicks;
            const lastClick = lastClicks.length > 0 ? lastClicks[lastClicks.length - 1] : null;
            
            if (lastClick) {
                const timeSinceLastClick = now - lastClick.timestamp;
                
                // Проверяем, что интервал между кликами в разумных пределах
                if (timeSinceLastClick >= thresholds.minClick && timeSinceLastClick <= config.maxClickGap) {
                    lastClicks.push({
                        timestamp: now,
                        delta: timeSinceLastClick,
                        element_type: clickTarget.tagName || '',
                        is_cta: isCTAElement(clickTarget)
                    });
                    
                    // Обновляем средний интервал между кликами
                    const totalTime = lastClicks.reduce((sum, click) => sum + (click.delta || 0), 0);
                    const avgTime = totalTime / lastClicks.length;
                    
                    sessionData.user_behavior.avg_time_between_clicks = avgTime;
                    
                    Logger.debug('Обновлен интервал между кликами:', {
                        last: timeSinceLastClick,
                        avg: avgTime
                    });
                }
            } else {
                // Первый клик, просто записываем время
                lastClicks.push({
                    timestamp: now,
                    delta: 0,
                    element_type: clickTarget.tagName || '',
                    is_cta: isCTAElement(clickTarget)
                });
            }

            // Проверяем условия отправки вместо немедленной отправки
            if (shouldSendData()) {
                Logger.info('Накоплено достаточно событий, отправляю данные');
                sendDataGuaranteed('events_threshold').catch(Logger.error);
            }
        });

        // Mouse movement tracking
        let mouseMoveTimeout;
        let mousePoints = new Map(); // Используем Map для оптимизации

        document.addEventListener('mousemove', throttle((e) => {
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
                    const [x, y] = key.split(',').map(Number);
                    sessionData.user_behavior.mouse_movement_heatmap.push({
                        x,
                        y,
                        count,
                        timestamp: Date.now()
                    });
                });
                
                mousePoints.clear();
            }, 5000);
        }, 100));

        // Form tracking
        document.addEventListener('submit', (e) => {
            // Проверяем, что форма существует и не пустая
            if (!e.target || !e.target.elements) return;
            
            if (!sessionData.form_interactions) {
                sessionData.form_interactions = [];
            }
            
            const formData = {
                timestamp: Date.now(),
                form_id: e.target.id || e.target.name || 'unknown',
                fields: Array.from(e.target.elements)
                    .filter(el => el.name) // Фильтруем только элементы с именем
                    .map(el => ({
                        name: el.name,
                        type: el.type,
                        value: el.value
                    }))
            };
            
            sessionData.form_interactions.push(formData);
            
            // Проверяем условия отправки данных
            if (shouldSendData()) {
                Logger.info('Sending data after form submission');
                sendSessionSummary();
            }
        });

        Logger.info('Event listeners setup complete');
    }

    // Send data using JSONP
    function sendDataJSONP(data) {
        return new Promise((resolve, reject) => {
            try {
                const callbackName = 'rivox_callback_' + Date.now();
                const script = document.createElement('script');
                const endpoint = getEndpointUrl();
                
                // Add origin to data for CORS
                data.origin = window.location.origin;
                
                // Create URL with parameters
                const params = new URLSearchParams({
                    callback: callbackName,
                    data: JSON.stringify(data),
                    token: config.token,
                    origin: window.location.origin
                });
                
                script.src = `${endpoint}?${params.toString()}`;
                
                // Setup callback
                window[callbackName] = function(response) {
                    Logger.debug('JSONP response received:', response);
                    document.body.removeChild(script);
                    delete window[callbackName];
                    resolve(response);
                };
                
                // Setup error handling
                script.onerror = () => {
                    document.body.removeChild(script);
                    delete window[callbackName];
                    reject(new Error('JSONP request failed'));
                };
                
                // Setup timeout
                const timeout = setTimeout(() => {
                    if (window[callbackName]) {
                        document.body.removeChild(script);
                        delete window[callbackName];
                        reject(new Error('JSONP request timeout'));
                    }
                }, 5000);
                
                // Append script to document
                document.body.appendChild(script);
                Logger.debug('📡 JSONP request sent to:', script.src);
                
            } catch (error) {
                Logger.error('❌ Error in sendDataJSONP:', error);
                reject(error);
            }
        });
    }

    // Modify sendSessionSummary to add logging and optimize sending
    async function sendSessionSummary() {
        if (!sessionData || !isSessionActive) {
            Logger.warn('No session data to send or session not active');
            return;
        }

        // Предотвращаем параллельные запросы
        if (dataSubmissionInProgress) {
            Logger.info('Отправка данных уже выполняется, пропускаю запрос');
            return;
        }
        
        try {
            dataSubmissionInProgress = true;
            
            Logger.info('Preparing to send session data...');
            
            // Проверяем и исправляем client_id перед отправкой
            if (sessionData.client_id) {
                if (sessionData.client_id instanceof Promise) {
                    try {
                        sessionData.client_id = safeClientId(await sessionData.client_id);
                    } catch(e) {
                        sessionData.client_id = safeClientId(null);
                    }
                } else {
                    sessionData.client_id = safeClientId(sessionData.client_id);
                }
            }
            
            // Update final duration before sending
            const now = Date.now();
            sessionData.duration = now - sessionData.start_time;
            sessionData.end_time = new Date(now).toISOString();
            sessionData.last_send_time = now; // Обновляем время последней отправки
            
            // Добавляем подробное логирование данных сессии
            Logger.info('Current session data:', {
                client_id: sessionData.client_id,
                session_id: sessionData.session_id,
                goals_count: sessionData.metrika_goals?.length || 0,
                goals: sessionData.metrika_goals || [],
                conversion_data: sessionData.conversion_data || {},
                duration: sessionData.duration
            });

            // Проверяем и логируем состояние целей
            if (sessionData.metrika_goals && sessionData.metrika_goals.length > 0) {
                Logger.info('Goals found in session data:', sessionData.metrika_goals);
            } else {
                Logger.warn('No goals found in session data');
            }

            // Update ML features before sending
            updateMLFeatures();

            // Prepare data for sending - используем функцию для ограничения размера данных
            const summary = prepareSessionDataForSending();

            // Проверяем и логируем данные перед отправкой
            Logger.info('Data to be sent:', {
                goals_count: summary.metrika_goals?.length || 0,
                goals: summary.metrika_goals || [],
                conversion_data: summary.conversion_data || {}
            });

            // Получаем размер данных для отправки
            const jsonData = JSON.stringify(summary);
            const dataSize = jsonData.length;
            
            // Если размер данных слишком большой - обрезаем
            if (dataSize > config.maxRequestSize) {
                Logger.warn(`Размер данных (${dataSize}) превышает лимит (${config.maxRequestSize}), данные будут обрезаны`);
                return await sendLargeDataInChunks(summary);
            }
            
            // Используем сжатие если включено и доступно LZString
            const useCompression = config.useCompression && typeof LZString !== 'undefined';
            let compressedData = null;
            
            if (useCompression) {
                try {
                    compressedData = LZString.compressToUTF16(jsonData);
                    const compressionRatio = Math.round((compressedData.length / jsonData.length) * 100);
                    Logger.info(`Данные сжаты: ${dataSize} → ${compressedData.length} байт (${compressionRatio}%)`);
                } catch (e) {
                    Logger.warn('Ошибка сжатия данных, отправляю несжатые:', e);
                    compressedData = null;
                }
            }

            let retryCount = 0;
            const maxRetries = config.maxRetries;

            while (retryCount < maxRetries) {
                try {
                    Logger.info(`Attempting POST request (attempt ${retryCount + 1}/${maxRetries})...`);
                    
                    // Формируем заголовки и тело запроса
                    const headers = {
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin
                    };
                    
                    let body;
                    
                    // Если используем сжатие и оно работает
                    if (useCompression && compressedData) {
                        headers['x-compression'] = 'true';
                        body = JSON.stringify({ data: compressedData });
                    } else {
                        body = jsonData;
                    }
                    
                    // Добавляем заголовок с размером для отладки
                    headers['x-data-size'] = dataSize.toString();
                    
                    const response = await fetch(config.endpoint, {
                        method: 'POST',
                        headers: headers,
                        body: body
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const result = await response.json();
                    Logger.info('✅ POST request successful:', result);
                    
                    // Сбрасываем счетчик ошибок при успехе
                    consecErrorCount = 0;
                    
                    return result;
                } catch (error) {
                    Logger.warn(`POST request failed (attempt ${retryCount + 1}/${maxRetries}):`, error);
                    
                    // Инкрементируем счетчик последовательных ошибок
                    if (error.message.includes('500')) {
                        consecErrorCount++;
                    }
                    
                    // If we're out of retries, try beacon API as last resort
                    if (retryCount === maxRetries - 1 && navigator.sendBeacon && config.beaconSupport) {
                        try {
                            Logger.info('Trying beacon API as last resort...');
                            const blob = new Blob([jsonData], {
                                type: 'application/json'
                            });
                            const success = navigator.sendBeacon(config.endpoint, blob);
                            if (success) {
                                Logger.info('✅ Data sent via beacon API');
                                return { success: true, method: 'beacon' };
                            }
                        } catch (beaconError) {
                            Logger.error('Beacon API failed:', beaconError);
                        }
                    }
                    
                    // Wait before retry with exponential backoff
                    const backoffTime = retryStrategy.initialDelay * Math.pow(retryStrategy.backoffFactor, retryCount);
                    Logger.info(`Waiting ${backoffTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                    retryCount++;
                }
            }

            // Если все попытки неудачны - добавляем в очередь неудавшихся отправок
            Logger.error(`Failed to send data after ${maxRetries} attempts, queueing for later retry`);
            addToFailedQueue(summary);
            
            throw new Error(`Failed to send data after ${maxRetries} attempts`);
        } finally {
            dataSubmissionInProgress = false;
        }
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
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                return fn.apply(this, args);
            }
        };
    }

    function generateClientId() {
        return new Promise((resolve) => {
            // 1. Сначала пробуем получить из localStorage
            const storedId = localStorage.getItem('rivox_client_id');
            if (storedId) {
                Logger.info('Using stored client ID from localStorage:', storedId);
                resolve(storedId);
                return;
            }
            
            // 2. Затем пробуем получить из бэкапа
            const backupId = localStorage.getItem('_ym_client_id_backup');
            if (backupId) {
                Logger.info('Using backed up Yandex.Metrika client ID:', backupId);
                // Сохраняем в наш формат хранения для будущего использования
                try {
                    localStorage.setItem('rivox_client_id', backupId);
                } catch (e) {
                    Logger.warn('Could not save client ID to localStorage:', e);
                }
                resolve(backupId);
                return;
            }

            // 3. Пробуем получить из куки Метрики
            const ymUid = getCookie('_ym_uid');
            if (ymUid) {
                Logger.info('Using Yandex.Metrika cookie ID:', ymUid);
                try {
                    localStorage.setItem('_ym_client_id_backup', ymUid);
                    localStorage.setItem('rivox_client_id', ymUid);
                } catch (e) {
                    Logger.warn('Could not save client ID to localStorage:', e);
                }
                resolve(ymUid);
                return;
            }

            // 4. Пробуем получить напрямую из Метрики
            const getFromMetrika = (attempts = 0, maxAttempts = 5) => {
                if (attempts >= maxAttempts) {
                    // Если не удалось получить ID, используем временный
                    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2);
                    Logger.info('Using temporary client ID:', tempId);
                    try {
                        localStorage.setItem('rivox_client_id', tempId);
                    } catch (e) {
                        Logger.warn('Could not save temporary client ID to localStorage:', e);
                    }
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
                    ym(counterId, 'getClientID', function(clientID) {
                        if (clientID) {
                            Logger.info('Got client ID from Yandex.Metrika:', clientID);
                            try {
                                localStorage.setItem('_ym_client_id_backup', clientID);
                                localStorage.setItem('rivox_client_id', clientID);
                            } catch (e) {
                                Logger.warn('Could not save client ID to localStorage:', e);
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
        const matches = document.cookie.match(new RegExp(
            "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
        ));
        return matches ? decodeURIComponent(matches[1]) : null;
    }

    function generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function getElementPath(element) {
        if (!element) return '';
        
        const path = [];
        let currentElement = element;
        
        while (currentElement) {
            let selector = currentElement.tagName ? currentElement.tagName.toLowerCase() : '';
            if (currentElement.id) {
                selector += `#${currentElement.id}`;
            } else if (currentElement.className && typeof currentElement.className === 'string') {
                selector += `.${currentElement.className.split(' ').join('.')}`;
            }
            path.unshift(selector);
            currentElement = currentElement.parentElement;
        }
        return path.join(' > ');
    }

    function isImportantElement(element) {
        if (!element) return false;
        
        // Расширенный список важных тегов
        const importantTags = [
            'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 
            'LABEL', 'FORM', 'IMG', 'VIDEO', 'IFRAME'
        ];
        
        // Важные классы и атрибуты
        const importantClasses = [
            'btn', 'button', 'link', 'cta', 'card', 
            'product', 'price', 'buy', 'cart', 'checkout',
            'modal', 'popup', 'form', 'submit', 'order'
        ];

        // Важные data-атрибуты
        const importantDataAttrs = [
            'data-rivox-important',
            'data-product',
            'data-sku',
            'data-price',
            'data-category'
        ];

        return (
            importantTags.includes(element.tagName) ||
            (element.className && typeof element.className === 'string' && importantClasses.some(cls => 
                element.className.toLowerCase().includes(cls)
            )) ||
            importantDataAttrs.some(attr => element.hasAttribute(attr))
        );
    }

    function isCTAElement(element) {
        if (!element) return false;

        // CTA теги
        const ctaTags = [
            'A', 'BUTTON', 'INPUT[type="submit"]', 'INPUT[type="button"]',
            'IMG[data-product-id]', // Картинки товаров
            'DIV.price_matrix_block', // Блоки с ценами
            'DIV.buy_block' // Блоки покупки
        ];
        
        // CTA классы
        const ctaClasses = [
            'btn', 'button', 'cta', 'buy', 'add-to-cart', 'checkout',
            'order', 'submit', 'callback', 'contact', 'phone',
            'price', 'price_matrix_block', 'buy_block',
            'product-item', 'product-card', 'product-detail',
            'add_to_cart', 'quick_buy', 'fast_order'
        ];

        // CTA текст
        const ctaTexts = [
            'купить', 'заказать', 'добавить', 'корзин', 'оформить',
            'позвонить', 'заказать звонок', 'отправить', 'оставить заявку',
            'в 1 клик', 'быстрый заказ', 'быстрая покупка'
        ];

        // Проверяем элемент и его родителей
        let currentElement = element;
        while (currentElement && currentElement !== document) {
            // Проверка по тегу
            const isCtaTag = ctaTags.some(tag => {
                const [tagName, type] = tag.split('[type="');
                if (type) {
                    return currentElement.tagName === tagName && currentElement.type === type.slice(0, -1);
                }
                if (tag.includes('.')) {
                    const [tagNameOnly, className] = tag.split('.');
                    return currentElement.tagName === tagNameOnly && 
                           currentElement.className && 
                           currentElement.className.includes(className);
                }
                return currentElement.tagName === tag;
            });

            // Проверка по классам
            const hasCtaClass = currentElement.className && 
                typeof currentElement.className === 'string' && 
                ctaClasses.some(cls => currentElement.className.toLowerCase().includes(cls));

            // Проверка по тексту
            const elementText = (currentElement.textContent || currentElement.value || '').toLowerCase();
            const hasCtaText = ctaTexts.some(text => elementText.includes(text));

            // Проверка по data-атрибутам
            const hasCtaAttr = currentElement.hasAttribute('data-rivox-cta') || 
                              currentElement.hasAttribute('data-cta') ||
                              currentElement.hasAttribute('data-buy') ||
                              currentElement.hasAttribute('data-product-buy') ||
                              currentElement.hasAttribute('data-product-id');

            if (isCtaTag || hasCtaClass || hasCtaText || hasCtaAttr) {
                return true;
            }

            currentElement = currentElement.parentElement;
        }

        return false;
    }

    // Гарантированная отправка данных с повторными попытками
    async function sendDataGuaranteed(reason) {
        if (!sessionData || !isSessionActive) {
            Logger.warn('No session data to send or session not active');
            return { success: false, error: 'No active session', code: 'NO_SESSION' };
        }

        Logger.info(`Гарантированная отправка данных (причина: ${reason || 'manual'})...`);
        
        // Обновляем временные метрики перед отправкой
        const now = Date.now();
        sessionData.duration = now - sessionData.start_time;
        sessionData.last_activity = now;
        
        // Обновляем ML параметры
        updateMLFeatures();

        try {
            // Делаем первую попытку через основной механизм отправки
            const result = await sendSessionSummary();
            Logger.info('✅ Данные успешно отправлены с первой попытки');
            return { success: true, method: 'primary', result };
        } catch (primaryError) {
            Logger.warn('⚠️ Первичная отправка не удалась, использую запасные методы', primaryError);
            
            // Вторая попытка: используем прямую отправку с помощью fetch
            try {
                const response = await sendDataWithFallback({
                    client_id: sessionData.client_id,
                    client_token: config.token,
                    session_id: sessionData.session_id,
                    timestamp: new Date().toISOString(),
                    sdk_version: SDK_VERSION,
                    data_type: 'guaranteed_fallback',
                    reason: reason || 'fallback',
                    metrika_goals: sessionData.metrika_goals || [],
                    page_url: window.location.href,
                    debug_info: {
                        primary_error: primaryError.message,
                        browser: navigator.userAgent
                    }
                });
                
                Logger.info('✅ Данные успешно отправлены через запасной метод');
                return { success: true, method: 'fallback', response };
            } catch (fallbackError) {
                Logger.error('❌ Все методы отправки не удались', fallbackError);
                
                // Добавляем в очередь неудавшихся отправок для повторной попытки позже
                addToFailedQueue({
                    summary: sessionData,
                    timestamp: Date.now(),
                    reason: reason || 'all_failed',
                    errors: [primaryError.message, fallbackError.message]
                });
                
                return { 
                    success: false, 
                    error: 'All sending methods failed', 
                    queued: true,
                    primary_error: primaryError.message,
                    fallback_error: fallbackError.message
                };
            }
        }
    }

    // Expose public API
    window.RIVOX = {
        init: init,
        sendSessionSummary,
        getSessionData: () => sessionData,
        config,
        sendDataGuaranteed,
        // Добавляем публичный доступ к функции запуска новой сессии
        startNewSession,
        // Геттеры для удобного доступа к ключевым свойствам
        get clientId() { 
            if (!sessionData) return null;
            return sessionData.client_id instanceof Promise 
                ? 'pending' // Возвращаем временное значение пока Promise не выполнен
                : safeClientId(sessionData.client_id); 
        },
        get sessionId() { return sessionData ? sessionData.session_id : null; },
        get isSessionActive() { return isSessionActive; }
    };

    // Initialize when Metrika is ready
    (function waitForYaMetrika(attempts = 0, maxAttempts = 20) {
        if (attempts >= maxAttempts) {
            Logger.error('Failed to detect Yandex.Metrika after', maxAttempts, 'attempts');
            return;
        }

        if (typeof ym === 'undefined' && typeof Ya === 'undefined' && !window.yaCounter) {
            setTimeout(() => waitForYaMetrika(attempts + 1), 500);
            return;
        }

        // Initialize SDK only after Metrika is detected
        init().catch(error => {
            Logger.error('Failed to initialize RIVOX SDK:', error);
        });
    })();

    // Auto-initialize after DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(window.RIVOX.init, config.initDelay);
    });

    Logger.info('SDK loaded successfully');

    // Управление очередью неотправленных данных
    function addToFailedQueue(data) {
        try {
            // Получаем текущую очередь или создаем новую
            let queue = getFailedDataQueue();
            
            // Добавляем метку времени для отслеживания срока действия данных
            const itemToQueue = {
                data: data,
                timestamp: Date.now(),
                attempts: 0,
                retryAt: Date.now() + 30000 // Повторная попытка через 30 секунд
            };
            
            // Добавляем элемент в очередь
            queue.push(itemToQueue);
            
            // Ограничиваем размер очереди (максимум 10 элементов)
            if (queue.length > 10) {
                // Удаляем самые старые элементы
                queue = queue.slice(-10);
            }
            
            // Сохраняем обновленную очередь
            saveFailedDataQueue(queue);
            
            Logger.info(`📋 Добавлен элемент в очередь неотправленных данных. Размер очереди: ${queue.length}`);
            
            // Запускаем проверку очереди через 30 секунд
            setTimeout(() => {
                checkAndSendFailedData();
            }, 30000);
        } catch (error) {
            Logger.error('❌ Ошибка при добавлении в очередь неотправленных данных:', error);
        }
    }
    
    // Получает текущую очередь неотправленных данных из localStorage
    function getFailedDataQueue() {
        try {
            const queueData = localStorage.getItem('rivox_failed_queue');
            if (!queueData) {
                return [];
            }
            
            const queue = JSON.parse(queueData);
            return Array.isArray(queue) ? queue : [];
        } catch (error) {
            Logger.error('❌ Ошибка при получении очереди неотправленных данных:', error);
            return [];
        }
    }
    
    // Сохраняет очередь неотправленных данных в localStorage
    function saveFailedDataQueue(queue) {
        try {
            if (!Array.isArray(queue)) {
                queue = [];
            }
            
            // Подсчитываем приблизительный размер данных
            const queueSize = JSON.stringify(queue).length;
            const queueSizeKB = (queueSize / 1024).toFixed(2);
            
            // Если данные слишком большие для localStorage (> 2MB), обрезаем старые записи
            if (queueSize > 2 * 1024 * 1024) {
                Logger.warn(`Очередь слишком большая (${queueSizeKB}KB), обрезаем старые записи`);
                
                // Оставляем только последние 2 элемента
                queue = queue.slice(-2);
                
                // Повторно рассчитываем размер
                const newQueueSize = (JSON.stringify(queue).length / 1024).toFixed(2);
                Logger.info(`Размер очереди уменьшен до ${newQueueSize}KB`);
            }
            
            localStorage.setItem('rivox_failed_queue', JSON.stringify(queue));
        } catch (error) {
            Logger.error('❌ Ошибка при сохранении очереди неотправленных данных:', error);
        }
    }
    
    // Проверяет и отправляет неотправленные данные из очереди
    async function checkAndSendFailedData() {
        try {
            // Проверяем localStorage на наличие неотправленных данных
            const failedKeys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('rivox_failed_')) {
                    failedKeys.push(key);
                }
            }
            
            if (failedKeys.length > 0) {
                Logger.info(`📤 Найдено ${failedKeys.length} неотправленных пакетов данных`);
                
                // Ограничиваем количество одновременных отправок
                const keysToProcess = failedKeys.slice(0, 5);
                
                // Отправляем данные асинхронно
                for (const key of keysToProcess) {
                    try {
                        const savedData = JSON.parse(localStorage.getItem(key));
                        if (!savedData || !savedData.summary) {
                            localStorage.removeItem(key);
                            continue;
                        }
                        
                        // Проверяем, не устарели ли данные (больше 2 дней)
                        const dataAge = Date.now() - savedData.timestamp;
                        if (dataAge > 2 * 24 * 60 * 60 * 1000) {
                            Logger.info(`⏰ Удаляем устаревшие данные: ${key}`);
                            localStorage.removeItem(key);
                            continue;
                        }
                        
                        // Пробуем отправить данные
                        Logger.info(`🔄 Отправка ранее не отправленных данных: ${key}`);
                        const result = await sendDataWithFallback(savedData.summary);
                        
                        if (result.success) {
                            // Удаляем после успешной отправки
                            localStorage.removeItem(key);
                            Logger.info(`✅ Успешно отправлены ранее не отправленные данные: ${key}`);
                        } else {
                            Logger.warn(`⚠️ Не удалось отправить данные из: ${key}`, result.error);
                        }
                    } catch (error) {
                        Logger.warn(`❌ Ошибка при отправке данных из: ${key}`, error);
                    }
                }
            }
        } catch (e) {
            Logger.warn('Ошибка при проверке неотправленных данных:', e);
        }
    }

    // ОПТИМИЗИРОВАНО: Устранено дублирование с версией ниже (линия ~2851)
    async function sendDataWithFallback(data) {
        // Проверка наличия данных (базовая валидация)
        if (!data || Object.keys(data).length === 0) {
            return {
                success: false,
                error: 'No data provided',
                code: 'EMPTY_DATA'
            };
        }
        
        // Создаем копию данных, чтобы не модифицировать оригинал
        const cleanData = {...data};
        
        // Проверяем и исправляем client_id перед отправкой
        if (cleanData.client_id) {
            if (cleanData.client_id instanceof Promise) {
                try {
                    cleanData.client_id = safeClientId(await cleanData.client_id);
                } catch(e) {
                    cleanData.client_id = safeClientId(null);
                }
            } else {
                cleanData.client_id = safeClientId(cleanData.client_id);
            }
        }
        
        try {
            // Формируем данные для отправки
            const dataToSend = {
                ...cleanData,
                event_timestamp: cleanData.event_timestamp || Date.now()
            };
            
            // Отправляем данные через основной эндпоинт
            const apiUrl = config.apiEndpoint || config.endpoint;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-sdk-version': SDK_VERSION
                },
                body: JSON.stringify(dataToSend)
            });
            
            if (response.ok) {
                const responseData = await response.json();
                return { success: true, method: 'fetch', result: responseData };
            } else {
                throw new Error(`Server error: ${response.status}`);
            }
        } catch (error) {
            // При ошибке добавляем в очередь для повторной отправки
            Logger.warn(`Не удалось отправить данные: ${error.message}`);
            addToFailedQueue(data);
            return {
                success: false, 
                error: error.message, 
                queued: true 
            };
        }
    }
    
    // Функция для отправки больших данных по частям
    async function sendLargeDataInSegments(data) {
        try {
            // Если batch - берем события из него
            if (data.batch && Array.isArray(data.events)) {
                const segments = createArraySegments(data.events, 50); // Делим на сегменты по 50 событий
                
                // Отправляем каждый сегмент
                let successCount = 0;
                let errorSegments = [];
                
                for (let i = 0; i < segments.length; i++) {
                    const segmentData = {
                        ...data,
                        batch: true,
                        is_segment: true,
                        segment_index: i,
                        total_segments: segments.length,
                        batch_size: segments[i].length,
                        events: segments[i]
                    };
                    
                    const result = await sendSegment(segmentData);
                    
                    if (result.success) {
                        successCount++;
                    } else {
                        errorSegments.push({
                            index: i,
                            error: result.error,
                            queued: result.queued
                        });
                    }
                }
                
                if (successCount === segments.length) {
                return { 
                        success: true,
                        method: 'segmented',
                        segments: segments.length
                };
                } else {
                return { 
                        success: false,
                        error: 'Partial failure in segmented data',
                        successSegments: successCount,
                        totalSegments: segments.length,
                        failedSegments: errorSegments,
                        code: 'SEGMENT_ERROR'
                    };
                }
            } else {
                // Для не-батчевых данных - просто пытаемся отправить как есть
                Logger.warn('Большие данные не поддерживаются для не-батчевой отправки');
                
                // Добавляем в очередь для отправки позже
                const queued = addToFailedQueue(data);
                
                return { 
                    success: false,
                    error: 'Data too large for non-batch sending',
                    queued: queued,
                    code: 'SIZE_ERROR'
                };
            }
        } catch (error) {
            Logger.error('Ошибка при отправке данных сегментами:', error);
            
            // Добавляем в очередь для отправки позже
            const queued = addToFailedQueue(data);
            
                return { 
                success: false,
                error: error.message,
                queued: queued,
                code: 'SEGMENT_PROCESS_ERROR'
            };
        }
    }
    
    // Отправка одного сегмента данных
    async function sendSegment(segmentData) {
        try {
            return await sendDataWithFallback(segmentData);
        } catch (error) {
                return { 
                success: false,
                error: error.message,
                code: 'SEGMENT_SEND_ERROR'
            };
        }
    }
    
    // Разделение массива на сегменты указанного размера
    function createArraySegments(array, segmentSize) {
        const segments = [];
        for (let i = 0; i < array.length; i += segmentSize) {
            segments.push(array.slice(i, i + segmentSize));
        }
        return segments;
    }
    
    // Обновление ML-признаков для аналитики поведения
    function updateMLFeatures() {
        if (!sessionData || !sessionData.ml_features) {
            Logger.warn('Cannot update ML features: no session data available');
            return;
        }
        
        try {
            // Получаем текущие данные о поведении пользователя
            const behavior = sessionData.user_behavior || {};
            
            // Вычисляем средние метрики
            const avgTimePerPage = sessionData.page_history && sessionData.page_history.length > 0 
                ? sessionData.duration / sessionData.page_history.length 
                : 0;
                
            const scrollDepth = behavior.scroll_depth_percentages && behavior.scroll_depth_percentages.length > 0
                ? Math.max(...behavior.scroll_depth_percentages.map(d => d.depth || 0))
                : 0;
                
            const clickFrequency = behavior.time_between_clicks && behavior.time_between_clicks.length > 0
                ? behavior.time_between_clicks.length / (sessionData.duration / 60000) // клики в минуту
                : 0;
            
            // Обновляем признаки для ML-модели
            sessionData.ml_features = {
                // Временные характеристики
                session_duration: sessionData.duration,
                avg_time_per_page: avgTimePerPage,
                time_to_first_interaction: behavior.time_to_first_interaction || 0,
                
                // Активность пользователя
                total_interactions: behavior.total_interactions || 0,
                scroll_depth: scrollDepth,
                scroll_count: sessionData.scroll_chunks?.length || 0,
                click_count: sessionData.cta_clicks?.length || 0,
                clicks_per_minute: clickFrequency,
                
                // Взаимодействие с формами
                form_interactions: sessionData.form_interactions?.length || 0,
                
                // Контекстные данные
                has_conversion: sessionData.metrika_goals?.length > 0,
                goals_count: sessionData.metrika_goals?.length || 0,
                
                // Дополнительные признаки
                device_type: getDeviceType(),
                viewport_size: behavior.viewport_size || { width: window.innerWidth, height: window.innerHeight },
                path_depth: window.location.pathname.split('/').filter(p => p.length > 0).length
            };
            
            // Логируем обновление признаков
            Logger.debug('ML features updated:', sessionData.ml_features);
            
        } catch (error) {
            Logger.error('Error updating ML features:', error);
        }
    }
    
    // Вспомогательная функция для определения типа устройства
    function getDeviceType() {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return 'tablet';
        }
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            return 'mobile';
        }
        return 'desktop';
    }
    
    // Функция отправки данных через JSONP (для совместимости со старыми браузерами)
    function sendViaJSONP(data, endpoint) {
        return new Promise((resolve, reject) => {
            const callbackName = 'rivoxCallback_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
            const url = new URL(endpoint);
            
            // Добавляем данные как параметры запроса (только для очень маленьких объектов)
            url.searchParams.append('data', JSON.stringify(data));
            url.searchParams.append('callback', callbackName);
            
            // Создаем скрипт-элемент
            const script = document.createElement('script');
            script.src = url.toString();
            
            // Обработчик ответа
            window[callbackName] = function(response) {
                // Удаляем скрипт
                document.body.removeChild(script);
                delete window[callbackName];
                clearTimeout(timeoutId);
                
                resolve({
                    success: true,
                    data: response
                });
            };
            
            // Обработчик ошибки
            script.onerror = function() {
                document.body.removeChild(script);
                delete window[callbackName];
                clearTimeout(timeoutId);
                
                reject(new Error('JSONP request failed'));
            };
            
            // Таймаут
            const timeoutId = setTimeout(() => {
                if (document.body.contains(script)) {
                    document.body.removeChild(script);
                }
                delete window[callbackName];
                
                reject(new Error('JSONP request timed out'));
            }, 10000);
            
            // Добавляем скрипт на страницу, что запускает запрос
            document.body.appendChild(script);
        });
    }

    // Функция для подготовки данных сессии к отправке
    function prepareSessionDataForSending() {
        // Базовые данные, которые всегда включаем
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
            session_duration: sessionData.duration || (Date.now() - sessionData.start_time),
            time_to_first_interaction: sessionData.user_behavior?.time_to_first_interaction,
            total_interactions: sessionData.user_behavior?.total_interactions || 0,
            
            // UTM Data
            utm_data: sessionData.utm_data,

            // Metrika Goals and Conversion Data
            metrika_goals: sessionData.metrika_goals || [],
            conversion_data: sessionData.conversion_data || {},
            
            // User Behavior (базовые метрики)
            user_behavior: {
                time_to_first_interaction: sessionData.user_behavior?.time_to_first_interaction,
                total_interactions: sessionData.user_behavior?.total_interactions || 0,
                viewport_size: sessionData.user_behavior?.viewport_size || { width: window.innerWidth, height: window.innerHeight }
            },

            // ML Features
            ml_features: sessionData.ml_features || {}
        };
        
        // Ограничиваем размеры массивов событий
        
        // Scroll data - ограничиваем до 30 последних событий
        if (sessionData.scroll_chunks && sessionData.scroll_chunks.length) {
            const maxScrollEvents = 30;
            summary.scroll_depth_max = sessionData.user_behavior?.scroll_depth_percentages ? 
                Math.max(...sessionData.user_behavior.scroll_depth_percentages.map(d => d.depth || 0)) : 0;
            summary.scroll_count = sessionData.scroll_chunks.length;
            
            if (sessionData.scroll_chunks.length > maxScrollEvents) {
                Logger.debug(`Ограничиваю события скролла: ${sessionData.scroll_chunks.length} → ${maxScrollEvents}`);
                summary.scroll_chunks = sessionData.scroll_chunks.slice(-maxScrollEvents);
            } else {
                summary.scroll_chunks = sessionData.scroll_chunks;
            }
        }
        
        // Click data - ограничиваем до 20 последних кликов
        if (sessionData.cta_clicks && sessionData.cta_clicks.length) {
            const maxClickEvents = 20;
            summary.click_count = sessionData.cta_clicks.length;
            
            if (sessionData.cta_clicks.length > maxClickEvents) {
                Logger.debug(`Ограничиваю события кликов: ${sessionData.cta_clicks.length} → ${maxClickEvents}`);
                summary.clicks = sessionData.cta_clicks.slice(-maxClickEvents);
            } else {
                summary.clicks = sessionData.cta_clicks;
            }
        }
        
        // Hover data - ограничиваем до 10 последних hover-событий
        if (sessionData.hover_events && sessionData.hover_events.length) {
            const maxHoverEvents = 10;
            summary.hover_count = sessionData.hover_events.length;
            
            if (sessionData.hover_events.length > maxHoverEvents) {
                Logger.debug(`Ограничиваю hover-события: ${sessionData.hover_events.length} → ${maxHoverEvents}`);
                summary.hovers = sessionData.hover_events.slice(-maxHoverEvents);
            } else {
                summary.hovers = sessionData.hover_events;
            }
        }
        
        // Полная user_behavior секция (без ограничения основных метрик)
        if (sessionData.user_behavior) {
            // Копируем базовую структуру
            summary.user_behavior = {
                ...summary.user_behavior,
                time_to_first_interaction: sessionData.user_behavior.time_to_first_interaction,
                total_interactions: sessionData.user_behavior.total_interactions || 0,
                avg_time_between_clicks: sessionData.user_behavior.avg_time_between_clicks
            };
            
            // Ограничиваем массивы данных
            if (sessionData.user_behavior.scroll_depth_percentages && sessionData.user_behavior.scroll_depth_percentages.length > 20) {
                summary.user_behavior.scroll_depth_percentages = sessionData.user_behavior.scroll_depth_percentages.slice(-20);
            } else {
                summary.user_behavior.scroll_depth_percentages = sessionData.user_behavior.scroll_depth_percentages;
            }
            
            if (sessionData.user_behavior.time_between_clicks && sessionData.user_behavior.time_between_clicks.length > 15) {
                summary.user_behavior.time_between_clicks = sessionData.user_behavior.time_between_clicks.slice(-15);
            } else {
                summary.user_behavior.time_between_clicks = sessionData.user_behavior.time_between_clicks;
            }
            
            if (sessionData.user_behavior.interaction_frequency && sessionData.user_behavior.interaction_frequency.length > 30) {
                summary.user_behavior.interaction_frequency = sessionData.user_behavior.interaction_frequency.slice(-30);
            } else {
                summary.user_behavior.interaction_frequency = sessionData.user_behavior.interaction_frequency;
            }
            
            // Тепловая карта - очень большой массив, ограничиваем сильнее
            if (sessionData.user_behavior.mouse_movement_heatmap && sessionData.user_behavior.mouse_movement_heatmap.length > 10) {
                summary.user_behavior.mouse_movement_heatmap = sessionData.user_behavior.mouse_movement_heatmap.slice(-10);
            } else {
                summary.user_behavior.mouse_movement_heatmap = sessionData.user_behavior.mouse_movement_heatmap;
            }
        }
        
        return summary;
    }

    // Функция для отправки больших данных по частям (chunked sending)
    async function sendLargeDataInChunks(data) {
        try {
            Logger.info('Данные слишком большие, разбиваю на части...');
            
            // Базовая информация о сессии
            const baseSessionInfo = {
                client_id: data.client_id,
                client_token: data.client_token,
                session_id: data.session_id,
                timestamp: data.timestamp,
                sdk_version: data.sdk_version,
                chunked_data: true // Маркер разделенных данных
            };
            
            // Получаем данные о целях и конверсии - их всегда отправляем
            const criticalData = {
                ...baseSessionInfo,
                metrika_goals: data.metrika_goals || [],
                conversion_data: data.conversion_data || {},
                utm_data: data.utm_data,
                page_url: data.page_url,
                domain: data.domain,
                path: data.path
            };
            
            // Отправляем критические данные в первую очередь
            const criticalResponse = await sendWithRetry(criticalData, 'critical_data');
            Logger.info('✅ Критические данные успешно отправлены');
            
            // Функция для отправки куска данных
            const sendChunk = async (chunkData, chunkName) => {
                const chunk = {
                    ...baseSessionInfo,
                    chunk_type: chunkName,
                    data: chunkData
                };
                
                try {
                    const chunkResponse = await sendWithRetry(chunk, chunkName);
                    Logger.info(`✅ Chunk ${chunkName} sent successfully`);
                    return chunkResponse;
                } catch (error) {
                    Logger.warn(`❌ Failed to send chunk ${chunkName}:`, error);
                    return { success: false, error: error.message };
                }
            };
            
            // Отправляем части данных параллельно
            const promises = [];
            
            // Отправляем скролл-данные
            if (data.scroll_chunks && data.scroll_chunks.length) {
                promises.push(sendChunk({
                    scroll_count: data.scroll_count,
                    scroll_depth_max: data.scroll_depth_max,
                    scroll_chunks: data.scroll_chunks
                }, 'scroll_data'));
            }
            
            // Отправляем данные о кликах
            if (data.clicks && data.clicks.length) {
                promises.push(sendChunk({
                    click_count: data.click_count,
                    clicks: data.clicks
                }, 'click_data'));
            }
            
            // Отправляем поведенческие данные
            if (data.user_behavior) {
                promises.push(sendChunk({
                    user_behavior: data.user_behavior
                }, 'behavior_data'));
            }
            
            // Отправляем ML-фичи
            if (data.ml_features) {
                promises.push(sendChunk({
                    ml_features: data.ml_features
                }, 'ml_features'));
            }
            
            // Ожидаем завершения всех отправок
            const results = await Promise.allSettled(promises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
            const failCount = promises.length - successCount;
            
            Logger.info(`📊 Chunked sending results: ${successCount} successful, ${failCount} failed`);
            
            // Если хотя бы критические данные отправлены - считаем успехом
            return {
                success: true,
                method: 'chunked',
                critical_data_sent: criticalResponse.success,
                chunks_sent: successCount,
                chunks_failed: failCount
            };
        } catch (error) {
            Logger.error('❌ Error sending large data in chunks:', error);
            throw error;
        }
    }

    // Функция для отправки данных с повторными попытками
    async function sendWithRetry(data, dataType = 'unknown') {
        let retries = 0;
        const maxRetries = config.maxRetries;
        
        while (retries < maxRetries) {
            try {
                Logger.info(`📤 Sending ${dataType} data (attempt ${retries + 1}/${maxRetries})...`);
                
                const response = await fetch(config.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin': window.location.origin,
                        'x-data-type': dataType
                    },
                    body: JSON.stringify(data)
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const result = await response.json();
                return result;
            } catch (error) {
                retries++;
                
                if (retries >= maxRetries) {
                    throw error;
                }
                
                // Exponential backoff
                const backoffTime = retryStrategy.initialDelay * Math.pow(retryStrategy.backoffFactor, retries - 1);
                Logger.warn(`Retry ${retries}/${maxRetries} after ${backoffTime}ms for ${dataType} data`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
        }
        
        throw new Error(`Failed to send ${dataType} data after ${maxRetries} attempts`);
    }
})(window); 
