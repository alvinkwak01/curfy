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

  // Set order is not stable. Canonical JSON key order ensures the same
  // token retains the same row across separate native rendering/preparation
  // calls; otherwise the displayed app and prepared app could differ.
  let canonicalEncoder = JSONEncoder()
  canonicalEncoder.outputFormatting = [.sortedKeys]
  let encoded = try selection.applicationTokens.map { token in
    (try canonicalEncoder.encode(token).base64EncodedString(), token)
  }
  let sorted = encoded.sorted { $0.0 < $1.0 }.map { $0.1 }
  let revision = SHA256.hash(data: Data(saved.utf8))
    .map { String(format: "%02x", $0) }.joined()
  return CurfyProtectedSnapshot(revision: revision, applications: sorted)
}


// An exception ticket is NOT an unlock permission. It only pins one private
// token to a particular, unchanged committed app selection. A future
// post-120-second native bridge must verify this ticket again before changing
// any ManagedSettings state.
private let curfyChoiceTicketKey = "curfy-prepared-app-choice-tickets"
private let curfyChoicePrefix = "curfy-single-app-"
private let curfyTicketValidity: TimeInterval = 10 * 60
private let curfyTicketRetention: TimeInterval = 24 * 60 * 60

private struct CurfyChoiceTicket: Codable {
  let committedSelectionId: String
  let revision: String
  let index: Int
  let createdAt: Date
}

private func curfySharedDefaults() throws -> UserDefaults {
  guard let group = Bundle.main.object(forInfoDictionaryKey: curfyAppGroupInfoKey) as? String,
        !group.isEmpty,
        let defaults = UserDefaults(suiteName: group) else {
    throw CurfyAppChoiceError.unavailableSharedStore
  }
  return defaults
}

private func storedChoiceTickets(_ defaults: UserDefaults) -> [String: Data] {
  defaults.dictionary(forKey: curfyChoiceTicketKey) as? [String: Data] ?? [:]
}

// Strictly retain tickets needed by existing native monitors for a full day.
// Stale tickets cannot be used to bypass a new hold; validation expires after
// ten minutes and always checks the current committed token.
private func pruneStaleChoiceTickets(
  _ defaults: UserDefaults,
  choices: inout [String: Data]
) {
  let decoder = JSONDecoder()
  let now = Date()
  var selectionMap = defaults.dictionary(forKey: curfySelectionKey) as? [String: String] ?? [:]
  for (id, data) in Array(choices) {
    guard let ticket = try? decoder.decode(CurfyChoiceTicket.self, from: data),
          now.timeIntervalSince(ticket.createdAt) < curfyTicketRetention else {
      choices.removeValue(forKey: id)
      selectionMap.removeValue(forKey: id)
      continue
    }
  }
  defaults.set(selectionMap, forKey: curfySelectionKey)
}

private func prepareOneProtectedApp(
  selectionId: String, revision: String, index: Int
) throws -> String {
  let snapshot = try loadCurfyProtectedSnapshot(selectionId)
  guard snapshot.revision == revision else { throw CurfyAppChoiceError.staleSelection }
  guard index >= 0 && index < snapshot.applications.count else {
    throw CurfyAppChoiceError.invalidIndex
  }
  let defaults = try curfySharedDefaults()
  var tickets = storedChoiceTickets(defaults)
  pruneStaleChoiceTickets(defaults, choices: &tickets)
  // Read after pruning, otherwise old pruned IDs could be resurrected when
  // we save the new ticket.
  var selections = defaults.dictionary(forKey: curfySelectionKey) as? [String: String] ?? [:]

  let identifier = curfyChoicePrefix + UUID().uuidString
  let token = snapshot.applications[index]
  var single = FamilyActivitySelection()
  single.applicationTokens = Set([token])
  guard let encoded = try? JSONEncoder().encode(single).base64EncodedString() else {
    throw CurfyAppChoiceError.invalidSelection
  }
  let ticket = CurfyChoiceTicket(
    committedSelectionId: selectionId, revision: revision,
    index: index, createdAt: Date()
  )
  let data = try JSONEncoder().encode(ticket)
  // Persist the same opaque format consumed by the pinned DeviceActivity
  // extension; only the actual iOS process ever decodes the token.
  selections[identifier] = encoded
  tickets[identifier] = data
  defaults.set(selections, forKey: curfySelectionKey)
  defaults.set(tickets, forKey: curfyChoiceTicketKey)
  guard (defaults.dictionary(forKey: curfySelectionKey)?[identifier] as? String) == encoded,
        (defaults.dictionary(forKey: curfyChoiceTicketKey)?[identifier] as? Data) == data else {
    throw CurfyAppChoiceError.invalidSelection
  }
  return identifier
}

private func validateOneProtectedAppTicket(_ identifier: String) throws -> Bool {
  guard identifier.hasPrefix(curfyChoicePrefix),
        UUID(uuidString: String(identifier.dropFirst(curfyChoicePrefix.count))) != nil else {
    throw CurfyAppChoiceError.invalidSelection
  }
  let defaults = try curfySharedDefaults()
  guard let data = storedChoiceTickets(defaults)[identifier],
        let ticket = try? JSONDecoder().decode(CurfyChoiceTicket.self, from: data),
        Date().timeIntervalSince(ticket.createdAt) < curfyTicketValidity,
        ticket.createdAt.timeIntervalSinceNow <= 0 else {
    throw CurfyAppChoiceError.staleSelection
  }
  let current = try loadCurfyProtectedSnapshot(ticket.committedSelectionId)
  guard current.revision == ticket.revision else {
    throw CurfyAppChoiceError.staleSelection
  }
  guard ticket.index >= 0 && ticket.index < current.applications.count else {
    throw CurfyAppChoiceError.invalidIndex
  }
  guard let encoded = defaults.dictionary(forKey: curfySelectionKey)?[identifier] as? String,
        let data = Data(base64Encoded: encoded),
        let scoped = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data),
        scoped.applicationTokens == Set([current.applications[ticket.index]]),
        scoped.categoryTokens.isEmpty, scoped.webDomainTokens.isEmpty,
        !scoped.includeEntireCategory else {
    throw CurfyAppChoiceError.invalidSelection
  }
  return true
}

// Only discard unused tickets before scheduling a monitor. Once a native
// exception has started, its one-token selection must survive app termination
// until reblocking. Therefore the future exception coordinator owns cleanup.

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
    Function("prepareProtectedApp") {
      (selectionId: String, revision: String, index: Int) throws -> String in
      try prepareOneProtectedApp(selectionId: selectionId, revision: revision, index: index)
    }

    Function("validatePreparedApp") { (ticketId: String) throws -> Bool in
      try validateOneProtectedAppTicket(ticketId)
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
