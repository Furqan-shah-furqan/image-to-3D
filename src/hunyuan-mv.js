import {Client, handle_file} from '@gradio/client';

export const SPACE = 'tencent/Hunyuan3D-2mv';
export const SPACE_URL = 'https://huggingface.co/spaces/tencent/Hunyuan3D-2mv';
export const QUALITY = {
  draft: {steps: 5, octree: 192},
  balanced: {steps: 10, octree: 256},
  detailed: {steps: 30, octree: 320},
};

// front is required. back, left and right are optional extra angles of the SAME object.
// Tries shape + texture first, then falls back to a shape-only mesh.
export async function generateHunyuanMV({
  front, back = null, left = null, right = null,
  token = '', detail = 'balanced', texture = true, signal,
  onProgress = () => {},
  connect = (...args) => Client.connect(...args),
  file = handle_file, fetcher = fetch,
}) {
  let client;
  signal?.throwIfAborted();
  try {
    if (!front) throw new Error('Upload a front image first.');
    const toBlob = async (v) => (!v ? null : v instanceof Blob ? v : await (await fetcher(v, {signal})).blob());
    const [f, b, l, r] = await Promise.all([front, back, left, right].map(toBlob));
    const q = QUALITY[detail] || QUALITY.balanced;

    onProgress('Connecting to Hunyuan3D multi-view', 'Waiting for the free Hugging Face GPU service…', 10);
    client = await connect(SPACE, {...(token ? {token} : {}), events: ['data', 'status']});
    signal?.throwIfAborted();

    async function run(endpoint, pickIndex, title, percent) {
      signal?.throwIfAborted();
      const job = client.submit(endpoint, {
        mv_image_front: file(f),
        ...(b ? {mv_image_back: file(b)} : {}),
        ...(l ? {mv_image_left: file(l)} : {}),
        ...(r ? {mv_image_right: file(r)} : {}),
        steps: q.steps,
        guidance_scale: 5,
        seed: Math.floor(Math.random() * 1e7),
        octree_resolution: q.octree,
        check_box_rembg: true,
        num_chunks: 8000,
        randomize_seed: false,
      });
      const abort = () => { job.cancel().catch(() => {}); job.close_stream(); };
      signal?.addEventListener('abort', abort, {once: true});
      let result;
      try {
        for await (const event of job) {
          signal?.throwIfAborted();
          if (event.type === 'status') {
            if (event.stage === 'error') throw new Error(event.message || 'Hunyuan3D multi-view could not complete this step.');
            const queue = event.position != null ? `Queue position ${event.position + 1}. ` : '';
            onProgress(title, `${queue}${event.stage === 'pending' ? 'Waiting for a GPU…' : 'Processing your images…'}`, percent);
          }
          if (event.type === 'data') result = event.data;
        }
        signal?.throwIfAborted();
      } finally {
        signal?.removeEventListener('abort', abort);
      }
      return result?.[pickIndex] ?? result?.[0];
    }

    let output;
    if (texture) {
      try {
        output = await run('/generation_all', 1, 'Generating shape and textures', 40);
      } catch (error) {
        if (signal?.aborted || /quota/i.test(String(error?.message))) throw error;
        onProgress('Texture step failed', 'Falling back to a shape-only model…', 60);
      }
    }
    if (!output) output = await run('/shape_generation', 0, 'Generating shape', 50);

    const url = output?.url;
    if (!url || !new URL(url).hostname.endsWith('.hf.space')) {
      throw new Error('Hunyuan3D multi-view returned an unexpected model download URL.');
    }
    onProgress('Downloading the model', 'Almost done…', 90);
    const response = await fetcher(url, {signal});
    if (!response.ok) throw new Error(`Model download failed (${response.status}).`);
    if (Number(response.headers.get('content-length')) > 100 * 1024 * 1024) {
      throw new Error('The generated model exceeds the 100 MB limit. Try Draft detail.');
    }
    const buffer = await response.arrayBuffer();
    signal?.throwIfAborted();
    return buffer;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const message = String(error?.message || error);
    throw new Error(`Hunyuan3D multi-view: ${message.replace(/hf_[A-Za-z0-9]+/g, '[redacted]')}`);
  } finally {
    client?.close();
  }
}