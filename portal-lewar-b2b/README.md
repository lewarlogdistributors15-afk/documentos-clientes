# Portal general de Lewar

La ficha presenta una sola imagen por modelo. `photos-hq.js` contiene 62 originales del catálogo público de Home Appliance PR, asociados por SKU exacto o modelo en el título. Se prioriza el original y se conservan fuentes alternativas. Las fotos pequeñas no se estiran por encima de su resolución.

## Estado de cuenta

El PIN del portal de clientes existente permite consultar balances, facturas y pagos. `portal-account` valida la sesión y dispositivo mediante `portal_access_bootstrap`; toma del servidor la identidad autorizada y su código antes de filtrar el espejo de Control de cobros. Los administradores y facturación pueden seleccionar un cliente. Los vendedores no reciben este permiso. Los nombres o códigos enviados por el navegador no determinan la identidad financiera.

El origen es el servicio existente `aging-management`, sincronizado por Control de cobros al importar aging o registrar movimientos. No se crea otro libro ni se vuelven a descontar pagos. Los importes están en centavos. La consulta se actualiza al abrirse, recuperar foco y cada 60 segundos mientras es visible. Incluye fecha del aging y sincronización, balances, estado de facturas, pagos, referencias y aplicación por factura; permite imprimir o guardar PDF.

Una cuenta sin código admite únicamente coincidencia exacta y única del nombre normalizado. Las cuentas ambiguas quedan pendientes de vincular; la ausencia de registros nunca se presenta como saldo cero confirmado. No se guardan balances en GitHub ni en almacenamiento del navegador.

La Edge Function usa `verify_jwt=false` porque valida la sesión propia del portal en su cuerpo. La clave de servicio permanece en las variables protegidas de Supabase. No se cambia la consulta pública de Gerencia autorizada previamente.

El acceso de demostración del catálogo no autoriza consultar balances. El catálogo, inventario y órdenes generales siguen en piloto; el estado de cuenta usa datos reales. Esta integración no registra pagos ni envía mensajes.

## Verificación

`node --test portal-lewar-b2b/tests/account.test.mjs`

Pruebas de aislamiento, sesiones vencidas, identidad manipulada, fallos de la fuente, separación de sucursales, saldos, pagos y sintaxis. Además se verificó en navegador la ficha de una sola foto y el flujo de consulta con datos ficticios aislados.
