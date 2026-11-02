export async function saveMediaFile(file){
  if(file.size>40*1024*1024)throw new Error('Cada archivo debe pesar menos de 40 MB.')
  if(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))throw new Error('Elegí una imagen o un video.')
  let uploadFile=file
  if(file.type.startsWith('image/'))try{const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();uploadFile=await new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||file),'image/jpeg',.82))}catch{}
  const previewUrl=URL.createObjectURL(uploadFile)
  return{type:file.type.startsWith('image/')?'image':'video',src:previewUrl,previewUrl,file:uploadFile}
}

export async function hydrateMedia(item){return{...item,previewUrl:item?.url||item?.src||item?.previewUrl||''}}

export function stripMediaPreview(item){const {previewUrl,file,...saved}=item||{};return saved}

const blockedWords=['boludo','boluda','pelotudo','pelotuda','idiota','imbecil','forro','forra','gil','gila','conchudo','conchuda','mierda','puta','puto','putear','pendejo','pendeja','cagon','cagona','culiado','culiada','hdp','mogolico','mogolica','malparido','malparida','hijueputa','estupido','estupida','inutil','fuck','fucking','shit','bitch','asshole']
export function containsInsult(text){
  const clean=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  return blockedWords.some(word=>{const normalized=word.normalize('NFD').replace(/[\u0300-\u036f]/g,'');const spaced=normalized.split('').join('[^a-z0-9]*');return new RegExp(`(^|[^a-z0-9])${spaced}([^a-z0-9]|$)`,'i').test(clean)})
}
