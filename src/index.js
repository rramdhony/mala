// Mala — Worker entrypoint.
// Serves the static site (env.ASSETS) and records orders to D1 (env.DB).

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

    // Light validation — never block the order, just sanitise.
    const str = (v, max = 2000) => (typeof v === 'string' ? v : '').slice(0, max);
    const items = Array.isArray(o.items) ? o.items : [];
    const total = Number.isFinite(o.total) ? Math.round(o.total) : 0;

    await env.DB.prepare(
      `INSERT INTO orders
        (created_at, fname, lname, email, phone, region, address, items, total, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      str(o.fname, 100),
      str(o.lname, 100),
      str(o.email, 200),
      str(o.phone, 50),
      str(o.region, 100),
      str(o.address, 500),
      JSON.stringify(items).slice(0, 4000),
      total,
      str(o.note, 1000)
    ).run();

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: cors,
    });
  }
}
