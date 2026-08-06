# PMGSY Project Classifier

A local machine learning web app for classifying PMGSY rural infrastructure projects into scheme categories using the bundled CSV dataset and a weighted k-nearest-neighbors model.

## Overview

The application keeps the full prediction flow on the server, trains from the included [PMGSY_DATASET.csv](PMGSY_DATASET.csv) at startup, and returns a local prediction without calling any external ML API.

## Tech Stack

- Node.js
- Express.js
- Vanilla JavaScript frontend
- Local weighted k-NN classifier

## How It Works

1. The frontend collects the 13 core project features plus an optional extra text field.
2. The server reads the bundled CSV and prepares a normalized training set.
3. A weighted k-NN lookup finds the closest historical PMGSY projects.
4. The predicted label and confidence are returned to the browser.

## Local Setup

### Prerequisites

- Node.js 18 or newer
- npm

### Install

```bash
npm install
```

### Run Locally

```bash
npm start
```

Open `http://localhost:3000` after the server starts.

### Development Mode

```bash
npm run dev
```

## Environment Variables

Copy [.env.example](.env.example) to `.env` if you want to override defaults.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Runtime mode | `development` |
| `MODEL_NEIGHBORS` | Number of neighbors used by the classifier | `7` |
| `MODEL_DATASET_PATH` | Alternate training CSV path | `PMGSY_DATASET.csv` |

## API

### `GET /api/health`

Returns service status and a short model summary.

### `POST /api/predict`

Accepts the same payload the frontend sends:

```json
{
  "input_data": [
    {
      "fields": ["STATE_NAME", "DISTRICT_NAME", "NO_OF_ROAD_WORK_SANCTIONED"],
      "values": [["Andhra Pradesh", "Chittoor", 84]]
    }
  ]
}
```

The response includes `success`, `prediction`, `predictedLabel`, and metadata such as processing time and model name.

## Deployment

### Render

This repository includes both [render.yaml](render.yaml) and [Procfile](Procfile).

1. Push the repository to GitHub.
2. Create a new Render Web Service from the repo or import the blueprint.
3. Use the Node environment, `npm install` as the build command, and `npm start` as the start command.
4. Make sure the service uses port `3000` or the platform-provided `PORT` variable.

### General Notes

- No external ML key is required.
- The model trains from the bundled dataset at startup, so keep [PMGSY_DATASET.csv](PMGSY_DATASET.csv) in the repository.
- If you replace the dataset, redeploy the service so the model retrains on the new data.

## Project Structure

```text
.
├── localModel.js
├── server.js
├── package.json
├── PMGSY_DATASET.csv
├── Procfile
├── render.yaml
├── README.md
└── public/
    ├── app.js
    ├── index.html
    └── style.css
```

## Troubleshooting

- If predictions fail, confirm `PMGSY_DATASET.csv` is present and readable.
- If the server does not start on a hosting platform, ensure the `PORT` environment variable is forwarded correctly.
- If you change the dataset format, keep the 13 core feature names intact.

## License

ISC