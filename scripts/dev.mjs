import {createServer} from 'vite';
import generate from '../api/generate.js';
import review from '../api/review.js';
import models from '../api/models.js';
const routes={'/api/generate':generate,'/api/review':review,'/api/models':models};
const server=await createServer({server:{host:'127.0.0.1',port:5173}});
server.middlewares.use(async(req,res,next)=>{
  const handler=routes[req.url?.split('?')[0]];if(!handler)return next();
  let text='',bytes=0;
  try{
    for await (const chunk of req){bytes+=chunk.length;if(bytes>4000000){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Request too large.'}));return;}text+=chunk;}
    req.body=text?JSON.parse(text):{};
    res.status=function(code){this.statusCode=code;return this;};
    res.json=function(data){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(data));};
    await handler(req,res);
  }catch{if(!res.writableEnded){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid JSON request.'}));}}
});
await server.listen();server.printUrls();
