// Mala website — Worker entrypoint.
// Serves the static site (env.ASSETS) and forwards pre-orders to the
// Mala Ops webhook (secret stays server-side, never in the browser).

const OPS_WEBHOOK = 'https://mala-ops-api.ruben-ramdhony.workers.dev/api/webhook/website';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/order' && request.method === 'POST') {
      return handleOrder(request, env);
    }

    // Everything else: serve the static site from /public.
    return env.ASSETS.fetch(request);
  },
};

async function handleOrder(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  try {
    const o = await request.json();
    const str = (v, max = 2000) => (typeof v === 'string' ? v : '').slice(0, max);

    // Map the website form to the ops order shape (structured line items).
    const payload = {
      source: 'website',
      customer_name: (str(o.fname, 100) + ' ' + str(o.lname, 100)).trim(),
      customer_phone: str(o.phone, 50),
      customer_email: str(o.email, 200),
      delivery_zone: str(o.region, 100),
      delivery_address: str(o.address, 500),
      personalisation_note: str(o.note, 1000),
      items: Array.isArray(o.items) ? o.items : [],
    };

    // Forward to the ops system. Best-effort: a failure here must not block
    // the customer's WhatsApp flow, so we still return ok.
    try {
      await fetch(OPS_WEBHOOK, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': env.WEBHOOK_SECRET || '',
        },
        body: JSON.stringify(payload),
      });
    } catch (_) { /* swallow — order still proceeds via WhatsApp */ }

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: cors,
    });
  }
}
