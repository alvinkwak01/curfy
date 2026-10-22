import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

// Milestone 1: a single explicitly selected app, not categories or websites.
// This store never attempts to restrict Curfy itself or the whole phone.
private let curfyShieldStore = ManagedSettingsStore()

public final class CurfyScreenTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CurfyScreenTime")

    Function("authorizationStatus") { () -> String in
      switch AuthorizationCenter.shared.authorizationStatus {
      case .approved: return "approved"
      case .denied: return "denied"
      case .notDetermined: return "notDetermined"
      @unknown default: return "unknown"
      }
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      return "approved"
    }

    // Picker is native SwiftUI: Screen Time tokens never cross the JS bridge.
    AsyncFunction("selectAndShieldOneApp") { (promise: Promise) in
      DispatchQueue.main.async {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
          promise.reject("NOT_AUTHORIZED", "Authorize Screen Time before choosing an app.")
          return
        }
        guard let presenter = Self.topPresenter() else {
          promise.reject("NO_PRESENTER", "Cannot show the Screen Time app picker.")
          return
        }
        let picker = SingleAppPicker { result in
          presenter.dismiss(animated: true) {
            switch result {
            case .success(let tokens):
              curfyShieldStore.shield.applications = tokens
              // Persist opaque tokens on-device so later milestones can restore
              // the selection in DeviceActivityMonitor and exception handlers.
              let selection = FamilyActivitySelection()
              // Milestone 1 does not claim persistence or overnight scheduling.
              _ = selection
              promise.resolve(tokens.count)
            case .failure(let error):
              promise.reject("SELECTION_CANCELLED_OR_INVALID", error.localizedDescription)
            }
          }
        }
        presenter.present(UIHostingController(rootView: picker), animated: true)
      }
    }

    Function("clearShield") { () -> Void in
      curfyShieldStore.shield.applications = nil
    }

    Function("isShieldConfigured") { () -> Bool in
      !(curfyShieldStore.shield.applications ?? []).isEmpty
    }
  }

  private static func topPresenter() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .first(where: { $0.activationState == .foregroundActive }),
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else { return nil }
    var current = root
    while let next = current.presentedViewController { current = next }
    return current
  }
}

private struct SingleAppPicker: View {
  @State private var selection = FamilyActivitySelection()
  let done: (Result<Set<ApplicationToken>, PickerError>) -> Void

  var body: some View {
    NavigationStack {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("Choose one app")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { done(.failure(PickerError.cancelled)) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Protect") {
              guard selection.applicationTokens.count == 1,
                    selection.categoryTokens.isEmpty,
                    selection.webDomainTokens.isEmpty else {
                return
              }
              done(.success(selection.applicationTokens))
            }
            .disabled(selection.applicationTokens.count != 1 ||
                      !selection.categoryTokens.isEmpty ||
                      !selection.webDomainTokens.isEmpty)
          }
        }
    }
  }
}

private enum PickerError: Error {
  case cancelled
}
