import Combine
import Foundation
import HealthKit

@MainActor
final class HealthKitManager: ObservableObject {
    @Published private(set) var authorizationRequested = false
    @Published private(set) var workouts: [RunclubActivity] = []

    private let store = HKHealthStore()
    private let isoDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
    private let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw RunclubAppError.healthDataUnavailable
        }
        guard let distanceType = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning),
              let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
            throw RunclubAppError.healthDataUnavailable
        }

        let readTypes: Set<HKObjectType> = [
            HKObjectType.workoutType(),
            distanceType,
            heartRateType
        ]
        try await store.requestAuthorization(toShare: [], read: readTypes)
        authorizationRequested = true
    }

    func loadRecentRunningWorkouts(days: Int = 30) async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw RunclubAppError.healthDataUnavailable
        }
        let calendar = Calendar.current
        let startDate = calendar.date(byAdding: .day, value: -max(1, days), to: Date()) ?? Date()
        let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: Date(), options: .strictEndDate)
        let activityPredicate = NSCompoundPredicate(orPredicateWithSubpredicates: [
            HKQuery.predicateForWorkouts(with: .running),
            HKQuery.predicateForWorkouts(with: .walking),
            HKQuery.predicateForWorkouts(with: .hiking)
        ])
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, activityPredicate])
        let samples = try await fetchWorkouts(predicate: predicate, limit: 100)
        workouts = samples.map(activity(from:))
    }

    private func fetchWorkouts(predicate: NSPredicate, limit: Int) async throws -> [HKWorkout] {
        try await withCheckedThrowingContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
            let query = HKSampleQuery(
                sampleType: HKObjectType.workoutType(),
                predicate: predicate,
                limit: limit,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(query)
        }
    }

    private func activity(from workout: HKWorkout) -> RunclubActivity {
        let distanceMeters = workout.totalDistance?.doubleValue(for: .meter()) ?? 0
        let durationSeconds = max(0, Int(workout.duration.rounded()))
        let distance = max(0, Int(distanceMeters.rounded()))
        let kind = workout.workoutActivityType.runclubKind
        let title = workout.metadata?[HKMetadataKeyWorkoutBrandName] as? String ?? "Apple HealthKit"

        return RunclubActivity(
            activityDate: dayFormatter.string(from: workout.startDate),
            startDate: isoDateFormatter.string(from: workout.startDate),
            kind: kind,
            distanceM: distance,
            durationS: durationSeconds,
            avgHr: nil,
            elevationM: nil,
            sourceRef: "healthkit:\(workout.uuid.uuidString)",
            note: title
        )
    }
}
