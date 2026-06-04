# TODO - PMGSY Project Classifier (Production-Ready Rebuild)

## Step 1: Create missing config/documentation files
- [x] Add `.env.example`
- [x] Add `public/robots.txt`
- [x] (Optional) Add minimal `public/manifest.webmanifest`

## Step 2: Backend hardening
- [x] Improve logging (request timing, request id)
- [x] Add stricter input validation for 14 features
- [x] Guard for missing `IBM_CLOUD_API_KEY`
- [x] Add IBM call timeout
- [x] Add security headers (no extra deps if possible)


## Step 3: API response improvements (backward compatible)
- [x] Return predicted label prominently while keeping raw IBM response


## Step 4: Frontend improvements
- [x] Improve error UI to include `details` when present
- [x] Display predicted label in a small prominent UI section


## Step 5: Update README
- [x] Align setup/run instructions with actual env vars & endpoints


## Step 6: Quick run sanity check
- [x] Run `npm install`

- [ ] Run `npm run dev`

- [ ] Verify `GET /api/health`
- [ ] Verify `POST /api/predict` end-to-end (using mock payload if IBM key not set)

