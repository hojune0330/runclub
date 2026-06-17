import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import {
  buildSpringImportPreview,
  applySpringImport,
  type SpringImportOverride,
} from '@/lib/spring-pass-import';

/**
 * 봄 시즌 장부(40건) 이용권 일괄 발급 — 관리자 전용.
 *
 *   GET  /api/admin/pass-import            → dry-run 미리보기(발급/보류 분류)
 *   GET  /api/admin/pass-import?override=… → override 적용 미리보기
 *   POST /api/admin/pass-import            → status==='ready' 행만 실제 발급
 *
 * override 형식(JSON): { "이름#장부순서": "phone|memberId", "이름": "…" }
 *   동명이인/재결제(서보경·김준택·유명훈) 해소용.
 *
 * 서브 에이전트(현지 매니저 운영 보조) 산출물. 규칙·멱등성은 lib 공유.
 */

function parseOverride(raw: string | null): SpringImportOverride | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SpringImportOverride;
    }
  } catch {
    // 무시 — override 없이 진행
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  await ensureSchema();
  const { searchParams } = new URL(req.url);
  const override = parseOverride(searchParams.get('override'));

  const preview = await buildSpringImportPreview(override);
  return NextResponse.json(preview);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  await ensureSchema();

  let override: SpringImportOverride | undefined;
  try {
    const body: unknown = await req.json().catch(() => ({}));
    if (body && typeof body === 'object' && 'override' in body) {
      const ov = (body as { override: unknown }).override;
      if (ov && typeof ov === 'object' && !Array.isArray(ov)) {
        override = ov as SpringImportOverride;
      }
    }
  } catch {
    // 본문 없으면 override 없이 진행
  }

  const result = await applySpringImport(override);

  await logAdminAction(req, auth.memberId, {
    action: 'pass.grant',
    targetType: 'pass',
    summary: `봄 장부 일괄 발급: ${result.issued}건 발급 (보류 unmatched ${result.stats.unmatched}·ambiguous ${result.stats.ambiguous}·중복 ${result.stats.alreadyIssued})`,
    afterValue: {
      issued: result.issued,
      issuedPassIds: result.issuedPassIds,
      stats: result.stats,
    },
  });

  return NextResponse.json(result);
}
