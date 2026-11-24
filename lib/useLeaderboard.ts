import { useEffect, useRef, useState } from "react";
import type { LeaderboardProfile } from "./supabase";

type Metric = "current_streak" | "longest_streak";

// Cloud availability must never masquerade as an empty public leaderboard.
// Ignore old responses after a metric change, retry, timeout or unmount.
export function useLeaderboard(metric: Metric, fetchRows: (metric: Metric) => Promise<LeaderboardProfile[]>) {
  const fetchRef = useRef(fetchRows);
  useEffect(() => { fetchRef.current = fetchRows; }, [fetchRows]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ profiles: LeaderboardProfile[]; loading: boolean; failed: boolean }>({
    profiles: [], loading: true, failed: false,
  });
  useEffect(() => {
    let active = true;
    setState({ profiles: [], loading: true, failed: false });
    const timeout = setTimeout(() => {
      if (!active) return;
      active = false;
      setState({ profiles: [], loading: false, failed: true });
    }, 20_000);
    void Promise.resolve().then(() => fetchRef.current(metric)).then(profiles => {
      if (active) setState({ profiles, loading: false, failed: false });
    }, () => {
      if (active) setState({ profiles: [], loading: false, failed: true });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, [metric, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
