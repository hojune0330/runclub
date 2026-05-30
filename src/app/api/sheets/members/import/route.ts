import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { applyMemberSheetImport, buildMemberSheetImportPreview, formatMemberSheetChangedFields } from '@/lib/member-sheet-import';
import { logAdminAction } from '@/lib/audit';

// GET /api/sheets/members/import - Admin preview for Members!J:O metadata import
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const preview = await buildMemberSheetImportPreview();
    return NextResponse.json(preview);
  } catch (error: any) {
    console.error('[sheet member import preview] error:', error);
    return NextResponse.json(
      { error: error?.message ?? '시트 변경사항 미리보기 중 오류가 발생했습니다' },
      { status: 500 },
    );
  }
}

// POST /api/sheets/members/import - Admin applies safe Members!J:O metadata changes
export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return unauthorizedResponse();
  if (auth.role !== 'admin') return forbiddenResponse();

  try {
    const result = await applyMemberSheetImport(auth.memberId);

    if (result.applied > 0) {
      void logAdminAction(req, auth.memberId, {
        action: 'member.sheet_import',
        targetType: 'member',
        targetId: null,
        targetName: null,
        summary: `Google Sheets Members J~O 메타데이터 ${result.applied}건 가져오기`,
        beforeValue: {
          changes: result.changes.map(c => ({
            memberId: c.memberId,
            memberName: c.memberName,
            rowNumber: c.rowNumber,
            before: c.before,
          })),
        },
        afterValue: {
          stats: result.stats,
          warnings: result.warnings,
          changes: result.changes.map(c => ({
            memberId: c.memberId,
            memberName: c.memberName,
            rowNumber: c.rowNumber,
            changedFields: formatMemberSheetChangedFields(c.changedFields),
            after: c.after,
          })),
        },
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[sheet member import apply] error:', error);
    return NextResponse.json(
      { error: error?.message ?? '시트 변경사항 적용 중 오류가 발생했습니다' },
      { status: 500 },
    );
  }
}
