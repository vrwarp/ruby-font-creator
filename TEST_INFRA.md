# Ruby Font Creator PWA — E2E Test Infrastructure Specification

This document details the E2E testing architecture, methodology, feature coverage, and testing philosophy implemented to ensure the reliability and offline capability of the Ruby Font Creator Progressive Web Application.

---

## 1. Test Philosophy

Our testing approach follows a strict **opaque-box, requirement-driven** model.

- **Requirement-Driven**: Tests are designed directly from the core specifications and user stories of the application. They verify that the application behaves correctly under specific user actions and configurations.
- **Opaque-Box**: The test suites interact with the application through its public APIs, mock interfaces, and DOM controls rather than inspecting private class states or internal variables. By simulating browser APIs (IndexedDB, Service Workers, Pyodide, CSS Font Loading, Blob downloading) at the global boundary, we test the functional behavior of the front-end logic as a user would experience it.
- **Self-Contained & Deterministic**: Every test must run without external network calls. Offline assets, mock Pyodide wheels, and IndexDB databases must be fully mocked and cleaned up after execution to ensure tests are reproducible and clean.

---

## 2. Feature Inventory

We test the core product behavior against five primary features:

### Feature 1: Preview Layout & Rendering

- **Description**: Dynamically calculates and renders preview inline SVGs combining base Hanzi glyph paths and pinyin annotation layouts based on user configurations.
- **Core Requirements**:
  - Position pinyin above or below the Hanzi glyph.
  - Compute correct horizontal tracking (kerning) and optical squeeze (width scaling).
  - Apply length-based squeeze strategies (`smart`, `proportional`, `global`).
  - Render SVG paths with stroke-weight compensation for heavier font weights.

### Feature 2: TTF Compilation

- **Description**: Compiles character SVG vectors into a single TrueType Font (TTF) binary in-browser.
- **Core Requirements**:
  - Generate conformant SVG Font XML containing all user glyph mappings.
  - Compile the SVG Font XML to a binary TTF using `svg2ttf` compiled for browser execution.
  - Handle conversion boundaries and produce valid TTF binary arrays.

### Feature 3: Pyodide GSUB Injection & WOFF2

- **Description**: In-browser Python runtime execution via Pyodide to load dependencies (`fonttools`, `brotli`) and inject OpenType GSUB tables for polyphonic character mapping, generating a compressed WOFF2 font.
- **Core Requirements**:
  - Initialize Pyodide runtime environment with local vendored wheels (offline).
  - Inject alternate glyph substitutions (GSUB rules) into the compiled TTF font.
  - Compress the resulting TTF with brotli to produce WOFF2.
  - Verify logs and handle error states gracefully.

### Feature 4: Service Worker & Offline Caching

- **Description**: Service worker (`sw.js`) handles offline operation of the PWA by caching static files, Pyodide WebAssembly assets, and Python wheels.
- **Core Requirements**:
  - Register the service worker successfully on application load.
  - Intercept network requests and serve cached files during offline mode.
  - Handle dynamic updates to the cache when new resources are loaded.

### Feature 5: IndexedDB Storage & Persistence

- **Description**: Persistent storage inside IndexedDB for compiled font binaries (TTF, WOFF2) and active user settings.
- **Core Requirements**:
  - Open a dedicated database, creating necessary object stores (`fonts`, `settings`).
  - Store and retrieve font files (TTF/WOFF2 blobs) using unique font names as keys.
  - Save and load application state configuration options.
  - Provide functionality to list and delete stored fonts.

---

## 3. Test Methodology

The E2E test suites utilize several software quality methodologies:

- **Category-Partition Testing**: Input spaces (such as pinyin strings, offset limits, and scale limits) are partitioned into discrete equivalence classes (e.g., normal strings, long strings, invalid configurations) to ensure complete functional coverage.
- **Boundary Value Analysis (BVA)**: Input parameters like optical squeeze (30% to 120%), character width (50px to 150px), and vertical offset (-20px to 60px) are tested at their absolute minimum, maximum, and out-of-bound values.
- **Pairwise Combination Testing**: Important combinations of independent variables (Placement $\times$ Strategy $\times$ Polyphonic Toggle) are systematically paired and tested together to detect interaction bugs.
- **Real-World Workload Simulation**: Tests emulate complete user workflows (e.g., loading presets, adjusting spacing, running the compiler, storing in DB, entering presentation mode, and downloading the result).

---

## 4. Test Architecture & Directory Structure

The E2E test runner is **Vitest**, using **JSDOM** to simulate the DOM, and custom mock environments to emulate high-fidelity browser/PWA APIs.

```
/
├── TEST_INFRA.md           # This specification file
├── TEST_READY.md           # Verification checklist and command
├── vitest.config.ts        # Vitest configuration including test paths
└── test/
    └── e2e/
        ├── mocks.ts         # High-fidelity mocks for browser/PWA APIs
        ├── preview.test.ts  # Feature 1: Preview Layout & Rendering
        ├── compilation.test.ts # Feature 2: TTF Compilation
        ├── pyodide.test.ts  # Feature 3: Pyodide GSUB Injection & WOFF2
        ├── pwa.test.ts      # Feature 4: Service Worker & Offline Caching
        ├── storage.test.ts  # Feature 5: IndexedDB Storage & Persistence
        ├── combinations.test.ts # Tier 3: Pairwise Combinations
        └── scenarios.test.ts # Tier 4: Real-world Application Scenarios
```

---

## 5. Coverage Goals & Thresholds

To guarantee robust coverage, tests are categorized into four distinct Tiers:

| Coverage Tier | Focus                                                          | Threshold                   | Actual Configured |
| ------------- | -------------------------------------------------------------- | --------------------------- | ----------------- |
| **Tier 1**    | Happy Path Core Features (5 tests per feature)                 | $\ge 25$ tests              | 25 tests          |
| **Tier 2**    | Edge Cases, Boundaries, & Error Handling (5 tests per feature) | $\ge 25$ tests              | 25 tests          |
| **Tier 3**    | Pairwise Parameter Combinations                                | $\ge 5$ tests               | 5 tests           |
| **Tier 4**    | Real-world Application Scenarios & Workloads                   | $\ge 5$ tests               | 5 tests           |
| **Total**     | **Comprehensive E2E Suite Coverage**                           | $\ge \mathbf{60}$ **tests** | **60 tests**      |

All tests must run and pass with zero failures under `npm test`.
