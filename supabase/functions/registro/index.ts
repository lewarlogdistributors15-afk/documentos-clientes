import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://lewarlogdistributors15-afk.github.io",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type,x-lewar-pin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors(req) },
  });
}

function adminOk(req: Request) {
  const expected = Deno.env.get("LEWAR_ADMIN_PIN") || "";
  const supplied = req.headers.get("x-lewar-pin") || "";
  return !!expected && supplied === expected;
}

function sanitizeOrder(input: any) {
  const now = new Date().toISOString();
  return {
    ...input,
    status: input?.status || "activa",
    createdAt: input?.createdAt || now,
    updatedAt: now,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }

  const origin = req.headers.get("origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(req, { error: "Origen no permitido" }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, service, { auth: { persistSession: false } });

  try {
    if (req.method === "GET") {
      if (!adminOk(req)) return json(req, { error: "PIN incorrecto" }, 401);

      const u = new URL(req.url);
      const id = u.searchParams.get("id");
      if (id) {
        const { data: row, error } = await db
          .from("expo_orders")
          .select("*")
          .eq("id", id)
          .single();
        if (error || !row) return json(req, { error: "Orden no encontrada" }, 404);

        const { data: events, error: eventError } = await db
          .from("expo_order_events")
          .select("*")
          .eq("order_id", id)
          .order("version", { ascending: false });
        if (eventError) throw eventError;

        return json(req, { order: { ...row.data, version: row.version, status: row.status, emailState: row.email_state }, events });
      }

      const q = (u.searchParams.get("q") || "").trim().toLowerCase();
      const offset = Math.max(0, Number(u.searchParams.get("offset") || "0"));
      const pageSize = 100;
      const baseQuery = db
        .from("expo_orders")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: rows, error } = q
        ? await baseQuery.limit(2000)
        : await baseQuery.range(offset, offset + pageSize);
      if (error) throw error;

      let orders = (rows || []).map((r: any) => ({
        ...r.data,
        version: r.version,
        status: r.status,
        emailState: r.email_state,
      }));

      if (q) {
        orders = orders.filter((o: any) =>
          [o.id, o.cliente, o.vendedor, o.contacto, o.correo]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        );
        return json(req, {
          orders: orders.slice(offset, offset + pageSize),
          more: orders.length > offset + pageSize,
          email: "Acceso por PIN Lewar",
        });
      }

      return json(req, {
        orders: orders.slice(0, pageSize),
        more: orders.length > pageSize,
        email: "Acceso por PIN Lewar",
      });
    }

    if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);
    const body = await req.json();
    const action = body.action;

    if (action === "login") {
      if (!adminOk(req)) return json(req, { error: "PIN incorrecto" }, 401);
      return json(req, { success: true });
    }

    if (action === "create") {
      const requestKey = body.requestKey;
      const receipt = body.receipt;
      const incoming = sanitizeOrder(body.order);
      if (!incoming?.id || !requestKey || !receipt) return json(req, { error: "Datos incompletos" }, 400);

      const { data: existing } = await db
        .from("expo_orders")
        .select("*")
        .eq("request_key", requestKey)
        .maybeSingle();

      if (existing) {
        return json(req, {
          order: { ...existing.data, version: existing.version, status: existing.status, emailState: existing.email_state },
          receipt: existing.receipt,
        });
      }

      const order = { ...incoming, version: 1, status: "activa" };
      const { data: inserted, error } = await db
        .from("expo_orders")
        .insert({
          id: order.id,
          request_key: requestKey,
          version: 1,
          status: "activa",
          receipt,
          email_state: "pending",
          data: order,
          created_at: order.createdAt,
          updated_at: order.updatedAt,
        })
        .select("*")
        .single();
      if (error) throw error;

      const { error: eventError } = await db.from("expo_order_events").insert({
        order_id: order.id,
        version: 1,
        action: "creada",
        actor: order.vendedor || "Expo Muebles",
        reason: null,
        data: order,
      });
      if (eventError) throw eventError;

      return json(req, { order, receipt: inserted.receipt });
    }

    if (action === "receipt") {
      const { id, version, receipt } = body;
      const { data: row } = await db.from("expo_orders").select("*").eq("id", id).maybeSingle();
      if (!row || String(row.receipt) !== String(receipt) || Number(row.version) !== Number(version)) {
        return json(req, { error: "Comprobante inválido" }, 403);
      }
      const { error } = await db.from("expo_orders").update({ email_state: "service_accepted" }).eq("id", id);
      if (error) throw error;
      return json(req, { success: true });
    }

    if (!adminOk(req)) return json(req, { error: "PIN incorrecto" }, 401);

    if (action === "edit") {
      const { id, version, order: incoming, reason } = body;
      const { data: row } = await db.from("expo_orders").select("*").eq("id", id).single();
      if (!row) return json(req, { error: "Orden no encontrada" }, 404);
      if (Number(row.version) !== Number(version)) return json(req, { error: "La orden cambió. Actualiza el registro e intenta otra vez." }, 409);

      const nextVersion = row.version + 1;
      const updated = { ...sanitizeOrder(incoming), id, version: nextVersion, status: row.status, createdAt: row.data.createdAt, changeReason: reason || "" };
      const newReceipt = crypto.randomUUID();

      const { error } = await db.from("expo_orders").update({
        version: nextVersion,
        receipt: newReceipt,
        data: updated,
        updated_at: updated.updatedAt,
      }).eq("id", id);
      if (error) throw error;

      const { error: eventError } = await db.from("expo_order_events").insert({
        order_id: id,
        version: nextVersion,
        action: "modificada",
        actor: updated.vendedor || "Expo Muebles",
        reason: reason || "",
        data: updated,
      });
      if (eventError) throw eventError;

      return json(req, { order: updated, receipt: newReceipt });
    }

    if (action === "cancel") {
      const { id, version, reason } = body;
      if (!reason?.trim()) return json(req, { error: "Indica el motivo de cancelación" }, 400);

      const { data: row } = await db.from("expo_orders").select("*").eq("id", id).single();
      if (!row) return json(req, { error: "Orden no encontrada" }, 404);
      if (Number(row.version) !== Number(version)) return json(req, { error: "La orden cambió. Actualiza el registro e intenta otra vez." }, 409);

      const nextVersion = row.version + 1;
      const updated = {
        ...row.data,
        version: nextVersion,
        status: "cancelada",
        changeReason: reason.trim(),
        updatedAt: new Date().toISOString(),
      };
      const newReceipt = crypto.randomUUID();

      const { error } = await db.from("expo_orders").update({
        version: nextVersion,
        status: "cancelada",
        receipt: newReceipt,
        data: updated,
        updated_at: updated.updatedAt,
      }).eq("id", id);
      if (error) throw error;

      const { error: eventError } = await db.from("expo_order_events").insert({
        order_id: id,
        version: nextVersion,
        action: "cancelada",
        actor: "PIN Lewar",
        reason: reason.trim(),
        data: updated,
      });
      if (eventError) throw eventError;

      return json(req, { order: updated, receipt: newReceipt });
    }

    return json(req, { error: "Acción no válida" }, 400);
  } catch (error) {
    console.error(error);
    return json(req, { error: "No se pudo procesar la solicitud" }, 500);
  }
});
