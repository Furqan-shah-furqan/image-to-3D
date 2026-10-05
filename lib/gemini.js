export class ApiError extends Error { constructor(status,message) { super(message);this.status=status; } }
export function requestKey(req) {
  const value = req.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) throw new ApiError(401,'Add your Gemini API key using the button at the top right.');
  const key=value.slice(7).trim();
  // Treat provider keys as opaque; Google validates their format and permissions.
  if (!/^[\x21-\x7e]{20,512}$/.test(key)) throw new ApiError(401,'Enter a valid Gemini API key.');
  return key;
}
export function prepareRequest(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); throw new ApiError(405,'Use POST for this endpoint.'); }
  if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new ApiError(403,'Only same-origin requests are accepted.');
  if (req.headers['content-type'] && !req.headers['content-type'].includes('application/json')) throw new ApiError(415,'Send JSON data.');
}
export async function googleRequest(path,key,payload,timeout=240000,fetcher=fetch) {
  const response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/${path}`,{
    method:payload?'POST':'GET',headers:{'x-goog-api-key':key,...(payload?{'Content-Type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(timeout)
  });
  const data=await response.json().catch(()=>({}));
  if (!response.ok) {
    const status=response.status;
    let message = status===429?'Gemini quota or rate limit reached. Check your Google AI Studio quota/billing or try again later.':
      status===401 || status===403?'Gemini rejected this key. Check that it is valid, has Generative Language API access, and its restrictions allow server requests.':
      status===404?'This Gemini model is unavailable. Reconnect your key and select another model.':
      status>=500?'Gemini is temporarily unavailable. Please try again.':data.error?.message || 'Gemini could not process the request.';
    message=String(message).split(key).join('[redacted]').slice(0,500);
    throw new ApiError(status>=500?502:status,message);
  }
  return data;
}
export async function availableModels(key,fetcher=fetch) {
  let models=[],token;
  for (let page=0;page<5;page++) {
    const data=await googleRequest(`models?pageSize=100${token?`&pageToken=${encodeURIComponent(token)}`:''}`,key,null,20000,fetcher);
    models.push(...(data.models || [])); token=data.nextPageToken;if(!token)break;
  }
  models=models.filter(m=>m.name?.startsWith('models/gemini-') && m.supportedGenerationMethods?.includes('generateContent') && !/image|tts|audio|robotics|embedding|computer-use|live|nano/i.test(m.name));
  return models.map(m=>({id:m.name.replace('models/',''),name:m.displayName || m.name.replace('models/','')}));
}
export async function resolveModel(key,requested,fetcher=fetch) {
  if (requested && requested!=='auto') {
    if (!/^gemini-[a-zA-Z0-9._-]{1,100}$/.test(requested)) throw new ApiError(400,'Invalid Gemini model name.');
    return requested;
  }
  const models=await availableModels(key,fetcher);
  const scored=models.map(m=>({ ...m, score: (/flash/.test(m.id)?100:0)+(!/lite/.test(m.id)?20:0)+(!/preview|exp|latest/.test(m.id)?10:0)+(parseFloat(m.id.replace('gemini-',''))||0) }));
  scored.sort((a,b)=>b.score-a.score);
  if(!scored.length)throw new ApiError(400,'No compatible Gemini text/vision models are available for this key.');
  return scored[0].id;
}
export function imagePart(value,label='Reference') {
  if(typeof value!=='string' || value.length>2200000)throw new ApiError(413,`${label} image is too large. Upload a smaller image.`);
  const match=value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match || match[2].length<16)throw new ApiError(400,`A valid ${label.toLowerCase()} image is required.`);
  const bytes=Buffer.from(match[2],'base64');
  const valid=match[1]==='image/jpeg'?bytes[0]===255 && bytes[1]===216:
    match[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)throw new ApiError(400,`${label} image content does not match its file type.`);
  return {inlineData:{mimeType:match[1],data:match[2]}};
}
export function extractJson(data) {
  const candidate=data.candidates?.[0];
  if(!candidate)throw new ApiError(422,'Gemini returned no model. The image may be blocked by safety filters; try a different reference.');
  if(candidate.finishReason==='MAX_TOKENS')throw new ApiError(422,'Gemini ran out of output space. Use Draft/Balanced detail or ask for fewer components.');
  const raw=candidate.content?.parts?.filter(p=>typeof p.text==='string' && !p.thought).map(p=>p.text).join('') || '';
  try{return JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw new ApiError(422,'Gemini returned an incomplete scene. Please try again with Balanced detail.');}
}
export function sendError(res,error) {
  const timeout=error.name==='TimeoutError' || error.name==='AbortError';
  res.status(error.status || (timeout?504:500)).json({error:timeout?'Gemini took too long. Try again with Draft detail.':error.status?error.message:'The request could not be completed. Please try again.'});
}
