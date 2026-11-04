import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

/** This intentionally throws on iOS if the development build omitted the pod. */
type NativeCurfyStoreKit = {
  getProduct(productId: string): Promise<{
    productId: string;
    displayName: string;
    displayPrice: string;
    available: boolean;
  }>;
  getEntitlement(productId: string): Promise<string>;
  purchase(productId: string): Promise<string>;
  restore(productId: string): Promise<string>;
  addListener(
    event: "onPremiumTransactionChanged",
    callback: (event: { productId: string }) => void
  ): { remove(): void };
};

export function curfyStoreKit(): NativeCurfyStoreKit {
  if (Platform.OS !== "ios") {
    throw new Error("Curfy Premium purchases are only supported on iPhone.");
  }
  return requireNativeModule<NativeCurfyStoreKit>("CurfyStoreKit");
}
