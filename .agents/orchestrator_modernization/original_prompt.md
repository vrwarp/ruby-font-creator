# Original User Request

## 2026-06-04T22:33:23-07:00

Modernize the ruby-font-creator repository to the latest standards: convert to TypeScript, configure npm, migration from AVA to Vitest, replace webfont with svgtofont, inline chinese-data submodule, and set up modern linting/CI.

Working directory: /Users/btsai/antigravity/ruby-font-creator
Integrity mode: development

### Requirements

#### R1. Language & Build Modernization

- Migrate the codebase fully from JavaScript to TypeScript (Node 22, ESM module resolution).
- Set up `package.json` to use `npm` exclusively, defining modern scripts for testing, linting, formatting, typechecking, and font building.
- Replace dynamic/CommonJS imports with ESM-compliant imports.

#### R2. Dependency Updates

- Replace legacy packages (`ava`, `babel-core`, `del`, `jsdom` (9.x), `jsonfile`, `webfont`) with modern equivalents (`vitest`, `typescript`, `tsx`, `jsdom` (25.x), and `svgtofont`).
- Configure Vitest as the test runner instead of AVA.
- Set up ESLint v9 (flat config) and Prettier for linting/formatting, along with Husky and lint-staged.

#### R3. Submodule Inlining

- Inline the `chinese-data` repository source code (under `data/chinese/`) and migrate its JS components to TypeScript.
- Remove the `hanzi-pinyin-font` submodule and `.gitmodules`.

#### R4. CI/CD Pipeline

- Configure a GitHub Actions workflow (`.github/workflows/ci.yml`) to typecheck, lint, format check, and run tests on Node 22/24.

### Acceptance Criteria

#### Test suite execution

- [ ] `npm test` successfully passes all tests under Vitest.
- [ ] `npx tsc --noEmit` successfully compiles the TS codebase without errors.
- [ ] `npm run lint` and `npm run format:check` run without errors.
- [ ] `npm run build:font` successfully generates font assets.
- [ ] The GitHub Actions CI configuration is correct and complete.
