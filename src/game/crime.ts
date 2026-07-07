import { FIRST_NAMES_POOL, POLITICIAN_SURNAMES } from "./politicsData";
import type {
  BizEvent,
  Character,
  CrewMember,
  CrimeRank,
  CrimeState,
  LogEntry,
  LogTone,
  PrisonState,
} from "./types";
import { clamp, randInt, randItem, uid } from "./util";

// ---------------------------------------------------------------------------
// Crime path (Build 12). Design: risk/reward — a careful criminal who manages
// heat, builds a loyal crew and launders through legitimate businesses can
// genuinely win; a sloppy one eats trials, prison years and betrayal. All
// abstract game mechanics, fictional and consequence-driven.
// ---------------------------------------------------------------------------

export interface CrimeResult {
  character: Character;
  message: string;
  tone: LogTone;
  ok: boolean;
}

const fail = (input: Character, message: string): CrimeResult => ({
  character: input,
  message,
  tone: "bad",
  ok: false,
});

type Spend = (c: Character) => boolean;

export function ensureCrime(c: Character): CrimeState {
  if (!c.crime)
    c.crime = {
      active: false,
      notoriety: 0,
      heat: 0,
      dirtyMoney: 0,
      crew: [],
      rackets: 0,
      crimesCommitted: 0,
      timesCaught: 0,
      totalYearsServed: 0,
      informant: false,
      leftTheLife: false,
    };
  return c.crime;
}

export const RANKS: { id: CrimeRank; label: string; minNotoriety: number }[] = [
  { id: "petty", label: "Street Hustler", minNotoriety: 0 },
  { id: "associate", label: "Associate", minNotoriety: 25 },
  { id: "soldier", label: "Soldier", minNotoriety: 40 },
  { id: "capo", label: "Capo", minNotoriety: 60 },
  { id: "underboss", label: "Underboss", minNotoriety: 78 },
  { id: "boss", label: "Boss", minNotoriety: 92 },
];

export function rankLabel(rank?: CrimeRank): string {
  return RANKS.find((r) => r.id === rank)?.label ?? "Civilian";
}

const SYNDICATES = [
  "Moretti Family",
  "Volkov Bratva",
  "Red Lantern Triad",
  "Costa Cartel",
  "Kessler Ring",
];

// ---------- Crimes ----------

export interface CrimeJobDef {
  id: string;
  label: string;
  minAge: number;
  minNotoriety: number;
  needsSyndicate: boolean;
  needsCrew: number; // crew members required
  payout: [number, number];
  heat: [number, number];
  catchBase: number; // % base chance of being caught on failure paths
  severity: number; // 1-10 sentencing weight
  notoriety: [number, number];
}

export const CRIME_JOBS: CrimeJobDef[] = [
  {
    id: "pickpocket",
    label: "Pickpocketing",
    minAge: 16,
    minNotoriety: 0,
    needsSyndicate: false,
    needsCrew: 0,
    payout: [50, 400],
    heat: [1, 3],
    catchBase: 18,
    severity: 1,
    notoriety: [1, 2],
  },
  {
    id: "shoplift",
    label: "Shoplifting Ring",
    minAge: 16,
    minNotoriety: 0,
    needsSyndicate: false,
    needsCrew: 0,
    payout: [200, 900],
    heat: [2, 4],
    catchBase: 20,
    severity: 1,
    notoriety: [1, 3],
  },
  {
    id: "scam",
    label: "Online Scam",
    minAge: 16,
    minNotoriety: 5,
    needsSyndicate: false,
    needsCrew: 0,
    payout: [800, 4000],
    heat: [2, 5],
    catchBase: 15,
    severity: 2,
    notoriety: [1, 3],
  },
  {
    id: "cartheft",
    label: "Car Theft",
    minAge: 18,
    minNotoriety: 12,
    needsSyndicate: false,
    needsCrew: 0,
    payout: [3000, 12000],
    heat: [4, 8],
    catchBase: 25,
    severity: 3,
    notoriety: [2, 5],
  },
  {
    id: "burglary",
    label: "Burglary",
    minAge: 18,
    minNotoriety: 15,
    needsSyndicate: false,
    needsCrew: 0,
    payout: [4000, 20000],
    heat: [5, 9],
    catchBase: 26,
    severity: 3,
    notoriety: [2, 5],
  },
  {
    id: "fraud",
    label: "Corporate Fraud",
    minAge: 21,
    minNotoriety: 20,
    needsSyndicate: false,
    needsCrew: 0,
    payout: [15000, 80000],
    heat: [6, 10],
    catchBase: 22,
    severity: 4,
    notoriety: [3, 6],
  },
  {
    id: "hijack",
    label: "Truck Hijacking",
    minAge: 18,
    minNotoriety: 30,
    needsSyndicate: true,
    needsCrew: 1,
    payout: [25000, 90000],
    heat: [8, 14],
    catchBase: 28,
    severity: 5,
    notoriety: [3, 7],
  },
  {
    id: "extortion",
    label: "Extortion Round",
    minAge: 18,
    minNotoriety: 35,
    needsSyndicate: true,
    needsCrew: 1,
    payout: [20000, 60000],
    heat: [6, 12],
    catchBase: 22,
    severity: 5,
    notoriety: [2, 6],
  },
  {
    id: "jewelry",
    label: "Jewelry Store Heist",
    minAge: 21,
    minNotoriety: 45,
    needsSyndicate: true,
    needsCrew: 2,
    payout: [80000, 300000],
    heat: [14, 22],
    catchBase: 34,
    severity: 7,
    notoriety: [5, 10],
  },
  {
    id: "bank",
    label: "Bank Job",
    minAge: 21,
    minNotoriety: 60,
    needsSyndicate: true,
    needsCrew: 3,
    payout: [200000, 900000],
    heat: [20, 30],
    catchBase: 40,
    severity: 9,
    notoriety: [8, 14],
  },
  {
    id: "vault",
    label: "The Big Score (casino vault)",
    minAge: 25,
    minNotoriety: 75,
    needsSyndicate: true,
    needsCrew: 4,
    payout: [800000, 3000000],
    heat: [28, 40],
    catchBase: 45,
    severity: 10,
    notoriety: [12, 20],
  },
];

function crewQuality(cr: CrimeState): number {
  if (!cr.crew.length) return 0;
  return cr.crew.reduce((s, m) => s + m.skill, 0) / cr.crew.length;
}

/** Success chance 5–95: smarts + crew + notoriety vs heat and job difficulty. */
export function jobSuccessChance(c: Character, job: CrimeJobDef): number {
  const cr = c.crime ?? ensureCrime(structuredClone(c));
  let chance = 55;
  chance += (c.stats.smarts - 50) * 0.4;
  chance += cr.notoriety * 0.15;
  chance += crewQuality(cr) * 0.2 * Math.min(1, job.needsCrew);
  chance -= cr.heat * 0.35; // hot criminals get watched
  chance -= job.severity * 2.5;
  return clamp(Math.round(chance), 5, 95);
}

export function commitCrime(input: Character, jobId: string, spend: Spend): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  const job = CRIME_JOBS.find((j) => j.id === jobId);
  if (!job) return fail(input, "Unknown job.");
  if (cr.prison) return fail(input, "You're behind bars. Crime out here can wait.");
  if (cr.trial) return fail(input, "You're awaiting trial — lay low.");
  if (c.age < job.minAge) return fail(input, `Too young for that (${job.minAge}+).`);
  if (cr.notoriety < job.minNotoriety)
    return fail(input, `Nobody trusts you with that yet (needs ${job.minNotoriety} notoriety).`);
  if (job.needsSyndicate && !cr.syndicate)
    return fail(input, "That's syndicate work. Get connected first.");
  if (cr.crew.length < job.needsCrew)
    return fail(input, `You need a crew of ${job.needsCrew} for that.`);
  if (!spend(c)) return fail(input, "No energy left this year. Age up first.");

  cr.active = true;
  cr.leftTheLife = false;
  if (!cr.rank) cr.rank = "petty";
  cr.crimesCommitted += 1;

  const chance = jobSuccessChance(c, job);
  const roll = randInt(1, 100);

  if (roll <= chance) {
    const take = randInt(job.payout[0], job.payout[1]);
    const cut = cr.syndicate && job.needsSyndicate ? 0.7 : 1; // the family takes its slice
    const yours = Math.round(take * cut);
    cr.dirtyMoney += yours;
    cr.heat = clamp(cr.heat + randInt(job.heat[0], job.heat[1]));
    cr.notoriety = clamp(cr.notoriety + randInt(job.notoriety[0], job.notoriety[1]));
    maybePromote(c, cr);
    const msg = `${job.label} went clean: $${yours.toLocaleString()} in dirty money.${cut < 1 ? " The family took its cut." : ""}`;
    c.log.push({ age: c.age, text: msg, tone: "good" });
    return { character: c, message: msg, tone: "good", ok: true };
  }

  // Failed — did you get away?
  const caught = randInt(1, 100) <= job.catchBase + cr.heat * 0.3;
  cr.heat = clamp(cr.heat + randInt(job.heat[0], job.heat[1]) + 4);
  if (!caught) {
    const msg = `The ${job.label.toLowerCase()} fell apart — you got out empty-handed, heart pounding.`;
    c.log.push({ age: c.age, text: msg, tone: "bad" });
    return { character: c, message: msg, tone: "bad", ok: true };
  }
  cr.timesCaught += 1;
  const evidence = clamp(45 + randInt(0, 30) + cr.heat * 0.2, 20, 95);
  cr.trial = {
    charge: job.label,
    severity: job.severity,
    evidence: Math.round(evidence),
    offeredPleaYears: Math.max(1, Math.round(job.severity * 0.5)),
  };
  const msg = `Busted mid-${job.label.toLowerCase()}! You're charged and awaiting trial.`;
  c.log.push({ age: c.age, text: msg, tone: "bad" });
  return { character: c, message: msg, tone: "bad", ok: true };
}

function maybePromote(c: Character, cr: CrimeState) {
  if (!cr.syndicate || !cr.rank) return;
  const idx = RANKS.findIndex((r) => r.id === cr.rank);
  const next = RANKS[idx + 1];
  if (next && cr.notoriety >= next.minNotoriety && Math.random() < 0.5) {
    cr.rank = next.id;
    c.log.push({
      age: c.age,
      text: `The ${cr.syndicate} made you ${next.label}.`,
      tone: "milestone",
    });
    c.fame += next.id === "boss" ? 5 : 1;
  }
}

// ---------- Syndicate & crew ----------

export function joinSyndicate(input: Character, spend: Spend): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  if (cr.syndicate) return fail(input, `You already answer to the ${cr.syndicate}.`);
  if (cr.prison) return fail(input, "Not from inside. (Though the yard has its own recruiters...)");
  if (c.age < 18) return fail(input, "The families don't take minors.");
  const connected = c.contacts?.some((x) => x.type === "lawyer" || x.type === "wealthy") ?? false;
  if (cr.notoriety < 20 && !connected)
    return fail(
      input,
      "Nobody vouches for you yet. Build 20 notoriety on the street, or know the right people.",
    );
  if (!spend(c)) return fail(input, "No energy left this year. Age up first.");
  cr.syndicate = randItem(SYNDICATES);
  cr.active = true;
  cr.rank = cr.rank && RANKS.findIndex((r) => r.id === cr.rank) > 0 ? cr.rank : "associate";
  cr.notoriety = clamp(cr.notoriety + 5);
  const msg = `You were brought into the ${cr.syndicate} as an ${rankLabel(cr.rank)}. There's no HR department here.`;
  c.log.push({ age: c.age, text: msg, tone: "milestone" });
  return { character: c, message: msg, tone: "milestone", ok: true };
}

export function recruitCrew(input: Character, spend: Spend): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  if (cr.prison) return fail(input, "You're inside.");
  if (cr.crew.length >= 5) return fail(input, "Five is a crew. Six is a liability.");
  if (cr.notoriety < 15) return fail(input, "Nobody follows an unknown (needs 15 notoriety).");
  if (!spend(c)) return fail(input, "No energy left this year. Age up first.");
  const member: CrewMember = {
    id: uid(),
    name: `${randItem(FIRST_NAMES_POOL)} "${randItem(["Ghost", "Wrench", "Ace", "Smokes", "Tiny", "Preacher", "Doc", "Blackjack"])}" ${randItem(POLITICIAN_SURNAMES)}`,
    role: randItem(["driver", "muscle", "safecracker", "lookout", "fixer"]),
    skill: randInt(30, 90),
    loyalty: randInt(40, 85),
  };
  cr.crew.push(member);
  const msg = `${member.name} (${member.role}) joined your crew.`;
  c.log.push({ age: c.age, text: msg, tone: "good" });
  return { character: c, message: msg, tone: "good", ok: true };
}

export function startRacket(input: Character, spend: Spend): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  if (cr.prison) return fail(input, "You're inside.");
  if (!cr.syndicate) return fail(input, "Rackets need the syndicate's blessing.");
  if (cr.notoriety < 40) return fail(input, "Territory goes to earners (needs 40 notoriety).");
  if (cr.rackets >= 5) return fail(input, "Five rackets is an empire already.");
  if (cr.dirtyMoney + c.money < 30000)
    return fail(input, "Setting up a racket takes $30,000 seed money.");
  if (!spend(c)) return fail(input, "No energy left this year. Age up first.");
  const fromDirty = Math.min(cr.dirtyMoney, 30000);
  cr.dirtyMoney -= fromDirty;
  c.money -= 30000 - fromDirty;
  cr.rackets += 1;
  const msg = `You set up racket #${cr.rackets}. It'll kick up dirty money every year — and draw heat.`;
  c.log.push({ age: c.age, text: msg, tone: "milestone" });
  return { character: c, message: msg, tone: "milestone", ok: true };
}

export function layLow(input: Character, spend: Spend): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  if (cr.prison) return fail(input, "You're already as low as it gets.");
  if (!spend(c)) return fail(input, "No energy left this year. Age up first.");
  const drop = randInt(10, 20);
  cr.heat = clamp(cr.heat - drop);
  const msg = `You laid low all year: no jobs, no noise. Heat −${drop}.`;
  c.log.push({ age: c.age, text: msg, tone: "neutral" });
  return { character: c, message: msg, tone: "neutral", ok: true };
}

export function leaveTheLife(input: Character): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  if (cr.prison) return fail(input, "Serve your time first.");
  if (!cr.active) return fail(input, "You're already a civilian.");
  const hadSyndicate = !!cr.syndicate;
  cr.syndicate = undefined;
  cr.rank = undefined;
  cr.crew = [];
  cr.rackets = 0;
  cr.active = false;
  cr.leftTheLife = true;
  let msg =
    "You walked away from the life. The money stops; the looking over your shoulder doesn't, yet.";
  if (hadSyndicate && Math.random() < 0.4) {
    cr.heat = clamp(cr.heat + 10);
    msg += " Word is the family isn't thrilled about loose ends.";
  }
  c.log.push({ age: c.age, text: msg, tone: "neutral" });
  return { character: c, message: msg, tone: "neutral", ok: true };
}

// ---------- Dirty money ----------

/** Launder through one of your own businesses: 85% comes out clean. */
export function launderThroughBusiness(
  input: Character,
  bizId: string,
  amount: number,
): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  const biz = c.businessHub?.businesses.find((b) => b.id === bizId);
  if (!biz) return fail(input, "You need a legitimate business to wash money through.");
  const amt = Math.min(amount, cr.dirtyMoney);
  if (amt < 1000) return fail(input, "Not enough dirty money to bother.");
  const cap = Math.max(20000, biz.revenue * 0.5);
  if (amt > cap)
    return fail(
      input,
      `${biz.name} can only plausibly absorb $${Math.round(cap).toLocaleString()} a year.`,
    );
  cr.dirtyMoney -= amt;
  const cleaned = Math.round(amt * 0.85);
  biz.cash += cleaned;
  cr.heat = clamp(cr.heat + Math.round(amt / 40000));
  const msg = `$${amt.toLocaleString()} went through ${biz.name}'s books; $${cleaned.toLocaleString()} came out clean as business cash.`;
  c.log.push({ age: c.age, text: msg, tone: "neutral" });
  return { character: c, message: msg, tone: "neutral", ok: true };
}

/** Spend dirty money directly — fast, lossy, and hot. */
export function spendDirty(input: Character, amount: number): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  const amt = Math.min(amount, cr.dirtyMoney);
  if (amt < 100) return fail(input, "Nothing to spend.");
  cr.dirtyMoney -= amt;
  c.money += Math.round(amt * 0.7);
  cr.heat = clamp(cr.heat + Math.max(1, Math.round(amt / 15000)));
  const msg = `You moved $${amt.toLocaleString()} of dirty cash into your pocket at 70 cents on the dollar. Flashy spending gets noticed.`;
  c.log.push({ age: c.age, text: msg, tone: "neutral" });
  return { character: c, message: msg, tone: "neutral", ok: true };
}

// ---------- Trial ----------

export function trialConvictionChance(c: Character, hasLawyerHelp: boolean): number {
  const t = c.crime?.trial;
  if (!t) return 0;
  let chance = t.evidence;
  chance -= (c.stats.smarts - 50) * 0.15;
  if (hasLawyerHelp) chance -= 22;
  if (c.criminalRecord > 0) chance += c.criminalRecord * 4;
  return clamp(Math.round(chance), 5, 95);
}

export function resolveTrial(input: Character, choice: "fight" | "plea" | "inform"): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  const t = cr.trial;
  if (!t) return fail(input, "No trial pending.");

  const lawyer = c.contacts?.find((x) => x.type === "lawyer" && x.relationship >= 50);
  const canPayLawyer = c.money >= 25000;

  if (choice === "inform") {
    if (!cr.syndicate) return fail(input, "You have nobody to inform on.");
    cr.trial = undefined;
    cr.informant = true;
    const family = cr.syndicate;
    cr.syndicate = undefined;
    cr.rank = undefined;
    cr.rackets = 0;
    cr.crew = [];
    c.criminalRecord += 1;
    const msg = `You flipped on the ${family}. Charges reduced to time served — and a target painted on your back.`;
    c.log.push({ age: c.age, text: msg, tone: "neutral" });
    return { character: c, message: msg, tone: "neutral", ok: true };
  }

  if (choice === "plea") {
    cr.trial = undefined;
    c.criminalRecord += 1;
    sendToPrison(c, cr, t.offeredPleaYears, t.severity);
    const msg = `You took the plea: ${t.offeredPleaYears} year${t.offeredPleaYears > 1 ? "s" : ""}. Predictable beats catastrophic.`;
    c.log.push({ age: c.age, text: msg, tone: "bad" });
    return { character: c, message: msg, tone: "bad", ok: true };
  }

  // Fight it
  const useLawyer = !!lawyer || canPayLawyer;
  if (!lawyer && canPayLawyer) c.money -= 25000;
  const convicted = randInt(1, 100) <= trialConvictionChance(c, useLawyer);
  cr.trial = undefined;
  if (!convicted) {
    cr.heat = clamp(cr.heat - 5);
    const msg = `NOT GUILTY. ${useLawyer ? "Your lawyer shredded the case" : "You defended yourself and the evidence crumbled"}. You walked out the front door.`;
    c.log.push({ age: c.age, text: msg, tone: "milestone" });
    return { character: c, message: msg, tone: "milestone", ok: true };
  }
  c.criminalRecord += 1;
  const years = Math.max(1, Math.round(t.severity * (0.8 + randInt(0, 60) / 100)));
  sendToPrison(c, cr, years, t.severity);
  const msg = `GUILTY. The judge handed down ${years} year${years > 1 ? "s" : ""}. The gamble failed.`;
  c.log.push({ age: c.age, text: msg, tone: "bad" });
  return { character: c, message: msg, tone: "bad", ok: true };
}

// ---------- Prison ----------

const FACILITIES = ["Blackgate", "Iron Ridge", "Meadowbrook", "Fort Sanders", "Cold Harbor"];

function sendToPrison(c: Character, cr: CrimeState, years: number, severity: number) {
  const security: PrisonState["security"] =
    c.age < 18 ? "juvenile" : severity >= 8 ? "maximum" : severity >= 5 ? "medium" : "minimum";
  const sentence = c.age < 18 ? Math.min(years, 2) : years;
  cr.prison = {
    facility: `${randItem(FACILITIES)} ${security === "juvenile" ? "Juvenile Center" : "Correctional"}`,
    security,
    sentence,
    yearsServed: 0,
    respect: clamp(10 + cr.notoriety / 3),
    behavior: 60,
    gangAffiliated: false,
    paroleHearingsFailed: 0,
  };
  // The outside world doesn't wait.
  if (c.job) {
    c.log.push({
      age: c.age,
      text: `You were fired from ${c.job.company} the day of your conviction.`,
      tone: "bad",
    });
    c.job = undefined;
  }
  if (c.politics?.office) {
    c.log.push({
      age: c.age,
      text: `You were removed from office as ${c.politics.office.name} in disgrace.`,
      tone: "bad",
    });
    c.politics.office = undefined;
    c.politics.cabinet = [];
    c.politics.approval = clamp(c.politics.approval - 25);
    c.politics.publicTrust = clamp(c.politics.publicTrust - 30);
  }
  if (c.politics?.campaign) {
    c.politics.campaign = undefined;
    c.log.push({ age: c.age, text: "Your campaign collapsed with the conviction.", tone: "bad" });
  }
}

export type PrisonAction = "behave" | "workout" | "study" | "joinGang" | "respect" | "escape";

export function prisonAction(input: Character, action: PrisonAction, spend: Spend): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  const p = cr.prison;
  if (!p) return fail(input, "You're not in prison.");
  if (!spend(c)) return fail(input, "No energy left this year. Age up first.");

  switch (action) {
    case "behave": {
      const gain = randInt(8, 15);
      p.behavior = clamp(p.behavior + gain);
      p.respect = clamp(p.respect - randInt(0, 3));
      const msg = `A quiet year: work detail, no trouble. Behavior +${gain}.`;
      c.log.push({ age: c.age, text: msg, tone: "good" });
      return { character: c, message: msg, tone: "good", ok: true };
    }
    case "workout": {
      c.stats.health = clamp(c.stats.health + randInt(3, 6));
      p.respect = clamp(p.respect + randInt(4, 8));
      const msg = "The yard weights became your religion. Health and respect up.";
      c.log.push({ age: c.age, text: msg, tone: "good" });
      return { character: c, message: msg, tone: "good", ok: true };
    }
    case "study": {
      c.stats.smarts = clamp(c.stats.smarts + randInt(2, 5));
      p.behavior = clamp(p.behavior + randInt(4, 8));
      const msg = "You spent the year in the prison library and classes. Smarts and behavior up.";
      c.log.push({ age: c.age, text: msg, tone: "good" });
      return { character: c, message: msg, tone: "good", ok: true };
    }
    case "joinGang": {
      if (p.gangAffiliated) return fail(input, "You're already affiliated.");
      p.gangAffiliated = true;
      p.respect = clamp(p.respect + randInt(15, 25));
      p.behavior = clamp(p.behavior - randInt(10, 18));
      cr.notoriety = clamp(cr.notoriety + randInt(3, 6));
      const msg = "You took the patch. Protected now — and marked forever in the system.";
      c.log.push({ age: c.age, text: msg, tone: "neutral" });
      return { character: c, message: msg, tone: "neutral", ok: true };
    }
    case "respect": {
      const won = randInt(1, 100) <= 40 + c.stats.health * 0.3 + p.respect * 0.2;
      if (won) {
        p.respect = clamp(p.respect + randInt(10, 18));
        const msg = "You stood your ground in the yard. Nobody tests you now.";
        c.log.push({ age: c.age, text: msg, tone: "good" });
        return { character: c, message: msg, tone: "good", ok: true };
      }
      c.stats.health = clamp(c.stats.health - randInt(5, 12));
      p.behavior = clamp(p.behavior - randInt(5, 10));
      const msg = "The fight went badly. Infirmary, then solitary.";
      c.log.push({ age: c.age, text: msg, tone: "bad" });
      return { character: c, message: msg, tone: "bad", ok: true };
    }
    case "escape": {
      const chance = clamp(
        18 +
          c.stats.smarts * 0.15 +
          (p.security === "minimum" ? 15 : p.security === "medium" ? 0 : -10),
        3,
        45,
      );
      if (randInt(1, 100) <= chance) {
        cr.prison = undefined;
        cr.heat = 100;
        cr.notoriety = clamp(cr.notoriety + 15);
        const msg =
          "YOU'RE OUT. Over the wire, into legend — every cop in the state has your face.";
        c.log.push({ age: c.age, text: msg, tone: "milestone" });
        return { character: c, message: msg, tone: "milestone", ok: true };
      }
      p.behavior = clamp(p.behavior - 30);
      p.sentence += 2;
      const msg = "Caught at the fence. Two years added, privileges gone.";
      c.log.push({ age: c.age, text: msg, tone: "bad" });
      return { character: c, message: msg, tone: "bad", ok: true };
    }
  }
}

export function requestParole(input: Character): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  const p = cr.prison;
  if (!p) return fail(input, "You're not in prison.");
  if (p.yearsServed < Math.ceil(p.sentence / 2))
    return fail(
      input,
      `Parole eligibility starts at half your sentence (${Math.ceil(p.sentence / 2)} yr).`,
    );
  const chance = clamp(
    20 + p.behavior * 0.5 - p.paroleHearingsFailed * 8 - (p.gangAffiliated ? 15 : 0),
    5,
    85,
  );
  if (randInt(1, 100) <= chance) {
    release(c, cr, "paroled");
    const msg = "The board granted parole. You walked out early — stay clean, they said.";
    c.log.push({ age: c.age, text: msg, tone: "milestone" });
    return { character: c, message: msg, tone: "milestone", ok: true };
  }
  p.paroleHearingsFailed += 1;
  const msg = "Parole denied. The board wasn't convinced.";
  c.log.push({ age: c.age, text: msg, tone: "bad" });
  return { character: c, message: msg, tone: "bad", ok: true };
}

function release(c: Character, cr: CrimeState, how: string) {
  cr.totalYearsServed += cr.prison?.yearsServed ?? 0;
  cr.prison = undefined;
  cr.heat = clamp(cr.heat - 25);
}

// ---------- Dramatic events ----------

function crimeEvent(cr: CrimeState, c: Character): BizEvent | null {
  const pool: BizEvent[] = [];
  if (cr.syndicate) {
    pool.push({
      id: `betrayal-${uid()}`,
      title: "An Associate Is Talking",
      description: `Word inside the ${cr.syndicate}: someone close to you has been meeting with detectives.`,
      options: [
        {
          label: "Feed them false information and expose them",
          text: "The rat surfaced chasing your bait. The family handled it; you kept your hands clean.",
          tone: "good",
        },
        {
          label: "Confront them directly",
          text: "They panicked and skipped town. The leak is plugged, messily.",
          tone: "neutral",
        },
        {
          label: "Go to the boss and let him decide",
          text: "You kicked it upstairs. The boss noted your loyalty — and your lack of initiative.",
          tone: "neutral",
        },
      ],
    });
    pool.push({
      id: `rival-${uid()}`,
      title: "Rivals Threaten Your Family",
      description:
        "A rival organization sent a message through your family: photos of your relatives, taken from close range.",
      options: [
        {
          label: "Go to the police",
          text: "Protection was arranged quietly. The syndicate saw it as weakness; your family slept safely.",
          tone: "neutral",
        },
        {
          label: "Pay for their silence",
          text: "Money bought peace, this time. Extortion never retires.",
          tone: "bad",
        },
        {
          label: "Hire private security",
          text: "Professionals now shadow your family. Expensive, effective.",
          tone: "neutral",
        },
        {
          label: "Use your connections to negotiate a truce",
          text: "Cooler heads met in a diner at 2am. The truce held.",
          tone: "good",
        },
      ],
    });
  }
  pool.push({
    id: `investigation-${uid()}`,
    title: "Detectives Are Circling",
    description:
      "An unmarked car has been outside your place for a week. A task force is building a file on you.",
    options: [
      {
        label: "Shred everything and go quiet",
        text: "By the time they came with warrants, there was nothing to find.",
        tone: "good",
      },
      { label: "Carry on as normal", text: "Bold. The file got thicker.", tone: "bad" },
      {
        label: "Have a lawyer send them a message",
        text: "The harassment complaints slowed them down — and confirmed you're worth watching.",
        tone: "neutral",
      },
    ],
  });
  return pool.length ? randItem(pool) : null;
}

export function resolveCrimeEvent(input: Character, optionIndex: number): CrimeResult {
  const c = structuredClone(input);
  const cr = ensureCrime(c);
  const ev = cr.pendingEvent;
  const opt = ev?.options[optionIndex];
  if (!ev || !opt) return fail(input, "No event pending.");
  cr.pendingEvent = undefined;

  // Effects are keyed off the event id + option semantics.
  if (ev.id.startsWith("betrayal")) {
    if (optionIndex === 0) cr.heat = clamp(cr.heat - 8);
    if (optionIndex === 1) cr.notoriety = clamp(cr.notoriety + 3);
    if (optionIndex === 2) cr.heat = clamp(cr.heat - 4);
  } else if (ev.id.startsWith("rival")) {
    if (optionIndex === 0) {
      cr.heat = clamp(cr.heat + 5);
      cr.notoriety = clamp(cr.notoriety - 5);
    }
    if (optionIndex === 1) {
      const cost = Math.min(c.money + cr.dirtyMoney, 50000);
      const fromDirty = Math.min(cr.dirtyMoney, cost);
      cr.dirtyMoney -= fromDirty;
      c.money -= cost - fromDirty;
    }
    if (optionIndex === 2) c.money -= Math.min(c.money, 25000);
    if (optionIndex === 3) cr.notoriety = clamp(cr.notoriety + 4);
  } else if (ev.id.startsWith("investigation")) {
    if (optionIndex === 0) cr.heat = clamp(cr.heat - 15);
    if (optionIndex === 1) cr.heat = clamp(cr.heat + 10);
    if (optionIndex === 2) cr.heat = clamp(cr.heat - 6);
  }
  c.log.push({ age: c.age, text: `${ev.title} — ${opt.text}`, tone: opt.tone });
  return { character: c, message: opt.text, tone: opt.tone, ok: true };
}

// ---------- Yearly ----------

export function advanceCrime(c: Character, log: LogEntry[]) {
  const cr = c.crime;
  if (!cr) return;

  // Prison years tick first.
  if (cr.prison) {
    const p = cr.prison;
    p.yearsServed += 1;
    c.stats.happiness = clamp(c.stats.happiness - randInt(3, 8));
    // Yard incidents.
    if (Math.random() < 0.3) {
      if (p.respect < 40 && Math.random() < 0.5) {
        c.stats.health = clamp(c.stats.health - randInt(4, 10));
        log.push({
          age: c.age,
          text: "You were jumped in the yard. Low respect makes you a target.",
          tone: "bad",
        });
      } else if (p.gangAffiliated && Math.random() < 0.4) {
        p.behavior = clamp(p.behavior - randInt(5, 12));
        log.push({
          age: c.age,
          text: "A gang war swept the block. You were confined with the rest of your patch.",
          tone: "bad",
        });
      } else {
        p.respect = clamp(p.respect + randInt(2, 5));
        log.push({
          age: c.age,
          text: "Another year inside. You know the rhythms of this place now.",
          tone: "neutral",
        });
      }
    }
    // Informants get found, even inside.
    if (cr.informant && Math.random() < 0.15) {
      c.stats.health = clamp(c.stats.health - randInt(10, 25));
      log.push({
        age: c.age,
        text: "Someone recognized you from the trial. The attack came fast; the guards came slow.",
        tone: "bad",
      });
    }
    if (p.yearsServed >= p.sentence) {
      release(c, cr, "served");
      log.push({
        age: c.age,
        text: `Released from ${p.facility} — sentence served. The gate closed behind you.`,
        tone: "milestone",
      });
    }
    return; // nothing else advances while inside
  }

  // Rackets pay, and burn.
  if (cr.rackets > 0) {
    const income = cr.rackets * randInt(15000, 40000);
    cr.dirtyMoney += income;
    cr.heat = clamp(cr.heat + cr.rackets * randInt(1, 3));
    log.push({
      age: c.age,
      text: `Your rackets kicked up $${income.toLocaleString()} in dirty money.`,
      tone: "neutral",
    });
  }

  // Heat cools if you're quiet; too hot triggers an investigation.
  cr.heat = clamp(cr.heat - randInt(3, 6));
  if (cr.heat >= 70 && Math.random() < 0.4 && !cr.trial) {
    const evidence = clamp(30 + cr.heat * 0.4 + randInt(-10, 10), 20, 90);
    cr.trial = {
      charge: "Racketeering investigation",
      severity: Math.min(9, 3 + Math.floor(cr.rackets / 2) + Math.floor(cr.notoriety / 25)),
      evidence: Math.round(evidence),
      offeredPleaYears: 2 + Math.floor(cr.rackets / 2),
    };
    log.push({
      age: c.age,
      text: "Dawn raid. A task force finally moved — you're charged and heading to trial.",
      tone: "bad",
    });
  }

  // Crew loyalty drifts; disloyal crew leak.
  for (const m of [...cr.crew]) {
    m.loyalty = clamp(m.loyalty + randInt(-4, 2));
    if (m.loyalty < 20) {
      cr.crew = cr.crew.filter((x) => x.id !== m.id);
      cr.heat = clamp(cr.heat + 8);
      log.push({
        age: c.age,
        text: `${m.name} vanished — and your heat jumped. Draw your own conclusions.`,
        tone: "bad",
      });
    }
  }

  // Informants live dangerous lives outside too.
  if (cr.informant && Math.random() < 0.1) {
    c.stats.health = clamp(c.stats.health - randInt(8, 20));
    log.push({
      age: c.age,
      text: "They found you. You survived the message; you won't forget it.",
      tone: "bad",
    });
  }

  // Dramatic events for active criminals.
  if (cr.active && !cr.pendingEvent && !cr.trial && Math.random() < 0.25) {
    const ev = crimeEvent(cr, c);
    if (ev) {
      cr.pendingEvent = ev;
      log.push({
        age: c.age,
        text: `${ev.title} — a decision is waiting in the Crime hub.`,
        tone: "neutral",
      });
    }
  }

  // Time heals reputations for those who left the life clean.
  if (cr.leftTheLife) {
    cr.notoriety = clamp(cr.notoriety - 3);
    cr.heat = clamp(cr.heat - 4);
  }
}

export function isInPrison(c: Character): boolean {
  return !!c.crime?.prison;
}
