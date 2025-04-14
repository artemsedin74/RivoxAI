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
        sessionTimeout: 30 * 60 * 1000,
        scrollChunkSize: 100,
        hoverThreshold: 1000,
        formInteractionThreshold: 2000,
        allowedDomains: ['spb.sotovik.shop'],
        initDelay: 300,    // Default delay before starting trackers (ms)
        sendDelay: 4000    // Default delay before final send (ms)
    };

    // Session data
    let sessionData = null;

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
            page_views: [],
            scroll_chunks: [],
            hover_events: [],
            form_interactions: [],
            cta_clicks: [],
            modal_interactions: []
        };

        setupEventListeners();

        // Start trackers with configured delay
        setTimeout(() => {
            if (typeof RIVOX.start === 'function') {
                console.log("🟢 RIVOX tracking start");
                RIVOX.start();
            }
        }, userConfig.initDelay);

        // Final send with configured delay
        setTimeout(() => {
            if (typeof RIVOX.sendSessionSummary === 'function') {
                console.log("📤 RIVOX manual send");
                RIVOX.sendSessionSummary();
            }
        }, userConfig.sendDelay);
    }

    // Enhanced event listeners setup
    function setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Scroll tracking with heatmap
        let lastScrollY = window.scrollY;
        window.addEventListener('scroll', throttle(() => {
            const currentScrollY = window.scrollY;
            const scrollDelta = Math.abs(currentScrollY - lastScrollY);
            
            if (scrollDelta >= config.scrollChunkSize) {
                console.log('Scroll event captured:', {
                    position: currentScrollY,
                    delta: scrollDelta
                });
                
                sessionData.scroll_chunks.push({
                    timestamp: Date.now(),
                    position: currentScrollY,
                    delta: scrollDelta,
                    viewport_height: window.innerHeight,
                    document_height: document.documentElement.scrollHeight
                });
                lastScrollY = currentScrollY;
            }
        }, 100));

        // Hover tracking
        document.addEventListener('mouseover', throttle((e) => {
            const target = e.target;
            if (isImportantElement(target)) {
                console.log('Hover event captured:', {
                    element: getElementPath(target)
                });
                
                sessionData.hover_events.push({
                    timestamp: Date.now(),
                    element: getElementPath(target),
                    duration: 0
                });
            }
        }, 100));

        document.addEventListener('mouseout', throttle((e) => {
            const target = e.target;
            if (isImportantElement(target)) {
                const lastHover = sessionData.hover_events[sessionData.hover_events.length - 1];
                if (lastHover) {
                    lastHover.duration = Date.now() - lastHover.timestamp;
                    console.log('Hover duration updated:', lastHover.duration);
                }
            }
        }, 100));

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

    // Send session summary
    async function sendSessionSummary() {
        const endpoint = getEndpointUrl();
        
        if (config.debug) {
            console.log('Preparing to send session data');
        }

        // Prepare final data
        const summary = {
            ...sessionData,
            session_duration: Date.now() - sessionData.start_time,
            domain: window.location.hostname,
            path: window.location.pathname,
            timestamp: new Date().toISOString(),
            sdk_version: '4.6.3'
        };

        try {
            // Try JSONP first
            try {
                if (config.debug) {
                    console.log('Attempting JSONP request');
                }
                await sendDataJSONP(summary);
                if (config.debug) {
                    console.log('Data sent successfully via JSONP');
                }
                return;
            } catch (jsonpError) {
                console.warn('JSONP request failed:', jsonpError);
            }

            // Try sendBeacon as fallback
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(summary)], {
                    type: 'application/json'
                });
                if (navigator.sendBeacon(endpoint, blob)) {
                    if (config.debug) {
                        console.log('Data sent successfully via beacon');
                    }
                    return;
                }
            }

            // Last resort - fetch with no-cors
            if (config.debug) {
                console.log('Attempting fetch with no-cors');
            }
            await fetch(endpoint, {
                method: 'POST',
                mode: 'no-cors',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(summary),
                keepalive: true
            });
            if (config.debug) {
                console.log('Data sent successfully via fetch');
            }
        } catch (error) {
            console.error('Failed to send session data:', error);
        }
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
            console.error(`rivox.js: ❌ ${msg}`, error || '');
        },
        warn: function(msg, data) {
            console.warn(`rivox.js: ⚠️ ${msg}`, data || '');
        },
        success: function(msg, data) {
            console.log(`rivox.js: ✅ ${msg}`, data || '');
        }
    };

    // Auto-initialize after DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(window.RIVOX.init, config.initDelay);
    });

    Logger.success('SDK loaded successfully');
})(window); 
