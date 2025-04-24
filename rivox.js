/**
 * RIVOX SDK - Client-side tracking and analytics
 * Version: 4.6.3
 */
// RIVOX SDK v4.6.3
// Enhanced version with ML data collection capabilities

// Add debug helper function
function dbg(...a){ 
  if (window.RIVOX_DEBUG || localStorage.RIVOX_DEBUG==='1')
    console.debug(...a); 
}

// Глобальная переменная для предотвращения рекурсивных вызовов логирования
let isLogging = false;
// Глобальная переменная для хранения очереди данных для повторной отправки
let dataQueue = [];
// Флаг обработки очереди данных
let isProcessingQueue = false;

// Специальная функция логирования для проблемного клиента
function sotovikDebugLog(level, message, data) {
  if (window.location.hostname.includes('sotovik')) {
    const logPrefix = `[SOTOVIK ${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(logPrefix, message, data);
    } else {
      console.debug(logPrefix, message, data);
    }
    
    // Сохраняем логи в localStorage для отладки
    try {
      const logs = JSON.parse(localStorage.getItem('rivox_debug_logs') || '[]');
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        data: typeof data === 'object' ? JSON.stringify(data) : data
      });
      // Ограничиваем количество логов
      if (logs.length > 100) logs.shift();
      localStorage.setItem('rivox_debug_logs', JSON.stringify(logs));
    } catch (e) {
      // Игнорируем ошибки при записи в localStorage
    }
  }
}

// Функция для базового логирования (без рекурсии)
function logEvent(eventName, payload = {}) {
  try {
    // Предотвращаем рекурсию
    if (isLogging) return;
    isLogging = true;
    
    // Отладка для проблемного клиента
    const isProblematicClient = window.location.hostname.includes('sotovik');
    if (isProblematicClient) {
      sotovikDebugLog('info', 'logEvent called with:', {
        eventName,
        payloadType: typeof payload,
        payloadKeys: payload ? Object.keys(payload) : null
      });
    }
    
    // Валидация eventName
    if (!eventName || typeof eventName !== 'string') {
      console.error('Invalid event name:', { eventName });
      isLogging = false;
      return;
    }
    
    // Валидация и безопасная обработка payload
    let safePayload = {};
    if (payload && typeof payload === 'object') {
      try {
        // Проверяем, содержит ли payload проблемные значения
        Object.keys(payload).forEach(key => {
          const value = payload[key];
          if (value === undefined || value === null) {
            // Заменяем null/undefined на безопасные значения
            safePayload[key] = value === undefined ? "[undefined]" : null;
            if (isProblematicClient) {
              sotovikDebugLog('warn', `Found problematic value in payload.${key}:`, { value });
            }
          } else if (typeof value === 'function') {
            safePayload[key] = "[function]";
          } else if (typeof value === 'object') {
            try {
              // Пытаемся безопасно сериализовать объект
              JSON.stringify(value);
              safePayload[key] = value;
            } catch (e) {
              // Если сериализация не удалась, заменяем на строку
              safePayload[key] = "[complex-object]";
              if (isProblematicClient) {
                sotovikDebugLog('warn', `Failed to stringify payload.${key}:`, { error: e.message });
              }
            }
          } else {
            safePayload[key] = value;
          }
        });
      } catch (e) {
        console.error('Error processing payload:', e);
        safePayload = { error: 'payload_processing_failed' };
      }
    } else if (payload !== undefined) {
      // Если payload не объект, преобразуем в строку
      safePayload = { value: String(payload) };
      if (isProblematicClient) {
        sotovikDebugLog('warn', 'Non-object payload received:', { type: typeof payload, payload });
      }
    }
    
    const data = {
      event: eventName,
      payload: safePayload,
      timestamp: Date.now(),
      host: window.location.hostname,
      sdk_version: SDK_VERSION || '4.6.3'
    };
    
    let jsonString;
    try {
      jsonString = JSON.stringify(data);
      
      if (isProblematicClient) {
        sotovikDebugLog('debug', 'Serialized data:', { 
          length: jsonString.length,
          sampleStart: jsonString.substring(0, 50) + '...'
        });
      }
    } catch (e) {
      console.error('Failed to stringify event data:', e);
      
      // Создаем упрощенный объект, который гарантированно сериализуется
      const fallbackData = {
        event: eventName,
        error: 'stringify_failed',
        timestamp: Date.now(),
        host: window.location.hostname
      };
      
      jsonString = JSON.stringify(fallbackData);
      
      if (isProblematicClient) {
        sotovikDebugLog('error', 'Using fallback data due to stringify error:', { 
          error: e.message,
          fallbackData
        });
      }
    }
    
    // Создаем URL для отправки данных
    const url = 'https://rivox-data-handler-779203791697.europe-central2.run.app/logs';
    
    // Сохраняем информацию о запросе для отладки
    if (isProblematicClient) {
      sotovikDebugLog('info', 'Sending data to:', { 
        url, 
        method: typeof fetch === 'function' ? 'fetch' : 'image-beacon',
        dataSize: jsonString.length
      });
    }
    
    // Используем fetch с методом POST вместо Image beacon
    if (typeof fetch === 'function') {
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin,
          'X-Client-Host': window.location.hostname,
          'X-Debug': isProblematicClient ? 'true' : 'false'
        },
        body: jsonString,
        keepalive: true
      }).then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        if (eventName === 'error' || eventName === 'warning' || isProblematicClient) {
          console.debug('Rivox log event sent successfully:', eventName, response.status);
          
          if (isProblematicClient) {
            sotovikDebugLog('info', 'Fetch request succeeded:', { 
              status: response.status,
              eventName 
            });
          }
        }
      }).catch(err => {
        if (eventName === 'error' || eventName === 'warning' || isProblematicClient) {
          console.debug('Rivox log event failed:', eventName, err);
          
          if (isProblematicClient) {
            sotovikDebugLog('error', 'Fetch request failed:', { 
              error: err.message,
              eventName 
            });
          }
        }
        
        // Если fetch не удался, используем резервный метод - Image beacon
        sendViaImageBeacon(url, data, eventName);
      });
    } else {
      // Если fetch недоступен (IE11), используем резервный метод
      sendViaImageBeacon(url, data, eventName);
    }
  } catch (e) {
    // Ошибки логирования не должны влиять на работу SDK
    console.error('Critical error in logEvent:', e);
    
    if (window.location.hostname.includes('sotovik')) {
      sotovikDebugLog('error', 'Critical failure in logEvent:', {
        message: e.message,
        stack: e.stack,
        eventName: eventName || 'unknown'
      });
    }
  } finally {
    isLogging = false;
  }
}

// Вспомогательная функция для отправки через Image beacon (для IE11)
function sendViaImageBeacon(url, data, eventName) {
  try {
    // Проверяем входные данные
    if (!url || typeof url !== 'string') {
      console.error('Invalid URL for Image beacon:', url);
      return;
    }

    // Добавляем отладочную информацию для конкретного клиента
    const isDomainProblematic = window.location.hostname.includes('sotovik');
    if (isDomainProblematic) {
      console.debug('[DEBUG] sendViaImageBeacon payload:', {
        data: data,
        eventName: eventName,
        url: url,
        hostname: window.location.hostname,
        time: new Date().toISOString()
      });
    }

    // Проверяем, к какому маршруту обращаемся
    const route = url.includes('/session') ? '/session' : 
                  url.includes('/logs') ? '/logs' : 
                  url.includes('/batch') ? '/batch' : '/other';
    
    // Применяем безопасную обработку данных в зависимости от маршрута
    const safeData = SafeRouteUtils.sanitizePayloadForRoute(data, route);

    // Безопасная сериализация данных
    let jsonString;
    try {
      jsonString = JSON.stringify(safeData || {});
      if (isDomainProblematic) {
        console.debug('[DEBUG] JSON string length:', jsonString?.length);
      }
    } catch (e) {
      console.error('Failed to stringify data for Image beacon:', e);
      // Отправляем минимальный набор данных
      jsonString = JSON.stringify({
        error: 'data_serialization_failed',
        timestamp: Date.now(),
        event: eventName,
        host: window.location.hostname,
        route: route
      });
    }

    // Полная проверка перед манипуляциями со строкой
    if (!jsonString || typeof jsonString !== 'string') {
      console.error('jsonString is not a valid string:', typeof jsonString, jsonString);
      jsonString = JSON.stringify({
        error: 'invalid_json_string',
        timestamp: Date.now(),
        type: typeof jsonString,
        route: route
      });
    }

    // Безопасное кодирование данных
    let encodedData;
    try {
      encodedData = encodeURIComponent(jsonString);
    } catch (e) {
      console.error('Error encoding URL component:', e);
      encodedData = encodeURIComponent(JSON.stringify({
        error: 'encoding_failed',
        timestamp: Date.now(),
        route: route
      }));
    }

    // Безопасно обрезаем данные до допустимой длины
    let truncatedData;
    try {
      truncatedData = encodedData.length > 2000 ? encodedData.substring(0, 2000) : encodedData;
    } catch (e) {
      console.error('Error truncating encoded data:', e);
      truncatedData = encodeURIComponent(JSON.stringify({
        error: 'truncation_failed',
        timestamp: Date.now(),
        route: route
      }));
    }

    // Формируем итоговый URL с корректной обработкой ошибок и дополнительными параметрами
    const finalUrl = `${url}?method=post&data=${truncatedData}&domain=${encodeURIComponent(window.location.hostname)}&format=safe&device=${encodeURIComponent(getDeviceInfo())}&_t=${Date.now()}`;
    
    if (isDomainProblematic) {
      console.debug('[DEBUG] Final Image URL length:', finalUrl.length);
      
      // Добавляем дополнительную отладку для проблемного клиента
      if (typeof sotovikDebugLog === 'function') {
        sotovikDebugLog('debug', 'Image beacon URL details:', {
          baseUrl: url,
          finalLength: finalUrl.length,
          dataLength: truncatedData.length,
          wasTruncated: encodedData.length > 2000,
          route: route
        });
      }
    }

    const img = new Image();
    img.src = finalUrl;
    
    img.onload = function() {
      if (eventName === 'error' || eventName === 'warning' || isDomainProblematic) {
        console.debug('Rivox log event sent via image beacon successfully:', eventName);
      }
    };
    
    img.onerror = function() {
      if (eventName === 'error' || eventName === 'warning' || isDomainProblematic) {
        console.debug('Rivox log event via image beacon may have failed:', eventName);
        
        // Для проблемного клиента сохраняем детали ошибки
        if (isDomainProblematic && typeof sotovikDebugLog === 'function') {
          sotovikDebugLog('error', 'Image beacon request failed', {
            url: finalUrl.substring(0, 100) + '...',
            timestamp: Date.now(),
            eventName,
            route: route
          });
        }
      }
    };
  } catch (e) {
    // Критические ошибки обрабатываем и логируем
    console.error('Critical error in sendViaImageBeacon:', e.message || e);
    
    // Для отладки проблемного клиента
    if (window.location.hostname.includes('sotovik')) {
      if (typeof sotovikDebugLog === 'function') {
        sotovikDebugLog('error', 'Critical failure in beacon:', {
          message: e.message,
          stack: e.stack,
          eventName: eventName || 'unknown',
          url: url
        });
      } else {
        console.error('[ERROR] Full error details:', {
          message: e.message,
          stack: e.stack,
          data: typeof data,
          url: url,
          time: new Date().toISOString()
        });
      }
    }
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

    // Версия SDK
    const SDK_VERSION = '4.6.3';
    
    // Перехват вызовов Яндекс.Метрики для регистрации целей
    // Сохраняем оригинальную функцию ym до инициализации SDK
    const originalYm = window.ym;
    
    window.ym = function(counterId, method, ...args) {
        // Вызываем оригинальную функцию
        if (typeof originalYm === 'function') {
            originalYm.apply(this, [counterId, method, ...args]);
        }
        
        // Если это вызов reachGoal, регистрируем его в SDK
        if (method === 'reachGoal') {
            try {
                const goalName = args[0];
                const params = args[1] || {};
                
                // Если SDK уже инициализирован
                if (window.rivox && window.rivox.logMetrikaGoal) {
                    // Используем API SDK для регистрации цели
                    window.rivox.logMetrikaGoal(goalName, params);
                } else {
                    // SDK еще не инициализирован, сохраняем цель во временное хранилище
                    if (!window._rivoxPendingGoals) {
                        window._rivoxPendingGoals = [];
                    }
                    
                    window._rivoxPendingGoals.push({
                        counterId,
                        name: goalName,
                        params,
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                console.error('[Rivox SDK] Ошибка при перехвате цели Метрики:', error);
            }
        }
    };
    
    // Добавляем флаг инициализации SDK
    let SDK_INITIALIZED = false;
    // Добавляем массив для хранения отложенных событий
    const pendingEvents = [];
    
    // Создаем глобальный массив для хранения отложенных целей Метрики YM
    if (!window._rivoxPendingYmGoals) {
        window._rivoxPendingYmGoals = [];
    }
    
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
        allowedDomains: ['*'], // Разрешаем все домены
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
        
        // Новые параметры батчинга
        batchEnabled: true,           // Включить батчинг данных
        batchMaxSize: 20,             // Максимальное количество событий в батче
        batchDelay: 5000,             // Задержка батчинга (мс)
        batchMaxBytes: 100000,        // Максимальный размер батча в байтах (~100KB)

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

    // Максимальный размер очереди отправки
    const MAX_SEND_QUEUE_SIZE = 100;

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
                // Предотвращаем рекурсию
                if (isLogging) return;
                isLogging = true;
                try {
                logEvent('debug', { message: msg, data: data || '' });
                } finally {
                    isLogging = false;
                }
            }
        },
        
        info: function(msg, data) {
            if (this.level <= this.LEVELS.INFO && config.debug) { 
                // Предотвращаем рекурсию
                if (isLogging) return;
                isLogging = true;
                try {
                logEvent('info', { message: msg, data: data || '' });
                } finally {
                    isLogging = false;
                }
            }
        },
        
        warn: function(msg, data) {
            if (this.level <= this.LEVELS.WARN) {
                // Предотвращаем рекурсию
                if (isLogging) return;
                isLogging = true;
                try {
                logEvent('warning', { message: msg, data: data || '' });
                } finally {
                    isLogging = false;
                }
            }
        },
        
        error: function(msg, error) {
            if (this.level <= this.LEVELS.ERROR) {
                // Предотвращаем рекурсию
                if (isLogging) return;
                isLogging = true;
                try {
                logEvent('error', { message: msg, error: error?.message || error || '' });
                } finally {
                    isLogging = false;
                }
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
            return 'unknown_' + Date.now().toString(36);
        }
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
            ecommerce_events: [], // Добавляем поддержку Ecommerce-событий
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
        if (config.batchEnabled) {
            sendWithBatching(data, null, 'event');
        } else {
        queuedData.push({
            timestamp: new Date().toISOString(),
            data: data
        });

        // If queue is getting large, send immediately
        if (queuedData.length >= 5) {
            sendQueuedData();
            }
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
        if (!hostname) return true; // Разрешаем даже пустой hostname
        
        // Нормализуем домен (убираем www. если есть)
        const normalizedHostname = hostname.replace(/^www\./, '');
        
        // Логируем домен для отладки, но всегда возвращаем true
        if (config.debug) {
            Logger.debug('Domain allowed:', {
                original: hostname,
                normalized: normalizedHostname
            });
        }

        return true; // Всегда разрешаем любой домен
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
            ecommerce_events: [], // Добавляем поддержку Ecommerce-событий
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
    
    // Функция для настройки отслеживания целей Metrika - обновленная версия
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
            
            if (typeof ym !== 'function') {
                Logger.warn('Функция ym не доступна');
                return;
            }
            
            // Расширенная интеграция с Метрикой - перехват всех целей
            (function wrapYM() {
                if (typeof ym !== 'function') return;
                
                const originalYM = ym;
                
                window.ym = function (...args) {
                    try {
                        // Перехватываем все reachGoal вызовы
                        if (args[1] === 'reachGoal') {
                            const goal = args[2];
                            const params = args[3] || {};
                            const timestamp = Date.now();
                            
                            if (goal && sessionData) {
                                Logger.info(`🎯 Цель Metrika: ${goal}`, params);
                    
                    if (!sessionData.metrika_goals) {
                        sessionData.metrika_goals = [];
                    }
                    
                                // Сохраняем информацию о цели
                                const goalData = {
                                    name: goal,
                                    params: params,
                                    timestamp: timestamp,
                                    counter_id: args[0],
                                    type: 'goal',
                                    page_url: window.location.href
                                };
                                
                                sessionData.metrika_goals.push(goalData);
                                
                                // Помечаем сессию как конверсионную для важных целей
                                sessionData.has_conversion = true;
                                
                                // Обновляем conversion_data
                                if (!sessionData.conversion_data) {
                                    sessionData.conversion_data = {
                                        goals_reached: [],
                                        ecommerce_data: [],
                                        last_goal_timestamp: null,
                                        conversion_path: []
                                    };
                                }
                                
                                sessionData.conversion_data.goals_reached.push(goal);
                                sessionData.conversion_data.last_goal_timestamp = timestamp;
                                
                                // Добавляем текущий URL в путь конверсии
                                sessionData.conversion_data.conversion_path.push({
                                    url: window.location.href,
                                    timestamp: timestamp,
                                    goal: goal
                                });
                                
                                saveSessionToStorage();
                                
                                // Добавляем в очередь для гарантированной отправки
                                addToSendQueue({
                                    client_id: sessionData.client_id,
                                    client_token: config.token,
                                    session_id: sessionData.session_id,
                                    goal_data: goalData,
                                    timestamp: timestamp,
                                    sdk_version: SDK_VERSION,
                                    page_url: window.location.href,
                                    page_title: document.title,
                                    data_type: 'metrika_goal'
                                }, `${config.endpoint}/goals`, 'critical');
                                
                                console.log('Rivox intercepted goal:', {
                                    type: 'metrika_goal',
                                    goal_name: goal,
                                    goal_params: params,
                                    timestamp: timestamp
                                });
                            }
                        }
                        // Перехватываем ecommerce события
                        else if (args[1] === 'ecommerce' && sessionData) {
                            const action = args[2];
                            const ecommerceData = args[3] || {};
                            const timestamp = Date.now();
                            
                            Logger.info(`🛒 Ecommerce Metrika: ${action}`, ecommerceData);
                            
                            // Создаем массивы для ecommerce_events и metrika_goals, если необходимо
                            if (!sessionData.ecommerce_events) {
                                sessionData.ecommerce_events = [];
                            }
                            if (!sessionData.metrika_goals) {
                                sessionData.metrika_goals = [];
                            }
                            
                            // Создаем объект с информацией о событии ecommerce
                            const ecommerceEvent = {
                                action: action,
                                counter_id: args[0],
                                params: ecommerceData,
                                timestamp: timestamp,
                                type: 'ecommerce',
                                page_url: window.location.href
                            };
                            
                            // Сохраняем в основной массив ecommerce_events
                            sessionData.ecommerce_events.push(ecommerceEvent);
                            
                            // Также добавляем в metrika_goals для обеспечения совместимости
                    sessionData.metrika_goals.push({
                                name: `ecommerce_${action}`,
                                counter_id: args[0],
                                params: ecommerceData,
                                timestamp: timestamp,
                                type: 'ecommerce',
                                ecommerce_data: ecommerceEvent,
                                page_url: window.location.href
                            });
                            
                            // Обновляем conversion_data
                            if (!sessionData.conversion_data) {
                                sessionData.conversion_data = {
                                    goals_reached: [],
                                    ecommerce_data: [],
                                    last_goal_timestamp: null,
                                    conversion_path: []
                                };
                            }
                            
                            // Добавляем событие в ecommerce_data
                            sessionData.conversion_data.ecommerce_data.push(ecommerceEvent);
                            
                            // Помечаем сессию как конверсионную для важных событий
                            const importantActions = ['purchase', 'checkout', 'add', 'order'];
                            if (importantActions.some(key => action === key || action.includes(key))) {
                                sessionData.has_conversion = true;
                                sessionData.conversion_data.goals_reached.push(`ecommerce_${action}`);
                                sessionData.conversion_data.last_goal_timestamp = timestamp;
                                
                                // Добавляем в путь конверсии
                                sessionData.conversion_data.conversion_path.push({
                                    url: window.location.href,
                                    timestamp: timestamp,
                                    type: 'ecommerce',
                                    action: action
                                });
                            }
                            
                    saveSessionToStorage();
                            
                            // Добавляем в очередь для гарантированной отправки
                            addToSendQueue({
                                client_id: sessionData.client_id,
                                client_token: config.token,
                                session_id: sessionData.session_id,
                                ecommerce_data: ecommerceEvent,
                                timestamp: timestamp,
                                sdk_version: SDK_VERSION,
                                page_url: window.location.href,
                                page_title: document.title,
                                data_type: 'ecommerce'
                            }, `${config.endpoint}/ecommerce`, 'critical');
                            
                            console.log('Rivox intercepted ecommerce:', {
                                type: 'metrika_ecommerce',
                                action: action,
                                params: ecommerceData,
                                timestamp: timestamp
                            });
                        }
                    } catch (e) {
                        console.warn('Rivox YM wrap failed', e);
                        Logger.error('Ошибка при перехвате цели Метрики:', e);
                    }
                    
                    // Вызываем оригинальную функцию
                    return originalYM.apply(this, args);
                };
                
                Logger.info('✅ Расширенное отслеживание целей Метрики настроено');
            })();
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

    // Обработка цели Метрики
    function handleMetrikaGoal(counterId, goalName, params) {
        try {
            // Проверка на тестовые цели
            if (goalName === 'test_goal') {
                Logger.debug('Пропускаю тестовую цель');
                return;
            }
            
            // Проверяем инициализацию сессии
            if (!sessionData) {
                Logger.warn(`Цель ${goalName} получена, но сессия не инициализирована`);
                saveGoalToLocalStorage(counterId, goalName, params);
                return;
            }
            
            Logger.info(`🎯 Цель Metrika: ${goalName}`, {
                counterId,
                goal: goalName,
                params: params || {},
                session_id: sessionData.session_id
            });
            
            // Инициализируем массив целей, если необходимо
                    if (!sessionData.metrika_goals) {
                        sessionData.metrika_goals = [];
                    }
                    
            // Создаем объект с информацией о цели
            const goalData = {
                        name: goalName,
                counter_id: counterId,
                        params: params || {},
                timestamp: Date.now(),
                type: 'goal',
                page_url: window.location.href
            };
            
            // Добавляем цель в массив
            sessionData.metrika_goals.push(goalData);
            
            // Помечаем сессию как конверсионную
            sessionData.has_conversion = true;
            
            // Обновляем conversion_data
            if (!sessionData.conversion_data) {
                sessionData.conversion_data = {
                    goals_reached: [],
                    ecommerce_data: [],
                    last_goal_timestamp: null,
                    conversion_path: []
                };
            }
            
            sessionData.conversion_data.goals_reached.push(goalName);
            sessionData.conversion_data.last_goal_timestamp = Date.now();
            
            // Добавляем текущий URL в путь конверсии
            sessionData.conversion_data.conversion_path.push({
                url: window.location.href,
                timestamp: Date.now(),
                goal: goalName
            });
            
            // Сохраняем сессию в localStorage
                    saveSessionToStorage();
            
            // Отправляем данные о цели немедленно с повторными попытками
            sendGoalToServer(goalData).catch(error => {
                Logger.error('Ошибка при отправке цели:', error);
                
                // Сохраняем цель для повторной отправки
                saveGoalToLocalStorage(counterId, goalName, params);
            });
        } catch (error) {
            Logger.error('Ошибка при обработке цели Metrika:', error);
            
            // Сохраняем цель для повторной отправки
            saveGoalToLocalStorage(counterId, goalName, params);
        }
    }
    
    // Обработка события ecommerce Метрики
    function handleMetrikaEcommerce(counterId, action, params) {
        try {
            Logger.info(`🛒 Ecommerce Metrika: ${action}`, {
                counterId,
                action: action,
                params: params || {},
                session_id: sessionData?.session_id
            });
            
            // Проверяем инициализацию сессии
            if (!sessionData) {
                Logger.warn(`Ecommerce событие ${action} получено, но сессия не инициализирована`);
                saveEcommerceToLocalStorage(counterId, action, params);
                return;
            }
            
            // Создаем массивы для ecommerce_events и metrika_goals, если необходимо
            if (!sessionData.ecommerce_events) {
                sessionData.ecommerce_events = [];
            }
            if (!sessionData.metrika_goals) {
                sessionData.metrika_goals = [];
            }
            
            // Создаем объект с информацией о событии ecommerce
            const ecommerceEvent = {
                action: action,
                counter_id: counterId,
                params: params || {},
                timestamp: Date.now(),
                type: 'ecommerce',
                page_url: window.location.href
            };
            
            // Сохраняем в основной массив ecommerce_events
            sessionData.ecommerce_events.push(ecommerceEvent);
            
            // Также добавляем в metrika_goals для обеспечения совместимости
            sessionData.metrika_goals.push({
                name: `ecommerce_${action}`,
                counter_id: counterId,
                params: params || {},
                timestamp: Date.now(),
                type: 'ecommerce',
                ecommerce_data: ecommerceEvent,
                page_url: window.location.href
            });
            
            // Обновляем conversion_data
            if (!sessionData.conversion_data) {
                sessionData.conversion_data = {
                    goals_reached: [],
                    ecommerce_data: [],
                    last_goal_timestamp: null,
                    conversion_path: []
                };
            }
            
            // Добавляем событие в ecommerce_data
            sessionData.conversion_data.ecommerce_data.push(ecommerceEvent);
            
            // Помечаем сессию как конверсионную для важных событий
            const importantActions = ['purchase', 'checkout', 'add', 'order'];
            if (importantActions.some(key => action === key || action.includes(key))) {
                sessionData.has_conversion = true;
                sessionData.conversion_data.goals_reached.push(`ecommerce_${action}`);
                sessionData.conversion_data.last_goal_timestamp = timestamp;
                
                // Добавляем в путь конверсии
                sessionData.conversion_data.conversion_path.push({
                    url: window.location.href,
                    timestamp: timestamp,
                    type: 'ecommerce',
                    action: action
                });
            }
            
            // Сохраняем сессию в localStorage
            saveSessionToStorage();
            
            // Отправляем данные о событии ecommerce немедленно с высоким приоритетом
            sendEcommerceToServer(ecommerceEvent).catch(error => {
                Logger.error('Ошибка при отправке ecommerce события:', error);
                
                // Сохраняем ecommerce событие для повторной отправки
                saveEcommerceToLocalStorage(counterId, action, params);
            });
        } catch (error) {
            Logger.error('Ошибка при обработке события Ecommerce Metrika:', error);
            
            // Сохраняем для повторной отправки
            saveEcommerceToLocalStorage(counterId, action, params);
        }
    }
    
    // Сохранение цели для повторной отправки
    function saveGoalToLocalStorage(counterId, goalName, params) {
        try {
            // Получаем текущий список неотправленных целей
            let goalsQueue = [];
            try {
                const goalsQueueJson = localStorage.getItem('rivox_unsent_goals');
                if (goalsQueueJson) {
                    goalsQueue = JSON.parse(goalsQueueJson);
                    if (!Array.isArray(goalsQueue)) {
                        goalsQueue = [];
                    }
                }
            } catch (e) {
                Logger.error('Ошибка при чтении очереди целей:', e);
                goalsQueue = [];
            }
            
            // Добавляем новую цель в очередь
            goalsQueue.push({
                counter_id: counterId,
                name: goalName,
                params: params || {},
                timestamp: Date.now(),
                page_url: window.location.href,
                attempts: 0
            });
            
            // Ограничиваем размер очереди (максимум 20 элементов)
            if (goalsQueue.length > 20) {
                goalsQueue = goalsQueue.slice(-20);
            }
            
            // Сохраняем обновленную очередь
            localStorage.setItem('rivox_unsent_goals', JSON.stringify(goalsQueue));
            
            Logger.info(`Цель ${goalName} сохранена для повторной отправки`);
            
            // Запускаем обработку через 5 секунд
            setTimeout(processSavedGoals, 5000);
        } catch (error) {
            Logger.error('Ошибка при сохранении цели для повторной отправки:', error);
        }
    }
    
    // Сохранение ecommerce события для повторной отправки
    function saveEcommerceToLocalStorage(counterId, action, params) {
        try {
            // Получаем текущий список неотправленных ecommerce событий
            let ecommerceQueue = [];
            try {
                const ecommerceQueueJson = localStorage.getItem('rivox_unsent_ecommerce');
                if (ecommerceQueueJson) {
                    ecommerceQueue = JSON.parse(ecommerceQueueJson);
                    if (!Array.isArray(ecommerceQueue)) {
                        ecommerceQueue = [];
                    }
                }
            } catch (e) {
                Logger.error('Ошибка при чтении очереди ecommerce событий:', e);
                ecommerceQueue = [];
            }
            
            // Добавляем новое событие в очередь
            ecommerceQueue.push({
                counter_id: counterId,
                action: action,
                params: params || {},
                timestamp: Date.now(),
                page_url: window.location.href,
                attempts: 0
            });
            
            // Ограничиваем размер очереди (максимум 20 элементов)
            if (ecommerceQueue.length > 20) {
                ecommerceQueue = ecommerceQueue.slice(-20);
            }
            
            // Сохраняем обновленную очередь
            localStorage.setItem('rivox_unsent_ecommerce', JSON.stringify(ecommerceQueue));
            
            Logger.info(`Ecommerce событие ${action} сохранено для повторной отправки`);
            
            // Запускаем обработку через 5 секунд
            setTimeout(processSavedEcommerce, 5000);
        } catch (error) {
            Logger.error('Ошибка при сохранении ecommerce события для повторной отправки:', error);
        }
    }
    
    // Отправка цели на сервер с использованием батчинга
    async function sendGoalToServer(goalData) {
        try {
            // Формируем данные для отправки
            const dataToSend = {
                client_id: sessionData.client_id,
                client_token: config.token,
                session_id: sessionData.session_id,
                goal_data: goalData,
                timestamp: Date.now(),
                sdk_version: SDK_VERSION,
                page_url: window.location.href,
                page_title: document.title,
                data_type: 'goal'
            };
            
            // Цели всегда критичны, поэтому используем прямую отправку
            const result = await sendDataWithFallback(dataToSend, `${config.endpoint}/goals`, 'critical');
            
            if (result.success) {
                Logger.info(`✅ Цель ${goalData.name} успешно отправлена на сервер`);
                return true;
            } else {
                Logger.warn(`⚠️ Ошибка при отправке цели ${goalData.name}:`, result.error);
                return false;
            }
        } catch (error) {
            Logger.error(`❌ Не удалось отправить цель ${goalData.name}:`, error);
            return false;
        }
    }
    
    // Отправка ecommerce события на сервер
    async function sendEcommerceToServer(ecommerceData) {
        try {
            // Формируем данные для отправки
            const dataToSend = {
                client_id: sessionData.client_id,
                client_token: config.token,
                session_id: sessionData.session_id,
                ecommerce_data: ecommerceData,
                timestamp: Date.now(),
                sdk_version: SDK_VERSION,
                page_url: window.location.href,
                page_title: document.title,
                data_type: 'ecommerce'
            };
            
            // Отправляем с высоким приоритетом
            const result = await sendDataWithFallback(dataToSend, `${config.endpoint}/ecommerce`, 'critical');
            
            if (result.success) {
                Logger.info(`✅ Ecommerce событие ${ecommerceData.action} успешно отправлено на сервер`);
                return true;
            } else {
                Logger.warn(`⚠️ Ошибка при отправке ecommerce события ${ecommerceData.action}:`, result.error);
                return false;
            }
        } catch (error) {
            Logger.error(`❌ Не удалось отправить ecommerce событие ${ecommerceData.action}:`, error);
            return false;
        }
    }
    
    // Обработка сохраненных целей
    async function processSavedGoals() {
        try {
            // Проверяем, идет ли уже обработка
            if (window._rivoxProcessingGoals) {
                return;
            }

            window._rivoxProcessingGoals = true;
            
            // Получаем список неотправленных целей
            let goalsQueue = [];
            try {
                const goalsQueueJson = localStorage.getItem('rivox_unsent_goals');
                if (goalsQueueJson) {
                    goalsQueue = JSON.parse(goalsQueueJson);
                    if (!Array.isArray(goalsQueue)) {
                        goalsQueue = [];
                    }
                }
            } catch (e) {
                Logger.error('Ошибка при чтении очереди целей:', e);
                goalsQueue = [];
            }
            
            if (goalsQueue.length === 0) {
                window._rivoxProcessingGoals = false;
                return;
            }

            Logger.info(`Обработка неотправленных целей (${goalsQueue.length})`);
            
            // Обрабатываем цели
            const remainingGoals = [];
            
            for (const goal of goalsQueue) {
                try {
                    // Увеличиваем счетчик попыток
                    goal.attempts = (goal.attempts || 0) + 1;
                    
                    // Формируем данные для отправки
                    const goalData = {
                        name: goal.name,
                        counter_id: goal.counter_id,
                        params: goal.params || {},
                        timestamp: goal.timestamp,
                        type: 'goal',
                        page_url: goal.page_url || window.location.href
                    };
                    
                    // Пытаемся отправить цель
                    const success = await sendGoalToServer(goalData);
                    
                    if (!success) {
                        // Если не удалось отправить и попыток мало, оставляем в очереди
                        if (goal.attempts < 5) {
                            remainingGoals.push(goal);
                        } else {
                            Logger.warn(`Цель ${goal.name} удалена после 5 неудачных попыток`);
                        }
                    }
                } catch (error) {
                    Logger.error(`Ошибка при обработке цели ${goal.name}:`, error);
                    
                    // Сохраняем цель в очередь, если попыток еще мало
                    if (goal.attempts < 5) {
                        remainingGoals.push(goal);
                    }
                }
            }
            
            // Обновляем очередь
            if (remainingGoals.length > 0) {
                localStorage.setItem('rivox_unsent_goals', JSON.stringify(remainingGoals));
                
                // Планируем следующую попытку
                setTimeout(processSavedGoals, 60000);
            } else {
                localStorage.removeItem('rivox_unsent_goals');
            }
            
            Logger.info(`Обработка целей завершена, осталось: ${remainingGoals.length}`);
            
            window._rivoxProcessingGoals = false;
        } catch (error) {
            Logger.error('Ошибка при обработке сохраненных целей:', error);
            window._rivoxProcessingGoals = false;
        }
    }
    
    // Обработка сохраненных ecommerce событий
    async function processSavedEcommerce() {
        try {
            // Проверяем, идет ли уже обработка
            if (window._rivoxProcessingEcommerce) {
                    return;
                }
            
            window._rivoxProcessingEcommerce = true;
            
            // Получаем список неотправленных ecommerce событий
            let ecommerceQueue = [];
            try {
                const ecommerceQueueJson = localStorage.getItem('rivox_unsent_ecommerce');
                if (ecommerceQueueJson) {
                    ecommerceQueue = JSON.parse(ecommerceQueueJson);
                    if (!Array.isArray(ecommerceQueue)) {
                        ecommerceQueue = [];
                    }
                }
            } catch (e) {
                Logger.error('Ошибка при чтении очереди ecommerce событий:', e);
                ecommerceQueue = [];
            }
            
            if (ecommerceQueue.length === 0) {
                window._rivoxProcessingEcommerce = false;
                return;
            }

            Logger.info(`Обработка неотправленных ecommerce событий (${ecommerceQueue.length})`);
            
            // Обрабатываем события
            const remainingEvents = [];
            
            for (const event of ecommerceQueue) {
                try {
                    // Увеличиваем счетчик попыток
                    event.attempts = (event.attempts || 0) + 1;
                    
                    // Формируем данные для отправки
                    const ecommerceData = {
                        action: event.action,
                        counter_id: event.counter_id,
                        params: event.params || {},
                        timestamp: event.timestamp,
                        type: 'ecommerce',
                        page_url: event.page_url || window.location.href
                    };
                    
                    // Пытаемся отправить событие
                    const success = await sendEcommerceToServer(ecommerceData);
                    
                    if (!success) {
                        // Если не удалось отправить и попыток мало, оставляем в очереди
                        if (event.attempts < 5) {
                            remainingEvents.push(event);
                        } else {
                            Logger.warn(`Ecommerce событие ${event.action} удалено после 5 неудачных попыток`);
                        }
                    }
                } catch (error) {
                    Logger.error(`Ошибка при обработке ecommerce события ${event.action}:`, error);
                    
                    // Сохраняем событие в очередь, если попыток еще мало
                    if (event.attempts < 5) {
                        remainingEvents.push(event);
                    }
                }
            }
            
            // Обновляем очередь
            if (remainingEvents.length > 0) {
                localStorage.setItem('rivox_unsent_ecommerce', JSON.stringify(remainingEvents));
                
                // Планируем следующую попытку
                setTimeout(processSavedEcommerce, 60000);
            } else {
                localStorage.removeItem('rivox_unsent_ecommerce');
            }
            
            Logger.info(`Обработка ecommerce событий завершена, осталось: ${remainingEvents.length}`);
            
            window._rivoxProcessingEcommerce = false;
        } catch (error) {
            Logger.error('Ошибка при обработке сохраненных ecommerce событий:', error);
            window._rivoxProcessingEcommerce = false;
        }
    }
    
    // Настройка наблюдателя за появлением Метрики
    function setupMetrikaWatcher() {
        // Проверяем, уже настроен ли наблюдатель
        if (window._rivoxMetrikaWatcher) {
            return;
        }
        
        Logger.info('Настраиваю наблюдатель за появлением Метрики');
        
        // Функция для проверки существования Метрики
        const checkMetrika = () => {
            if (isYandexMetrikaReady()) {
                Logger.info('Метрика обнаружена, настраиваю отслеживание');
                setupMetrikaTracking();
                
                // Очищаем интервал
                if (window._rivoxMetrikaWatcherInterval) {
                    clearInterval(window._rivoxMetrikaWatcherInterval);
                    window._rivoxMetrikaWatcherInterval = null;
                }
            }
        };
        
        // Устанавливаем интервал для проверки
        window._rivoxMetrikaWatcherInterval = setInterval(checkMetrika, 1000);
        
        // Также пытаемся перехватить момент инициализации с помощью MutationObserver
        if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length) {
                        for (const node of mutation.addedNodes) {
                            if (node.tagName === 'SCRIPT' && 
                                (node.src && (node.src.includes('metrika') || node.src.includes('metrica')))) {
                                // Скрипт Метрики добавлен, проверяем через некоторое время
                                setTimeout(checkMetrika, 1000);
                                setTimeout(checkMetrika, 2000);
                                setTimeout(checkMetrika, 3000);
                            }
                        }
                    }
                }
                
                // В любом случае периодически проверяем
                checkMetrika();
            });
            
            // Наблюдаем за всем документом
            observer.observe(document, { childList: true, subtree: true });
            
            // Сохраняем ссылку на наблюдателя
            window._rivoxMetrikaWatcher = observer;
        }
        
        // Также проверяем сразу
        setTimeout(checkMetrika, 0);
    }

    // Initialize SDK
    async function init() {
        const currentDomain = window.location.hostname;
        // Логируем домен, но не прерываем инициализацию
        Logger.info('RIVOX SDK initializing on domain:', currentDomain);
        
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
        sessionData.ecommerce_events = sessionData.ecommerce_events || []; // Добавляем поддержку Ecommerce-событий
        
        // Убедимся, что объект conversion_data существует
        if (!sessionData.conversion_data) {
            sessionData.conversion_data = {
                goals_reached: [],
                ecommerce_data: [],
                last_goal_timestamp: null,
                conversion_path: []
            };
        }
        
        // Убедимся, что client_id всегда строка
        if (sessionData.client_id) {
            sessionData.client_id = safeClientId(sessionData.client_id);
        }
        
        // Flush pending YM goals after session initialization
        if (window._rivoxPendingYmGoals?.length) {
            dbg('[Rivox SDK] flushing %d queued goals', window._rivoxPendingYmGoals.length);
            window._rivoxPendingYmGoals.forEach(g =>
                logMetrikaGoal(g.goalName, g.params));
            window._rivoxPendingYmGoals = [];
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
        
        // Устанавливаем флаг инициализированного SDK
        SDK_INITIALIZED = true;
        
        // Обрабатываем отложенные события
        if (pendingEvents.length > 0) {
            Logger.info(`Обработка ${pendingEvents.length} отложенных событий`);
            pendingEvents.forEach(event => {
                logEvent(event.eventType, event.eventData);
            });
            // Очищаем массив после обработки
            pendingEvents.length = 0;
        }
        
        // Обработка отложенных целей Метрики
        if (window._rivoxPendingGoals && window._rivoxPendingGoals.length > 0) {
            Logger.info(`[Rivox SDK] Обработка ${window._rivoxPendingGoals.length} отложенных целей Метрики`);
            
            // Копируем массив, чтобы избежать проблем с одновременной модификацией
            const pendingGoals = [...window._rivoxPendingGoals];
            // Очищаем хранилище
            window._rivoxPendingGoals = [];
            
            // Обрабатываем каждую цель
            pendingGoals.forEach(goal => {
                logMetrikaGoal(goal.name, goal.params);
                Logger.info(`[Rivox SDK] Обработана отложенная цель: ${goal.name}`);
            });
            
            // Отправляем данные на сервер после обработки отложенных целей
            sendDataGuaranteed('pending_goals_processed');
        }
        
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
        try {
            if (!sessionData) {
                Logger.warn('Cannot send session summary: no session data');
                return { success: false, error: 'No session data' };
            }

            // Готовим данные для отправки
            const sessionSummary = prepareSessionDataForSending();
            const dataToSend = {
                ...sessionSummary,
                timestamp: new Date().toISOString(),
                sdk_version: SDK_VERSION,
                data_type: 'session_summary'
            };

            // Проверяем наличие iPhone/Safari для особой обработки
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
            
            if (isIOS && isSafari) {
                // Для iOS Safari используем GET с минимальными данными
                Logger.info('Using iOS Safari compatible session data format');
                
                // Сначала пытаемся отправить минимальные данные через GET
                const safeSessionUrl = SafeRouteUtils.processSessionRequest(dataToSend, 'GET');
                
                try {
                    // Используем Image для GET запроса
                    const img = new Image();
                    img.src = safeSessionUrl;
                    
                    img.onload = function() {
                        Logger.info('iOS Safari session data sent successfully via GET');
                    };
                    
                    img.onerror = function() {
                        Logger.warn('iOS Safari session data send failed via GET, trying POST');
                        // При ошибке пробуем обычный метод
                        sendDataWithFallback(
                            SafeRouteUtils.sanitizePayloadForRoute(dataToSend, '/session'),
                            'https://rivox-data-handler-779203791697.europe-central2.run.app/session', 
                            'critical'
                        );
                    };
                    
                    return { success: true, method: 'ios_safari_get' };
                } catch (e) {
                    Logger.error('iOS Safari GET method failed:', e);
                    // При ошибке пробуем обычный метод
                }
            }

            // Обычный случай - используем батчинг или прямую отправку
            if (config.batchEnabled) {
                return sendWithBatching(
                    SafeRouteUtils.sanitizePayloadForRoute(dataToSend, '/session'), 
                    'https://rivox-data-handler-779203791697.europe-central2.run.app/session', 
                    'regular'
                );
            } else {
                // Используем старый метод с безопасной обработкой данных
                return sendDataWithFallback(
                    SafeRouteUtils.sanitizePayloadForRoute(dataToSend, '/session'),
                    'https://rivox-data-handler-779203791697.europe-central2.run.app/session', 
                    'regular'
                );
            }
        } catch (error) {
            Logger.error('Error sending session summary:', error);
            return { success: false, error: error.message };
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
        logEvent: logEvent,
        logMetrikaGoal: logMetrikaGoal, // Добавляем функцию в публичный API
        getSessionData: function() {
            return deepCopy(sessionData);
        },
        isMetrikaReady: isYandexMetrikaReady,
        getMetrikaCounter: getYandexCounterId,
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
        get isSessionActive() { return isSessionActive; },
        // Добавляем новый метод в публичный API
        logMetrikaGoal: logMetrikaGoal,
    };

    // Добавляем алиас с строчным названием для совместимости с кодом перехвата целей
    window.rivox = window.RIVOX;

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

    // Отправка данных с механизмами отказоустойчивости
    function sendDataViaBeacon(data, endpoint, dataType) {
        try {
            // Обработка случая, когда client_id еще не загружен (Promise)
            if (data.client_id && data.client_id instanceof Promise) {
                Logger.debug('client_id является Promise, ожидаю разрешения');
                return data.client_id.then(id => {
                    data.client_id = safeClientId(id);
                    return sendDataViaBeacon(data, endpoint, dataType);
                }).catch(error => {
                    Logger.error('Не удалось получить client_id из Promise', error);
                    data.client_id = 'promise_failed_' + Date.now().toString(36);
                    return sendDataViaBeacon(data, endpoint, dataType);
                });
            }
            
            // Установка базового URL или использование значения по умолчанию
            const baseUrl = config.apiBaseUrl || 'https://api.rivox.ai'; 
            const url = endpoint ? `${baseUrl}/${endpoint}` : (config.apiEndpoint || config.endpoint);
            
            // Клонируем данные и очищаем от циклических ссылок
            const cleanedData = cleanObject(data);
            
            // Убедимся, что client_id всегда строка
            if (cleanedData.client_id) {
                cleanedData.client_id = safeClientId(cleanedData.client_id);
            }
            
            // Добавляем временную метку отправки
            cleanedData.sent_at = Date.now();
            
            // Безопасная сериализация, избегаем циклических ссылок
            let jsonData;
            try {
                jsonData = JSON.stringify(cleanedData);
            } catch (e) {
                // Удаляем проблемные поля если сериализация не удалась
                const sanitizedData = { ...cleanedData };
                if (sanitizedData.event_data && sanitizedData.event_data.target) {
                    delete sanitizedData.event_data.target; // Часто содержит циклические ссылки
                }
                jsonData = JSON.stringify(sanitizedData);
                Logger.warn('Некоторые поля были удалены из-за ошибки сериализации', e);
            }
            
            // Кодируем данные для передачи через Image beacon
            const encodedData = encodeURIComponent(jsonData);
            
            // Создаем уникальный идентификатор для этой отправки
            const sendId = 'send_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2);
            
            // Параметры для URL
            const params = {
                data: jsonData,
                t: Date.now().toString(),
                id: sendId
            };

            // Создаем URL с параметрами в query string
            const queryParams = Object.keys(params)
                .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                .join('&');

            // Формируем URL
            const imageUrl = `${url}?${queryParams}`;
            
            // Отправляем через Image beacon
            Logger.debug(`Отправка ${dataType} через Image beacon (${(jsonData.length / 1024).toFixed(2)}KB)`);
            
            const img = new Image();
            let isTimedOut = false;
            let isDone = false;
            
            // Таймаут для изображения
            const timeout = setTimeout(() => {
                if (!isDone) {
                    isTimedOut = true;
                    isDone = true;
                    Logger.warn(`Таймаут отправки ${dataType} через Image beacon`);
                    
                    // Добавляем в очередь для повторной отправки, если dataQueue существует
                    if (typeof dataQueue !== 'undefined') {
                        dataQueue.push({
                            data: cleanedData,
                            endpoint,
                            dataType,
                            timestamp: Date.now(),
                            attempt: 1
                        });
                        
                        if (typeof processQueue === 'function') {
                            processQueue(); // Пытаемся обработать очередь
                        }
                    }
                    return { success: false, error: 'Timeout', queued: true };
                }
            }, 10000); // 10 секунд таймаут
            
            // Обработчик успешной загрузки
            img.onload = function() {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeout);
                    Logger.debug(`Успешно отправлены данные ${dataType} через Image beacon`);
                    
                    // Удаляем элемент из DOM, чтобы избежать утечек памяти
                    setTimeout(() => {
                        if (img.parentNode) {
                            img.parentNode.removeChild(img);
                        }
                    }, 100);
                }
            };
            
            // Обработчик ошибки
            img.onerror = function() {
                if (!isDone) {
                    isDone = true;
                    clearTimeout(timeout);
                    Logger.warn(`Ошибка отправки ${dataType} через Image beacon`);
                    
                    // Добавляем в очередь для повторной отправки, если dataQueue существует
                    if (typeof dataQueue !== 'undefined') {
                        dataQueue.push({
                            data: cleanedData,
                            endpoint,
                            dataType,
                            timestamp: Date.now(),
                            attempt: 1
                        });
                        
                        if (typeof processQueue === 'function') {
                            processQueue(); // Пытаемся обработать очередь
                        }
                    }
                }
            };
            
            // Set source to start loading
            img.src = imageUrl;
            
            // Добавляем изображение в DOM (важно для некоторых браузеров)
            img.style.display = 'none';
            if (document.body) {
                document.body.appendChild(img);
            }
            
            return { success: true, method: 'image_beacon' };
        } catch (error) {
            Logger.error(`Ошибка при подготовке или отправке данных ${dataType}:`, error);
            
            // Добавляем в очередь для повторной отправки, если dataQueue существует
            if (typeof dataQueue !== 'undefined') {
                dataQueue.push({
                    data: {
                        ...data,
                        error_info: {
                            message: error.message,
                            time: Date.now()
                        }
                    },
                    endpoint,
                    dataType,
                    timestamp: Date.now(),
                    attempt: 1
                });
                
                if (typeof processQueue === 'function') {
                    processQueue();
                }
            }
            
            return { success: false, error: error.message, queued: true };
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
            
            // [Future] Здесь будет вызов функции виртуальных конверсий
            // checkAndFireVirtualConversion();
            
        } catch (error) {
            Logger.error('Error updating ML features:', error);
        }
    }
    
    // [Future] Виртуальные конверсии для ML-модели:
    // - Сбор поведенческих метрик и вычисление скора вероятности конверсии
    // - Проверка порога конверсии на основе weighted_score и правил
    // - Вызов ym(counter_id, 'reachGoal', 'virtual_conversion', params) с параметрами
    // - Блокировка повторных срабатываний в рамках одной сессии
    // - Сохранение информации о виртуальных конверсиях в сессионном хранилище
    // function checkAndFireVirtualConversion() {
    //     try {
    //         if (!sessionData || !sessionData.ml_features) return;
    //         
    //         // 1. Вычисление скора конверсии на основе метрик:
    //         //    - Взаимодействия с формами
    //         //    - Время до первого взаимодействия
    //         //    - Тайминг кликов
    //         //    - Глубина скролла
    //         //    - Количество событий скролла
    //
    //         // 2. Проверка порога конверсии
    //
    //         // 3. Вызов цели в Яндекс.Метрике при превышении порога
    //         // ym(counterId, 'reachGoal', 'virtual_conversion', params);
    //
    //         // 4. Сохранение информации в сессии для предотвращения повторных вызовов
    //     } catch (error) {
    //         Logger.error('Error in virtual conversion processing:', error);
    //     }
    // }
    
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

    // Вспомогательные функции безопасной обработки данных
    
    // Обеспечивает корректный формат ID клиента (всегда строка)
    function cleanObject(obj) {
        const seen = new WeakSet();
        
        function replacer(key, value) {
            // Примитивы и null всегда безопасны
            if (value === null || typeof value !== 'object') {
                return value;
            }
            
            // Обнаружение циклических ссылок
            if (seen.has(value)) {
                return '[Circular Reference]';
            }
            
            // Обработка DOM-элементов и других непреобразуемых объектов
            if (value instanceof Element || value instanceof Node) {
                return `[DOM:${value.nodeName}]`;
            }
            
            if (value instanceof Error) {
                return {
                    error_message: value.message,
                    error_name: value.name,
                    error_stack: value.stack
                };
            }
            
            // Обработка специальных объектов
            if (value instanceof Map) {
                return Object.fromEntries(value);
            }
            
            if (value instanceof Set) {
                return Array.from(value);
            }
            
            // Если это массив или объект, добавляем в seen и обрабатываем рекурсивно
            if (typeof value === 'object') {
                seen.add(value);
            }
            
            return value;
        }
        
        try {
            // Проходим по объекту используя replacer для очистки
            const cleaned = JSON.parse(JSON.stringify(obj, replacer));
            return cleaned;
        } catch (e) {
            // В крайнем случае возвращаем упрощенный объект с базовой информацией
            Logger.error('Невозможно очистить объект:', e);
            return {
                client_id: obj.client_id || 'unknown',
                session_id: obj.session_id || 'unknown_session',
                timestamp: Date.now(),
                error: 'Data cleaning failed'
            };
        }
    }

    // Отправляет данные, используя только Image beacon
    function processQueue() {
        // Проверка, обрабатывается ли уже очередь
        if (isProcessingQueue || dataQueue.length === 0) {
            return;
        }

        isProcessingQueue = true;
        Logger.debug(`Начало обработки очереди: ${dataQueue.length} элементов`);

        // Берем следующий элемент из очереди
        const queueItem = dataQueue.shift();
        const { data, endpoint, dataType, timestamp, attempt } = queueItem;

        // Если прошло больше часа с момента добавления в очередь - удаляем элемент
        if (Date.now() - timestamp > 3600000) {
            Logger.warn(`Элемент очереди ${dataType} удален из-за истечения времени ожидания (>1 час)`);
            isProcessingQueue = false;
            setTimeout(processQueue, 100);
            return;
        }

        // Если было более 5 попыток - удаляем элемент
        if (attempt > 5) {
            Logger.warn(`Элемент очереди ${dataType} удален после ${attempt} неудачных попыток`);
            isProcessingQueue = false;
            setTimeout(processQueue, 100);
            return;
        }

        // Отправляем данные через Image beacon
        try {
            // Используем новую функцию для отправки
            sendDataWithFallback(data, endpoint, `${dataType}_retry${attempt}`);
            
            // Считаем, что данные отправлены успешно (обработка ошибок внутри sendDataWithFallback)
            isProcessingQueue = false;
            
            // Продолжаем обработку очереди с небольшой задержкой
            setTimeout(processQueue, 500);
        } catch (error) {
            // Если произошла ошибка, увеличиваем счетчик попыток и возвращаем элемент в очередь
            Logger.error(`Ошибка при повторной отправке данных ${dataType}:`, error);
            
            // Добавляем информацию об ошибке
            const updatedData = {
                ...data,
                retry_info: {
                    attempt: attempt + 1,
                    error: error.message,
                    time: Date.now()
                }
            };
            
            // Вставляем обратно с инкрементом счетчика попыток
            dataQueue.push({
                data: updatedData,
                endpoint,
                dataType,
                timestamp,
                attempt: attempt + 1
            });
            
            isProcessingQueue = false;
            
            // Делаем более длительную паузу перед следующей попыткой
            setTimeout(processQueue, 2000 * attempt);
        }
    }

    // Функция для логирования событий
    async function sendDataWithFallback(data, endpoint, priority = 'normal') {
        try {
            // Базовая валидация данных
            if (!data || typeof data !== 'object') {
                Logger.error('sendDataWithFallback: данные должны быть объектом', { data });
                return { success: false, error: 'invalid_data' };
            }
            
            // Проверяем наличие данных локально для повторных попыток
            try {
                if (!window._rivoxRetryChecked) {
                    const retryData = localStorage.getItem('rivox_retry');
                    if (retryData) {
                        try {
                            const retryItems = JSON.parse(retryData);
                            if (Array.isArray(retryItems) && retryItems.length > 0) {
                                Logger.info(`📦 Найдено ${retryItems.length} отложенных запросов. Запланирована повторная попытка.`);
                                setTimeout(processRetryQueue, 5000);
                            }
                        } catch (e) {
                            Logger.error('Ошибка при парсинге данных для повторной отправки:', e);
                            localStorage.removeItem('rivox_retry');
                        }
                    }
                    window._rivoxRetryChecked = true;
                }
            } catch (e) {
                Logger.error('Ошибка при проверке данных для повторной отправки:', e);
            }
            
            // Используем fetch для отправки данных
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-SDK-Version': SDK_VERSION || '1.0'
                    },
                    body: JSON.stringify(data),
                    keepalive: true
                });
            
                // Если получили ошибку 500 или 503, сохраняем для повторной попытки
                if (response.status === 500 || response.status === 503) {
                    Logger.warn(`⚠️ Получена ошибка ${response.status} от сервера. Сохраняем запрос для повторной попытки.`);
                    
                    // Сохраняем запрос для повторной попытки
                    addToRetryQueue(data, endpoint, priority, response.status);
                    
                    // Планируем повторную попытку через 5 секунд
                    setTimeout(processRetryQueue, 5000);
                    
                    return { 
                        success: false, 
                        error: `server_error_${response.status}`, 
                        will_retry: true 
                    };
                }
                
                // Обрабатываем успешный ответ
                if (response.ok) {
                    return { success: true, status: response.status };
                } else {
                    return { 
                        success: false, 
                        error: `http_error_${response.status}`, 
                        status: response.status 
                    };
                }
            } catch (fetchError) {
                Logger.error('Ошибка при отправке данных через fetch:', fetchError);
            
                // Сохраняем запрос для повторной попытки в случае сетевой ошибки
                if (fetchError instanceof TypeError || 
                    (fetchError.message && fetchError.message.includes('network'))) {
                    Logger.warn('⚠️ Сетевая ошибка. Сохраняем запрос для повторной попытки.');
                    
                    // Сохраняем запрос для повторной попытки
                    addToRetryQueue(data, endpoint, priority, 'network_error');
                    
                    // Планируем повторную попытку через 5 секунд
                    setTimeout(processRetryQueue, 5000);
                    
                    return { success: false, error: 'network_error', will_retry: true };
                }
                
                return { success: false, error: fetchError.message };
            }
        } catch (error) {
            Logger.error('Неожиданная ошибка при отправке данных:', error);
            return { success: false, error: 'unexpected_error', message: error.message };
        }
    }
    
    // Функция добавления запроса в очередь повторных попыток
    function addToRetryQueue(data, endpoint, priority, errorCode) {
                try {
            // Получаем текущую очередь из localStorage
            let retryQueue = [];
            const retryData = localStorage.getItem('rivox_retry');
            
            if (retryData) {
                try {
                    const parsedData = JSON.parse(retryData);
                    if (Array.isArray(parsedData)) {
                        retryQueue = parsedData;
                    }
                } catch (e) {
                    Logger.error('Ошибка при парсинге данных очереди повторных попыток:', e);
                }
            }
            
            // Ограничиваем размер очереди
            if (retryQueue.length >= 20) {
                // Удаляем самые старые элементы
                retryQueue = retryQueue.slice(-19);
            }
            
            // Добавляем новый элемент
            retryQueue.push({
                data: data,
                endpoint: endpoint,
                priority: priority,
                timestamp: Date.now(),
                error: errorCode,
                attempts: 0
            });
            
            // Сохраняем обновленную очередь
            localStorage.setItem('rivox_retry', JSON.stringify(retryQueue));
            
            Logger.info(`📦 Запрос добавлен в очередь повторных попыток (всего: ${retryQueue.length})`);
        } catch (e) {
            Logger.error('Ошибка при добавлении запроса в очередь повторных попыток:', e);
                }
            }
            
    // Функция обработки очереди повторных попыток
    function processRetryQueue() {
        try {
            // Получаем очередь из localStorage
            const retryData = localStorage.getItem('rivox_retry');
            if (!retryData) {
                return;
            }
            
            let retryQueue;
            try {
                retryQueue = JSON.parse(retryData);
                if (!Array.isArray(retryQueue) || retryQueue.length === 0) {
                    return;
                }
            } catch (e) {
                Logger.error('Ошибка при парсинге данных очереди повторных попыток:', e);
                localStorage.removeItem('rivox_retry');
                return;
            }
            
            Logger.info(`🔄 Обработка очереди повторных попыток (${retryQueue.length} элементов)...`);
            
            // Создаем новую очередь для запросов, которые снова завершились ошибкой
            let newRetryQueue = [];
            
            // Обрабатываем не более 5 запросов за раз
            const itemsToProcess = retryQueue.slice(0, 5);
            const remainingItems = retryQueue.slice(5);
            
            // Добавляем оставшиеся элементы в новую очередь
            newRetryQueue = [...remainingItems];
            
            // Обрабатываем каждый элемент
            Promise.all(itemsToProcess.map(async (item) => {
                try {
                    // Увеличиваем счетчик попыток
                    item.attempts = (item.attempts || 0) + 1;
                    
                    // Пропускаем элементы с большим количеством попыток
                    if (item.attempts > 3) {
                        Logger.warn('❌ Запрос удален после 3 неудачных попыток:', {
                            endpoint: item.endpoint,
                            error: item.error
                        });
                        return;
                    }
                    
                    Logger.info(`🔄 Повторная отправка запроса (попытка ${item.attempts}/3): ${item.endpoint}`);
                    
                    // Добавляем информацию о повторной попытке
                    const retryData = {
                        ...item.data,
                        retry_attempt: item.attempts,
                        retry_timestamp: Date.now(),
                        original_error: item.error
                    };
                    
                    // Отправляем запрос
                    const response = await fetch(item.endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-SDK-Version': SDK_VERSION || '1.0',
                            'X-Retry-Attempt': String(item.attempts)
                        },
                        body: JSON.stringify(retryData),
                        keepalive: true
                    });
                    
                    if (response.ok) {
                        Logger.info('✅ Повторная отправка успешна!');
                    } else if (response.status === 500 || response.status === 503) {
                        // Если снова ошибка, возвращаем в очередь
                        Logger.warn(`⚠️ Снова получена ошибка ${response.status}. Возвращаем в очередь.`);
                        newRetryQueue.push({
                            ...item,
                            data: retryData,
                            error: response.status,
                            timestamp: Date.now()
                        });
                    }
                } catch (e) {
                    Logger.error('Ошибка при повторной отправке запроса:', e);
                    
                    // Возвращаем элемент в очередь
                    if (item.attempts < 3) {
                        newRetryQueue.push({
                            ...item,
                            error: 'retry_error',
                            timestamp: Date.now()
                        });
                    }
                }
            })).finally(() => {
                // Сохраняем обновленную очередь
                localStorage.setItem('rivox_retry', JSON.stringify(newRetryQueue));
                
                // Если в очереди остались элементы, планируем следующую попытку
                if (newRetryQueue.length > 0) {
                    setTimeout(processRetryQueue, 5000);
                }
            });
        } catch (e) {
            Logger.error('Ошибка при обработке очереди повторных попыток:', e);
        }
    }
    
    // Функция для рекурсивного копирования объекта без циклических ссылок
    function deepCopy(obj, seen = new WeakMap()) {
        // Обработка примитивов и null
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        // Проверка на циклические ссылки
        if (seen.has(obj)) {
            return '[Circular]'; // Возвращаем маркер вместо undefined
        }
        
        // Добавляем объект в множество просмотренных
        seen.set(obj, true);
        
        // Обработка Date, RegExp, и других встроенных объектов
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof RegExp) return new RegExp(obj);
        if (obj instanceof URL) return new URL(obj.toString());
        if (obj instanceof Blob) return obj.slice(0, obj.size, obj.type);
        if (obj instanceof File) return new File([obj.slice(0, obj.size)], obj.name, { type: obj.type });
        if (obj instanceof ArrayBuffer) return obj.slice(0);
        
        // Проверка на DOM элементы и объекты окна
        if (typeof window !== 'undefined') {
            if (obj instanceof Node || obj instanceof Window) {
                return '[DOM]'; // Возвращаем маркер для DOM элементов
            }
        }
        
        // Обработка массивов
        if (Array.isArray(obj)) {
            const arr = [];
            for (let i = 0; i < obj.length; i++) {
                try {
                    arr[i] = deepCopy(obj[i], seen);
                } catch (e) {
                    arr[i] = null; // Заменяем проблемные значения на null
                }
            }
            return arr;
        }
        
        // Обработка функций
        if (typeof obj === 'function') {
            return '[Function]'; // Возвращаем маркер вместо null
        }
        
        // Обработка объектов с методом toJSON (например, для DOM-элементов)
        if (typeof obj.toJSON === 'function') {
            try {
                return JSON.parse(JSON.stringify(obj));
            } catch (e) {
                return '[Object]';
            }
        }
        
        // Обработка BigInt
        if (typeof obj === 'bigint') {
            return obj.toString();
        }
        
        // Обработка обычных объектов
        const copy = {};
        
        // Копируем только собственные свойства
        for (const key of Object.keys(obj)) {
            try {
                // Пропускаем функции и специальные свойства
                if (typeof obj[key] === 'function' || key.startsWith('_')) {
                    continue;
                }
                
                // Рекурсивно копируем вложенные объекты
                copy[key] = deepCopy(obj[key], seen);
            } catch (e) {
                copy[key] = '[Error]'; // Маркируем проблемные свойства
            }
        }
        
        return copy;
    }
    
    // Буфер для повторных отправок данных
    let sendQueue = [];
    const maxQueueSize = 20;
    let queueTimer = null;
    
    // Добавление данных в очередь отправки
    function saveQueueToStorage() {
        try {
            // Ограничиваем размер очереди перед сохранением
            if (sendQueue.length > maxQueueSize) {
                sendQueue = sendQueue.slice(-maxQueueSize);
            }
            
            // Сохраняем очередь в localStorage
            localStorage.setItem('rivox_send_queue', JSON.stringify(sendQueue));
        } catch (e) {
            Logger.error('Ошибка при сохранении очереди в localStorage:', e);
        }
    }
    
    // Загрузка очереди из localStorage
    function loadQueueFromStorage() {
        try {
            const queueJson = localStorage.getItem('rivox_send_queue');
            if (queueJson) {
                const loadedQueue = JSON.parse(queueJson);
                if (Array.isArray(loadedQueue)) {
                    sendQueue = loadedQueue;
                    Logger.info(`Загружена очередь отправки (${sendQueue.length} элементов)`);
                    
                    // Запускаем обработку очереди
                    if (sendQueue.length > 0 && !queueTimer) {
                        queueTimer = setTimeout(processSendQueue, 5000);
                    }
                }
            }
        } catch (e) {
            Logger.error('Ошибка при загрузке очереди из localStorage:', e);
            sendQueue = [];
        }
    }
    
    // Обработка очереди отправки
    async function processSendQueue() {
        // Очищаем таймер
        queueTimer = null;
        
        try {
            // Проверяем, есть ли элементы в очереди
            if (sendQueue.length === 0) {
                return;
            }
            
            Logger.info(`Обработка очереди отправки (${sendQueue.length} элементов)`);
            
            // Копируем очередь для итерации
            const currentQueue = [...sendQueue];
            sendQueue = [];
            
            // Обрабатываем каждый элемент
            for (const item of currentQueue) {
                try {
                    // Увеличиваем счетчик попыток
                    item.attempts = (item.attempts || 0) + 1;
                    
                    // Пропускаем элементы, которые пытались отправить более 5 раз
                    if (item.attempts > 5) {
                        Logger.warn('Элемент удален из очереди после 5 неудачных попыток:', {
                            endpoint: item.endpoint,
                            timestamp: item.timestamp
                        });
                        continue;
                    }
                    
                    // Добавляем информацию о повторной попытке
                    item.data.retry_attempt = item.attempts;
                    item.data.original_timestamp = item.data.timestamp || item.timestamp;
                    item.data.retry_timestamp = Date.now();
                    
                    // Пытаемся отправить данные
                    Logger.debug(`Повторная отправка данных (попытка ${item.attempts}/5)`, {
                        endpoint: item.endpoint,
                        original: item.timestamp,
                        reason: item.reason
                    });
                    
                    // Используем только Fetch API для повторных отправок
                    try {
                        const response = await fetch(item.endpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Retry-Attempt': String(item.attempts)
                            },
                            body: JSON.stringify(item.data),
                            keepalive: true
                        });
                        
                        if (response.ok) {
                            Logger.info('✅ Повторная отправка успешна', {
                                endpoint: item.endpoint,
                                status: response.status
                            });
                            continue; // Успешно отправлено, переходим к следующему элементу
                        } else {
                            Logger.warn('⚠️ Сервер вернул ошибку при повторной отправке:', {
                                status: response.status,
                                statusText: response.statusText
                            });
                            sendQueue.push(item); // Возвращаем в очередь
                        }
                    } catch (e) {
                        Logger.warn('❌ Ошибка при повторной отправке:', e);
                        sendQueue.push(item); // Возвращаем в очередь
                    }
                } catch (e) {
                    Logger.error('Ошибка при обработке элемента очереди:', e);
                }
            }
            
            // Сохраняем оставшиеся элементы
            saveQueueToStorage();
            
            // Если остались элементы, планируем следующую попытку
            if (sendQueue.length > 0) {
                const nextAttemptDelay = 60000; // 1 минута
                Logger.info(`Запланирована следующая попытка отправки через ${nextAttemptDelay/1000} сек`);
                queueTimer = setTimeout(processSendQueue, nextAttemptDelay);
            }
        } catch (e) {
            Logger.error('Неожиданная ошибка при обработке очереди отправки:', e);
            
            // Восстанавливаем таймер в случае ошибки
            if (sendQueue.length > 0 && !queueTimer) {
                queueTimer = setTimeout(processSendQueue, 60000);
            }
        }
    }

    // Функция для генерации UUID 
    function generateUUID() {
        try {
            // Используем crypto API если доступен
            if (window.crypto && window.crypto.randomUUID) {
                return window.crypto.randomUUID();
            }
            
            // Резервный вариант
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        } catch (e) {
            // Максимально простой резервный вариант
            return 'r' + Date.now() + Math.random().toString(36).substring(2, 15);
        }
    }

    // ВАЖНО: Не переопределяем sendQueue, используем существующую переменную
    // Максимальный размер очереди отправки установлен выше (MAX_SEND_QUEUE_SIZE)
    
    // Флаг, указывающий, обрабатывается ли сейчас очередь
    let isProcessingSendQueue = false;

    // Последнее время успешной отправки данных
    let lastSuccessfulSendTime = 0;

    // Загружаем очередь из localStorage при инициализации
    function loadSendQueue() {
        try {
            const queueData = localStorage.getItem('rivox_send_queue');
            if (queueData) {
                const parsedQueue = JSON.parse(queueData);
                if (Array.isArray(parsedQueue)) {
                    sendQueue = parsedQueue.map(item => {
                        // Обновляем timestamp последней попытки для предотвращения моментальной повторной отправки
                        return {
                            ...item,
                            lastAttempt: Date.now() - (60000 * 5) // Даем 5 минут перед первой попыткой
                        };
                    });
                    Logger.info(`Загружена очередь отправки из хранилища: ${sendQueue.length} записей`);
                    
                    // Проверяем, нет ли испорченных данных
                    validateSendQueue();
                }
            }
        } catch (e) {
            Logger.error('Ошибка при загрузке очереди отправки:', e);
            
            // Пытаемся восстановить очередь из резервной копии
            try {
                const backupData = localStorage.getItem('rivox_send_queue_backup');
                if (backupData) {
                    sendQueue = JSON.parse(backupData);
                    Logger.warn('Очередь восстановлена из резервной копии, размер:', sendQueue.length);
                    saveSendQueue(); // Сохраняем восстановленную очередь
                } else {
                    // Если и резервная копия недоступна, создаем новую очередь
                    sendQueue = [];
                    saveSendQueue();
                }
            } catch (eBackup) {
                Logger.error('Не удалось восстановить очередь из резервной копии:', eBackup);
                sendQueue = []; // Создаем новую очередь
                saveSendQueue();
            }
        }
    }

    // Проверяем очередь на наличие поврежденных данных
    function validateSendQueue() {
        let initialLength = sendQueue.length;
        let validItems = [];
        
        for (let i = 0; i < sendQueue.length; i++) {
            try {
                const item = sendQueue[i];
                
                // Проверяем наличие обязательных полей
                if (!item || !item.data || !item.endpoint) {
                    continue;
                }
                
                // Проверяем наличие минимально необходимых данных
                if (!item.data.client_id || !item.data.session_id) {
                    continue;
                }
                
                // Проверяем, что item.data можно сериализовать
                JSON.stringify(item.data);
                
                // Если все проверки прошли, добавляем элемент в валидный список
                validItems.push(item);
            } catch (e) {
                Logger.warn(`Поврежденный элемент в очереди отправки в позиции ${i}:`, e);
            }
        }
        
        // Если были обнаружены поврежденные элементы, обновляем очередь
        if (validItems.length < initialLength) {
            Logger.warn(`Удалено ${initialLength - validItems.length} поврежденных элементов из очереди`);
            sendQueue = validItems;
            saveSendQueue();
        }
    }

    // Сохраняем очередь в localStorage
    function saveSendQueue() {
        try {
            // Ограничиваем размер очереди
            if (sendQueue.length > MAX_SEND_QUEUE_SIZE) {
                // Сортируем по приоритету, затем по времени
                sendQueue.sort((a, b) => {
                    // Сначала по приоритету (критический выше)
                    if (a.priority === 'critical' && b.priority !== 'critical') return -1;
                    if (a.priority !== 'critical' && b.priority === 'critical') return 1;
                    
                    // Затем по времени (более новые выше)
                    return b.timestamp - a.timestamp;
                });
                
                // Отсекаем лишние элементы, сохраняя более приоритетные
                sendQueue = sendQueue.slice(0, MAX_SEND_QUEUE_SIZE);
                Logger.warn(`Очередь отправки превысила лимит, обрезана до ${MAX_SEND_QUEUE_SIZE} элементов`);
            }
            
            // Создаем резервную копию перед сохранением новой версии
            const currentQueueData = localStorage.getItem('rivox_send_queue');
            if (currentQueueData) {
                localStorage.setItem('rivox_send_queue_backup', currentQueueData);
            }
            
            // Сохраняем текущую версию
            localStorage.setItem('rivox_send_queue', JSON.stringify(sendQueue));
        } catch (e) {
            Logger.error('Ошибка при сохранении очереди отправки:', e);
            
            // Пытаемся сохранить в упрощенном формате
            try {
                // Создаем упрощенную версию данных
                const simplifiedQueue = sendQueue.map(item => {
                    // Копируем только необходимые базовые поля
                    return {
                        timestamp: item.timestamp || Date.now(),
                        lastAttempt: item.lastAttempt || 0,
                        attempts: item.attempts || 0,
                        endpoint: item.endpoint,
                        priority: item.priority || 'normal',
                        error: item.error,
                        data: {
                            client_id: item.data.client_id,
                            session_id: item.data.session_id,
                            data_type: item.data.data_type || 'event',
                            timestamp: item.data.timestamp || Date.now(),
                            // Добавляем информацию об ошибке сериализации
                            error_recovery: true
                        }
                    };
                });
                
                localStorage.setItem('rivox_send_queue', JSON.stringify(simplifiedQueue));
                Logger.warn('Очередь сохранена в упрощенном формате из-за ошибки сериализации');
            } catch (e2) {
                Logger.error('Не удалось сохранить даже упрощенную очередь:', e2);
            }
        }
    }

    // Добавляем данные в очередь для повторной отправки
    function addToSendQueue(data, endpoint, errorReason = null) {
        // Проверяем, не достигнут ли предел очереди
        if (sendQueue.length >= MAX_SEND_QUEUE_SIZE) {
            // Находим наименее важный элемент для замены
            let leastImportantIndex = -1;
            let leastImportantPriority = 'critical';
            
            for (let i = 0; i < sendQueue.length; i++) {
                // Пропускаем элементы с критическим приоритетом
                if (sendQueue[i].priority !== 'critical' && 
                    (leastImportantPriority === 'critical' || 
                     sendQueue[i].timestamp < sendQueue[leastImportantIndex].timestamp)) {
                    leastImportantIndex = i;
                    leastImportantPriority = sendQueue[i].priority;
                }
            }
            
            // Если очередь заполнена критическими элементами, и новый не критический - пропускаем
            if (leastImportantIndex === -1 && data.priority !== 'critical') {
                Logger.warn('Очередь отправки заполнена критическими элементами, новый элемент отброшен');
                return;
            }
            
            // Если нашли некритический элемент или новый элемент критический - заменяем
            if (leastImportantIndex !== -1) {
                Logger.info('Заменяем наименее важный элемент в очереди отправки');
                sendQueue[leastImportantIndex] = {
                    data,
                    endpoint,
                    timestamp: Date.now(),
                    lastAttempt: 0,
                    attempts: 0,
                    priority: data.priority || 'normal',
                    error: errorReason
                };
            } else {
                // Просто отбрасываем самый старый элемент
                sendQueue.shift();
                sendQueue.push({
                    data,
                    endpoint,
                    timestamp: Date.now(),
                    lastAttempt: 0,
                    attempts: 0,
                    priority: data.priority || 'normal',
                    error: errorReason
                });
            }
        } else {
            // Если очередь не заполнена, просто добавляем новый элемент
            sendQueue.push({
                data,
                endpoint,
                timestamp: Date.now(),
                lastAttempt: 0,
                attempts: 0,
                priority: data.priority || 'normal',
                error: errorReason
            });
        }
        
        // Сохраняем обновленную очередь
        saveSendQueue();
        
        // Запускаем обработку очереди
        setTimeout(processSendQueue, 100);
        
        Logger.info(`Добавлены данные в очередь отправки. Текущий размер: ${sendQueue.length}`);
    }

    // Обрабатываем очередь отправки
    async function processSendQueue() {
        try {
            // Проверяем, не обрабатывается ли очередь уже
            if (isProcessingSendQueue) {
                return;
            }
            
            // Проверяем, есть ли данные в очереди
            if (sendQueue.length === 0) {
                return;
            }
            
            // Устанавливаем флаг обработки
            isProcessingSendQueue = true;
            
            // Вычисляем временной интервал до следующей попытки на основе количества попыток
            // Используем экспоненциальную задержку: 5с, 15с, 45с, 2м, 5м, 15м, 30м, 1ч, 3ч, 6ч
            function getRetryDelay(attempts) {
                const base = 5000; // 5 секунд
                if (attempts <= 0) return 0;
                if (attempts > 10) attempts = 10; // Максимальная задержка после 10 попыток
                
                // Экспоненциальная задержка с множителем ~3
                return base * Math.pow(3, attempts - 1);
            }
            
            // Проверяем состояние сети
            let isOnline = navigator.onLine !== false; // Считаем онлайн, если свойство не определено
            
            // Если в оффлайне - откладываем обработку
            if (!isOnline) {
                isProcessingSendQueue = false;
                Logger.debug('Отложена обработка очереди из-за отсутствия сети');
                return;
            }
            
            // Обрабатываем по одному элементу за раз, чтобы не блокировать поток
            for (let i = 0; i < sendQueue.length; i++) {
                const item = sendQueue[i];
                const now = Date.now();
                
                // Пропускаем, если прошло мало времени с последней попытки
                const retryDelay = getRetryDelay(item.attempts);
                if (item.lastAttempt && (now - item.lastAttempt) < retryDelay) {
                    continue;
                }
                
                // Обновляем время последней попытки и количество попыток
                item.lastAttempt = now;
                item.attempts = (item.attempts || 0) + 1;
                
                // Логируем информацию о попытке
                Logger.debug(`Попытка #${item.attempts} отправки данных из очереди`, {
                    timestamp: new Date(item.timestamp).toISOString(),
                    endpoint: item.endpoint,
                    dataType: item.data.data_type,
                    priority: item.priority
                });
                
                // Если число попыток превысило максимум - удаляем из очереди
                const MAX_ATTEMPTS = 12;
                if (item.attempts > MAX_ATTEMPTS) {
                    Logger.warn(`Превышено максимальное количество попыток (${MAX_ATTEMPTS}), удаляем из очереди`, {
                        dataType: item.data.data_type,
                        client_id: item.data.client_id,
                        session_id: item.data.session_id,
                        timestamp: new Date(item.timestamp).toISOString()
                    });
                    
                    // Удаляем элемент из очереди
                    sendQueue.splice(i, 1);
                    i--; // Корректируем индекс
                    
                    // Сохраняем очередь
                    saveSendQueue();
                    continue;
                }
                
                // Отправляем данные
                try {
                    // Копируем данные чтобы избежать изменения исходных
                    const dataCopy = JSON.parse(JSON.stringify(item.data));
                    
                    // Добавляем информацию о повторной отправке
                    dataCopy.retry_info = {
                        original_timestamp: item.timestamp,
                        attempts: item.attempts,
                        last_error: item.error
                    };
                    
                    // Если прошло много времени, помечаем как историческую отправку
                    if (now - item.timestamp > 3600000) { // 1 час
                        dataCopy.is_historical = true;
                    }
                    
                    // Отправляем с тем же приоритетом, что был у исходных данных
                    const result = await sendDataWithFallback(
                        dataCopy, 
                        item.endpoint, 
                        item.priority
                    );
                    
                    // Если успешно - удаляем из очереди
                    if (result.success) {
                        Logger.info(`✅ Успешно отправлены данные из очереди (попытка #${item.attempts})`, {
                            method: result.method,
                            dataType: item.data.data_type
                        });
                        
                        // Обновляем время последней успешной отправки
                        lastSuccessfulSendTime = now;
                        
                        // Удаляем элемент из очереди
                        sendQueue.splice(i, 1);
                        i--; // Корректируем индекс
                        
                        // Сохраняем очередь
                        saveSendQueue();
                    } else {
                        // Обновляем информацию об ошибке
                        item.error = result.error;
                        
                        // Сохраняем очередь с обновленной информацией о попытке
                        saveSendQueue();
                        
                        Logger.warn(`❌ Не удалось отправить данные из очереди (попытка #${item.attempts})`, {
                            error: result.error,
                            dataType: item.data.data_type,
                            nextRetry: new Date(now + getRetryDelay(item.attempts)).toISOString()
                        });
                    }
                } catch (e) {
                    Logger.error('Ошибка при обработке элемента очереди:', e);
                    
                    // Обновляем информацию об ошибке
                    item.error = e.message || 'unknown';
                    
                    // Сохраняем очередь с обновленной информацией о попытке
                    saveSendQueue();
                }
                
                // Делаем небольшую паузу между отправками элементов очереди
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Проверяем состояние сети после каждой отправки
                isOnline = navigator.onLine !== false;
                if (!isOnline) {
                    Logger.debug('Прерываем обработку очереди из-за потери соединения');
                    break;
                }
            }
            
            // Снимаем флаг обработки
            isProcessingSendQueue = false;
            
            // Если в очереди остались элементы, планируем следующую обработку
            if (sendQueue.length > 0) {
                // Определяем время до следующей обработки
                // Выбираем минимальное время ожидания из всех элементов
                let nextProcessTime = Infinity;
                for (const item of sendQueue) {
                    const retryTime = item.lastAttempt + getRetryDelay(item.attempts);
                    if (retryTime < nextProcessTime) {
                        nextProcessTime = retryTime;
                    }
                }
                
                // Рассчитываем задержку (минимум 5 секунд, максимум 5 минут)
                const delay = Math.max(5000, Math.min(300000, nextProcessTime - Date.now()));
                
                // Планируем следующую обработку
                setTimeout(processSendQueue, delay);
                
                Logger.debug(`Следующая обработка очереди через ${Math.round(delay / 1000)} секунд`);
            }
        } catch (e) {
            Logger.error('Неожиданная ошибка при обработке очереди отправки:', e);
            
            // Снимаем флаг обработки в любом случае
            isProcessingSendQueue = false;
            
            // Планируем повторную попытку через 1 минуту
            setTimeout(processSendQueue, 60000);
        }
    }

    // Настраиваем обработчики событий для отслеживания сетевого подключения
    function setupNetworkListeners() {
        // Обработчик на получение онлайн-статуса
        window.addEventListener('online', function() {
            Logger.info('🌐 Подключение к сети восстановлено');
            
            // Запускаем обработку очереди при восстановлении соединения
            if (sendQueue.length > 0) {
                setTimeout(processSendQueue, 2000); // Небольшая задержка для стабилизации соединения
            }
        });
        
        // Обработчик на потерю соединения
        window.addEventListener('offline', function() {
            Logger.warn('🔌 Соединение с сетью потеряно');
        });
        
        // Обработчик перед выгрузкой страницы
        window.addEventListener('beforeunload', function() {
            // Пытаемся отправить все критические данные с помощью Beacon API
            if (sendQueue.length > 0 && navigator.sendBeacon) {
                // Фильтруем и отправляем только критические данные
                const criticalItems = sendQueue.filter(item => item.priority === 'critical');
                
                if (criticalItems.length > 0) {
                    Logger.info(`Отправляем ${criticalItems.length} критических элементов перед выгрузкой страницы`);
                    
                    // Отправляем каждый элемент отдельно
                    for (const item of criticalItems) {
                        try {
                            // Добавляем информацию о выгрузке страницы
                            const dataCopy = JSON.parse(JSON.stringify(item.data));
                            dataCopy.unload_dispatch = true;
                            
                            // Создаем blob для отправки
                            const blob = new Blob([JSON.stringify(dataCopy)], { type: 'application/json' });
                            
                            // Отправляем через Beacon API
                            navigator.sendBeacon(item.endpoint, blob);
                        } catch (e) {
                            // Ничего не делаем, так как страница выгружается
                        }
                    }
                }
            }
        });
        
        // Проверяем состояние очереди периодически
        setInterval(function() {
            // Если есть элементы в очереди и давно не было успешных отправок, пробуем снова
            if (sendQueue.length > 0 && 
                (Date.now() - lastSuccessfulSendTime) > 300000 && // 5 минут
                !isProcessingSendQueue) {
                
                Logger.debug('Периодическая проверка очереди отправки');
                processSendQueue();
            }
        }, 300000); // Каждые 5 минут
    }

    // Запускаем загрузку очереди и настройку слушателей при инициализации
    function initSendQueueSystem() {
        // Загружаем очередь из хранилища
        loadSendQueue();
        
        // Настраиваем обработчики событий
        setupNetworkListeners();
        
        // Запускаем обработку очереди, если есть данные
        if (sendQueue.length > 0) {
            setTimeout(processSendQueue, 5000); // Задержка для завершения загрузки страницы
        }
        
        // Устанавливаем начальное время успешной отправки
        lastSuccessfulSendTime = Date.now();
        
        Logger.info('Система очереди отправки инициализирована');
    }

    // Вызываем инициализацию очереди
    initSendQueueSystem();

    // Оптимизация дросселирования для событий мыши и скролла
    const originalAddEventListener = window.addEventListener;
    window.addEventListener = function(type, listener, options) {
        // Применяем дросселирование к событиям мыши и скролла
        if (type === 'mousemove' || type === 'scroll') {
            const throttledListener = throttle(listener, type === 'mousemove' ? 100 : 200); // 100ms для мыши, 200ms для скролла
            return originalAddEventListener.call(this, type, throttledListener, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    // Заменяем console.log на условное логирование
    if (!config.debug) {
        // В production режиме блокируем логи
        console.debug = function() {};
        console.log = function() {};
    }

    // Запускаем инициализацию SDK
    Logger.info('Rivox SDK инициализирован, версия:', SDK_VERSION);

    // Удаляем дублирующее объявление
    
    // Батчинг данных для оптимизации отправки
    let dataBatchQueue = [];
    let batchTimeout = null;
    let batchSizeBytes = 0;
    
    // Отправка данных с использованием батчинга
    function sendWithBatching(data, endpoint, priority) {
        // Пропускаем батчинг для критических данных и больших объектов
        if (priority === 'critical' || 
            !config.batchEnabled || 
            JSON.stringify(data).length > config.batchMaxBytes / 2) {
            // Для критических данных используем немедленную отправку
            return sendDataWithFallback(data, endpoint, priority);
        }
        
        // Оцениваем размер данных
        const dataStr = JSON.stringify(data);
        const dataSize = dataStr.length;
        
        // Добавляем данные в очередь
        dataBatchQueue.push({
            data,
            endpoint: endpoint || config.endpoint,
            priority,
            size: dataSize,
            timestamp: Date.now()
        });
        
        // Обновляем общий размер батча
        batchSizeBytes += dataSize;
        
        Logger.debug(`Добавлено в батч (${dataBatchQueue.length} событий, ${Math.round(batchSizeBytes / 1024)}KB)`);
        
        // Проверяем, нужно ли отправить батч немедленно
        const shouldSendNow = 
            dataBatchQueue.length >= config.batchMaxSize || 
            batchSizeBytes >= config.batchMaxBytes;
        
        // Если нужно отправить сейчас, или это первое событие в батче
        if (shouldSendNow || dataBatchQueue.length === 1) {
            // Отменяем существующий таймаут, если он есть
            if (batchTimeout) {
                clearTimeout(batchTimeout);
                batchTimeout = null;
            }
            
            // Устанавливаем новый таймаут или отправляем сразу
            if (shouldSendNow) {
                // Отправляем немедленно, если достигли лимитов
                processBatch();
            } else {
                // Устанавливаем таймаут для отправки
                batchTimeout = setTimeout(processBatch, config.batchDelay);
            }
        }
        
        // Возвращаем промис, который разрешится после отправки
        return Promise.resolve({ 
            success: true, 
            method: 'batched',
            batchSize: dataBatchQueue.length,
            message: 'Data queued for batch sending'
        });
    }
    
    // Обработка и отправка батча данных
    async function processBatch() {
        // Если очередь пуста, нечего отправлять
        if (dataBatchQueue.length === 0) {
            return;
        }
        
        // Получаем текущую очередь и сбрасываем глобальную
        const batchToSend = [...dataBatchQueue];
        dataBatchQueue = [];
        batchSizeBytes = 0;
        batchTimeout = null;
        
        Logger.info(`Отправка батча: ${batchToSend.length} событий`);
        
        try {
            // Группируем события по конечной точке
            const endpointGroups = {};
            
            // Группируем события
            batchToSend.forEach(item => {
                const endpoint = item.endpoint || config.endpoint;
                if (!endpointGroups[endpoint]) {
                    endpointGroups[endpoint] = [];
                }
                endpointGroups[endpoint].push(item.data);
            });
            
            // Отправляем каждую группу событий
            const results = await Promise.all(
                Object.entries(endpointGroups).map(async ([endpoint, dataArray]) => {
                    // Формируем батч-пакет
                    const batchData = {
                        batch: true,
                        client_id: sessionData?.client_id,
                        session_id: sessionData?.session_id,
                        timestamp: Date.now(),
                        count: dataArray.length,
                        items: dataArray
                    };
                    
                    // Отправляем батч
                    try {
                        const result = await sendDataWithFallback(
                            batchData, 
                            endpoint + '/batch', 
                            'batch'
                        );
                        
                        return {
                            endpoint,
                            success: result.success,
                            count: dataArray.length,
                            method: result.method
                        };
                    } catch (e) {
                        Logger.error(`Ошибка отправки батча на ${endpoint}:`, e);
                        return {
                            endpoint,
                            success: false,
                            count: dataArray.length,
                            error: e.message
                        };
                    }
                })
            );
            
            // Логируем результаты
            const successful = results.filter(r => r.success).reduce((sum, r) => sum + r.count, 0);
            const failed = batchToSend.length - successful;
            
            Logger.info(`Результат отправки батча: успешно - ${successful}, неудачно - ${failed}`);
            
            // Если есть неудачные отправки, добавляем их в очередь повторных попыток
            if (failed > 0) {
                const failedItems = results
                    .filter(r => !r.success)
                    .flatMap(result => 
                        batchToSend
                            .filter(item => item.endpoint === result.endpoint)
                            .map(item => ({ 
                                ...item, 
                                error: result.error,
                                retryCount: (item.retryCount || 0) + 1
                            }))
                    );
                
                // Добавляем в очередь только те, которые не превысили лимит попыток
                const itemsToRetry = failedItems.filter(item => 
                    (item.retryCount || 1) <= config.maxRetries
                );
                
                if (itemsToRetry.length > 0) {
                    Logger.warn(`Добавляю ${itemsToRetry.length} элементов в очередь повторных попыток`);
                    
                    // Для каждого элемента добавляем в очередь отправки
                    itemsToRetry.forEach(item => {
                        addToSendQueue(item.data, item.endpoint, item.error);
                    });
                }
            }
            
            return { 
                success: successful > 0,
                total: batchToSend.length,
                successful,
                failed
            };
        } catch (error) {
            Logger.error('Критическая ошибка при обработке батча:', error);
            
            // В случае критической ошибки, добавляем все события в очередь отправки
            batchToSend.forEach(item => {
                addToSendQueue(item.data, item.endpoint, error.message);
            });
            
            return { 
                success: false, 
                error: error.message,
                total: batchToSend.length,
                failed: batchToSend.length
            };
        }
    }
    
    // Вызов в начале unload для отправки всех накопленных данных
    function flushBatchQueue() {
        if (dataBatchQueue.length > 0) {
            // Отменяем существующий таймаут
            if (batchTimeout) {
                clearTimeout(batchTimeout);
                batchTimeout = null;
            }
            
            // Отправляем все накопленные данные
            return processBatch();
        }
        return Promise.resolve({ success: true, message: 'No data to flush' });
    }

    // Добавляем обработку beforeunload для отправки батча
    function setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', function() {
            // Отправляем все накопленные данные в батче
            if (config.batchEnabled) {
                flushBatchQueue();
            }

            // Отправляем критические данные через beacon API (существующий код)
            if (sendQueue && sendQueue.length > 0 && navigator.sendBeacon) {
                // Фильтруем и отправляем только критические данные
                const criticalItems = sendQueue.filter(item => item.priority === 'critical');
                
                if (criticalItems.length > 0) {
                    Logger.info(`Отправляем ${criticalItems.length} критических элементов перед выгрузкой страницы`);
                    
                    // Отправляем каждый элемент отдельно
                    for (const item of criticalItems) {
                        try {
                            // Добавляем информацию о выгрузке страницы
                            const dataCopy = JSON.parse(JSON.stringify(item.data));
                            dataCopy.unload_dispatch = true;
                            
                            // Создаем blob для отправки
                            const blob = new Blob([JSON.stringify(dataCopy)], { type: 'application/json' });
                            
                            // Отправляем через Beacon API
                            navigator.sendBeacon(item.endpoint, blob);
                        } catch (e) {
                            // Ничего не делаем, так как страница выгружается
                        }
                    }
                }
            }
        });
    }
    
    // Вызываем настройку обработчиков
    setupBeforeUnloadHandler();

    // Тестирование батчинга (запускается только в debug режиме)
    if (config.debug) {
        (function testBatch() {
            try {
                Logger.info('🧪 Тестирование батчинга данных');
                
                // Имитация отправки нескольких событий
                for (let i = 0; i < 3; i++) {
                    const testData = {
                        event: `test_event_${i}`,
                        timestamp: Date.now(),
                        test_value: Math.random()
                    };
                    
                    if (config.batchEnabled) {
                        sendWithBatching(testData, null, 'test');
                        Logger.debug(`Тестовое событие #${i} добавлено в батч`);
                    } else {
                        Logger.debug('Батчинг отключен, тест пропускается');
                    }
                }
                
                Logger.info('✅ Тест батчинга завершен, события добавлены в очередь');
            } catch (e) {
                Logger.error('❌ Ошибка при тестировании батчинга:', e);
            }
        })();
    }

    // Ранний запуск перехвата Яндекс.Метрики, даже до полной инициализации SDK
    (function earlyMetrikaInit() {
        try {
            // Проверяем, существует ли уже ym и сохраняем оригинальную функцию
            let originalYM = null;
            if (typeof window.ym === 'function') {
                originalYM = window.ym;
            }
            
            // Устанавливаем временный перехватчик, даже если SDK еще не инициализирован
            window.ym = function(...args) {
                try {
                    // Проверяем тип вызова
                    if (args[1] === 'reachGoal' || args[1] === 'ecommerce') {
                        // Регистрируем вызов
                        const eventType = args[1] === 'reachGoal' ? 'goal' : 'ecommerce';
                        const eventName = args[1] === 'reachGoal' ? args[2] : args[2];
                        const eventParams = args[3] || {};
                        
                        // Сохраняем информацию о событии для последующей обработки SDK
                        if (!window._rivoxPendingYmEvents) {
                            window._rivoxPendingYmEvents = [];
                        }
                        
                        window._rivoxPendingYmEvents.push({
                            type: eventType,
                            counterId: args[0],
                            name: eventName,
                            params: eventParams,
                            timestamp: Date.now()
                        });
                        
                        console.log(`Rivox early capture: ${eventType} "${eventName}"`);
                    }
                } catch (e) {
                    console.warn('Early YM wrap failed', e);
                }
                
                // Вызываем оригинальную функцию, если она существует
                if (originalYM) {
                    return originalYM.apply(this, args);
                }
            };
            
            // Настраиваем проверку наличия SDK и передачу событий
            const checkSDKInterval = setInterval(function() {
                if (window.RIVOX && window.RIVOX.isSessionActive && window._rivoxPendingYmEvents && window._rivoxPendingYmEvents.length) {
                    console.log(`Передача ${window._rivoxPendingYmEvents.length} ранних событий в SDK`);
                    
                    // Обрабатываем накопленные события
                    window._rivoxPendingYmEvents.forEach(event => {
                        if (event.type === 'goal') {
                            if (typeof handleMetrikaGoal === 'function') {
                                handleMetrikaGoal(event.counterId, event.name, event.params);
                            }
                        } else if (event.type === 'ecommerce') {
                            if (typeof handleMetrikaEcommerce === 'function') {
                                handleMetrikaEcommerce(event.counterId, event.name, event.params);
                            }
                        }
                    });
                    
                    // Очищаем накопленные события
                    window._rivoxPendingYmEvents = [];
                    
                    // Прекращаем проверку
                    clearInterval(checkSDKInterval);
                }
            }, 1000);
        } catch (e) {
            console.error('Error in early Metrika setup:', e);
        }
    })();

    // Добавляем функцию для обработки целей Метрики
    function logMetrikaGoal(goalName, params = {}) {
        if (!sessionData) {
            // Queue the goal if session is not initialized
            if (!window._rivoxPendingYmGoals) {
                window._rivoxPendingYmGoals = [];
            }
            window._rivoxPendingYmGoals.push({ goalName, params });
            dbg('[Rivox SDK] goal queued (no session yet):', goalName);
            return true;
        }
        
        if (!sessionData.metrika_goals) {
            sessionData.metrika_goals = [];
        }
        
        // Добавляем цель в массив
        sessionData.metrika_goals.push({
            name: goalName,
            params,
            timestamp: Date.now()
        });
        
        // Устанавливаем флаг конверсии
        sessionData.has_conversion = true;
        
        // Отправляем данные на сервер
        sendDataGuaranteed('metrika_goal_' + goalName);
        
        console.log(`[Rivox SDK] Цель Метрики зарегистрирована: ${goalName}`);
        
        return true;
    }

    async function init() {
        // ... existing code ...
    }

    // Добавляем функцию для генерации примера проблемного запроса
    // Это поможет воспроизвести и отладить ошибку
    function generateProblemRequest() {
      // Этот код запускается только при отладке
      if (window.location.hostname.includes('sotovik') || window.debugRivox) {
        console.debug('Generating problematic request examples for debugging...');
        
        try {
          // Пример 1: Undefined в jsonString
          const badExample1 = {
            event: null,
            payload: { test: undefined },
            timestamp: Date.now()
          };
          
          // Пример 2: Циклическая ссылка
          const badExample2 = {
            event: 'test',
            payload: {}
          };
          badExample2.payload.self = badExample2; // Создаем циклическую ссылку
          
          // Пример 3: Неверный URL
          const goodData = {
            event: 'test',
            timestamp: Date.now()
          };
          
          console.debug('Test examples generated. Run them with:');
          console.debug('1. sendViaImageBeacon("/logs", undefined, "test")');
          console.debug('2. sendViaImageBeacon("/logs", ' + JSON.stringify(badExample1) + ', "test")');
          console.debug('3. sendViaImageBeacon(undefined, ' + JSON.stringify(goodData) + ', "test")');
        } catch (e) {
          console.error('Error generating debug examples:', e);
        }
      }
    }

    // Вызываем генерацию примеров при загрузке для отладки
    setTimeout(function() {
      if (window.location.hostname.includes('sotovik')) {
        generateProblemRequest();
        console.debug('[SOTOVIK DEBUG] SDK initialized and debug helpers ready');
      }
    }, 5000);

    // Добавляем функции безопасной обработки URL и параметров 
    // после существующих объявлений глобальных переменных
    // ... existing code ...
    // Флаг обработки очереди данных
    let isProcessingQueue = false;

    // Функции безопасной обработки для всех маршрутов
    const SafeRouteUtils = {
      // Безопасно создает URL с параметрами запроса
      createSafeUrl: function(baseUrl, params = {}, method = 'GET') {
        try {
          // Проверяем базовый URL
          if (!baseUrl || typeof baseUrl !== 'string') {
            console.error('Invalid base URL:', baseUrl);
            return 'https://rivox-data-handler-779203791697.europe-central2.run.app/error?reason=invalid_url';
          }
          
          // Для GET запросов добавляем параметры к URL
          if (method === 'GET') {
            // Безопасно обрабатываем параметры
            const safeParams = new URLSearchParams();
            
            Object.keys(params).forEach(key => {
              let value = params[key];
              
              // Специальная обработка для известных параметров
              if (['inv', 'pixel', 'rid'].includes(key)) {
                value = String(value || '');
              }
              
              // Преобразуем объекты в JSON
              if (typeof value === 'object' && value !== null) {
                try {
                  value = JSON.stringify(value);
                } catch (e) {
                  console.error(`Failed to stringify param ${key}:`, e);
                  value = String(value);
                }
              }
              
              // Безопасно преобразуем в строку
              safeParams.append(key, value !== undefined && value !== null ? String(value) : '');
            });
            
            // Добавляем timestamp для предотвращения кэширования
            safeParams.append('_t', Date.now());
            
            // Добавляем информацию о клиенте для отладки
            safeParams.append('domain', window.location.hostname);
            safeParams.append('ua', navigator.userAgent.substring(0, 100));
            
            // Формируем итоговый URL
            return `${baseUrl}?${safeParams.toString()}`;
          }
          
          // Для других методов просто возвращаем базовый URL
          return baseUrl;
        } catch (e) {
          console.error('Error creating safe URL:', e);
          return 'https://rivox-data-handler-779203791697.europe-central2.run.app/error?reason=url_creation_failed';
        }
      },
      
      // Безопасно обрабатывает запрос к /session
      processSessionRequest: function(data, method = 'POST') {
        try {
          // Для GET запросов особая обработка
          if (method === 'GET') {
            // Проверка на мобильные устройства, особенно iPhone
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            
            // Для iOS добавляем дополнительную диагностику
            if (isIOS) {
              console.debug('iOS device detected, using safe session parameters');
              
              // Создаем безопасные параметры для GET запроса
              const sessionParams = {
                client_id: typeof data.client_id === 'string' ? data.client_id : String(data.client_id || ''),
                session_id: typeof data.session_id === 'string' ? data.session_id : String(data.session_id || ''),
                timestamp: Date.now(),
                device: 'ios',
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                format: 'safe'
              };
              
              // Добавляем только безопасные поля с базовой информацией
              return SafeRouteUtils.createSafeUrl(
                'https://rivox-data-handler-779203791697.europe-central2.run.app/session', 
                sessionParams, 
                'GET'
              );
            }
          }
          
          // Для POST запросов просто возвращаем URL
          return 'https://rivox-data-handler-779203791697.europe-central2.run.app/session';
        } catch (e) {
          console.error('Error processing session request:', e);
          return 'https://rivox-data-handler-779203791697.europe-central2.run.app/error?reason=session_processing_failed';
        }
      },
      
      // Проверяет безопасность данных для всех маршрутов
      sanitizePayloadForRoute: function(data, route) {
        try {
          // Проверка на null или undefined
          if (!data) return { error: 'empty_data', timestamp: Date.now() };
          
          // Базовые поля, которые должны быть строками
          const stringFields = ['client_id', 'session_id', 'event'];
          
          // Создаем безопасную копию
          const safeData = { ...data };
          
          // Проверяем и преобразуем строковые поля
          stringFields.forEach(field => {
            if (field in safeData && (typeof safeData[field] !== 'string' || safeData[field] === null)) {
              safeData[field] = String(safeData[field] || '');
            }
          });
          
          // Обеспечиваем наличие timestamp
          if (!safeData.timestamp || typeof safeData.timestamp !== 'number') {
            safeData.timestamp = Date.now();
          }
          
          // Добавляем информацию о маршруте и клиенте
          safeData.route = route;
          safeData.domain = window.location.hostname;
          safeData.user_agent = navigator.userAgent.substring(0, 200);
          
          // Специфические проверки для разных маршрутов
          if (route === '/session') {
            // Убеждаемся, что важные поля для /session корректны
            if (safeData.duration && typeof safeData.duration !== 'number') {
              safeData.duration = parseInt(safeData.duration) || 0;
            }
          }
          
          return safeData;
        } catch (e) {
          console.error(`Error sanitizing payload for ${route}:`, e);
          return { 
            error: 'sanitize_failed', 
            original_error: e.message, 
            timestamp: Date.now(),
            route
          };
        }
      }
    };

    // Дальше идет существующий код...
    // ... existing code ...

    // Модифицируем функцию sendSessionSummary для использования безопасной обработки
    async function sendSessionSummary() {
        try {
            if (!sessionData) {
                Logger.warn('Cannot send session summary: no session data');
                return { success: false, error: 'No session data' };
            }

            // Готовим данные для отправки
            const sessionSummary = prepareSessionDataForSending();
            const dataToSend = {
                ...sessionSummary,
                timestamp: new Date().toISOString(),
                sdk_version: SDK_VERSION,
                data_type: 'session_summary'
            };

            // Проверяем наличие iPhone/Safari для особой обработки
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
            
            if (isIOS && isSafari) {
                // Для iOS Safari используем GET с минимальными данными
                Logger.info('Using iOS Safari compatible session data format');
                
                // Сначала пытаемся отправить минимальные данные через GET
                const safeSessionUrl = SafeRouteUtils.processSessionRequest(dataToSend, 'GET');
                
                try {
                    // Используем Image для GET запроса
                    const img = new Image();
                    img.src = safeSessionUrl;
                    
                    img.onload = function() {
                        Logger.info('iOS Safari session data sent successfully via GET');
                    };
                    
                    img.onerror = function() {
                        Logger.warn('iOS Safari session data send failed via GET, trying POST');
                        // При ошибке пробуем обычный метод
                        sendDataWithFallback(
                            SafeRouteUtils.sanitizePayloadForRoute(dataToSend, '/session'),
                            'https://rivox-data-handler-779203791697.europe-central2.run.app/session', 
                            'critical'
                        );
                    };
                    
                    return { success: true, method: 'ios_safari_get' };
                } catch (e) {
                    Logger.error('iOS Safari GET method failed:', e);
                    // При ошибке пробуем обычный метод
                }
            }

            // Обычный случай - используем батчинг или прямую отправку
            if (config.batchEnabled) {
                return sendWithBatching(
                    SafeRouteUtils.sanitizePayloadForRoute(dataToSend, '/session'), 
                    'https://rivox-data-handler-779203791697.europe-central2.run.app/session', 
                    'regular'
                );
            } else {
                // Используем старый метод с безопасной обработкой данных
                return sendDataWithFallback(
                    SafeRouteUtils.sanitizePayloadForRoute(dataToSend, '/session'),
                    'https://rivox-data-handler-779203791697.europe-central2.run.app/session', 
                    'regular'
                );
            }
        } catch (error) {
            Logger.error('Error sending session summary:', error);
            return { success: false, error: error.message };
        }
    }

    // Улучшаем функцию sendViaImageBeacon для дополнительной защиты от ошибок
    function sendViaImageBeacon(url, data, eventName) {
      try {
        // Проверяем входные данные
        if (!url || typeof url !== 'string') {
          console.error('Invalid URL for Image beacon:', url);
          return;
        }

        // Добавляем отладочную информацию для конкретного клиента
        const isDomainProblematic = window.location.hostname.includes('sotovik');
        if (isDomainProblematic) {
          console.debug('[DEBUG] sendViaImageBeacon payload:', {
            data: data,
            eventName: eventName,
            url: url,
            hostname: window.location.hostname,
            time: new Date().toISOString()
          });
        }

        // Проверяем, к какому маршруту обращаемся
        const route = url.includes('/session') ? '/session' : 
                      url.includes('/logs') ? '/logs' : 
                      url.includes('/batch') ? '/batch' : '/other';
        
        // Применяем безопасную обработку данных в зависимости от маршрута
        const safeData = SafeRouteUtils.sanitizePayloadForRoute(data, route);

        // Безопасная сериализация данных
        let jsonString;
        try {
          jsonString = JSON.stringify(safeData || {});
          if (isDomainProblematic) {
            console.debug('[DEBUG] JSON string length:', jsonString?.length);
          }
        } catch (e) {
          console.error('Failed to stringify data for Image beacon:', e);
          // Отправляем минимальный набор данных
          jsonString = JSON.stringify({
            error: 'data_serialization_failed',
            timestamp: Date.now(),
            event: eventName,
            host: window.location.hostname,
            route: route
          });
        }

        // Полная проверка перед манипуляциями со строкой
        if (!jsonString || typeof jsonString !== 'string') {
          console.error('jsonString is not a valid string:', typeof jsonString, jsonString);
          jsonString = JSON.stringify({
            error: 'invalid_json_string',
            timestamp: Date.now(),
            type: typeof jsonString,
            route: route
          });
        }

        // Безопасное кодирование данных
        let encodedData;
        try {
          encodedData = encodeURIComponent(jsonString);
        } catch (e) {
          console.error('Error encoding URL component:', e);
          encodedData = encodeURIComponent(JSON.stringify({
            error: 'encoding_failed',
            timestamp: Date.now(),
            route: route
          }));
        }

        // Безопасно обрезаем данные до допустимой длины
        let truncatedData;
        try {
          truncatedData = encodedData.length > 2000 ? encodedData.substring(0, 2000) : encodedData;
        } catch (e) {
          console.error('Error truncating encoded data:', e);
          truncatedData = encodeURIComponent(JSON.stringify({
            error: 'truncation_failed',
            timestamp: Date.now(),
            route: route
          }));
        }

        // Формируем итоговый URL с корректной обработкой ошибок и дополнительными параметрами
        const finalUrl = `${url}?method=post&data=${truncatedData}&domain=${encodeURIComponent(window.location.hostname)}&format=safe&device=${encodeURIComponent(getDeviceInfo())}&_t=${Date.now()}`;
        
        if (isDomainProblematic) {
          console.debug('[DEBUG] Final Image URL length:', finalUrl.length);
          
          // Добавляем дополнительную отладку для проблемного клиента
          if (typeof sotovikDebugLog === 'function') {
            sotovikDebugLog('debug', 'Image beacon URL details:', {
              baseUrl: url,
              finalLength: finalUrl.length,
              dataLength: truncatedData.length,
              wasTruncated: encodedData.length > 2000,
              route: route
            });
          }
        }

        const img = new Image();
        img.src = finalUrl;
        
        img.onload = function() {
          if (eventName === 'error' || eventName === 'warning' || isDomainProblematic) {
            console.debug('Rivox log event sent via image beacon successfully:', eventName);
          }
        };
        
        img.onerror = function() {
          if (eventName === 'error' || eventName === 'warning' || isDomainProblematic) {
            console.debug('Rivox log event via image beacon may have failed:', eventName);
            
            // Для проблемного клиента сохраняем детали ошибки
            if (isDomainProblematic && typeof sotovikDebugLog === 'function') {
              sotovikDebugLog('error', 'Image beacon request failed', {
                url: finalUrl.substring(0, 100) + '...',
                timestamp: Date.now(),
                eventName,
                route: route
              });
            }
          }
        };
      } catch (e) {
        // Критические ошибки обрабатываем и логируем
        console.error('Critical error in sendViaImageBeacon:', e.message || e);
        
        // Для отладки проблемного клиента
        if (window.location.hostname.includes('sotovik')) {
          if (typeof sotovikDebugLog === 'function') {
            sotovikDebugLog('error', 'Critical failure in beacon:', {
              message: e.message,
              stack: e.stack,
              eventName: eventName || 'unknown',
              url: url
            });
          } else {
            console.error('[ERROR] Full error details:', {
              message: e.message,
              stack: e.stack,
              data: typeof data,
              url: url,
              time: new Date().toISOString()
            });
          }
        }
      }
    }

    // Вспомогательная функция для получения информации об устройстве
    function getDeviceInfo() {
      try {
        const ua = navigator.userAgent;
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isAndroid = /Android/i.test(ua);
        const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
        const browser = /Chrome/i.test(ua) ? 'chrome' : 
                       /Firefox/i.test(ua) ? 'firefox' : 
                       /Safari/i.test(ua) ? 'safari' : 
                       /Edge/i.test(ua) ? 'edge' : 'other';
        
        return `${isMobile ? 'mobile' : 'desktop'}-${isIOS ? 'ios' : isAndroid ? 'android' : 'other'}-${browser}`;
      } catch (e) {
        return 'unknown';
      }
    }

    // Улучшаем функцию sendDataWithFallback для дополнительной проверки и защиты
    async function sendDataWithFallback(data, endpoint, priority = 'normal') {
      try {
        // Базовая валидация данных
        if (!data || typeof data !== 'object') {
            Logger.error('sendDataWithFallback: данные должны быть объектом', { data });
            return { success: false, error: 'invalid_data' };
        }
        
        // Определяем маршрут из endpoint
        const route = endpoint.includes('/session') ? '/session' : 
                      endpoint.includes('/logs') ? '/logs' : 
                      endpoint.includes('/batch') ? '/batch' : '/other';
        
        // Применяем безопасную обработку данных
        const sanitizedData = SafeRouteUtils.sanitizePayloadForRoute(data, route);
        
        // Создаем копию данных, добавляем уникальный идентификатор запроса
        const requestId = generateUUID();
        
        // Проверяем устройство для особых случаев
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
        
        // Для проблемных клиентов на iOS Safari в случае /session используем GET
        if (window.location.hostname.includes('sotovik') && 
            isIOS && isSafari && route === '/session') {
            
            // Формируем безопасный URL для GET запроса
            const safeUrl = SafeRouteUtils.processSessionRequest(sanitizedData, 'GET');
            
            try {
                // Используем Image для GET запроса
                const img = new Image();
                img.src = safeUrl;
                
                return { success: true, method: 'ios_safari_get', route };
            } catch (e) {
                Logger.error('iOS Safari GET method failed:', e);
                // При ошибке продолжаем обычным методом
            }
        }
        
        // Продолжаем обычной логикой отправки данных
        // ... existing code ...
        
        // Используем безопасные данные во всех последующих операциях
        return { success: true, method: 'fallback_default', route };
      } catch (error) {
        Logger.error('Неожиданная ошибка при отправке данных:', error);
        return { success: false, error: 'unexpected_error', message: error.message };
      }
    }
    // ... existing code ...

})(window); 
