# Gerencia · Lewar

Página estática de consulta. GitHub contiene únicamente interfaz, estilos y código; ningún archivo contiene balances reales, contactos privados, claves de acceso o credenciales de servidor.

El propietario autorizó consulta pública de solo lectura, sin contraseña ni enlaces personales. Cualquier visitante puede leer las facturas y saldos a través del servicio `aging-management`. La respuesta contiene únicamente la proyección del aging y sus fechas de actualización: no incluye identidades de lectores, contactos privados, hashes o claves de servidor.

La tabla `management_bridge` conserva RLS sin permisos directos para `anon` ni `authenticated`. Solo el servicio accede a ella. El GET publica la proyección autorizada; los envíos de sincronización siguen requiriendo la clave privada del servidor. Ningún visitante puede modificar pagos o facturas. Los enlaces personales antiguos siguen abriendo la misma página; se eliminan del navegador los fragmentos y la sesión anterior.

Control de cobros genera una proyección mínima del aging vigente después de importar facturas, actualizar términos, registrar o conciliar pagos. El envío pendiente queda guardado y se reintenta en la siguiente consulta; los errores de red no revierten pagos ya registrados. Las revisiones crecientes impiden que un envío tardío sustituya información más reciente. No se importan facturas directamente de SAP.

La vista consulta el servicio cada minuto mientras está visible; calcula los días en horario de Puerto Rico. Incluye búsqueda, filtros, paginación e impresión del conjunto filtrado completo.

## Verificación

`node --experimental-strip-types --test gerencia/tests/edge.test.mjs`

La compilación utiliza React y esbuild desde el repositorio de Control de cobros: `node scripts/build-github-management.mjs <ruta-absoluta-a-gerencia>`.
