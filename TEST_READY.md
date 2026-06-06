# TEST_READY

## Test Execution

To run the entire E2E test suite locally in an offline-independent, deterministic environment, use:

```bash
npm test
```

### Expectations

- **Dependencies**: The test runner executes offline using high-fidelity mocked APIs for Service Worker, Pyodide, IndexedDB, CSS Font Loading, and Blob downloading.
- **Environment**: Vitest with JSDOM is configured to simulate browser conditions.
- **Result**: All tests are expected to pass with 0 failures.

## Coverage Summary per Tier

- **Tier 1 (Happy Path)**: 25 tests total. Covers standard operations for all 5 core features.
- **Tier 2 (Edge Cases & Boundaries)**: 25 tests total. Covers boundary conditions, invalid inputs, error handling, and recovery.
- **Tier 3 (Pairwise combinations)**: 5 tests total. Evaluates interactions between layout, squeeze strategy, and OpenType/GSUB activation.
- **Tier 4 (Real-world workloads)**: 5 tests total. Models complete scenarios such as worshipping slides setup, cold boots, database recovery, and dynamically loading custom fonts.

## Feature Checklist

- [x] Feature 1: Preview Layout & Rendering
  - [x] Tier 1 Happy Path: Placement, tracking, scaling, SVG generation
  - [x] Tier 2 Edge Cases: Out of bounds offsets, extreme squeeze values, missing character lookups
- [x] Feature 2: TTF Compilation
  - [x] Tier 1 Happy Path: Generating SVG XML glyph definitions and building TTF buffer via `svg2ttf`
  - [x] Tier 2 Edge Cases: Empty glyph arrays, malformed coordinates, size-limit checks
- [x] Feature 3: Pyodide GSUB Injection & WOFF2
  - [x] Tier 1 Happy Path: Loading offline packages, running injection scripts, WOFF2 compression
  - [x] Tier 2 Edge Cases: Missing python dependencies, FS missing files, invalid python scripts
- [x] Feature 4: Service Worker & Offline Caching
  - [x] Tier 1 Happy Path: SW registration, offline asset interception, precache static assets
  - [x] Tier 2 Edge Cases: SW load failure fallbacks, cache misses, cache-bypass rules, size limit eviction
- [x] Feature 5: IndexedDB Storage & Persistence
  - [x] Tier 1 Happy Path: Opening DB, saving/retrieving TTF/WOFF2 blobs and configurations
  - [x] Tier 2 Edge Cases: Missing keys, invalid transaction targets, storage quota limit errors
- [x] Tier 3: Pairwise Combinations
  - [x] Systematic layout & feature toggles testing
- [x] Tier 4: Real-world Application Scenarios
  - [x] End-to-end integration workflows (cold boot, slide presentation, recovery from database corruption)
