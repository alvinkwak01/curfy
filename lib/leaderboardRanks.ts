import type { LeaderboardProfile } from "./supabase";

// Match the server's rank rule: one plus the number with a greater streak.
// Equal streaks share a rank, including ties across the compact-list boundary.
export function leaderboardRanks(profiles: LeaderboardProfile[], metric: "current_streak" | "longest_streak") {
  return new Map(profiles.map(profile => [profile.id,
    1 + profiles.filter(other => other[metric] > profile[metric]).length,
  ]));
}
