// Original validated points of Bang et al. 2009 (Ann Intern Med 151:775-783, Table 2;
// https://pmc.ncbi.nlm.nih.gov/articles/PMC3633111/). The CDC form's gestational item and inactivity +1
// were not validated. Validated on US adults 20+ without known diabetes.
const MIN_AGE_YEARS = 20;
const AGE_POINTS: readonly (readonly [number, number])[] = [
  [60, 3],
  [50, 2],
  [40, 1],
];
const BMI_POINTS: readonly (readonly [number, number])[] = [
  [40, 3],
  [30, 2],
  [25, 1],
];
const FLAG_AT = 5;

export interface AdaAnswers {
  ageYears: number;
  male: boolean;
  familyHistory: boolean; // a parent or sibling with diabetes
  hypertension: boolean;
  physicallyActive: boolean;
  bmi: number; // kg/m^2
}

export interface AdaRisk {
  points: number; // -1..9
  flagged: boolean; // points >= 5, Bang 2009's cut-off for undiagnosed diabetes
  breakdown: {
    age: number;
    sex: number;
    familyHistory: number;
    hypertension: number;
    physicallyActive: number; // 0 or -1
    bmi: number;
  };
}

const pointsFor = (value: number, table: readonly (readonly [number, number])[]) =>
  table.find(([threshold]) => value >= threshold)?.[1] ?? 0;

/** Bang 2009 diabetes risk points; null under age 20, where the score was never validated. */
export function adaRisk(answers: AdaAnswers): AdaRisk | null {
  const { ageYears, bmi } = answers;
  // Stored answers may be untyped; refuse rather than score NaN.
  if (typeof ageYears !== 'number' || typeof bmi !== 'number')
    throw new TypeError(`ageYears and bmi must be numbers, got ${typeof ageYears} and ${typeof bmi}`);
  for (const item of ['male', 'familyHistory', 'hypertension', 'physicallyActive'] as const)
    if (typeof answers[item] !== 'boolean')
      throw new TypeError(`${item} must be true or false, got ${answers[item]}`);
  // Negated so NaN is refused.
  if (!(ageYears >= 0 && ageYears <= 130)) throw new RangeError(`ageYears must be 0-130, got ${ageYears}`);
  if (!(bmi >= 10 && bmi <= 100)) throw new RangeError(`bmi must be 10-100 kg/m², got ${bmi}`);
  if (ageYears < MIN_AGE_YEARS) return null;
  const breakdown = {
    age: pointsFor(ageYears, AGE_POINTS),
    sex: Number(answers.male),
    familyHistory: Number(answers.familyHistory),
    hypertension: Number(answers.hypertension),
    physicallyActive: answers.physicallyActive ? -1 : 0,
    bmi: pointsFor(bmi, BMI_POINTS),
  };
  const points = Object.values(breakdown).reduce((sum, itemPoints) => sum + itemPoints, 0);
  return { points, flagged: points >= FLAG_AT, breakdown };
}
