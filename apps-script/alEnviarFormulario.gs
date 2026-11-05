/**
 * Disparador del Sheet de respuestas NOVA: cada vez que llega una respuesta del formulario,
 * avisa al tablero para que sincronice al instante (sin esperar al minuto).
 *
 * Instalación (una vez, en el Sheet de respuestas → Extensiones → Apps Script):
 *  1. Pegar este archivo.
 *  2. Configuración del proyecto → Propiedades de la secuencia de comandos:
 *       NOVA_URL   = https://<dominio-del-tablero>/api/refrescar
 *       NOVA_CLAVE = <el mismo valor de NOVA_SYNC_SECRET en Vercel>
 *  3. Activadores → Agregar activador → función alEnviarFormulario,
 *     origen «De la hoja de cálculo», tipo «Al enviar el formulario».
 */
function alEnviarFormulario() {
  var p = PropertiesService.getScriptProperties();
  var r = UrlFetchApp.fetch(p.getProperty("NOVA_URL"), {
    method: "post",
    headers: { "x-nova-clave": p.getProperty("NOVA_CLAVE") },
    muteHttpExceptions: true,
  });
  console.log("Tablero NOVA:", r.getResponseCode(), r.getContentText());
}
