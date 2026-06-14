import Foundation
import HealthKit

struct RunclubActivity: Codable, Identifiable, Hashable {
    var id: String { sourceRef }
    let activityDate: String
    let startDate: String
    let kind: String
    let distanceM: Int
    let durationS: Int
    let avgHr: Int?
    let elevationM: Int?
    let sourceRef: String
    let note: String
}

struct IngestRequest: Codable {
    let activities: [RunclubActivity]
}

struct IngestResponse: Codable {
    let ok: Bool
    let imported: Int
    let duplicate: Int
    let skipped: Int
    let mileageEarned: Int
    let truncated: Bool?
}

struct SyncSummary: Equatable {
    let imported: Int
    let duplicate: Int
    let skipped: Int
    let mileageEarned: Int

    var message: String {
        "업로드 \(imported)건 · 중복 \(duplicate)건 · 제외 \(skipped)건" + (mileageEarned > 0 ? " · +\(mileageEarned)P" : "")
    }
}

enum RunclubAppError: LocalizedError {
    case missingEndpoint
    case missingToken
    case invalidEndpoint
    case healthDataUnavailable
    case healthAuthorizationDenied
    case uploadFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingEndpoint:
            return "Runclub ingest endpoint를 입력해주세요."
        case .missingToken:
            return "Runclub bearer token을 입력해주세요."
        case .invalidEndpoint:
            return "endpoint URL 형식이 올바르지 않습니다."
        case .healthDataUnavailable:
            return "이 기기에서는 HealthKit 데이터를 사용할 수 없습니다."
        case .healthAuthorizationDenied:
            return "건강 데이터 권한이 필요합니다. iPhone 설정에서 권한을 확인해주세요."
        case .uploadFailed(let message):
            return message
        }
    }
}

extension HKWorkoutActivityType {
    var runclubKind: String {
        switch self {
        case .running:
            return "run"
        case .walking, .hiking:
            return "walk_run"
        default:
            return "custom"
        }
    }
}
