import SwiftUI

struct SettingsView: View {
    @Binding var endpoint: String
    @Binding var token: String

    var body: some View {
        Form {
            Section("Runclub 연결") {
                TextField("Ingest endpoint", text: $endpoint, axis: .vertical)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                SecureField("Bearer token", text: $token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            Section("설정 방법") {
                Text("Runclub 웹의 Apple 건강 Shortcut/API beta에서 endpoint와 token을 발급받아 붙여넣으세요. 토큰은 이 앱 안에만 저장됩니다.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("연결 설정")
    }
}
