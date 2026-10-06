import {Client, handle_file} from '@gradio/client';

export const SPACE = 'tencent/Hunyuan3D-2.1';
export const SPACE_URL = 'https://huggingface.co/spaces/tencent/Hunyuan3D-2.1';
export const QUALITY = {
  draft: {steps: 20, octree: 196, chunks: 8000},
  balanced: {steps: 30, octree: 256, chunks: 8000},
  detailed: {steps: 50, octree: 384, chunks: 8000},
};

// Tries shape + texture first. If the texture step fails (free GPU quota),
// falls back to a plain shape-only mesh so the user still gets a model.
export async function generateHunyuan({
  image, token = '', detail = 'balanced', texture = true, signal,
  onProgress = () => {},
  connect = (...args) => Client.connect(...args),
  file = handle_file, fetcher = fetch,
}) {
  let client;
  signal?.throwIfAborted();
  try {
    onProgress('Connecting to Hunyuan3D', 'Waiting for the free Hugging Face GPU service…', 10);
    client = await connect(SPACE, {...(token ? {token} : {}), events: ['data', 'status']});
    signal?.throwIfAborted();

    const input = image instanceof Blob ? image : await (await fetcher(image, {signal})).blob();
    const q = QUALITY[detail] || QUALITY.balanced;

    async function run(endpoint, pickIndex, title, percent) {
      signal?.throwIfAborted();
      const job = client.submit(endpoint, {
        image: file(input),
        steps: q.steps,
        guidance_scale: 5,
        seed: Math.floor(Math.random() * 1e7),
        octree_resolution: q.octree,
        check_box_rembg: true,
        num_chunks: q.chunks,
        randomize_seed: false,
      });
      const abort = () => { job.cancel().catch(() => {}); job.close_stream(); };
      signal?.addEventListener('abort', abort, {once: true});
      let result;
      try {
        for await (const event of job) {
          signal?.throwIfAborted();
          if (event.type === 'status') {
            if (event.stage === 'error') throw new Error(event.message || 'Hunyuan3D could not complete this step.');
            const queue = event.position != null ? `Queue position ${event.position + 1}. ` : '';
            onProgress(title, `${queue}${event.stage === 'pending' ? 'Waiting for a GPU…' : 'Processing your image…'}`, percent);
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
        if (signal?.aborted) throw error;
        onProgress('Texture step failed', 'Falling back to a shape-only model…', 60);
      }
    }
    if (!output) output = await run('/shape_generation', 0, 'Generating shape', 50);

    const url = output?.url;
    if (!url || !new URL(url).hostname.endsWith('.hf.space')) {
      throw new Error('Hunyuan3D returned an unexpected model download URL.');
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
    throw new Error(`Hunyuan3D: ${message.replace(/hf_[A-Za-z0-9]+/g, '[redacted]')}. If the free GPU quota is exhausted, try again later or use the website and import the GLB.`);
  } finally {
    client?.close();
  }
}