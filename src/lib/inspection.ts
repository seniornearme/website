// Tiers for the Inspection Record Score (see /about-our-data#inspection-score).
export type ScoreTier = {
  label: string;
  chip: string; // tailwind classes for badge
  dot: string;  // small indicator color
};

export function scoreTier(score: number): ScoreTier {
  if (score >= 90)
    return {
      label: "Strong record",
      chip: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
      dot: "#16a34a",
    };
  if (score >= 70)
    return {
      label: "Minor issues",
      chip: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      dot: "#71717a",
    };
  if (score >= 50)
    return {
      label: "Mixed record",
      chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
      dot: "#d97706",
    };
  return {
    label: "Significant citations",
    chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    dot: "#dc2626",
  };
}
