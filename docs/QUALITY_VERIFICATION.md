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
