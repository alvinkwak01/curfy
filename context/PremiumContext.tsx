import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { AppState, Platform } from "react-native";
import { PremiumEntitlement } from "@/lib/premiumPolicy";
import {
  loadPremiumEntitlement, restorePremium, purchasePremium, subscribePremiumTransactions, type PremiumPurchaseOutcome,
} from "@/lib/premiumStore";

type PremiumContextValue = {
  entitlement: PremiumEntitlement;
  isChecking: boolean;
  refresh: () => Promise<PremiumEntitlement>;
  restore: () => Promise<"owned" | "free">;
  purchase: () => Promise<PremiumPurchaseOutcome>;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

/**
 * Every ownership claim originates in StoreKit. Purchase/restore never change
 * native shields or the saved app selection on their own.
 */
export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [entitlement, setEntitlement] = useState<PremiumEntitlement>("unknown");
  const [isChecking, setChecking] = useState(Platform.OS === "ios");
  const mounted = useRef(true);
  const sequence = useRef(0);
  const storeActionPending = useRef(false);

  const refresh = useCallback(async (): Promise<PremiumEntitlement> => {
    if (Platform.OS !== "ios") return "unknown";
    const request = ++sequence.current;
    if (mounted.current) setChecking(true);
    const current = await loadPremiumEntitlement();
    // A delayed refresh must never overwrite a newer transaction update.
    if (mounted.current && request === sequence.current) {
      setEntitlement(current);
      setChecking(false);
    }
    return current;
  }, []);

  const restore = useCallback(async (): Promise<"owned" | "free"> => {
    if (Platform.OS !== "ios") throw new Error("Restore is available on iPhone.");
    if (storeActionPending.current) throw new Error("An App Store request is already in progress.");
    storeActionPending.current = true;
    // Invalidate older refreshes before the potentially interactive sync.
    const request = ++sequence.current;
    if (mounted.current) setChecking(true);
    try {
      const result = await restorePremium(); // StoreKit.sync + fresh verification
      if (mounted.current && request === sequence.current) {
        setEntitlement(result);
      }
      return result;
    } catch (error) {
      if (mounted.current && request === sequence.current) {
        setEntitlement("unknown");
      }
      throw error;
    } finally {
      storeActionPending.current = false;
      if (mounted.current && request === sequence.current) setChecking(false);
    }
  }, []);

  const purchase = useCallback(async (): Promise<PremiumPurchaseOutcome> => {
    if (Platform.OS !== "ios") throw new Error("Premium is available on iPhone.");
    if (storeActionPending.current) throw new Error("An App Store request is already in progress.");
    storeActionPending.current = true;
    ++sequence.current;
    if (mounted.current) setChecking(true);
    try {
      const result = await purchasePremium();
      // Includes cancellation/pending: always reconcile the latest verified state.
      const current = await refresh();
      if (result === "owned" && current !== "owned") throw new Error("Apple hasn't confirmed current Premium ownership. Please restore purchases.");
      return result;
    } catch (error) {
      await refresh();
      throw error;
    } finally {
      storeActionPending.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    if (Platform.OS !== "ios") return () => { mounted.current = false; };
    void refresh();
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribePremiumTransactions(() => { void refresh(); });
    } catch (error) {
      // An older development build may lack this native module. Never crash
      // onboarding, assume ownership, or change existing managed shields.
      console.warn("[Curfy] Premium transaction observer unavailable", error);
    }
    return () => {
      mounted.current = false;
      sequence.current++;
      appSub.remove();
      unsubscribe();
    };
  }, [refresh]);

  return (
    <PremiumContext.Provider value={{ entitlement, isChecking, refresh, restore, purchase }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const context = useContext(PremiumContext);
  if (!context) throw new Error("usePremium requires PremiumProvider");
  return context;
}
