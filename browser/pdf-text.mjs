// PDF.js 6 getTextContent uses ReadableStream async iteration, which is
// unavailable in some WebKit browsers. Consume its public stream with a reader.
export async function getPageTextContent(page){
 if(page.isPureXfa)return page.getTextContent();
 const reader=page.streamTextContent().getReader();
 const content={items:[],styles:Object.create(null),lang:null};
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   content.lang??=value.lang;
   Object.assign(content.styles,value.styles);
   content.items.push(...value.items);
  }
  return content;
 }finally{reader.releaseLock();}
}
