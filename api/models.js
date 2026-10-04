import {prepareRequest,requestKey,availableModels,sendError,ApiError} from '../lib/gemini.js';
export default async function handler(req,res) {
  try {
    prepareRequest(req,res);const models=await availableModels(requestKey(req));
    if(!models.length)throw new ApiError(400,'This key has no compatible Gemini generation models.');
    res.status(200).json({models});
  } catch(error){sendError(res,error);}
}
