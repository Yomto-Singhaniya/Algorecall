import { NextResponse } from 'next/server';

const VALID_INTERVALS = new Set([3, 7, 15, 30, 60, 120]);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_BYTES = 64_000;
const sentThisProcess = new Map<string, number>();

type DigestQuestion = {
  name: string;
  topic: string;
  interval: number;
  targetDate: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function isDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isDigestQuestion(value: unknown): value is DigestQuestion {
  if (!isRecord(value)) return false;
  return typeof value.name === 'string'
    && value.name.trim().length > 0
    && value.name.length <= 120
    && typeof value.topic === 'string'
    && value.topic.length <= 60
    && typeof value.interval === 'number'
    && VALID_INTERVALS.has(value.interval)
    && typeof value.targetDate === 'string'
    && isDateKey(value.targetDate);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Requests must come from this app.' }, { status: 403 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.RESEND_FROM_EMAIL;
  const allowedRecipient = process.env.ALLOWED_REMINDER_EMAIL?.trim().toLowerCase();
  if (!apiKey || !sender || !allowedRecipient) {
    return NextResponse.json({ error: 'Email delivery is not configured on this server.' }, { status: 503 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Digest request is too large.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Request body is required.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: 'Digest request is too large.' }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  if (!isRecord(payload)) {
    return NextResponse.json({ error: 'Request body must be an object.' }, { status: 400 });
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const date = typeof payload.date === 'string' ? payload.date : '';
  const dueQuestions = payload.dueQuestions;
  if (email !== allowedRecipient) {
    return NextResponse.json({ error: 'This recipient is not enabled for email delivery.' }, { status: 403 });
  }
  if (!isDateKey(date) || !Array.isArray(dueQuestions) || dueQuestions.length > 200 || !dueQuestions.every(isDigestQuestion)) {
    return NextResponse.json({ error: 'Digest date or question list is invalid.' }, { status: 400 });
  }
  if (!dueQuestions.length) {
    return NextResponse.json({ error: 'There are no due questions to send.' }, { status: 400 });
  }

  const now = Date.now();
  if (now - (sentThisProcess.get(email) ?? 0) < 30_000) {
    return NextResponse.json({ error: 'Please wait before sending another digest.' }, { status: 429 });
  }

  const rows = dueQuestions.map((question) =>
    `<li><strong>${escapeHtml(question.name)}</strong> · ${escapeHtml(question.topic)} · +${question.interval} day review</li>`,
  ).join('');
  const text = [
    `Your AlgoRecall review queue for ${date}:`,
    ...dueQuestions.map((question) => `- ${question.name} (${question.topic}) · +${question.interval} day review`),
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `algorecall-digest-${email}-${date}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject: `AlgoRecall · ${dueQuestions.length} reviews ready`,
        text,
        html: `<div style="font-family:Arial,sans-serif;color:#17241b"><h1>Your recall queue</h1><p>Review these ${dueQuestions.length} milestones today:</p><ul>${rows}</ul><p>Small, consistent revisions beat one heroic cram session.</p></div>`,
      }),
    });
    if (!response.ok) {
      console.error('Resend rejected the AlgoRecall digest.', response.status);
      return NextResponse.json({ error: 'The email provider could not send this digest.' }, { status: 502 });
    }
    sentThisProcess.set(email, now);
    return NextResponse.json({ sent: true });
  } catch (cause) {
    console.error('AlgoRecall could not reach the email provider.', cause);
    return NextResponse.json({ error: 'The email provider could not be reached.' }, { status: 502 });
  }
}
