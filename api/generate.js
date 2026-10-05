import {prepareRequest,requestKey,imagePart,generateContent,extractJson,sendError,ApiError} from '../lib/gemini.js';
import {sceneSchema,validateScene} from '../lib/scene-spec.js';
import {generationInstruction} from '../lib/prompt.js';
import {referenceParts} from '../lib/references.js';
export default async function handler(req,res) {
  try {
    prepareRequest(req,res);const key=requestKey(req),body=req.body;
    if(!body || typeof body!=='object')throw new ApiError(400,'JSON request body is required.');
    if(typeof body.prompt!=='string' || body.prompt.length>2000)throw new ApiError(400,'Instructions must be under 2000 characters.');
    if(!['draft','balanced','detailed'].includes(body.detail))throw new ApiError(400,'Invalid detail level.');
    const parts=referenceParts(body);
    const counts={draft:'15–35',balanced:'50–110',detailed:'110–220'};
    let instruction=`Generate a recognizable ${body.detail} model using about ${counts[body.detail]} components, adjusted to the subject complexity. Do not add meaningless components to meet the range. User preferences: ${body.prompt || 'Faithfully match the subject proportions, colours and surface finishes.'}`;
    if(body.current) {
      try{validateScene(body.current);}catch(error){throw new ApiError(400,error.message);}
      if(JSON.stringify(body.current).length>350000)throw new ApiError(413,'Current scene is too large to refine.');
      parts.push({text:'Current model contact sheet (last image, not a reference): front (+Z), three-quarter, side (+X), back (-Z). These are four views of ONE object.'},imagePart(body.render,'Rendered'));
      instruction+=`\nRefine the current scene, addressing the user request and discrepancies against the reference. Preserve already correct parts. Return the COMPLETE updated scene, not a patch. Current scene: ${JSON.stringify(body.current)}`;
    }
    parts.push({text:instruction});
    const {data,model}=await generateContent(key,body.model,{
      systemInstruction:{parts:[{text:generationInstruction}]},contents:[{role:'user',parts}],
      generationConfig:{temperature:.35,maxOutputTokens:32768,responseMimeType:'application/json',responseSchema:sceneSchema}
    });
    const spec=extractJson(data);
    try{validateScene(spec);}catch(error){throw new ApiError(422,`${error.message}. Try Balanced detail or a clearer reference.`);}
    res.status(200).json({spec,model,usage:data.usageMetadata || null});
  }catch(error){sendError(res,error);}
}
