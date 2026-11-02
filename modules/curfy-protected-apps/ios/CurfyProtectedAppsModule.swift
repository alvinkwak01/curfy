import CryptoKit
import ExpoModulesCore
import FamilyControls
import Foundation
import SwiftUI
import UIKit

// Pinned react-native-device-activity@0.6.1 source uses this UserDefaults
// key, with a JSONEncoder(FamilyActivitySelection) value encoded in base64.
// This intentionally reads *only* Curfy's committed selection, never picker
// drafts or the native library's current shield state.
//
// If upstream changes its private persistence layout, fail closed and stop
// displaying the chooser. Do not silently infer app names or decode tokens
// in JavaScript. Verify this against the installed package before upgrading.
private let curfySelectionKey = "familyActivitySelectionIds"
private let curfyAppGroupInfoKey = "REACT_NATIVE_DEVICE_ACTIVITY_APP_GROUP"

private enum CurfyAppChoiceError: LocalizedError {
  case unsupportedSelection
  case unavailableSharedStore
  case noSavedSelection
  case invalidSelection
  case staleSelection
  case invalidIndex

  var errorDescription: String? {
    switch self {
    case .unsupportedSelection:
      return "Only Curfy's committed app selection can be displayed."
    case .unavailableSharedStore:
      return "Curfy could not access the Screen Time app group."
    case .noSavedSelection:
      return "Choose the apps to protect in Curfy Settings."
    case .invalidSelection:
      return "Only individually selected apps are supported."
    case .staleSelection:
      return "Your protected-app selection changed. Reopen the chooser."
    case .invalidIndex:
      return "That protected app is no longer available."
    }
  }
}

private struct CurfyProtectedSnapshot {
  let revision: String
  let applications: [ApplicationToken]
}

// All decoded app tokens remain in this native module, inside the iOS
// app process. The JS API returns only a count and whole-selection digest.
private func loadCurfyProtectedSnapshot(_ selectionId: String) throws -> CurfyProtectedSnapshot {
  guard ["curfy-block-social", "curfy-block-most", "curfy-block-custom"].contains(selectionId) else {
    throw CurfyAppChoiceError.unsupportedSelection
  }
  guard let appGroup = Bundle.main.object(forInfoDictionaryKey: curfyAppGroupInfoKey) as? String,
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup) else {
    throw CurfyAppChoiceError.unavailableSharedStore
  }
  guard let saved = defaults.dictionary(forKey: curfySelectionKey)?[selectionId] as? String,
        let data = Data(base64Encoded: saved) else {
    throw CurfyAppChoiceError.noSavedSelection
  }
  let selection: FamilyActivitySelection
  do {
    selection = try JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  } catch {
    throw CurfyAppChoiceError.invalidSelection
  }
  guard !selection.includeEntireCategory,
        selection.categoryTokens.isEmpty,
        selection.webDomainTokens.isEmpty,
        !selection.applicationTokens.isEmpty else {
    throw CurfyAppChoiceError.invalidSelection
  }

  // Set order is not stable; ordering must remain deterministic across
  // native view rendering and a later per-app exception request.
  let encoded = try selection.applicationTokens.map { token in
    (try JSONEncoder().encode(token).base64EncodedString(), token)
  }
  let sorted = encoded.sorted { $0.0 < $1.0 }.map { $0.1 }
  let revision = SHA256.hash(data: Data(saved.utf8))
    .map { String(format: "%02x", $0) }.joined()
  return CurfyProtectedSnapshot(revision: revision, applications: sorted)
}

final class CurfyProtectedAppLabelView: ExpoView {
  private let host = UIHostingController(rootView: AnyView(Text("App unavailable")))
  var selectionId = ""
  var revision = ""
  var index = -1

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    host.view.backgroundColor = .clear
    host.view.isUserInteractionEnabled = false
    addSubview(host.view)
    isAccessibilityElement = false
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }

  func updateLabel() {
    do {
      let snapshot = try loadCurfyProtectedSnapshot(selectionId)
      guard snapshot.revision == revision else { throw CurfyAppChoiceError.staleSelection }
      guard index >= 0 && index < snapshot.applications.count else {
        throw CurfyAppChoiceError.invalidIndex
      }
      let token = snapshot.applications[index]
      // Apple's native FamilyControls label renders the selected app's icon
      // and name on device. Neither is returned to React Native.
      host.rootView = AnyView(
        Label(token)
          .font(.system(size: 16))
          .foregroundColor(.white)
          .frame(maxWidth: .infinity, alignment: .leading)
      )
    } catch {
      host.rootView = AnyView(
        Text("App unavailable")
          .font(.system(size: 14))
          .foregroundColor(.gray)
      )
    }
  }
}

public class CurfyProtectedAppsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CurfyProtectedApps")

    Function("getProtectedApps") { (selectionId: String) throws -> [String: Any] in
      let snapshot = try loadCurfyProtectedSnapshot(selectionId)
      // No token values, names, bundle IDs, or app-specific hashes cross JS.
      return ["count": snapshot.applications.count, "revision": snapshot.revision]
    }

    View(CurfyProtectedAppLabelView.self) {
      Prop("selectionId") { (view: CurfyProtectedAppLabelView, value: String) in
        view.selectionId = value
        view.updateLabel()
      }
      Prop("revision") { (view: CurfyProtectedAppLabelView, value: String) in
        view.revision = value
        view.updateLabel()
      }
      Prop("index") { (view: CurfyProtectedAppLabelView, value: Int) in
        view.index = value
        view.updateLabel()
      }
    }
  }
}
