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

    // Configuration
    const config = {
        endpoint: 'https://script.google.com/macros/s/AKfycbyEhRvGnzup0KiZCpvZkw_e0Sl5vCImBMEmQjH5omz96qmlYlXhxmqupKBHsXSIKtnW/exec',
        debug: true,
        sessionTimeout: 30 * 60 * 1000,
        scrollChunkSize: 100,
        hoverThreshold: 1000,
        formInteractionThreshold: 2000,
        allowedDomains: ['spb.sotovik.shop'],
        mlFeatures: {
            collectScrollMap: true,
            trackFormInteractions: true,
            trackHoverEvents: true,
            trackCTAClicks: true,
            trackModalInteractions: true,
            analyzeUserPaths: true
        }
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

    // Add trackNavigation function at the top level
    function trackNavigation() {
        const currentDomain = window.location.hostname;
        if (!isAllowedDomain(currentDomain)) {
            console.warn(`Domain ${currentDomain} not found in the list of allowed domains`);
            return;
        }
        
        console.log('Navigation tracked');
        sessionData.page_views.push({
            timestamp: Date.now(),
            url: window.location.href,
            referrer: document.referrer
        });
    }

    // Validate and get endpoint URL
    function getEndpointUrl() {
        // Always return the configured endpoint
        if (config.debug) {
            console.log('Using endpoint:', config.endpoint);
        }
        return config.endpoint;
    }

    // Initialize SDK
    async function initRivoxSDK() {
        const currentDomain = window.location.hostname;
        if (!isAllowedDomain(currentDomain)) {
            console.warn(`Domain ${currentDomain} not found in the list of allowed domains`);
            return;
        }
        
        console.log('RIVOX SDK initializing...');
        
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
            modal_interactions: [],
            utm_data: collectUtmData(),
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

        setupEventListeners();
        setupMLFeatures();
        setupMetrikaGoalsTracking();
        waitScrollAndSend();
        trackNavigation();
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
        if (config.mlFeatures.trackHoverEvents) {
            console.log('Setting up hover tracking...');
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
        }

        // Form interaction tracking
        if (config.mlFeatures.trackFormInteractions) {
            console.log('Setting up form interaction tracking...');
            document.addEventListener('focus', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    console.log('Form focus event captured:', {
                        element: getElementPath(e.target)
                    });
                    
                    sessionData.form_interactions.push({
                        timestamp: Date.now(),
                        type: 'focus',
                        element: getElementPath(e.target)
                    });
                }
            }, true);

            document.addEventListener('blur', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    console.log('Form blur event captured:', {
                        element: getElementPath(e.target)
                    });
                    
                    sessionData.form_interactions.push({
                        timestamp: Date.now(),
                        type: 'blur',
                        element: getElementPath(e.target),
                        value: e.target.value
                    });
                }
            }, true);
        }

        // CTA click tracking
        if (config.mlFeatures.trackCTAClicks) {
            console.log('Setting up CTA click tracking...');
            document.addEventListener('click', (e) => {
                const target = e.target;
                if (isCTAElement(target)) {
                    console.log('CTA click event captured:', {
                        element: getElementPath(target),
                        text: target.textContent.trim()
                    });
                    
                    sessionData.cta_clicks.push({
                        timestamp: Date.now(),
                        element: getElementPath(target),
                        text: target.textContent.trim()
                    });
                }
            }, true);
        }

        // Modal interaction tracking
        if (config.mlFeatures.trackModalInteractions) {
            console.log('Setting up modal interaction tracking...');
            document.addEventListener('click', (e) => {
                const target = e.target;
                if (isModalElement(target)) {
                    console.log('Modal interaction event captured:', {
                        element: getElementPath(target)
                    });
                    
                    sessionData.modal_interactions.push({
                        timestamp: Date.now(),
                        type: 'open',
                        element: getElementPath(target)
                    });
                }
            }, true);
        }

        // SPA navigation tracking
        if (config.mlFeatures.analyzeUserPaths) {
            console.log('Setting up SPA navigation tracking...');
            const pushState = history.pushState;
            history.pushState = function() {
                pushState.apply(history, arguments);
                trackNavigation();
            };

            window.addEventListener('popstate', trackNavigation);
        }

        // Add enhanced mouse movement tracking
        let mousePositions = [];
        let lastMouseMoveTime = Date.now();
        
        document.addEventListener('mousemove', throttle((e) => {
            const now = Date.now();
            mousePositions.push({
                x: e.clientX,
                y: e.clientY,
                timestamp: now,
                timeSinceLastMove: now - lastMouseMoveTime
            });
            
            // Keep only last 100 positions
            if (mousePositions.length > 100) {
                mousePositions = mousePositions.slice(-100);
            }
            
            sessionData.user_behavior.mouse_movement_heatmap = generateHeatmapData(mousePositions);
            lastMouseMoveTime = now;
        }, 100));

        // Track scroll depth percentage
        let maxScrollDepth = 0;
        window.addEventListener('scroll', throttle(() => {
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrolled = window.scrollY;
            const scrollDepthPercentage = (scrolled / scrollHeight) * 100;
            
            if (scrollDepthPercentage > maxScrollDepth) {
                maxScrollDepth = scrollDepthPercentage;
                sessionData.user_behavior.scroll_depth_percentages.push({
                    depth: maxScrollDepth,
                    timestamp: Date.now()
                });
            }
        }, 100));

        // Track time between clicks
        let lastClickTime = Date.now();
        document.addEventListener('click', (e) => {
            const now = Date.now();
            sessionData.user_behavior.time_between_clicks.push({
                timeDelta: now - lastClickTime,
                timestamp: now,
                element: getElementPath(e.target)
            });
            lastClickTime = now;
            
            // Update total interactions
            sessionData.user_behavior.total_interactions++;
            if (!sessionData.user_behavior.time_to_first_interaction) {
                sessionData.user_behavior.time_to_first_interaction = now - sessionData.start_time;
            }
        });

        // Track interaction frequency
        setInterval(() => {
            const now = Date.now();
            const last5Seconds = sessionData.user_behavior.time_between_clicks
                .filter(click => now - click.timestamp < 5000).length;
                
            sessionData.user_behavior.interaction_frequency.push({
                timestamp: now,
                interactions_per_5sec: last5Seconds
            });
        }, 5000);

        console.log('Event listeners setup complete');
    }

    // ML features setup
    function setupMLFeatures() {
        // Initialize ML features collection
        setInterval(() => {
            updateMLFeatures();
        }, 5000); // Update every 5 seconds
    }

    // Update ML features
    function updateMLFeatures() {
        // Calculate interest signals
        sessionData.ml_features.interest_signals = calculateInterestSignals();
        
        // Analyze behavior patterns
        sessionData.ml_features.behavior_patterns = analyzeBehaviorPatterns();
        
        // Determine user segment
        sessionData.ml_features.user_segment = determineUserSegment();
        
        // Calculate conversion probability
        sessionData.ml_features.conversion_probability = calculateConversionProbability();
        
        // Update funnel analysis
        sessionData.ml_features.funnel_analysis = analyzeFunnel();
    }

    // Enhanced waitScrollAndSend implementation
    function waitScrollAndSend() {
        let isSent = false;
        let hasMeaningfulInteraction = false;
        
        const sendData = () => {
            if (!isSent && hasMeaningfulInteraction) {
                isSent = true;
                sendSessionSummary();
            }
        };
        
        const handleScroll = () => {
            if (sessionData.scroll_chunks.length > 0) {
                hasMeaningfulInteraction = true;
                sendData();
                window.removeEventListener('scroll', handleScroll);
            }
        };

        const handleInteraction = () => {
            hasMeaningfulInteraction = true;
        };
        
        window.addEventListener('scroll', handleScroll);
        window.addEventListener('click', handleInteraction);
        window.addEventListener('mousemove', handleInteraction);
        window.addEventListener('keydown', handleInteraction);
        
        // Only send after meaningful interaction or longer timeout
        setTimeout(() => {
            if (hasMeaningfulInteraction) {
                sendData();
            }
        }, 30000); // 30 seconds instead of 10
        
        setTimeout(() => {
            if (hasMeaningfulInteraction) {
                sendData();
            }
        }, 20 * 60 * 1000);
    }

    // Send data using JSONP
    function sendDataJSONP(data) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const callbackName = 'rivox_callback_' + Date.now();
            
            // Create global callback
            window[callbackName] = function(response) {
                delete window[callbackName];
                document.body.removeChild(script);
                resolve(response);
            };

            // Add error handler
            script.onerror = () => {
                delete window[callbackName];
                document.body.removeChild(script);
                reject(new Error('JSONP request failed'));
            };

            // Prepare URL with data
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
            }, 10000); // 10 second timeout
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
            
            // Store failed request for retry
            if (window.localStorage) {
                try {
                    const failedRequests = JSON.parse(localStorage.getItem('rivox_failed_requests') || '[]');
                    failedRequests.push({
                        timestamp: Date.now(),
                        endpoint: endpoint,
                        data: summary
                    });
                    // Keep only last 10 failed requests
                    if (failedRequests.length > 10) {
                        failedRequests.shift();
                    }
                    localStorage.setItem('rivox_failed_requests', JSON.stringify(failedRequests));
                    if (config.debug) {
                        console.log('Failed request stored for retry');
                    }
                } catch (e) {
                    console.warn('Failed to store failed request:', e);
                }
            }
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

    // Вспомогательная функция для работы с cookies
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
        
        // Add logic to determine important elements
        return element.tagName === 'A' || 
               element.tagName === 'BUTTON' || 
               element.tagName === 'INPUT' ||
               (element.hasAttribute && element.hasAttribute('data-rivox-important'));
    }

    function isCTAElement(element) {
        if (!element) return false;
        
        // Add logic to identify CTA elements
        return (element.tagName === 'BUTTON') ||
               (element.tagName === 'A' && element.textContent && (
                   element.textContent.toLowerCase().includes('купить') ||
                   element.textContent.toLowerCase().includes('заказать') ||
                   element.textContent.toLowerCase().includes('оформить')
               ));
    }

    function isModalElement(element) {
        if (!element) return false;
        
        // Add logic to identify modal elements
        return (element.hasAttribute && element.hasAttribute('data-modal')) ||
               (element.classList && (
                   element.classList.contains('modal') ||
                   element.classList.contains('popup')
               ));
    }

    // ML feature calculation functions
    function calculateInterestSignals() {
        const signals = [];
        const now = Date.now();
        
        // 1. Product interest based on hover and view time
        const productElements = document.querySelectorAll('[data-product-id]');
        productElements.forEach(element => {
            const productId = element.getAttribute('data-product-id');
            const hovers = sessionData.hover_events.filter(e => e.element.includes(productId));
            const totalHoverTime = hovers.reduce((sum, hover) => sum + hover.duration, 0);
            
            if (totalHoverTime > 0) {
                signals.push({
                    type: 'product_interest',
                    product_id: productId,
                    hover_time: totalHoverTime,
                    hover_count: hovers.length,
                    last_interaction: Math.max(...hovers.map(h => h.timestamp))
                });
            }
        });

        // 2. Category interest based on navigation
        const categoryViews = sessionData.page_views.filter(view => 
            view.url.includes('/category/') || view.url.includes('/catalog/')
        );
        if (categoryViews.length > 0) {
            signals.push({
                type: 'category_interest',
                categories: categoryViews.map(view => {
                    const url = new URL(view.url);
                    return url.pathname.split('/').pop();
                }),
                view_count: categoryViews.length
            });
        }

        // 3. Price sensitivity based on filter interactions
        const priceFilters = sessionData.form_interactions.filter(interaction => 
            interaction.element.includes('price') || interaction.element.includes('стоимость')
        );
        if (priceFilters.length > 0) {
            signals.push({
                type: 'price_sensitivity',
                filter_interactions: priceFilters.length,
                price_ranges: priceFilters.map(f => f.value)
            });
        }

        // 4. Brand interest based on search and navigation
        const brandSearches = sessionData.form_interactions.filter(interaction => 
            interaction.element.includes('search') && 
            interaction.value && 
            interaction.value.length > 0
        );
        if (brandSearches.length > 0) {
            signals.push({
                type: 'brand_interest',
                search_terms: brandSearches.map(s => s.value),
                search_count: brandSearches.length
            });
        }

        return signals;
    }

    function analyzeBehaviorPatterns() {
        const patterns = [];
        const now = Date.now();
        const sessionDuration = now - sessionData.start_time;

        // 1. Browsing pattern
        const scrollPattern = {
            type: 'browsing_pattern',
            total_scroll: sessionData.scroll_chunks.reduce((sum, chunk) => sum + chunk.delta, 0),
            scroll_speed: sessionData.scroll_chunks.length > 0 ? 
                sessionData.scroll_chunks.reduce((sum, chunk) => sum + chunk.delta, 0) / 
                (sessionData.scroll_chunks[sessionData.scroll_chunks.length - 1].timestamp - 
                 sessionData.scroll_chunks[0].timestamp) : 0,
            scroll_depth: sessionData.scroll_chunks.length > 0 ? 
                Math.max(...sessionData.scroll_chunks.map(chunk => chunk.position)) / 
                document.documentElement.scrollHeight : 0
        };
        patterns.push(scrollPattern);

        // 2. Interaction pattern
        const interactionPattern = {
            type: 'interaction_pattern',
            hover_frequency: sessionData.hover_events.length / (sessionDuration / 1000),
            click_frequency: sessionData.cta_clicks.length / (sessionDuration / 1000),
            form_interaction_count: sessionData.form_interactions.length,
            modal_interaction_count: sessionData.modal_interactions.length
        };
        patterns.push(interactionPattern);

        // 3. Time-based pattern
        const timePattern = {
            type: 'time_pattern',
            session_duration: sessionDuration,
            time_to_first_interaction: sessionData.hover_events.length > 0 ? 
                sessionData.hover_events[0].timestamp - sessionData.start_time : null,
            time_between_interactions: calculateAverageTimeBetweenInteractions(),
            active_time_ratio: calculateActiveTimeRatio()
        };
        patterns.push(timePattern);

        // 4. Navigation pattern
        const navigationPattern = {
            type: 'navigation_pattern',
            page_count: sessionData.page_views.length,
            unique_pages: new Set(sessionData.page_views.map(view => view.url)).size,
            return_to_previous: calculateReturnToPreviousCount(),
            path_complexity: calculatePathComplexity()
        };
        patterns.push(navigationPattern);

        return patterns;
    }

    function determineUserSegment() {
        const engagementScore = calculateEngagementScore();
        const behaviorPatterns = analyzeBehaviorPatterns();
        const interestSignals = calculateInterestSignals();

        // Calculate segment scores
        const segmentScores = {
            'high_value': calculateHighValueScore(engagementScore, behaviorPatterns, interestSignals),
            'price_sensitive': calculatePriceSensitiveScore(interestSignals),
            'brand_loyal': calculateBrandLoyalScore(interestSignals),
            'window_shopper': calculateWindowShopperScore(behaviorPatterns),
            'researcher': calculateResearcherScore(behaviorPatterns)
        };

        // Determine primary segment
        let primarySegment = null;
        let maxScore = 0;

        for (const [segment, score] of Object.entries(segmentScores)) {
            if (score > maxScore) {
                maxScore = score;
                primarySegment = segment;
            }
        }

        return {
            primary: primarySegment,
            scores: segmentScores,
            confidence: maxScore
        };
    }

    function calculateConversionProbability() {
        const features = {
            engagement_score: calculateEngagementScore(),
            behavior_patterns: analyzeBehaviorPatterns(),
            interest_signals: calculateInterestSignals(),
            user_segment: determineUserSegment()
        };

        // Calculate base probability from engagement
        let probability = features.engagement_score * 0.4;

        // Adjust based on behavior patterns
        const scrollPattern = features.behavior_patterns.find(p => p.type === 'browsing_pattern');
        if (scrollPattern) {
            probability += (scrollPattern.scroll_depth * 0.2);
            probability += (scrollPattern.scroll_speed > 0 ? 0.1 : 0);
        }

        // Adjust based on interest signals
        const productInterest = features.interest_signals.filter(s => s.type === 'product_interest');
        if (productInterest.length > 0) {
            probability += (Math.min(productInterest.length / 5, 0.2));
            const totalHoverTime = productInterest.reduce((sum, p) => sum + p.hover_time, 0);
            probability += (Math.min(totalHoverTime / 30000, 0.1));
        }

        // Adjust based on user segment
        if (features.user_segment.primary === 'high_value') {
            probability += 0.2;
        } else if (features.user_segment.primary === 'price_sensitive') {
            probability -= 0.1;
        }

        // Normalize probability
        probability = Math.max(0, Math.min(1, probability));

        return {
            probability: probability,
            factors: {
                engagement: features.engagement_score * 0.4,
                scroll_depth: scrollPattern ? scrollPattern.scroll_depth * 0.2 : 0,
                product_interest: productInterest.length > 0 ? 
                    Math.min(productInterest.length / 5, 0.2) + 
                    Math.min(productInterest.reduce((sum, p) => sum + p.hover_time, 0) / 30000, 0.1) : 0,
                user_segment: features.user_segment.primary === 'high_value' ? 0.2 : 
                            features.user_segment.primary === 'price_sensitive' ? -0.1 : 0
            }
        };
    }

    function analyzeFunnel() {
        const funnel = {
            stages: {
                awareness: calculateAwarenessStage(),
                consideration: calculateConsiderationStage(),
                decision: calculateDecisionStage(),
                action: calculateActionStage()
            },
            drop_off_points: [],
            conversion_rate: 0
        };

        // Calculate drop-off points
        const stages = Object.entries(funnel.stages);
        for (let i = 0; i < stages.length - 1; i++) {
            const [currentStage, currentData] = stages[i];
            const [nextStage, nextData] = stages[i + 1];
            
            if (currentData.visitors > 0) {
                const dropOffRate = 1 - (nextData.visitors / currentData.visitors);
                funnel.drop_off_points.push({
                    from: currentStage,
                    to: nextStage,
                    rate: dropOffRate,
                    visitors_lost: currentData.visitors - nextData.visitors
                });
            }
        }

        // Calculate overall conversion rate
        if (funnel.stages.awareness.visitors > 0) {
            funnel.conversion_rate = funnel.stages.action.visitors / funnel.stages.awareness.visitors;
        }

        return funnel;
    }

    function generateScrollHeatmap() {
        const viewportHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const heatmap = {};
        
        // Initialize heatmap buckets
        const bucketSize = 100; // pixels
        const numBuckets = Math.ceil(documentHeight / bucketSize);
        for (let i = 0; i < numBuckets; i++) {
            heatmap[i * bucketSize] = 0;
        }

        // Process scroll chunks
        sessionData.scroll_chunks.forEach(chunk => {
            const bucket = Math.floor(chunk.position / bucketSize) * bucketSize;
            heatmap[bucket] = (heatmap[bucket] || 0) + 1;
        });

        // Normalize values
        const maxValue = Math.max(...Object.values(heatmap));
        if (maxValue > 0) {
            Object.keys(heatmap).forEach(key => {
                heatmap[key] = heatmap[key] / maxValue;
            });
        }

        return {
            buckets: heatmap,
            bucket_size: bucketSize,
            document_height: documentHeight,
            viewport_height: viewportHeight
        };
    }

    function generateUserPath() {
        const path = [];
        let currentTime = sessionData.start_time;

        // Combine all events chronologically
        const allEvents = [
            ...sessionData.page_views.map(e => ({...e, type: 'page_view'})),
            ...sessionData.scroll_chunks.map(e => ({...e, type: 'scroll'})),
            ...sessionData.hover_events.map(e => ({...e, type: 'hover'})),
            ...sessionData.form_interactions.map(e => ({...e, type: 'form'})),
            ...sessionData.cta_clicks.map(e => ({...e, type: 'cta_click'})),
            ...sessionData.modal_interactions.map(e => ({...e, type: 'modal'}))
        ].sort((a, b) => a.timestamp - b.timestamp);

        // Generate path with time intervals
        allEvents.forEach(event => {
            path.push({
                type: event.type,
                timestamp: event.timestamp,
                time_since_last: event.timestamp - currentTime,
                details: getEventDetails(event)
            });
            currentTime = event.timestamp;
        });

        return path;
    }

    function calculateEngagementScore() {
        const weights = {
            scroll_depth: 0.3,
            time_on_site: 0.2,
            interaction_count: 0.2,
            page_views: 0.15,
            form_interactions: 0.15
        };

        // Calculate individual scores
        const scrollScore = calculateScrollScore();
        const timeScore = calculateTimeScore();
        const interactionScore = calculateInteractionScore();
        const pageViewScore = calculatePageViewScore();
        const formScore = calculateFormScore();

        // Calculate weighted sum
        const score = 
            scrollScore * weights.scroll_depth +
            timeScore * weights.time_on_site +
            interactionScore * weights.interaction_count +
            pageViewScore * weights.page_views +
            formScore * weights.form_interactions;

        return Math.min(1, Math.max(0, score));
    }

    // Helper functions for ML features
    function calculateAverageTimeBetweenInteractions() {
        if (sessionData.hover_events.length < 2) return null;
        
        const times = [];
        for (let i = 1; i < sessionData.hover_events.length; i++) {
            times.push(sessionData.hover_events[i].timestamp - sessionData.hover_events[i-1].timestamp);
        }
        
        return times.reduce((sum, time) => sum + time, 0) / times.length;
    }

    function calculateActiveTimeRatio() {
        const sessionDuration = Date.now() - sessionData.start_time;
        if (sessionDuration === 0) return 0;

        const activeTime = sessionData.hover_events.reduce((sum, event) => sum + event.duration, 0);
        return Math.min(1, activeTime / sessionDuration);
    }

    function calculateReturnToPreviousCount() {
        let count = 0;
        const visitedUrls = new Set();

        sessionData.page_views.forEach(view => {
            if (visitedUrls.has(view.url)) {
                count++;
            }
            visitedUrls.add(view.url);
        });

        return count;
    }

    function calculatePathComplexity() {
        const uniqueUrls = new Set(sessionData.page_views.map(view => view.url));
        const totalViews = sessionData.page_views.length;
        
        return totalViews > 0 ? uniqueUrls.size / totalViews : 0;
    }

    function calculateHighValueScore(engagementScore, behaviorPatterns, interestSignals) {
        let score = engagementScore * 0.4;
        
        // Add points for product interest
        const productInterest = interestSignals.filter(s => s.type === 'product_interest');
        if (productInterest.length > 0) {
            score += Math.min(productInterest.length / 5, 0.3);
        }

        // Add points for form interactions
        const formPattern = behaviorPatterns.find(p => p.type === 'interaction_pattern');
        if (formPattern && formPattern.form_interaction_count > 0) {
            score += Math.min(formPattern.form_interaction_count / 3, 0.3);
        }

        return Math.min(1, score);
    }

    function calculatePriceSensitiveScore(interestSignals) {
        const priceSignal = interestSignals.find(s => s.type === 'price_sensitivity');
        if (!priceSignal) return 0;

        return Math.min(
            (priceSignal.filter_interactions * 0.3) + 
            (priceSignal.price_ranges.length * 0.2),
            1
        );
    }

    function calculateBrandLoyalScore(interestSignals) {
        const brandSignal = interestSignals.find(s => s.type === 'brand_interest');
        if (!brandSignal) return 0;

        return Math.min(
            (brandSignal.search_count * 0.4) + 
            (brandSignal.search_terms.length * 0.3),
            1
        );
    }

    function calculateWindowShopperScore(behaviorPatterns) {
        const scrollPattern = behaviorPatterns.find(p => p.type === 'browsing_pattern');
        const interactionPattern = behaviorPatterns.find(p => p.type === 'interaction_pattern');

        if (!scrollPattern || !interactionPattern) return 0;

        return Math.min(
            (scrollPattern.scroll_depth * 0.4) +
            (interactionPattern.hover_frequency * 0.3) +
            (interactionPattern.click_frequency * 0.3),
            1
        );
    }

    function calculateResearcherScore(behaviorPatterns) {
        const navigationPattern = behaviorPatterns.find(p => p.type === 'navigation_pattern');
        const timePattern = behaviorPatterns.find(p => p.type === 'time_pattern');

        if (!navigationPattern || !timePattern) return 0;

        return Math.min(
            (navigationPattern.page_count * 0.3) +
            (navigationPattern.unique_pages * 0.3) +
            (timePattern.session_duration / (5 * 60 * 1000) * 0.4), // 5 minutes as reference
            1
        );
    }

    function calculateAwarenessStage() {
        return {
            visitors: sessionData.page_views.length,
            avg_time: calculateAverageTimeInStage('awareness'),
            bounce_rate: calculateBounceRate()
        };
    }

    function calculateConsiderationStage() {
        const visitors = sessionData.scroll_chunks.length > 0 ? 
            sessionData.page_views.length : 0;

        return {
            visitors: visitors,
            avg_time: calculateAverageTimeInStage('consideration'),
            product_views: sessionData.hover_events.filter(e => 
                e.element.includes('product') || e.element.includes('товар')
            ).length
        };
    }

    function calculateDecisionStage() {
        const visitors = sessionData.form_interactions.length > 0 ? 
            sessionData.page_views.length : 0;

        return {
            visitors: visitors,
            avg_time: calculateAverageTimeInStage('decision'),
            form_starts: sessionData.form_interactions.filter(i => 
                i.type === 'focus'
            ).length
        };
    }

    function calculateActionStage() {
        const visitors = sessionData.cta_clicks.length > 0 ? 
            sessionData.page_views.length : 0;

        return {
            visitors: visitors,
            avg_time: calculateAverageTimeInStage('action'),
            conversions: sessionData.cta_clicks.length
        };
    }

    function calculateAverageTimeInStage(stage) {
        // Implementation depends on how you define stages in time
        return 0;
    }

    function calculateBounceRate() {
        if (sessionData.page_views.length === 0) return 0;
        
        const singlePageVisits = sessionData.page_views.filter(view => 
            view.timestamp - sessionData.start_time < 10000 // 10 seconds
        ).length;
        
        return singlePageVisits / sessionData.page_views.length;
    }

    function getEventDetails(event) {
        switch (event.type) {
            case 'page_view':
                return { url: event.url };
            case 'scroll':
                return { 
                    position: event.position,
                    delta: event.delta
                };
            case 'hover':
                return { 
                    element: event.element,
                    duration: event.duration
                };
            case 'form':
                return { 
                    element: event.element,
                    type: event.type,
                    value: event.value
                };
            case 'cta_click':
                return { 
                    element: event.element,
                    text: event.text
                };
            case 'modal':
                return { 
                    element: event.element,
                    type: event.type
                };
            default:
                return {};
        }
    }

    function calculateScrollScore() {
        const scrollPattern = analyzeBehaviorPatterns().find(p => p.type === 'browsing_pattern');
        if (!scrollPattern) return 0;

        return (scrollPattern.scroll_depth * 0.6) + 
               (Math.min(scrollPattern.scroll_speed / 1000, 1) * 0.4);
    }

    function calculateTimeScore() {
        const sessionDuration = Date.now() - sessionData.start_time;
        return Math.min(sessionDuration / (5 * 60 * 1000), 1); // 5 minutes as reference
    }

    function calculateInteractionScore() {
        const interactionPattern = analyzeBehaviorPatterns().find(p => p.type === 'interaction_pattern');
        if (!interactionPattern) return 0;

        return (Math.min(interactionPattern.hover_frequency * 10, 1) * 0.4) +
               (Math.min(interactionPattern.click_frequency * 10, 1) * 0.3) +
               (Math.min(interactionPattern.form_interaction_count / 3, 1) * 0.3);
    }

    function calculatePageViewScore() {
        return Math.min(sessionData.page_views.length / 5, 1);
    }

    function calculateFormScore() {
        return Math.min(sessionData.form_interactions.length / 3, 1);
    }

    // Add UTM data collection function
    function collectUtmData() {
        const urlParams = new URLSearchParams(window.location.search);
        const utmParams = {};
        const utmFields = [
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_term',
            'utm_content',
            'gclid',
            'fbclid',
            'yclid'
        ];

        utmFields.forEach(field => {
            const value = urlParams.get(field);
            if (value) {
                utmParams[field] = value;
            }
        });

        // Add additional traffic source parameters
        utmParams.traffic_type = getTrafficType();
        utmParams.landing_page_type = getLandingPageType();
        utmParams.referrer_domain = getReferrerDomain();

        return utmParams;
    }

    // Add traffic source analysis
    function getTrafficType() {
        const referrer = document.referrer;
        if (!referrer) return 'direct';
        
        const searchEngines = ['google', 'yandex', 'bing'];
        const socialNetworks = ['facebook', 'instagram', 'vk.com'];
        
        const referrerDomain = new URL(referrer).hostname;
        
        if (searchEngines.some(se => referrerDomain.includes(se))) return 'organic_search';
        if (socialNetworks.some(sn => referrerDomain.includes(sn))) return 'social';
        if (new URLSearchParams(window.location.search).has('utm_source')) return 'campaign';
        
        return 'referral';
    }

    function getLandingPageType() {
        const path = window.location.pathname;
        if (path === '/' || path === '/index.html') return 'homepage';
        if (path.includes('/product/')) return 'product';
        if (path.includes('/category/')) return 'category';
        if (path.includes('/cart/')) return 'cart';
        if (path.includes('/checkout/')) return 'checkout';
        return 'other';
    }

    function getReferrerDomain() {
        if (!document.referrer) return null;
        try {
            return new URL(document.referrer).hostname;
        } catch (e) {
            return null;
        }
    }

    // Add heatmap generation
    function generateHeatmapData(positions) {
        const heatmap = {};
        const gridSize = 50; // pixels
        
        positions.forEach(pos => {
            const gridX = Math.floor(pos.x / gridSize);
            const gridY = Math.floor(pos.y / gridSize);
            const key = `${gridX},${gridY}`;
            
            if (!heatmap[key]) {
                heatmap[key] = {
                    count: 0,
                    avgTime: 0,
                    lastVisit: pos.timestamp
                };
            }
            
            heatmap[key].count++;
            heatmap[key].avgTime = (heatmap[key].avgTime * (heatmap[key].count - 1) + 
                                   pos.timeSinceLastMove) / heatmap[key].count;
        });
        
        return Object.entries(heatmap).map(([key, data]) => ({
            position: key.split(',').map(Number),
            intensity: data.count,
            avgTimeSpent: data.avgTime
        }));
    }

    // Add Yandex.Metrika goals tracking
    function setupMetrikaGoalsTracking() {
        // Проверяем наличие Метрики
        if (typeof ym === 'undefined') {
            console.warn('Yandex.Metrika not found, will retry in 1 second');
            setTimeout(setupMetrikaGoalsTracking, 1000);
            return;
        }

        // Получаем ID счетчика
        const counterId = getYandexCounterId();
        if (!counterId) {
            console.warn('Yandex.Metrika counter ID not found, will retry in 1 second');
            setTimeout(setupMetrikaGoalsTracking, 1000);
            return;
        }

        console.log('Setting up Yandex.Metrika goals tracking for counter:', counterId);

        // Сохраняем оригинальную функцию
        const originalYm = window.ym;

        // Переопределяем функцию ym
        window.ym = function(counterId, method, ...args) {
            // Отслеживаем цели
            if (method === 'reachGoal') {
                const goalName = args[0];
                const goalParams = args[1] || {};
                
                // Записываем данные о цели
                const goalData = {
                    timestamp: Date.now(),
                    name: goalName,
                    parameters: goalParams,
                    page_url: window.location.href,
                    referrer: document.referrer,
                    user_agent: navigator.userAgent,
                    client_id: sessionData.client_id,
                    counter_id: counterId,
                    session_duration: Date.now() - sessionData.start_time,
                    conversion_context: {
                        last_interaction: sessionData.last_activity,
                        scroll_depth: getMaxScrollDepth(),
                        interaction_count: getTotalInteractions(),
                        form_interactions: sessionData.form_interactions.length,
                        time_to_convert: Date.now() - sessionData.start_time
                    }
                };

                // Сохраняем цель в сессии
                sessionData.metrika_goals.push(goalData);
                sessionData.conversion_data.goals_reached.push(goalData);
                sessionData.conversion_data.last_goal_timestamp = Date.now();

                // Обновляем путь конверсии
                sessionData.conversion_data.conversion_path.push({
                    timestamp: Date.now(),
                    type: 'goal',
                    name: goalName,
                    url: window.location.href
                });

                console.log('🎯 Goal tracked:', goalName, goalParams);

                // Немедленно отправляем данные о цели
                sendGoalData(goalData);
            }

            // Вызываем оригинальную функцию
            return originalYm.apply(this, arguments);
        };

        // Проверяем работу отслеживания
        console.log('✅ Yandex.Metrika goals tracking setup complete');
    }

    // Функция для получения ID счетчика Метрики
    function getYandexCounterId() {
        // Проверяем глобальную переменную
        if (window.ymCounterId) return window.ymCounterId;
        
        // Ищем счетчик в объектах окна
        const counterObjects = Object.keys(window).filter(key => key.startsWith('yaCounter'));
        if (counterObjects.length > 0) {
            return parseInt(counterObjects[0].replace('yaCounter', ''));
        }

        // Ищем в коде страницы
        const metrikaScripts = Array.from(document.scripts)
            .filter(script => script.textContent && script.textContent.includes('ym('))
            .map(script => script.textContent);

        if (metrikaScripts.length > 0) {
            const match = metrikaScripts[0].match(/ym\((\d+),/);
            if (match) return parseInt(match[1]);
        }

        return null;
    }

    // Helper functions for goals tracking
    function getMaxScrollDepth() {
        if (!sessionData.scroll_chunks.length) return 0;
        return Math.max(...sessionData.scroll_chunks.map(chunk => 
            (chunk.position / (document.documentElement.scrollHeight - window.innerHeight)) * 100
        ));
    }

    function getTotalInteractions() {
        return sessionData.hover_events.length + 
               sessionData.cta_clicks.length + 
               sessionData.form_interactions.length + 
               sessionData.modal_interactions.length;
    }

    function getEcommerceEventType(ecommerce) {
        if (ecommerce.purchase) return 'purchase';
        if (ecommerce.add) return 'add_to_cart';
        if (ecommerce.remove) return 'remove_from_cart';
        if (ecommerce.detail) return 'view_product';
        if (ecommerce.impressions) return 'view_product_list';
        return 'other';
    }

    function getEcommerceProducts(ecommerce) {
        const products = [];
        if (ecommerce.purchase) products.push(...(ecommerce.purchase.products || []));
        if (ecommerce.add) products.push(...(ecommerce.add.products || []));
        if (ecommerce.remove) products.push(...(ecommerce.remove.products || []));
        if (ecommerce.detail) products.push(...(ecommerce.detail.products || []));
        if (ecommerce.impressions) products.push(...ecommerce.impressions);
        return products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            quantity: p.quantity
        }));
    }

    function getEcommerceValue(ecommerce) {
        if (ecommerce.purchase && ecommerce.purchase.actionField) {
            return ecommerce.purchase.actionField.revenue;
        }
        return null;
    }

    // Send goal data immediately
    function sendGoalData(goalData) {
        const endpoint = getEndpointUrl();
        
        if (config.debug) {
            console.log('Sending goal data:', goalData);
        }

        // Try to send via JSONP
        sendDataJSONP({
            type: 'goal',
            client_id: sessionData.client_id,
            session_id: sessionData.session_id,
            goal_data: goalData,
            conversion_path: sessionData.conversion_data.conversion_path
        }).catch(error => {
            console.error('Failed to send goal data:', error);
        });
    }

    // Expose public API
    window.RIVOX = {
        init: initRivoxSDK,
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
        initRivoxSDK().catch(error => {
            console.error('Failed to initialize RIVOX SDK:', error);
        });
    })();

})(window); 
