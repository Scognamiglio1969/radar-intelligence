import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { parseSheet } from '@/lib/import';
import { profileColumns, proposeMapping } from '@/lib/import-profile';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Upload an .xlsx or .csv file' }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const { columns, rows, total } = await parseSheet(buf, file.name);
  if (columns.length === 0) return NextResponse.json({ error: 'The file has no readable columns' }, { status: 400 });

  // Il profilo guarda i VALORI, non solo le intestazioni: è ciò che permette
  // di riconoscere una colonna "col_3" piena di date, o un file con le
  // intestazioni in italiano, che il vecchio match per nome non vedeva.
  const profiles = profileColumns(columns, rows);
  // La proposta AI è un di più: se manca la chiave o il modello non risponde,
  // l'import resta usabile a mano invece di bloccarsi.
  const proposal = await proposeMapping(profiles).catch(() => null);

  return NextResponse.json({ columns, sample: rows.slice(0, 5), total, profiles, proposal });
}
