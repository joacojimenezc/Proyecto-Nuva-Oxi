/* Datos de Instagram — generado por gen-instagram.ps1 desde la API de Meta.
   Se REGENERA solo. El token NO va aqui (va en <usuario>\NuvaOxi-Sync\ig-config.txt, FUERA del repo).
   Estructura (shape canonico) que consume la web:
   window.NUVA_IG = {
     ok:true, generado:"YYYY-MM-DD HH:mm",
     perfil:{usuario,nombre,seguidores,siguiendo,publicaciones,foto,bio},
     insights:{alcance_28d,impresiones_28d,visitas_perfil_28d,engagement_prom},
     media:[{id,caption,tipo,img,permalink,fecha,likes,comentarios}],
     demografia:{ genero:[{label,pct}], edad:[...], paises:[...], ciudades:[...] }
   } */
window.NUVA_IG = { ok:false, generado:"", motivo:"aun no conectado (falta correr gen-instagram.ps1 con el token)" };
