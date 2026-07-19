import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { parseSheet } from '@/lib/import';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Upload an .xlsx or .csv file' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const { columns, rows, total } = await parseSheet(buf, file.name);
  if (columns.length === 0) return NextResponse.json({ error: 'The file has no readable columns' }, { status: 400 });
  return NextResponse.json({ columns, sample: rows.slice(0, 5), total });
}
