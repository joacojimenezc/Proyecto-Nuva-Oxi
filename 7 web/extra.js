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
  ],

  /* Serie de ventas por periodo — EJEMPLO (para ver crecimiento/variacion). Reemplazar por real. */
  "periodos": [
    { "Periodo": "Oct 2025", "Uds": 180, "Venta": 295000 },
    { "Periodo": "Nov 2025", "Uds": 240, "Venta": 392000 },
    { "Periodo": "Dic 2025", "Uds": 320, "Venta": 523000 },
    { "Periodo": "Ene 2026", "Uds": 410, "Venta": 671000 }
  ],

  /* Iniciativas de planificacion (roadmap del piloto) — EJEMPLO, editar. */
  "planning": [
    { "Iniciativa": "Cerrar listado y OC con Jumbo", "Area": "Comercial", "Responsable": "Jose Ignacio", "Periodo": "Q1 2026", "Prioridad": "Alta", "Estado": "En curso" },
    { "Iniciativa": "Definir costo unitario real (reemplazar supuesto $250)", "Area": "Finanzas", "Responsable": "Jose Ignacio", "Periodo": "Q1 2026", "Prioridad": "Alta", "Estado": "Abierta" },
    { "Iniciativa": "Ruta HORECA / tiendas saludables (canal premium)", "Area": "Comercial", "Responsable": "Ana Barra", "Periodo": "Q2 2026", "Prioridad": "Media", "Estado": "Abierta" },
    { "Iniciativa": "Unificar ficha de producto (orujo 35g vs 40g x4)", "Area": "Marca", "Responsable": "Equipo", "Periodo": "Q1 2026", "Prioridad": "Alta", "Estado": "Abierta" },
    { "Iniciativa": "Plan de muestreo (universidades / gimnasios)", "Area": "Marketing", "Responsable": "Ana Barra", "Periodo": "Q2 2026", "Prioridad": "Media", "Estado": "Abierta" }
  ],

  /* Desglose de gastos operativos para el P&L — EJEMPLO (suma = finanzas.gastos). */
  "pnl_gastos": [
    { "Concepto": "Marketing y trade", "Monto": 120000 },
    { "Concepto": "Logistica y despacho", "Monto": 65000 },
    { "Concepto": "Administracion y otros", "Monto": 90000 }
  ],

  /* Cuenta Google para las pestañas Calendario y Correo.
     - cuenta: tu correo Google (ej. "tucorreo@gmail.com"). Vacío = usa la sesión activa del navegador.
     - calendar_src: correo/ID del calendario a mostrar embebido. Vacío = usa "cuenta".
     - tz: zona horaria del calendario. */
  "google": {
    "cuenta": "contactonuvaoxi@gmail.com",
    "calendar_src": "contactonuvaoxi@gmail.com",
    "tz": "America/Santiago",
    "client_id": ""
  }

};
