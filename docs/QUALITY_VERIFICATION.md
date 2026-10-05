# Geometry and texture quality corrections

The current app was inspected at upstream commit `0a7ef22e468af7f4bcb612fbf82a3d655e321de6`.

## Confirmed bottlenecks and changes

- Organic deformation moved duplicate cap/UV seam vertices along different normals, opening cracks. It now displaces shared positions together and reconciles normals across originally smooth seams while keeping hard edges.
- Cylinders/cones had only top and bottom side rings; boxes had only corner vertices. These could not represent intermediate organic deformation or surface variation. Surface-enabled geometry now uses bounded additional subdivisions. Smooth spheres also have more silhouette samples.
- Imported photographic/PBR textures retained Three.js's default 1x anisotropy. Texture sampling now uses up to 8x, bounded by the device capability. Original image pixels, UV transforms, color spaces and PBR channels are preserved.
- AI comparison used the interactive viewport, including arbitrary zoom, orbit, hidden parts, wireframe and background. It now receives a labelled four-view contact sheet of the complete object under fixed neutral lighting. All views fit the bounding sphere. The interactive scene and material state are preserved, including on render failures.
- Gemini reference uploads always used lossy JPEG. PNG is now retained when it fits the existing request budget, otherwise JPEG is attempted at 0.94, 0.90 and 0.88 quality. Request size limits remain enforced.

## Verification

- 19 automated tests pass, including cap seam continuity, smooth UV seam normals, interior surface sampling, preservation of PBR maps/pixels/UVs, four-view camera framing for long/tall/wide objects, and state restoration after render errors.
- Before/after deterministic cylinder fixture: radius 1, height 2, 48 radial segments, 8 height segments; deformation amplitude 0.12, frequency 7, seed 3. Maximum separation of originally coincident vertices decreased from **0.16075035 units to 0**.
- A generated GLB was checked for version 2, normals and baked surface color attributes. The downloaded standalone Three.js source also builds successfully.
- Production Vite build passes. HTML and CSS are unchanged. Provider choices, TRELLIS sampling settings and GPU/API call budgets are unchanged.

## Limits

These checks verify concrete geometry/rendering corrections, not photographic reconstruction accuracy. No authenticated Gemini/TRELLIS image generation was run for this change, so no before/after semantic similarity score is claimed. Local Chromium crashes on startup in this execution environment; browser screenshots and visual GPU verification remain unverified. Hidden surfaces still must be inferred from the available photographs.

# Project and material update

## Additional limitations addressed

- Extruded objects could not express negative space. `holes` now describes actual inner outlines, enabling handles, frames and cut-outs. Ray tests verify that the opening is empty while the surrounding wall remains solid.
- Procedural materials previously relied on base color and vertex variation. An explicit `detail` setting now adds tileable normal and roughness maps for observed wood, fabric, stone or organic surfaces. These are procedural microstructure, not recovered photographic textures. They preserve the image-derived base color and export through GLB. Imported textured meshes keep their existing maps.
- Reference instructions now prioritize measured relative proportions, silhouette and openings ahead of component counts. Studio lighting is neutral to reduce color casts and excessive ambient flattening.
- A detached `Client.connect` call lost Gradio's static class binding and failed before contacting TRELLIS. The default connection now retains its class context, with a regression test.

## Projects and UI

IndexedDB stores each project's model, original reference image, additional angles, material edits, visibility, camera, stage, engine, prompt and detail selection. Sidebar actions create, rename, duplicate, open and delete independent projects. Saves are debounced; switching flushes pending edits. Large asset records are separate from list metadata. API keys are excluded from snapshots and remain session-only. Projects are local to the browser/device, not cloud-synced.

Both sidebars remain scrollable with hidden scrollbars and 16px top spacing (12px on mobile). Engine/import controls have 18px bottom spacing. Main panels, controls and detail segments use 35px corners with the existing typography and palette.

## Current verification

- 22 automated tests pass, including real holes, deterministic linear PBR maps and Gradio connection context.
- Chromium was repaired by fully extracting its executable and providing the matching graphics libraries. Actual WebGL rendering now works.
- Browser tests passed: new project, rename, duplicate, independent prompt/material changes, reload persistence, deletion, engine settings, image upload, controlled generation response, and GLB export. No uncaught page errors.
- A controlled scene containing a cut-out and procedural PBR detail rendered and exported as a 152,040-byte GLB with normal and metallic-roughness textures. A separate imported texture round-trip also passed.
- Desktop 1440px and mobile 390px screenshots inspected. No mobile horizontal overflow. Computed control radius: 35px; sidebar scrollbar: none; desktop top margin: 16px; import bottom spacing: 18px.
- Anonymous TRELLIS live call passed connection, session creation and image preparation, then reached image-to-3D generation. The provider rejected it with a ZeroGPU quota error. No live reconstruction quality improvement is claimed from this test. The browser generation test uses a deterministic API fixture; it verifies the application's rendering/export path, not Gemini's image interpretation.
