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

function getYandexCounterId() {
    if (window.ymCounterId) return window.ymCounterId;
    
    const counterObjects = Object.keys(window).filter(key => key.startsWith('yaCounter'));
    return counterObjects.length > 0 ? counterObjects[0].replace('yaCounter', '') : null;
}

(function(window) {
    'use strict';

    const SDK_VERSION = '4.6.3';
    
    // Configuration
    const config = {
        endpoint: 'https://script.google.com/macros/s/AKfycbyEhRvGnzup0KiZCpvZkw_e0Sl5vCImBMEmQjH5omz96qmlYlXhxmqupKBHsXSIKtnW/exec',
        debug: true,
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
        scrollChunkSize: 100,
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
        sendDelay: 300000, // Send data every 5 minutes
        retryDelay: 60000, // Retry failed requests every minute
        maxRetries: 3,
        maxQueueSize: 10
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

    // Update last activity time
    function updateActivity() {
        const now = Date.now();
        const timeSinceLastActivity = now - lastActivityTime;
        
        // If session was inactive and now active again
        if (timeSinceLastActivity > config.maxInactiveTime) {
            console.log('Session reactivated after inactivity');
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
        console.log('New session started:', sessionData.session_id);
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
    function sendQueuedData() {
        if (queuedData.length === 0) return;

        const dataToSend = queuedData;
        queuedData = [];

        sendDataJSONP(dataToSend).catch(error => {
            console.error('Failed to send queued data:', error);
            // Return failed items to queue
            queuedData = [...dataToSend, ...queuedData];
        });
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
            console.log('Checking domain:', {
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
            console.log('Using endpoint:', config.endpoint);
        }
        return config.endpoint;
    }

    // Load configuration from script data attributes
    function loadConfig() {
        const script = document.querySelector('script[data-token]');
        if (!script) {
            console.error('RIVOX SDK script tag with data-token not found');
            return null;
        }

        // Get token
        const token = script.dataset.token;
        if (!token) {
            console.error('RIVOX SDK token not specified');
            return null;
        }

        // Get optional delays
        const initDelay = parseInt(script.dataset.initDelay) || config.initDelay;
        const sendDelay = parseInt(script.dataset.sendDelay) || config.sendDelay;

        if (config.debug) {
            console.log('RIVOX SDK Configuration:', {
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

    // Initialize SDK
    async function init() {
        const currentDomain = window.location.hostname;
        if (!isAllowedDomain(currentDomain)) {
            console.warn(`Domain ${currentDomain} not found in the list of allowed domains`);
            return;
        }
        
        console.log('RIVOX SDK initializing...');
        
        // Load configuration
        const userConfig = loadConfig();
        if (!userConfig) return;

        // Wait for client id before proceeding
        const clientId = await generateClientId();
        if (!clientId) {
            console.error('Could not initialize RIVOX SDK: Failed to get Yandex.Metrika client ID');
            return;
        }

        console.log('RIVOX SDK initialized with client ID:', clientId);

        // Initialize session data
        sessionData = {
            client_id: clientId,
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
        setupEventListeners();

        // Start activity tracking
        document.addEventListener('mousemove', updateActivity);
        document.addEventListener('keydown', updateActivity);
        document.addEventListener('scroll', updateActivity);
        document.addEventListener('click', updateActivity);

        // Start trackers with configured delay
        setTimeout(() => {
            if (typeof RIVOX.start === 'function') {
                console.log("🟢 RIVOX tracking start");
                RIVOX.start();
            }
        }, userConfig.initDelay);

        // Set up periodic data sending
        startPeriodicSending();

        // Set up session timeout check
        setInterval(() => {
            const inactiveTime = Date.now() - lastActivityTime;
            if (inactiveTime > config.sessionTimeout) {
                console.log("⏹️ Session timeout due to inactivity");
                isSessionActive = false;
                sendSessionSummary();
            }
        }, 60000); // Check every minute
    }

    // Enhanced event listeners setup
    function setupEventListeners() {
        console.log('Setting up event listeners...');
        
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
                
                console.log('Scroll event captured:', {
                    position: currentScrollY,
                    delta: scrollDelta,
                    percent: scrollPercent.toFixed(2) + '%'
                });
                
                sessionData.scroll_chunks.push({
                    timestamp: Date.now(),
                    position: currentScrollY,
                    delta: scrollDelta,
                    viewport_height: viewportHeight,
                    document_height: documentHeight,
                    percent: scrollPercent
                });

                // Update scroll depth percentages
                if (!sessionData.user_behavior.scroll_depth_percentages) {
                    sessionData.user_behavior.scroll_depth_percentages = [];
                }
                sessionData.user_behavior.scroll_depth_percentages.push({
                    depth: scrollPercent,
                    timestamp: Date.now()
                });
                
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
                console.log('Max scroll depth:', maxScrollPercent.toFixed(2) + '%');
            }, 1000);
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
                
                console.log('Hover event started:', {
                    element: getElementPath(target)
                });
            }
        }, 100));

        document.addEventListener('mouseout', throttle((e) => {
            updateActivity();
            const target = e.target;
            if (isImportantElement(target) && hoverStartTime && target === hoveredElement) {
                const hoverDuration = Date.now() - hoverStartTime;
                
                console.log('Hover event completed:', {
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
            const target = e.target;
            const clickData = {
                timestamp: Date.now(),
                element: getElementPath(target),
                position: {
                    x: e.clientX,
                    y: e.clientY
                },
                is_cta: isCTAElement(target)
            };

            console.log('Click event captured:', clickData);
            
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
        });

        console.log('Event listeners setup complete');
    }

    // Send data using JSONP
    function sendDataJSONP(data) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const callbackName = 'rivox_callback_' + Date.now();
            
            window[callbackName] = function(response) {
                delete window[callbackName];
                document.body.removeChild(script);
                resolve(response);
            };

            script.onerror = () => {
                delete window[callbackName];
                document.body.removeChild(script);
                reject(new Error('JSONP request failed'));
            };

            const params = new URLSearchParams({
                callback: callbackName,
                data: JSON.stringify(data)
            });

            script.src = `${config.endpoint}?${params.toString()}`;
            document.body.appendChild(script);

            // Set timeout
            setTimeout(() => {
                if (window[callbackName]) {
                    delete window[callbackName];
                    document.body.removeChild(script);
                    reject(new Error('JSONP request timeout'));
                }
            }, 10000);
        });
    }

    // Modify sendSessionSummary to use queueing
    async function sendSessionSummary() {
        if (!sessionData) return;

        const summary = {
            ...sessionData,
            session_duration: getSessionDuration(),
            domain: window.location.hostname,
            path: window.location.pathname,
            timestamp: new Date().toISOString(),
            sdk_version: SDK_VERSION
        };

        try {
            await sendDataWithFallback(summary);
        } catch (error) {
            Logger.warn('Adding failed request to retry queue');
            addToFailedQueue(summary);
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
            // First try to get from backup
            const backupId = localStorage.getItem('_ym_client_id_backup');
            if (backupId) {
                console.log('Using backed up Yandex.Metrika client ID:', backupId);
                resolve(backupId);
                return;
            }

            // Then try to get from Yandex.Metrika cookies
            const ymUid = getCookie('_ym_uid');
            if (ymUid) {
                console.log('Using Yandex.Metrika cookie ID:', ymUid);
                try {
                    localStorage.setItem('_ym_client_id_backup', ymUid);
                } catch (e) {
                    console.warn('Could not save client ID to localStorage:', e);
                }
                resolve(ymUid);
                return;
            }

            // Finally try to get directly from Metrika
            const getFromMetrika = (attempts = 0, maxAttempts = 5) => {
                if (attempts >= maxAttempts) {
                    console.error('Failed to get Yandex.Metrika client ID after', maxAttempts, 'attempts');
                    resolve(null);
                    return;
                }

                // Get counter id
                let counterId = null;
                
                // Try different methods to get counter ID
                if (window.ymCounterId) {
                    counterId = window.ymCounterId;
                } else {
                    const counterObjects = Object.keys(window).filter(key => key.startsWith('yaCounter'));
                    if (counterObjects.length > 0) {
                        counterId = counterObjects[0].replace('yaCounter', '');
                    }
                }

                if (!counterId) {
                    console.log('Counter ID not found, retrying...');
                    setTimeout(() => getFromMetrika(attempts + 1), 1000);
                    return;
                }

                // Try to get client ID
                try {
                    ym(counterId, 'getClientID', function(clientID) {
                        if (clientID) {
                            console.log('Got client ID from Yandex.Metrika:', clientID);
                            try {
                                localStorage.setItem('_ym_client_id_backup', clientID);
                            } catch (e) {
                                console.warn('Could not save client ID to localStorage:', e);
                            }
                            resolve(clientID);
                        } else {
                            console.log('No client ID returned, retrying...');
                            setTimeout(() => getFromMetrika(attempts + 1), 1000);
                        }
                    });
                } catch (e) {
                    console.error('Error getting client ID:', e);
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
        
        return element.tagName === 'A' || 
               element.tagName === 'BUTTON' || 
               element.tagName === 'INPUT' ||
               (element.hasAttribute && element.hasAttribute('data-rivox-important'));
    }

    function isCTAElement(element) {
        if (!element) return false;
        
        return element.tagName === 'A' || 
               element.tagName === 'BUTTON' || 
               element.tagName === 'INPUT' ||
               (element.hasAttribute && element.hasAttribute('data-rivox-cta'));
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
            console.error('Failed to detect Yandex.Metrika after', maxAttempts, 'attempts');
            return;
        }

        if (typeof ym === 'undefined' && typeof Ya === 'undefined' && !window.yaCounter) {
            setTimeout(() => waitForYaMetrika(attempts + 1), 500);
            return;
        }

        // Initialize SDK only after Metrika is detected
        init().catch(error => {
            console.error('Failed to initialize RIVOX SDK:', error);
        });
    })();

    // Logger utility with improved formatting
    const Logger = {
        log: function(msg, data) {
            if (config.debug) {
                console.log(`rivox.js: ${msg}`, data || '');
            }
        },
        error: function(msg, error) {
            if (config.debug) {
                console.error(`rivox.js: ❌ ${msg}`, error || '');
            }
        },
        warn: function(msg, data) {
            if (config.debug) {
                console.warn(`rivox.js: ⚠️ ${msg}`, data || '');
            }
        },
        success: function(msg, data) {
            if (config.debug) {
                console.log(`rivox.js: ✅ ${msg}`, data || '');
            }
        }
    };

    // Auto-initialize after DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(window.RIVOX.init, config.initDelay);
    });

    Logger.success('SDK loaded successfully');

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

        const item = failedQueue[0]; // Get first item but don't remove yet
        
        if (item.attempts >= config.maxRetries) {
            Logger.warn(`Dropping data after ${config.maxRetries} failed attempts`, item.data);
            failedQueue.shift();
            return;
        }

        try {
            await sendDataWithFallback(item.data);
            failedQueue.shift(); // Remove only after successful send
            Logger.success('Successfully sent queued data');
        } catch (error) {
            item.attempts++;
            Logger.warn(`Retry attempt ${item.attempts} failed`, error);
        }
    }

    async function sendDataWithFallback(data) {
        try {
            // First try JSONP
            Logger.log('Attempting JSONP request...');
            await sendDataJSONP(data);
            Logger.success('Data sent via JSONP');
            return;
        } catch (error) {
            Logger.warn('JSONP failed, trying beacon API...', error);
        }

        // Try beacon API
        if (navigator.sendBeacon) {
            try {
                const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
                const success = navigator.sendBeacon(config.endpoint, blob);
                if (success) {
                    Logger.success('Data sent via beacon API');
                    return;
                }
            } catch (error) {
                Logger.warn('Beacon API failed', error);
            }
        }

        // If both methods fail, throw error to trigger queue
        throw new Error('All send methods failed');
    }
})(window); 
