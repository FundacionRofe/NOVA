/**
 * Tablero NOVA — avisa al tablero para que sincronice al instante.
 * Pegar TODO este contenido en Código.gs (reemplazando lo que haya) y guardar.
 * Activadores (Activadores → Agregar activador), ambos con la función alEnviarFormulario:
 *   1. Origen «De la hoja de cálculo», tipo «Al enviar el formulario».
 *   2. Origen «De la hoja de cálculo», tipo «Al cambiar».
 * Prueba: Ejecutar → alEnviarFormulario. El registro debe decir 200 y "sincronizado":true.
 */
var NOVA_URL = "https://nova-tablero.vercel.app/api/refrescar";
var NOVA_CLAVE = "PEGA_AQUI_EL_VALOR_DE_NOVA_SYNC_SECRET";

function alEnviarFormulario() {
  var r = UrlFetchApp.fetch(NOVA_URL, {
    method: "post",
    headers: { "x-nova-clave": NOVA_CLAVE },
    muteHttpExceptions: true,
  });
  console.log("Tablero NOVA:", r.getResponseCode(), r.getContentText());
}
