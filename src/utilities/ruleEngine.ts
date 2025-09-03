import stringSimilarity from "string-similarity";
import { AML_PEP_Rules } from "../config";
import { User } from "../entities/User.entity";

const rules = AML_PEP_Rules;

interface AML_PEP_User {
  id: string;
  name: string;
  type: string;
  DOB?: Date;
  source?: string;
  country?: string;
  reason: string;
  risk_level: string;
  position?: string | null;
}

interface MatchResult {
  type: string;
  risk: string;
  record: any;
  match: string;
  score?: number | null;
}

export function checkCompliance(
  user: User,
  dataset: AML_PEP_User[]
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const record of dataset) {
    const exactMatch = record.name.toLowerCase() === user.name.toLowerCase();
    const fuzzyScore = stringSimilarity.compareTwoStrings(
      user.name.toLowerCase(),
      record.name.toLowerCase()
    );
    const dobMatch = user.DOB && record.DOB && user.DOB === record.DOB;
    const countryMatch =
      user.country && record.country && user.country === record.country;

    // no match at all, skip record
    if (!exactMatch && fuzzyScore < 0.8) continue;

    // Rules
    for (const rule of rules) {
      const cond = rule.conditions;

      // Exact + DOB
      if (cond.name_match === "EXACT" && exactMatch && dobMatch) {
        results.push({
          type: record.type,
          risk: rule.risk_level,
          record,
          match: "EXACT",
          score: 1.0,
        });
      }

      // Fuzzy + Same country
      if (
        cond.name_match === "FUZZY" &&
        fuzzyScore >= cond.threshold! &&
        countryMatch
      ) {
        results.push({
          type: record.type,
          risk: rule.risk_level,
          record,
          match: "FUZZY",
          score: fuzzyScore,
        });
      }

      // SANCTION
      if (cond.type === "SANCTION" && record.type === "SANCTION") {
        results.push({
          type: record.type,
          risk: rule.risk_level,
          record,
          match: "SANCTION_LIST",
          score: exactMatch ? 1.0 : fuzzyScore,
        });
      }

      // PEP role-based
      if (
        cond.type === "PEP" &&
        record.type === "PEP" &&
        cond.positions?.includes(record.position || "")
      ) {
        results.push({
          type: record.type,
          risk: rule.risk_level,
          record,
          match: "ROLE_BASED",
          score: exactMatch ? 1.0 : fuzzyScore,
        });
      }
    }
  }

  return results.length > 0
    ? results
    : [
        {
          type: "NONE",
          risk: "LOW",
          record: {},
          match: "NO_MATCH",
          score: null,
        },
      ];
}
