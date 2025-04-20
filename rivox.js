/**
 * RIVOX SDK - Улучшенный модуль отправки данных
 * Version: 1.0.0
 * 
 * Улучшения:
 * 1. Защита от сетевых сбоев с прогрессивной стратегией повторов
 * 2. Сжатие данных перед отправкой для экономии трафика
 * 3. Расширенная валидация данных перед отправкой
 * 4. Контроль длительности запросов и автоматическое сокращение объема данных
 */

(function(window) {
    'use strict';
    
    // Константы и настройки
    const SDK_VERSION = '1.0.0';
    const MAX_SEND_RETRIES = 5;
    const INITIAL_RETRY_DELAY = 1000; // 1 секунда
    const MAX_RETRY_DELAY = 60000; // 1 минута
    const MAX_REQUEST_DURATION = 30000; // 30 секунд
    const MAX_DATA_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_BEACON_SIZE = 64 * 1024; // 64KB
    const REQUEST_TIMEOUT = 20000; // 20 секунд
    const MAX_SEGMENT_SIZE = 50; // Максимальное число элементов в сегменте
    const COMPRESSION_THRESHOLD = 1024; // Сжимать данные больше 1KB
    
    // Создаем локальный объект для логгирования, если глобальный не доступен
    const Logger = window.Logger || {
        debug: (...args) => console.debug('[Rivox]', ...args),
        info: (...args) => console.info('[Rivox]', ...args),
        warn: (...args) => console.warn('[Rivox]', ...args),
        error: (...args) => console.error('[Rivox]', ...args)
    };
    
    /**
     * Валидирует данные перед отправкой и исправляет распространенные проблемы
     * @param {Object} data - Данные для валидации
     * @returns {Object} Результат валидации {isValid, errors, data}
     */
    function validateData(data) {
        const errors = [];
        let validData = {...data};
        
        // Проверка на null/undefined
        if (!data) {
            return {
                isValid: false,
                errors: ['data_is_null_or_undefined'],
                data: null
            };
        }
        
        // Проверка наличия обязательных полей
        const requiredFields = ['client_id', 'session_id'];
        for (const field of requiredFields) {
            if (!data[field]) {
                errors.push(`missing_${field}`);
                
                // Попытка исправления
                if (field === 'client_id' && window.getClientId) {
                    validData.client_id = window.getClientId();
                    Logger.warn(`Автоматически добавлен client_id: ${validData.client_id}`);
                } else if (field === 'session_id' && window.getSessionId) {
                    validData.session_id = window.getSessionId();
                    Logger.warn(`Автоматически добавлен session_id: ${validData.session_id}`);
                }
            }
        }
        
        // Проверка и коррекция временных меток
        if (data.timestamp && typeof data.timestamp !== 'number') {
            errors.push('invalid_timestamp_type');
            // Исправление
            if (typeof data.timestamp === 'string') {
                try {
                    validData.timestamp = new Date(data.timestamp).getTime();
                } catch (e) {
                    validData.timestamp = Date.now();
                }
            } else {
                validData.timestamp = Date.now();
            }
        }
        
        // Проверка вложенных массивов
        const arrayFields = ['metrika_goals', 'scroll_chunks', 'cta_clicks', 'hover_events', 'form_interactions'];
        for (const field of arrayFields) {
            if (data[field] !== undefined && !Array.isArray(data[field])) {
                errors.push(`invalid_${field}_not_array`);
                validData[field] = [];
            }
        }
        
        // Проверка наличия временной метки
        if (!validData.timestamp) {
            validData.timestamp = Date.now();
        }
        
        // Проверка наличия версии SDK
        if (!validData.sdk_version) {
            validData.sdk_version = SDK_VERSION;
        }
        
        // Проверка размера данных (предупреждение, не ошибка)
        const dataSize = JSON.stringify(validData).length;
        if (dataSize > MAX_DATA_SIZE) {
            errors.push('data_too_large');
            Logger.warn(`Данные слишком большие (${Math.round(dataSize / 1024)} KB), будет применено сегментирование`);
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            data: validData
        };
    }
    
    /**
     * Сжимает данные для уменьшения размера передачи
     * @param {Object} data - Данные для сжатия
     * @returns {Object} Сжатые данные
     */
    function compressData(data) {
        // Копируем, чтобы избежать мутаций исходного объекта
        const compressedData = {...data};
        
        // Оптимизируем размер сообщения, сокращая данные
        
        // 1. Преобразуем названия полей в короткие коды для экономии трафика
        const fieldMapping = {
            client_id: 'cid',
            session_id: 'sid',
            timestamp: 'ts',
            sdk_version: 'sv',
            metrika_goals: 'mg',
            scroll_chunks: 'sc',
            cta_clicks: 'cc',
            hover_events: 'he',
            form_interactions: 'fi',
            user_behavior: 'ub',
            ml_features: 'ml'
        };
        
        // Функция для рекурсивного переименования ключей объекта
        const shortenKeys = (obj, mapping) => {
            if (!obj || typeof obj !== 'object') return obj;
            
            // Для массивов обрабатываем каждый элемент
            if (Array.isArray(obj)) {
                return obj.map(item => shortenKeys(item, mapping));
            }
            
            // Для объектов переименовываем ключи
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                const shortKey = mapping[key] || key;
                result[shortKey] = shortenKeys(value, mapping);
            }
            return result;
        };
        
        // Сжимаем только если размер данных превышает порог
        if (JSON.stringify(data).length > COMPRESSION_THRESHOLD) {
            // 2. Удаляем null/undefined значения
            const removeEmpty = (obj) => {
                if (!obj || typeof obj !== 'object') return obj;
                
                // Для массивов обрабатываем каждый элемент
                if (Array.isArray(obj)) {
                    return obj.map(removeEmpty).filter(x => x !== null && x !== undefined);
                }
                
                // Для объектов удаляем null/undefined значения
                const result = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (value !== null && value !== undefined) {
                        result[key] = removeEmpty(value);
                    }
                }
                return result;
            };
            
            // 3. Округляем числовые значения для экономии
            const roundNumbers = (obj) => {
                if (!obj || typeof obj !== 'object') {
                    if (typeof obj === 'number' && !Number.isInteger(obj)) {
                        return parseFloat(obj.toFixed(2));
                    }
                    return obj;
                }
                
                // Для массивов обрабатываем каждый элемент
                if (Array.isArray(obj)) {
                    return obj.map(roundNumbers);
                }
                
                // Для объектов округляем числовые значения
                const result = {};
                for (const [key, value] of Object.entries(obj)) {
                    result[key] = roundNumbers(value);
                }
                return result;
            };
            
            // Применяем все оптимизации
            return shortenKeys(removeEmpty(roundNumbers(compressedData)), fieldMapping);
        }
        
        // Для небольших данных не применяем сжатие
        return compressedData;
    }
    
    /**
     * Основная функция отправки данных с расширенной обработкой ошибок
     * @param {Object} data - Данные для отправки
     * @param {Object} options - Дополнительные параметры
     * @returns {Promise<Object>} Результат отправки
     */
    async function sendDataEnhanced(data, options = {}) {
        // Валидируем данные перед отправкой
        const validation = validateData(data);
        
        if (!validation.isValid) {
            Logger.warn(`Данные не прошли валидацию: ${validation.errors.join(', ')}`);
            // Если есть критические ошибки, которые не удалось исправить
            if (!validation.data) {
                return {
                    success: false,
                    error: 'Validation failed',
                    errorDetails: validation.errors,
                    code: 'VALIDATION_ERROR'
                };
            }
        }
        
        // Используем исправленные валидатором данные
        const validData = validation.data;
        
        // Подготовка данных для отправки
        const preparedData = {
            ...validData,
            send_timestamp: Date.now(),
            send_attempt: options.retryCount || 0
        };
        
        // Определяем размер данных до сжатия
        const rawData = JSON.stringify(preparedData);
        const rawSize = new Blob([rawData]).size;
        
        // Проверка на слишком большой размер
        if (rawSize > MAX_DATA_SIZE && (!options.isSegment || !options.isRetry)) {
            Logger.warn(`Данные слишком большие: ${Math.round(rawSize / 1024)} KB, сегментируем`);
            return await sendLargeDataInSegmentsEnhanced(preparedData);
        }
        
        // Сжимаем данные, если размер превышает порог
        const dataToSend = rawSize > COMPRESSION_THRESHOLD ? compressData(preparedData) : preparedData;
        
        // Преобразуем в строку JSON для отправки
        const dataStr = JSON.stringify(dataToSend);
        const compressedSize = new Blob([dataStr]).size;
        
        // Логируем информацию о сжатии
        if (rawSize > COMPRESSION_THRESHOLD) {
            const compressionRatio = (1 - (compressedSize / rawSize)) * 100;
            Logger.info(`Сжатие данных: ${Math.round(rawSize / 1024)} KB -> ${Math.round(compressedSize / 1024)} KB (${compressionRatio.toFixed(1)}%)`);
        }
        
        // Получаем конечную точку API
        const apiEndpoint = options.endpoint || getApiEndpoint(); // Функция получения URL должна быть реализована
        
        // Запускаем таймер для контроля длительности запроса
        const requestStartTime = Date.now();
        const requestTimeoutId = setTimeout(() => {
            Logger.warn(`Превышено время ожидания запроса (${REQUEST_TIMEOUT}ms)`);
        }, REQUEST_TIMEOUT);
        
        try {
            // Основной метод: fetch с timeout
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT);
            
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-SDK-Version': SDK_VERSION,
                    'X-Compression': rawSize > COMPRESSION_THRESHOLD ? 'true' : 'false'
                },
                body: dataStr,
                signal: abortController.signal,
                // Другие параметры fetch
                credentials: 'include',
                mode: 'cors',
                keepalive: compressedSize < MAX_BEACON_SIZE // Используем keepalive для небольших запросов
            });
            
            // Очищаем таймауты
            clearTimeout(timeoutId);
            clearTimeout(requestTimeoutId);
            
            const requestDuration = Date.now() - requestStartTime;
            
            if (response.ok) {
                let responseData;
                try {
                    responseData = await response.json();
                } catch (e) {
                    responseData = { status: 'no_json_response' };
                }
                
                Logger.info(`✅ Данные успешно отправлены за ${requestDuration}ms`);
                return {
                    success: true,
                    method: 'fetch',
                    duration: requestDuration,
                    response: responseData
                };
            } else {
                // Обработка HTTP ошибок
                let errorText = '';
                try {
                    errorText = await response.text();
                } catch (e) {
                    errorText = `Error status: ${response.status}`;
                }
                
                // Определяем, нужно ли делать повторную попытку для этой ошибки
                const shouldRetry = response.status >= 500 || response.status === 429;
                
                Logger.warn(`❌ Ошибка HTTP: ${response.status} ${response.statusText} за ${requestDuration}ms`);
                
                // Если нужно повторить и не достигнут лимит попыток
                if (shouldRetry && (!options.retryCount || options.retryCount < MAX_SEND_RETRIES)) {
                    return await retryWithExponentialBackoff(data, options);
                }
                
                // Если достигнут лимит попыток или повтор не нужен
                return {
                    success: false,
                    method: 'fetch',
                    error: `HTTP Error: ${response.status}`,
                    errorDetails: errorText,
                    duration: requestDuration,
                    code: response.status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
                    retryAllowed: shouldRetry,
                    retry: shouldRetry
                };
            }
        } catch (error) {
            // Очищаем таймаут запроса
            clearTimeout(requestTimeoutId);
            
            const requestDuration = Date.now() - requestStartTime;
            const errorMessage = error.name === 'AbortError' ? 'Timeout' : error.message;
            
            Logger.warn(`❌ Ошибка сети: ${errorMessage} за ${requestDuration}ms`);
            
            // Пробуем метод sendBeacon для небольших данных
            if (navigator.sendBeacon && compressedSize < MAX_BEACON_SIZE) {
                try {
                    const beaconBlob = new Blob([dataStr], { type: 'application/json' });
                    const beaconSuccess = navigator.sendBeacon(apiEndpoint, beaconBlob);
                    
                    if (beaconSuccess) {
                        Logger.info(`✅ Данные успешно отправлены через Beacon API (размер: ${compressedSize} байт)`);
                        return {
                            success: true,
                            method: 'beacon',
                            fallback: true,
                            dataSize: compressedSize
                        };
                    }
                } catch (beaconError) {
                    Logger.warn(`❌ Ошибка Beacon API: ${beaconError.message}`);
                }
            }
            
            // Если все еще не удалось отправить и не достигнут лимит повторных попыток
            if (!options.retryCount || options.retryCount < MAX_SEND_RETRIES) {
                return await retryWithExponentialBackoff(data, options);
            }
            
            // Если достигнут лимит повторов, сохраняем для последующей отправки
            const queued = queueForLaterSending(data);
            
            return {
                success: false,
                error: errorMessage,
                duration: requestDuration,
                queued: queued,
                code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
                retryExhausted: options.retryCount >= MAX_SEND_RETRIES
            };
        }
    }
    
    /**
     * Функция повторной отправки с экспоненциальной задержкой
     * @param {Object} data - Данные для отправки
     * @param {Object} options - Параметры отправки
     * @returns {Promise<Object>} Результат повторной отправки
     */
    async function retryWithExponentialBackoff(data, options = {}) {
        const retryCount = (options.retryCount || 0) + 1;
        
        // Вычисляем задержку с экспоненциальным ростом и случайным фактором
        const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount - 1);
        const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15 случайный множитель
        const delay = Math.min(baseDelay * jitter, MAX_RETRY_DELAY);
        
        Logger.info(`🔄 Запланирована повторная отправка через ${Math.round(delay)}ms (попытка ${retryCount}/${MAX_SEND_RETRIES})`);
        
        // Ждем перед повторной отправкой
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Повторный вызов с увеличенным счетчиком попыток
        return await sendDataEnhanced(data, {
            ...options,
            retryCount,
            isRetry: true
        });
    }
    
    /**
     * Функция для отправки больших данных по частям
     * @param {Object} data - Большие данные для отправки
     * @returns {Promise<Object>} Результат отправки
     */
    async function sendLargeDataInSegmentsEnhanced(data) {
        try {
            let segments = [];
            
            // Функция для сегментации массива
            const createSegments = (array, maxSize) => {
                const result = [];
                for (let i = 0; i < array.length; i += maxSize) {
                    result.push(array.slice(i, i + maxSize));
                }
                return result;
            };
            
            // Если есть массив событий, делим его на части
            if (data.batch && Array.isArray(data.events) && data.events.length > MAX_SEGMENT_SIZE) {
                // Сохраняем общие метаданные
                const metaData = {...data};
                delete metaData.events;
                
                // Делим массив событий на сегменты
                const eventSegments = createSegments(data.events, MAX_SEGMENT_SIZE);
                Logger.info(`Большие данные разделены на ${eventSegments.length} сегмента по ${MAX_SEGMENT_SIZE} событий`);
                
                // Создаем сегменты с общими метаданными и частями событий
                segments = eventSegments.map((eventSegment, index) => ({
                    ...metaData,
                    events: eventSegment,
                    segment_info: {
                        index: index + 1,
                        total: eventSegments.length,
                        id: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
                        size: eventSegment.length
                    }
                }));
            } else {
                // Если нет batch или events, делим сами данные по ключам
                const keysToDivide = Object.keys(data).filter(key => 
                    Array.isArray(data[key]) && 
                    data[key].length > MAX_SEGMENT_SIZE &&
                    ['metrika_goals', 'scroll_chunks', 'cta_clicks', 'hover_events', 'form_interactions'].includes(key)
                );
                
                if (keysToDivide.length > 0) {
                    // Берем первый большой массив для сегментации
                    const key = keysToDivide[0];
                    const arrSegments = createSegments(data[key], MAX_SEGMENT_SIZE);
                    
                    Logger.info(`Сегментация по ключу ${key}: создано ${arrSegments.length} сегментов`);
                    
                    // Создаем сегменты с общими данными, но разными частями массива
                    segments = arrSegments.map((arrSegment, index) => {
                        const segmentData = {...data};
                        segmentData[key] = arrSegment;
                        segmentData.segment_info = {
                            index: index + 1,
                            total: arrSegments.length,
                            key,
                            id: `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
                            size: arrSegment.length
                        };
                        return segmentData;
                    });
                } else {
                    // Если нет подходящих массивов, создаем один сегмент с сокращенными данными
                    Logger.warn('Не найдены массивы для сегментации, применяю принудительное сокращение');
                    
                    // Функция для удаления больших объектов и сокращения массивов
                    const reduceLargeObjects = (obj, maxArraySize = 50) => {
                        if (!obj || typeof obj !== 'object') return obj;
                        
                        // Для массивов ограничиваем размер
                        if (Array.isArray(obj)) {
                            return obj.slice(0, maxArraySize);
                        }
                        
                        // Для объектов обрабатываем каждое свойство
                        const result = {};
                        for (const [key, value] of Object.entries(obj)) {
                            // Сокращаем большие вложенные объекты
                            if (value && typeof value === 'object') {
                                if (Array.isArray(value) && value.length > maxArraySize) {
                                    // Для больших массивов сохраняем начало и помечаем как сокращенные
                                    result[key] = value.slice(0, maxArraySize);
                                    result[`${key}_truncated`] = true;
                                    result[`${key}_original_size`] = value.length;
                                } else {
                                    // Для других объектов рекурсивно сокращаем
                                    result[key] = reduceLargeObjects(value, maxArraySize);
                                }
                            } else {
                                result[key] = value;
                            }
                        }
                        return result;
                    };
                    
                    // Создаем один сегмент с сокращенными данными
                    segments = [{
                        ...reduceLargeObjects(data),
                        is_truncated: true,
                        truncation_info: {
                            reason: 'size_limit',
                            original_size: JSON.stringify(data).length,
                            timestamp: Date.now()
                        }
                    }];
                }
            }
            
            // Отправляем сегменты последовательно
            const results = [];
            let successCount = 0;
            let failCount = 0;
            let queuedCount = 0;
            
            for (let i = 0; i < segments.length; i++) {
                Logger.info(`Отправка сегмента ${i + 1}/${segments.length}`);
                
                // Отправляем сегмент с пометкой isSegment
                const result = await sendDataEnhanced(segments[i], {
                    isSegment: true,
                    segmentIndex: i,
                    totalSegments: segments.length
                });
                
                results.push(result);
                
                if (result.success) {
                    successCount++;
                } else if (result.queued) {
                    queuedCount++;
                } else {
                    failCount++;
                }
                
                // Делаем небольшую паузу между отправками сегментов
                if (i < segments.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            
            // Формируем итоговый результат
            return {
                success: successCount === segments.length,
                method: 'segmented',
                segments: {
                    total: segments.length,
                    success: successCount,
                    failed: failCount,
                    queued: queuedCount
                },
                partial_success: successCount > 0 && successCount < segments.length
            };
        } catch (error) {
            Logger.error('Ошибка при отправке сегментированных данных:', error);
            
            // Помещаем в очередь для повторной отправки
            const queued = queueForLaterSending(data);
            
            return {
                success: false,
                error: error.message,
                queued: queued,
                code: 'SEGMENTATION_ERROR'
            };
        }
    }
    
    /**
     * Функция для добавления данных в очередь для отправки позже
     * @param {Object} data - Данные для сохранения
     * @returns {boolean} Успешно ли добавлены данные в очередь
     */
    function queueForLaterSending(data) {
        try {
            // Проверяем наличие localStorage
            if (!window.localStorage) {
                Logger.warn('localStorage недоступен, невозможно сохранить данные для повторной отправки');
                return false;
            }
            
            // Получаем текущую очередь или создаем новую
            let queue = [];
            try {
                const queueStr = localStorage.getItem('rivox_failed_queue');
                queue = queueStr ? JSON.parse(queueStr) : [];
            } catch (e) {
                Logger.warn('Ошибка при чтении очереди из localStorage, создана новая очередь');
                queue = [];
            }
            
            // Добавляем новый элемент в очередь
            queue.push({
                data: data,
                timestamp: Date.now(),
                attempts: 0,
                next_attempt: Date.now() + 60000 // Через 1 минуту
            });
            
            // Ограничиваем размер очереди
            const MAX_QUEUE_SIZE = 20;
            if (queue.length > MAX_QUEUE_SIZE) {
                queue = queue.slice(-MAX_QUEUE_SIZE);
            }
            
            // Сохраняем очередь
            localStorage.setItem('rivox_failed_queue', JSON.stringify(queue));
            
            Logger.info(`Данные добавлены в очередь неотправленных. Размер очереди: ${queue.length}`);
            
            // Планируем отправку данных из очереди
            scheduleQueueProcessing();
            
            return true;
        } catch (error) {
            Logger.error('Не удалось добавить данные в очередь неотправленных:', error);
            return false;
        }
    }
    
    /**
     * Планирует обработку очереди неотправленных данных
     */
    function scheduleQueueProcessing() {
        // Устанавливаем таймер только если его еще нет
        if (!window.rivoxQueueTimer) {
            window.rivoxQueueTimer = setTimeout(() => {
                processQueue();
                window.rivoxQueueTimer = null;
            }, 60000); // Через 1 минуту
        }
    }
    
    /**
     * Обрабатывает очередь неотправленных данных
     */
    async function processQueue() {
        try {
            // Проверяем наличие localStorage
            if (!window.localStorage) {
                return;
            }
            
            // Получаем текущую очередь
            let queue = [];
            try {
                const queueStr = localStorage.getItem('rivox_failed_queue');
                if (!queueStr) return;
                queue = JSON.parse(queueStr);
            } catch (e) {
                Logger.warn('Ошибка при чтении очереди из localStorage:', e);
                return;
            }
            
            if (queue.length === 0) {
                return;
            }
            
            Logger.info(`Обработка очереди неотправленных данных (${queue.length} элементов)`);
            
            // Фильтруем элементы, готовые для повторной отправки
            const now = Date.now();
            const itemsToProcess = queue.filter(item => now >= item.next_attempt);
            
            if (itemsToProcess.length === 0) {
                // Если нет готовых элементов, планируем следующую проверку
                scheduleNextQueueCheck(queue);
                return;
            }
            
            // Ограничиваем количество одновременных отправок
            const maxBatchSize = 5;
            const batchToSend = itemsToProcess.slice(0, maxBatchSize);
            
            // Отправляем элементы и обновляем очередь
            const processResults = await Promise.all(
                batchToSend.map(async (item) => {
                    // Увеличиваем счетчик попыток
                    item.attempts++;
                    
                    try {
                        // Пытаемся отправить данные
                        const result = await sendDataEnhanced(item.data, {
                            isRetry: true,
                            fromQueue: true,
                            retryCount: item.attempts
                        });
                        
                        // Если успешно или превышено количество попыток, удаляем из очереди
                        if (result.success || item.attempts >= MAX_SEND_RETRIES) {
                            return {
                                item,
                                success: result.success,
                                remove: true
                            };
                        }
                        
                        // Иначе планируем следующую попытку с экспоненциальной задержкой
                        const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, item.attempts);
                        const delay = Math.min(baseDelay, MAX_RETRY_DELAY);
                        item.next_attempt = now + delay;
                        
                        return {
                            item,
                            success: false,
                            remove: false,
                            next_attempt: item.next_attempt
                        };
                    } catch (error) {
                        // В случае ошибки сохраняем элемент, но увеличиваем задержку
                        Logger.error('Ошибка при обработке элемента очереди:', error);
                        
                        // Если превышено количество попыток, удаляем из очереди
                        if (item.attempts >= MAX_SEND_RETRIES) {
                            return {
                                item,
                                success: false,
                                remove: true,
                                error: error.message
                            };
                        }
                        
                        // Иначе планируем следующую попытку через 5 минут
                        item.next_attempt = now + 300000; // 5 минут
                        
                        return {
                            item,
                            success: false,
                            remove: false,
                            error: error.message,
                            next_attempt: item.next_attempt
                        };
                    }
                })
            );
            
            // Обновляем очередь: удаляем успешные элементы и сохраняем остальные
            const updatedQueue = [...queue];
            let successCount = 0;
            
            // Обрабатываем результаты в обратном порядке, чтобы не нарушить индексы
            processResults.sort((a, b) => {
                return queue.indexOf(b.item) - queue.indexOf(a.item);
            }).forEach(result => {
                if (result.success) successCount++;
                
                if (result.remove) {
                    // Удаляем элемент из очереди
                    const index = updatedQueue.indexOf(result.item);
                    if (index !== -1) {
                        updatedQueue.splice(index, 1);
                    }
                }
            });
            
            // Сохраняем обновленную очередь
            localStorage.setItem('rivox_failed_queue', JSON.stringify(updatedQueue));
            
            // Логируем результаты
            Logger.info(`Обработка очереди завершена: ${successCount}/${batchToSend.length} успешно, осталось ${updatedQueue.length} элементов`);
            
            // Планируем следующую проверку, если есть элементы в очереди
            if (updatedQueue.length > 0) {
                scheduleNextQueueCheck(updatedQueue);
            }
        } catch (error) {
            Logger.error('Ошибка при обработке очереди неотправленных данных:', error);
        }
    }
    
    /**
     * Планирует следующую проверку очереди на основе времени следующей попытки
     * @param {Array} queue - Текущая очередь
     */
    function scheduleNextQueueCheck(queue) {
        if (!queue || queue.length === 0) return;
        
        // Находим ближайшее время попытки
        const now = Date.now();
        let nextCheckTime = Infinity;
        
        for (const item of queue) {
            if (item.next_attempt && item.next_attempt < nextCheckTime) {
                nextCheckTime = item.next_attempt;
            }
        }
        
        // Если нет запланированных попыток, устанавливаем по умолчанию через 5 минут
        if (nextCheckTime === Infinity) {
            nextCheckTime = now + 300000; // 5 минут
        }
        
        // Вычисляем задержку до следующей проверки
        const delay = Math.max(1000, nextCheckTime - now); // Минимум 1 секунда
        
        Logger.debug(`Следующая проверка очереди через ${Math.round(delay / 1000)} сек`);
        
        // Устанавливаем таймер
        setTimeout(processQueue, delay);
    }
    
    /**
     * Получает URL API для отправки данных
     * @returns {string} URL API
     */
    function getApiEndpoint() {
        // Эта функция должна возвращать актуальный URL для отправки данных
        // В реальном коде может зависеть от конфигурации, окружения и т.д.
        return window.RIVOX && window.RIVOX.config && window.RIVOX.config.endpoint || 
               'https://rivox-data-handler-779203791697.europe-central2.run.app';
    }
    
    // Экспортируем функции в глобальный объект RIVOX
    if (!window.RIVOX) {
        window.RIVOX = {};
    }
    
    // Добавляем функции в глобальный объект RIVOX
    window.RIVOX.sendDataEnhanced = sendDataEnhanced;
    window.RIVOX.processQueue = processQueue;
    window.RIVOX.validateData = validateData;
    window.RIVOX.compressData = compressData;
    
    // При загрузке скрипта проверяем очередь неотправленных данных
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // Документ уже загружен, запускаем проверку сразу
        setTimeout(processQueue, 3000);
    } else {
        // Документ еще загружается, ждем событие DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(processQueue, 3000);
        });
    }
    
    // Также проверяем очередь перед закрытием страницы
    window.addEventListener('beforeunload', () => {
        // Пытаемся отправить данные с помощью Beacon API
        const queue = [];
        try {
            const queueStr = localStorage.getItem('rivox_failed_queue');
            if (queueStr) {
                const queueData = JSON.parse(queueStr);
                if (queueData && queueData.length > 0 && navigator.sendBeacon) {
                    // Создаем единый объект для отправки
                    const batchData = {
                        batch: true,
                        event_type: 'final_batch',
                        timestamp: Date.now(),
                        events: queueData.map(item => item.data),
                        is_final: true
                    };
                    
                    // Сжимаем данные
                    const compressedData = compressData(batchData);
                    
                    // Отправляем через Beacon API
                    const blob = new Blob([JSON.stringify(compressedData)], { 
                        type: 'application/json' 
                    });
                    navigator.sendBeacon(getApiEndpoint(), blob);
                    
                    Logger.info('Отправлены данные из очереди перед закрытием страницы');
                }
            }
        } catch (e) {
            // Игнорируем ошибки при закрытии страницы
        }
    });
    
    // Сообщаем о готовности модуля
    Logger.info('✅ RIVOX SDK Улучшенный модуль отправки данных загружен');
    
})(window); 
