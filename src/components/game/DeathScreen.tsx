import { motion } from "motion/react";
import { Award, RotateCcw } from "lucide-react";
import { netWorth } from "../../game/engine";
import type { Character } from "../../game/types";
import { formatMoney } from "../../game/util";

export function DeathScreen({
  character,
  onRestart,
}: {
  character: Character;
  onRestart: () => void;
}) {
  const nw = netWorth(character);
  const avgStats = Math.round(
    (character.stats.happiness +
      character.stats.health +
      character.stats.smarts +
      character.stats.looks) /
      4,
  );
  const legacy = Math.round(
    Math.min(100, Math.max(0, nw / 100000)) * 0.4 +
      avgStats * 0.4 +
      character.age * 0.2 +
      character.fame * 0.1,
  );

  const stats = [
    { label: "Age at death", value: `${character.age}` },
    { label: "Net worth", value: formatMoney(nw) },
    { label: "Career", value: character.job?.title ?? "None" },
    {
      label: "Education",
      value: character.education === "graduated" ? (character.major ?? "Degree") : "None",
    },
    { label: "Well-being", value: `${avgStats}/100` },
    { label: "Cause of death", value: character.causeOfDeath ?? "Unknown" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="glass-strong w-full max-w-md rounded-3xl p-8 text-center"
      >
        <div className="mb-2 text-5xl">🕯️</div>
        <h1 className="text-3xl font-bold">{character.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rest in peace</p>

        <div className="my-6 rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Award className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Legacy Score</span>
          </div>
          <div className="mt-1 text-5xl font-bold text-gradient">{legacy}</div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-left">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/5 p-3">
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className="truncate text-sm font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onRestart}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground transition hover:brightness-105 active:scale-[0.98]"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          <RotateCcw className="h-4 w-4" /> Start a New Life
        </button>
      </motion.div>
    </div>
  );
}
