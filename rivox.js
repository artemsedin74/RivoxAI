// Добавляем конфигурацию в начало файла
const config = {
  debug: true,
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
  debugEvents: [
    'JSONP REQUEST',
    'GET REQUEST',
    'POST REQUEST',
    'PROCESSING BATCH',
    'TOKEN EXTRACTION',
    'DATA PROCESSING',
    'SHEET CREATION',
    'ERROR'
  ]
};

// Cache configuration
const CACHE_CONFIG = {
  expirationInSeconds: 21600 // 6 hours
};

// Batch processing configuration
const BATCH_CONFIG = {
  maxRows: 50,
  processingInterval: 60 // seconds
};

// Time zone configuration
const TIMEZONE = 'Europe/Moscow';

// Allowed domains configuration
const ALLOWED_DOMAINS = [
  'spb.sotovik.shop',
  'www.spb.sotovik.shop'
];

// Update CORS configuration
const CORS_CONFIG = {
  allowedOrigins: [
    'https://spb.sotovik.shop',
    'https://www.spb.sotovik.shop',
    'http://spb.sotovik.shop',
    'http://www.spb.sotovik.shop'
  ],
  allowedMethods: 'GET, POST, OPTIONS',
  allowedHeaders: 'Content-Type, X-Requested-With, Origin',
  maxAge: '86400',
  credentials: 'true'
};

// Initialize debug sheet
function getDebugSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let debugSheet = ss.getSheetByName("debug");
  
  if (!debugSheet) {
    debugSheet = ss.insertSheet("debug");
    // Add headers
    debugSheet.getRange(1, 1, 1, 6).setValues([["Timestamp", "Event", "Client Token", "Session ID", "Path", "Details"]])
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
    debugSheet.setFrozenRows(1);
    
    // Set column widths
    debugSheet.setColumnWidth(1, 150); // Timestamp
    debugSheet.setColumnWidth(2, 150); // Event
    debugSheet.setColumnWidth(3, 100); // Client Token
    debugSheet.setColumnWidth(4, 150); // Session ID
    debugSheet.setColumnWidth(5, 250); // Path
    debugSheet.setColumnWidth(6, 400); // Details
  }
  
  return debugSheet;
}

// Log debug message with improved formatting
function logDebug(event, details) {
  if (!config.debug && !event.includes('ERROR')) return;
  
  try {
    const debugSheet = getDebugSheet();
    const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    
    let clientToken = "N/A";
    let sessionId = "N/A";
    let path = "N/A";
    let formattedDetails = "";
    
    if (details && typeof details === 'object') {
      clientToken = details.client_token || details.clientToken || details.token || "N/A";
      sessionId = details.session_id || details.sessionId || "N/A";
      path = details.path || details.url || "N/A";
      
      formattedDetails = JSON.stringify(details, null, 2);
    } else {
      formattedDetails = String(details);
    }
    
    debugSheet.appendRow([
      now,
      event,
      clientToken,
      sessionId,
      path,
      formattedDetails
    ]);
    
    const lastRow = debugSheet.getLastRow();
    debugSheet.getRange(lastRow, 6).setWrap(true);
    
    if (event.includes('ERROR')) {
      debugSheet.getRange(lastRow, 1, 1, 6).setBackground('#ffebee');
    }
    
  } catch (e) {
    console.error('Failed to log debug message:', e);
  }
}

// Helper function to get current queue size
function getQueueSize() {
  const cache = CacheService.getScriptCache();
  const queueData = cache.get('processing_queue');
  if (!queueData) return 0;
  try {
    const queue = JSON.parse(queueData);
    return queue.length;
  } catch (e) {
    return 0;
  }
}

function getClientToken(data) {
  // Log incoming data structure
  Logger.log("Getting client token from data:", JSON.stringify(data));
  
  // For GET requests with data parameter
  if (data && data.parameter && data.parameter.data) {
    try {
      const parsedData = JSON.parse(decodeURIComponent(data.parameter.data));
      Logger.log("Parsed data from parameters:", JSON.stringify(parsedData));
      
      // Check SDK initialization token
      if (parsedData.data_token) {
        Logger.log("✓ Token found in parsed data.data_token:", parsedData.data_token);
        return parsedData.data_token;
      }
      
      // Check if token was loaded from script attribute
      if (parsedData.token) {
        Logger.log("✓ Token found in parsed data.token:", parsedData.token);
        return parsedData.token;
      }
    } catch (e) {
      Logger.log("⚠️ Error parsing data parameter:", e.message);
    }
  }
  
  // Direct data object (from POST or parsed GET)
  if (data && typeof data === 'object') {
    // Log all potential token fields
    Logger.log("Checking token fields in data object:", {
      token: data.token,
      data_token: data.data_token,
      clientToken: data.clientToken,
      client_token: data.client_token
    });
    
    // Check SDK initialization token first (highest priority)
    if (data.data_token) {
      Logger.log("✓ Token found in data.data_token:", data.data_token);
      return data.data_token;
    }
    
    if (data.token) {
      Logger.log("✓ Token found in data.token:", data.token);
      return data.token;
    }
    
    // Legacy fields
    if (data.clientToken) {
      Logger.log("✓ Token found in data.clientToken:", data.clientToken);
      return data.clientToken;
    }
    
    if (data.client_token) {
      Logger.log("✓ Token found in data.client_token:", data.client_token);
      return data.client_token;
    }
  }
  
  // Parameters fallback
  if (data && data.parameter) {
    Logger.log("Checking parameters:", JSON.stringify(data.parameter));
    
    if (data.parameter.token) {
      Logger.log("✓ Token found in parameters.token:", data.parameter.token);
      return data.parameter.token;
    }
    
    if (data.parameter.data_token) {
      Logger.log("✓ Token found in parameters.data_token:", data.parameter.data_token);
      return data.parameter.data_token;
    }
  }
  
  Logger.log("⚠️ No token found, using default-client");
  return 'default-client';
}

function isAllowedDomain(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const domain = url.hostname.toLowerCase();
    return ALLOWED_DOMAINS.includes(domain) || domain === 'spb.sotovik.shop';
  } catch (e) {
    return false;
  }
}

function getCorsHeaders(origin) {
  // Always return headers that allow the request
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': CORS_CONFIG.allowedMethods,
    'Access-Control-Allow-Headers': CORS_CONFIG.allowedHeaders,
    'Access-Control-Max-Age': CORS_CONFIG.maxAge,
    'Access-Control-Allow-Credentials': CORS_CONFIG.credentials,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}

function doPost(e) {
  const origin = e.parameter.origin || (e.headers && (e.headers.Origin || e.headers.origin));
  const headers = getCorsHeaders(origin);
  
  try {
    // Handle OPTIONS request
    if (e.method === 'OPTIONS') {
      return ContentService.createTextOutput('')
        .setMimeType(ContentService.MimeType.TEXT)
        .setHeaders(headers);
    }
    
    // Parse data
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error('Invalid JSON data: ' + err.message);
    }
    
    // Process data
    const result = processIncomingData(data);
    
    // Return response
    const response = {
      status: 'success',
      message: 'Data processed successfully',
      result: result,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
      
  } catch (error) {
    const errorResponse = {
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
  }
}

function doGet(e) {
  try {
    // Validate request parameters
    if (!e.parameter.data) {
      return createJSONPResponse(e.parameter.callback, { error: 'No data provided' });
    }

    // Parse data
    let data;
    try {
      data = JSON.parse(e.parameter.data);
    } catch (error) {
      return createJSONPResponse(e.parameter.callback, { error: 'Invalid JSON data' });
    }

    // Add server timestamp and source
    data.server_timestamp = new Date().toISOString();
    data.source_ip = e.parameter.origin || 'unknown';

    // Get client sheet and save data
    const sheet = getClientSheet(data);
    const result = saveData(sheet, data);

    return createJSONPResponse(e.parameter.callback, {
      success: true,
      message: 'Data saved successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return createJSONPResponse(e.parameter.callback, {
      error: error.message || 'Internal server error'
    });
  }
}

function createJSONPResponse(callback, data) {
  const jsonString = JSON.stringify(data);
  const output = callback ? `${callback}(${jsonString});` : jsonString;
  
  return ContentService.createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// Get or create client sheet
function getClientSheet(data) {
  if (!data) {
    throw new Error('Data parameter is required for getClientSheet');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const token = getClientToken(data) || 'default';
  let sheet = ss.getSheetByName(token);
  
  if (!sheet) {
    // Create new sheet
    sheet = ss.insertSheet(token);
    
    // Set up headers
    const headers = getMLHeaders();
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#f3f3f3');
      
    // Format timestamp column
    const timestampCol = headers.indexOf('timestamp') + 1;
    if (timestampCol > 0) {
      sheet.getRange(2, timestampCol, sheet.getMaxRows() - 1, 1)
        .setNumberFormat('dd.MM.yyyy HH:mm:ss');
    }
  }
  
  return sheet;
}

function processIncomingData(data) {
  try {
    // Log raw data
    logDebug("PROCESSING DATA", {
      timestamp: new Date().toISOString(),
      data: data
    });

    // Get client sheet
    let sheet;
    try {
      sheet = getClientSheet(data);
    } catch (e) {
      logDebug("SHEET ERROR", {
        error: e.message,
        stack: e.stack
      });
      throw new Error(`Failed to get client sheet: ${e.message}`);
    }

    // Process the data
    const flattened = flattenData(data);
    
    // Add to sheet
    try {
      sheet.appendRow(Object.values(flattened));
    } catch (e) {
      logDebug("APPEND ERROR", {
        error: e.message,
        data: flattened
      });
      throw new Error(`Failed to append data: ${e.message}`);
    }

    return {
      status: 'success',
      timestamp: new Date().toISOString(),
      sheet: sheet.getName()
    };

  } catch (error) {
    logDebug("PROCESSING ERROR", {
      error: error.message,
      stack: error.stack,
      data: data
    });
    throw error;
  }
}

// Convert UTC to Moscow time
function toMoscowTime(date) {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

// Add data to processing queue
function addToProcessingQueue(data) {
  // Логируем входящие данные
  logRawData(data, 'incoming');
  
  const cache = CacheService.getScriptCache();
  const queueKey = 'processing_queue';
  
  let queue = [];
  const queueData = cache.get(queueKey);
  
  Logger.log("Current queue data: " + queueData);
  
  if (queueData) {
    try {
      queue = JSON.parse(queueData);
    } catch (e) {
      Logger.log("Error parsing existing queue: " + e.message);
      // Start fresh if queue is corrupted
      queue = [];
    }
  }
  
  const timestamp = toMoscowTime(new Date());
  
  queue.push({
    timestamp,
    data: {
      ...data,
      timestamp: timestamp
    }
  });
  
  Logger.log("Queue size after adding item: " + queue.length);
  
  // Store updated queue
  cache.put(queueKey, JSON.stringify(queue), CACHE_CONFIG.expirationInSeconds);
  
  // Process immediately if queue is getting large
  if (queue.length >= 5) { // Process after 5 items
    Logger.log("Queue reached 5 items, processing immediately");
    processQueue();
  }
  
  return { timestamp, queued: true, clientToken: getClientToken(data) };
}

// Check if queue should be processed
function shouldProcessQueue() {
  const cache = CacheService.getScriptCache();
  const queueData = cache.get('processing_queue');
  
  if (!queueData) {
    Logger.log("No queue data found");
    return false;
  }
  
  try {
    const queue = JSON.parse(queueData);
    const shouldProcess = queue.length >= BATCH_CONFIG.maxRows;
    Logger.log("Queue length: " + queue.length + ", should process: " + shouldProcess);
    return shouldProcess;
  } catch (e) {
    Logger.log("Error checking queue: " + e.message);
    return false;
  }
}

// Process queue
function processQueue() {
  const cache = CacheService.getScriptCache();
  const queueData = cache.get('processing_queue');
  
  if (!queueData) {
    Logger.log("No data in queue");
    return;
  }
  
  // Логируем сырые данные очереди
  logRawData({
    type: 'queue',
    queue_data: queueData
  }, 'queue');
  
  Logger.log("Processing queue data: " + queueData);
  
  let queue;
  try {
    queue = JSON.parse(queueData);
  } catch (e) {
    Logger.log("Error parsing queue data: " + e.message);
    return;
  }
  
  if (queue.length === 0) {
    Logger.log("Queue is empty");
    return;
  }
  
  // Group by client token
  const groupedData = {};
  queue.forEach(item => {
    Logger.log("Processing queue item: " + JSON.stringify(item));
    
    // Get token from the item data
    const token = getClientToken(item.data);
    Logger.log("Got token for item: " + token);
    
    if (!groupedData[token]) {
      groupedData[token] = [];
    }
    groupedData[token].push(item);
  });
  
  Logger.log("Grouped data by tokens: " + JSON.stringify(Object.keys(groupedData)));
  
  // Process each group
  Object.entries(groupedData).forEach(([token, items]) => {
    Logger.log("Processing batch for token: " + token);
    processBatch(token, items);
  });
  
  // Clear queue
  cache.remove('processing_queue');
}

// Process batch of data
function processBatch(clientToken, items) {
  Logger.log("Starting batch processing for token: " + clientToken);
  
  // Log the processing attempt
  logDebug("PROCESSING BATCH", {
    clientToken: clientToken,
    itemCount: items.length,
    firstItem: items[0]
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(clientToken);
  
  Logger.log("Looking for sheet: " + clientToken);
  
  if (!sheet) {
    Logger.log("Creating new sheet for token: " + clientToken);
    logDebug("CREATING NEW SHEET", { clientToken: clientToken });
    
    try {
      sheet = ss.insertSheet(clientToken);
      const headers = getMLHeaders();
      const descriptions = getMLDescriptions();
      
      Logger.log("Setting up headers and descriptions");
      
      // Add headers and descriptions
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
           .setFontWeight('bold')
           .setBackground('#f3f3f3');
           
      sheet.getRange(2, 1, 1, headers.length).setValues([descriptions])
           .setFontStyle('italic')
           .setBackground('#f8f8f8');
      
      // Format headers
      sheet.setFrozenRows(2);
      sheet.setFrozenColumns(1);
      
      // Add filters
      sheet.getRange(1, 1, 2, headers.length).createFilter();

      // Set timestamp column format
      const timestampColumnIndex = headers.indexOf('timestamp') + 1;
      if (timestampColumnIndex > 0) {
        sheet.getRange(3, timestampColumnIndex, sheet.getMaxRows() - 2, 1)
             .setNumberFormat('dd.MM.yyyy HH:mm:ss');
      }
      
      Logger.log("Sheet created and formatted successfully");
    } catch (e) {
      Logger.log("Error creating sheet: " + e.message);
      logDebug("SHEET CREATION ERROR", {
        token: clientToken,
        error: e.message,
        stack: e.stack
      });
      return;
    }
  }

  Logger.log("Processing " + items.length + " items");

  try {
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const processedData = items.map(item => {
      const flatData = flattenData(item.data);
      
      // Convert all timestamp fields to Moscow time
      Object.keys(flatData).forEach(key => {
        if (key.toLowerCase().includes('timestamp') || key.toLowerCase().includes('time')) {
          try {
            flatData[key] = toMoscowTime(flatData[key]);
          } catch (e) {
            // If conversion fails, keep original value
            Logger.log(`Failed to convert time for field ${key}:`, e.message);
          }
        }
      });
      
      if (!flatData.timestamp) {
        flatData.timestamp = toMoscowTime(item.timestamp);
      }
      
      return flatData;
    });
    
    // Check for new fields
    const newFields = new Set();
    processedData.forEach(data => {
      Object.keys(data).forEach(key => {
        if (!existingHeaders.includes(key)) {
          newFields.add(key);
        }
      });
    });
    
    if (newFields.size > 0) {
      const newKeys = Array.from(newFields);
      const lastCol = sheet.getLastColumn();
      
      sheet.getRange(1, lastCol + 1, 1, newKeys.length).setValues([newKeys])
           .setFontWeight('bold')
           .setBackground('#f3f3f3');
           
      const newDescriptions = newKeys.map(key => FIELD_DESCRIPTIONS[key] || key);
      sheet.getRange(2, lastCol + 1, 1, newKeys.length).setValues([newDescriptions])
           .setFontStyle('italic')
           .setBackground('#f8f8f8');
      
      // Format any new timestamp columns
      newKeys.forEach((key, index) => {
        if (key.toLowerCase().includes('timestamp') || key.toLowerCase().includes('time')) {
          sheet.getRange(3, lastCol + 1 + index, sheet.getMaxRows() - 2, 1)
               .setNumberFormat('dd.MM.yyyy HH:mm:ss');
        }
      });
           
      existingHeaders.push(...newKeys);
    }
    
    const rows = processedData.map(data => 
      existingHeaders.map(header => data[header] || '')
    );
    
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, existingHeaders.length)
           .setValues(rows);
    }
    
    Logger.log(`✅ Added ${rows.length} rows to ${clientToken} sheet at ${toMoscowTime(new Date())}`);
    
  } catch (e) {
    Logger.log("Error processing batch: " + e.message);
    logDebug("BATCH PROCESSING ERROR", {
      token: clientToken,
      error: e.message,
      stack: e.stack
    });
  }
}

// Set up time-based trigger for queue processing
function createQueueTrigger() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    Logger.log("Removing existing trigger: " + trigger.getHandlerFunction());
    ScriptApp.deleteTrigger(trigger);
  });
  
  // Create new trigger to run every minute
  const trigger = ScriptApp.newTrigger('processQueue')
    .timeBased()
    .everyMinutes(1)
    .create();
    
  Logger.log("Created new trigger: " + trigger.getUniqueId());
  
  // Also process any existing queue items immediately
  processQueue();
}

// Get ML-friendly headers
function getMLHeaders() {
  return [
    // Session identification
    'session_id',
    'client_id',
    'client_token',
    'timestamp',
    'sdk_version',
    
    // Traffic source
    'source',
    'medium',
    'campaign',
    'term',
    'content',
    'referrer',
    'landing_page',
    'entry_point',
    
    // Page info
    'domain',
    'path',
    'page_url',
    
    // Device info
    'device_type',
    'platform',
    'user_agent',
    'viewport_width',
    'viewport_height',
    
    // Session metrics
    'session_duration',
    'time_to_first_interaction',
    'total_interactions',
    'interaction_frequency',
    
    // Scroll behavior
    'scroll_depth_max',
    'scroll_count',
    'scroll_speed_avg',
    'scroll_path',
    
    // Click behavior
    'click_count',
    'click_elements',
    'click_timing',
    
    // Form interactions
    'form_focus_count',
    'form_input_count',
    'form_submit_count',
    'form_error_count',
    
    // Hover behavior
    'hover_count',
    'hover_duration_total',
    'hover_duration_avg',
    'hover_elements',
    
    // Conversion data
    'conversion_g',        // goals (цели)
    'conversion_v',        // value (значение)
    'conversion_p',        // path (путь конверсии)
    'interest_score',      // скор интереса
    'engagement_score',    // скор вовлеченности
    'conversion_probability', // вероятность конверсии
    'user_segment'         // сегмент пользователя
  ];
}

// Get ML-friendly descriptions
function getMLDescriptions() {
  return getMLHeaders().map(header => FIELD_DESCRIPTIONS[header] || header);
}

// Добавляем функцию для безопасного парсинга JSON
function safeJSONParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    console.error('JSON parse error:', e);
    return defaultValue;
  }
}

// Функция для получения листа с сырыми данными
function getRawDataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let rawSheet = ss.getSheetByName("raw_data");
  
  if (!rawSheet) {
    rawSheet = ss.insertSheet("raw_data");
    // Добавляем заголовки
    rawSheet.getRange(1, 1, 1, 5).setValues([["Timestamp", "Type", "Client ID", "Raw Data", "Source"]])
      .setFontWeight("bold")
      .setBackground("#f3f3f3");
    
    // Форматируем
    rawSheet.setFrozenRows(1);
    rawSheet.setColumnWidth(1, 180); // Timestamp
    rawSheet.setColumnWidth(2, 150); // Type
    rawSheet.setColumnWidth(3, 200); // Client ID
    rawSheet.setColumnWidth(4, 1000); // Raw Data
    rawSheet.setColumnWidth(5, 150); // Source
  }
  
  return rawSheet;
}

// Функция для логирования сырых данных
function logRawData(data, source = 'sdk') {
  try {
    const rawSheet = getRawDataSheet();
    const timestamp = toMoscowTime(new Date());
    
    // Определяем тип данных
    let dataType = 'unknown';
    if (data.name && data.name.includes('oneclick')) {
      dataType = 'oneclick_goal';
    } else if (data.type === 'goal') {
      dataType = 'metrika_goal';
    } else if (data.session_id) {
      dataType = 'session_data';
    }

    // Подготавливаем данные для записи
    const rowData = [
      timestamp,
      dataType,
      data.client_id || data.clientId || 'unknown',
      JSON.stringify(data, null, 2),
      source
    ];

    // Добавляем строку
    rawSheet.appendRow(rowData);
    
    // Форматируем ячейку с JSON
    const lastRow = rawSheet.getLastRow();
    rawSheet.getRange(lastRow, 4).setWrap(true);

  } catch (e) {
    console.error('Error logging raw data:', e);
  }
}

// Функция для парсинга User-Agent
function parseUserAgent(userAgent) {
  if (!userAgent) return { device_type: 'unknown', platform: 'unknown', browser: 'unknown' };
  
  const ua = userAgent.toLowerCase();
  let result = {
    device_type: 'desktop',
    platform: 'unknown',
    browser: 'unknown'
  };
  
  // Определяем тип устройства
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(ua)) {
    result.device_type = 'tablet';
  } else if (/(mobile|iphone|ipod|android|windows phone)/i.test(ua)) {
    result.device_type = 'mobile';
  }
  
  // Определяем платформу
  if (/windows/i.test(ua)) {
    result.platform = 'windows';
  } else if (/macintosh|mac os x/i.test(ua)) {
    result.platform = 'mac';
  } else if (/android/i.test(ua)) {
    result.platform = 'android';
  } else if (/(iphone|ipad|ipod)/i.test(ua)) {
    result.platform = 'ios';
  } else if (/linux/i.test(ua)) {
    result.platform = 'linux';
  }
  
  // Определяем браузер
  if (/YaBrowser/i.test(ua)) {
    result.browser = 'yandex';
  } else if (/chrome/i.test(ua)) {
    result.browser = 'chrome';
  } else if (/firefox/i.test(ua)) {
    result.browser = 'firefox';
  } else if (/safari/i.test(ua)) {
    result.browser = 'safari';
  } else if (/opera|opr/i.test(ua)) {
    result.browser = 'opera';
  } else if (/edge/i.test(ua)) {
    result.browser = 'edge';
  } else if (/msie|trident/i.test(ua)) {
    result.browser = 'ie';
  }
  
  return result;
}

// Функция для расчета глубины прокрутки
function calculateScrollDepth(scrollChunks) {
  if (!scrollChunks || scrollChunks.length === 0) return 0;
  
  // Находим максимальную позицию прокрутки
  const maxScroll = Math.max(...scrollChunks.map(chunk => chunk.position));
  const documentHeight = scrollChunks[0].document_height || 0;
  
  // Если есть высота документа, считаем процент
  if (documentHeight > 0) {
    return Math.min(Math.round((maxScroll / documentHeight) * 100), 100);
  }
  
  return 0;
}

// Функция для форматирования времени просмотра
function formatViewDuration(milliseconds) {
  if (!milliseconds) return '0s';
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Функция для определения типа устройства
function detectDeviceType(data) {
  // Проверяем device_info
  if (data.device_info) {
    if (data.device_info.is_tablet) return 'tablet';
    if (data.device_info.is_mobile) return 'mobile';
    return 'desktop';
  }
  
  // Проверяем UTM метки
  if (data.utm_data?.utm_content?.includes('dvc|')) {
    const match = data.utm_data.utm_content.match(/dvc\|(.*?)(\||$)/);
    if (match) return match[1];
  }
  
  // Проверяем размер viewport
  if (data.user_behavior?.viewport_size) {
    const width = data.user_behavior.viewport_size.width;
    if (width <= 767) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
  }
  
  return 'unknown';
}

// Функция для определения платформы
function detectPlatform(data) {
  if (!data.device_info) return 'unknown';
  
  const ua = (data.device_info.user_agent || '').toLowerCase();
  const platform = (data.device_info.platform || '').toLowerCase();
  
  if (/windows/.test(ua) || /win32/.test(platform) || /win64/.test(platform)) return 'windows';
  if (/macintosh|mac os x/.test(ua) || /mac/.test(platform)) return 'mac';
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua) || /ios/.test(platform)) return 'ios';
  if (/linux/.test(ua) || /linux/.test(platform)) return 'linux';
  
  return platform || 'unknown';
}

// Функция для определения браузера
function detectBrowser(data) {
  if (!data.device_info?.user_agent) return 'unknown';
  
  const ua = data.device_info.user_agent.toLowerCase();
  
  if (/yabrowser/.test(ua)) return 'yandex';
  if (/opr|opera/.test(ua)) return 'opera';
  if (/edg/.test(ua)) return 'edge';
  if (/firefox/.test(ua)) return 'firefox';
  if (/chrome/.test(ua)) return 'chrome';
  if (/safari/.test(ua)) return 'safari';
  if (/msie|trident/.test(ua)) return 'ie';
  
  return 'unknown';
}

// Модифицируем функцию flattenData
function flattenData(data) {
  // Логируем сырые данные
  logRawData(data);
  
  const result = {};
  
  try {
    // Basic fields
    result.session_id = data.session_id || data.client_id || 'unknown';
    result.client_id = data.client_id || 'unknown';
    result.client_token = data.data_token || data.clientToken || 'unknown';
    result.timestamp = data.timestamp ? toMoscowTime(data.timestamp) : toMoscowTime(new Date());
    result.sdk_version = data.sdk_version || 'unknown';

    // Device detection
    result.device_type = detectDeviceType(data);
    result.platform = detectPlatform(data);
    result.browser = detectBrowser(data);

    // Traffic source
    if (data.traffic_source) {
      result.referrer = data.traffic_source.referrer || '';
      result.landing_page = data.traffic_source.landing_page || '';
      result.entry_point = data.traffic_source.entry_point || '';
      result.domain = data.domain || '';
      result.path = data.path || '';
      result.page_url = data.traffic_source.landing_page || data.page_url || '';
    }

    // Session metrics
    result.session_duration = data.session_duration || 0;
    result.time_to_first_interaction = data.user_behavior?.time_to_first_interaction || null;
    result.total_interactions = data.user_behavior?.total_interactions || 0;
    result.interaction_frequency = data.user_behavior?.interaction_frequency?.length || 0;

    // Scroll behavior
    if (data.scroll_chunks && data.scroll_chunks.length > 0) {
      result.scroll_depth_max = Math.max(...data.scroll_chunks.map(chunk => 
        (chunk.position / chunk.document_height) * 100
      ));
      result.scroll_count = data.scroll_chunks.length;
      result.scroll_speed_avg = data.scroll_chunks.reduce((sum, chunk) => sum + chunk.delta, 0) / 
        (data.scroll_chunks[data.scroll_chunks.length - 1].timestamp - data.scroll_chunks[0].timestamp);
      result.scroll_path = JSON.stringify(data.scroll_chunks.map(chunk => ({
        position: chunk.position,
        timestamp: chunk.timestamp
      })));
    }

    // Click behavior
    if (data.cta_clicks) {
      result.click_count = data.cta_clicks.length;
      result.click_elements = JSON.stringify(data.cta_clicks);
      result.click_timing = JSON.stringify(data.user_behavior?.time_between_clicks || []);
    }

    // Form interactions
    if (data.form_interactions) {
      result.form_focus_count = data.form_interactions.filter(i => i.type === 'focus').length;
      result.form_input_count = data.form_interactions.filter(i => i.type === 'input').length;
      result.form_submit_count = data.form_interactions.filter(i => i.type === 'submit').length;
      result.form_error_count = data.form_interactions.filter(i => i.type === 'error').length;
    }

    // ML features
    if (data.ml_features) {
      result.interest_score = calculateInterestScore(data);
      result.engagement_score = calculateEngagementScore(data);
      result.conversion_probability = data.ml_features.conversion_probability?.probability || 0;
      result.user_segment = data.ml_features.user_segment?.primary || 'unknown';
    }

    // Variable duration and hover
    result.var_durat = data.session_duration || 0;
    result.hover_durat = data.hover_events?.reduce((sum, e) => sum + (e.duration || 0), 0) || 0;

    return result;

  } catch (error) {
    console.error('Error in flattenData:', error);
    logRawData({
      error: error.message,
      stack: error.stack,
      original_data: data
    }, 'error');
    
    return {
      session_id: data.session_id || 'error',
      client_id: data.client_id || 'error',
      timestamp: toMoscowTime(new Date()),
      error: error.message
    };
  }
}

// Улучшаем функцию расчета скора интереса
function calculateInterestScore(data) {
  try {
    let score = 0;
    const weights = {
      scroll: 0.3,    // 30% вес для скролла
      interact: 0.3,  // 30% вес для интеракций
      form: 0.2,      // 20% вес для форм
      time: 0.2       // 20% вес для времени
    };

    // 1. Скор скролла (0-0.3)
    if (data.scroll_chunks && data.scroll_chunks.length > 0) {
      const maxScroll = Math.max(...data.scroll_chunks.map(chunk => 
        (chunk.position / (chunk.document_height || 1)) * 100
      ));
      score += (Math.min(maxScroll, 100) / 100) * weights.scroll;
    }

    // 2. Скор интеракций (0-0.3)
    const totalInteractions = (data.user_behavior?.total_interactions || 0);
    if (totalInteractions > 0) {
      score += Math.min(totalInteractions / 10, 1) * weights.interact;
    }

    // 3. Скор форм (0-0.2)
    const formInteractions = (data.form_interactions || []).length;
    if (formInteractions > 0) {
      score += Math.min(formInteractions / 3, 1) * weights.form;
    }

    // 4. Временной скор (0-0.2)
    const sessionDuration = data.session_duration || 0;
    if (sessionDuration > 0) {
      // Нормализуем к 5 минутам
      const timeScore = Math.min(sessionDuration / (5 * 60 * 1000), 1);
      score += timeScore * weights.time;
    }

    // Округляем до 4 знаков после запятой для избежания ошибок с плавающей точкой
    return Math.round(score * 10000) / 10000;

  } catch (e) {
    console.error('Error calculating interest score:', e);
    return 0;
  }
}

// Улучшаем функцию расчета скора вовлеченности
function calculateEngagementScore(data) {
  try {
    let score = 0;
    const weights = {
      duration: 0.25,    // 25% вес для длительности сессии
      density: 0.25,     // 25% вес для плотности взаимодействий
      forms: 0.25,       // 25% вес для работы с формами
      scroll: 0.25       // 25% вес для глубины скролла
    };

    // 1. Скор длительности сессии (0-0.25)
    const sessionDuration = data.session_duration || 0;
    if (sessionDuration > 0) {
      score += Math.min(sessionDuration / (5 * 60 * 1000), 1) * weights.duration;
    }

    // 2. Скор плотности взаимодействий (0-0.25)
    if (sessionDuration > 0 && data.user_behavior?.total_interactions > 0) {
      const density = (data.user_behavior.total_interactions / (sessionDuration / 1000)) * 60; // действий в минуту
      score += Math.min(density / 5, 1) * weights.density;
    }

    // 3. Скор форм (0-0.25)
    const formInteractions = (data.form_interactions || []).length;
    if (formInteractions > 0) {
      score += Math.min(formInteractions / 3, 1) * weights.forms;
    }

    // 4. Скор скролла (0-0.25)
    if (data.scroll_chunks && data.scroll_chunks.length > 0) {
      const maxScroll = Math.max(...data.scroll_chunks.map(chunk => 
        (chunk.position / (chunk.document_height || 1)) * 100
      ));
      score += (Math.min(maxScroll, 100) / 100) * weights.scroll;
    }

    // Округляем до 4 знаков после запятой
    return Math.round(score * 10000) / 10000;

  } catch (e) {
    console.error('Error calculating engagement score:', e);
    return 0;
  }
}

// Константа с описаниями полей
const FIELD_DESCRIPTIONS = {
  // Базовые данные сессии
  'session_id': 'ID сессии',
  'client_id': 'ID клиента в Метрике',
  'clientToken': 'Токен клиента',
  'timestamp': 'Время события',
  
  // UTM-метки
  'utm_source': 'Источник трафика',
  'utm_medium': 'Тип трафика',
  'utm_campaign': 'Название кампании',
  'utm_term': 'Ключевое слово',
  'utm_content': 'Содержание UTM',
  
  // Данные о трафике
  'referrer': 'Реферер',
  'page_url': 'Адрес страницы',
  'domain': 'Домен',
  'path': 'Путь страницы',
  
  // Скролл
  'scroll_depth_max': 'Глубина прокрутки',
  'scroll_chunk_count': 'Число прокруток',
  'scroll_speed': 'Скорость прокрутки',
  
  // Клики
  'click_count': 'Всего кликов',
  'click_cta': 'Клики по кнопкам',
  'click_buy': 'Клики "Купить"',
  'click_cart': 'Клики по корзине',
  
  // Формы
  'form_interaction': 'Работа с формами',
  'form_submitted': 'Отправки форм',
  'form_errors': 'Ошибки в формах',
  
  // E-commerce
  'added_to_cart': 'В корзину',
  'purchase_value': 'Сумма заказа',
  'ecommerce_event_types': 'Типы событий',
  
  // Время
  'focus_time_on_product_card': 'Время на карточке',
  'hover_time_on_cta_max': 'Время на кнопках',
  'hover_time_on_product_avg': 'Среднее на товаре',
  
  // Цели
  'goals_count': 'Число целей',
  'goal_name': 'Название цели',
  'visited_cart': 'Был в корзине',
  'submitted_order': 'Оформил заказ',
  
  // Устройство
  'device_type': 'Тип устройства',
  'platform': 'Платформа',
  'user_agent': 'Браузер',
  'viewport_width': 'Ширина экрана',
  'viewport_height': 'Высота экрана',
  
  // ML-фичи
  'user_behavior_viewport_size_width': 'Ширина экрана',
  'user_behavior_viewport_size_height': 'Высота экрана',
  'user_behavior_total_interactions': 'Всего действий',
  'user_behavior_time_to_first_interaction': 'Время до 1-го действия',
  'ml_features_interest_signals': 'Сигналы интереса',
  'ml_features_behavior_patterns': 'Паттерны поведения',
  'ml_features_user_segment': 'Сегмент пользователя',
  'ml_features_conversion_probability': 'Вероятность конверсии',
  'sdk_version': 'Версия SDK'
}; 
