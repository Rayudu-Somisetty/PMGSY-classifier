/**
 * PMGSY Project Classifier - Express Backend Server
 * Serves frontend UI and handles local ML predictions from the bundled dataset
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const localModel = require('./localModel');

// ============================================
// Initialize Express App
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;
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


function extractPredictionPayload(body) {
  if (!body) {
    return null;
  }

  if (body.input_data && Array.isArray(body.input_data) && body.input_data.length > 0) {
    return body;
  }

  return body;
}

// ============================================
// Health Check Endpoint
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PMGSY Project Classifier API',
    environment: NODE_ENV,
    model: localModel.summary(),
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// Main Prediction Endpoint
// POST /api/predict
// Handles: Form data → local model → Results
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

    // Validate expected feature count if possible
    if (first.fields.length < 13 || first.values[0].length < 13) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feature count.',
        details: 'Model expects the PMGSY feature payload with at least 13 core fields.',
      });
    }

    console.log('[VALIDATION] ✓ Request payload shape is valid');

    // ============================================
    // Step 1: Run Local Prediction
    // ============================================
    const predictionPayload = extractPredictionPayload(req.body);
    console.log('\n[STEP 1] Running local model prediction...');
    const predictionResult = localModel.predict(predictionPayload);

    // ============================================
    // Step 3: Return Result to Frontend
    // ============================================
    const elapsedTime = Date.now() - startTime;

    const predictedLabel = predictionResult.predictedLabel;

    const responsePayload = {
      success: true,
      prediction: predictionResult,
      predictedLabel,
      metadata: {
        timestamp: new Date().toISOString(),
        processingTimeMs: elapsedTime,
        model: predictionResult.modelName,
        algorithm: predictionResult.algorithm,
        trainingRows: predictionResult.trainingRows,
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

  const summary = localModel.summary();
  console.log('🤖 Local Model:');
  console.log(`   • Model: ${summary.modelName}`);
  console.log(`   • Algorithm: ${summary.algorithm}`);
  console.log(`   • Dataset: ${summary.datasetPath}`);
  console.log(`   • Training rows: ${summary.trainingRows}`);
  console.log(`   • Classes: ${summary.labels.join(', ')}`);
  console.log(`   • Neighbors: ${summary.neighbors}\n`);

  console.log('📚 Available Endpoints:');
  console.log('   • GET  /api/health          - Server health check');
  console.log('   • POST /api/predict         - Make a prediction\n');

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
