/**
 * RIVOX SDK - Client-side tracking and analytics
 * Version: 4.6.3 (Fixed)
 */

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
        apiEndpoint: 'https://rivox-data-handler-779203791697.europe-central2.run.app', // Добавлено для совместимости
        version: SDK_VERSION, // Добавлено для совместимости с X-SDK-Version
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
            const response = await fetch(config.endpoint, { // Исправлено: используем endpoint вместо apiEndpoint
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-SDK-Version': config.version,
                    'X-Compression': 'false'
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
                    const beaconSent = navigator.sendBeacon(config.endpoint, blob); // Исправлено: используем endpoint вместо apiEndpoint
                    
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
                    const result = await sendViaJSONP(preparedData, config.endpoint); // Исправлено: используем endpoint вместо apiEndpoint
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
    
    /* API для отправки данных */
    
    // Expose public API
    window.RIVOX = {
        init,
        sendSessionSummary,
        getSessionData: () => sessionData,
        config,
        sendDataGuaranteed,
        getSessionData: () => sessionData
    };
    
    // Гарантированная отправка данных
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

            // Prepare complete session summary
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

            // Add Duplicate Check
            if (isDuplicate(summary)) {
                Logger.info(`Duplicate data detected, skipping send (${reason})`);
                resolve(); // Resolve successfully as we don't need to send
                return;
            }

            // Try to send data
            sendDataWithFallback(summary)
                .then(() => {
                    Logger.info(`✅ Данные успешно отправлены (${reason})`);
                    
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

    // Add beforeunload handler
    window.addEventListener('beforeunload', () => {
        sendDataGuaranteed('page_close');
    });

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

})(window); 
