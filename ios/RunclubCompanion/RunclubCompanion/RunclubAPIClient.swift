import Foundation

final class RunclubAPIClient {
    func upload(activities: [RunclubActivity], endpoint: String, token: String) async throws -> SyncSummary {
        guard !endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw RunclubAppError.missingEndpoint
        }
        guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw RunclubAppError.missingToken
        }
        guard let url = URL(string: endpoint) else {
            throw RunclubAppError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(IngestRequest(activities: activities))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw RunclubAppError.uploadFailed("서버 응답을 확인할 수 없습니다.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw RunclubAppError.uploadFailed("업로드 실패 (\(http.statusCode)) \(body)")
        }

        let decoded = try JSONDecoder().decode(IngestResponse.self, from: data)
        return SyncSummary(
            imported: decoded.imported,
            duplicate: decoded.duplicate,
            skipped: decoded.skipped,
            mileageEarned: decoded.mileageEarned
        )
    }
}
