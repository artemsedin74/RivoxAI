/**
 * Rivox SDK 4.6.3
 * Client-side tracking and analytics
 * (c) 2023-2025 
 */
(function() {
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
                
                console.log(`[Rivox SDK] Перехват цели Яндекс.Метрики: ${goalName}`);
                
                // Если SDK уже инициализирован
                if (window.Rivox && window.Rivox.logMetrikaGoal) {
                    // Используем API SDK для регистрации цели
                    window.Rivox.logMetrikaGoal(goalName, params);
                    console.log(`[Rivox SDK] Цель ${goalName} зарегистрирована через API`);
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
                    
                    console.log(`[Rivox SDK] Цель ${goalName} добавлена в очередь ожидания`);
                }
        } catch (error) {
                console.error('[Rivox SDK] Ошибка при перехвате цели Метрики:', error);
            }
        }
    };
    
    // ВАЖНО: Этот код хранит оригинальную функцию window.ym = function... для её последующего использования
    // Все взаимодействия с Метрикой должны идти через эту функцию

    // Utility logger
    const Logger = (function() {
        // ... existing code ...

        // ... в функции init добавляем обработку отложенных целей ...
        async function init() {
            // ... existing code ...
            
            // Log current domain
            console.log(`[Rivox SDK] Initializing on domain: ${window.location.hostname}`);
            
            // Load failed data to send if exists
            checkAndSendFailedData().catch(console.error);
            
            // Load configuration
            loadConfig();
            
            // Обработка отложенных целей, которые были вызваны до инициализации SDK
            if (window._rivoxPendingGoals && window._rivoxPendingGoals.length > 0) {
                console.log(`[Rivox SDK] Обработка ${window._rivoxPendingGoals.length} отложенных целей`);
                
                // Копируем массив, чтобы избежать проблем с одновременной модификацией
                const pendingGoals = [...window._rivoxPendingGoals];
                // Очищаем хранилище
                window._rivoxPendingGoals = [];
                
                // Обрабатываем каждую цель
                pendingGoals.forEach(goal => {
                    if (!sessionData.metrika_goals) {
                        sessionData.metrika_goals = [];
                    }
                    
                    sessionData.metrika_goals.push({
                        name: goal.name,
                        params: goal.params,
                        timestamp: goal.timestamp
                    });
                    
                    // Устанавливаем флаг конверсии
                    sessionData.has_conversion = true;
                    
                    console.log(`[Rivox SDK] Обработана отложенная цель: ${goal.name}`);
                });
                
                // Отправляем данные на сервер после обработки отложенных целей
                sendDataGuaranteed('pending_goals_processed');
            }
            
            // Wait for Metrika to be ready
            waitForMetrika(() => {
                // ... existing code ...
            });
        }

        // ... existing code ...

        // Добавляем новую функцию для логирования целей Метрики
        function logMetrikaGoal(goalName, params = {}) {
            if (!sessionData) {
                console.error('[Rivox SDK] Невозможно зарегистрировать цель: сессия не инициализирована');
            return false;
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

        // ... existing code ...

        // Возвращаем публичный API SDK
                return { 
            init,
            logEvent,
            // ... existing code ...
            
            // Добавляем новый метод в публичный API
            logMetrikaGoal,
            
            // ... existing getters ...
            get clientId() { return clientId; },
        get sessionId() { return sessionData ? sessionData.session_id : null; },
        get isSessionActive() { return isSessionActive; }
    };
    })(); // Закрываем объявление Logger

    // ... existing code ...
    })();
