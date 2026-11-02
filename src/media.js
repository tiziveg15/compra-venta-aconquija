const DB_NAME = 'aconquija-media'
const STORE_NAME = 'uploads'

function openMediaDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1)
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE_NAME)
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
  })
}

export async function saveMediaFile(file){
  if(file.size>40*1024*1024)throw new Error('Cada archivo debe pesar menos de 40 MB.')
  if(file.type.startsWith('image/')){
    let imageFile=file
    try{const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();imageFile=await new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||file),'image/jpeg',.82))}catch{}
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({type:'image',src:reader.result,previewUrl:reader.result});reader.onerror=()=>reject(reader.error);reader.readAsDataURL(imageFile)})
  }
  if(!file.type.startsWith('video/'))throw new Error('Elegí una imagen o un video.')
  const db=await openMediaDb(),id=`video-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})
  return {type:'video',src:`idb:${id}`,previewUrl:URL.createObjectURL(file)}
}

export async function hydrateMedia(item){
  if(!item?.src?.startsWith('idb:'))return {...item,previewUrl:item?.previewUrl||item?.src}
  try{const db=await openMediaDb(),blob=await new Promise((resolve,reject)=>{const request=db.transaction(STORE_NAME,'readonly').objectStore(STORE_NAME).get(item.src.slice(4));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return {...item,previewUrl:blob?URL.createObjectURL(blob):''}}catch{return {...item,previewUrl:''}}
}

export function stripMediaPreview(item){const {previewUrl,...saved}=item||{};return saved}

const blockedWords=['boludo','boluda','pelotudo','pelotuda','idiota','imbecil','forro','forra','gil','gila','conchudo','conchuda','mierda','puta','puto','putear','pendejo','pendeja','cagon','cagona','culiado','culiada','hdp','mogolico','mogolica','malparido','malparida','hijueputa','estupido','estupida','inutil','fuck','fucking','shit','bitch','asshole']
export function containsInsult(text){
  const clean=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  return blockedWords.some(word=>{const normalized=word.normalize('NFD').replace(/[\u0300-\u036f]/g,'');const spaced=normalized.split('').join('[^a-z0-9]*');return new RegExp(`(^|[^a-z0-9])${spaced}([^a-z0-9]|$)`,'i').test(clean)})
}
