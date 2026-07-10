export type WorkoutDayName = "Push" | "Pull" | "Legs";

export type WorkoutSetLike = {
  id: string;
  weight?: string;
  reps?: string;
  rpe?: string;
};

export type ExerciseLike = {
  name: string;
  sets: WorkoutSetLike[];
};

export type WorkoutDayLike<TExercise extends ExerciseLike = ExerciseLike> = {
  exercises: TExercise[];
};

export type ExtraWorkoutDayLike<TExercise extends ExerciseLike = ExerciseLike> =
  WorkoutDayLike<TExercise> & {
    baseDay: WorkoutDayName;
    kind?: "preset" | "custom";
    label?: string;
  };

export type CustomWorkoutDayBlueprint = {
  label: string;
  baseDay: WorkoutDayName;
  exercises: Array<{
    name: string;
    setCount: number;
  }>;
};

export type WeekLike<TExercise extends ExerciseLike = ExerciseLike> = {
  id: string;
  days: Record<WorkoutDayName, WorkoutDayLike<TExercise>>;
};

export type ExtraWorkoutDaysByWeekLike<TExercise extends ExerciseLike = ExerciseLike> =
  Record<string, ExtraWorkoutDayLike<TExercise>[]>;

export type CompletedSetsLike = Record<string, string>;

export const normalizeExerciseIdentity = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const exerciseSearchScore = (candidateKey: string, queryKey: string) => {
  if (candidateKey.startsWith(queryKey)) {
    return 0;
  }

  const candidateWords = candidateKey.split(" ");
  const queryWords = queryKey.split(" ");
  if (queryWords.every((queryWord) => candidateWords.some((candidateWord) => candidateWord.startsWith(queryWord)))) {
    return 1;
  }

  return queryWords.every((queryWord) => candidateKey.includes(queryWord)) ? 2 : Number.POSITIVE_INFINITY;
};

const safePositiveNumber = (value: unknown) => {
  const numericValue = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
};

export const exerciseHasLoggedWork = (exercise: ExerciseLike, completedSets: CompletedSetsLike) =>
  exercise.sets.some(
    (set) => Boolean(completedSets[set.id]) || safePositiveNumber(set.weight) > 0 || safePositiveNumber(set.reps) > 0,
  );

export const collectWorkoutDayFamilyHistory = <TExercise extends ExerciseLike>(
  weeks: readonly WeekLike<TExercise>[],
  extraDaysByWeek: ExtraWorkoutDaysByWeekLike<TExercise>,
  baseDay: WorkoutDayName,
  beforeWeekIndex: number,
) => {
  if (!Number.isFinite(beforeWeekIndex) || beforeWeekIndex <= 0 || weeks.length === 0) {
    return [];
  }

  const lastHistoryIndex = Math.min(Math.floor(beforeWeekIndex) - 1, weeks.length - 1);
  const dayHistory: WorkoutDayLike<TExercise>[] = [];

  for (let weekIndex = lastHistoryIndex; weekIndex >= 0; weekIndex -= 1) {
    const week = weeks[weekIndex];
    if (!week) {
      continue;
    }

    dayHistory.push(week.days[baseDay]);
    (extraDaysByWeek[week.id] ?? []).forEach((extraDay) => {
      if (extraDay.baseDay === baseDay) {
        dayHistory.push(extraDay);
      }
    });
  }

  return dayHistory;
};

export const findPreviousExerciseByExactName = <TExercise extends ExerciseLike>({
  exercise,
  weeks,
  extraDaysByWeek,
  baseDay,
  beforeWeekIndex,
}: {
  exercise: TExercise;
  weeks: readonly WeekLike<TExercise>[];
  extraDaysByWeek: ExtraWorkoutDaysByWeekLike<TExercise>;
  baseDay: WorkoutDayName;
  beforeWeekIndex: number;
}) => {
  const exerciseKey = normalizeExerciseIdentity(exercise.name);
  if (!exerciseKey) {
    return undefined;
  }

  return collectWorkoutDayFamilyHistory(weeks, extraDaysByWeek, baseDay, beforeWeekIndex)
    .flatMap((day) => day.exercises)
    .find((candidate) => normalizeExerciseIdentity(candidate.name) === exerciseKey);
};

export const buildRememberedExerciseRecommendations = <TExercise extends ExerciseLike>({
  weeks,
  extraDaysByWeek,
  baseDay,
  beforeWeekIndex,
  currentExercises,
  maxRecommendations = Number.POSITIVE_INFINITY,
}: {
  weeks: readonly WeekLike<TExercise>[];
  extraDaysByWeek: ExtraWorkoutDaysByWeekLike<TExercise>;
  baseDay: WorkoutDayName;
  beforeWeekIndex: number;
  currentExercises: readonly TExercise[];
  maxRecommendations?: number;
}) => {
  const safeLimit = Number.isFinite(maxRecommendations) && maxRecommendations > 0
    ? Math.floor(maxRecommendations)
    : Number.POSITIVE_INFINITY;
  const currentExerciseNames = new Set(currentExercises.map((exercise) => normalizeExerciseIdentity(exercise.name)));
  const seenRecommendations = new Set<string>();
  const recommendations: string[] = [];

  for (const day of collectWorkoutDayFamilyHistory(weeks, extraDaysByWeek, baseDay, beforeWeekIndex)) {
    for (const exercise of day.exercises) {
      const exerciseName = exercise.name.trim();
      const exerciseKey = normalizeExerciseIdentity(exerciseName);

      if (
        !exerciseKey ||
        currentExerciseNames.has(exerciseKey) ||
        seenRecommendations.has(exerciseKey)
      ) {
        continue;
      }

      seenRecommendations.add(exerciseKey);
      recommendations.push(exerciseName);

      if (recommendations.length >= safeLimit) {
        return recommendations;
      }
    }
  }

  return recommendations;
};

export const buildExerciseSearchSuggestions = <TExercise extends ExerciseLike>({
  weeks,
  extraDaysByWeek,
  currentExercises,
  query,
  maxSuggestions = 8,
}: {
  weeks: readonly WeekLike<TExercise>[];
  extraDaysByWeek: ExtraWorkoutDaysByWeekLike<TExercise>;
  currentExercises: readonly TExercise[];
  query: string;
  maxSuggestions?: number;
}) => {
  const queryKey = normalizeExerciseIdentity(query);
  const safeLimit = Number.isFinite(maxSuggestions) && maxSuggestions > 0
    ? Math.floor(maxSuggestions)
    : 8;
  if (!queryKey || safeLimit <= 0) {
    return [];
  }

  const currentExerciseNames = new Set(currentExercises.map((exercise) => normalizeExerciseIdentity(exercise.name)));
  const seenSuggestions = new Set<string>();
  const suggestions: Array<{ name: string; score: number; recency: number }> = [];
  let recency = 0;

  const scanDay = (day: WorkoutDayLike<TExercise> | undefined) => {
    if (!day) {
      return;
    }

    for (const exercise of day.exercises) {
      const exerciseName = exercise.name.trim();
      const exerciseKey = normalizeExerciseIdentity(exerciseName);
      const score = exerciseSearchScore(exerciseKey, queryKey);

      if (
        !exerciseKey ||
        !Number.isFinite(score) ||
        currentExerciseNames.has(exerciseKey) ||
        seenSuggestions.has(exerciseKey)
      ) {
        continue;
      }

      seenSuggestions.add(exerciseKey);
      suggestions.push({ name: exerciseName, score, recency });
      recency += 1;
    }
  };

  for (let weekIndex = weeks.length - 1; weekIndex >= 0; weekIndex -= 1) {
    const week = weeks[weekIndex];
    if (!week) {
      continue;
    }

    scanDay(week.days.Push);
    scanDay(week.days.Pull);
    scanDay(week.days.Legs);
    (extraDaysByWeek[week.id] ?? []).forEach(scanDay);
  }

  return suggestions
    .sort((first, second) => first.score - second.score || first.recency - second.recency)
    .slice(0, safeLimit)
    .map((suggestion) => suggestion.name);
};

export const buildCustomWorkoutDayBlueprints = <TExercise extends ExerciseLike>(
  extraDays: readonly ExtraWorkoutDayLike<TExercise>[],
): CustomWorkoutDayBlueprint[] =>
  extraDays
    .filter((day) => day.kind === "custom")
    .map((day) => ({
      label: day.label?.trim() || "Custom Day",
      baseDay: day.baseDay,
      exercises: day.exercises
        .map((exercise) => ({
          name: exercise.name.trim(),
          setCount: Math.max(1, exercise.sets.length),
        }))
        .filter((exercise) => Boolean(exercise.name)),
    }));
