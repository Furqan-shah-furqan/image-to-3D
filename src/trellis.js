import {Client, handle_file} from '@gradio/client';
export const SPACE='microsoft/TRELLIS.2';
export const SPACE_URL='https://huggingface.co/spaces/microsoft/TRELLIS.2';
export const QUALITY={draft:{resolution:'512',faces:100000,texture:1024},balanced:{resolution:'1024',faces:300000,texture:2048},detailed:{resolution:'1536',faces:500000,texture:4096}};
// Keep all stages on the same session: extraction uses the server-side latent state.
export async function generateMesh({image,token='',detail='balanced',signal,onProgress=()=>{},connect=(...args)=>Client.connect(...args),file=handle_file,fetcher=fetch}){
  let client;signal?.throwIfAborted();
  try{
    onProgress('Connecting to TRELLIS','Waiting for the free Hugging Face GPU service…',10);
    client=await connect(SPACE,{...(token?{hf_token:token}:{}),events:['data','status']});
    signal?.throwIfAborted();
    async function run(endpoint,payload,title,percent){
      signal?.throwIfAborted();const job=client.submit(endpoint,payload);let result;
      const abort=()=>{job.cancel().catch(()=>{});job.close_stream();};
      signal?.addEventListener('abort',abort,{once:true});
      try{
        for await(const event of job){
          signal?.throwIfAborted();
          if(event.type==='status'){
            if(event.stage==='error')throw new Error(event.message || 'TRELLIS could not complete this stage.');
            const queue=event.position!=null?`Queue position ${event.position+1}. `:'';
            onProgress(title,`${queue}${event.stage==='pending'?'Waiting for a GPU…':'Processing your image…'}`,percent);
          }
          if(event.type==='data')result=event.data;
        }
        signal?.throwIfAborted();return result;
      }finally{signal?.removeEventListener('abort',abort);}
    }
    await run('/start_session',[],'Starting your session',15);
    const input=image instanceof Blob?image:await (await fetcher(image,{signal})).blob();
    onProgress('Preparing your image','Removing the background and framing the object…',20);
    const prepared=await run('/preprocess_image',[file(input)],'Preparing your image',25);
    if(!prepared?.[0])throw new Error('TRELLIS returned no prepared image.');
    const q=QUALITY[detail] || QUALITY.balanced;
    await run('/image_to_3d',[prepared[0],Math.floor(Math.random()*2147483647),q.resolution,7.5,.7,12,5,7.5,.5,12,3,1,0,12,3],'Generating shape and textures',50);
    onProgress('Extracting the textured mesh',`Baking ${q.texture}px textures and exporting GLB…`,80);
    const output=await run('/extract_glb',[q.faces,q.texture],'Extracting the textured mesh',85);
    const url=output?.[0]?.url;
    if(!url || new URL(url).origin!=='https://microsoft-trellis-2.hf.space')throw new Error('TRELLIS returned an unexpected model download URL.');
    const response=await fetcher(url,{signal});if(!response.ok)throw new Error(`Model download failed (${response.status}).`);
    if(Number(response.headers.get('content-length'))>100*1024*1024)throw new Error('The generated model exceeds the 100 MB limit. Try Balanced detail.');
    const buffer=await response.arrayBuffer();signal?.throwIfAborted();return buffer;
  }catch(error){
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    const message=String(error?.message || error);
    throw new Error(`TRELLIS: ${message.replace(/hf_[A-Za-z0-9]+/g,'[redacted]')}. If the free GPU quota is exhausted or API access is unavailable, open the free demo, download its GLB and import it here.`);
  }finally{client?.close();}
}
