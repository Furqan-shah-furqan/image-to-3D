import {ApiError,imagePart} from './gemini.js';
export function referenceParts(body) {
  if(body.extraImages!==undefined && (!Array.isArray(body.extraImages) || body.extraImages.length>3))throw new ApiError(400,'Use up to three additional reference angles.');
  if(JSON.stringify(body).length>4000000)throw new ApiError(413,'The combined references are too large. Use smaller images.');
  const parts=[{text:'Primary reference (match this view and framing):'},imagePart(body.image)];
  for(const [i,image] of (body.extraImages || []).entries())parts.push({text:`Additional reference angle ${i+1} of the same subject:`},imagePart(image,'Additional reference'));
  return parts;
}
