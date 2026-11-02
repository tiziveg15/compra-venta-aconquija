import { supabase } from './supabase.js'

function requireClient(){if(!supabase)throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.')}
function throwIfError(result){if(result.error)throw result.error;return result.data}
const cleanUser=user=>user?{id:user.id,email:user.email,name:user.user_metadata?.full_name||user.email?.split('@')[0]||'Vendedor/a',avatar:'',store_id:null,store_name:''}:null
const mapMedia=media=>(media||[]).map(item=>({...item,previewUrl:item.url||item.src,src:item.url||item.src}))
function makeObjectId(){
  const cryptoApi=globalThis.crypto
  if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID()
  if(typeof cryptoApi?.getRandomValues==='function'){
    const bytes=cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6]=(bytes[6]&0x0f)|0x40
    bytes[8]=(bytes[8]&0x3f)|0x80
    const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export async function signUp({name,email,password}){
  requireClient();const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});if(error)throw error
  return{user:data.user,session:data.session,confirmationRequired:!data.session}
}
export async function signIn({email,password}){
  requireClient();const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;await ensureAccount(data.user);return data.user
}
export async function signOut(){requireClient();const {error}=await supabase.auth.signOut();if(error)throw error}
export async function ensureAccount(authUser){
  requireClient();if(!authUser)return null
  const name=authUser.user_metadata?.full_name||authUser.email?.split('@')[0]||'Vendedor/a'
  const profile=throwIfError(await supabase.from('profiles').upsert({id:authUser.id,full_name:name},{onConflict:'id'}).select().single())
  let store=throwIfError(await supabase.from('stores').select('*').eq('owner_id',authUser.id).maybeSingle());if(!store)store=throwIfError(await supabase.from('stores').insert({owner_id:authUser.id,name}).select().single())
  return{id:authUser.id,email:authUser.email,name:profile.full_name,avatar:profile.avatar_url||'',store_id:store.id,store_name:store.name}
}
export async function loadMarketplace(){
  requireClient()
  const [storesResult,productsResult,reviewsResult,profilesResult]=await Promise.all([
    supabase.from('stores').select('*').order('created_at',{ascending:false}),
    supabase.from('products').select('*, stores(name, location)').order('created_at',{ascending:false}),
    supabase.from('reviews').select('*').order('created_at',{ascending:false}),
    supabase.from('profiles').select('id,full_name,avatar_url')
  ])
  const stores=throwIfError(storesResult)||[],products=throwIfError(productsResult)||[],reviews=throwIfError(reviewsResult)||[],profiles=throwIfError(profilesResult)||[]
  const storesById=Object.fromEntries(stores.map(store=>[store.id,store])),profilesById=Object.fromEntries(profiles.map(profile=>[profile.id,profile]))
  return{
    products:products.map(item=>({id:item.id,title:item.title,price:Number(item.price),category:item.category,tags:item.tags||[],seller:item.stores?.name||'Tienda local',seller_id:item.owner_id,store_id:item.store_id,location:item.location||item.stores?.location||'Valles Calchaquíes',description:item.description,image:item.image_url,media:mapMedia(item.media),condition:item.condition,stock:item.stock,shipping:item.shipping,status:item.status})),
    stores:Object.values(storesById),
    storeProfiles:Object.fromEntries(stores.map(store=>[store.name,{id:store.id,owner_id:store.owner_id,name:store.name,description:store.description,avatar:store.avatar_url||'',banner:store.banner_url||'',location:store.location}])),
    reviews:Object.fromEntries(reviews.map(item=>{const profile=profilesById[item.author_id]||{};const mapped={id:item.id,authorId:item.author_id,name:profile.full_name||'Usuario',avatar:profile.avatar_url||'',rating:item.rating,text:item.body,media:mapMedia(item.media),createdAt:item.created_at,edited:item.updated_at!==item.created_at};return[item.product_id?`product:${item.product_id}`:`store:${storesById[item.store_id]?.name||item.store_id}`,[]]}).map(([key])=>[key,reviews.filter(item=>(item.product_id?`product:${item.product_id}`:`store:${storesById[item.store_id]?.name||item.store_id}`)===key).map(item=>{const profile=profilesById[item.author_id]||{};return{id:item.id,authorId:item.author_id,name:profile.full_name||'Usuario',avatar:profile.avatar_url||'',rating:item.rating,text:item.body,media:mapMedia(item.media),createdAt:item.created_at,edited:item.updated_at!==item.created_at}})]))
  }
}

export async function loadNotifications(userId){
  requireClient()
  const rows=throwIfError(await supabase.from('notifications').select('id,recipient_id,actor_id,review_id,product_id,store_id,notification_type,target_label,created_at,read_at,actor:profiles!notifications_actor_id_fkey(full_name,avatar_url)').eq('recipient_id',userId).order('created_at',{ascending:false}).limit(40))||[]
  return rows.map(item=>({id:item.id,actorId:item.actor_id,actorName:item.actor?.full_name||'Alguien',actorAvatar:item.actor?.avatar_url||'',productId:item.product_id,storeId:item.store_id,type:item.notification_type,targetLabel:item.target_label,createdAt:item.created_at,readAt:item.read_at}))
}

export async function markNotificationsRead(userId,ids){
  requireClient()
  let query=supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',userId)
  if(ids?.length)query=query.in('id',ids)
  const {error}=await query
  if(error)throw error
}

async function uploadFile(file,userId,folder){
  const extension=(file.name?.split('.').pop()||file.type.split('/').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'')
  const path=`${userId}/${folder}/${makeObjectId()}.${extension}`
  const {error}=await supabase.storage.from('market-media').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error
  const {data}=supabase.storage.from('market-media').getPublicUrl(path)
  return data.publicUrl
}
async function uploadAttachments(media,userId,folder){
  return Promise.all((media||[]).map(async item=>({type:item.type,url:item.file?await uploadFile(item.file,userId,folder):item.url||item.src})))
}
export async function createProduct(product,user){
  requireClient();if(!user?.id||!user?.store_id)throw new Error('Iniciá sesión para publicar.')
  const formMedia=product.media||[],images=formMedia.filter(item=>item.type==='image'),cover=images.find(item=>item.cover)||images[0]
  if(!cover?.file)throw new Error('Seleccioná una foto de portada.')
  const imageUrl=await uploadFile(cover.file,user.id,'products')
  const media=await uploadAttachments(formMedia.filter(item=>item!==cover),user.id,'products')
  const row={owner_id:user.id,store_id:user.store_id,title:product.title,description:product.description,price:product.price,category:product.category,location:product.location,tags:product.tags,condition:product.condition,stock:product.stock,shipping:product.shipping,image_url:imageUrl,media,status:'active'}
  const created=throwIfError(await supabase.from('products').insert(row).select().single())
  return{...product,id:created.id,seller:user.store_name,seller_id:user.id,store_id:user.store_id,image:imageUrl,media:mapMedia(media),status:'active'}
}
export async function updateProduct(id,patch){requireClient();const row={...patch,updated_at:new Date().toISOString()};const {error}=await supabase.from('products').update(row).eq('id',id);if(error)throw error}
export async function deleteProduct(id){requireClient();const {error}=await supabase.from('products').delete().eq('id',id);if(error)throw error}
export async function updateStoreProfile(user,profile){
  requireClient();const avatar=profile.avatarFile?await uploadFile(profile.avatarFile,user.id,'stores'):profile.avatar,banner=profile.bannerFile?await uploadFile(profile.bannerFile,user.id,'stores'):profile.banner
  const row={owner_id:user.id,name:profile.name||user.store_name,description:profile.description,location:profile.location,avatar_url:avatar||null,banner_url:banner||null,updated_at:new Date().toISOString()}
  const store=throwIfError(await supabase.from('stores').upsert(row,{onConflict:'owner_id'}).select().single())
  if(profile.avatarFile){const result=await supabase.from('profiles').update({avatar_url:avatar,updated_at:new Date().toISOString()}).eq('id',user.id);if(result.error)throw result.error}
  return{...store,avatar_url:avatar,banner_url:banner}
}
export async function uploadAvatar(user,file){requireClient();const avatar=await uploadFile(file,user.id,'profiles');const result=await supabase.from('profiles').update({avatar_url:avatar,updated_at:new Date().toISOString()}).eq('id',user.id);if(result.error)throw result.error;const store=await supabase.from('stores').update({avatar_url:avatar,updated_at:new Date().toISOString()}).eq('owner_id',user.id);if(store.error)throw store.error;return avatar}
export async function createReview(review,user){
  requireClient();const media=await uploadAttachments(review.media,user.id,'reviews'),isProduct=review.target.startsWith('product:'),target=review.target.slice(isProduct?8:6)
  let storeId=null,productId=null
  if(isProduct)productId=target;else{const row=throwIfError(await supabase.from('stores').select('id').eq('name',target).single());storeId=row.id}
  const row=throwIfError(await supabase.from('reviews').insert({author_id:user.id,product_id:productId,store_id:storeId,rating:review.rating,body:review.text,media}).select().single())
  return{...review,id:row.id,authorId:user.id,name:user.name,avatar:user.avatar||'',media:mapMedia(media),createdAt:row.created_at}
}
export async function updateReview(id,user,changes){requireClient();const {error}=await supabase.from('reviews').update({rating:changes.rating,body:changes.text,updated_at:new Date().toISOString()}).eq('id',id).eq('author_id',user.id);if(error)throw error}
export async function deleteReview(id,user){requireClient();const {error}=await supabase.from('reviews').delete().eq('id',id).eq('author_id',user.id);if(error)throw error}
