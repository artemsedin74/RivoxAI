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
        scrollChunkSize: 50, // уменьшаем с 100 до 50 пикселей
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
        allowedDomains: ['spb.sotovik.shop', 'www.spb.sotovik.shop'],
        initDelay: 300,
        sendDelay: 300000, // 5 минут
        retryDelay: 120000, // 2 минуты
        maxRetries: 3,
        maxQueueSize: 10,
        deduplicationWindow: 60000 // 1 минута
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

    // Update last activity time
    function updateActivity() {
        const now = Date.now();
        const timeSinceLastActivity = now - lastActivityTime;
        
        // If session was inactive and now active again
        if (timeSinceLastActivity > config.maxInactiveTime) {
            Logger.info('Session reactivated after inactivity');
            startNewSession();
            return;
        }

        lastActivityTime = now;
        if (sessionData) {
            sessionData.last_activity = now;
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
        
        // Проверяем домен
        const isAllowed = config.allowedDomains.some(domain => {
            const normalizedDomain = domain.replace(/^www\./, '');
            return normalizedHostname === normalizedDomain;
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
            Logger.warn(`Domain ${currentDomain} not found in the list of allowed domains`);
            return;
        }
        
        Logger.info('RIVOX SDK initializing...');
        
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
        sessionData = loadSessionFromStorage() || createSessionData(clientId);
        
        if (!loadSessionFromStorage()) {
            // This is a new session
            isSessionActive = true;
            setupEventListeners();
            saveSessionToStorage();
        } else {
            // Update existing session
            sessionData.page_history.push({
                timestamp: Date.now(),
                url: window.location.href,
                referrer: document.referrer,
                time_spent: 0
            });
            isSessionActive = true;
            setupEventListeners();
            saveSessionToStorage();
        }

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
        }, 60000); // Check every minute

        setupMetrikaTracking();

        Logger.info('✅ RIVOX SDK initialization completed');
    }

    // Enhanced event listeners setup
    function setupEventListeners() {
        Logger.info('Setting up event listeners...');
        
        // Scroll tracking with heatmap
        let lastScrollY = window.scrollY;
        let scrollTimeout;
        
        window.addEventListener('scroll', throttle(() => {
            updateActivity();
            const currentScrollY = window.scrollY;
            const scrollDelta = Math.abs(currentScrollY - lastScrollY);
            
            if (scrollDelta >= config.scrollChunkSize) {
                const documentHeight = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                );
                const viewportHeight = window.innerHeight;
                const scrollPercent = (currentScrollY / (documentHeight - viewportHeight)) * 100;
                
                Logger.debug('Scroll event:', {
                    position: currentScrollY,
                    delta: scrollDelta,
                    percent: scrollPercent.toFixed(2) + '%'
                });
                
                // Ensure arrays exist
                if (!sessionData.scroll_chunks) {
                    sessionData.scroll_chunks = [];
                }
                if (!sessionData.user_behavior.scroll_depth_percentages) {
                    sessionData.user_behavior.scroll_depth_percentages = [];
                }
                
                // Add scroll data
                sessionData.scroll_chunks.push({
                    timestamp: Date.now(),
                    position: currentScrollY,
                    delta: scrollDelta,
                    viewport_height: viewportHeight,
                    document_height: documentHeight,
                    percent: scrollPercent
                });

                // Update scroll depth percentages
                sessionData.user_behavior.scroll_depth_percentages.push({
                    depth: scrollPercent,
                    timestamp: Date.now()
                });
                
                // Update max scroll depth
                sessionData.scroll_depth_max = Math.max(
                    sessionData.scroll_depth_max || 0,
                    scrollPercent
                );
                
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

            const clickData = {
                        timestamp: Date.now(),
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
                is_cta: isCTAElement(clickTarget)
            };

            Logger.debug('🖱️ Click event captured:', clickData);
            
            sessionData.cta_clicks.push(clickData);
            sessionData.user_behavior.total_interactions++;
            
            if (!sessionData.user_behavior.time_to_first_interaction) {
                sessionData.user_behavior.time_to_first_interaction = Date.now() - sessionData.start_time;
            }

            // Update time between clicks
            if (!sessionData.user_behavior.time_between_clicks) {
                sessionData.user_behavior.time_between_clicks = [];
            }
            const lastClick = sessionData.user_behavior.time_between_clicks[
                sessionData.user_behavior.time_between_clicks.length - 1
            ];
            if (lastClick) {
                sessionData.user_behavior.time_between_clicks.push({
                        timestamp: Date.now(),
                    delta: Date.now() - lastClick.timestamp
                });
            } else {
                sessionData.user_behavior.time_between_clicks.push({
                    timestamp: Date.now(),
                    delta: 0
                });
            }

            // Проверяем условия отправки вместо немедленной отправки
            if (shouldSendData()) {
                Logger.info('Accumulated enough events, sending data');
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

        Logger.info('📤 Preparing to send session data...');
        
        // Проверяем наличие целей
        const hasGoals = sessionData.metrika_goals && sessionData.metrika_goals.length > 0;
        if (hasGoals) {
            Logger.info(`✅ Found ${sessionData.metrika_goals.length} goals in session data`);
        } else {
            Logger.info('ℹ️ No goals found in session data');
        }
        
        const summary = {
            client_id: sessionData.client_id,
            session_id: sessionData.session_id,
            goals_count: sessionData.metrika_goals?.length || 0,
            goals: sessionData.metrika_goals || [],
            conversion_data: sessionData.conversion_data || {}
        };
        
        Logger.info('📦 Data to be sent:', summary);
        return sendDataWithFallback(summary);
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
        config
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

    function addToFailedQueue(data) {
        if (failedQueue.length >= config.maxQueueSize) {
            failedQueue.shift(); // Remove oldest item if queue is full
        }
        failedQueue.push({
            data,
            attempts: 0,
            timestamp: Date.now()
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
            Logger.warn(`Dropping data after ${config.maxRetries} failed attempts`, item.data);
            failedQueue.shift();
            return;
        }

        try {
            await sendDataWithFallback(item.data);
            failedQueue.shift();
            Logger.info('Successfully sent queued data');
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
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second
        let lastError = null;

        // Попытка отправки через POST с экспоненциальной задержкой
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                if (attempt > 1) {
                    Logger.info(`⏳ Waiting ${delay}ms before retry ${attempt}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const response = await fetch(config.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.token}`
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Server error: ${response.status} - ${errorText}`);
                }

                Logger.info('✅ Data sent successfully via POST');
                return { success: true };
            } catch (error) {
                lastError = error;
                Logger.error(`❌ POST attempt ${attempt}/${maxRetries} failed:`, error.message);
                
                // Если это последняя попытка, пробуем альтернативные методы
                if (attempt === maxRetries) {
                    // Пробуем GET запрос
                    try {
                        const params = new URLSearchParams();
                        Object.entries(data).forEach(([key, value]) => {
                            params.append(key, JSON.stringify(value));
                        });

                        const getResponse = await fetch(`${config.endpoint}?${params.toString()}`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${config.token}`
                            }
                        });

                        if (!getResponse.ok) {
                            throw new Error(`GET request failed: ${getResponse.status}`);
                        }

                        Logger.info('✅ Data sent successfully via GET');
                        return { success: true };
                    } catch (getError) {
                        Logger.error('❌ GET request failed:', getError.message);
                        
                        // Пробуем beacon API
                        if (navigator.sendBeacon) {
                            try {
                                const blob = new Blob([JSON.stringify(data)], {
                                    type: 'application/json'
                                });
                                
                                if (navigator.sendBeacon(config.endpoint, blob)) {
                                    Logger.info('✅ Data sent via beacon API');
                                    return { success: true };
                                }
                            } catch (beaconError) {
                                Logger.error('❌ Beacon API failed:', beaconError.message);
                            }
                        }
                        
                        // Если все методы не сработали, сохраняем в localStorage
                        try {
                            const storedData = localStorage.getItem('rivox_pending_data') || '[]';
                            const pendingData = JSON.parse(storedData);
                            pendingData.push({
                                ...data,
                                timestamp: Date.now(),
                                retryCount: 0,
                                lastError: lastError.message
                            });
                            localStorage.setItem('rivox_pending_data', JSON.stringify(pendingData));
                            
                            Logger.info('✅ Data stored in localStorage for later sending');
                            return { success: true };
                        } catch (storageError) {
                            Logger.error('❌ Failed to store data in localStorage:', storageError.message);
                            throw new Error('All sending methods failed');
                        }
                    }
                }
            }
        }
    }

    function shouldSendData() {
        if (!sessionData) return false;
        
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

    // Yandex.Metrika goal tracking
    function setupMetrikaTracking(attempts = 0, maxAttempts = 5) {
        try {
            if (window.ym && window.ym.getCounterId) {
                const counterId = window.ym.getCounterId();
                if (counterId) {
                    Logger.info(`✅ Found Metrika counter: ${counterId}`);
                    
                    // Сохраняем оригинальную функцию
                    const originalReachGoal = window.ym.reachGoal;
                    
                    // Переопределяем reachGoal
                    window.ym.reachGoal = function(goalName, params) {
                        // Проверяем, не была ли цель уже отправлена
                        const goalKey = `${goalName}_${JSON.stringify(params || {})}`;
                        if (!sessionData.sentGoals || !sessionData.sentGoals[goalKey]) {
                            Logger.info(`🎯 New goal intercepted: ${goalName}`, params || {});
                            
                            // Добавляем цель в сессию
                            addGoalToSession({
                                name: goalName,
                                params: params || {},
                                timestamp: Date.now()
                            });
                            
                            // Отмечаем цель как отправленную
                            if (!sessionData.sentGoals) {
                                sessionData.sentGoals = {};
                            }
                            sessionData.sentGoals[goalKey] = true;
                            
                            // Отправляем данные сразу при достижении цели
                            sendDataGuaranteed('goal_reached');
                        } else {
                            Logger.info(`ℹ️ Duplicate goal skipped: ${goalName}`);
                        }
                        
                        // Вызываем оригинальную функцию
                        return originalReachGoal.apply(this, arguments);
                    };
                    
                    Logger.info('✅ Metrika tracking setup completed');
                    return true;
                }
            }
            
            if (attempts < maxAttempts) {
                Logger.info(`⏳ Counter ID not found, retrying in 1s (attempt ${attempts + 1}/${maxAttempts})`);
                setTimeout(() => setupMetrikaTracking(attempts + 1, maxAttempts), 1000);
                return false;
            }
            
            Logger.error('❌ Failed to setup Metrika tracking after max attempts');
            return false;
        } catch (error) {
            Logger.error('❌ Error setting up Metrika tracking:', error);
            return false;
        }
    }

    function addGoalToSession(goalData) {
        try {
            if (!sessionData.metrika_goals) {
                sessionData.metrika_goals = [];
            }
            
            // Проверяем на дубликаты
            const isDuplicate = sessionData.metrika_goals.some(goal => 
                goal.name === goalData.name && 
                JSON.stringify(goal.params) === JSON.stringify(goalData.params)
            );
            
            if (!isDuplicate) {
                sessionData.metrika_goals.push(goalData);
                Logger.info(`✅ Goal added to session: ${goalData.name}`);
                return true;
            } else {
                Logger.info(`ℹ️ Duplicate goal skipped: ${goalData.name}`);
                return false;
            }
        } catch (error) {
            Logger.error('❌ Error adding goal to session:', error);
            return false;
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
        return {
            client_id: clientId,
            client_token: config.token,
            session_id: generateSessionId(),
            start_time: Date.now(),
            last_activity: Date.now(),
            page_history: [{
                timestamp: Date.now(),
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

            // Update time spent on current page
            const currentPage = sessionData.page_history[sessionData.page_history.length - 1];
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
                total_session_duration: Date.now() - sessionData.start_time
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
                    localStorage.removeItem('rivox_current_session');
                    resolve();
                })
                .catch(error => {
                    Logger.error(`Failed to send data (${reason}):`, error);
                    // Save to localStorage as backup
                    saveSessionToStorage();
                    reject(error);
                });
        });
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
        const timeOnSite = now - sessionData.start_time;
        
        // Добавляем новые признаки только если они не существуют
        if (!sessionData.ml_features.interest_signals) {
            sessionData.ml_features.interest_signals = [];
        }
        
        // Добавляем новые признаки с проверкой на существование
        const newSignals = [
            {
                type: 'time_on_site',
                value: parseFloat((timeOnSite / 1000).toFixed(2)),
                timestamp: now
            },
            {
                type: 'scroll_depth',
                value: sessionData.user_behavior.scroll_depth_percentages ? 
                    Math.max(0, ...sessionData.user_behavior.scroll_depth_percentages.map(d => d.depth)) : 0,
                timestamp: now
            },
            {
                type: 'interaction_rate',
                value: parseFloat((sessionData.user_behavior.total_interactions / (timeOnSite / 60000)).toFixed(2)),
                timestamp: now
            }
        ];
        
        // Добавляем только новые сигналы
        newSignals.forEach(signal => {
            if (!sessionData.ml_features.interest_signals.some(s => s.type === signal.type)) {
                sessionData.ml_features.interest_signals.push(signal);
            }
        });

        // Обновляем паттерны поведения
        if (!sessionData.ml_features.behavior_patterns) {
            sessionData.ml_features.behavior_patterns = [];
        }

        // Рассчитываем среднюю длительность наведения
        const totalHoverDuration = sessionData.hover_events.reduce((sum, h) => sum + h.duration, 0);
        const avgHoverDuration = totalHoverDuration / (sessionData.hover_events.length || 1);

        // Обновляем паттерны
        sessionData.ml_features.behavior_patterns = [
            {
                type: 'scroll_speed',
                value: parseFloat((sessionData.scroll_chunks.length / (timeOnSite / 60000)).toFixed(2))
            },
            {
                type: 'click_frequency',
                value: parseFloat((sessionData.cta_clicks.length / (timeOnSite / 60000)).toFixed(2))
            },
            {
                type: 'hover_duration_avg',
                value: parseFloat(avgHoverDuration.toFixed(0))
            }
        ];

        // Обновляем анализ воронки
        if (!sessionData.ml_features.funnel_analysis) {
            sessionData.ml_features.funnel_analysis = {};
        }

        sessionData.ml_features.funnel_analysis = {
            page_views: sessionData.page_views?.length || 0,
            product_views: sessionData.page_views?.filter(p => 
                p.url.includes('/catalog/') || p.url.includes('/product/')
            ).length || 0,
            cart_interactions: sessionData.cta_clicks.filter(c => 
                c.element && (
                    c.element.toLowerCase().includes('cart') || 
                    c.element.toLowerCase().includes('basket') ||
                    c.element.toLowerCase().includes('add_to_cart')
                )
            ).length,
            checkout_attempts: sessionData.metrika_goals.filter(g => 
                g.name && (
                    g.name.toLowerCase().includes('checkout') || 
                    g.name.toLowerCase().includes('order') ||
                    g.name.toLowerCase().includes('purchase')
                )
            ).length
        };
    }
    // ---- End of New ML Features Function ----

    async function sendData(data) {
        if (!config.token) {
            Logger.error('❌ Token not configured');
            return;
        }

        try {
            const result = await sendDataWithFallback(data);
            if (result.success) {
                Logger.info('✅ Data sent successfully');
                return;
            }
        } catch (error) {
            Logger.error('❌ All sending methods failed:', error);
            
            // Сохраняем данные для повторной отправки
            const failedData = {
                ...data,
                timestamp: Date.now(),
                error: error.message
            };
            
            const failedDataStr = JSON.stringify(failedData);
            localStorage.setItem('rivox_failed_data', failedDataStr);
            
            // Планируем повторную отправку
            setTimeout(() => {
                const storedData = localStorage.getItem('rivox_failed_data');
                if (storedData) {
                    try {
                        const parsedData = JSON.parse(storedData);
                        sendData(parsedData);
                        localStorage.removeItem('rivox_failed_data');
                    } catch (e) {
                        Logger.error('❌ Failed to retry sending data:', e);
                    }
                }
            }, 5000); // Повторная попытка через 5 секунд
        }
    }
})(window); 
