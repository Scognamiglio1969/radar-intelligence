import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { runAnalysis } from '@/lib/analyst';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const [project, user] = await Promise.all([getCurrentProject(), getCurrentUser()]);
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  const { question, audience } = await req.json() as { question?: string; audience?: string };
  if (!question?.trim()) return NextResponse.json({ error: 'empty question' }, { status: 400 });

  const result = await runAnalysis(project.id, project.name, question.trim(), audience || 'analyst');
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
