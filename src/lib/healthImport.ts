/**
 * 건강·운동 데이터 "파일 가져오기" 파서 (서버 전용).
 *
 * 애플 건강(HealthKit)·가민 커넥트는 웹용 OAuth/REST API 가 (사실상) 없거나
 * 사업자 승인이 필요하다. 대신 두 서비스 모두 사용자가 직접 "데이터 내보내기"로
 * 파일을 받을 수 있으므로, 그 파일을 업로드받아 서버에서 파싱해 activity_logs 로
 * 적재한다. ("지금은 파일, 나중은 자동" — 자동 연동이 열리면 source 만 추가)
 *
 * ⚠️ 성능: 애플 export.xml 은 수년치면 수백 MB 가 될 수 있다. 절대 전체를
 * 메모리에 DOM 으로 올리지 않는다. sax(SAX 스트리밍) + unzipper(스트리밍 압축해제)로
 * 운동(Workout) 레코드만 골라 뽑는다. 클라이언트 번들에는 전혀 포함되지 않는다.
 *
 * 반환: 정규화된 ParsedActivity[] — 라우트에서 activity_logs 로 멱등 저장한다.
 */

import sax from 'sax';
import unzipper from 'unzipper';
import { Readable } from 'node:stream';

export interface ParsedActivity {
  /** 외부 고유 식별자 (중복 방지용). 없으면 날짜+거리로 합성 */
  sourceRef: string;
  kind: string;            // run | walk_run | ride | swim | workout ...
  activityDate: string;    // yyyy-MM-dd
  distanceM: number | null;
  durationS: number | null;
  elevationM: number | null;
  avgHr: number | null;
  note: string | null;
}

export interface ParseResult {
  activities: ParsedActivity[];
  /** 파싱은 됐으나 운동이 아니어서 건너뛴 수(참고용) */
  skipped: number;
  /** 안전상한에 도달해 잘린 경우 true */
  truncated: boolean;
}

// 한 번의 업로드에서 받아들이는 최대 운동 수(메모리·DB 보호). 넉넉하지만 폭주 방지.
const MAX_ACTIVITIES = 5000;
// 업로드 파일 최대 바이트(라우트에서도 한번 더 체크).
// Render Starter 메모리 보호를 위해 MVP 기본값은 30MB, 운영 env 로 5~60MB 사이에서 조정한다.
export const MAX_UPLOAD_MB = Math.max(5, Math.min(60, Number(process.env.IMPORT_MAX_UPLOAD_MB) || 30));
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────────────────────────────────

/** 다양한 ISO/애플 날짜 문자열 → yyyy-MM-dd (로컬 날짜 부분만) */
function toDateOnly(s?: string | null): string | null {
  if (!s) return null;
  // 애플: "2024-03-01 06:12:33 +0900" / 가민 ISO: "2024-03-01T06:12:33Z"
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** HKWorkoutActivityType / 가민 sport → 내부 kind */
export function normalizeKind(raw?: string | null): string {
  const t = (raw ?? '').toLowerCase();
  if (!t) return 'workout';
  if (t.includes('running') || t === 'run') return 'run';
  if (t.includes('walk') || t.includes('hiking')) return 'walk_run';
  if (t.includes('cycl') || t.includes('biking') || t === 'ride') return 'ride';
  if (t.includes('swim')) return 'swim';
  return 'workout';
}

// ─────────────────────────────────────────────────────────────────────
// 애플 건강: export.zip(내부 export.xml) 또는 export.xml 직접
//
// 핵심 노드: <Workout workoutActivityType="HKWorkoutActivityTypeRunning"
//   duration="32.5" durationUnit="min" totalDistance="5.4" totalDistanceUnit="km"
//   startDate="2024-03-01 06:12:33 +0900" .../>
// 일부 버전은 거리/에너지를 <WorkoutStatistics type="..." sum=".."/> 자식으로 둔다.
// ─────────────────────────────────────────────────────────────────────

function appleDistanceToM(value?: string, unit?: string): number | null {
  const v = num(value);
  if (v == null) return null;
  const u = (unit ?? 'km').toLowerCase();
  if (u === 'km') return Math.round(v * 1000);
  if (u === 'mi') return Math.round(v * 1609.34);
  if (u === 'm') return Math.round(v);
  return Math.round(v * 1000); // 기본 km 가정
}

function appleDurationToS(value?: string, unit?: string): number | null {
  const v = num(value);
  if (v == null) return null;
  const u = (unit ?? 'min').toLowerCase();
  if (u === 'min') return Math.round(v * 60);
  if (u === 'sec' || u === 's') return Math.round(v);
  if (u === 'hr' || u === 'h') return Math.round(v * 3600);
  return Math.round(v * 60);
}

/** export.xml(또는 동등) 스트림을 SAX 로 파싱해 Workout 만 추출 */
export function parseAppleHealthXmlStream(stream: NodeJS.ReadableStream): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: true, lowercase: false });
    const activities: ParsedActivity[] = [];
    let skipped = 0;
    let truncated = false;

    // 현재 파싱 중인 Workout 누적 상태
    let cur: Partial<ParsedActivity> & { _hasDistance?: boolean } | null = null;

    parser.on('opentag', (node) => {
      if (truncated) return;
      const name = node.name;
      const a = node.attributes as Record<string, string>;

      if (name === 'Workout') {
        const date = toDateOnly(a.startDate);
        cur = {
          kind: normalizeKind(a.workoutActivityType),
          activityDate: date ?? '',
          durationS: appleDurationToS(a.duration, a.durationUnit),
          distanceM: appleDistanceToM(a.totalDistance, a.totalDistanceUnit),
          elevationM: null,
          avgHr: null,
          note: a.workoutActivityType?.replace('HKWorkoutActivityType', '') ?? null,
        };
        // 합성 sourceRef: 날짜+거리+시간(외부ID가 없으므로). 동일 운동 재업로드 시 중복 방지.
        cur.sourceRef = `${date ?? 'na'}_${cur.distanceM ?? 0}_${cur.durationS ?? 0}`;
      } else if (cur && name === 'WorkoutStatistics') {
        // 일부 export 는 거리/심박을 통계 자식으로 둔다
        const type = (a.type ?? '').toLowerCase();
        if (type.includes('distance') && cur.distanceM == null) {
          cur.distanceM = appleDistanceToM(a.sum, a.unit);
        } else if (type.includes('heartrate')) {
          cur.avgHr = num(a.average) != null ? Math.round(num(a.average)!) : cur.avgHr ?? null;
        }
      }
    });

    parser.on('closetag', (tag) => {
      if (tag !== 'Workout' || !cur) return;
      const c = cur;
      cur = null;
      if (!c.activityDate) { skipped++; return; }
      if (activities.length >= MAX_ACTIVITIES) { truncated = true; return; }
      activities.push({
        sourceRef: c.sourceRef!,
        kind: c.kind ?? 'workout',
        activityDate: c.activityDate,
        distanceM: c.distanceM ?? null,
        durationS: c.durationS ?? null,
        elevationM: c.elevationM ?? null,
        avgHr: c.avgHr ?? null,
        note: c.note ?? null,
      });
    });

    parser.on('error', (e) => reject(e));
    parser.on('end', () => resolve({ activities, skipped, truncated }));

    stream.pipe(parser);
    stream.on('error', reject);
  });
}

/** 애플 업로드(zip 또는 xml)를 받아 파싱. zip 이면 export.xml 엔트리만 스트리밍 */
export async function parseAppleHealthFile(buf: Buffer, filename: string): Promise<ParseResult> {
  const isZip = filename.toLowerCase().endsWith('.zip') || (buf[0] === 0x50 && buf[1] === 0x4b);
  if (!isZip) {
    return parseAppleHealthXmlStream(Readable.from(buf));
  }
  // zip: export.xml(보통 apple_health_export/export.xml) 엔트리만 스트리밍 파싱
  const directory = await unzipper.Open.buffer(buf);
  const entry =
    directory.files.find((f) => /(^|\/)export\.xml$/i.test(f.path)) ??
    directory.files.find((f) => f.path.toLowerCase().endsWith('.xml'));
  if (!entry) throw new Error('zip 안에서 export.xml 을 찾지 못했습니다');
  const stream = entry.stream();
  return parseAppleHealthXmlStream(stream as unknown as NodeJS.ReadableStream);
}

// ─────────────────────────────────────────────────────────────────────
// 가민: 활동별 .gpx / .tcx (XML) 또는 그것들을 담은 .zip
//
// TCX: <Activity Sport="Running"><Id>2024-03-01T06:12:33Z</Id>
//   <Lap><TotalTimeSeconds>..</TotalTimeSeconds><DistanceMeters>..</DistanceMeters>
//   <AverageHeartRateBpm><Value>..</Value></AverageHeartRateBpm></Lap></Activity>
// GPX: <trk><name>..</name><trkseg><trkpt lat lon><ele>..</ele><time>..</time>...
//   → 거리는 좌표 적분이 필요해 비용이 큼 → GPX 는 날짜/고도/포인트수만, 거리는 생략(수동 보정 안내)
// ─────────────────────────────────────────────────────────────────────

/** 단일 TCX 스트림 파싱 → 활동들(보통 1건, 멀티스포츠면 다건) */
export function parseTcxStream(stream: NodeJS.ReadableStream, sourceHint: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: true, lowercase: false });
    const activities: ParsedActivity[] = [];
    let truncated = false;

    let cur: (Partial<ParsedActivity> & { _sumTime?: number; _sumDist?: number; _hrSum?: number; _hrN?: number }) | null = null;
    const path: string[] = [];
    let text = '';

    parser.on('opentag', (node) => {
      if (truncated) return;
      path.push(node.name);
      text = '';
      const a = node.attributes as Record<string, string>;
      if (node.name === 'Activity') {
        cur = { kind: normalizeKind(a.Sport), distanceM: 0, durationS: 0, elevationM: null, avgHr: null, _sumTime: 0, _sumDist: 0, _hrSum: 0, _hrN: 0 };
      }
    });

    parser.on('text', (t) => { text += t; });
    parser.on('cdata', (t) => { text += t; });

    parser.on('closetag', (name) => {
      if (cur) {
        if (name === 'Id' && !cur.activityDate) {
          cur.activityDate = toDateOnly(text) ?? '';
          cur.sourceRef = text.trim() || `${sourceHint}`;
        } else if (name === 'TotalTimeSeconds') {
          cur._sumTime = (cur._sumTime ?? 0) + (num(text) ?? 0);
        } else if (name === 'DistanceMeters') {
          // Lap 합계만 사용(트랙포인트 누적 중복 방지): 부모가 Lap 일 때만
          if (path[path.length - 2] === 'Lap') cur._sumDist = (cur._sumDist ?? 0) + (num(text) ?? 0);
        } else if (name === 'Value' && path[path.length - 2] === 'AverageHeartRateBpm') {
          const v = num(text);
          if (v != null) { cur._hrSum = (cur._hrSum ?? 0) + v; cur._hrN = (cur._hrN ?? 0) + 1; }
        } else if (name === 'Activity') {
          const c = cur; cur = null;
          if (c.activityDate) {
            if (activities.length >= MAX_ACTIVITIES) { truncated = true; }
            else activities.push({
              sourceRef: c.sourceRef ?? `${sourceHint}_${c.activityDate}`,
              kind: c.kind ?? 'workout',
              activityDate: c.activityDate,
              distanceM: c._sumDist ? Math.round(c._sumDist) : null,
              durationS: c._sumTime ? Math.round(c._sumTime) : null,
              elevationM: null,
              avgHr: c._hrN ? Math.round((c._hrSum ?? 0) / c._hrN) : null,
              note: 'Garmin',
            });
          }
        }
      }
      path.pop();
      text = '';
    });

    parser.on('error', reject);
    parser.on('end', () => resolve({ activities, skipped: 0, truncated }));
    stream.pipe(parser);
    stream.on('error', reject);
  });
}

/** 단일 GPX 스트림 파싱 → 1건(거리는 미산출, 날짜/고도/이름만) */
export function parseGpxStream(stream: NodeJS.ReadableStream, sourceHint: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: true, lowercase: false });
    let date: string | null = null;
    let name: string | null = null;
    let maxEle: number | null = null;
    const path: string[] = [];
    let text = '';

    parser.on('opentag', (node) => { path.push(node.name); text = ''; });
    parser.on('text', (t) => { text += t; });
    parser.on('closetag', (tag) => {
      if (tag === 'time' && !date) date = toDateOnly(text);
      else if (tag === 'name' && !name && path.includes('trk')) name = text.trim().slice(0, 120) || null;
      else if (tag === 'ele') { const e = num(text); if (e != null) maxEle = Math.max(maxEle ?? -1e9, e); }
      path.pop(); text = '';
    });
    parser.on('error', reject);
    parser.on('end', () => {
      const activities: ParsedActivity[] = [];
      if (date) activities.push({
        sourceRef: `${sourceHint}_${date}`,
        kind: 'run',
        activityDate: date,
        distanceM: null,            // GPX 거리는 좌표적분 필요 → 비용상 생략, 사용자가 보정
        durationS: null,
        elevationM: maxEle != null ? Math.round(maxEle) : null,
        avgHr: null,
        note: name ?? 'Garmin GPX',
      });
      resolve({ activities, skipped: 0, truncated: false });
    });
    stream.pipe(parser);
    stream.on('error', reject);
  });
}

/** 가민 업로드(.tcx/.gpx 단일, 또는 여러 개 담은 .zip)를 받아 통합 파싱 */
export async function parseGarminFile(buf: Buffer, filename: string): Promise<ParseResult> {
  const lower = filename.toLowerCase();
  const isZip = lower.endsWith('.zip') || (buf[0] === 0x50 && buf[1] === 0x4b);

  if (!isZip) {
    if (lower.endsWith('.tcx')) return parseTcxStream(Readable.from(buf), filename);
    if (lower.endsWith('.gpx')) return parseGpxStream(Readable.from(buf), filename);
    // fit 등 바이너리는 미지원 — 안내
    throw new Error('지원하지 않는 형식입니다. .tcx 또는 .gpx, 또는 그것들을 담은 .zip 을 올려주세요. (.fit 은 아직 미지원)');
  }

  const directory = await unzipper.Open.buffer(buf);
  const all: ParsedActivity[] = [];
  let skipped = 0, truncated = false;
  for (const f of directory.files) {
    if (all.length >= MAX_ACTIVITIES) { truncated = true; break; }
    const p = f.path.toLowerCase();
    if (p.endsWith('/') ) continue;
    try {
      if (p.endsWith('.tcx')) {
        const r = await parseTcxStream(f.stream() as unknown as NodeJS.ReadableStream, f.path);
        all.push(...r.activities); truncated = truncated || r.truncated;
      } else if (p.endsWith('.gpx')) {
        const r = await parseGpxStream(f.stream() as unknown as NodeJS.ReadableStream, f.path);
        all.push(...r.activities);
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }
  return { activities: all.slice(0, MAX_ACTIVITIES), skipped, truncated };
}
