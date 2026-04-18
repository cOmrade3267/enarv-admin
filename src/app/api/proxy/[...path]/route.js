import { NextResponse } from 'next/server';

/** Edge avoids Node vendor-chunk bugs (e.g. missing ./vendor-chunks/@opentelemetry.js) on this route. */
export const runtime = 'edge';

const UPSTREAM = (process.env.API_UPSTREAM_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.enarv.com').replace(
  /\/$/,
  ''
);

async function proxy(request, { params }) {
  const segments = Array.isArray(params?.path) ? params.path : [];
  const path = segments.join('/');
  if (!path) {
    return NextResponse.json({ message: 'Missing path' }, { status: 400 });
  }

  const url = new URL(request.url);
  // Next.js App Router can leak the catch-all [...path] segments as a "path" query param.
  // Strip it so the upstream backend's Joi validation doesn't reject unknown parameters.
  const search = new URLSearchParams(url.search);
  search.delete('path');
  const qs = search.toString();
  const target = `${UPSTREAM}/${path}${qs ? '?' + qs : ''}`;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const auth = request.headers.get('authorization');
  if (auth) headers.set('Authorization', auth);

  const init = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const res = await fetch(target, init);
  const body = await res.arrayBuffer();
  const out = new NextResponse(body, { status: res.status });
  const ct = res.headers.get('content-type');
  if (ct) out.headers.set('Content-Type', ct);
  return out;
}

export async function GET(request, ctx) {
  return proxy(request, ctx);
}
export async function POST(request, ctx) {
  return proxy(request, ctx);
}
export async function PATCH(request, ctx) {
  return proxy(request, ctx);
}
export async function PUT(request, ctx) {
  return proxy(request, ctx);
}
export async function DELETE(request, ctx) {
  return proxy(request, ctx);
}
