# Lighthouse Performance Baselines

**Date:** TBD (run `scripts/measure-performance.sh` to populate)
**Environment:** Production build (`npm run build && npm start`)
**Tool:** Lighthouse CLI via `npx lighthouse`
**Flags:** `--only-categories=performance --chrome-flags="--headless=new --no-sandbox"`

## How to Measure

1. Build and start the production server:

   ```bash
   npm run build && npm start
   ```

2. In a separate terminal, run the measurement script:

   ```bash
   ./scripts/measure-performance.sh
   ```

3. Copy the output below and commit the updated file.

## Results

### Home Page (`/`)

| Metric      | Value | Target  |
| ----------- | ----- | ------- |
| Performance | --    | > 90    |
| FCP         | --    | < 1.8s  |
| LCP         | --    | < 2.5s  |
| TBT         | --    | < 200ms |
| CLS         | --    | < 0.1   |

### Albums Page (`/albums`)

| Metric      | Value | Target  |
| ----------- | ----- | ------- |
| Performance | --    | > 90    |
| FCP         | --    | < 1.8s  |
| LCP         | --    | < 2.5s  |
| TBT         | --    | < 200ms |
| CLS         | --    | < 0.1   |

## Notes

- Targets are based on Google's "Good" thresholds for Core Web Vitals
- Results will vary by machine; use the same machine for before/after comparisons
- Lighthouse reports (HTML + JSON) are saved to `.planning/baselines/` but not committed to git
- Run with actual photo data in the database for realistic measurements
