import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { AppState, Platform } from "react-native";
import { PremiumEntitlement } from "@/lib/premiumPolicy";
import {
  loadPremiumEntitlement, restorePremium, subscribePremiumTransactions,
} from "@/lib/premiumStore";

type PremiumContextValue = {
  entitlement: PremiumEntitlement;
  isChecking: boolean;
  refresh: () => Promise<PremiumEntitlement>;
  restore: () => Promise<"owned" | "free">;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

/**
 * A read-only entitlement observer until Curfy can deliver per-app Premium
 * exceptions. It NEVER changes native shielding on its own, and never
 * exposes a purchase button. Every ownership claim originates in StoreKit.
 */
export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [entitlement, setEntitlement] = useState<PremiumEntitlement>("unknown");
  const [isChecking, setChecking] = useState(Platform.OS === "ios");
  const mounted = useRef(true);
  const sequence = useRef(0);

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
      if (mounted.current && request === sequence.current) setChecking(false);
    }
  }, []);

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
    <PremiumContext.Provider value={{ entitlement, isChecking, refresh, restore }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const context = useContext(PremiumContext);
  if (!context) throw new Error("usePremium requires PremiumProvider");
  return context;
}
