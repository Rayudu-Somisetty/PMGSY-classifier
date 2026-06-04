/**
 * PMGSY Project Classifier - Frontend Application
 * Handles form submission, API communication, and result display
 */

const predictionForm = document.getElementById('predictionForm');
const submitBtn = document.getElementById('submitBtn');
const resultsSection = document.getElementById('resultsSection');
const loadingState = document.getElementById('loadingState');
const successState = document.getElementById('successState');
const errorState = document.getElementById('errorState');
const predictionOutput = document.getElementById('predictionOutput');
const errorMessage = document.getElementById('errorMessage');
const closeResultsBtn = document.getElementById('closeResultsBtn');
const newClassificationBtn = document.getElementById('newClassificationBtn');
const retryBtn = document.getElementById('retryBtn');
const statusText = document.getElementById('statusText');
const statusIndicator = document.querySelector('.status-indicator');

let appState = {
  isLoading: false,
  lastPayload: null,
};

predictionForm?.addEventListener('submit', handleFormSubmit);
closeResultsBtn?.addEventListener('click', hideResults);
newClassificationBtn?.addEventListener('click', handleNewClassification);
retryBtn?.addEventListener('click', handleRetry);

async function handleFormSubmit(event) {
  event.preventDefault();
  if (appState.isLoading) return;

  if (!predictionForm.checkValidity()) {
    showError('Please fill in all required fields correctly.');
    return;
  }

  const formData = new FormData(predictionForm);
  const payload = formatPayloadForIBM(formData);
  appState.lastPayload = payload;

  showLoadingState();
  await sendPredictionRequest(payload);
}

function formatPayloadForIBM(formData) {
  const fields = [
    'STATE_NAME',
    'DISTRICT_NAME',
    'NO_OF_ROAD_WORK_SANCTIONED',
    'LENGTH_OF_ROAD_WORK_SANCTIONED',
    'NO_OF_BRIDGES_SANCTIONED',
    'COST_OF_WORKS_SANCTIONED',
    'NO_OF_ROAD_WORKS_COMPLETED',
    'LENGTH_OF_ROAD_WORK_COMPLETED',
    'NO_OF_BRIDGES_COMPLETED',
    'EXPENDITURE_OCCURED',
    'NO_OF_ROAD_WORKS_BALANCE',
    'LENGTH_OF_ROAD_WORK_BALANCE',
    'NO_OF_BRIDGES_BALANCE',
    'COLUMN15',
  ];

  const fieldMapping = {
    stateName: 'STATE_NAME',
    districtName: 'DISTRICT_NAME',
    noOfRoadWorkSanctioned: 'NO_OF_ROAD_WORK_SANCTIONED',
    lengthOfRoadWorkSanctioned: 'LENGTH_OF_ROAD_WORK_SANCTIONED',
    noOfBridgesSanctioned: 'NO_OF_BRIDGES_SANCTIONED',
    costOfWorksSanctioned: 'COST_OF_WORKS_SANCTIONED',
    noOfRoadWorksCompleted: 'NO_OF_ROAD_WORKS_COMPLETED',
    lengthOfRoadWorkCompleted: 'LENGTH_OF_ROAD_WORK_COMPLETED',
    noOfBridgesCompleted: 'NO_OF_BRIDGES_COMPLETED',
    expenditureOccurred: 'EXPENDITURE_OCCURED',
    noOfRoadWorksBalance: 'NO_OF_ROAD_WORKS_BALANCE',
    lengthOfRoadWorkBalance: 'LENGTH_OF_ROAD_WORK_BALANCE',
    noOfBridgesBalance: 'NO_OF_BRIDGES_BALANCE',
    column15: 'COLUMN15',
  };

  const values = [];
  const numericIBMKeys = new Set([
    'NO_OF_ROAD_WORK_SANCTIONED',
    'LENGTH_OF_ROAD_WORK_SANCTIONED',
    'NO_OF_BRIDGES_SANCTIONED',
    'COST_OF_WORKS_SANCTIONED',
    'NO_OF_ROAD_WORKS_COMPLETED',
    'LENGTH_OF_ROAD_WORK_COMPLETED',
    'NO_OF_BRIDGES_COMPLETED',
    'EXPENDITURE_OCCURED',
    'NO_OF_ROAD_WORKS_BALANCE',
    'LENGTH_OF_ROAD_WORK_BALANCE',
    'NO_OF_BRIDGES_BALANCE',
  ]);

  for (const [formKey, ibmKey] of Object.entries(fieldMapping)) {
    const value = formData.get(formKey);
    if (numericIBMKeys.has(ibmKey)) values.push(parseFloat(value) || 0);
    else values.push(String(value));
  }

  return {
    input_data: [
      {
        fields,
        values: [values],
      },
    ],
  };
}

async function sendPredictionRequest(payload) {
  appState.isLoading = true;
  if (submitBtn) submitBtn.disabled = true;
  updateStatus('Processing...', '#3498db');

  try {
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      const details = data?.details ? ` Details: ${data.details}` : '';
      throw new Error(data?.error || `HTTP ${response.status}: ${response.statusText}${details}`);
    }

    showSuccessState(data);
    updateStatus('Success', '#27ae60');
  } catch (err) {
    showErrorState(err?.message || 'Classification failed. Please try again.');
    updateStatus('Error', '#e74c3c');
  } finally {
    appState.isLoading = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

function showLoadingState() {
  resultsSection.style.display = 'block';
  loadingState.style.display = 'flex';
  successState.style.display = 'none';
  errorState.style.display = 'none';
  scrollToResults();
}

function showSuccessState(data) {
  successState.style.display = 'block';
  loadingState.style.display = 'none';
  errorState.style.display = 'none';

  const labelValue = document.getElementById('predictedLabelValue');
  if (labelValue) labelValue.textContent = data?.predictedLabel ? String(data.predictedLabel) : '—';

  predictionOutput.textContent = JSON.stringify(data.prediction, null, 2);

  if (data?.metadata?.timestamp) {
    const timestamp = new Date(data.metadata.timestamp);
    const tsEl = document.getElementById('timestampValue');
    if (tsEl) tsEl.textContent = timestamp.toLocaleString();
  }

  if (data?.metadata?.processingTimeMs != null) {
    const ptEl = document.getElementById('processingTimeValue');
    if (ptEl) ptEl.textContent = `${data.metadata.processingTimeMs}ms`;
  }

  scrollToResults();
}

function showErrorState(message) {
  errorState.style.display = 'block';
  loadingState.style.display = 'none';
  successState.style.display = 'none';
  errorMessage.textContent = message || 'An unexpected error occurred. Please try again.';
  scrollToResults();
}

function hideResults() {
  resultsSection.style.display = 'none';
  loadingState.style.display = 'none';
  successState.style.display = 'none';
  errorState.style.display = 'none';
  updateStatus('Ready', '#27ae60');
}

function handleNewClassification() {
  predictionForm.scrollIntoView({ behavior: 'smooth' });
  hideResults();
}

function handleRetry() {
  if (!appState.lastPayload) return;
  showLoadingState();
  sendPredictionRequest(appState.lastPayload);
}

function showError(message) {
  showErrorState(message);
  resultsSection.style.display = 'block';
}

function updateStatus(text, color) {
  if (statusText) statusText.textContent = text;
  if (statusIndicator && color) statusIndicator.style.background = color;
}

function scrollToResults() {
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

document.addEventListener('DOMContentLoaded', () => {
  checkBackendHealth();
  initializeFormValidation();
});

async function checkBackendHealth() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Health endpoint error');
  } catch (_) {
    updateStatus('Server Error', '#e74c3c');
  }
}

function initializeFormValidation() {
  const inputs = predictionForm?.querySelectorAll('.form-input') || [];
  inputs.forEach((input) => {
    input.addEventListener('blur', () => {
      if (input.hasAttribute('required') && input.value.trim() === '') input.classList.add('invalid');
      else input.classList.remove('invalid');
    });
    input.addEventListener('input', () => {
      if (input.value.trim() !== '') input.classList.remove('invalid');
    });
  });
}

