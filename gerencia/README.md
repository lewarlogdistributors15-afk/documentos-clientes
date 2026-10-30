# Gerencia · Lewar

Página estática de consulta. GitHub contiene únicamente interfaz, estilos y código; ningún archivo contiene balances reales, contactos privados, claves de acceso o credenciales de servidor.

El servicio `aging-management` valida accesos individuales de 256 bits antes de leer el aging. La tabla `management_bridge` tiene RLS y no concede permisos a `anon` ni `authenticated`; solo el servicio protegido puede acceder. La ausencia de políticas para clientes es intencional (denegación predeterminada).

Las credenciales se entregan desde Configuración del portal de Control de cobros, exclusivamente al propietario. En el origen se guardan cifradas; el destino conserva solo sus hashes. Cada enlace personal debe compartirse únicamente con la persona indicada. Renovar un acceso invalida el anterior una vez sincronizado. La sesión del navegador se limita a doce horas y el fragmento del enlace se elimina al abrir la página.

Control de cobros genera una proyección mínima del aging vigente después de importar facturas, actualizar términos, registrar o conciliar pagos. El envío pendiente queda guardado y se reintenta en la siguiente consulta; los errores de red no revierten pagos ya registrados. Las revisiones crecientes impiden que un envío tardío sustituya información más reciente. No se importan facturas directamente de SAP.

La vista consulta el servicio cada minuto mientras está visible; calcula los días en horario de Puerto Rico. Incluye búsqueda, filtros, paginación e impresión del conjunto filtrado completo.

## Verificación

`node --experimental-strip-types --test gerencia/tests/edge.test.mjs`

La compilación utiliza React y esbuild desde el repositorio de Control de cobros: `node scripts/build-github-management.mjs <ruta-absoluta-a-gerencia>`.

La entrada se realiza automáticamente al abrir un enlace personal. No se muestra un campo de contraseña ni se pide pegar una clave. El enlace regular sin credencial informa que se debe usar el enlace personal; no muestra balances.
