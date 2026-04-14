import { contactSubmitSchema } from '@/lib/contactSubmitSchema';
import { getNodedrSubmitConfig } from '@/lib/nodedrSubmitEnv';
import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';

const UPSTREAM_SUBMIT_URL = 'https://api.nodedr.com/api/submit';

export async function POST(req: Request) {
  const cfg = getNodedrSubmitConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'Contact submissions are not configured (missing NODEDR_SUBMIT_PUBLIC_KEY or NODEDR_PUBLIC_KEY).' },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = contactSubmitSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      Object.entries(first)
        .flatMap(([k, v]) => (v?.length ? [`${k}: ${v[0]}`] : []))
        .join('; ') || 'Invalid input';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { name, email, message, company } = parsed.data;
  const data: Record<string, string> = { name, email, message };
  if (company) data.company = company;

  const bodyObj = { data, files: [] as unknown[] };
  const bodyString = JSON.stringify(bodyObj);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-api-key': cfg.publicKey
  };

  if (cfg.secretKey) {
    headers['x-signature'] = createHmac('sha256', cfg.secretKey).update(bodyString, 'utf8').digest('hex');
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_SUBMIT_URL, {
      method: 'POST',
      headers,
      body: bodyString
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach submission service. Try again later.' }, { status: 502 });
  }

  if (!upstream.ok) {
    let detail = '';
    try {
      detail = await upstream.text();
    } catch {
      /* ignore */
    }
    console.error('nodedr submit upstream error', upstream.status, detail.slice(0, 500));
    return NextResponse.json({ error: 'Submission failed. Please try again later.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
