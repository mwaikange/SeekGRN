import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;

export async function mountCircular(container,url,startPage=1,label='circular'){
 if(!url){container.textContent='No '+label+' is available.';return ()=>{};}
 const task=getDocument({url,isEvalSupported:false});
 let pdf,renderTask,disposed=false,pageNumber=startPage;
 const dispose=()=>{disposed=true;renderTask?.cancel();void task.destroy();};
 try{
  pdf=await task.promise;
  if(!container.isConnected){dispose();return dispose;}
  pageNumber=Math.max(1,Math.min(pdf.numPages,pageNumber));
  container.innerHTML='<div class="pdf-controls"><button class="button secondary" data-prev>Previous</button><label>Page <input type="number" min="1" max="'+pdf.numPages+'" value="'+pageNumber+'"> of '+pdf.numPages+'</label><button class="button secondary" data-next>Next</button></div><p role="status" aria-live="polite"></p><canvas></canvas>';
  const canvas=container.querySelector('canvas'),input=container.querySelector('input'),status=container.querySelector('[role="status"]');
  input.setAttribute('aria-label',label+' page number');
  canvas.setAttribute('aria-label',label+' page');
  let drawing=false;
  async function draw(){
   if(drawing||disposed)return;drawing=true;
   container.querySelectorAll('button,input').forEach(el=>el.disabled=true);
   try{
    status.textContent='Loading page '+pageNumber+'…';
    const page=await pdf.getPage(pageNumber);if(disposed)return;
    const scale=Math.min((container.clientWidth-24)/page.getViewport({scale:1}).width,1.6);
    const viewport=page.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
    canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
    renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});
    await renderTask.promise;status.textContent='Page '+pageNumber+' of '+pdf.numPages;input.value=pageNumber;
   }catch(error){if(!disposed)status.textContent='Unable to display this page. '+error.message;}
   finally{drawing=false;if(!disposed){input.disabled=false;container.querySelector('[data-prev]').disabled=pageNumber===1;container.querySelector('[data-next]').disabled=pageNumber===pdf.numPages;}}
  }
  container.querySelector('[data-prev]').onclick=()=>{pageNumber--;void draw();};
  container.querySelector('[data-next]').onclick=()=>{pageNumber++;void draw();};
  input.onchange=()=>{pageNumber=Math.max(1,Math.min(pdf.numPages,Number(input.value)||1));void draw();};
  void draw();
 }catch(error){if(container.isConnected)container.textContent='Unable to load the '+label+'. '+error.message;dispose();}
 return dispose;
}
