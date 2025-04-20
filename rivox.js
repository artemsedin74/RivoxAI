/**
 * RIVOX SDK - Client-side tracking and analytics
 * Version: 4.6.3
 */
// RIVOX SDK v4.6.3
// Enhanced version with ML data collection capabilities

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
                Logger.debug('Found counter ID via yaCounter object:', counterId);
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
                 Logger.debug('Found counter ID via ym internal property:', counters[0].id);
                 return counters[0].id;
            }
        } catch (e) {
            Logger.warn('Error checking ym internal properties:', e);
        }
    }

    Logger.debug('Yandex.Metrika counter ID not found after checking multiple sources.');
    return null;
}

// Define a placeholder Logger globally first
let Logger = {
    setLevel: () => {},
    debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error
};

(function(window) {
    'use strict';

    const SDK_VERSION = '4.6.3';

    // Configuration
    const config = {
        endpoint: 'https://rivox-data-handler-779203791697.europe-central2.run.app',
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
        allowedDomains: ['spb.sotovik.shop', 'www.spb.sotovik.shop', 'inoxhub.ru'],
        initDelay: 300,
        sendDelay: 300000, // 5 минут
        retryDelay: 120000, // 2 минуты
        maxRetries: 3,
        maxQueueSize: 10,
        deduplicationWindow: 60000, // 1 минута

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
                console.log(`rivox.js [DEBUG]: ${msg}`, data || '');
            }
        },
        
        info: function(msg, data) {
            if (this.level <= this.LEVELS.INFO && config.debug) { 
                console.log(`rivox.js ℹ️: ${msg}`, data || '');
            }
        },
        
        warn: function(msg, data) {
            if (this.level <= this.LEVELS.WARN) {
                console.warn(`rivox.js ⚠️: ${msg}`, data || '');
            }
        },
        
        error: function(msg, error) {
            if (this.level <= this.LEVELS.ERROR) {
                console.error(`rivox.js ❌: ${msg}`, error || '');
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

        sessionData = {
        client_id: generateClientId(),
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
        } else {
            Logger.info('Creating new session');
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
            time_spent: 0
        });
        
        isSessionActive = true;
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

    // Modify sendSessionSummary to add logging
    async function sendSessionSummary() {
        if (!sessionData || !isSessionActive) {
            Logger.warn('No session data to send or session not active');
            return;
        }

        Logger.info('Preparing to send session data...');
        
        // Update final duration before sending
        const now = Date.now();
        sessionData.duration = now - sessionData.start_time;
        sessionData.end_time = new Date(now).toISOString();
        
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
            time_to_first_interaction: sessionData.user_behavior.time_to_first_interaction,
            total_interactions: sessionData.user_behavior.total_interactions,
            
            // Scroll data
            scroll_depth_max: sessionData.user_behavior.scroll_depth_percentages ? 
                Math.max(...sessionData.user_behavior.scroll_depth_percentages.map(d => d.depth)) : 0,
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
            ml_features: sessionData.ml_features
        };

        // Проверяем и логируем данные перед отправкой
        Logger.info('Data to be sent:', {
            goals_count: summary.metrika_goals.length,
            goals: summary.metrika_goals,
            conversion_data: summary.conversion_data
        });

        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second

        while (retryCount < maxRetries) {
            try {
                // Try direct POST first
                try {
                    Logger.info(`Attempting POST request (attempt ${retryCount + 1}/${maxRetries})...`);
                    const response = await fetch(config.endpoint, {
                method: 'POST',
                headers: {
                            'Content-Type': 'application/json',
                            'Origin': window.location.origin
                        },
                        body: JSON.stringify(summary)
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const result = await response.json();
                    Logger.info('✅ POST request successful:', result);
                    return result;
                } catch (error) {
                    Logger.warn(`POST request failed (attempt ${retryCount + 1}/${maxRetries}):`, error);
                    
                    // If we're out of retries, try beacon API as last resort
                    if (retryCount === maxRetries - 1 && navigator.sendBeacon) {
                        try {
                            Logger.info('Trying beacon API as last resort...');
                            const blob = new Blob([JSON.stringify(summary)], {
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
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retryCount++;
                }
            } catch (error) {
                Logger.error(`Failed to send data (attempt ${retryCount + 1}/${maxRetries}):`, error);
                if (retryCount === maxRetries - 1) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, retryDelay));
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
            // 1. Сначала пробуем получить из бэкапа
            const backupId = localStorage.getItem('_ym_client_id_backup');
            if (backupId) {
                Logger.info('Using backed up Yandex.Metrika client ID:', backupId);
                resolve(backupId);
                return;
            }

            // 2. Пробуем получить из куки Метрики
            const ymUid = getCookie('_ym_uid');
            if (ymUid) {
                Logger.info('Using Yandex.Metrika cookie ID:', ymUid);
                try {
                    localStorage.setItem('_ym_client_id_backup', ymUid);
                } catch (e) {
                    Logger.warn('Could not save client ID to localStorage:', e);
                }
                resolve(ymUid);
                return;
            }

            // 3. Пробуем получить напрямую из Метрики
            const getFromMetrika = (attempts = 0, maxAttempts = 5) => {
                if (attempts >= maxAttempts) {
                    // Если не удалось получить ID, используем временный
                    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2);
                    Logger.info('Using temporary client ID:', tempId);
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

    // Expose public API
    window.RIVOX = {
        init: init,
        sendSessionSummary,
        getSessionData: () => sessionData,
        config,
        sendDataGuaranteed,
        getSessionData: () => sessionData
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
        Logger.info('🔄 Проверка и отправка неотправленных данных...');
        
        try {
            // Получаем очередь
            const queue = getFailedDataQueue();
            
            if (queue.length === 0) {
                Logger.info('✅ Очередь неотправленных данных пуста');
                return;
            }
            
            Logger.info(`📋 В очереди ${queue.length} неотправленных элементов`);
            
            // Фильтруем элементы, которые готовы к повторной отправке
        const now = Date.now();
            let hasChanges = false;
            let itemsToRemove = [];
            
            // Обрабатываем каждый элемент
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];
                
                // Проверяем, не истек ли срок действия (более 24 часов)
                if (now - item.timestamp > 24 * 60 * 60 * 1000) {
                    Logger.info(`⏰ Элемент ${i} устарел (>24ч), удаляем из очереди`);
                    itemsToRemove.push(i);
                    hasChanges = true;
                    continue;
                }
                
                // Проверяем, готов ли элемент к повторной отправке
                if (now >= item.retryAt) {
                    // Проверяем, не слишком ли много попыток (максимум 5)
                    if (item.attempts >= 5) {
                        Logger.info(`⚠️ Элемент ${i} достиг максимального количества попыток, удаляем`);
                        itemsToRemove.push(i);
                        hasChanges = true;
                        continue;
                    }
                    
                    // Отправляем данные
                    Logger.info(`🔄 Повторная отправка элемента ${i} (попытка ${item.attempts + 1})`);
                    try {
                        const result = await sendDataWithFallback(item.data);
                        
                        if (result.success) {
                            Logger.info(`✅ Успешно отправлен элемент ${i} из очереди`);
                            itemsToRemove.push(i);
                            hasChanges = true;
                        } else if (result.queued) {
                            // Обновляем число попыток и время следующей попытки
                            queue[i].attempts++;
                            
                            // Увеличиваем интервал между попытками экспоненциально
                            const retryDelay = Math.min(30000 * Math.pow(2, queue[i].attempts), 3600000);
                            queue[i].retryAt = now + retryDelay;
                            
                            Logger.info(`⏳ Элемент ${i} запланирован для повторной отправки через ${retryDelay/1000}с`);
                            hasChanges = true;
                        }
                    } catch (error) {
                        Logger.error(`❌ Ошибка при повторной отправке элемента ${i}:`, error);
                        
                        // Обновляем число попыток и время следующей попытки
                        queue[i].attempts++;
                        queue[i].retryAt = now + 60000; // Через минуту
                        hasChanges = true;
                    }
                }
            }
            
            // Удаляем обработанные элементы (в обратном порядке, чтобы индексы не сместились)
            if (itemsToRemove.length > 0) {
                itemsToRemove.sort((a, b) => b - a);
                for (const index of itemsToRemove) {
                    queue.splice(index, 1);
                }
            }
            
            // Сохраняем обновленную очередь, если были изменения
            if (hasChanges) {
                saveFailedDataQueue(queue);
                Logger.info(`📋 Очередь обновлена, осталось ${queue.length} элементов`);
            }
            
            // Если в очереди остались элементы, запланируем следующую проверку
            if (queue.length > 0) {
                // Находим ближайшее время для повторной отправки
                let nextRetryTime = Infinity;
                for (const item of queue) {
                    if (item.retryAt < nextRetryTime) {
                        nextRetryTime = item.retryAt;
                    }
                }
                
                // Планируем следующую проверку
                const delay = Math.max(1000, nextRetryTime - now);
                Logger.info(`⏰ Следующая проверка очереди через ${(delay/1000).toFixed(1)}с`);
                
                setTimeout(() => {
                    checkAndSendFailedData();
                }, delay);
            }
        } catch (error) {
            Logger.error('❌ Ошибка при обработке очереди неотправленных данных:', error);
        }
    }

    // Улучшенная функция отправки данных с расширенной обработкой ошибок
    async function sendDataWithFallback(data) {
        if (!data || (Array.isArray(data) && data.length === 0) || Object.keys(data).length === 0) {
            Logger.error('❌ Попытка отправки пустых данных');
            return { success: false, error: 'Empty data', queued: false };
        }
        
        // Подготовка данных к отправке
        const preparedData = {
            ...data,
            sdk_version: config.version,
            send_timestamp: Date.now(),
            client_id: getClientId(),
            session_id: getSessionId()
        };
        
        // Проверка размера данных
        const dataSize = JSON.stringify(preparedData).length;
        const dataSizeKB = (dataSize / 1024).toFixed(2);
        
        Logger.info(`📊 Отправка данных размером ${dataSizeKB} KB`);
        
        // Если данные слишком большие, разбиваем на сегменты
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (dataSize > MAX_SIZE) {
            Logger.warn(`⚠️ Данные слишком большие (${dataSizeKB} KB), будут отправлены частями`);
            return await sendLargeDataInSegments(preparedData);
        }
        
        // Основная отправка данных через POST запрос
        try {
            const response = await fetch(config.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-SDK-Version': config.version
                },
                body: JSON.stringify(preparedData),
                // Важные настройки для надежной отправки
                mode: 'cors',
                credentials: 'include',
                keepalive: true,
                cache: 'no-cache'
            });
            
            if (response.ok) {
                Logger.info(`✅ Данные успешно отправлены [${response.status}]`);
                return { success: true, status: response.status };
            } else {
                Logger.warn(`⚠️ Сервер вернул ошибку: ${response.status} ${response.statusText}`);
                // Попробуем альтернативные методы
            }
        } catch (error) {
            Logger.warn(`⚠️ Ошибка при отправке данных через fetch: ${error.message}`);
            // Продолжаем с альтернативными методами
        }
        
        // Второй метод: Использование Beacon API (работает даже когда страница закрывается)
        if (navigator.sendBeacon) {
            try {
                const blob = new Blob([JSON.stringify(preparedData)], { type: 'application/json' });
                const beaconSuccess = navigator.sendBeacon(config.apiEndpoint, blob);
                
                if (beaconSuccess) {
                    Logger.info('✅ Данные успешно отправлены через Beacon API');
                    return { success: true, method: 'beacon' };
                } else {
                    Logger.warn('⚠️ Не удалось отправить данные через Beacon API');
                }
            } catch (error) {
                Logger.warn(`⚠️ Ошибка при использовании Beacon API: ${error.message}`);
            }
        } else {
            Logger.info('ℹ️ Beacon API не поддерживается в этом браузере');
        }
        
        // Если данные не слишком большие, пробуем JSONP в качестве резервного метода для очень старых браузеров
        if (dataSize < 2000) {
            try {
                const success = sendJsonp(preparedData);
                if (success) {
                    Logger.info('✅ Данные отправлены через JSONP');
                    return { success: true, method: 'jsonp' };
                }
            } catch (error) {
                Logger.warn(`⚠️ Ошибка при отправке через JSONP: ${error.message}`);
            }
        }
        
        // Последний резерв: добавляем в очередь для повторной отправки
        Logger.warn('⚠️ Все методы отправки не удались, добавляем данные в очередь');
        addToFailedQueue(preparedData);
        
        return { success: false, error: 'All sending methods failed', queued: true };
    }
    
    // Функция для отправки больших данных по частям
    async function sendLargeDataInSegments(data) {
        try {
            // Определяем критерии для разделения данных
            let segments = [];
            
            // Разбиваем большие массивы данных на сегменты
            if (data.events && Array.isArray(data.events) && data.events.length > 10) {
                // Сохраняем основные метаданные
                const metaData = { ...data };
                delete metaData.events;
                
                // Разбиваем массив событий на более мелкие части
                const eventSegments = createArraySegments(data.events, 10);
                
                // Создаем сегменты с общими метаданными
                segments = eventSegments.map((eventSegment, index) => ({
                    ...metaData,
                    events: eventSegment,
                    segment: {
                        index: index + 1,
                        total: eventSegments.length,
                        id: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
                    }
                }));
                
                Logger.info(`📦 Данные разбиты на ${segments.length} сегментов`);
            } else {
                // Если у нас нет массива событий, пытаемся разделить по другим ключам
                // Создаем один сегмент с усеченными данными
                const simplifiedData = { ...data };
                
                // Удаляем большие объекты
                Object.keys(simplifiedData).forEach(key => {
                    if (typeof simplifiedData[key] === 'object' && 
                        JSON.stringify(simplifiedData[key]).length > 1024 * 1024) {
                        
                        if (Array.isArray(simplifiedData[key])) {
                            simplifiedData[key] = simplifiedData[key].slice(0, 10);
                            simplifiedData[`${key}_truncated`] = true;
                        } else {
                            const truncatedObj = {};
                            Object.keys(simplifiedData[key]).slice(0, 5).forEach(subKey => {
                                truncatedObj[subKey] = simplifiedData[key][subKey];
                            });
                            simplifiedData[key] = truncatedObj;
                            simplifiedData[`${key}_truncated`] = true;
                        }
                    }
                });
                
                segments = [simplifiedData];
                Logger.warn('⚠️ Данные слишком большие, но не могут быть эффективно разделены - отправляется усеченная версия');
            }
            
            // Отправляем сегменты последовательно
            const results = [];
            for (let i = 0; i < segments.length; i++) {
                Logger.info(`📦 Отправка сегмента ${i+1}/${segments.length}`);
                const result = await sendSegment(segments[i]);
                results.push(result);
                
                if (!result.success && !result.queued) {
                    // Если сегмент не удалось отправить и он не добавлен в очередь,
                    // останавливаем отправку и добавляем все оставшиеся сегменты в очередь
                    Logger.warn(`⚠️ Не удалось отправить сегмент ${i+1}, добавляем оставшиеся в очередь`);
                    
                    // Добавляем все оставшиеся сегменты в очередь
                    for (let j = i; j < segments.length; j++) {
                        addToFailedQueue(segments[j]);
                    }
                    
                    return {
                        success: false,
                        segmentsSent: i,
                        totalSegments: segments.length,
                        queued: true
                    };
                }
                
                // Небольшая задержка между отправками сегментов
                if (i < segments.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            
            // Проверяем, все ли сегменты успешно отправлены
            const allSuccess = results.every(r => r.success);
            
            return {
                success: allSuccess,
                segmentsSent: results.filter(r => r.success).length,
                totalSegments: segments.length,
                queued: results.some(r => r.queued)
            };
        } catch (error) {
            Logger.error('❌ Ошибка при отправке данных по сегментам:', error);
            
            // Добавляем исходные данные в очередь
            addToFailedQueue(data);
            
            return { success: false, error: error.message, queued: true };
        }
    }
    
    // Вспомогательная функция для отправки отдельного сегмента данных
    async function sendSegment(segment) {
        // Используем основную функцию отправки для отдельного сегмента
        return await sendDataWithFallback(segment);
    }
    
    // Разбивает большой массив на более мелкие сегменты
    function createArraySegments(array, maxItemsPerSegment) {
        const segments = [];
        for (let i = 0; i < array.length; i += maxItemsPerSegment) {
            segments.push(array.slice(i, i + maxItemsPerSegment));
        }
        return segments;
    }
    
    // Вспомогательная функция для отправки через JSONP
    function sendJsonp(data) {
        return new Promise((resolve, reject) => {
            try {
                const callbackName = 'rivoxCallback_' + Date.now();
                const script = document.createElement('script');
                const compressedData = encodeURIComponent(JSON.stringify(data));
                
                // Добавляем колбэк в глобальную область
                window[callbackName] = function(response) {
                    // Чистим созданные элементы
                    document.body.removeChild(script);
                    delete window[callbackName];
                    resolve(true);
                };
                
                // Готовим URL с данными
                script.src = `${config.apiEndpoint}?data=${compressedData}&callback=${callbackName}`;
                
                // Обработка ошибок загрузки скрипта
                script.onerror = function() {
                    document.body.removeChild(script);
                    delete window[callbackName];
                    reject(new Error('JSONP request failed'));
                };
                
                // Устанавливаем таймаут
                setTimeout(() => {
                    if (window[callbackName]) {
                        document.body.removeChild(script);
                        delete window[callbackName];
                        reject(new Error('JSONP request timed out'));
                    }
                }, 10000);
                
                // Добавляем скрипт на страницу для выполнения запроса
                document.body.appendChild(script);
                
            } catch (error) {
                reject(error);
            }
        });
    }

    function shouldSendData() {
        if (!sessionData) return false;
        
        // Логируем структуру данных
        Logger.info('Session data structure:', {
            metrika_goals_count: sessionData.metrika_goals?.length || 0,
            form_interactions_count: sessionData.form_interactions?.length || 0,
            scroll_chunks_count: sessionData.scroll_chunks?.length || 0,
            cta_clicks_count: sessionData.cta_clicks?.length || 0,
            page_history_count: sessionData.page_history?.length || 0
        });
        
        // 1. Всегда отправляем при конверсиях/важных событиях
        if (
            sessionData.metrika_goals.length > 0 || // Есть цели
            sessionData.form_interactions.length > 0 // Есть заполнения форм
        ) {
            Logger.debug('Sending data due to conversion events');
            return true;
        }

        // 2. Проверка минимального времени на сайте
        const timeOnSite = Date.now() - sessionData.start_time;
        if (timeOnSite < 25000) { // меньше 25 секунд
            Logger.debug('Session too short (<25s), skipping data send');
            return false;
        }

        // 3. Для сессий дольше 25 секунд отправляем при накоплении данных
        const shouldSend = (
            sessionData.scroll_chunks.length >= 5 || // Хотя бы немного скроллили
            timeOnSite >= 60000 || // 1 минута на сайте
            sessionData.cta_clicks.length > 0 // Хотя бы один клик
        );

        if (shouldSend) {
            Logger.debug('Sending data: session longer than 25s and has enough events');
        }

        return shouldSend;
    }

    // Оригинальные методы Метрики для перехвата
    const originalMethods = {
        ym: null,
        yaCounters: {}
    };

    // Улучшенное отслеживание целей Яндекс.Метрики
    function setupEnhancedMetrikaTracking() {
        Logger.info('🔄 Настраиваю улучшенное отслеживание целей Метрики...');
        
        // 1. Перехват глобальной функции ym
        if (typeof window.ym === 'function') {
            Logger.info('Найдена глобальная функция ym, настраиваю перехват');
            
            // Сохраняем оригинальную функцию
            originalMethods.ym = window.ym;
            
            window.ym = function(counterId, method, goalName, params) {
                // Вызываем оригинальную функцию
                const result = originalMethods.ym.apply(this, arguments);
                
                // Перехватываем только цели (reachGoal)
                if (method === 'reachGoal' && goalName) {
                    Logger.info(`🎯 Метрика: цель "${goalName}" для счетчика ${counterId}`, params || {});
                    
                    try {
                        trackMetrikaGoal(counterId, goalName, params);
                    } catch (e) {
                        Logger.error('Ошибка при отслеживании цели через ym:', e);
                    }
                }
                
                return result;
            };
            
            Logger.info('✅ Перехват ym успешно настроен');
        } else {
            Logger.warn('⚠️ Функция ym не найдена, будет использован альтернативный метод');
        }
        
        // 2. Перехват счетчиков через объекты yaCounter
        for (const key in window) {
            if (key.startsWith('yaCounter')) {
                const counterId = key.replace('yaCounter', '');
                const counter = window[key];
                
                if (counter && typeof counter.reachGoal === 'function') {
                    Logger.info(`Найден счетчик ${key}, настраиваю перехват`);
                    
                    // Сохраняем оригинальный метод
                    originalMethods.yaCounters[key] = counter.reachGoal;
                    
                    // Заменяем метод
                    counter.reachGoal = function(goalName, params) {
                        // Вызываем оригинальную функцию
                        const result = originalMethods.yaCounters[key].apply(this, arguments);
                        
                        // Отслеживаем цель
                        if (goalName) {
                            Logger.info(`🎯 Метрика: цель "${goalName}" через ${key}`, params || {});
                            
                            try {
                                trackMetrikaGoal(counterId, goalName, params);
                            } catch (e) {
                                Logger.error(`Ошибка при отслеживании цели через ${key}:`, e);
                            }
                        }
                        
                        return result;
                    };
                    
                    Logger.info(`✅ Перехват ${key}.reachGoal успешно настроен`);
                }
            }
        }
        
        // 3. Проверяем и добавляем наблюдение за будущими счетчиками
        setupCounterObserver();
        
        Logger.info('✅ Улучшенное отслеживание целей Метрики настроено');
        return true;
    }

    // Функция для отслеживания цели и сохранения в нашей сессии
    function trackMetrikaGoal(counterId, goalName, params) {
        if (!sessionData) {
            Logger.warn('⚠️ Не могу отследить цель: sessionData не инициализирован');
            return false;
        }
        
        // Гарантируем, что все необходимые массивы существуют
        if (!sessionData.metrika_goals) {
            sessionData.metrika_goals = [];
        }
        
        if (!sessionData.conversion_data) {
            sessionData.conversion_data = {
                goals_reached: [],
                ecommerce_data: [],
                last_goal_timestamp: null,
                conversion_path: []
            };
        }
        
        if (!sessionData.conversion_data.goals_reached) {
            sessionData.conversion_data.goals_reached = [];
        }
        
        if (!sessionData.conversion_data.conversion_path) {
            sessionData.conversion_data.conversion_path = [];
        }
        
        const now = Date.now();
        
        // Создаем расширенные данные о цели
        const goalData = {
            name: goalName,
            counter_id: counterId,
            params: params || {},
            timestamp: now,
            url: window.location.href,
            page_path: window.location.pathname,
            page_title: document.title || '',
            session_duration_at_goal: sessionData.start_time ? (now - sessionData.start_time) : 0
        };
        
        // Добавляем цель во все необходимые массивы
        sessionData.metrika_goals.push(goalData);
        sessionData.conversion_data.goals_reached.push(goalData);
        sessionData.conversion_data.last_goal_timestamp = now;
        sessionData.conversion_data.conversion_path.push({
            type: 'goal',
            name: goalName,
            timestamp: now,
            url: window.location.href
        });
        
        Logger.debug('💾 Цель сохранена в данных сессии:', goalData);
        
        // Планируем отправку данных для важных целей
        if (isImportantGoal(goalName)) {
            Logger.info(`Важная цель "${goalName}" достигнута, отправляю данные...`);
            
            // Защита от слишком частых отправок
            if (window.lastGoalSendTime && (now - window.lastGoalSendTime < 10000)) {
                Logger.info('Предыдущая отправка была менее 10 секунд назад, откладываем');
                return true;
            }
            
            window.lastGoalSendTime = now;
            
            // Отправляем данные с небольшой задержкой для агрегации
            setTimeout(() => {
                sendSessionSummary().catch(error => 
                    Logger.error('Не удалось отправить данные после цели:', error)
                );
            }, 500);
        }
        
        return true;
    }

    // Наблюдатель для обнаружения новых счетчиков
    function setupCounterObserver() {
        // Создаем MutationObserver для отслеживания добавления новых счетчиков
        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(function(mutations) {
                let needsCheck = false;
                
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length) {
                        // Если добавлены новые скрипты, проверим счетчики
                        for (let i = 0; i < mutation.addedNodes.length; i++) {
                            const node = mutation.addedNodes[i];
                            if (node.tagName === 'SCRIPT') {
                                needsCheck = true;
                                break;
                            }
                        }
                    }
                });
                
                if (needsCheck) {
                    // Проверяем новые счетчики с небольшой задержкой
                    setTimeout(checkForNewCounters, 500);
                }
            });
            
            // Наблюдаем за изменениями в <head> и <body>
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
            
            Logger.info('👀 Наблюдатель за новыми счетчиками настроен');
        }
    }

    // Функция для проверки новых счетчиков
    function checkForNewCounters() {
        for (const key in window) {
            if (key.startsWith('yaCounter') && typeof window[key].reachGoal === 'function') {
                // Проверяем, не перехватили ли мы уже этот счетчик
                if (!originalMethods.yaCounters[key]) {
                    const counterId = key.replace('yaCounter', '');
                    Logger.info(`Обнаружен новый счетчик ${key}, настраиваю перехват`);
                    
                    // Повторяем процесс перехвата для нового счетчика
                    originalMethods.yaCounters[key] = window[key].reachGoal;
                    
                    window[key].reachGoal = function(goalName, params) {
                        const result = originalMethods.yaCounters[key].apply(this, arguments);
                        
                        if (goalName) {
                            Logger.info(`🎯 Метрика: цель "${goalName}" через новый ${key}`, params || {});
                            trackMetrikaGoal(counterId, goalName, params);
                        }
                        
                        return result;
                    };
                    
                    Logger.info(`✅ Перехват нового ${key}.reachGoal настроен`);
                }
            }
        }
    }

    // Модифицируем оригинальную функцию для использования нового подхода
    function setupMetrikaTracking(attempts = 0, maxAttempts = 5) {
        try {
            // Пробуем использовать улучшенное отслеживание
            const success = setupEnhancedMetrikaTracking();
            if (success) {
                return;
            }
            
            // Если улучшенное отслеживание не сработало, используем запасной вариант
            // Используем расширенный поиск счетчика
            const counterId = getYandexCounterId();
            Logger.info('Настройка базового отслеживания Метрики для счетчика:', counterId);
            
            if (!counterId) {
                if (attempts < maxAttempts) {
                    Logger.info(`ID счетчика не найден, повторяю через 1с (попытка ${attempts + 1}/${maxAttempts})`);
                    setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
                    return;
                }
                Logger.warn('Не удалось найти ID счетчика Яндекс.Метрики после максимального числа попыток');
                return;
            }

            // Проверяем существование объекта счетчика
            if (!window[`yaCounter${counterId}`]) {
                Logger.warn(`Объект счетчика yaCounter${counterId} не найден`);
                if (attempts < maxAttempts) {
                    setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
                    return;
                }
                return;
            }

            // Сохраняем оригинальную функцию reachGoal
            const originalReachGoal = window[`yaCounter${counterId}`].reachGoal;
            Logger.info('Оригинальная функция reachGoal:', originalReachGoal);
            
            if (!originalReachGoal) {
                Logger.warn('Функция reachGoal не найдена в объекте счетчика');
                if (attempts < maxAttempts) {
                    setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
                    return;
                }
                return;
            }

            Logger.info('Успешно найден счетчик Метрики и функция reachGoal');

            // Переопределяем reachGoal для отслеживания целей
            window[`yaCounter${counterId}`].reachGoal = function(goalName, params) {
                // Логируем вызов немедленно
                Logger.info(`🎯 Перехвачен вызов Метрики reachGoal: ${goalName}`, params || {});
                
                // Сначала вызываем оригинальную функцию
                const result = originalReachGoal.apply(this, arguments);

                // Используем общую функцию для отслеживания цели
                trackMetrikaGoal(counterId, goalName, params);

                return result;
            };

            Logger.info('✅ Настройка отслеживания Метрики завершена');
        } catch (error) {
            Logger.error('Ошибка при настройке отслеживания Метрики:', error);
            
            // Если все попытки не удались, повторяем стандартным способом
            if (attempts < maxAttempts) {
                Logger.warn(`Повторяю настройку отслеживания Метрики (попытка ${attempts + 1}/${maxAttempts})`);
                setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
            }
        }
    }

    // Important goals that should trigger immediate data send
    function isImportantGoal(goalName) {
        const importantGoals = [
            'order',
            'purchase',
            'lead',
            'contact',
            'form',
            'callback',
            'phone'
        ];
        return importantGoals.some(g => goalName.toLowerCase().includes(g));
    }

    // Add reliable data collection and transmission
    function saveSessionToStorage() {
        try {
            localStorage.setItem('rivox_current_session', JSON.stringify(sessionData));
            Logger.debug('Session data saved to localStorage');
        } catch (e) {
            Logger.warn('Failed to save session to localStorage:', e);
        }
    }

    function loadSessionFromStorage() {
        try {
            const saved = localStorage.getItem('rivox_current_session');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Only restore if session is recent (last 30 minutes)
                if (Date.now() - parsed.last_activity < config.sessionTimeout) {
                    Logger.info('Restoring previous session');
                    return parsed;
                }
            }
        } catch (e) {
            Logger.warn('Failed to load session from localStorage:', e);
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
            page_history: [{
                timestamp: now,
                url: window.location.href,
                referrer: document.referrer,
                time_spent: 0
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
    }

    // Get browser and device info
    function getBrowserInfo() {
        const ua = navigator.userAgent;
        const browserData = {
            device_type: 'desktop',
            browser: 'unknown',
            platform: navigator.platform
        };

        // Determine device type
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            browserData.device_type = 'tablet';
        } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            browserData.device_type = 'mobile';
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
        
        const currentPage = sessionData.page_history[sessionData.page_history.length - 1];
        if (currentPage) {
            currentPage.time_spent = Date.now() - currentPage.timestamp;
        }
        
        sessionData.page_history.push({
            timestamp: Date.now(),
            url: window.location.href,
            referrer: document.referrer,
            time_spent: 0
        });
        
        saveSessionToStorage();
    }

    // Guaranteed data sending on important events
    function sendDataGuaranteed(reason = 'manual') {
        return new Promise((resolve, reject) => {
            if (!sessionData) {
                resolve();
                return;
            }

            // Валидируем сессию перед отправкой
            const validationResult = validateSessionData();
            if (!validationResult.isValid) {
                Logger.warn('⚠️ Обнаружены проблемы с данными сессии:', validationResult.errors);
                
                // Пытаемся исправить проблемы
                fixSessionDataIssues(validationResult.errors);
                
                // Логируем результат исправления
                Logger.info('🔧 Сессия восстановлена после проблем');
            }

            // Update time spent on current page
            const currentPage = sessionData.page_history[sessionData.page_history.length - 1];
            if (currentPage) {
                currentPage.time_spent = Date.now() - currentPage.timestamp;
            }

            // Update ML features before sending
            updateMLFeatures(); 

            // Prepare complete session summary
            const summary = prepareSessionForSending(reason);

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
                    Logger.info(`✅ Данные успешно отправлены (${reason})`);
                    
                    // Записываем информацию об успешной отправке
                    storeSuccessfulSend(summary.session_id, reason);
                    
                    // Clear localStorage after successful send
                    localStorage.removeItem('rivox_current_session');
                    resolve();
                })
                .catch(error => {
                    Logger.error(`❌ Не удалось отправить данные (${reason}):`, error);
                    
                    // Сохраняем данные для последующих попыток
                    const backupKey = `rivox_failed_${Date.now()}_${summary.session_id}`;
                    try {
                        localStorage.setItem(backupKey, JSON.stringify({
                            summary,
                            reason,
                            timestamp: Date.now(),
                            error: error.message
                        }));
                        Logger.info('💾 Данные сохранены для повторной отправки:', backupKey);
                    } catch (storageError) {
                        Logger.warn('⚠️ Не удалось сохранить данные сессии:', storageError);
                    }
                    
                    // Save to localStorage as backup
                    saveSessionToStorage();
                    reject(error);
                });
        });
    }
    
    // Подготовка сессии для отправки с сокращением размера
    function prepareSessionForSending(reason) {
        const now = Date.now();
        
        // Базовые данные о сессии
        const summary = {
            client_id: sessionData.client_id,
            client_token: config.token,
            session_id: sessionData.session_id,
            timestamp: new Date().toISOString(),
            sdk_version: SDK_VERSION,
            send_reason: reason,
            
            // Page info
            page_url: window.location.href,
            domain: window.location.hostname,
            path: window.location.pathname,
            
            // Session metrics
            start_time: sessionData.start_time,
            end_time: now,
            session_duration: calculateSafeInterval(sessionData.start_time, now),
            device_info: sessionData.device_info,
            
            // User Behavior
            user_behavior: sessionData.user_behavior,
            
            // ML Features
            ml_features: sessionData.ml_features,
            
            // UTM Data и Traffic Source
            utm_data: sessionData.utm_data,
            traffic_source: sessionData.traffic_source
        };
        
        // Оптимизируем размер данных для отправки
        // 1. Ограничиваем количество событий
        const MAX_EVENTS = 1000;
        
        // Копируем события с ограничением по размеру
        if (sessionData.scroll_chunks && sessionData.scroll_chunks.length > MAX_EVENTS) {
            summary.scroll_chunks = sessionData.scroll_chunks.slice(-MAX_EVENTS);
            summary.scroll_count = sessionData.scroll_chunks.length;
            Logger.info(`Scroll events truncated from ${sessionData.scroll_chunks.length} to ${MAX_EVENTS}`);
        } else {
            summary.scroll_chunks = sessionData.scroll_chunks;
            summary.scroll_count = summary.scroll_chunks ? summary.scroll_chunks.length : 0;
        }
        
        // Копируем клики
        if (sessionData.cta_clicks && sessionData.cta_clicks.length > MAX_EVENTS / 10) {
            // Для кликов берем меньше, они более важные
            summary.clicks = sessionData.cta_clicks.slice(-MAX_EVENTS / 10);
            summary.click_count = sessionData.cta_clicks.length;
            Logger.info(`Click events truncated from ${sessionData.cta_clicks.length} to ${MAX_EVENTS / 10}`);
        } else {
            summary.clicks = sessionData.cta_clicks;
            summary.click_count = summary.clicks ? summary.clicks.length : 0;
        }
        
        // Копируем hover-события
        if (sessionData.hover_events && sessionData.hover_events.length > MAX_EVENTS / 5) {
            summary.hovers = sessionData.hover_events.slice(-MAX_EVENTS / 5);
            summary.hover_count = sessionData.hover_events.length;
            Logger.info(`Hover events truncated from ${sessionData.hover_events.length} to ${MAX_EVENTS / 5}`);
        } else {
            summary.hovers = sessionData.hover_events;
            summary.hover_count = summary.hovers ? summary.hovers.length : 0;
        }
        
        // Важные данные - всегда копируем целиком
        summary.metrika_goals = sessionData.metrika_goals || [];
        summary.conversion_data = sessionData.conversion_data || {};
        summary.form_interactions = sessionData.form_interactions || [];
        summary.page_history = sessionData.page_history || [];
        
        return summary;
    }
    
    // Проверка валидности данных сессии перед отправкой
    function validateSessionData() {
        const errors = [];
        
        // Проверка наличия обязательных полей
        if (!sessionData.client_id) errors.push('missing_client_id');
        if (!sessionData.session_id) errors.push('missing_session_id');
        if (!sessionData.client_token) errors.push('missing_client_token');
        
        // Проверка типов данных
        if (!sessionData.start_time || typeof sessionData.start_time !== 'number') {
            errors.push('invalid_start_time');
        }
        
        if (!sessionData.last_activity || typeof sessionData.last_activity !== 'number') {
            errors.push('invalid_last_activity');
        }
        
        // Проверка на отрицательные значения
        if (sessionData.start_time && sessionData.start_time < 0) {
            errors.push('negative_start_time');
        }
        
        if (sessionData.last_activity && sessionData.last_activity < 0) {
            errors.push('negative_last_activity');
        }
        
        // Проверка временных соотношений
        if (sessionData.start_time && sessionData.last_activity && 
            sessionData.last_activity < sessionData.start_time) {
            errors.push('last_activity_before_start_time');
        }
        
        // Проверка наличия структур данных
        if (!sessionData.user_behavior) errors.push('missing_user_behavior');
        if (!sessionData.ml_features) errors.push('missing_ml_features');
        
        // Проверка массивов
        const requiredArrays = [
            {name: 'metrika_goals', path: 'sessionData.metrika_goals'},
            {name: 'scroll_chunks', path: 'sessionData.scroll_chunks'},
            {name: 'cta_clicks', path: 'sessionData.cta_clicks'},
            {name: 'page_history', path: 'sessionData.page_history'},
            {name: 'hover_events', path: 'sessionData.hover_events'},
            {name: 'form_interactions', path: 'sessionData.form_interactions'}
        ];
        
        for (const arr of requiredArrays) {
            try {
                const value = eval(arr.path);
                if (!Array.isArray(value)) {
                    errors.push(`not_array_${arr.name}`);
                }
            } catch (e) {
                errors.push(`missing_${arr.name}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
    
    // Исправление проблем в данных сессии
    function fixSessionDataIssues(errors) {
        const now = Date.now();
        
        // Исправление базовых полей
        if (!sessionData.client_id || errors.includes('missing_client_id')) {
            sessionData.client_id = `temp_${now}_${Math.random().toString(36).substring(2, 10)}`;
            Logger.warn('Создан временный client_id:', sessionData.client_id);
        }
        
        if (!sessionData.session_id || errors.includes('missing_session_id')) {
            sessionData.session_id = generateSessionId();
            Logger.warn('Создан новый session_id:', sessionData.session_id);
        }
        
        if (!sessionData.client_token || errors.includes('missing_client_token')) {
            // Пытаемся получить токен из конфигурации
            sessionData.client_token = config.token || 'unknown_token';
            Logger.warn('Установлен client_token из конфигурации:', sessionData.client_token);
        }
        
        // Исправление временных меток
        if (errors.includes('invalid_start_time') || errors.includes('negative_start_time')) {
            sessionData.start_time = now - 60000; // Устанавливаем 1 минуту назад
            Logger.warn('Исправлено некорректное start_time:', sessionData.start_time);
        }
        
        if (errors.includes('invalid_last_activity') || errors.includes('negative_last_activity')) {
            sessionData.last_activity = now;
            Logger.warn('Исправлено некорректное last_activity:', sessionData.last_activity);
        }
        
        if (errors.includes('last_activity_before_start_time')) {
            // Если last_activity раньше start_time, исправляем оба значения
            const timeDiff = 30000; // 30 секунд между start и last_activity
            sessionData.start_time = now - timeDiff;
            sessionData.last_activity = now;
            Logger.warn('Исправлено соотношение start_time и last_activity');
        }
        
        // Создание отсутствующих структур
        if (errors.includes('missing_user_behavior')) {
            sessionData.user_behavior = {
                time_to_first_interaction: null,
                total_interactions: 0,
                interaction_frequency: [],
                scroll_depth_percentages: [],
                time_between_clicks: [],
                viewport_size: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            };
            Logger.warn('Создана структура user_behavior');
        }
        
        if (errors.includes('missing_ml_features')) {
            sessionData.ml_features = {
                interest_signals: [],
                behavior_patterns: [],
                user_segment: null,
                conversion_probability: null,
                funnel_analysis: {}
            };
            Logger.warn('Создана структура ml_features');
        }
        
        // Создание отсутствующих массивов
        if (errors.includes('not_array_metrika_goals') || errors.includes('missing_metrika_goals')) {
            sessionData.metrika_goals = [];
            Logger.warn('Создан массив metrika_goals');
        }
        
        if (errors.includes('not_array_scroll_chunks') || errors.includes('missing_scroll_chunks')) {
            sessionData.scroll_chunks = [];
            Logger.warn('Создан массив scroll_chunks');
        }
        
        if (errors.includes('not_array_cta_clicks') || errors.includes('missing_cta_clicks')) {
            sessionData.cta_clicks = [];
            Logger.warn('Создан массив cta_clicks');
        }
        
        if (errors.includes('not_array_page_history') || errors.includes('missing_page_history')) {
            sessionData.page_history = [{
                timestamp: now,
                url: window.location.href,
                referrer: document.referrer,
                time_spent: 0
            }];
            Logger.warn('Создан массив page_history');
        }
        
        if (errors.includes('not_array_hover_events') || errors.includes('missing_hover_events')) {
            sessionData.hover_events = [];
            Logger.warn('Создан массив hover_events');
        }
        
        if (errors.includes('not_array_form_interactions') || errors.includes('missing_form_interactions')) {
            sessionData.form_interactions = [];
            Logger.warn('Создан массив form_interactions');
        }
        
        // Обновляем ML-фичи, используя исправленные данные
        updateMLFeatures();
        
        // Сохраняем исправленные данные
        saveSessionToStorage();
        
        return true;
    }
    
    // Хранение информации об успешных отправках
    function storeSuccessfulSend(sessionId, reason) {
        try {
            // Получаем текущий список отправок
            let sentSessions = localStorage.getItem('rivox_sent_sessions');
            const sentList = sentSessions ? JSON.parse(sentSessions) : [];
            
            // Добавляем новую отправку
            sentList.push({
                session_id: sessionId,
                send_reason: reason,
                timestamp: Date.now()
            });
            
            // Ограничиваем размер списка
            if (sentList.length > 50) {
                sentList.splice(0, sentList.length - 50);
            }
            
            // Сохраняем обратно
            localStorage.setItem('rivox_sent_sessions', JSON.stringify(sentList));
        } catch (e) {
            // Игнорируем ошибки хранилища
            Logger.warn('Не удалось сохранить информацию об отправке:', e);
        }
    }
    
    // Проверка и отправка ранее неотправленных данных
    function checkAndSendFailedData() {
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
                keysToProcess.forEach(async (key) => {
                    try {
                        const savedData = JSON.parse(localStorage.getItem(key));
                        if (!savedData || !savedData.summary) {
                            localStorage.removeItem(key);
                            return;
                        }
                        
                        // Проверяем, не устарели ли данные (больше 2 дней)
                        const dataAge = Date.now() - savedData.timestamp;
                        if (dataAge > 2 * 24 * 60 * 60 * 1000) {
                            Logger.info(`⏰ Удаляем устаревшие данные: ${key}`);
                            localStorage.removeItem(key);
                            return;
                        }
                        
                        // Пробуем отправить данные
                        Logger.info(`🔄 Отправка ранее не отправленных данных: ${key}`);
                        await sendDataWithFallback(savedData.summary);
                        
                        // Удаляем после успешной отправки
                        localStorage.removeItem(key);
                        Logger.info(`✅ Успешно отправлены ранее не отправленные данные: ${key}`);
                    } catch (error) {
                        Logger.warn(`❌ Не удалось отправить данные из: ${key}`, error);
                    }
                });
            }
        } catch (e) {
            Logger.warn('Ошибка при проверке неотправленных данных:', e);
        }
    }

    // Add beforeunload handler
    window.addEventListener('beforeunload', () => {
        sendDataGuaranteed('page_close');
    });

    // Add history change handler
    window.addEventListener('popstate', updatePageHistory);
    if (window.history.pushState) {
        const originalPushState = window.history.pushState.bind(window.history);
        window.history.pushState = function() {
            originalPushState.apply(this, arguments);
            updatePageHistory();
        };
    }

    // Expose additional methods for debugging
    window.RIVOX = {
        ...window.RIVOX,
        sendDataGuaranteed,
        getSessionData: () => sessionData
    };

    // ---- New ML Features Function ----
    function updateMLFeatures() {
        if (!sessionData || !sessionData.ml_features) return;
        
        const now = Date.now();
        const timeOnSite = validateTimeValue(now - sessionData.start_time, 0);
        const timeOnSiteSeconds = timeOnSite / 1000;
        
        // Гарантируем, что все необходимые объекты существуют
        ensureMLFeatureStructure();
        
        // Обновляем базовые признаки для времени на сайте и активности
        updateBaseFeatures(timeOnSiteSeconds, now);
        
        // Обновляем признаки пользовательского поведения
        updateBehavioralFeatures(timeOnSiteSeconds, now);
        
        // Обновляем признаки воронки конверсии для e-commerce
        updateFunnelFeatures();
        
        // Вычисляем вероятность конверсии на основе признаков
        calculateConversionProbability();
        
        // Определяем сегмент пользователя
        determineUserSegment();
        
        // Логируем ML-признаки для отладки
        if (config.debug) {
            Logger.debug('Обновлены ML-признаки:', {
                engagement_score: sessionData.ml_features.engagement_score,
                interest_signals: sessionData.ml_features.interest_signals.length,
                conversion_probability: sessionData.ml_features.conversion_probability
            });
        }
    }
    
    // Гарантируем, что структура ML-признаков существует и готова к использованию
    function ensureMLFeatureStructure() {
        if (!sessionData.ml_features) {
            sessionData.ml_features = {};
        }
        
        const features = sessionData.ml_features;
        
        if (!features.interest_signals) features.interest_signals = [];
        if (!features.behavior_patterns) features.behavior_patterns = [];
        if (!features.funnel_analysis) features.funnel_analysis = {};
        if (!features.page_category_analysis) features.page_category_analysis = {};
        if (!features.event_sequence) features.event_sequence = [];
        if (!features.time_based_metrics) features.time_based_metrics = {};
    }
    
    // Обновляем базовые признаки для времени на сайте и активности
    function updateBaseFeatures(timeOnSiteSeconds, now) {
        // Очищаем все зависящие от времени значения
        const timeBasedMetrics = {
            time_on_site: parseFloat(timeOnSiteSeconds.toFixed(2)),
            active_time: 0,
            idle_time: 0,
            pages_per_minute: 0,
            last_update: now
        };
        
        // Рассчитываем активное время (вычитаем время бездействия)
        if (sessionData.user_behavior && sessionData.user_behavior.interaction_frequency) {
            const interactions = sessionData.user_behavior.interaction_frequency;
            
            if (interactions.length > 1) {
                // Рассчитываем время между взаимодействиями
                let totalIdleTime = 0;
                
                for (let i = 1; i < interactions.length; i++) {
                    const timeDiff = interactions[i].timestamp - interactions[i-1].timestamp;
                    
                    // Если разница больше 30 секунд, считаем это временем бездействия
                    if (timeDiff > 30000) {
                        totalIdleTime += Math.min(timeDiff - 30000, 300000); // Ограничиваем максимум 5 минутами
                    }
                }
                
                timeBasedMetrics.idle_time = parseFloat((totalIdleTime / 1000).toFixed(2));
                timeBasedMetrics.active_time = Math.max(0, timeBasedMetrics.time_on_site - timeBasedMetrics.idle_time);
            } else {
                // Если только одно взаимодействие, считаем активное время как 90% от общего
                timeBasedMetrics.active_time = parseFloat((timeOnSiteSeconds * 0.9).toFixed(2));
                timeBasedMetrics.idle_time = parseFloat((timeOnSiteSeconds * 0.1).toFixed(2));
            }
        } else {
            // Без взаимодействий предполагаем половину времени активной
            timeBasedMetrics.active_time = parseFloat((timeOnSiteSeconds * 0.5).toFixed(2));
            timeBasedMetrics.idle_time = parseFloat((timeOnSiteSeconds * 0.5).toFixed(2));
        }
        
        // Рассчитываем страниц в минуту
        const pageCount = sessionData.page_history ? sessionData.page_history.length : 0;
        if (pageCount > 0 && timeOnSiteSeconds > 0) {
            timeBasedMetrics.pages_per_minute = parseFloat(((pageCount / timeOnSiteSeconds) * 60).toFixed(2));
        }
        
        // Сохраняем метрики
        sessionData.ml_features.time_based_metrics = timeBasedMetrics;
        
        // Добавляем улучшенные сигналы интереса
        const existingTypes = sessionData.ml_features.interest_signals.map(s => s.type);
        
        // Функция для добавления сигнала, если его еще нет
        const addSignalIfNotExists = (type, value) => {
            if (!existingTypes.includes(type)) {
                sessionData.ml_features.interest_signals.push({
                    type,
                    value: parseFloat(value.toFixed(2)),
                    timestamp: now
                });
            }
        };
        
        // Добавляем сигналы времени
        addSignalIfNotExists('time_on_site', timeOnSiteSeconds);
        addSignalIfNotExists('active_time_ratio', timeBasedMetrics.active_time / timeOnSiteSeconds);
        
        // Добавляем сигналы активности
        const totalInteractions = sessionData.user_behavior.total_interactions || 0;
        addSignalIfNotExists('interaction_rate', 
            timeOnSiteSeconds > 0 ? (totalInteractions / (timeOnSiteSeconds / 60)) : 0);
        
        // Добавляем сигнал о глубине скролла
        if (sessionData.user_behavior.scroll_depth_percentages) {
            const maxScrollDepth = Math.max(0, 
                ...sessionData.user_behavior.scroll_depth_percentages.map(d => d.depth || 0));
            addSignalIfNotExists('max_scroll_depth', maxScrollDepth);
        }
        
        // Считаем engagement score (оценка вовлеченности)
        calculateEngagementScore();
    }
    
    // Рассчитываем оценку вовлеченности пользователя
    function calculateEngagementScore() {
        // Базовые веса для разных факторов (в сумме 100%)
        const weights = {
            time_factor: 0.25,
            scroll_factor: 0.20,
            click_factor: 0.25,
            form_factor: 0.30
        };
        
        // 1. Фактор времени
        let timeFactor = 0;
        const timeOnSite = sessionData.ml_features.time_based_metrics.time_on_site || 0;
        
        if (timeOnSite < 10) {
            timeFactor = timeOnSite / 10 * 0.3; // До 10 секунд - макс 30%
        } else if (timeOnSite < 30) {
            timeFactor = 0.3 + (timeOnSite - 10) / 20 * 0.3; // 10-30 секунд - до 60%
        } else if (timeOnSite < 120) {
            timeFactor = 0.6 + (timeOnSite - 30) / 90 * 0.3; // 30-120 секунд - до 90%
        } else {
            timeFactor = 0.9 + Math.min((timeOnSite - 120) / 480, 0.1); // Свыше 120 секунд - до 100%
        }
        
        // 2. Фактор скролла
        let scrollFactor = 0;
        const maxScrollDepth = sessionData.ml_features.interest_signals.find(s => s.type === 'max_scroll_depth')?.value || 0;
        
        scrollFactor = Math.min(maxScrollDepth / 100, 1); // Процент прокрутки от 0 до 100%
        
        // 3. Фактор кликов
        let clickFactor = 0;
        const clickCount = sessionData.cta_clicks?.length || 0;
        
        if (clickCount === 0) {
            clickFactor = 0;
        } else if (clickCount === 1) {
            clickFactor = 0.5; // Один клик - 50%
        } else if (clickCount < 5) {
            clickFactor = 0.5 + (clickCount - 1) / 4 * 0.4; // 2-4 клика - до 90%
        } else {
            clickFactor = 0.9 + Math.min((clickCount - 5) / 15, 0.1); // 5+ кликов - до 100%
        }
        
        // 4. Фактор форм
        let formFactor = 0;
        const formInteractions = sessionData.form_interactions?.length || 0;
        
        if (formInteractions === 0) {
            formFactor = 0;
        } else if (formInteractions === 1) {
            formFactor = 0.7; // Одно взаимодействие с формой - 70%
        } else {
            formFactor = 0.7 + Math.min((formInteractions - 1) / 3, 0.3); // 2+ взаимодействий - до 100%
        }
        
        // Рассчитываем общую оценку
        const engagementScore = 
            weights.time_factor * timeFactor + 
            weights.scroll_factor * scrollFactor + 
            weights.click_factor * clickFactor + 
            weights.form_factor * formFactor;
        
        // Нормализуем до 0-100
        sessionData.ml_features.engagement_score = Math.round(engagementScore * 100);
        
        return sessionData.ml_features.engagement_score;
    }
    
    // Обновляем поведенческие признаки
    function updateBehavioralFeatures(timeOnSiteSeconds, now) {
        // Обновляем массив паттернов
        const behaviorPatterns = [];
        
        // 1. Скорость скролла
        const scrollCount = sessionData.scroll_chunks?.length || 0;
        if (timeOnSiteSeconds > 0) {
            const scrollsPerMinute = (scrollCount / timeOnSiteSeconds) * 60;
            behaviorPatterns.push({
                type: 'scroll_speed',
                value: parseFloat(scrollsPerMinute.toFixed(2))
            });
        }
        
        // 2. Частота кликов
        const clickCount = sessionData.cta_clicks?.length || 0;
        if (timeOnSiteSeconds > 0) {
            const clicksPerMinute = (clickCount / timeOnSiteSeconds) * 60;
            behaviorPatterns.push({
                type: 'click_frequency',
                value: parseFloat(clicksPerMinute.toFixed(2))
            });
        }
        
        // 3. Среднее время наведения
        const hoverEvents = sessionData.hover_events || [];
        if (hoverEvents.length > 0) {
            const totalDuration = hoverEvents.reduce((sum, h) => sum + (h.duration || 0), 0);
            const avgDuration = totalDuration / hoverEvents.length;
            behaviorPatterns.push({
                type: 'hover_duration_avg',
                value: parseFloat(avgDuration.toFixed(0))
            });
        }
        
        // 4. Активность взаимодействия с формами
        const formInteractions = sessionData.form_interactions || [];
        if (formInteractions.length > 0 && timeOnSiteSeconds > 0) {
            const formsPerMinute = (formInteractions.length / timeOnSiteSeconds) * 60;
            behaviorPatterns.push({
                type: 'form_interaction_frequency',
                value: parseFloat(formsPerMinute.toFixed(2))
            });
        }
        
        // 5. Анализ навигации между страницами
        const pageHistory = sessionData.page_history || [];
        if (pageHistory.length > 1) {
            const avgTimePerPage = timeOnSiteSeconds / pageHistory.length;
            behaviorPatterns.push({
                type: 'avg_time_per_page',
                value: parseFloat(avgTimePerPage.toFixed(1))
            });
            
            // Разнообразие страниц
            const uniqueUrls = new Set(pageHistory.map(p => p.url)).size;
            const urlDiversity = uniqueUrls / pageHistory.length;
            behaviorPatterns.push({
                type: 'url_diversity',
                value: parseFloat(urlDiversity.toFixed(2))
            });
        }
        
        // 6. Временной узор взаимодействий
        const interactionFrequency = sessionData.user_behavior.interaction_frequency || [];
        if (interactionFrequency.length > 1 && timeOnSiteSeconds > 30) {
            // Распределяем сессию на 3 части и смотрим интенсивность в каждой
            const sessionThird = timeOnSiteSeconds / 3;
            
            const firstThirdCount = interactionFrequency.filter(i => 
                (i.time_from_start / 1000) <= sessionThird).length;
            
            const secondThirdCount = interactionFrequency.filter(i => 
                (i.time_from_start / 1000) > sessionThird && 
                (i.time_from_start / 1000) <= sessionThird * 2).length;
            
            const lastThirdCount = interactionFrequency.filter(i => 
                (i.time_from_start / 1000) > sessionThird * 2).length;
            
            // Определяем паттерн (0 - равномерно, 1 - начало, 2 - середина, 3 - конец)
            let pattern = 0;
            const total = firstThirdCount + secondThirdCount + lastThirdCount;
            
            if (total > 0) {
                const firstRatio = firstThirdCount / total;
                const secondRatio = secondThirdCount / total;
                const lastRatio = lastThirdCount / total;
                
                if (firstRatio > 0.5) {
                    pattern = 1; // Концентрация в начале
                } else if (secondRatio > 0.5) {
                    pattern = 2; // Концентрация в середине
                } else if (lastRatio > 0.5) {
                    pattern = 3; // Концентрация в конце
                }
                
                behaviorPatterns.push({
                    type: 'interaction_time_pattern',
                    value: pattern
                });
            }
        }
        
        // Обновляем паттерны в сессии
        sessionData.ml_features.behavior_patterns = behaviorPatterns;
        
        // Обновляем последовательность событий, если нужно
        updateEventSequence(now);
    }
    
    // Обновляем последовательность важных событий
    function updateEventSequence(now) {
        const eventSequence = sessionData.ml_features.event_sequence || [];
        const lastEventTime = eventSequence.length > 0 ? 
            eventSequence[eventSequence.length - 1].timestamp : 0;
        
        // Добавляем только новые события, произошедшие после последнего обновления
        
        // 1. Новые просмотры страниц
        const pageHistory = sessionData.page_history || [];
        pageHistory.forEach(page => {
            if (page.timestamp > lastEventTime) {
                eventSequence.push({
                    type: 'page_view',
                    url: page.url,
                    timestamp: page.timestamp
                });
            }
        });
        
        // 2. Новые цели Метрики
        const metrikaGoals = sessionData.metrika_goals || [];
        metrikaGoals.forEach(goal => {
            if (goal.timestamp > lastEventTime) {
                eventSequence.push({
                    type: 'goal',
                    name: goal.name,
                    timestamp: goal.timestamp
                });
            }
        });
        
        // 3. Взаимодействия с формами
        const formInteractions = sessionData.form_interactions || [];
        formInteractions.forEach(form => {
            if (form.timestamp > lastEventTime) {
                eventSequence.push({
                    type: 'form',
                    form_id: form.form_id,
                    timestamp: form.timestamp
                });
            }
        });
        
        // 4. Клики по CTA
        const ctaClicks = sessionData.cta_clicks || [];
        ctaClicks.forEach(click => {
            if (click.timestamp > lastEventTime && click.is_cta) {
                eventSequence.push({
                    type: 'cta_click',
                    element: click.element,
                    timestamp: click.timestamp
                });
            }
        });
        
        // Сортируем по времени и сохраняем
        sessionData.ml_features.event_sequence = eventSequence.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    // Обновляем признаки воронки конверсии для e-commerce
    function updateFunnelFeatures() {
        // Базовая структура воронки
        const funnel = {
            page_views: 0,
            category_views: 0,
            product_views: 0,
            cart_interactions: 0,
            checkout_attempts: 0,
            purchase_attempts: 0,
            funnel_depth: 0,
            funnel_step: 'visit' // visit -> category -> product -> cart -> checkout -> purchase
        };
        
        // Анализируем историю страниц
        const pageHistory = sessionData.page_history || [];
        funnel.page_views = pageHistory.length;
        
        // Просмотры категорий и товаров
        pageHistory.forEach(page => {
            const url = page.url.toLowerCase();
            
            if (url.includes('/catalog/') || url.includes('/category/') || url.includes('/collection/')) {
                funnel.category_views++;
            }
            
            if (url.includes('/product/') || url.includes('/item/') || url.includes('/goods/')) {
                funnel.product_views++;
            }
            
            if (url.includes('/cart') || url.includes('/basket') || url.includes('/order/')) {
                funnel.cart_interactions++;
            }
            
            if (url.includes('/checkout') || url.includes('/order/create') || url.includes('/payment')) {
                funnel.checkout_attempts++;
            }
            
            if (url.includes('/order/success') || url.includes('/thank-you') || url.includes('/purchase/complete')) {
                funnel.purchase_attempts++;
            }
        });
        
        // Анализируем клики
        const ctaClicks = sessionData.cta_clicks || [];
        ctaClicks.forEach(click => {
            const element = (click.element || '').toLowerCase();
            
            if (element.includes('add-to-cart') || element.includes('buy') || 
                element.includes('add_to_basket') || element.includes('cart-btn')) {
                funnel.cart_interactions++;
            }
        });
        
        // Анализируем цели Метрики
        const metrikaGoals = sessionData.metrika_goals || [];
        metrikaGoals.forEach(goal => {
            const name = (goal.name || '').toLowerCase();
            
            if (name.includes('add_to_cart') || name.includes('basket')) {
                funnel.cart_interactions++;
            }
            
            if (name.includes('checkout') || name.includes('begin_order')) {
                funnel.checkout_attempts++;
            }
            
            if (name.includes('purchase') || name.includes('order_complete')) {
                funnel.purchase_attempts++;
            }
        });
        
        // Определяем текущий шаг воронки
        if (funnel.purchase_attempts > 0) {
            funnel.funnel_step = 'purchase';
            funnel.funnel_depth = 5;
        } else if (funnel.checkout_attempts > 0) {
            funnel.funnel_step = 'checkout';
            funnel.funnel_depth = 4;
        } else if (funnel.cart_interactions > 0) {
            funnel.funnel_step = 'cart';
            funnel.funnel_depth = 3;
        } else if (funnel.product_views > 0) {
            funnel.funnel_step = 'product';
            funnel.funnel_depth = 2;
        } else if (funnel.category_views > 0) {
            funnel.funnel_step = 'category';
            funnel.funnel_depth = 1;
        } else {
            funnel.funnel_step = 'visit';
            funnel.funnel_depth = 0;
        }
        
        // Сохраняем анализ воронки
        sessionData.ml_features.funnel_analysis = funnel;
    }
    
    // Вычисляем вероятность конверсии на основе признаков
    function calculateConversionProbability() {
        // Получаем все необходимые метрики
        const metrics = {
            engagement: sessionData.ml_features.engagement_score || 0,
            timeOnSite: sessionData.ml_features.time_based_metrics?.time_on_site || 0,
            funnelDepth: sessionData.ml_features.funnel_analysis?.funnel_depth || 0,
            formInteractions: sessionData.form_interactions?.length || 0,
            goalCount: sessionData.metrika_goals?.length || 0,
            interactionRate: sessionData.ml_features.interest_signals.find(s => s.type === 'interaction_rate')?.value || 0
        };
        
        // Базовая вероятность на основе вовлеченности
        let probability = metrics.engagement / 100 * 0.4; // 40% от engagement_score
        
        // Корректируем на основе глубины воронки (до 30%)
        probability += (metrics.funnelDepth / 5) * 0.3;
        
        // Корректируем на основе взаимодействий с формами (до 15%)
        const formFactor = Math.min(metrics.formInteractions, 2) / 2;
        probability += formFactor * 0.15;
        
        // Корректируем на основе времени на сайте (до 10%)
        let timeScore = 0;
        if (metrics.timeOnSite > 0) {
            if (metrics.timeOnSite < 10) {
                timeScore = metrics.timeOnSite / 10 * 0.5; // До 10 секунд - макс 50% от веса
            } else if (metrics.timeOnSite < 30) {
                timeScore = 0.5 + (metrics.timeOnSite - 10) / 20 * 0.3; // 10-30 секунд - до 80%
            } else {
                timeScore = 0.8 + Math.min((metrics.timeOnSite - 30) / 90, 0.2); // Свыше 30 секунд - до 100%
            }
        }
        probability += timeScore * 0.1;
        
        // Корректируем на основе целей (до 5%)
        probability += Math.min(metrics.goalCount, 1) * 0.05;
        
        // Гарантируем, что итоговое значение от 0 до 1
        probability = Math.max(0, Math.min(1, probability));
        
        // Сохраняем вероятность конверсии
        sessionData.ml_features.conversion_probability = parseFloat(probability.toFixed(4));
        
        // Если есть целевые действия, повышаем вероятность
        if (sessionData.ml_features.funnel_analysis.checkout_attempts > 0) {
            sessionData.ml_features.conversion_probability = 
                Math.max(0.85, sessionData.ml_features.conversion_probability);
        }
        
        return sessionData.ml_features.conversion_probability;
    }
    
    // Определяем сегмент пользователя
    function determineUserSegment() {
        // Получаем ключевые метрики
        const probability = sessionData.ml_features.conversion_probability || 0;
        const funnelStep = sessionData.ml_features.funnel_analysis?.funnel_step || 'visit';
        const engagement = sessionData.ml_features.engagement_score || 0;
        const timeOnSite = sessionData.ml_features.time_based_metrics?.time_on_site || 0;
        
        // Определяем сегмент на основе метрик
        let segment = 'unknown';
        
        if (funnelStep === 'purchase' || probability > 0.9) {
            segment = 'buyer';
        } else if (funnelStep === 'checkout' || probability > 0.75) {
            segment = 'ready_to_purchase';
        } else if ((funnelStep === 'cart' || probability > 0.5) && engagement > 50) {
            segment = 'interested_visitor';
        } else if (timeOnSite < 10 && engagement < 20) {
            segment = 'bounced_visitor';
        } else if (funnelStep === 'product' && engagement > 30) {
            segment = 'product_researcher';
        } else if (engagement > 40) {
            segment = 'engaged_visitor';
        } else {
            segment = 'casual_visitor';
        }
        
        // Сохраняем сегмент
        sessionData.ml_features.user_segment = segment;
        
        return segment;
    }
    // ---- End of Enhanced ML Features Function ----

    // Класс, управляющий отправкой данных 
    class DataTransmissionManager {
        constructor(config) {
            this.config = config;
            this.pendingRequests = new Set();
            this.totalRequestsSent = 0;
            this.successfulRequests = 0;
            this.failedRequests = 0;
            this.retryAttempts = 0;
            
            // Настройки отправки по умолчанию
            this.settings = {
                maxRetries: 3,                  // Максимальное количество повторных попыток
                retryDelay: 5000,               // Задержка между повторными попытками (мс)
                exponentialBackoff: true,       // Использовать экспоненциальную задержку
                maxBackoffDelay: 60000,         // Максимальная задержка при экспоненциальном росте (1 минута)
                prioritizeBeaconOnPageHide: true, // Использовать sendBeacon при закрытии страницы
                batchInterval: 2000,            // Интервал батчинга (мс)
                maxBatchSize: 50,               // Максимальный размер батча
                sendImmediatelyFlags: ['conversion', 'goal', 'lead'] // Типы событий, отправляемые сразу
            };
            
            // Поддержка unload/beforeunload для гарантированной отправки данных
            window.addEventListener('beforeunload', this.handlePageHide.bind(this));
            window.addEventListener('pagehide', this.handlePageHide.bind(this));
            window.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
            
            // Проверяем и отправляем сохраненные данные при инициализации
            setTimeout(() => checkAndSendFailedData(), 3000);
            
            // Инициализируем очередь для батчинга
            this.batchQueue = [];
            this.batchTimer = null;
            
            // Статистика для мониторинга
            this.metrics = {
                totalSent: 0,
                successCount: 0,
                failCount: 0,
                retryCount: 0,
                avgSendTime: 0,
                lastSendTime: 0
            };
            
            Logger.info('📡 Инициализирован менеджер отправки данных');
        }
        
        // Отправляет данные с учетом всех настроек надежности
        async send(data, options = {}) {
            const startTime = Date.now();
            
            // Проверяем флаги немедленной отправки
            const eventType = data.event_type || data.type;
            const requiresImmediateSend = options.immediate || 
                (eventType && this.settings.sendImmediatelyFlags.includes(eventType));
            
            // Если не требуется немедленная отправка, добавляем в батч
            if (!requiresImmediateSend && this.settings.batchInterval > 0) {
                return this.addToBatch(data);
            }
            
            // Подготавливаем данные
            const preparedData = this.prepareData(data);
            
            // Создаем уникальный ID для отслеживания этого запроса
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            this.pendingRequests.add(requestId);
            
            try {
                // Добавляем метаданные о попытках
                if (options.retryCount) {
                    preparedData._retry_count = options.retryCount;
                    preparedData._retry_timestamp = Date.now();
                }
                
                Logger.info(`🚀 Отправка данных [${requestId}]${options.retryCount ? ` (попытка: ${options.retryCount})` : ''}`);
                
                // Собственно отправка данных
                const result = await sendDataWithFallback(preparedData);
                
                // Обрабатываем результат
                if (result.success) {
                    this.pendingRequests.delete(requestId);
                    this.successfulRequests++;
                    this.metrics.successCount++;
                    
                    const endTime = Date.now();
                    this.metrics.lastSendTime = endTime - startTime;
                    this.updateAvgSendTime(this.metrics.lastSendTime);
                    
                    Logger.info(`✅ Успешная отправка [${requestId}] за ${this.metrics.lastSendTime}мс`);
                    return result;
                } else if (result.queued) {
                    // Если данные добавлены в очередь, считаем это обработанным
                    this.pendingRequests.delete(requestId);
                    Logger.info(`🔄 Данные добавлены в очередь для повторной отправки [${requestId}]`);
                    return result;
                } else {
                    // Обрабатываем ошибку с возможностью повторной попытки
                    return await this.handleSendError(requestId, preparedData, result, options);
                }
            } catch (error) {
                // Обрабатываем неожиданную ошибку
                return await this.handleSendError(requestId, preparedData, { 
                    error: error.message,
                    success: false
                }, options);
            }
        }
        
        // Обрабатывает ошибки отправки с механизмом повторных попыток
        async handleSendError(requestId, data, result, options = {}) {
            this.failedRequests++;
            this.metrics.failCount++;
            
            const currentRetry = options.retryCount || 0;
            
            // Проверяем, можно ли повторить
            if (currentRetry < this.settings.maxRetries) {
                const retryCount = currentRetry + 1;
                
                // Рассчитываем задержку перед повторной попыткой
                let delay = this.settings.retryDelay;
                
                if (this.settings.exponentialBackoff) {
                    // Экспоненциальная задержка: базовая_задержка * 2^попытка
                    delay = Math.min(
                        this.settings.retryDelay * Math.pow(2, currentRetry),
                        this.settings.maxBackoffDelay
                    );
                }
                
                Logger.info(`🔄 Запланирована повторная отправка [${requestId}] через ${delay}мс (попытка ${retryCount}/${this.settings.maxRetries})`);
                
                // Откладываем повторную отправку
                return new Promise(resolve => {
                    setTimeout(async () => {
                        this.retryAttempts++;
                        this.metrics.retryCount++;
                        
                        // Рекурсивно вызываем send с увеличенным счетчиком попыток
                        const retryResult = await this.send(data, {
                            ...options,
                            retryCount,
                            immediate: true // Повторные попытки всегда отправляются немедленно
                        });
                        
                        resolve(retryResult);
                    }, delay);
                });
            } else {
                // Исчерпаны все попытки - добавляем в очередь для отправки позже
                Logger.warn(`❌ Исчерпаны попытки отправки [${requestId}], добавляем в очередь`);
                
                this.pendingRequests.delete(requestId);
                addToFailedQueue(data);
                
        return {
                    success: false,
                    error: result.error || 'Max retries exceeded',
                    queued: true
                };
            }
        }
        
        // Подготавливает данные для отправки
        prepareData(data) {
            if (!data) return {};

        return {
                ...data,
                sdk_version: this.config.version,
                send_timestamp: Date.now(),
                device_info: data.device_info || getDeviceInfo(),
                client_id: data.client_id || getClientId(),
                session_id: data.session_id || getSessionId()
            };
        }
        
        // Добавляет данные в батч для отправки
        addToBatch(data) {
            this.batchQueue.push(data);
            this.metrics.totalSent++;
            
            Logger.debug(`📦 Добавлены данные в батч (размер очереди: ${this.batchQueue.length})`);
            
            // Если это первый элемент, запускаем таймер
            if (this.batchQueue.length === 1) {
                this.startBatchTimer();
            }
            
            // Если достигли лимита размера батча, отправляем немедленно
            if (this.batchQueue.length >= this.settings.maxBatchSize) {
                this.sendBatch();
            }
            
            return { success: true, batched: true, batch_size: this.batchQueue.length };
        }
        
        // Запускает таймер для отправки батча
        startBatchTimer() {
            if (this.batchTimer) return;
            
            this.batchTimer = setTimeout(() => {
                this.sendBatch();
            }, this.settings.batchInterval);
        }
        
        // Отправляет батч данных
        sendBatch() {
            if (this.batchQueue.length === 0) return;
            
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
            
            const batchData = [...this.batchQueue];
            this.batchQueue = [];
            
            const payload = {
                batch: true,
                batch_size: batchData.length,
                batch_timestamp: Date.now(),
                events: batchData
            };
            
            // Немедленно отправляем батч
            this.send(payload, { immediate: true })
                .catch(error => {
                    Logger.error('❌ Ошибка при отправке батча:', error);
                });
                
            Logger.info(`📦 Отправлен батч из ${batchData.length} событий`);
        }
        
        // Обрабатывает изменение видимости страницы
        handleVisibilityChange() {
            if (document.visibilityState === 'hidden') {
                // Срочно отправляем все накопленные данные
                this.flushAll();
            }
        }
        
        // Обрабатывает закрытие страницы
        handlePageHide() {
            // Принудительно отправляем все данные при закрытии страницы
            this.flushAll(true);
        }
        
        // Отправляет все накопленные данные
        flushAll(isUnloading = false) {
            // Отправляем текущий батч, если он есть
            if (this.batchQueue.length > 0) {
                clearTimeout(this.batchTimer);
                this.batchTimer = null;
                
                const batchData = [...this.batchQueue];
                this.batchQueue = [];
                
                const payload = {
                    batch: true,
                    batch_size: batchData.length,
                    batch_timestamp: Date.now(),
                    events: batchData,
                    is_final: isUnloading
                };
                
                // При закрытии страницы используем только beacon API
                if (isUnloading && navigator.sendBeacon && this.settings.prioritizeBeaconOnPageHide) {
                    try {
                        const blob = new Blob([JSON.stringify(this.prepareData(payload))], { 
                            type: 'application/json' 
                        });
                        navigator.sendBeacon(this.config.apiEndpoint, blob);
                        Logger.info(`📡 Отправлен финальный батч через Beacon API (${batchData.length} событий)`);
                    } catch (error) {
                        Logger.warn(`⚠️ Ошибка отправки через Beacon API:`, error);
                        // Помещаем все данные в localStorage, так как страница закрывается
                        addToFailedQueue(payload);
                    }
                } else {
                    // Обычная отправка
                    this.send(payload, { immediate: true })
                        .catch(error => {
                            Logger.error('❌ Ошибка при отправке финального батча:', error);
                        });
                }
            }
            
            // Также отправляем все данные из очереди неудачных отправок
            if (isUnloading) {
                checkAndSendFailedData(true);
            }
        }
        
        // Обновляет среднее время отправки
        updateAvgSendTime(sendTime) {
            if (this.metrics.avgSendTime === 0) {
                this.metrics.avgSendTime = sendTime;
            } else {
                // Экспоненциальное скользящее среднее с коэффициентом 0.3
                this.metrics.avgSendTime = 0.7 * this.metrics.avgSendTime + 0.3 * sendTime;
            }
        }
        
        // Возвращает статистику отправки
        getMetrics() {
        return {
                ...this.metrics,
                pendingCount: this.pendingRequests.size,
                queueSize: this.batchQueue.length,
                avgSendTime: Math.round(this.metrics.avgSendTime),
                failedQueueSize: getFailedDataQueue().length
            };
        }
    }
    
    // Создаем глобальный экземпляр менеджера
    const transmissionManager = new DataTransmissionManager(config);
    
    // Функция для отправки данных через менеджер (публичный API)
    function sendData(data, options = {}) {
        return transmissionManager.send(data, options);
    }

    // Управление очередью неудачных отправок
    const FAILED_QUEUE_KEY = 'rivox_failed_data_queue';
    const MAX_QUEUE_SIZE = 100; // Максимальное количество сохраняемых запросов
    
    // Возвращает очередь неудавшихся отправок
    function getFailedDataQueue() {
        try {
            const queueStr = localStorage.getItem(FAILED_QUEUE_KEY);
            return queueStr ? JSON.parse(queueStr) : [];
        } catch (error) {
            Logger.error('Ошибка при загрузке очереди данных:', error);
            return [];
        }
    }
    
    // Добавляет данные в очередь неудавшихся отправок
    function addToFailedQueue(data) {
        try {
            const queue = getFailedDataQueue();
            
            // Добавляем метку времени
            const item = {
                data: data,
                timestamp: Date.now(),
                attempts: 0
            };
            
            // Ограничиваем размер очереди
            if (queue.length >= MAX_QUEUE_SIZE) {
                queue.shift(); // Удаляем самые старые данные если достигнут лимит
            }
            
            queue.push(item);
            localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(queue));
            
            Logger.info(`📦 Данные добавлены в очередь для повторной отправки, размер очереди: ${queue.length}`);
            return true;
        } catch (error) {
            Logger.error('Ошибка при добавлении данных в очередь:', error);
            return false;
        }
    }
    
    // Проверяет и отправляет сохраненные данные
    function checkAndSendFailedData(isUnloading = false) {
        try {
            const queue = getFailedDataQueue();
            
            if (queue.length === 0) {
                return false;
            }
            
            Logger.info(`🔄 Попытка отправки ${queue.length} сохраненных запросов из очереди`);
            
            // При закрытии страницы используем только Beacon API
            if (isUnloading && navigator.sendBeacon) {
                try {
                    // Отправляем первые N элементов (ограничение по размеру)
                    const maxItemsToSend = Math.min(queue.length, 20); // Ограничиваем размер для Beacon
                    const itemsToSend = queue.slice(0, maxItemsToSend);
                    
                    const payload = {
                        batch: true,
                        is_retry_batch: true,
                        batch_size: itemsToSend.length,
                        events: itemsToSend.map(item => item.data)
                    };
                    
                    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                    navigator.sendBeacon(config.apiEndpoint, blob);
                    
                    Logger.info(`📡 Отправлено ${itemsToSend.length} сохраненных запросов через Beacon API`);
                } catch (error) {
                    Logger.warn('⚠️ Ошибка при отправке сохраненных данных через Beacon:', error);
                }
                
                return true;
            }
            
            // Обычный режим (не при закрытии страницы)
            // Отправляем до 5 запросов за раз
            const maxRetries = Math.min(queue.length, 5);
            let updatedQueue = [...queue];
            let successCount = 0;
            
            const itemsToSend = updatedQueue.slice(0, maxRetries);
            
            // Отправляем запросы пакетом
            if (itemsToSend.length > 0) {
                const batchPayload = {
                    batch: true,
                    is_retry_batch: true,
                    batch_size: itemsToSend.length,
                    batch_timestamp: Date.now(),
                    events: itemsToSend.map(item => item.data)
                };
                
                sendDataWithFallback(batchPayload)
                    .then(result => {
                        if (result.success) {
                            // Успешно отправлены, удаляем из очереди
                            updatedQueue = updatedQueue.slice(maxRetries);
                            localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(updatedQueue));
                            Logger.info(`✅ Успешно отправлено ${maxRetries} сохраненных запросов из очереди`);
                            
                            // Если остались элементы, запланируем следующую отправку
                            if (updatedQueue.length > 0) {
                                setTimeout(() => checkAndSendFailedData(), 10000);
                            }
                        } else {
                            // Увеличиваем счетчик попыток у отправленных элементов
                            itemsToSend.forEach((item, index) => {
                                updatedQueue[index].attempts = (updatedQueue[index].attempts || 0) + 1;
                                
                                // Если слишком много попыток, удаляем элемент
                                if (updatedQueue[index].attempts >= 10) {
                                    Logger.warn(`❌ Элемент очереди удален после 10 неудачных попыток отправки`);
                                    updatedQueue.splice(index, 1);
                                }
                            });
                            
                            localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(updatedQueue));
                            
                            // Планируем следующую попытку через 30 секунд
                            setTimeout(() => checkAndSendFailedData(), 30000);
                        }
                    })
                    .catch(() => {
                        // Планируем следующую попытку через 60 секунд при ошибке
                        setTimeout(() => checkAndSendFailedData(), 60000);
                    });
            }
            
            return true;
        } catch (error) {
            Logger.error('Ошибка при проверке сохраненных данных:', error);
            return false;
        }
    }
    
    // Улучшенная функция отправки данных с альтернативными методами и обработкой ошибок
    async function sendDataWithFallback(data) {
        // Проверка наличия данных
        if (!data || Object.keys(data).length === 0) {
                return { 
                success: false,
                error: 'No data provided',
                code: 'EMPTY_DATA'
            };
        }
        
        // Подготовка данных для отправки
        const preparedData = {
            ...data,
            event_timestamp: data.event_timestamp || Date.now()
        };
        
        // Проверка размера данных
        const dataStr = JSON.stringify(preparedData);
        const dataSize = new Blob([dataStr]).size;
        
        // Если данные слишком большие, пытаемся отправить по частям
        if (dataSize > 5 * 1024 * 1024) { // 5 МБ
            Logger.warn(`Данные слишком большие (${dataSize / 1024} КБ), разделение на части`);
            return sendLargeDataInSegments(preparedData);
        }
        
        try {
            // Основной метод отправки через fetch API
            const response = await fetch(config.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-SDK-Version': config.version
                },
                body: dataStr,
                credentials: 'include',
                // Включаем keepalive для случаев, когда страница может закрыться
                keepalive: dataSize < 64 * 1024 // Ограничение ~64KB для keepalive
            });
            
            if (response.ok) {
                try {
                    const result = await response.json();
                return { 
                        success: true,
                        response: result,
                        method: 'fetch'
                };
                } catch (e) {
                    // Успешная отправка, но проблема с парсингом ответа
                return { 
                        success: true,
                        method: 'fetch',
                        parseError: true
                    };
                }
            } else {
                // Сервер ответил ошибкой
                const errorText = await response.text();
                const errorInfo = {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                };
                
                Logger.warn(`Ошибка сервера при отправке: ${response.status}`, errorInfo);
                
                // Проверяем, стоит ли повторить попытку
                if (response.status >= 500 || response.status === 429) {
                    // 5xx - ошибка сервера, 429 - слишком много запросов
                    // Для этих ошибок имеет смысл повторить попытку
                return { 
                        success: false,
                        retry: true,
                        error: `Server error: ${response.status}`,
                        serverError: errorInfo,
                        code: 'SERVER_ERROR',
                        method: 'fetch'
                    };
                } else {
                    // 4xx - Клиентская ошибка, кроме 429
                    // Нет смысла повторять попытку для таких ошибок
                return { 
                        success: false,
                        retry: false,
                        error: `Client error: ${response.status}`,
                        serverError: errorInfo,
                        code: 'CLIENT_ERROR',
                        method: 'fetch'
                    };
                }
            }
        } catch (error) {
            // Ошибка при выполнении fetch (сетевая ошибка)
            Logger.warn(`Ошибка сети при отправке через fetch: ${error.message}`);
            
            // Пробуем отправить через Beacon API
            if (navigator.sendBeacon && dataSize < 64 * 1024) { // Ограничение размера для Beacon
                try {
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const beaconSent = navigator.sendBeacon(config.apiEndpoint, blob);
                    
                    if (beaconSent) {
                        Logger.info('Данные успешно отправлены через Beacon API');
                        return { 
                            success: true,
                            method: 'beacon'
                        };
                    } else {
                        Logger.warn('Beacon API не смог отправить данные');
                    }
                } catch (beaconError) {
                    Logger.warn(`Ошибка при отправке через Beacon API: ${beaconError.message}`);
                }
            }
            
            // Для очень маленьких данных можно попробовать JSONP как последний вариант
            if (dataSize < 1000 && typeof preparedData.event === 'string') {
                try {
                    const result = await sendViaJSONP(preparedData, config.apiEndpoint);
                    if (result.success) {
                        return {
                            success: true,
                            method: 'jsonp',
                            response: result.data
                        };
                    }
                } catch (jsonpError) {
                    Logger.warn(`Ошибка при отправке через JSONP: ${jsonpError.message}`);
                }
            }
            
            // Все методы отправки не удались, добавляем в очередь
            const queued = addToFailedQueue(preparedData);
            
            return { 
                success: false,
                error: error.message,
                code: 'NETWORK_ERROR',
                queued: queued,
                retry: true
            };
        }
    }
    
    // Отправка больших данных по частям
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
})(window); 
