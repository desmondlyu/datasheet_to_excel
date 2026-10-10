// Geometric reconstruction from the pinned PDF.js DrawOPS representation.
// Never forward-fill numeric cells: inherit only a cell whose physical box spans the row.
import {clean} from './spec-core.mjs';
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function textItems(content,viewport){return content.items.filter(i=>clean(i.str)).map(i=>{const [x,y]=point(viewport.transform,i.transform[4],i.transform[5]);return {text:i.str,x,y:y-i.height*.35,width:i.width,height:i.height};});}
export function linesOfText(items){
 const lines=[];for(const t of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)){let l;for(let i=lines.length-1;i>=0;i--){if(Math.abs(lines[i].y-t.y)<3){l=lines[i];break;}}if(!l){l={y:t.y,items:[]};lines.push(l);}l.items.push(t);}
 return lines.map(l=>{const sorted=l.items.sort((a,b)=>a.x-b.x);let joined='',prev=null;for(const t of sorted){const gap=prev?t.x-(prev.x+prev.width):0;joined+=(prev&&gap>Math.min(t.height,prev.height)*.18?' ':'')+t.text;prev=t;}return {y:l.y,text:clean(joined)};});
}
export function textIn(items,box){return linesOfText(items.filter(t=>t.x+t.width/2>=box[0]-.2&&t.x+t.width/2<=box[2]+.2&&t.y>=box[1]-.2&&t.y<=box[3]+.2)).map(l=>l.text).join(' ');}
export function rulingLines(ops,OPS,viewport){
 let matrix=[1,0,0,1,0,0],stack=[];const edges=[];
 const segment=(a,b)=>{a=point(viewport.transform,...point(matrix,...a));b=point(viewport.transform,...point(matrix,...b));if(Math.abs(a[1]-b[1])<.7&&Math.abs(a[0]-b[0])>2)edges.push({axis:'h',pos:(a[1]+b[1])/2,start:Math.min(a[0],b[0]),end:Math.max(a[0],b[0])});else if(Math.abs(a[0]-b[0])<.7&&Math.abs(a[1]-b[1])>2)edges.push({axis:'v',pos:(a[0]+b[0])/2,start:Math.min(a[1],b[1]),end:Math.max(a[1],b[1])});};
 for(let i=0;i<ops.fnArray.length;i++){
  const f=ops.fnArray[i],args=ops.argsArray[i];
  if(f===OPS.save){stack.push([...matrix]);continue;}if(f===OPS.restore){matrix=stack.pop()||[1,0,0,1,0,0];continue;}if(f===OPS.transform){matrix=multiply(matrix,args);continue;}
  if(f!==OPS.constructPath)continue;
  const [paint,paths,bbox]=args;if(paint===OPS.endPath)continue;
  if([OPS.fill,OPS.eoFill].includes(paint)){
   if(!bbox)continue;const [x0,y0,x1,y1]=bbox;
   if(x1-x0<2&&y1-y0>2)segment([(x0+x1)/2,y0],[(x0+x1)/2,y1]);
   else if(y1-y0<2&&x1-x0>2)segment([x0,(y0+y1)/2],[x1,(y0+y1)/2]);
   continue;
  }
  for(const path of paths){if(!ArrayBuffer.isView(path)&&!Array.isArray(path))continue;let at=0,prev=null,start=null;while(at<path.length){const cmd=path[at++];if(cmd===0){prev=start=[path[at++],path[at++]];}else if(cmd===1){const next=[path[at++],path[at++]];if(prev)segment(prev,next);prev=next;}else if(cmd===2){at+=4;prev=[path[at++],path[at++]];}else if(cmd===3){at+=2;prev=[path[at++],path[at++]];}else if(cmd===4){if(prev&&start)segment(prev,start);prev=start;}else break;}}
 }
 return mergeEdges(edges);
}
export function mergeEdges(edges){
 const output=[];
 for(const axis of ['h','v']){
  const groups=[];for(const e of edges.filter(e=>e.axis===axis).sort((a,b)=>a.pos-b.pos)){let g=groups[groups.length-1];if(!g||e.pos-g[0].pos>2){g=[];groups.push(g);}g.push(e);}
  for(const g of groups){const pos=g.reduce((s,e)=>s+e.pos,0)/g.length;let end=null;for(const e of g.sort((a,b)=>a.start-b.start)){if(end&&e.start<=end.end+3)end.end=Math.max(end.end,e.end);else{end={axis,pos,start:e.start,end:e.end};output.push(end);}}}
 }
 return output;
}
export function findCells(edges){
 const hs=edges.filter(e=>e.axis==='h'),vs=edges.filter(e=>e.axis==='v');const vertices=[];
 const inside=(n,a,b)=>n>=a-2&&n<=b+2;
 for(const h of hs)for(const v of vs)if(inside(v.pos,h.start,h.end)&&inside(h.pos,v.start,v.end))vertices.push([v.pos,h.pos]);
 const covers=(axis,pos,a,b)=>edges.some(e=>e.axis===axis&&Math.abs(e.pos-pos)<.2&&e.start<=a+2&&e.end>=b-2);
 const cells=[];
 for(const [x,y] of vertices){
  const below=vertices.filter(p=>p[0]===x&&p[1]>y+2).sort((a,b)=>a[1]-b[1]);
  const right=vertices.filter(p=>p[1]===y&&p[0]>x+2).sort((a,b)=>a[0]-b[0]);
  let found=false;
  for(const [,bottom] of below){if(!covers('v',x,y,bottom))continue;for(const [rightX] of right){if(covers('h',y,x,rightX)&&covers('h',bottom,x,rightX)&&covers('v',rightX,y,bottom)){cells.push([x,y,rightX,bottom]);found=true;break;}}if(found)break;}
 }
 return [...new Map(cells.map(c=>[c.join(','),c])).values()];
}
export function groupTables(cells){
 const groups=[];const remaining=new Set(cells);
 while(remaining.size){const queue=[remaining.values().next().value],group=[];remaining.delete(queue[0]);
  while(queue.length){const c=queue.pop();group.push(c);for(const d of remaining){if([[c[0],c[1]],[c[2],c[1]],[c[0],c[3]],[c[2],c[3]]].some(p=>[[d[0],d[1]],[d[2],d[1]],[d[0],d[3]],[d[2],d[3]]].some(q=>Math.abs(p[0]-q[0])<2&&Math.abs(p[1]-q[1])<2))){remaining.delete(d);queue.push(d);}}}
  if(group.length>=4)groups.push({cells:group,bbox:[Math.min(...group.map(c=>c[0])),Math.min(...group.map(c=>c[1])),Math.max(...group.map(c=>c[2])),Math.max(...group.map(c=>c[3]))]});
 }
 return groups.sort((a,b)=>a.bbox[1]-b.bbox[1]);
}
