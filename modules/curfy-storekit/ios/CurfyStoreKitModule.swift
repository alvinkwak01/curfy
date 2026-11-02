import ExpoModulesCore
import StoreKit

// This is deliberately an app-only module, not a Screen Time extension.
// Only StoreKit 2's *verified* transactions can grant Premium ownership.
// No AsyncStorage/Supabase flag, purchase-tap response or receipt string
// can substitute for Apple's Transaction.currentEntitlements.
private enum CurfyStoreError: LocalizedError {
  case productUnavailable
  case invalidProductType
  case unverifiedTransaction
  case unexpectedPurchaseResult

  var errorDescription: String? {
    switch self {
    case .productUnavailable:
      return "Curfy Premium is not available from the App Store right now."
    case .invalidProductType:
      return "Curfy Premium must be a one-time, non-consumable purchase."
    case .unverifiedTransaction:
      return "The App Store could not verify this Curfy Premium transaction."
    case .unexpectedPurchaseResult:
      return "The App Store returned an unsupported purchase result."
    }
  }
}

private func premiumProduct(_ productID: String) async throws -> Product {
  guard let product = try await Product.products(for: [productID]).first else {
    throw CurfyStoreError.productUnavailable
  }
  guard product.type == .nonConsumable else {
    throw CurfyStoreError.invalidProductType
  }
  return product
}

private func currentPremiumOwnership(_ productID: String) async throws -> String {
  // StoreKit 2 excludes revoked/refunded non-consumables from this sequence.
  // An unverified matching entitlement is a *failure*, never an owned state.
  for await result in Transaction.currentEntitlements {
    switch result {
    case .verified(let transaction):
      if transaction.productID == productID {
        guard transaction.productType == .nonConsumable else {
          throw CurfyStoreError.invalidProductType
        }
        return "owned"
      }
    case .unverified(let transaction, _):
      if transaction.productID == productID {
        throw CurfyStoreError.unverifiedTransaction
      }
    }
  }
  return "free"
}

public class CurfyStoreKitModule: Module {
  private var transactionObserver: Task<Void, Never>?

  // Apple's transaction updates include pending Ask to Buy approvals, changes
  // on other devices, and revocations. The event never carries ownership:
  // JavaScript must re-read verified currentEntitlements after receiving it.
  private func startTransactionObserver() {
    guard transactionObserver == nil else { return }
    transactionObserver = Task { [weak self] in
      for await update in Transaction.updates {
        if Task.isCancelled { break }
        let transaction: Transaction
        switch update {
        case .verified(let verified):
          transaction = verified
          // Only verified transactions may be finished. The JS side never
          // infers Premium from this event; it rechecks active ownership.
          await verified.finish()
        case .unverified(let unverified, _):
          transaction = unverified
        }
        guard transaction.productID == "com.alvinkwak.curfy.premium" else { continue }
        await MainActor.run {
          self?.sendEvent("onPremiumTransactionChanged", ["productId": transaction.productID])
        }
      }
    }
  }

  private func stopTransactionObserver() {
    transactionObserver?.cancel()
    transactionObserver = nil
  }

  deinit {
    transactionObserver?.cancel()
  }

  public func definition() -> ModuleDefinition {
    Name("CurfyStoreKit")
    Events("onPremiumTransactionChanged")
    OnStartObserving("onPremiumTransactionChanged") { [weak self] in
      self?.startTransactionObserver()
    }
    OnStopObserving("onPremiumTransactionChanged") { [weak self] in
      self?.stopTransactionObserver()
    }

    AsyncFunction("getProduct") { (productID: String, promise: Promise) in
      Task {
        do {
          let product = try await premiumProduct(productID)
          promise.resolve([
            "productId": product.id,
            "displayName": product.displayName,
            "displayPrice": product.displayPrice,
            "available": true
          ] as [String: Any])
        } catch {
          promise.reject("CURFY_STORE_PRODUCT", error.localizedDescription)
        }
      }
    }

    AsyncFunction("getEntitlement") { (productID: String, promise: Promise) in
      Task {
        do {
          promise.resolve(try await currentPremiumOwnership(productID))
        } catch {
          promise.reject("CURFY_STORE_ENTITLEMENT", error.localizedDescription)
        }
      }
    }

    AsyncFunction("purchase") { (productID: String, promise: Promise) in
      Task {
        do {
          let product = try await premiumProduct(productID)
          let result = try await product.purchase()
          switch result {
          case .success(let verification):
            switch verification {
            case .verified(let transaction):
              guard transaction.productID == productID else {
                throw CurfyStoreError.unverifiedTransaction
              }
              // Finish only after native StoreKit cryptographic verification.
              await transaction.finish()
              // JS independently re-reads currentEntitlements before granting
              // any owned state; this string itself is NOT an entitlement.
              promise.resolve("purchased")
            case .unverified:
              throw CurfyStoreError.unverifiedTransaction
            }
          case .pending:
            promise.resolve("pending")
          case .userCancelled:
            promise.resolve("cancelled")
          @unknown default:
            throw CurfyStoreError.unexpectedPurchaseResult
          }
        } catch {
          promise.reject("CURFY_STORE_PURCHASE", error.localizedDescription)
        }
      }
    }

    AsyncFunction("restore") { (productID: String, promise: Promise) in
      Task {
        do {
          // AppStore.sync() may show an Apple Account authentication sheet.
          try await AppStore.sync()
          // Return only current verified ownership after successful sync.
          promise.resolve(try await currentPremiumOwnership(productID))
        } catch {
          promise.reject("CURFY_STORE_RESTORE", error.localizedDescription)
        }
      }
    }
  }
}
