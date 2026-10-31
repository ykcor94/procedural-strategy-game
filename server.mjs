import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('.',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);return res.end();}
    if(!(await stat(path)).isFile())throw new Error('not file');
    res.writeHead(200,{'Content-Type':(types[extname(path)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-cache'});
    res.end(await readFile(path));
  } catch {res.writeHead(404);res.end('File not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Atlas Foundry: http://127.0.0.1:${port}`));
