/* Datos de Instagram desde la API de Meta.
   El token NO va aqui; este archivo solo contiene datos publicables para la web.
   Estructura (shape canonico) que consume la web:
   window.NUVA_IG = {
     ok:true, generado:"YYYY-MM-DD HH:mm",
     perfil:{usuario,nombre,seguidores,siguiendo,publicaciones,foto,bio},
     insights:{alcance_28d,impresiones_28d,visitas_perfil_28d,engagement_prom},
     media:[{id,caption,tipo,img,permalink,fecha,likes,comentarios}],
     demografia:{ genero:[{label,pct}], edad:[...], paises:[...], ciudades:[...] }
   } */
window.NUVA_IG = { ok:false, generado:"", motivo:"aun no conectado" };
