import {
  TIER_WEIGHT,
  type CriterionLeaf,
  type CubeCell,
  type PairResult,
  type Patient,
} from "@/src/contracts";

/**
 * Which pair to alert on: not eliminated, at least one UNKNOWN. Fewest unknowns first
 * (one open question is the strongest alert), then highest expected value, then cheapest.
 * This orders work to surface; it never changes a verdict.
 */
export function pickAlertPair(cube: PairResult[]): PairResult | undefined {
  return cube
    .filter((p) => !p.eliminated && p.unknownCount > 0)
    .sort(
      (a, b) =>
        a.unknownCount - b.unknownCount ||
        b.expectedValue - a.expectedValue ||
        a.resolutionCost - b.resolutionCost ||
        a.patientId.localeCompare(b.patientId) ||
        a.nctId.localeCompare(b.nctId),
    )[0];
}

/** The single unknown worth resolving first: best pFavorable per unit of tier cost. */
export function blockingUnknown(pair: PairResult): CubeCell | undefined {
  const score = (c: CubeCell) => (c.pFavorable ?? 0) / TIER_WEIGHT[c.tier];
  return pair.cells
    .filter((c) => c.verdict === "UNKNOWN")
    .sort(
      (a, b) => score(b) - score(a) || a.tier - b.tier || a.criterionId.localeCompare(b.criterionId),
    )[0];
}

export type Order = {
  title: string;
  detail: string;
};

const LAB_ORDER: Record<string, string> = {
  anc: "CBC with differential",
  hemoglobin: "CBC with differential",
  platelets: "CBC with differential",
  creatinine: "Basic metabolic panel",
  "creatinine clearance": "Basic metabolic panel",
  albumin: "Comprehensive metabolic panel",
  bilirubin: "Hepatic function panel",
  alt: "Hepatic function panel",
  ast: "Hepatic function panel",
  qtc: "12-lead ECG",
};

/** Most recent fact that could host a tier-0 test on an existing specimen. */
function archivedSpecimen(patient: Patient): string | undefined {
  return patient.facts
    .filter((f) => f.predicate === "diagnosis" || f.predicate === "biomarker")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]?.sourceDoc;
}

/** Deterministic lookup from criterion to the order that would resolve it. */
export function orderFor(leaf: CriterionLeaf, cell: CubeCell, patient: Patient): Order {
  const analyte = leaf.analyte ?? "";
  const within = leaf.maxAgeDays ? ` Must be dated within ${leaf.maxAgeDays} days of enrollment.` : "";

  switch (leaf.predicate) {
    case "biomarker": {
      const specimen = cell.tier === 0 ? archivedSpecimen(patient) : undefined;
      return {
        title: `${analyte || "Biomarker"} mutation testing${specimen ? " on archived tissue" : ""}`,
        detail: specimen
          ? `Reflex NGS on the existing specimen from ${specimen}. No new biopsy needed.`
          : `Send tissue or plasma for ${analyte || "biomarker"} testing.`,
      };
    }
    case "age":
      return {
        title: "Confirm date of birth in the record",
        detail: `Chart review of structured age.${within}`,
      };
    case "diagnosis":
      return {
        title: "Confirm diagnosis in the chart",
        detail: `Review the problem list against “${leaf.sourceSpan}”.${within}`,
      };
    case "comorbidity":
      return {
        title: `Document ${analyte || "this history"} in the chart`,
        detail: `Chart review or a direct question at the next visit.${within}`,
      };
    case "prior_therapy":
      return {
        title: "Reconcile prior therapy in the chart",
        detail: `Medication history against “${leaf.sourceSpan}”.${within}`,
      };
    case "contraindication":
      return {
        title: "Review this contraindication in the chart",
        detail: `History against “${leaf.sourceSpan}”.${within}`,
      };
    case "performance_status":
      return {
        title: `Document ${analyte || "performance status"} at the next visit`,
        detail: `In-clinic assessment, no draw or imaging.${within}`,
      };
    case "lab_value": {
      const panel = LAB_ORDER[analyte.toLowerCase()] ?? `${analyte || "Laboratory"} test`;
      return { title: panel, detail: `Repeat ${analyte || "lab"} to resolve this criterion.${within}` };
    }
    case "staging":
      return {
        title: "Restaging CT chest, abdomen and pelvis",
        detail: `Imaging to confirm stage.${within}`,
      };
    case "washout":
      return {
        title: "No order — wait out the washout",
        detail: "Time-bound. This resolves by date, not by a test.",
      };
    default:
      return {
        title: `Clarify ${analyte || leaf.predicate.replace("_", " ")} in the record`,
        detail: `Chart review or a direct question at the next visit.${within}`,
      };
  }
}

/** True only when the suggested order is about the same fact as the blocking leaf. */
export function orderCorresponds(leaf: CriterionLeaf, cell: CubeCell, order: Order): boolean {
  if (cell.criterionCitation && leaf.sourceSpan && cell.criterionCitation !== leaf.sourceSpan) return false;
  const title = order.title.toLowerCase();
  const analyte = (leaf.analyte ?? "").toLowerCase();
  switch (leaf.predicate) {
    case "age":
      return /\b(age|date of birth|dob)\b/.test(title);
    case "diagnosis":
      return /diagnos|histolog|cytolog|condition|problem list/.test(title) && !/\bage\b/.test(title);
    case "biomarker":
      return (analyte.length > 0 && title.includes(analyte)) || /mutation|biomarker|ngs|tissue/.test(title);
    case "performance_status":
      return /ecog|performance|visit/.test(title);
    case "lab_value": {
      const panel = LAB_ORDER[analyte];
      return Boolean((panel && title.includes(panel.toLowerCase().split(" ")[0])) || (analyte && title.includes(analyte)));
    }
    case "staging":
      return /ct |imaging|stag/.test(title);
    case "washout":
      return /washout|wait/.test(title);
    case "prior_therapy":
      return /therap|prior|medicat|reconcile/.test(title) && !/\bage\b/.test(title);
    case "comorbidity":
      return /comorbid|document|history|chart/.test(title) && !/\bage\b/.test(title);
    case "contraindication":
      return /contraindic|review|chart/.test(title) && !/\bage\b/.test(title);
    default:
      return false;
  }
}
