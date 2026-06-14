import SwiftUI

struct ContentView: View {
    @StateObject private var healthKit = HealthKitManager()
    private let apiClient = RunclubAPIClient()

    @AppStorage("runclub.endpoint") private var endpoint = ""
    @AppStorage("runclub.token") private var token = ""
    @AppStorage("runclub.lastSyncAt") private var lastSyncAt = ""

    @State private var loading = false
    @State private var statusMessage = ""
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Apple Watch 러닝 기록을 Runclub으로")
                            .font(.headline)
                        Text("iPhone HealthKit 권한을 받아 최근 러닝/걷기 운동을 읽고 Runclub ingest API로 업로드합니다.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("동기화") {
                    Button {
                        Task { await authorizeAndLoad() }
                    } label: {
                        Label("건강 권한 요청 + 최근 기록 불러오기", systemImage: "heart.text.square")
                    }
                    .disabled(loading)

                    Button {
                        Task { await uploadAll() }
                    } label: {
                        Label("Runclub으로 업로드", systemImage: "arrow.up.circle")
                    }
                    .disabled(loading || healthKit.workouts.isEmpty)

                    if !lastSyncAt.isEmpty {
                        Text("마지막 동기화: \(lastSyncAt)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    if !statusMessage.isEmpty {
                        Text(statusMessage)
                            .font(.footnote)
                            .foregroundStyle(statusMessage.contains("실패") || statusMessage.contains("오류") ? .red : .secondary)
                    }
                }

                Section("최근 HealthKit 운동") {
                    if healthKit.workouts.isEmpty {
                        Text("아직 불러온 운동 기록이 없습니다.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(healthKit.workouts) { activity in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(activity.activityDate)
                                        .font(.subheadline.weight(.medium))
                                    Spacer()
                                    Text(String(format: "%.2f km", Double(activity.distanceM) / 1000.0))
                                        .font(.subheadline.weight(.semibold))
                                }
                                Text("\(activity.kind) · \(activity.durationS / 60)분 · \(activity.note)")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Runclub Sync")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("설정") { showingSettings = true }
                }
            }
            .sheet(isPresented: $showingSettings) {
                NavigationStack {
                    SettingsView(endpoint: $endpoint, token: $token)
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("완료") { showingSettings = false }
                            }
                        }
                }
            }
            .overlay {
                if loading {
                    ProgressView("처리 중...")
                        .padding()
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private func authorizeAndLoad() async {
        loading = true
        defer { loading = false }
        do {
            try await healthKit.requestAuthorization()
            try await healthKit.loadRecentRunningWorkouts()
            statusMessage = "최근 \(healthKit.workouts.count)건을 불러왔습니다."
        } catch {
            statusMessage = "오류: \(error.localizedDescription)"
        }
    }

    private func uploadAll() async {
        loading = true
        defer { loading = false }
        do {
            let summary = try await apiClient.upload(
                activities: healthKit.workouts,
                endpoint: endpoint,
                token: token
            )
            let now = Date.formatted(Date.FormatStyle(date: .numeric, time: .shortened))
            lastSyncAt = now
            statusMessage = summary.message
        } catch {
            statusMessage = "업로드 실패: \(error.localizedDescription)"
        }
    }
}

#Preview {
    ContentView()
}
