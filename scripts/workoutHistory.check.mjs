import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const helperSourcePath = path.resolve("workoutHistory.ts");
const helperSource = await readFile(helperSourcePath, "utf8");
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const tempDir = await mkdtemp(path.join(tmpdir(), "workout-history-check-"));
const tempModulePath = path.join(tempDir, "workoutHistory.mjs");
await writeFile(tempModulePath, transpiled.outputText);

const {
  buildCustomWorkoutDayBlueprints,
  buildExerciseSearchSuggestions,
  buildRememberedExerciseRecommendations,
  collectWorkoutDayFamilyHistory,
  findPreviousExerciseByExactName,
  normalizeExerciseIdentity,
} = await import(pathToFileURL(tempModulePath).href);

const makeSet = (id, weight = "20", reps = "10") => ({ id, weight, reps, rpe: "" });
const makeExercise = (name, setId, weight = "20", reps = "10") => ({
  id: `exercise-${setId}`,
  name,
  sets: [makeSet(setId, weight, reps)],
});
const makeDay = (exercises = []) => ({ exercises });
const makeWeek = (id, pushExercises = [], pullExercises = [], legsExercises = []) => ({
  id,
  days: {
    Push: makeDay(pushExercises),
    Pull: makeDay(pullExercises),
    Legs: makeDay(legsExercises),
  },
});

const weeks = [
  makeWeek(
    "week-1",
    [
      makeExercise("Incline Dumbbell Press", "w1-push-press"),
      makeExercise("Hammer Curl", "w1-hammer-curl"),
      makeExercise("Rear Delt Fly", "w1-empty-rear-delt", "", ""),
    ],
    [makeExercise("Lat Pulldown", "w1-lat-pulldown")],
  ),
  makeWeek(
    "week-2",
    [makeExercise("Bench Press", "w2-bench-press")],
    [makeExercise("Cable Curl", "w2-cable-curl")],
  ),
  makeWeek("week-3", [makeExercise("Hammer Curl", "current-hammer-curl", "", "")]),
];
const extraDaysByWeek = {
  "week-1": [
    {
      id: "extra-push-1",
      label: "Extra Push",
      baseDay: "Push",
      exercises: [makeExercise("Triceps Pressdown", "w1-extra-triceps")],
    },
    {
      id: "extra-pull-1",
      label: "Extra Pull",
      baseDay: "Pull",
      exercises: [makeExercise("Face Pull", "w1-extra-face-pull")],
    },
  ],
};
const completedSets = {
  "w1-push-press": "2026-06-01",
  "w1-hammer-curl": "2026-06-01",
  "w1-extra-triceps": "2026-06-02",
  "w1-extra-face-pull": "2026-06-02",
  "w2-bench-press": "2026-06-08",
  "w2-cable-curl": "2026-06-08",
};

assert.equal(normalizeExerciseIdentity(" Hammer   Curl "), "hammer curl", "exercise identity should be exact except case/spacing");
assert.equal(
  collectWorkoutDayFamilyHistory(weeks, extraDaysByWeek, "Push", 2).length,
  3,
  "Push history should include previous base Push days and Extra Push days",
);
assert.deepEqual(
  collectWorkoutDayFamilyHistory(weeks, extraDaysByWeek, "Push", 0),
  [],
  "first week should not use the current week as previous history",
);
assert.equal(
  collectWorkoutDayFamilyHistory(weeks, extraDaysByWeek, "Push", 2)
    .flatMap((day) => day.exercises)
    .some((exercise) => exercise.name === "Face Pull"),
  false,
  "Push history should not include Extra Pull exercises",
);

assert.equal(
  findPreviousExerciseByExactName({
    exercise: makeExercise("Hammer Curl", "current"),
    weeks,
    extraDaysByWeek,
    baseDay: "Push",
    beforeWeekIndex: 2,
  })?.sets[0].id,
  "w1-hammer-curl",
  "comparison should remember exact exercises even when they were skipped in the immediately previous week",
);
assert.equal(
  findPreviousExerciseByExactName({
    exercise: makeExercise("Triceps Pressdown", "current-extra"),
    weeks,
    extraDaysByWeek,
    baseDay: "Push",
    beforeWeekIndex: 2,
  })?.sets[0].id,
  "w1-extra-triceps",
  "Extra Push exercises should be shared with Push history",
);
assert.equal(
  findPreviousExerciseByExactName({
    exercise: makeExercise("Curl", "current-substring"),
    weeks,
    extraDaysByWeek,
    baseDay: "Pull",
    beforeWeekIndex: 2,
  }),
  undefined,
  "comparison should not match a random exercise only because it contains the same word",
);
assert.equal(
  findPreviousExerciseByExactName({
    exercise: makeExercise("Lateral Raise", "current-index-fallback"),
    weeks,
    extraDaysByWeek,
    baseDay: "Push",
    beforeWeekIndex: 2,
  }),
  undefined,
  "comparison should not fall back to a same-index exercise when names do not match exactly",
);

const recommendations = buildRememberedExerciseRecommendations({
  weeks,
  extraDaysByWeek,
  baseDay: "Push",
  beforeWeekIndex: 2,
  currentExercises: [makeExercise("Bench Press", "current-bench", "", "")],
});
assert.deepEqual(
  recommendations,
  ["Incline Dumbbell Press", "Hammer Curl", "Rear Delt Fly", "Triceps Pressdown"],
  "recommendations should include all remembered named Push-family exercises except ones already on the current day",
);

const limitedRecommendations = buildRememberedExerciseRecommendations({
  weeks,
  extraDaysByWeek,
  baseDay: "Push",
  beforeWeekIndex: 2,
  currentExercises: [],
  maxRecommendations: 2,
});
assert.equal(limitedRecommendations.length, 2, "recommendations should honor an explicit safe display cap");

assert.deepEqual(
  buildExerciseSearchSuggestions({
    weeks,
    extraDaysByWeek,
    currentExercises: [],
    query: "cur",
  }),
  ["Hammer Curl", "Cable Curl"],
  "typed letters should find matching saved exercises with the most recent result first",
);
assert.deepEqual(
  buildExerciseSearchSuggestions({
    weeks,
    extraDaysByWeek,
    currentExercises: [makeExercise("Cable Curl", "current-cable")],
    query: "curl",
  }),
  ["Hammer Curl"],
  "search suggestions should exclude exercises already present on the active day",
);
assert.deepEqual(
  buildExerciseSearchSuggestions({
    weeks,
    extraDaysByWeek,
    currentExercises: [],
    query: "inc du",
  }),
  ["Incline Dumbbell Press"],
  "multi-word letter prefixes should match the intended exercise",
);
assert.deepEqual(
  buildExerciseSearchSuggestions({
    weeks,
    extraDaysByWeek,
    currentExercises: [],
    query: "   ",
  }),
  [],
  "blank exercise searches should fail safely without showing unrelated matches",
);

assert.deepEqual(
  buildCustomWorkoutDayBlueprints([
    {
      kind: "preset",
      label: "Extra Push",
      baseDay: "Push",
      exercises: [makeExercise("Bench Press", "preset-bench")],
    },
    {
      kind: "custom",
      label: "Arms",
      baseDay: "Pull",
      exercises: [
        { ...makeExercise("Hammer Curl", "custom-hammer"), sets: [makeSet("one"), makeSet("two")] },
        makeExercise("   ", "blank-name"),
      ],
    },
  ]),
  [
    {
      label: "Arms",
      baseDay: "Pull",
      exercises: [{ name: "Hammer Curl", setCount: 2 }],
    },
  ],
  "only custom days and their valid exercise structure should carry into a new week",
);

console.log("workoutHistory checks passed");
