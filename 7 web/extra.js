/* ============================================================
   DATOS OPERATIVOS DURABLES — NUVA OXI  (window.NUVA_EXTRA)
   Este archivo NO lo regenera el refresh del CRM. Edítalo AQUÍ
   (ya no en data.js) para: marca, logística, marketing, compras
   y asignación de stock por PDV. Se fusiona sobre NUVA_DATA.
   ============================================================ */
window.NUVA_EXTRA = {

  "marca": {
    "Instagram": "https://www.instagram.com/nuva_oxi/",
    "Youtube": "https://www.youtube.com/watch?v=6Uz_1QtVUcQ",
    "Posicionamiento": "NUVA OXI se centra en funcionalidad ANTIOXIDANTE. Aspiracion: llegar a ser un 'wild food', aprovechando el aprendizaje del boom de la proteina, buscando una equivalencia en funcionalidad de antioxidantes. Reto clave: culturizar a la audiencia sobre el valor de los antioxidantes."
  },

  "compras": [
    /* Facturas de compra a proveedores. Estructura de cada fila:
       { "Fecha":"2026-01-15", "Proveedor":"...", "RUT":"76.xxx.xxx-x",
         "Tipo_Doc":"Factura", "Folio":"1234",
         "Neto":100000, "IVA":19000, "Total":119000, "Estado":"Pendiente" } */
  ],

  "logistica": [
    /* Ventanas de despacho / recepcion por cliente. Estructura de cada fila:
       { "ID_Cliente":"CL-CEN", "Dias_Recepcion":"Lun a Vie",
         "Horario":"08:00 - 13:00", "Direccion_Entrega":"CD Cencosud, ...",
         "Contacto":"Recepcion Jumbo", "Notas":"Cita previa 24h" } */
  ],

  "marketing": [
    /* Acciones de trade marketing planificadas. Estructura de cada fila:
       { "Fecha":"2026-02-01", "Tipo":"Degustacion", "ID_Cliente":"CL-CEN",
         "ID_PDV":"J001", "Descripcion":"Degustacion fin de semana",
         "Costo":80000, "Estado":"Planificada" }
       Tipos sugeridos: Degustacion, Promocion, Activacion, Campana, Material POP. */
  ],

  "asignacion": [
    /* Parametros de reposicion (par-level) por PDV para venta en ruta.
       Si no se define un PDV aqui, el sistema usa un default SUGERIDO
       (Max = sell-in del PDV; Min/reorden = 30% del Max, minimo 2).
       Estructura de cada fila:
       { "ID_PDV":"J001", "Stock_Max":60, "Stock_Min":18 } */
  ]

};
