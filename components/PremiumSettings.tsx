import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { usePremium } from "@/context/PremiumContext";
import { fetchPremiumProduct, type PremiumProduct } from "@/lib/premiumStore";

/** Optional purchase; onboarding and one-app Free protection never depend on it. */
export function PremiumSettings() {
  const { entitlement, purchase, restore, isChecking } = usePremium();
  const [product, setProduct] = useState<PremiumProduct | null>(null);
  const [priceError, setPriceError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let current = true;
    setPriceError(false);
    void fetchPremiumProduct().then(value => { if (current) setProduct(value); })
      .catch(() => { if (current) { setProduct(null); setPriceError(true); } });
    return () => { current = false; };
  }, [retry]);
  const perform = async (action: "purchase" | "restore") => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const result = await (action === "purchase" ? purchase() : restore());
      if (result === "owned") Alert.alert("Curfy Premium", "Premium is active. You can now choose multiple individual apps in Settings.");
      else if (result === "pending") Alert.alert("Purchase pending", "Apple hasn't approved this purchase yet. Free protection remains available.");
      else if (result === "free") Alert.alert("No purchase found", "Apple didn't find Curfy Premium for this Apple Account.");
    } catch (error) {
      Alert.alert("App Store request couldn't finish", error instanceof Error ? error.message : "Please try again.");
    } finally { pending.current = false; setBusy(false); }
  };
  return <View style={styles.section}>
    <Text style={styles.label}>CURFY PREMIUM</Text>
    <Text style={styles.hint}>Protect multiple individual apps. Each app still requires its own uninterrupted 120-second hold.</Text>
    {entitlement === "owned" ? <Text style={styles.active}>Premium active · one-time purchase</Text> : <>
      <TouchableOpacity accessibilityRole="button" disabled={busy || isChecking || !product}
        style={[styles.button, (busy || isChecking || !product) && styles.disabled]}
        onPress={() => { void perform("purchase"); }}>
        <Text style={styles.buttonText}>{product ? `Get Premium · ${product.displayPrice} once` : "App Store price unavailable"}</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>One-time purchase. No subscription. Free protects one app.</Text>
      {priceError && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setRetry(value => value + 1)} style={styles.link}>
        <Text style={styles.linkText}>Retry App Store pricing</Text>
      </TouchableOpacity>}
    </>}
    <TouchableOpacity accessibilityRole="button" disabled={busy || isChecking} onPress={() => { void perform("restore"); }} style={styles.link}>
      <Text style={styles.linkText}>{busy ? "Checking with Apple…" : "Restore purchases"}</Text>
    </TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 12, marginBottom: 28 },
  label: { color: Colors.textMuted, fontFamily: Fonts.semiBold, fontSize: 12, letterSpacing: 1.5 },
  hint: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 13, lineHeight: 20 },
  active: { color: Colors.primaryCyan, fontFamily: Fonts.medium, fontSize: 15 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: Colors.primaryCyan, alignItems: "center", justifyContent: "center", padding: 12 },
  buttonText: { color: Colors.background, fontFamily: Fonts.semiBold, fontSize: 15 },
  disabled: { opacity: 0.45 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { color: Colors.primaryCyan, fontFamily: Fonts.medium, fontSize: 14 },
});
