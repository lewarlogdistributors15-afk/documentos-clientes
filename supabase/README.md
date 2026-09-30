# Registro Expo Muebles — PIN

Backend preparado para sustituir el login de ChatGPT por un PIN interno de Lewar.

## Componentes
- `supabase/migrations/20260930_expo_registry.sql`: tablas de órdenes e historial.
- `supabase/functions/registro/index.ts`: API pública para crear pedidos y protegida por PIN para leer/modificar/cancelar.

## Seguridad
- Las tablas usan RLS y no tienen políticas públicas.
- La función usa la service role internamente.
- El PIN se guarda como secreto de la función en `LEWAR_ADMIN_PIN`; no se escribe en GitHub.
- Solo se permite CORS desde el GitHub Pages de Lewar.
