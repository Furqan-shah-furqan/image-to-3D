# Web studio verification

Verified during initial implementation:

- `npm test`: 7 passing checks covering actual Three.js geometry, bounded scene validation, model discovery, provider error handling and a mocked generation request contract.
- `npm run build`: successful Vite production build. Three.js makes the main bundle larger than Vite's advisory 500 kB threshold; it is about 166 kB compressed.
- Original upstream test suite: 1,416 tests, passing with 64 upstream skips. No showcase checkout is installed, so skipped showcase checks do not prove generated TypeScript fidelity.
- Browser checks: no uncaught page errors; API key dialog and model selection (mock provider response), real image upload/compression, reference comparison and mobile controls work. Mobile has no horizontal overflow.
- A real Three.js example exported through GLTFExporter in Chromium produced a valid GLB v2 container (674,040 bytes). This verifies the export container and geometry path, not visual fidelity.
- Deployed homepage returns HTTP 200. Deployed generation function imports correctly and rejects GET with HTTP 405.

Limitations: the execution environment cannot create a software WebGL context, so rendered model appearance, orbiting and materials have not been visually verified here. Live Gemini generation/review has not been run because the user's key is supplied later through the homepage. No live Gemini success, photorealistic reconstruction, or upstream strict quality-gate completion is claimed.
