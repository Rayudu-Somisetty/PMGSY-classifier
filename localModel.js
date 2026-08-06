const fs = require('fs');
const path = require('path');

const DEFAULT_NEIGHBORS = Number(process.env.MODEL_NEIGHBORS || 7);
const DATASET_PATH = path.join(__dirname, process.env.MODEL_DATASET_PATH || 'PMGSY_DATASET.csv');

const FEATURE_SCHEMA = [
  { name: 'STATE_NAME', type: 'categorical' },
  { name: 'DISTRICT_NAME', type: 'categorical' },
  { name: 'NO_OF_ROAD_WORK_SANCTIONED', type: 'numeric' },
  { name: 'LENGTH_OF_ROAD_WORK_SANCTIONED', type: 'numeric' },
  { name: 'NO_OF_BRIDGES_SANCTIONED', type: 'numeric' },
  { name: 'COST_OF_WORKS_SANCTIONED', type: 'numeric' },
  { name: 'NO_OF_ROAD_WORKS_COMPLETED', type: 'numeric' },
  { name: 'LENGTH_OF_ROAD_WORK_COMPLETED', type: 'numeric' },
  { name: 'NO_OF_BRIDGES_COMPLETED', type: 'numeric' },
  { name: 'EXPENDITURE_OCCURED', type: 'numeric' },
  { name: 'NO_OF_ROAD_WORKS_BALANCE', type: 'numeric' },
  { name: 'LENGTH_OF_ROAD_WORK_BALANCE', type: 'numeric' },
  { name: 'NO_OF_BRIDGES_BALANCE', type: 'numeric' },
];

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function toNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseDataset(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('The bundled dataset does not contain enough rows to train a local model.');
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.trim()).filter(Boolean);

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const record = {};

    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? '').trim();
    });

    return record;
  }).filter((record) => record.PMGSY_SCHEME);
}

function buildFeatureVector(record, numericStats = null) {
  const vector = {};

  for (const feature of FEATURE_SCHEMA) {
    const rawValue = record[feature.name];
    if (feature.type === 'numeric') {
      const numericValue = toNumber(rawValue);
      vector[feature.name] = numericValue ?? (numericStats ? numericStats[feature.name].mean : 0);
    } else {
      vector[feature.name] = normalizeText(rawValue) || 'unknown';
    }
  }

  return vector;
}

function buildNumericStats(records) {
  const stats = {};

  for (const feature of FEATURE_SCHEMA.filter((item) => item.type === 'numeric')) {
    const values = records
      .map((record) => toNumber(record[feature.name]))
      .filter((value) => value != null);

    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length
      ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
      : 0;

    stats[feature.name] = {
      mean,
      std: Math.sqrt(variance) || 1,
    };
  }

  return stats;
}

function buildModel(records) {
  const numericStats = buildNumericStats(records);
  const trainingRows = records.map((record) => ({
    label: record.PMGSY_SCHEME,
    features: buildFeatureVector(record, numericStats),
  }));
  const labelCounts = trainingRows.reduce((acc, row) => {
    acc[row.label] = (acc[row.label] || 0) + 1;
    return acc;
  }, {});

  const majorityLabel = Object.entries(labelCounts)
    .sort((left, right) => right[1] - left[1])[0]?.[0] || 'PMGSY-I';

  return {
    rows: trainingRows,
    numericStats,
    labelCounts,
    majorityLabel,
    featureNames: FEATURE_SCHEMA.map((feature) => feature.name),
    numericFeatures: FEATURE_SCHEMA.filter((feature) => feature.type === 'numeric').map((feature) => feature.name),
    categoricalFeatures: FEATURE_SCHEMA.filter((feature) => feature.type === 'categorical').map((feature) => feature.name),
  };
}

function normalizeNumericValue(value, stats) {
  const centered = value - stats.mean;
  return centered / stats.std;
}

function distanceBetween(queryFeatures, rowFeatures, model) {
  let distance = 0;

  for (const featureName of model.numericFeatures) {
    const queryValue = normalizeNumericValue(queryFeatures[featureName], model.numericStats[featureName]);
    const rowValue = normalizeNumericValue(rowFeatures[featureName], model.numericStats[featureName]);
    const delta = queryValue - rowValue;
    distance += delta * delta;
  }

  const categoricalWeights = {
    STATE_NAME: 1.5,
    DISTRICT_NAME: 1,
  };

  for (const featureName of model.categoricalFeatures) {
    if (queryFeatures[featureName] !== rowFeatures[featureName]) {
      distance += categoricalWeights[featureName] || 1;
    }
  }

  return Math.sqrt(distance);
}

function voteOnNeighbors(neighbors) {
  const scores = new Map();

  neighbors.forEach((neighbor, index) => {
    const label = neighbor.label;
    const weight = 1 / (neighbor.distance + 0.001 + (index * 0.0001));
    scores.set(label, (scores.get(label) || 0) + weight);
  });

  const ranked = [...scores.entries()]
    .map(([label, score]) => ({ label, score }))
    .sort((left, right) => right.score - left.score);

  const totalScore = ranked.reduce((sum, item) => sum + item.score, 0) || 1;
  const winning = ranked[0] || { label: 'PMGSY-I', score: 1 };

  return {
    predictedLabel: winning.label,
    confidence: Number((winning.score / totalScore).toFixed(4)),
    labelScores: ranked.map((item) => ({
      label: item.label,
      score: Number(item.score.toFixed(4)),
      probability: Number((item.score / totalScore).toFixed(4)),
    })),
  };
}

function extractFeatures(payload = {}) {
  if (payload.input_data && Array.isArray(payload.input_data) && payload.input_data[0]) {
    const { fields = [], values = [] } = payload.input_data[0];
    const firstRow = Array.isArray(values[0]) ? values[0] : [];
    const extracted = {};

    fields.forEach((field, index) => {
      extracted[field] = firstRow[index];
    });

    return extracted;
  }

  return payload;
}

function createLocalModel() {
  const csvText = fs.readFileSync(DATASET_PATH, 'utf8');
  const records = parseDataset(csvText);

  if (!records.length) {
    throw new Error('No usable training rows were found in PMGSY_DATASET.csv.');
  }

  const model = buildModel(records);

  return {
    model,
    datasetPath: DATASET_PATH,
    trainingRows: records.length,
    predict(payload) {
      const rawFeatures = extractFeatures(payload);
      const queryFeatures = buildFeatureVector(rawFeatures, model.numericStats);

      const rankedNeighbors = model.rows
        .map((row) => ({
          label: row.label,
          distance: distanceBetween(queryFeatures, row.features, model),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, Math.max(1, DEFAULT_NEIGHBORS));

      const vote = voteOnNeighbors(rankedNeighbors);

      return {
        ...vote,
        algorithm: 'weighted-k-nearest-neighbors',
        neighborsUsed: rankedNeighbors.length,
        trainingRows: records.length,
        modelName: 'Local PMGSY KNN Classifier',
        topNeighbors: rankedNeighbors.map((neighbor) => ({
          label: neighbor.label,
          distance: Number(neighbor.distance.toFixed(4)),
        })),
      };
    },
    summary() {
      return {
        modelName: 'Local PMGSY KNN Classifier',
        algorithm: 'weighted-k-nearest-neighbors',
        datasetPath: path.basename(DATASET_PATH),
        trainingRows: records.length,
        features: model.featureNames,
        labels: Object.keys(model.labelCounts),
        majorityLabel: model.majorityLabel,
        neighbors: DEFAULT_NEIGHBORS,
      };
    },
  };
}

module.exports = createLocalModel();