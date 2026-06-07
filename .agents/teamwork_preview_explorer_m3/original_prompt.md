## 2026-06-06T01:13:36Z

Analyze the codebase and plan Milestone 3 (Client-Side Vector Preview Rendering).
Objective:

1. Examine `src/ruby.ts` and `test/e2e/preview.test.ts`.
2. Plan how to remove Node-specific dependencies `text-to-svg` and `jsdom` from `src/ruby.ts` and port it to use `opentype.js` directly, so it can run browser-side.
3. Keep the public API and contracts of `src/ruby.ts` identical so that `test/e2e/preview.test.ts` passes without modification.
4. Examine how `frontend/main.ts` interacts with `/api/render-preview` and plan how to load `DroidSansFallbackFull.ttf` client-side, parse it via `opentype.js`, and generate previews client-side (bypassing the server-side API).
5. Produce a clear implementation plan including verification instructions and write it to `handoff.md` in your working directory. Send a message back to the parent once completed.
