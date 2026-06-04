/**
 * PMGSY Project Classifier - Express Backend Server
 * Serves frontend UI and handles secure IBM Watson ML API calls
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// ============================================
// Initialize Express App
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;
const IBM_CLOUD_API_KEY = process.env.IBM_CLOUD_API_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// Middleware Configuration
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight security headers (no extra deps)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// Request ID + basic structured logging
app.use((req, res, next) => {
  const requestId = Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
  req.requestId = requestId;
  const startedAt = Date.now();

  res.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    console.log(`[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs}ms)`);
  });

  next();
});


// ============================================
// IBM Watson ML Configuration
// ============================================
const IBM_AUTH_URL = process.env.IBM_AUTH_URL || 'https://iam.cloud.ibm.com/identity/token';
const IBM_SCORING_URL = process.env.IBM_SCORING_URL || 'https://au-syd.ml.cloud.ibm.com/ml/v4/deployments/019e9206-04c4-7346-ab4a-90e04f7ef203/predictions?version=2021-05-01';


// ============================================
// Step 1: IBM Authentication
// Retrieves access token using API key
// ============================================
async function getIBMAccessToken() {
  if (!IBM_CLOUD_API_KEY) {
    const msg = 'IBM_CLOUD_API_KEY is not configured on the server.';
    console.error('[IBM Auth] ✗', msg);
    throw new Error(msg);
  }
  try {
    console.log('[IBM Auth] Requesting access token...');
    
    const response = await fetch(IBM_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${IBM_CLOUD_API_KEY}`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IBM Authentication failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[IBM Auth] ✓ Access token obtained successfully');
    return data.access_token;
  } catch (error) {
    console.error('[IBM Auth] ✗ Error fetching access token:', error.message);
    throw error;
  }
}

// ============================================
// Step 2: Send Prediction to IBM Watson ML
// Uses the access token to make authenticated prediction request
// ============================================
async function sendPredictionToIBM(accessToken, payload) {
  // Abort if IBM request hangs
  const timeoutMs = Number(process.env.IBM_TIMEOUT_MS || 15000);

  try {
    console.log('[IBM Prediction] Sending prediction request to IBM Watson ML...');
    console.log('[IBM Prediction] Payload:', JSON.stringify(payload, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(IBM_SCORING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }


    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IBM Prediction failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[IBM Prediction] ✓ Prediction received successfully');
    return data;
  } catch (error) {
    console.error('[IBM Prediction] ✗ Error sending prediction:', error.message);
    throw error;
  }
}

// ============================================
// Health Check Endpoint
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PMGSY Project Classifier API',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// Main Prediction Endpoint
// POST /api/predict
// Handles: Form data → IBM Auth → ML Model → Results
// ============================================
app.post('/api/predict', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('[PREDICTION REQUEST] Received at', new Date().toISOString());
    console.log('='.repeat(60));

    // ============================================
    // Validate Input
    // ============================================
    if (!req.body || !req.body.input_data || !Array.isArray(req.body.input_data) || req.body.input_data.length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request format. Expected input_data array.',
        details: 'Payload must contain input_data: [{ fields: [...], values: [[...]] }].',
      });
    }

    const first = req.body.input_data[0];
    if (!first || !Array.isArray(first.fields) || !Array.isArray(first.values) || !Array.isArray(first.values[0])) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input_data shape.',
        details: 'Expected input_data[0].fields to be an array and input_data[0].values to be a 2D array ([[...]]).',
      });
    }

    // Validate expected 14-feature count if possible
    if (first.fields.length !== 14 || first.values[0].length !== 14) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feature count.',
        details: 'Model expects exactly 14 features (fields and values length must both be 14).',
      });
    }

    console.log('[VALIDATION] ✓ Request payload shape is valid');


    // ============================================
    // Step 1: Authenticate with IBM
    // ============================================
    console.log('\n[STEP 1] Authenticating with IBM Cloud...');
    const accessToken = await getIBMAccessToken();

    // ============================================
    // Step 2: Send Prediction Request
    // ============================================
    console.log('\n[STEP 2] Sending prediction to IBM Watson ML...');
    const predictionResult = await sendPredictionToIBM(accessToken, req.body);

    // ============================================
    // Step 3: Return Result to Frontend
    // ============================================
    const elapsedTime = Date.now() - startTime;

    // Try to extract a friendly predicted label (best-effort, backward compatible)
    let predictedLabel = null;
    try {
      // Common IBM Watson format: { predictions: [{ fields: ["prediction"], values: [["PMGSY-I"]] }] }
      const preds = predictionResult && (predictionResult.predictions || predictionResult);
      const firstPred = Array.isArray(preds) ? preds[0] : (predictionResult.predictions && predictionResult.predictions[0]);
      if (firstPred && Array.isArray(firstPred.values) && firstPred.values[0] && firstPred.values[0][0] != null) {
        predictedLabel = String(firstPred.values[0][0]);
      }
      if (!predictedLabel && Array.isArray(preds) && preds[0]?.values?.[0]?.[0] != null) {
        predictedLabel = String(preds[0].values[0][0]);
      }
    } catch (_) {
      // ignore parsing issues
    }

    const responsePayload = {
      success: true,
      prediction: predictionResult,
      predictedLabel,
      metadata: {
        timestamp: new Date().toISOString(),
        processingTimeMs: elapsedTime,
        model: 'XGBoost Classifier (IBM Watson ML)',
      },
    };


    console.log('\n[RESPONSE] ✓ Sending result to client');
    console.log(`[METRICS] Total processing time: ${elapsedTime}ms`);
    console.log('='.repeat(60) + '\n');

    res.json(responsePayload);
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    
    console.error('\n[ERROR] Prediction failed');
    console.error('[ERROR] Message:', error.message);
    console.error(`[METRICS] Failed after ${elapsedTime}ms`);
    console.log('='.repeat(60) + '\n');

    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during prediction',
      details: NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================
// SPA Fallback Route
// Serves index.html for client-side routing
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET  /api/health',
      'POST /api/predict',
    ],
  });
});

// ============================================
// Global Error Handler
// ============================================
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// Server Startup
// ============================================
app.listen(PORT, () => {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('║' + '  🚀 PMGSY PROJECT CLASSIFIER - SERVER STARTED'.padEnd(59) + '║');
  console.log('║' + ' '.repeat(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝\n');

  console.log('📊 Service Information:');
  console.log(`   • Name: PMGSY Project Classification API`);
  console.log(`   • Port: ${PORT}`);
  console.log(`   • Environment: ${NODE_ENV}`);
  console.log(`   • Frontend: http://localhost:${PORT}`);
  console.log(`   • Health Check: http://localhost:${PORT}/api/health`);
  console.log(`   • API Endpoint: POST http://localhost:${PORT}/api/predict\n`);

  console.log('🔐 Configuration:');
  console.log(`   • IBM API Key: ${IBM_CLOUD_API_KEY ? '✓ Configured' : '✗ NOT SET'}`);
  console.log(`   • IBM Auth URL: ${IBM_AUTH_URL}`);
  console.log(`   • IBM Model Deployment: au-syd region\n`);

  console.log('📚 Available Endpoints:');
  console.log('   • GET  /api/health          - Server health check');
  console.log('   • POST /api/predict         - Make a prediction\n');

  if (!IBM_CLOUD_API_KEY) {
    console.warn('\n⚠️  WARNING: IBM_CLOUD_API_KEY is not configured!');
    console.warn('   Please set IBM_CLOUD_API_KEY in your .env file\n');
  }

  console.log('Press Ctrl+C to stop the server\n');
});

// ============================================
// Graceful Shutdown
// ============================================
process.on('SIGINT', () => {
  console.log('\n\n📋 Shutting down server gracefully...');
  process.exit(0);
});

module.exports = app;
