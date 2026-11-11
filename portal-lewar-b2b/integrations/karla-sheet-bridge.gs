/**
 * LEWAR · puente privado de lectura Google Sheets → Supabase
 *
 * Instalación única (cuenta propietaria del Google Sheet):
 * 1. Crear un proyecto independiente en https://script.google.com
 * 2. Pegar este archivo completo en Code.gs.
 * 3. Proyecto → Configuración → Propiedades del script:
 *      LEWAR_KARLA_SYNC_TOKEN = token hexadecimal de 64 caracteres
 *      que genera la sección de conexión del Panel maestro de Lewar.
 * 4. Implementar > Nueva implementación > Aplicación web:
 *      Ejecutar como: Yo
 *      Quién tiene acceso: Cualquier persona
 *    La URL pública requiere el token secreto para acceder a los precios;
 *    sin el token, no lee ninguna celda. No compartir ni publicar el token.
 * 5. Copiar la URL /exec al panel maestro y hacer clic en Vincular.
 *
 * SEGURIDAD: Lee exclusivamente A1 (vigencia), D4:D100 (SKU) y
 * K4:L100 (precios), NUNCA costos, inventario, márgenes ni hojas históricas.
 * No altera la hoja. No expone el token en el HTML del portal.
 */
const LEWAR_SOURCE_SPREADSHEET_ID = '1D5lJbfPKWmUgfYGiI0T-jYXZT5UHzRVCdeSoio9_-7g';
const LEWAR_PRICE_TAB = 'Precios Especiales Clientes Lew';
const LEWAR_TOKEN_PROPERTY = 'LEWAR_KARLA_SYNC_TOKEN';

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseExpiry_(raw) {
  const source = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = /hasta\s+([a-z.]+)\s+(\d{1,2})\s*,?\s*(20\d{2})/.exec(source);
  if (!match) throw new Error('Vigencia no identificada en A1');
  const months = {jan:1,enero:1,feb:2,febrero:2,mar:3,marzo:3,
    apr:4,abril:4,may:5,mayo:5,jun:6,junio:6,jul:7,julio:7,
    aug:8,agosto:8,sep:9,sept:9,septiembre:9,oct:10,octubre:10,
    nov:11,noviembre:11,dec:12,dic:12,diciembre:12};
  const month = months[match[1].replace(/\./g, '')];
  const day = Number(match[2]), year = Number(match[3]);
  if (!month || day < 1 || day > 31) throw new Error('Vigencia inválida en A1');
  const date = new Date(Date.UTC(year, month-1, day));
  if (date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 ||
      date.getUTCDate()!==day) throw new Error('Vigencia inválida en A1');
  return Utilities.formatDate(date, 'GMT', 'yyyy-MM-dd');
}

function priceToCents_(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      value <= 0 || value > 1000000 ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) return null;
  return Math.round(value * 100);
}

function doPost(e) {
  try {
    const token = PropertiesService.getScriptProperties()
      .getProperty(LEWAR_TOKEN_PROPERTY);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!token || !/^[a-f0-9]{64}$/.test(token) ||
        typeof body.token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(body.token) || body.token !== token) {
      return jsonOutput_({ok:false,error:'Acceso denegado'});
    }

    const sheet = SpreadsheetApp.openById(LEWAR_SOURCE_SPREADSHEET_ID)
      .getSheetByName(LEWAR_PRICE_TAB);
    if (!sheet) throw new Error('No se encontró la pestaña autorizada');
    const validThrough = parseExpiry_(sheet.getRange('A1').getDisplayValue());
    const skus = sheet.getRange('D4:D100').getDisplayValues();
    const prices = sheet.getRange('K4:L100').getValues();
    const rows = [];

    for (let i=0; i<skus.length; i++) {
      const sku=String(skus[i][0] || '').trim().toUpperCase();
      if (!sku) continue;
      const p=prices[i][0], v=prices[i][1];
      rows.push({
        sku,
        price_cents: priceToCents_(p),
        volume_cents: v === '' || v === null ? null : priceToCents_(v)
      });
    }
    if (rows.length<1 || rows.length>100) throw new Error('Cantidad de modelos inesperada');

    return jsonOutput_({
      ok:true,sourceId:LEWAR_SOURCE_SPREADSHEET_ID,
      sourceTab:LEWAR_PRICE_TAB,validThrough,rows,
      checkedAt:new Date().toISOString()
    });
  } catch(err) {
    return jsonOutput_({ok:false,error:'No se pudo validar la hoja de precios.'});
  }
}

// Los accesos directos sin token no consultan ni revelan la tabla.
function doGet() {
  return jsonOutput_({ok:false,error:'Solo se permiten solicitudes autenticadas.'});
}
