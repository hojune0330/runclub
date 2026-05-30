import { dbAll, dbTx, ensureSchema } from './db';
import { readTabValues } from './sheets';
import { validateText } from './validation';

export const SHEET_MEMBER_IMPORT_ENABLED =
  (process.env.SHEET_MEMBER_IMPORT_ENABLED ?? process.env.SHEET_SYNC_ENABLED ?? 'false').toLowerCase() === 'true';

type SheetCell = string | number | boolean | null | undefined;

type SheetMemberMeta = {
  sheetManagerMemo: string | null;
  sheetTag: string | null;
  sheetMemberGrade: string | null;
  sheetAcquisitionSource: string | null;
  sheetNextContactDate: string | null;
  sheetAssignedManager: string | null;
};

type DbMemberRow = SheetMemberMeta & {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  join_date: string;
  is_active: boolean;
  memo: string | null;
};

export type MemberSheetImportChange = {
  rowNumber: number;
  memberId: string;
  memberName: string;
  phone: string;
  before: SheetMemberMeta;
  after: SheetMemberMeta;
  changedFields: Array<keyof SheetMemberMeta>;
  coreWarnings: string[];
};

export type MemberSheetImportWarning = {
  rowNumber: number;
  level: 'warning' | 'blocked';
  message: string;
};

export type MemberSheetImportPreview = {
  enabled: boolean;
  generatedAt: string;
  stats: {
    sheetRows: number;
    matchedRows: number;
    changes: number;
    blockedRows: number;
    warnings: number;
  };
  changes: MemberSheetImportChange[];
  warnings: MemberSheetImportWarning[];
};

const META_FIELD_LABELS: Record<keyof SheetMemberMeta, string> = {
  sheetManagerMemo: '매니저메모',
  sheetTag: '태그',
  sheetMemberGrade: '회원등급',
  sheetAcquisitionSource: '유입경로',
  sheetNextContactDate: '다음컨택예정일',
  sheetAssignedManager: '담당매니저',
};

function cellText(cell: SheetCell): string {
  if (cell === null || cell === undefined) return '';
  return String(cell).trim();
}

function textOrNull(cell: SheetCell, max: number): string | null {
  const raw = cellText(cell);
  if (!raw) return null;
  const checked = validateText(raw, { max, field: '시트 메타데이터' });
  if (!checked.ok) return raw.slice(0, max);
  return checked.value ?? null;
}

function normalizeBoolLabel(v: unknown): string {
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  return String(v ?? '').trim().toLowerCase();
}

function isActiveEqual(sheetValue: SheetCell, dbValue: boolean): boolean {
  const raw = normalizeBoolLabel(sheetValue);
  if (!raw) return true;
  if (['true', '1', 'yes', 'y', '활성'].includes(raw)) return dbValue === true;
  if (['false', '0', 'no', 'n', '비활성'].includes(raw)) return dbValue === false;
  return false;
}

function parseMeta(row: SheetCell[]): SheetMemberMeta {
  return {
    sheetManagerMemo: textOrNull(row[9], 2000),
    sheetTag: textOrNull(row[10], 100),
    sheetMemberGrade: textOrNull(row[11], 100),
    sheetAcquisitionSource: textOrNull(row[12], 100),
    sheetNextContactDate: textOrNull(row[13], 64),
    sheetAssignedManager: textOrNull(row[14], 100),
  };
}

function metaChanged(before: SheetMemberMeta, after: SheetMemberMeta): Array<keyof SheetMemberMeta> {
  return (Object.keys(META_FIELD_LABELS) as Array<keyof SheetMemberMeta>).filter(
    key => (before[key] ?? '') !== (after[key] ?? ''),
  );
}

function describeCoreWarnings(row: SheetCell[], db: DbMemberRow): string[] {
  const warnings: string[] = [];
  const sheetName = cellText(row[1]);
  const sheetPhone = cellText(row[2]);
  const sheetEmail = cellText(row[3]);
  const sheetRole = cellText(row[4]);
  const sheetMemo = cellText(row[7]);

  if (sheetName && sheetName !== db.name) warnings.push(`이름: 시트 "${sheetName}" / 웹 "${db.name}"`);
  if (sheetPhone && sheetPhone !== db.phone) warnings.push(`연락처: 시트 "${sheetPhone}" / 웹 "${db.phone}"`);
  if (sheetEmail !== (db.email ?? '')) warnings.push(`이메일: 시트 "${sheetEmail || '공백'}" / 웹 "${db.email || '공백'}"`);
  if (sheetRole && sheetRole !== db.role) warnings.push(`권한: 시트 "${sheetRole}" / 웹 "${db.role}"`);
  if (!isActiveEqual(row[6], db.is_active)) warnings.push('활성여부가 웹 DB와 다릅니다');
  if (sheetMemo !== (db.memo ?? '')) warnings.push('시스템메모가 웹 DB와 다릅니다');
  return warnings;
}

function samePhone(a: string, b: string): boolean {
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  return !!da && da === db;
}

export async function buildMemberSheetImportPreview(): Promise<MemberSheetImportPreview> {
  await ensureSchema();
  if (!SHEET_MEMBER_IMPORT_ENABLED) {
    return {
      enabled: false,
      generatedAt: new Date().toISOString(),
      stats: { sheetRows: 0, matchedRows: 0, changes: 0, blockedRows: 0, warnings: 0 },
      changes: [],
      warnings: [{ rowNumber: 0, level: 'blocked', message: 'SHEET_MEMBER_IMPORT_ENABLED가 true가 아니라서 시트 가져오기가 비활성화되어 있습니다.' }],
    };
  }

  const [rows, dbMembers] = await Promise.all([
    readTabValues('members', 'A2:O'),
    dbAll<DbMemberRow>(`
      SELECT id, name, phone, email, role, join_date, is_active, memo,
             sheet_manager_memo      AS "sheetManagerMemo",
             sheet_tag               AS "sheetTag",
             sheet_member_grade      AS "sheetMemberGrade",
             sheet_acquisition_source AS "sheetAcquisitionSource",
             sheet_next_contact_date AS "sheetNextContactDate",
             sheet_assigned_manager  AS "sheetAssignedManager"
        FROM members
    `),
  ]);

  const byId = new Map(dbMembers.map(m => [m.id, m]));
  const seenIds = new Set<string>();
  const changes: MemberSheetImportChange[] = [];
  const warnings: MemberSheetImportWarning[] = [];
  let matchedRows = 0;
  let blockedRows = 0;

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const nonEmpty = row.some(cell => cellText(cell).length > 0);
    if (!nonEmpty) return;

    const id = cellText(row[0]);
    const sheetPhone = cellText(row[2]);
    if (!id) {
      blockedRows++;
      const phoneMatch = dbMembers.find(m => samePhone(sheetPhone, m.phone));
      warnings.push({
        rowNumber,
        level: 'blocked',
        message: phoneMatch
          ? `회원ID가 비어 있습니다. 연락처는 웹 회원 "${phoneMatch.name}"와 일치하지만 자동 병합하지 않습니다.`
          : '회원ID가 비어 있어 웹 DB에 반영하지 않습니다. 신규 회원은 웹 관리자 화면에서 먼저 등록하세요.',
      });
      return;
    }

    if (seenIds.has(id)) {
      blockedRows++;
      warnings.push({ rowNumber, level: 'blocked', message: `중복 회원ID(${id}) 행입니다. 첫 번째 행만 검토하고 이 행은 건너뜁니다.` });
      return;
    }
    seenIds.add(id);

    const db = byId.get(id);
    if (!db) {
      blockedRows++;
      warnings.push({ rowNumber, level: 'blocked', message: `웹 DB에 없는 회원ID(${id})입니다. 시트 행만으로 신규 회원을 자동 생성하지 않습니다.` });
      return;
    }

    matchedRows++;
    const before: SheetMemberMeta = {
      sheetManagerMemo: db.sheetManagerMemo ?? null,
      sheetTag: db.sheetTag ?? null,
      sheetMemberGrade: db.sheetMemberGrade ?? null,
      sheetAcquisitionSource: db.sheetAcquisitionSource ?? null,
      sheetNextContactDate: db.sheetNextContactDate ?? null,
      sheetAssignedManager: db.sheetAssignedManager ?? null,
    };
    const after = parseMeta(row);
    const changedFields = metaChanged(before, after);
    const coreWarnings = describeCoreWarnings(row, db);

    for (const msg of coreWarnings) {
      warnings.push({ rowNumber, level: 'warning', message: `보호 영역(A~I) 불일치: ${msg}. 가져오기는 J~O 메타데이터만 적용합니다.` });
    }

    if (changedFields.length > 0) {
      changes.push({ rowNumber, memberId: db.id, memberName: db.name, phone: db.phone, before, after, changedFields, coreWarnings });
    }
  });

  return {
    enabled: true,
    generatedAt: new Date().toISOString(),
    stats: {
      sheetRows: rows.filter(row => row.some(cell => cellText(cell).length > 0)).length,
      matchedRows,
      changes: changes.length,
      blockedRows,
      warnings: warnings.length,
    },
    changes,
    warnings,
  };
}

export async function applyMemberSheetImport(adminId: string): Promise<MemberSheetImportPreview & { applied: number }> {
  const preview = await buildMemberSheetImportPreview();
  if (!preview.enabled || preview.changes.length === 0) {
    return { ...preview, applied: 0 };
  }

  await dbTx(async (client) => {
    for (const change of preview.changes) {
      await client.query(
        `UPDATE members
            SET sheet_manager_memo = $1,
                sheet_tag = $2,
                sheet_member_grade = $3,
                sheet_acquisition_source = $4,
                sheet_next_contact_date = $5,
                sheet_assigned_manager = $6,
                sheet_meta_synced_at = NOW(),
                updated_at = NOW()
          WHERE id = $7`,
        [
          change.after.sheetManagerMemo,
          change.after.sheetTag,
          change.after.sheetMemberGrade,
          change.after.sheetAcquisitionSource,
          change.after.sheetNextContactDate,
          change.after.sheetAssignedManager,
          change.memberId,
        ],
      );
    }

    await client.query(
      `INSERT INTO sheet_member_import_log (admin_id, mode, applied_count, warning_count, snapshot_json, created_at)
       VALUES ($1, 'manager_metadata', $2, $3, $4::jsonb, NOW())`,
      [adminId, preview.changes.length, preview.warnings.length, JSON.stringify(preview)],
    );
  });

  return { ...preview, applied: preview.changes.length };
}

export function formatMemberSheetChangedFields(fields: Array<keyof SheetMemberMeta>): string {
  return fields.map(f => META_FIELD_LABELS[f]).join(', ');
}
