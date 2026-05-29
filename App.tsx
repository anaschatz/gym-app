import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";

type WorkoutDayName = "Push" | "Pull" | "Legs";
type WeightUnit = "lbs" | "kg";
type CalorieLogType = "add" | "extract";
type CalorieLogMode = "quick" | "macro";
type AppTab = "Workouts" | "Nutrition" | "Weight" | "Analytics" | "Settings";
type GoalMode = "Bulk" | "Cut";
type ThemeMode = "Light" | "Dark";
type MacroTargetMode = "Auto" | "Custom";
type NutritionMode = "Quick Calories" | "Macro Tracker";
type MacroName = "protein" | "carbs" | "fats";
type MacroValues = Record<MacroName, number>;
type MacroDrafts = Record<MacroName, string>;
type FoodDraft = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
};

type BodyweightEntry = {
  value: string;
  unit: WeightUnit;
};

type WorkoutSet = {
  id: string;
  weight: string;
  reps: string;
  rpe: string;
};

type ExerciseEntry = {
  id: string;
  name: string;
  sets: WorkoutSet[];
};

type CalorieLog = {
  id: string;
  type: CalorieLogType;
  mode: CalorieLogMode;
  amount: number;
  label?: string;
  macros?: MacroValues;
  createdAt: string;
};

type DayCalories = {
  target: string;
  logs: CalorieLog[];
};

type WorkoutDayEntry = {
  name: WorkoutDayName;
  exercises: ExerciseEntry[];
  calories: DayCalories;
};

type WorkoutDayContent = {
  exercises: ExerciseEntry[];
  calories: DayCalories;
};

type WeekEntry = {
  id: string;
  weekNumber: number;
  bodyweight: BodyweightEntry;
  days: Record<WorkoutDayName, WorkoutDayEntry>;
};

type CalorieDrafts = Record<WorkoutDayName, FoodDraft>;
type QuickCalorieDrafts = Record<WorkoutDayName, { add: string; extract: string }>;
type PlateModalState = {
  exerciseName: string;
  weight: number;
} | null;
type ExtraWorkoutDayPreset = "Extra Push" | "Extra Pull" | "Extra Legs" | "Custom";
type ExtraWorkoutDayEntry = {
  id: string;
  label: string;
  baseDay: WorkoutDayName;
  exercises: ExerciseEntry[];
  calories: DayCalories;
  createdAt: string;
};
type ExtraWorkoutDaysByWeek = Record<string, ExtraWorkoutDayEntry[]>;
type TimerSettings = {
  enabled: boolean;
  duration: number;
};
type AppSettings = {
  goalMode: GoalMode;
  themeMode: ThemeMode;
  timerSettings: TimerSettings;
  macroTargetMode: MacroTargetMode;
  customMacroTargets: MacroDrafts;
};
type ThemeTokens = {
  mode: ThemeMode;
  background: string;
  surface: string;
  text: string;
  strongText: string;
  mutedText: string;
  placeholder: string;
  border: string;
  subtle: string;
  inverseText: string;
  positive: string;
  negative: string;
  neutral: string;
  backdrop: string;
};
type SetProgressStatus = {
  symbol: "▲" | "▼" | "=" | "—";
  label: string;
  tone: "positive" | "negative" | "neutral";
};
type WeightProgressStatus = {
  arrow: "▲" | "▼" | "=" | "—";
  label: string;
  tone: "positive" | "negative" | "neutral";
};
type CompletedSetsById = Record<string, string>;
type CompletedDates = string[];
type DailyCalorieTargets = Record<string, string>;
type PersonalRecord = {
  exerciseName: string;
  weight: number;
  reps: number;
  weekNumber: number;
  unit: WeightUnit;
  normalizedWeight: number;
};
type CalendarCell = {
  key: string;
  dayNumber: number;
  completed: boolean;
  isToday: boolean;
};

const STORAGE_KEY = "@iphone_gym_tracker/weeks_v1";
const EXTRA_DAYS_STORAGE_KEY = "@iphone_gym_tracker/extra_workout_days_v1";
const TIMER_SETTINGS_STORAGE_KEY = "@iphone_gym_tracker/timer_settings_v1";
const APP_SETTINGS_STORAGE_KEY = "@iphone_gym_tracker/app_settings_v1";
const COMPLETED_SETS_STORAGE_KEY = "@iphone_gym_tracker/completed_sets_v1";
const COMPLETED_DATES_STORAGE_KEY = "@iphone_gym_tracker/completed_dates_v1";
const DAILY_CALORIE_TARGETS_STORAGE_KEY = "@iphone_gym_tracker/daily_calorie_targets_v1";
const DAY_NAMES: WorkoutDayName[] = ["Push", "Pull", "Legs"];
const APP_TABS: AppTab[] = ["Workouts", "Nutrition", "Weight", "Analytics", "Settings"];
const REST_SECONDS = 90;
const MIN_REST_SECONDS = 1;
const QUICK_WEIGHT_TAP_STEP_KG = 2.5;
const QUICK_WEIGHT_LONG_PRESS_STEP_KG = 1.25;
const EXERCISE_SWIPE_THRESHOLD = 58;
const EXERCISE_SWIPE_VERTICAL_TOLERANCE = 44;
const REST_TIMER_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "60s", seconds: 60 },
  { label: "90s", seconds: 90 },
  { label: "2m", seconds: 120 },
  { label: "3m", seconds: 180 },
];
const IOS_KEYBOARD_VERTICAL_OFFSET = Platform.OS === "ios" ? 20 : 0;
const SCREEN_TOP_PADDING = Platform.OS === "ios" ? 28 : 18;
const SCREEN_BOTTOM_PADDING = Platform.OS === "ios" ? 44 : 28;
const BOTTOM_TAB_BOTTOM_PADDING = Platform.OS === "ios" ? 26 : 10;
const BAR_WEIGHT_KG = 20;
const PLATE_OPTIONS_KG = [20, 10, 5];
const DEFAULT_MACRO_TARGETS: MacroDrafts = {
  protein: "180",
  carbs: "250",
  fats: "70",
};
const EMPTY_MACROS: MacroValues = {
  protein: 0,
  carbs: 0,
  fats: 0,
};
const MACRO_LABELS: Record<MacroName, string> = {
  protein: "Protein",
  carbs: "Carbs",
  fats: "Fats",
};
const MACRO_CALORIES_PER_GRAM: Record<MacroName, number> = {
  protein: 4,
  carbs: 4,
  fats: 9,
};
const GOAL_MACRO_SPLITS: Record<GoalMode, MacroValues> = {
  Bulk: {
    protein: 0.3,
    carbs: 0.4,
    fats: 0.3,
  },
  Cut: {
    protein: 0.45,
    carbs: 0.35,
    fats: 0.2,
  },
};
const EXTRA_DAY_PRESETS: Array<{ label: ExtraWorkoutDayPreset; baseDay: WorkoutDayName }> = [
  { label: "Extra Push", baseDay: "Push" },
  { label: "Extra Pull", baseDay: "Pull" },
  { label: "Extra Legs", baseDay: "Legs" },
  { label: "Custom", baseDay: "Push" },
];
const DEFAULT_APP_SETTINGS: AppSettings = {
  goalMode: "Bulk",
  themeMode: "Light",
  timerSettings: {
    enabled: true,
    duration: REST_SECONDS,
  },
  macroTargetMode: "Auto",
  customMacroTargets: DEFAULT_MACRO_TARGETS,
};
const LIGHT_THEME: ThemeTokens = {
  mode: "Light",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#000000",
  strongText: "#0F172A",
  mutedText: "#334155",
  placeholder: "#64748B",
  border: "#000000",
  subtle: "#E2E8F0",
  inverseText: "#FFFFFF",
  positive: "#16A34A",
  negative: "#DC2626",
  neutral: "#64748B",
  backdrop: "rgba(15, 23, 42, 0.32)",
};
const DARK_THEME: ThemeTokens = {
  mode: "Dark",
  background: "#000000",
  surface: "#000000",
  text: "#FFFFFF",
  strongText: "#F8FAFC",
  mutedText: "#CBD5E1",
  placeholder: "#94A3B8",
  border: "#FFFFFF",
  subtle: "#1E293B",
  inverseText: "#000000",
  positive: "#22C55E",
  negative: "#F87171",
  neutral: "#94A3B8",
  backdrop: "rgba(248, 250, 252, 0.22)",
};
const STARTER_CALORIE_LOG_SIGNATURES = new Set([
  "add|620|2026-05-13T08:15:00.000Z",
  "add|780|2026-05-13T13:20:00.000Z",
  "extract|250|2026-05-13T18:10:00.000Z",
  "add|540|2026-05-15T08:00:00.000Z",
  "add|910|2026-05-15T14:00:00.000Z",
  "extract|180|2026-05-15T19:30:00.000Z",
  "add|700|2026-05-17T09:10:00.000Z",
  "add|860|2026-05-17T15:45:00.000Z",
  "extract|320|2026-05-17T20:10:00.000Z",
  "add|520|2026-05-20T08:20:00.000Z",
  "add|840|2026-05-20T13:15:00.000Z",
  "extract|220|2026-05-20T18:45:00.000Z",
  "add|610|2026-05-22T09:00:00.000Z",
  "extract|200|2026-05-22T19:10:00.000Z",
  "add|690|2026-05-24T09:30:00.000Z",
  "add|910|2026-05-24T15:15:00.000Z",
]);

const makeId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const normalizeName = (value: string) => value.trim().toLowerCase();

const makeSet = (weight = "", reps = "", rpe = ""): WorkoutSet => ({
  id: makeId("set"),
  weight,
  reps,
  rpe,
});

const makeExercise = (name: string, sets: WorkoutSet[] = [makeSet()]): ExerciseEntry => ({
  id: makeId("exercise"),
  name,
  sets,
});

const makeCalories = (target = "2500", logs: CalorieLog[] = []): DayCalories => ({
  target,
  logs,
});

const hasMacroValues = (macros: MacroValues) =>
  macros.protein > 0 || macros.carbs > 0 || macros.fats > 0;

const makeCalorieLog = (
  type: CalorieLogType,
  amount: number,
  label?: string,
  macros: MacroValues = EMPTY_MACROS,
  mode: CalorieLogMode = label || hasMacroValues(macros) ? "macro" : "quick",
): CalorieLog => ({
  id: makeId("calorie"),
  type,
  mode,
  amount,
  label,
  macros,
  createdAt: new Date().toISOString(),
});

const makeDay = (
  name: WorkoutDayName,
  exercises: ExerciseEntry[] = [],
  calories: DayCalories = makeCalories(),
): WorkoutDayEntry => ({
  name,
  exercises,
  calories,
});

const makeWeek = (
  weekNumber: number,
  bodyweight: BodyweightEntry,
  days: Record<WorkoutDayName, WorkoutDayEntry>,
): WeekEntry => ({
  id: makeId("week"),
  weekNumber,
  bodyweight,
  days,
});

const createBlankWeek = (weekNumber: number, previousWeek?: WeekEntry): WeekEntry => {
  const unit = previousWeek?.bodyweight.unit ?? "lbs";
  const days = DAY_NAMES.reduce((accumulator, dayName) => {
    const previousTarget = previousWeek?.days[dayName]?.calories.target ?? "2500";
    accumulator[dayName] = makeDay(dayName, [], makeCalories(previousTarget));
    return accumulator;
  }, {} as Record<WorkoutDayName, WorkoutDayEntry>);

  return makeWeek(weekNumber, { value: "", unit }, days);
};

const applyCalorieTargetToBaseDays = (week: WeekEntry, target: string): WeekEntry => {
  const nextDays = { ...week.days };

  DAY_NAMES.forEach((dayName) => {
    const day = week.days[dayName];
    nextDays[dayName] = {
      ...day,
      calories: {
        ...day.calories,
        target,
      },
    };
  });

  return {
    ...week,
    days: nextDays,
  };
};

const MOCK_WEEKS: WeekEntry[] = [
  makeWeek(
    1,
    { value: "184.2", unit: "lbs" },
    {
      Push: makeDay(
        "Push",
        [
          makeExercise("Bench Press", [makeSet("135", "5"), makeSet("145", "5"), makeSet("155", "4")]),
          makeExercise("Overhead Press", [makeSet("75", "8"), makeSet("80", "7")]),
        ],
        makeCalories("2600"),
      ),
      Pull: makeDay(
        "Pull",
        [
          makeExercise("Deadlift", [makeSet("225", "5"), makeSet("245", "3")]),
          makeExercise("Lat Pulldown", [makeSet("120", "10"), makeSet("130", "8")]),
        ],
        makeCalories("2550"),
      ),
      Legs: makeDay(
        "Legs",
        [
          makeExercise("Back Squat", [makeSet("185", "6"), makeSet("195", "5"), makeSet("205", "3")]),
          makeExercise("Romanian Deadlift", [makeSet("155", "8"), makeSet("165", "8")]),
        ],
        makeCalories("2700"),
      ),
    },
  ),
  makeWeek(
    2,
    { value: "182.8", unit: "lbs" },
    {
      Push: makeDay(
        "Push",
        [
          makeExercise("Bench Press", [makeSet("140", "5"), makeSet("150", "5"), makeSet("155", "5")]),
          makeExercise("Overhead Press", [makeSet("80", "8"), makeSet("85", "6")]),
        ],
        makeCalories("2600"),
      ),
      Pull: makeDay(
        "Pull",
        [
          makeExercise("Deadlift", [makeSet("235", "5"), makeSet("250", "3")]),
          makeExercise("Lat Pulldown", [makeSet("125", "10"), makeSet("135", "8")]),
        ],
        makeCalories("2550"),
      ),
      Legs: makeDay(
        "Legs",
        [
          makeExercise("Back Squat", [makeSet("190", "6"), makeSet("200", "5"), makeSet("210", "3")]),
          makeExercise("Romanian Deadlift", [makeSet("165", "8"), makeSet("175", "7")]),
        ],
        makeCalories("2700"),
      ),
    },
  ),
];

const emptyFoodDraft = (): FoodDraft => ({ name: "", calories: "", protein: "", carbs: "", fats: "" });

const emptyCalorieDrafts = (): CalorieDrafts => ({
  Push: emptyFoodDraft(),
  Pull: emptyFoodDraft(),
  Legs: emptyFoodDraft(),
});

const emptyQuickCalorieDrafts = (): QuickCalorieDrafts => ({
  Push: { add: "", extract: "" },
  Pull: { add: "", extract: "" },
  Legs: { add: "", extract: "" },
});

const safeNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRpeInput = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) {
    return "";
  }

  return String(Math.min(10, Math.max(1, Number(digits))));
};

const getThemeTokens = (mode: ThemeMode) => (mode === "Dark" ? DARK_THEME : LIGHT_THEME);

const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const formatLoggedWeight = (value: number) => {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const dateKeyFromIso = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDateKey(date);
};

const toKilograms = (value: number, unit: WeightUnit) => (unit === "kg" ? value : value * 0.45359237);

const convertWeight = (value: number, fromUnit: WeightUnit, toUnit: WeightUnit) => {
  if (fromUnit === toUnit) {
    return value;
  }

  return toUnit === "kg" ? value * 0.45359237 : value / 0.45359237;
};

const calculateOneRepMax = (weight: string, reps: string) => {
  const parsedWeight = safeNumber(weight);
  const parsedReps = safeNumber(reps);
  if (parsedWeight <= 0 || parsedReps <= 0) {
    return 0;
  }

  return parsedWeight * (1 + parsedReps / 30);
};

const calculateExerciseOneRepMax = (exercise: ExerciseEntry) =>
  exercise.sets.reduce((best, set) => Math.max(best, calculateOneRepMax(set.weight, set.reps)), 0);

const calculateDayCalories = (day: WorkoutDayEntry) => {
  const added = day.calories.logs
    .filter((entry) => entry.type === "add")
    .reduce((total, entry) => total + entry.amount, 0);
  const extracted = day.calories.logs
    .filter((entry) => entry.type === "extract")
    .reduce((total, entry) => total + entry.amount, 0);
  const target = safeNumber(day.calories.target);
  const netCalories = added - extracted;
  const remaining = target - netCalories;
  const progress = target > 0 ? Math.min(1, Math.max(0, netCalories) / target) : 0;

  return { added, extracted, netCalories, remaining, target, progress };
};

const calculateDayMacroTotals = (day: WorkoutDayEntry): MacroValues =>
  day.calories.logs.reduce(
    (totals, log) => ({
      protein: totals.protein + (log.macros?.protein ?? 0),
      carbs: totals.carbs + (log.macros?.carbs ?? 0),
      fats: totals.fats + (log.macros?.fats ?? 0),
    }),
    { ...EMPTY_MACROS },
  );

const formatMacroSummary = (macros: MacroValues = EMPTY_MACROS) =>
  `P ${Math.round(macros.protein)}g / C ${Math.round(macros.carbs)}g / F ${Math.round(macros.fats)}g`;

const isMacroLog = (log: CalorieLog) => log.mode === "macro";

const calculateAutoMacroTargets = (goalMode: GoalMode, calorieTarget: string): MacroDrafts => {
  const targetCalories = Math.max(0, safeNumber(calorieTarget));
  const split = GOAL_MACRO_SPLITS[goalMode];

  return {
    protein: String(Math.round((targetCalories * split.protein) / MACRO_CALORIES_PER_GRAM.protein)),
    carbs: String(Math.round((targetCalories * split.carbs) / MACRO_CALORIES_PER_GRAM.carbs)),
    fats: String(Math.round((targetCalories * split.fats) / MACRO_CALORIES_PER_GRAM.fats)),
  };
};

const isStarterCalorieLog = (log: CalorieLog) =>
  STARTER_CALORIE_LOG_SIGNATURES.has(`${log.type}|${log.amount}|${log.createdAt}`);

const calculateExerciseVolume = (exercise: ExerciseEntry) =>
  exercise.sets.reduce((setTotal, set) => setTotal + safeNumber(set.weight) * safeNumber(set.reps), 0);

const calculateWorkoutDayVolume = (day: Pick<WorkoutDayEntry, "exercises"> | Pick<ExtraWorkoutDayEntry, "exercises">) =>
  day.exercises.reduce((dayTotal, exercise) => dayTotal + calculateExerciseVolume(exercise), 0);

const calculateWeekVolume = (week: WeekEntry, extraDays: ExtraWorkoutDayEntry[] = []) =>
  DAY_NAMES.reduce(
    (weekTotal, dayName) =>
      weekTotal + calculateWorkoutDayVolume(week.days[dayName]),
    0,
  ) + extraDays.reduce((total, day) => total + calculateWorkoutDayVolume(day), 0);

const buildLast28DayCalendarCells = (completedDates: CompletedDates): CalendarCell[] => {
  const today = new Date();
  const todayKey = formatDateKey(today);
  const completedDateKeys = new Set(completedDates);

  return Array.from({ length: 28 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const dateKey = formatDateKey(date);
    return {
      key: dateKey,
      dayNumber: date.getDate(),
      completed: completedDateKeys.has(dateKey),
      isToday: dateKey === todayKey,
    };
  });
};

const scanPersonalRecords = (weeks: WeekEntry[], extraDaysByWeek: ExtraWorkoutDaysByWeek) => {
  const records: Record<string, PersonalRecord> = {};

  const scanExercise = (exercise: ExerciseEntry, week: WeekEntry) => {
    const exerciseName = exercise.name.trim();
    if (!exerciseName) {
      return;
    }

    exercise.sets.forEach((set) => {
      const weight = safeNumber(set.weight);
      const reps = safeNumber(set.reps);
      if (weight <= 0 || reps <= 0) {
        return;
      }

      const normalizedWeight = convertWeight(weight, week.bodyweight.unit, "kg");
      const recordKey = normalizeName(exerciseName);
      const currentRecord = records[recordKey];
      if (!currentRecord || normalizedWeight > currentRecord.normalizedWeight) {
        records[recordKey] = {
          exerciseName,
          weight,
          reps,
          weekNumber: week.weekNumber,
          unit: week.bodyweight.unit,
          normalizedWeight,
        };
      }
    });
  };

  weeks.forEach((week) => {
    DAY_NAMES.forEach((dayName) => {
      week.days[dayName].exercises.forEach((exercise) => scanExercise(exercise, week));
    });
    (extraDaysByWeek[week.id] ?? []).forEach((extraDay) => {
      extraDay.exercises.forEach((exercise) => scanExercise(exercise, week));
    });
  });

  return Object.values(records).sort((first, second) => first.exerciseName.localeCompare(second.exerciseName));
};

const formatWeightEntryDate = (weeksLength: number, index: number) => {
  const date = new Date();
  date.setDate(date.getDate() - (weeksLength - 1 - index) * 7);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const normalizeMacroValues = (value: unknown): MacroValues => {
  const record = asRecord(value);
  return {
    protein: typeof record?.protein === "number" ? record.protein : 0,
    carbs: typeof record?.carbs === "number" ? record.carbs : 0,
    fats: typeof record?.fats === "number" ? record.fats : 0,
  };
};

const normalizeMacroDrafts = (value: unknown): MacroDrafts => {
  const record = asRecord(value);
  return {
    protein: typeof record?.protein === "string" ? record.protein : DEFAULT_MACRO_TARGETS.protein,
    carbs: typeof record?.carbs === "string" ? record.carbs : DEFAULT_MACRO_TARGETS.carbs,
    fats: typeof record?.fats === "string" ? record.fats : DEFAULT_MACRO_TARGETS.fats,
  };
};

const normalizeSet = (value: unknown): WorkoutSet => {
  const record = asRecord(value);
  return {
    id: typeof record?.id === "string" ? record.id : makeId("set"),
    weight: typeof record?.weight === "string" ? record.weight : "",
    reps: typeof record?.reps === "string" ? record.reps : "",
    rpe: typeof record?.rpe === "string" ? record.rpe : "",
  };
};

const normalizeExercise = (value: unknown): ExerciseEntry => {
  const record = asRecord(value);
  const rawSets = Array.isArray(record?.sets) ? record.sets : [];
  const sets = rawSets.length > 0 ? rawSets.map(normalizeSet) : [makeSet()];

  return {
    id: typeof record?.id === "string" ? record.id : makeId("exercise"),
    name: typeof record?.name === "string" ? record.name : "Untitled Exercise",
    sets,
  };
};

const normalizeCalorieLog = (value: unknown): CalorieLog | null => {
  const record = asRecord(value);
  const type = record?.type;
  const amount = record?.amount;
  const macros = normalizeMacroValues(record?.macros);
  const label = typeof record?.label === "string" ? record.label : undefined;
  const mode: CalorieLogMode =
    record?.mode === "quick" || record?.mode === "macro"
      ? record.mode
      : label || hasMacroValues(macros)
        ? "macro"
        : "quick";

  if ((type !== "add" && type !== "extract") || typeof amount !== "number") {
    return null;
  }

  return {
    id: typeof record?.id === "string" ? record.id : makeId("calorie"),
    type,
    amount,
    mode,
    label,
    macros,
    createdAt: typeof record?.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
};

const normalizeCalories = (value: unknown): DayCalories => {
  const record = asRecord(value);
  const rawLogs = Array.isArray(record?.logs) ? record.logs : [];

  return {
    target: typeof record?.target === "string" ? record.target : "2500",
    logs: rawLogs
      .map(normalizeCalorieLog)
      .filter((log): log is CalorieLog => Boolean(log))
      .filter((log) => !isStarterCalorieLog(log)),
  };
};

const normalizeDay = (name: WorkoutDayName, value: unknown): WorkoutDayEntry => {
  const record = asRecord(value);
  const rawExercises = Array.isArray(record?.exercises) ? record.exercises : [];

  return {
    name,
    exercises: rawExercises.map(normalizeExercise),
    calories: normalizeCalories(record?.calories),
  };
};

const normalizeExtraWorkoutDay = (value: unknown): ExtraWorkoutDayEntry | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const rawBaseDay = record.baseDay;
  const baseDay: WorkoutDayName =
    rawBaseDay === "Pull" || rawBaseDay === "Legs" || rawBaseDay === "Push" ? rawBaseDay : "Push";
  const rawExercises = Array.isArray(record.exercises) ? record.exercises : [];
  const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : `Extra ${baseDay}`;

  return {
    id: typeof record.id === "string" ? record.id : makeId("extra_day"),
    label,
    baseDay,
    exercises: rawExercises.map(normalizeExercise),
    calories: normalizeCalories(record.calories),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
  };
};

const normalizeExtraWorkoutDaysByWeek = (value: unknown): ExtraWorkoutDaysByWeek => {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return Object.entries(record).reduce((accumulator, [weekId, rawDays]) => {
    if (Array.isArray(rawDays)) {
      const normalizedDays = rawDays
        .map(normalizeExtraWorkoutDay)
        .filter((day): day is ExtraWorkoutDayEntry => Boolean(day));

      if (normalizedDays.length > 0) {
        accumulator[weekId] = normalizedDays;
      }
    }

    return accumulator;
  }, {} as ExtraWorkoutDaysByWeek);
};

const normalizeTimerSettings = (value: unknown): TimerSettings => {
  const record = asRecord(value);
  const duration = typeof record?.duration === "number" && record.duration > 0 ? Math.round(record.duration) : REST_SECONDS;

  return {
    enabled: typeof record?.enabled === "boolean" ? record.enabled : true,
    duration: Math.max(MIN_REST_SECONDS, duration),
  };
};

const normalizeAppSettings = (value: unknown): AppSettings => {
  const record = asRecord(value);
  const goalMode = record?.goalMode === "Cut" ? "Cut" : "Bulk";
  const themeMode = record?.themeMode === "Dark" ? "Dark" : "Light";
  const macroTargetMode = record?.macroTargetMode === "Custom" ? "Custom" : "Auto";

  return {
    goalMode,
    themeMode,
    timerSettings: normalizeTimerSettings(record?.timerSettings),
    macroTargetMode,
    customMacroTargets: normalizeMacroDrafts(record?.customMacroTargets),
  };
};

const normalizeCompletedSets = (value: unknown): CompletedSetsById => {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return Object.entries(record).reduce((completed, [setId, rawValue]) => {
    if (typeof rawValue === "string" && rawValue.trim()) {
      completed[setId] = rawValue;
    } else if (rawValue === true) {
      completed[setId] = new Date().toISOString();
    }

  return completed;
  }, {} as CompletedSetsById);
};

const isValidDateKey = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

const normalizeCompletedDates = (value: unknown): CompletedDates => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((dateKey): dateKey is string => typeof dateKey === "string")
        .map((dateKey) => dateKey.trim())
        .filter(isValidDateKey),
    ),
  );
};

const normalizeDailyCalorieTargets = (value: unknown): DailyCalorieTargets => {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return Object.entries(record).reduce((targets, [dateKey, target]) => {
    if (isValidDateKey(dateKey) && typeof target === "string" && safeNumber(target) > 0) {
      targets[dateKey] = target;
    }

    return targets;
  }, {} as DailyCalorieTargets);
};

const getPreviousDateKey = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() - 1);
  return formatDateKey(date);
};

const findPreviousDailyCalorieTarget = (targets: DailyCalorieTargets, todayKey: string) => {
  const yesterdayKey = getPreviousDateKey(todayKey);
  if (yesterdayKey && targets[yesterdayKey]) {
    return { dateKey: yesterdayKey, target: targets[yesterdayKey] };
  }

  const previousDateKey = Object.keys(targets)
    .filter((dateKey) => dateKey < todayKey && isValidDateKey(dateKey) && safeNumber(targets[dateKey]) > 0)
    .sort()
    .reverse()[0];

  return previousDateKey ? { dateKey: previousDateKey, target: targets[previousDateKey] } : null;
};

const resolveDailyCalorieTarget = (
  targets: DailyCalorieTargets,
  todayKey: string,
  fallbackTarget: string,
) => {
  if (targets[todayKey]) {
    return { source: "today" as const, target: targets[todayKey], dateKey: todayKey };
  }

  const previousTarget = findPreviousDailyCalorieTarget(targets, todayKey);
  if (previousTarget) {
    return { source: "previous" as const, ...previousTarget };
  }

  return safeNumber(fallbackTarget) > 0
    ? { source: "current" as const, target: fallbackTarget, dateKey: todayKey }
    : null;
};

const completedDatesFromCompletedSets = (completedSets: CompletedSetsById): CompletedDates =>
  Array.from(
    new Set(
      Object.values(completedSets)
        .map(dateKeyFromIso)
        .filter((dateKey): dateKey is string => Boolean(dateKey)),
    ),
  );

const normalizeWeeks = (value: unknown): WeekEntry[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return value.map((weekValue, index) => {
    const week = asRecord(weekValue);
    const bodyweight = asRecord(week?.bodyweight);
    const days = asRecord(week?.days);
    const rawUnit = bodyweight?.unit;
    const unit: WeightUnit = rawUnit === "kg" || rawUnit === "lbs" ? rawUnit : "lbs";

    return {
      id: typeof week?.id === "string" ? week.id : makeId("week"),
      weekNumber: typeof week?.weekNumber === "number" ? week.weekNumber : index + 1,
      bodyweight: {
        value: typeof bodyweight?.value === "string" ? bodyweight.value : "",
        unit,
      },
      days: {
        Push: normalizeDay("Push", days?.Push),
        Pull: normalizeDay("Pull", days?.Pull),
        Legs: normalizeDay("Legs", days?.Legs),
      },
    };
  });
};

export default function App() {
  const [weeks, setWeeks] = useState<WeekEntry[]>(MOCK_WEEKS);
  const [activeWeekIndex, setActiveWeekIndex] = useState(MOCK_WEEKS.length - 1);
  const [activeDay, setActiveDay] = useState<WorkoutDayName>("Push");
  const [activeTab, setActiveTab] = useState<AppTab>("Workouts");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [nutritionMode, setNutritionMode] = useState<NutritionMode>("Quick Calories");
  const [calorieDrafts, setCalorieDrafts] = useState<CalorieDrafts>(emptyCalorieDrafts);
  const [quickCalorieDrafts, setQuickCalorieDrafts] = useState<QuickCalorieDrafts>(emptyQuickCalorieDrafts);
  const [completedSets, setCompletedSets] = useState<CompletedSetsById>({});
  const [completedDates, setCompletedDates] = useState<CompletedDates>([]);
  const [dailyCalorieTargets, setDailyCalorieTargets] = useState<DailyCalorieTargets>({});
  const [swipedExerciseId, setSwipedExerciseId] = useState<string | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [plateModal, setPlateModal] = useState<PlateModalState>(null);
  const [extraWorkoutDays, setExtraWorkoutDays] = useState<ExtraWorkoutDaysByWeek>({});
  const [activeWorkoutDayId, setActiveWorkoutDayId] = useState<string>("Push");
  const [isAddDayModalVisible, setIsAddDayModalVisible] = useState(false);
  const [customDayName, setCustomDayName] = useState("");
  const [goalMode, setGoalMode] = useState<GoalMode>(DEFAULT_APP_SETTINGS.goalMode);
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_APP_SETTINGS.themeMode);
  const [timerSettings, setTimerSettings] = useState<TimerSettings>({
    ...DEFAULT_APP_SETTINGS.timerSettings,
  });
  const [timerDurationDraft, setTimerDurationDraft] = useState(String(DEFAULT_APP_SETTINGS.timerSettings.duration));
  const [macroTargetMode, setMacroTargetMode] = useState<MacroTargetMode>(DEFAULT_APP_SETTINGS.macroTargetMode);
  const [customMacroTargets, setCustomMacroTargets] = useState<MacroDrafts>(DEFAULT_APP_SETTINGS.customMacroTargets);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const shouldVibrateWhenTimerEndsRef = useRef(false);
  const warnedAtThreeSecondsRef = useRef(false);
  const exerciseSwipeStartRef = useRef<{ exerciseId: string; x: number; y: number } | null>(null);
  const appliedDailyCalorieTargetRef = useRef<string | null>(null);
  const todayDateKey = useMemo(() => formatDateKey(new Date()), []);

  const currentWeek = weeks[activeWeekIndex] ?? weeks[0];
  const previousWeek = activeWeekIndex > 0 ? weeks[activeWeekIndex - 1] : undefined;
  const currentDay = currentWeek.days[activeDay];
  const calorieDraft = calorieDrafts[activeDay];
  const quickCalorieDraft = quickCalorieDrafts[activeDay];
  const currentExtraWorkoutDays = extraWorkoutDays[currentWeek.id] ?? [];
  const activeExtraWorkoutDay = currentExtraWorkoutDays.find((day) => day.id === activeWorkoutDayId);
  const isBaseWorkoutDay = DAY_NAMES.includes(activeWorkoutDayId as WorkoutDayName);
  const activeWorkoutBaseDay: WorkoutDayName = isBaseWorkoutDay
    ? (activeWorkoutDayId as WorkoutDayName)
    : activeExtraWorkoutDay?.baseDay ?? activeDay;
  const currentWorkoutDay = activeExtraWorkoutDay ?? currentWeek.days[activeWorkoutBaseDay];
  const currentWorkoutDayLabel = activeExtraWorkoutDay?.label ?? activeWorkoutBaseDay;
  const theme = useMemo(() => getThemeTokens(themeMode), [themeMode]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    let isMounted = true;

    const loadWeeks = async () => {
      try {
        const savedWeeks = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedWeeks) {
          const parsedWeeks = normalizeWeeks(JSON.parse(savedWeeks));
          if (parsedWeeks && isMounted) {
            setWeeks(parsedWeeks);
            setActiveWeekIndex(parsedWeeks.length - 1);
          }
        }

        const savedExtraDays = await AsyncStorage.getItem(EXTRA_DAYS_STORAGE_KEY);
        if (savedExtraDays && isMounted) {
          setExtraWorkoutDays(normalizeExtraWorkoutDaysByWeek(JSON.parse(savedExtraDays)));
        }

        const savedCompletedSets = await AsyncStorage.getItem(COMPLETED_SETS_STORAGE_KEY);
        let normalizedCompletedSets: CompletedSetsById = {};
        if (savedCompletedSets && isMounted) {
          normalizedCompletedSets = normalizeCompletedSets(JSON.parse(savedCompletedSets));
          setCompletedSets(normalizedCompletedSets);
        }

        const savedCompletedDates = await AsyncStorage.getItem(COMPLETED_DATES_STORAGE_KEY);
        if (isMounted) {
          const normalizedCompletedDates = savedCompletedDates
            ? normalizeCompletedDates(JSON.parse(savedCompletedDates))
            : completedDatesFromCompletedSets(normalizedCompletedSets);
          setCompletedDates(normalizedCompletedDates);
        }

        const savedDailyCalorieTargets = await AsyncStorage.getItem(DAILY_CALORIE_TARGETS_STORAGE_KEY);
        if (savedDailyCalorieTargets && isMounted) {
          setDailyCalorieTargets(normalizeDailyCalorieTargets(JSON.parse(savedDailyCalorieTargets)));
        }

        const savedAppSettings = await AsyncStorage.getItem(APP_SETTINGS_STORAGE_KEY);
        const hasSavedAppSettings = Boolean(savedAppSettings);
        if (savedAppSettings && isMounted) {
          const normalizedSettings = normalizeAppSettings(JSON.parse(savedAppSettings));
          setGoalMode(normalizedSettings.goalMode);
          setThemeMode(normalizedSettings.themeMode);
          setTimerSettings(normalizedSettings.timerSettings);
          setTimerDurationDraft(String(normalizedSettings.timerSettings.duration));
          setMacroTargetMode(normalizedSettings.macroTargetMode);
          setCustomMacroTargets(normalizedSettings.customMacroTargets);
        }

        const savedTimerSettings = await AsyncStorage.getItem(TIMER_SETTINGS_STORAGE_KEY);
        if (savedTimerSettings && !hasSavedAppSettings && isMounted) {
          const normalizedSettings = normalizeTimerSettings(JSON.parse(savedTimerSettings));
          setTimerSettings(normalizedSettings);
          setTimerDurationDraft(String(normalizedSettings.duration));
        }
      } catch {
        if (isMounted) {
          setStorageError("Saved data could not be loaded. Showing starter weeks.");
        }
      } finally {
        if (isMounted) {
          setHasLoadedStorage(true);
        }
      }
    };

    loadWeeks();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(weeks)).catch(() => {
      setStorageError("Changes could not be saved to this device.");
    });
  }, [hasLoadedStorage, weeks]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    AsyncStorage.setItem(EXTRA_DAYS_STORAGE_KEY, JSON.stringify(extraWorkoutDays)).catch(() => {
      setStorageError("Extra workout days could not be saved to this device.");
    });
  }, [extraWorkoutDays, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    AsyncStorage.setItem(COMPLETED_SETS_STORAGE_KEY, JSON.stringify(completedSets)).catch(() => {
      setStorageError("Completed sets could not be saved to this device.");
    });
  }, [completedSets, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    AsyncStorage.setItem(COMPLETED_DATES_STORAGE_KEY, JSON.stringify(completedDates)).catch(() => {
      setStorageError("Completed dates could not be saved to this device.");
    });
  }, [completedDates, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    AsyncStorage.setItem(DAILY_CALORIE_TARGETS_STORAGE_KEY, JSON.stringify(dailyCalorieTargets)).catch(() => {
      setStorageError("Daily calorie targets could not be saved to this device.");
    });
  }, [dailyCalorieTargets, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    const nextSettings: AppSettings = {
      goalMode,
      themeMode,
      timerSettings,
      macroTargetMode,
      customMacroTargets,
    };

    AsyncStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings)).catch(() => {
      setStorageError("Settings could not be saved to this device.");
    });
  }, [customMacroTargets, goalMode, hasLoadedStorage, macroTargetMode, themeMode, timerSettings]);

  useEffect(() => {
    if (!hasLoadedStorage || !currentWeek) {
      return;
    }

    const applyKey = `${currentWeek.id}:${todayDateKey}`;
    if (appliedDailyCalorieTargetRef.current === applyKey) {
      return;
    }

    const resolvedTarget = resolveDailyCalorieTarget(dailyCalorieTargets, todayDateKey, currentDay.calories.target);
    if (!resolvedTarget) {
      return;
    }

    appliedDailyCalorieTargetRef.current = applyKey;

    if (dailyCalorieTargets[todayDateKey] !== resolvedTarget.target) {
      setDailyCalorieTargets((previousTargets) => ({
        ...previousTargets,
        [todayDateKey]: resolvedTarget.target,
      }));
    }

    setWeeks((previousWeeks) =>
      previousWeeks.map((week, index) => {
        if (index !== activeWeekIndex) {
          return week;
        }

        const needsTargetSync = DAY_NAMES.some((dayName) => week.days[dayName].calories.target !== resolvedTarget.target);
        return needsTargetSync ? applyCalorieTargetToBaseDays(week, resolvedTarget.target) : week;
      }),
    );
  }, [
    activeWeekIndex,
    currentDay.calories.target,
    currentWeek,
    dailyCalorieTargets,
    hasLoadedStorage,
    todayDateKey,
  ]);

  useEffect(() => {
    if (activeWeekIndex > weeks.length - 1) {
      setActiveWeekIndex(Math.max(0, weeks.length - 1));
    }
  }, [activeWeekIndex, weeks.length]);

  useEffect(() => {
    const isBaseDay = DAY_NAMES.includes(activeWorkoutDayId as WorkoutDayName);
    const hasExtraDay = currentExtraWorkoutDays.some((day) => day.id === activeWorkoutDayId);

    if (!isBaseDay && !hasExtraDay) {
      setActiveWorkoutDayId("Push");
      setActiveDay("Push");
    }
  }, [activeWorkoutDayId, currentExtraWorkoutDays]);

  useEffect(() => {
    if (restSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRestSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [restSeconds]);

  useEffect(() => {
    if (restSeconds !== 0 || !shouldVibrateWhenTimerEndsRef.current) {
      return;
    }

    shouldVibrateWhenTimerEndsRef.current = false;
    warnedAtThreeSecondsRef.current = false;
    Vibration.vibrate([0, 140, 90, 320]);
  }, [restSeconds]);

  useEffect(() => {
    if (restSeconds !== 3 || !shouldVibrateWhenTimerEndsRef.current || warnedAtThreeSecondsRef.current) {
      return;
    }

    warnedAtThreeSecondsRef.current = true;
    Vibration.vibrate([0, 35, 70, 35]);
  }, [restSeconds]);

  const updateCurrentWeek = useCallback(
    (updater: (week: WeekEntry) => WeekEntry) => {
      setWeeks((previousWeeks) =>
        previousWeeks.map((week, index) => (index === activeWeekIndex ? updater(week) : week)),
      );
    },
    [activeWeekIndex],
  );

  const updateCurrentDay = useCallback(
    (updater: (day: WorkoutDayEntry) => WorkoutDayEntry) => {
      updateCurrentWeek((week) => ({
        ...week,
        days: {
          ...week.days,
          [activeDay]: updater(week.days[activeDay]),
        },
      }));
    },
    [activeDay, updateCurrentWeek],
  );

  const updateCurrentWorkoutDay = useCallback(
    (updater: (day: WorkoutDayContent) => WorkoutDayContent) => {
      if (activeExtraWorkoutDay) {
        setExtraWorkoutDays((previousExtraDays) => ({
          ...previousExtraDays,
          [currentWeek.id]: (previousExtraDays[currentWeek.id] ?? []).map((day) =>
            day.id === activeExtraWorkoutDay.id ? { ...day, ...updater(day) } : day,
          ),
        }));
        return;
      }

      updateCurrentWeek((week) => {
        const day = week.days[activeWorkoutBaseDay];
        return {
          ...week,
          days: {
            ...week.days,
            [activeWorkoutBaseDay]: {
              ...day,
              ...updater(day),
            },
          },
        };
      });
    },
    [activeExtraWorkoutDay, activeWorkoutBaseDay, currentWeek.id, updateCurrentWeek],
  );

  const updateExercise = (exerciseId: string, updater: (exercise: ExerciseEntry) => ExerciseEntry) => {
    updateCurrentWorkoutDay((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) => (exercise.id === exerciseId ? updater(exercise) : exercise)),
    }));
  };

  const findPreviousExercise = (exercise: ExerciseEntry, exerciseIndex: number) => {
    const previousDay = previousWeek?.days[activeWorkoutBaseDay];
    if (!previousDay) {
      return undefined;
    }

    const namedMatch = previousDay.exercises.find(
      (candidate) => normalizeName(candidate.name) !== "" && normalizeName(candidate.name) === normalizeName(exercise.name),
    );

    return namedMatch ?? previousDay.exercises[exerciseIndex];
  };

  const getPreviousSet = (exercise: ExerciseEntry, exerciseIndex: number, setIndex: number) =>
    findPreviousExercise(exercise, exerciseIndex)?.sets[setIndex];

  const previousSetLabel = (exercise: ExerciseEntry, exerciseIndex: number, setIndex: number) => {
    const previousSet = getPreviousSet(exercise, exerciseIndex, setIndex);

    if (!previousSet || (!previousSet.weight && !previousSet.reps)) {
      return "Prev: --";
    }

    const weight = previousSet.weight || "--";
    const reps = previousSet.reps || "--";
    return `Prev: ${weight}${currentWeek.bodyweight.unit} x ${reps}`;
  };

  const previousSetPlaceholder = (
    exercise: ExerciseEntry,
    exerciseIndex: number,
    setIndex: number,
    field: "weight" | "reps",
  ) => {
    const previousSet = getPreviousSet(exercise, exerciseIndex, setIndex);
    if (activeWeekIndex <= 0 || !previousSet) {
      return "0";
    }

    if (field === "weight") {
      return previousSet.weight ? `Last ${previousSet.weight}${currentWeek.bodyweight.unit}` : "0";
    }

    return previousSet.reps ? `Last ${previousSet.reps}` : "0";
  };

  const setProgressStatus = (
    exercise: ExerciseEntry,
    exerciseIndex: number,
    setIndex: number,
    currentSet: WorkoutSet,
  ): SetProgressStatus => {
    const previousSet = getPreviousSet(exercise, exerciseIndex, setIndex);
    const previousWeight = safeNumber(previousSet?.weight ?? "");
    const previousReps = safeNumber(previousSet?.reps ?? "");
    const currentWeight = safeNumber(currentSet.weight);
    const currentReps = safeNumber(currentSet.reps);

    if (!previousSet || previousWeight <= 0 || previousReps <= 0 || currentWeight <= 0 || currentReps <= 0) {
      return { symbol: "—", label: "No comparison", tone: "neutral" };
    }

    if (currentWeight > previousWeight || currentReps > previousReps) {
      return { symbol: "▲", label: "Progressive overload", tone: "positive" };
    }

    if (currentWeight === previousWeight && currentReps === previousReps) {
      return { symbol: "=", label: "Same as last week", tone: "neutral" };
    }

    return { symbol: "▼", label: "Below last week", tone: "negative" };
  };

  const calorieTotals = useMemo(() => calculateDayCalories(currentDay), [currentDay]);
  const dailyCalorieTarget = useMemo(
    () => resolveDailyCalorieTarget(dailyCalorieTargets, todayDateKey, currentDay.calories.target),
    [currentDay.calories.target, dailyCalorieTargets, todayDateKey],
  );
  const dailyCalorieTargetHint = dailyCalorieTarget
    ? dailyCalorieTarget.source === "previous"
      ? `Copied from ${dailyCalorieTarget.dateKey}`
      : dailyCalorieTarget.source === "today"
        ? "Saved for today"
        : "Saved for tomorrow"
    : "Set once, reused tomorrow";
  const macroTotals = useMemo(() => calculateDayMacroTotals(currentDay), [currentDay]);
  const quickCalorieLogs = useMemo(
    () => currentDay.calories.logs.filter((log) => !isMacroLog(log)),
    [currentDay.calories.logs],
  );
  const macroFoodLogs = useMemo(
    () => currentDay.calories.logs.filter(isMacroLog),
    [currentDay.calories.logs],
  );
  const macroTargets = useMemo(
    () =>
      macroTargetMode === "Custom"
        ? customMacroTargets
        : calculateAutoMacroTargets(goalMode, currentDay.calories.target),
    [currentDay.calories.target, customMacroTargets, goalMode, macroTargetMode],
  );

  const macroProgress = useMemo(
    () =>
      (Object.keys(macroTotals) as MacroName[]).reduce((accumulator, macroName) => {
        const target = safeNumber(macroTargets[macroName]);
        accumulator[macroName] = target > 0 ? Math.min(1, macroTotals[macroName] / target) : 0;
        return accumulator;
      }, {} as MacroValues),
    [macroTargets, macroTotals],
  );

  const weeklyVolumeData = useMemo(
    () =>
      weeks.map((week) => ({
        weekNumber: week.weekNumber,
        volume: calculateWeekVolume(week, extraWorkoutDays[week.id] ?? []),
      })),
    [extraWorkoutDays, weeks],
  );

  const maxWeeklyVolume = useMemo(
    () => Math.max(1, ...weeklyVolumeData.map((entry) => entry.volume)),
    [weeklyVolumeData],
  );

  const personalRecords = useMemo(
    () => scanPersonalRecords(weeks, extraWorkoutDays),
    [extraWorkoutDays, weeks],
  );

  const calendarCells = useMemo(
    () => buildLast28DayCalendarCells(completedDates),
    [completedDates],
  );

  const workoutOrNutritionStreak = useMemo(() => {
    let streak = 0;

    for (let weekIndex = weeks.length - 1; weekIndex >= 0; weekIndex -= 1) {
      const hasExtraWorkoutDays = (extraWorkoutDays[weeks[weekIndex].id] ?? [])
        .map((extraDay) =>
          extraDay.exercises.some((exercise) =>
            exercise.sets.some((set) => safeNumber(set.weight) > 0 && safeNumber(set.reps) > 0),
          ),
        )
        .reverse();

      for (const hasExtraWorkout of hasExtraWorkoutDays) {
        if (hasExtraWorkout) {
          streak += 1;
        } else if (streak > 0) {
          return streak;
        }
      }

      for (let dayIndex = DAY_NAMES.length - 1; dayIndex >= 0; dayIndex -= 1) {
        const day = weeks[weekIndex].days[DAY_NAMES[dayIndex]];
        const hasWorkout = day.exercises.some((exercise) =>
          exercise.sets.some((set) => safeNumber(set.weight) > 0 && safeNumber(set.reps) > 0),
        );
        const dayCalories = calculateDayCalories(day);
        const hitCalories = dayCalories.target > 0 && dayCalories.netCalories >= dayCalories.target;

        if (hasWorkout || hitCalories) {
          streak += 1;
        } else if (streak > 0) {
          return streak;
        }
      }
    }

    return streak;
  }, [extraWorkoutDays, weeks]);

  const weeklyAverageWeight = useMemo(() => {
    const weights = weeks.map((week) => safeNumber(week.bodyweight.value)).filter((value) => value > 0);
    if (weights.length === 0) {
      return 0;
    }

    return weights.reduce((total, value) => total + value, 0) / weights.length;
  }, [weeks]);

  const weightProgress = useMemo<WeightProgressStatus>(() => {
    const currentWeight = safeNumber(currentWeek.bodyweight.value);
    const previousWeight = previousWeek
      ? convertWeight(safeNumber(previousWeek.bodyweight.value), previousWeek.bodyweight.unit, currentWeek.bodyweight.unit)
      : 0;

    if (currentWeight <= 0 || previousWeight <= 0) {
      return { arrow: "—", label: "Add two weeks to compare", tone: "neutral" };
    }

    const delta = currentWeight - previousWeight;
    const roundedDelta = Math.abs(delta).toFixed(1);

    if (Math.abs(delta) < 0.05) {
      return { arrow: "=", label: `No change vs Week ${previousWeek?.weekNumber}`, tone: "neutral" };
    }

    const isIncrease = delta > 0;
    const isPositiveForGoal = goalMode === "Bulk" ? isIncrease : !isIncrease;

    return {
      arrow: isIncrease ? "▲" : "▼",
      label: `${isIncrease ? "+" : "-"}${roundedDelta} ${currentWeek.bodyweight.unit} vs Week ${previousWeek?.weekNumber}`,
      tone: isPositiveForGoal ? "positive" : "negative",
    };
  }, [currentWeek.bodyweight.unit, currentWeek.bodyweight.value, goalMode, previousWeek]);

  const setBodyweightValue = (value: string) => {
    updateCurrentWeek((week) => ({
      ...week,
      bodyweight: { ...week.bodyweight, value },
    }));
  };

  const toggleWeightUnit = () => {
    updateCurrentWeek((week) => ({
      ...week,
      bodyweight: {
        ...week.bodyweight,
        unit: week.bodyweight.unit === "lbs" ? "kg" : "lbs",
      },
    }));
  };

  const addWeek = () => {
    const previous = weeks[weeks.length - 1];
    const nextWeekNumber = (previous?.weekNumber ?? weeks.length) + 1;
    const nextWeek = createBlankWeek(nextWeekNumber, previous);
    setWeeks((previousWeeks) => [...previousWeeks, nextWeek]);
    setActiveWeekIndex(weeks.length);
    setActiveDay("Push");
    setActiveWorkoutDayId("Push");
  };

  const deleteCurrentWeek = () => {
    if (weeks.length <= 1) {
      return;
    }

    const deletedWeekId = currentWeek.id;
    const nextActiveIndex = Math.min(activeWeekIndex, weeks.length - 2);

    setWeeks((previousWeeks) => previousWeeks.filter((_, index) => index !== activeWeekIndex));
    setExtraWorkoutDays((previousExtraDays) => {
      const nextExtraDays = { ...previousExtraDays };
      delete nextExtraDays[deletedWeekId];
      return nextExtraDays;
    });
    setActiveWeekIndex(nextActiveIndex);
    setActiveDay("Push");
    setActiveWorkoutDayId("Push");
    setCompletedSets({});
    shouldVibrateWhenTimerEndsRef.current = false;
    warnedAtThreeSecondsRef.current = false;
    setRestSeconds(0);
  };

  const confirmDeleteCurrentWeek = () => {
    Alert.alert(
      "Delete Week",
      `Are you sure you want to delete Week ${currentWeek.weekNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", onPress: deleteCurrentWeek, style: "destructive" },
      ],
    );
  };

  const addExercise = () => {
    const trimmedName = newExerciseName.trim();
    if (!trimmedName) {
      return;
    }

    updateCurrentWorkoutDay((day) => ({
      ...day,
      exercises: [...day.exercises, makeExercise(trimmedName)],
    }));
    setNewExerciseName("");
  };

  const clearCompletedSetIds = (setIds: string[]) => {
    if (setIds.length === 0) {
      return;
    }

    setCompletedSets((previousCompletedSets) => {
      const nextCompletedSets = { ...previousCompletedSets };
      let changed = false;

      setIds.forEach((setId) => {
        if (nextCompletedSets[setId]) {
          delete nextCompletedSets[setId];
          changed = true;
        }
      });

      return changed ? nextCompletedSets : previousCompletedSets;
    });
  };

  const removeExercise = (exerciseId: string) => {
    const exerciseToRemove = currentWorkoutDay.exercises.find((exercise) => exercise.id === exerciseId);

    updateCurrentWorkoutDay((day) => ({
      ...day,
      exercises: day.exercises.filter((exercise) => exercise.id !== exerciseId),
    }));
    clearCompletedSetIds(exerciseToRemove?.sets.map((set) => set.id) ?? []);
    setSwipedExerciseId(null);
  };

  const moveExercise = (exerciseId: string, direction: -1 | 1) => {
    updateCurrentWorkoutDay((day) => {
      const currentIndex = day.exercises.findIndex((exercise) => exercise.id === exerciseId);
      const targetIndex = currentIndex + direction;

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= day.exercises.length) {
        return day;
      }

      const nextExercises = [...day.exercises];
      [nextExercises[currentIndex], nextExercises[targetIndex]] = [nextExercises[targetIndex], nextExercises[currentIndex]];

      return {
        ...day,
        exercises: nextExercises,
      };
    });
    setSwipedExerciseId(null);
  };

  const addSet = (exerciseId: string) => {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: [...exercise.sets, makeSet()],
    }));
  };

  const removeSet = (exerciseId: string, setId: string) => {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.filter((set) => set.id !== setId),
    }));

    clearCompletedSetIds([setId]);
  };

  const updateSet = (exerciseId: string, setId: string, field: keyof Pick<WorkoutSet, "weight" | "reps" | "rpe">, value: string) => {
    const nextValue = field === "rpe" ? formatRpeInput(value) : value;
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: nextValue } : set)),
    }));
  };

  const adjustSetWeight = (exerciseId: string, setId: string, deltaKg: number, fallbackWeight = "") => {
    const delta = currentWeek.bodyweight.unit === "kg" ? deltaKg : convertWeight(deltaKg, "kg", "lbs");

    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => {
        if (set.id !== setId) {
          return set;
        }

        const currentWeight = safeNumber(set.weight);
        const fallback = safeNumber(fallbackWeight);
        const baseWeight = currentWeight > 0 ? currentWeight : fallback;
        const nextWeight = Math.max(0, baseWeight + delta);

        return {
          ...set,
          weight: formatLoggedWeight(nextWeight),
        };
      }),
    }));
  };

  const copyPreviousSets = (exercise: ExerciseEntry, exerciseIndex: number) => {
    const previousExercise = findPreviousExercise(exercise, exerciseIndex);
    if (!previousExercise?.sets.length) {
      return;
    }

    updateExercise(exercise.id, (currentExercise) => ({
      ...currentExercise,
      sets: previousExercise.sets.map((set) => makeSet(set.weight, set.reps, set.rpe)),
    }));
  };

  const updateCalorieTarget = (value: string) => {
    updateCurrentWeek((week) => applyCalorieTargetToBaseDays(week, value));

    if (safeNumber(value) > 0) {
      setDailyCalorieTargets((previousTargets) => ({
        ...previousTargets,
        [todayDateKey]: value,
      }));
    }
  };

  const setCalorieDraft = (field: keyof FoodDraft, value: string) => {
    setCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: {
        ...previousDrafts[activeDay],
        [field]: value,
      },
    }));
  };

  const setQuickCalorieDraft = (type: CalorieLogType, value: string) => {
    setQuickCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: {
        ...previousDrafts[activeDay],
        [type]: value,
      },
    }));
  };

  const submitQuickCalorieLog = (type: CalorieLogType) => {
    const amount = safeNumber(quickCalorieDraft[type]);

    if (amount <= 0) {
      return;
    }

    updateCurrentDay((day) => ({
      ...day,
      calories: {
        ...day.calories,
        logs: [makeCalorieLog(type, amount, undefined, EMPTY_MACROS, "quick"), ...day.calories.logs],
      },
    }));

    setQuickCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: {
        ...previousDrafts[activeDay],
        [type]: "",
      },
    }));
  };

  const submitFoodLog = () => {
    const amount = Number(calorieDraft.calories);

    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const macros: MacroValues = {
      protein: Math.max(0, safeNumber(calorieDraft.protein)),
      carbs: Math.max(0, safeNumber(calorieDraft.carbs)),
      fats: Math.max(0, safeNumber(calorieDraft.fats)),
    };
    const label = calorieDraft.name.trim() || "Food";

    updateCurrentDay((day) => ({
      ...day,
      calories: {
        ...day.calories,
        logs: [makeCalorieLog("add", amount, label, macros, "macro"), ...day.calories.logs],
      },
    }));

    setCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: emptyFoodDraft(),
    }));
  };

  const deleteCalorieLog = (logId: string) => {
    updateCurrentDay((day) => ({
      ...day,
      calories: {
        ...day.calories,
        logs: day.calories.logs.filter((log) => log.id !== logId),
      },
    }));
  };

  const addCompletedDateForToday = () => {
    const todayKey = formatDateKey(new Date());
    setCompletedDates((previousDates) => {
      if (previousDates.includes(todayKey)) {
        return previousDates;
      }

      return [todayKey, ...previousDates];
    });
  };

  const beginExerciseSwipe = (exerciseId: string, x: number, y: number) => {
    exerciseSwipeStartRef.current = { exerciseId, x, y };
  };

  const finishExerciseSwipe = (exerciseId: string, x: number, y: number) => {
    const start = exerciseSwipeStartRef.current;
    exerciseSwipeStartRef.current = null;

    if (!start || start.exerciseId !== exerciseId) {
      return;
    }

    const deltaX = x - start.x;
    const deltaY = y - start.y;

    if (Math.abs(deltaY) > EXERCISE_SWIPE_VERTICAL_TOLERANCE || Math.abs(deltaX) < EXERCISE_SWIPE_THRESHOLD) {
      return;
    }

    setSwipedExerciseId(deltaX < 0 ? exerciseId : null);
  };

  const toggleSetComplete = (setId: string) => {
    const shouldStartTimer = !completedSets[setId];
    if (shouldStartTimer && timerSettings.enabled) {
      shouldVibrateWhenTimerEndsRef.current = true;
      warnedAtThreeSecondsRef.current = false;
      setRestSeconds(timerSettings.duration);
    }

    if (shouldStartTimer) {
      addCompletedDateForToday();
    }

    setCompletedSets((previousCompletedSets) => {
      if (previousCompletedSets[setId]) {
        const nextCompletedSets = { ...previousCompletedSets };
        delete nextCompletedSets[setId];
        return nextCompletedSets;
      }

      return {
        ...previousCompletedSets,
        [setId]: new Date().toISOString(),
      };
    });
  };

  const openPlateCalculator = (exerciseName: string, weight: string) => {
    const parsedWeight = safeNumber(weight);
    if (parsedWeight <= 0) {
      return;
    }

    setPlateModal({ exerciseName, weight: parsedWeight });
  };

  const updateMacroTarget = (macroName: MacroName, value: string) => {
    setMacroTargetMode("Custom");
    setCustomMacroTargets((previousTargets) => ({
      ...previousTargets,
      [macroName]: value,
    }));
  };

  const selectWorkoutDay = (dayId: string) => {
    setActiveWorkoutDayId(dayId);
    if (DAY_NAMES.includes(dayId as WorkoutDayName)) {
      setActiveDay(dayId as WorkoutDayName);
    }
  };

  const addExtraWorkoutDay = (preset: ExtraWorkoutDayPreset) => {
    const presetConfig = EXTRA_DAY_PRESETS.find((option) => option.label === preset) ?? EXTRA_DAY_PRESETS[0];
    const customLabel = customDayName.trim();
    const baseDay = preset === "Custom" ? activeDay : presetConfig.baseDay;
    const label = preset === "Custom" ? customLabel || `Custom Day ${currentExtraWorkoutDays.length + 1}` : presetConfig.label;
    const nextDay: ExtraWorkoutDayEntry = {
      id: makeId("extra_day"),
      label,
      baseDay,
      exercises: [],
      calories: makeCalories(currentWeek.days[baseDay].calories.target),
      createdAt: new Date().toISOString(),
    };

    setExtraWorkoutDays((previousExtraDays) => ({
      ...previousExtraDays,
      [currentWeek.id]: [...(previousExtraDays[currentWeek.id] ?? []), nextDay],
    }));
    setActiveWorkoutDayId(nextDay.id);
    setCustomDayName("");
    setIsAddDayModalVisible(false);
  };

  const setRestTimerDuration = (duration: number) => {
    const nextDuration = Math.max(MIN_REST_SECONDS, Math.round(duration));
    setTimerSettings((previousSettings) => ({ ...previousSettings, duration: nextDuration }));
    setTimerDurationDraft(String(nextDuration));
  };

  const adjustTimerDuration = (delta: number) => {
    setRestTimerDuration(timerSettings.duration + delta);
  };

  const updateTimerDurationDraft = (value: string) => {
    setTimerDurationDraft(value.replace(/[^0-9]/g, ""));
  };

  const applyTimerDurationDraft = () => {
    const nextDuration = safeNumber(timerDurationDraft);

    if (nextDuration <= 0) {
      setTimerDurationDraft(String(timerSettings.duration));
      return;
    }

    setRestTimerDuration(nextDuration);
  };

  const toggleTimerEnabled = () => {
    setTimerSettings((previousSettings) => {
      const enabled = !previousSettings.enabled;
      if (!enabled) {
        shouldVibrateWhenTimerEndsRef.current = false;
        warnedAtThreeSecondsRef.current = false;
        setRestSeconds(0);
      }

      return { ...previousSettings, enabled };
    });
  };

  const toggleMacroTargetMode = (mode: MacroTargetMode) => {
    if (mode === "Custom" && macroTargetMode === "Auto") {
      setCustomMacroTargets(macroTargets);
    }

    setMacroTargetMode(mode);
  };

  const renderStorageWarning = () =>
    storageError ? (
      <View style={styles.warningBanner}>
        <Text style={styles.warningText}>{storageError}</Text>
      </View>
    ) : null;

  const renderWeekSelector = () => (
    <View style={styles.weekPanel}>
      <View style={styles.weekSelector}>
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={activeWeekIndex === 0}
          onPress={() => setActiveWeekIndex((index) => Math.max(0, index - 1))}
          style={[styles.weekButton, activeWeekIndex === 0 && styles.disabledButton]}
        >
          <Text style={styles.weekButtonText}>Prev</Text>
        </TouchableOpacity>

        <View style={styles.weekTitleBlock}>
          <Text style={styles.labelText}>Training Week</Text>
          <Text style={styles.weekTitle}>Week {currentWeek.weekNumber}</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.75}
          disabled={activeWeekIndex === weeks.length - 1}
          onPress={() => setActiveWeekIndex((index) => Math.min(weeks.length - 1, index + 1))}
          style={[styles.weekButton, activeWeekIndex === weeks.length - 1 && styles.disabledButton]}
        >
          <Text style={styles.weekButtonText}>Next</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.8} onPress={addWeek} style={styles.addWeekButton}>
        <Text style={styles.addWeekText}>Start New Week</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.8}
        disabled={weeks.length <= 1}
        onPress={confirmDeleteCurrentWeek}
        style={[styles.deleteWeekButton, weeks.length <= 1 && styles.disabledButton]}
      >
        <Text style={styles.deleteWeekText}>Delete Week</Text>
      </TouchableOpacity>
    </View>
  );

  const renderDayTabs = () => (
    <ScrollView horizontal bounces={false} contentContainerStyle={styles.dayTabsContent} showsHorizontalScrollIndicator={false}>
      {DAY_NAMES.map((dayName) => {
        const isActive = activeDay === dayName;
        return (
          <TouchableOpacity
            activeOpacity={0.8}
            key={dayName}
            onPress={() => setActiveDay(dayName)}
            style={[styles.dayTab, isActive && styles.activeDayTab]}
          >
            <Text style={[styles.dayTabText, isActive && styles.activeDayTabText]}>{dayName}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderWorkoutDayTabs = () => (
    <View style={styles.workoutTabsBlock}>
      <ScrollView horizontal bounces={false} contentContainerStyle={styles.dayTabsContent} showsHorizontalScrollIndicator={false}>
        {DAY_NAMES.map((dayName) => {
          const isActive = activeWorkoutDayId === dayName;
          return (
            <TouchableOpacity
              activeOpacity={0.8}
              key={dayName}
              onPress={() => selectWorkoutDay(dayName)}
              style={[styles.dayTab, isActive && styles.activeDayTab]}
            >
              <Text style={[styles.dayTabText, isActive && styles.activeDayTabText]}>{dayName}</Text>
            </TouchableOpacity>
          );
        })}
        {currentExtraWorkoutDays.map((day) => {
          const isActive = activeWorkoutDayId === day.id;
          return (
            <TouchableOpacity
              activeOpacity={0.8}
              key={day.id}
              onPress={() => selectWorkoutDay(day.id)}
              style={[styles.dayTab, styles.extraDayTab, isActive && styles.activeDayTab]}
            >
              <Text style={[styles.dayTabText, isActive && styles.activeDayTabText]}>{day.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setIsAddDayModalVisible(true)} style={styles.addDayButton}>
        <Text style={styles.addDayButtonText}>+ Add Day</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRestTimer = () => {
    if (!timerSettings.enabled) {
      return null;
    }

    return (
      <View style={[styles.timerPanel, restSeconds > 0 && styles.activeTimerPanel]}>
        <View>
          <Text style={[styles.labelText, restSeconds > 0 && styles.activeTimerText]}>Rest Timer</Text>
          <Text style={[styles.timerHint, restSeconds > 0 && styles.activeTimerSubtext]}>
            {restSeconds > 0 ? "Next set in" : `${timerSettings.duration}s when a set is checked`}
          </Text>
        </View>
        <Text style={[styles.timerValue, restSeconds > 0 && styles.activeTimerValue]}>{formatTimer(restSeconds)}</Text>
      </View>
    );
  };

  const renderMacroBar = (macroName: MacroName) => {
    const target = safeNumber(macroTargets[macroName]);
    return (
      <View key={macroName} style={styles.macroCard}>
        <View style={styles.macroHeader}>
          <Text style={styles.macroTitle}>{MACRO_LABELS[macroName]}</Text>
          <Text style={styles.macroMeta}>
            {macroTotals[macroName]} / {target || 0}g
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${macroProgress[macroName] * 100}%` }]} />
        </View>
        <View style={styles.macroInputRow}>
          <TextInput
            editable={macroTargetMode === "Custom"}
            keyboardType="number-pad"
            onChangeText={(value) => updateMacroTarget(macroName, value)}
            placeholder={macroTargetMode === "Custom" ? "Target" : "Auto"}
            placeholderTextColor={theme.placeholder}
            style={[styles.macroInput, macroTargetMode === "Auto" && styles.disabledInput]}
            value={macroTargets[macroName]}
          />
        </View>
      </View>
    );
  };

  const renderPlateModal = () => {
    const targetKg = plateModal ? toKilograms(plateModal.weight, currentWeek.bodyweight.unit) : 0;
    let sideWeight = Math.max(0, (targetKg - BAR_WEIGHT_KG) / 2);
    const plates = PLATE_OPTIONS_KG.map((plate) => {
      const count = Math.floor(sideWeight / plate);
      sideWeight -= count * plate;
      return { count, plate };
    });

    return (
      <Modal animationType="fade" transparent visible={Boolean(plateModal)} onRequestClose={() => setPlateModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Plate Calculator</Text>
                <Text style={styles.sectionSubtitle}>{plateModal?.exerciseName ?? "Exercise"}</Text>
              </View>
              <TouchableOpacity activeOpacity={0.75} onPress={() => setPlateModal(null)} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.plateTotal}>{Math.round(targetKg)}kg total</Text>
            <Text style={styles.sectionSubtitle}>Olympic bar: {BAR_WEIGHT_KG}kg. Plates per side:</Text>
            <View style={styles.plateList}>
              {plates.map((entry) => (
                <View key={entry.plate} style={styles.plateRow}>
                  <Text style={styles.plateWeight}>{entry.plate}kg</Text>
                  <Text style={styles.plateCount}>{entry.count} each side</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAddDayModal = () => (
    <Modal animationType="fade" transparent visible={isAddDayModalVisible} onRequestClose={() => setIsAddDayModalVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Add Workout Day</Text>
              <Text style={styles.sectionSubtitle}>Create an extra session in Week {currentWeek.weekNumber}.</Text>
            </View>
            <TouchableOpacity activeOpacity={0.75} onPress={() => setIsAddDayModalVisible(false)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.extraDayOptions}>
            {EXTRA_DAY_PRESETS.filter((option) => option.label !== "Custom").map((option) => (
              <TouchableOpacity
                activeOpacity={0.8}
                key={option.label}
                onPress={() => addExtraWorkoutDay(option.label)}
                style={styles.extraDayOptionButton}
              >
                <Text style={styles.extraDayOptionTitle}>{option.label}</Text>
                <Text style={styles.extraDayOptionMeta}>Based on {option.baseDay}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.customDayBox}>
            <Text style={styles.labelText}>Custom</Text>
            <View style={styles.calorieInputRow}>
              <TextInput
                onChangeText={setCustomDayName}
                placeholder="Custom day name"
                placeholderTextColor={theme.placeholder}
                style={styles.calorieInput}
                value={customDayName}
              />
              <TouchableOpacity activeOpacity={0.8} onPress={() => addExtraWorkoutDay("Custom")} style={styles.calorieActionButton}>
                <Text style={styles.calorieActionButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderWorkoutTab = () => (
    <ScrollView bounces contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.screenTitle}>Workouts</Text>
          <Text style={styles.screenSubtitle}>Week {currentWeek.weekNumber} - {currentWorkoutDayLabel}</Text>
        </View>
      </View>

      {renderStorageWarning()}
      {renderRestTimer()}
      {renderWeekSelector()}
      {renderWorkoutDayTabs()}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{currentWorkoutDayLabel}</Text>
          <Text style={styles.sectionSubtitle}>
            {timerSettings.enabled ? "Tap weight for plates. Check a set to start rest." : "Tap weight for plates. Rest timer is hidden."}
          </Text>
        </View>
      </View>

      <View style={styles.addExerciseRow}>
        <TextInput
          onChangeText={setNewExerciseName}
          placeholder="Add exercise"
          placeholderTextColor={theme.placeholder}
          returnKeyType="done"
          onSubmitEditing={addExercise}
          style={styles.exerciseInput}
          value={newExerciseName}
        />
        <TouchableOpacity activeOpacity={0.8} onPress={addExercise} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {currentWorkoutDay.exercises.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No exercises yet</Text>
          <Text style={styles.emptyBody}>Add your first movement and start logging quality work.</Text>
        </View>
      ) : (
        currentWorkoutDay.exercises.map((exercise, exerciseIndex) => {
          const hasPreviousSets = Boolean(findPreviousExercise(exercise, exerciseIndex)?.sets.length);
          const oneRepMax = calculateExerciseOneRepMax(exercise);
          const isSwipeOpen = swipedExerciseId === exercise.id;

          return (
            <View
              key={exercise.id}
              onTouchCancel={() => {
                exerciseSwipeStartRef.current = null;
              }}
              onTouchEnd={(event) => finishExerciseSwipe(exercise.id, event.nativeEvent.pageX, event.nativeEvent.pageY)}
              onTouchStart={(event) => beginExerciseSwipe(exercise.id, event.nativeEvent.pageX, event.nativeEvent.pageY)}
              style={styles.exerciseSwipeFrame}
            >
              {isSwipeOpen ? (
                <View style={styles.swipeActionRail}>
                  <TouchableOpacity activeOpacity={0.82} onPress={() => removeExercise(exercise.id)} style={styles.swipeDeleteButton}>
                    <Text style={styles.swipeDeleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={[styles.exerciseCard, isSwipeOpen && styles.exerciseCardSwiped]}>
              <View style={styles.exerciseHeader}>
                <View style={styles.exerciseTitleWrap}>
                  <TextInput
                    onChangeText={(value) =>
                      updateExercise(exercise.id, (currentExercise) => ({
                        ...currentExercise,
                        name: value,
                      }))
                    }
                    placeholder="Exercise name"
                    placeholderTextColor={theme.placeholder}
                    style={styles.exerciseNameInput}
                    value={exercise.name}
                  />
                  <Text style={styles.oneRepMaxText}>{oneRepMax > 0 ? `Est. 1RM ${Math.round(oneRepMax)}${currentWeek.bodyweight.unit}` : "Est. 1RM --"}</Text>
                </View>
                <View style={styles.exerciseHeaderActions}>
                  <View style={styles.exerciseOrderControls}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      disabled={exerciseIndex === 0}
                      onPress={() => moveExercise(exercise.id, -1)}
                      style={[styles.orderButton, exerciseIndex === 0 && styles.disabledIconButton]}
                    >
                      <Text style={styles.orderButtonText}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      disabled={exerciseIndex === currentWorkoutDay.exercises.length - 1}
                      onPress={() => moveExercise(exercise.id, 1)}
                      style={[
                        styles.orderButton,
                        exerciseIndex === currentWorkoutDay.exercises.length - 1 && styles.disabledIconButton,
                      ]}
                    >
                      <Text style={styles.orderButtonText}>↓</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity activeOpacity={0.75} onPress={() => removeExercise(exercise.id)} style={styles.removeExerciseButton}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.setHeaderRow}>
                <Text style={styles.setHeaderIndex}>Set</Text>
                <Text style={styles.setHeaderText}>Weight</Text>
                <Text style={styles.setHeaderText}>Reps</Text>
                <Text style={styles.setHeaderRpe}>RPE</Text>
                <Text style={styles.setHeaderDone}>Done</Text>
                <Text style={styles.setHeaderDelete}>Del</Text>
              </View>

              {exercise.sets.map((set, setIndex) => {
                const previousSet = getPreviousSet(exercise, exerciseIndex, setIndex);
                const progressStatus = setProgressStatus(exercise, exerciseIndex, setIndex, set);
                const isMaxEffort = Boolean(completedSets[set.id]) && safeNumber(set.rpe) >= 10;
                const weightPlaceholder = previousSetPlaceholder(exercise, exerciseIndex, setIndex, "weight");
                const repsPlaceholder = previousSetPlaceholder(exercise, exerciseIndex, setIndex, "reps");
                const progressBadgeStyle =
                  progressStatus.tone === "positive"
                    ? styles.positiveProgressBadge
                    : progressStatus.tone === "negative"
                      ? styles.negativeProgressBadge
                      : styles.neutralProgressBadge;
                const progressTextStyle =
                  progressStatus.tone === "positive"
                    ? styles.positiveProgressText
                    : progressStatus.tone === "negative"
                      ? styles.negativeProgressText
                      : styles.neutralProgressText;
                return (
                  <View key={set.id} style={styles.setRow}>
                    <View style={styles.setMainRow}>
                      <Text style={styles.setNumber}>{setIndex + 1}</Text>
                      <View style={styles.setWeightCell}>
                        <TextInput
                          keyboardType="decimal-pad"
                          onChangeText={(value) => updateSet(exercise.id, set.id, "weight", value)}
                          onFocus={() => openPlateCalculator(exercise.name, set.weight)}
                          onPressIn={() => openPlateCalculator(exercise.name, set.weight)}
                          placeholder={weightPlaceholder}
                          placeholderTextColor={theme.placeholder}
                          style={styles.setWeightInput}
                          value={set.weight}
                        />
                        <View style={styles.weightQuickActions}>
                          <TouchableOpacity
                            activeOpacity={0.76}
                            delayLongPress={260}
                            onLongPress={() =>
                              adjustSetWeight(exercise.id, set.id, -QUICK_WEIGHT_LONG_PRESS_STEP_KG, previousSet?.weight)
                            }
                            onPress={() => adjustSetWeight(exercise.id, set.id, -QUICK_WEIGHT_TAP_STEP_KG, previousSet?.weight)}
                            style={styles.weightQuickButton}
                          >
                            <Text style={styles.weightQuickText}>-</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.76}
                            delayLongPress={260}
                            onLongPress={() =>
                              adjustSetWeight(exercise.id, set.id, QUICK_WEIGHT_LONG_PRESS_STEP_KG, previousSet?.weight)
                            }
                            onPress={() => adjustSetWeight(exercise.id, set.id, QUICK_WEIGHT_TAP_STEP_KG, previousSet?.weight)}
                            style={styles.weightQuickButton}
                          >
                            <Text style={styles.weightQuickText}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity activeOpacity={0.8} onPress={() => openPlateCalculator(exercise.name, set.weight)} style={styles.plateMiniButton}>
                          <Text style={styles.plateMiniButtonText}>kg</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        keyboardType="number-pad"
                        onChangeText={(value) => updateSet(exercise.id, set.id, "reps", value)}
                        placeholder={repsPlaceholder}
                        placeholderTextColor={theme.placeholder}
                        style={styles.setInput}
                        value={set.reps}
                      />
                      <TextInput
                        keyboardType="number-pad"
                        maxLength={2}
                        onChangeText={(value) => updateSet(exercise.id, set.id, "rpe", value)}
                        placeholder="1-10"
                        placeholderTextColor={theme.placeholder}
                        style={styles.rpeInput}
                        value={set.rpe}
                      />
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => toggleSetComplete(set.id)}
                        style={[styles.doneSetButton, completedSets[set.id] && styles.doneSetButtonActive]}
                      >
                        <Text style={[styles.doneSetText, completedSets[set.id] && styles.doneSetTextActive]}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => removeSet(exercise.id, set.id)}
                        style={styles.removeSetButton}
                      >
                        <Text style={styles.removeSetText}>X</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.previousLine}>
                      <Text style={styles.previousLineLabel}>Previous</Text>
                      <View style={styles.previousBadge}>
                        <Text numberOfLines={1} style={styles.previousBadgeText}>
                          {previousSetLabel(exercise, exerciseIndex, setIndex)}
                        </Text>
                      </View>
                      <View style={[styles.progressBadge, progressBadgeStyle]}>
                        <Text style={[styles.progressSymbol, progressTextStyle]}>
                          {progressStatus.symbol}
                        </Text>
                        <Text numberOfLines={1} style={[styles.progressLabel, progressTextStyle]}>
                          {progressStatus.label}
                        </Text>
                      </View>
                    </View>
                    {isMaxEffort ? (
                      <View style={styles.maxEffortBadge}>
                        <Text style={styles.maxEffortText}>🔥 Max Effort</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <View style={styles.exerciseActions}>
                <TouchableOpacity activeOpacity={0.8} onPress={() => addSet(exercise.id)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Add Set</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={!hasPreviousSets}
                  onPress={() => copyPreviousSets(exercise, exerciseIndex)}
                  style={[styles.outlineButton, !hasPreviousSets && styles.disabledButton]}
                >
                  <Text style={styles.outlineButtonText}>Same Last Week</Text>
                </TouchableOpacity>
              </View>
            </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  const renderNutritionTab = () => (
    <ScrollView bounces contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.screenTitle}>Nutrition</Text>
          <Text style={styles.screenSubtitle}>Week {currentWeek.weekNumber} - {activeDay}, synced from Workouts.</Text>
        </View>
      </View>

      {renderStorageWarning()}

      <View style={styles.metricGrid}>
        <View style={[styles.metricCard, styles.metricCardWide]}>
          <Text style={styles.labelText}>Target</Text>
          <TextInput
            keyboardType="number-pad"
            onChangeText={updateCalorieTarget}
            placeholder="2500"
            placeholderTextColor={theme.placeholder}
            style={styles.metricInput}
            value={currentDay.calories.target}
          />
          <Text style={styles.smallMetricText}>{dailyCalorieTargetHint}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.labelText}>Consumed</Text>
          <Text style={styles.metricValue}>{calorieTotals.added}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.labelText}>Remaining</Text>
          <Text style={styles.metricValue}>{Math.round(calorieTotals.remaining)}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${calorieTotals.progress * 100}%` }]} />
      </View>

      <View style={styles.segmentControl}>
        {renderSegmentOption<NutritionMode>("Quick Calories", nutritionMode, setNutritionMode, "Quick Calories")}
        {renderSegmentOption<NutritionMode>("Macro Tracker", nutritionMode, setNutritionMode, "Macro Tracker")}
      </View>

      {nutritionMode === "Quick Calories" ? (
        <>
          <View style={styles.calorieInputGrid}>
            <View style={styles.calorieInputBlock}>
              <Text style={styles.calorieInputLabel}>Add Calories</Text>
              <View style={styles.calorieInputRow}>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => setQuickCalorieDraft("add", value)}
                  placeholder="+250"
                  placeholderTextColor={theme.placeholder}
                  style={styles.calorieInput}
                  value={quickCalorieDraft.add}
                />
                <TouchableOpacity activeOpacity={0.8} onPress={() => submitQuickCalorieLog("add")} style={styles.calorieActionButton}>
                  <Text style={styles.calorieActionButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.calorieInputBlock}>
              <Text style={styles.calorieInputLabel}>Subtract Calories</Text>
              <View style={styles.calorieInputRow}>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => setQuickCalorieDraft("extract", value)}
                  placeholder="-100"
                  placeholderTextColor={theme.placeholder}
                  style={styles.calorieInput}
                  value={quickCalorieDraft.extract}
                />
                <TouchableOpacity activeOpacity={0.8} onPress={() => submitQuickCalorieLog("extract")} style={styles.calorieActionButton}>
                  <Text style={styles.calorieActionButtonText}>Subtract</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Quick Logs</Text>
            <Text style={styles.historyCount}>{quickCalorieLogs.length} entries</Text>
          </View>
          {quickCalorieLogs.length === 0 ? (
            <Text style={styles.noHistoryText}>No quick calorie logs yet.</Text>
          ) : (
            quickCalorieLogs.map((log) => (
              <View key={log.id} style={styles.historyRow}>
                <View style={[styles.historyTypeDot, log.type === "extract" && styles.extractDot]} />
                <View style={styles.historyCopy}>
                  <Text style={styles.historyMain}>
                    {log.type === "add" ? "+" : "-"}
                    {log.amount} kcal
                  </Text>
                  <Text style={styles.historyDate}>{formatDateTime(log.createdAt)}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.75} onPress={() => deleteCalorieLog(log.id)} style={styles.deleteLogButton}>
                  <Text style={styles.deleteLogText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Macro Targets</Text>
              <Text style={styles.sectionSubtitle}>
                {macroTargetMode === "Auto" ? `${goalMode}: calculated from calorie target.` : "Custom grams from Settings."}
              </Text>
            </View>
          </View>
          {(Object.keys(macroTotals) as MacroName[]).map(renderMacroBar)}

          <View style={styles.calorieInputGrid}>
            <View style={styles.calorieInputBlock}>
              <Text style={styles.calorieInputLabel}>Food</Text>
              <TextInput
                onChangeText={(value) => setCalorieDraft("name", value)}
                placeholder="Food name"
                placeholderTextColor={theme.placeholder}
                style={styles.calorieInput}
                value={calorieDraft.name}
              />
            </View>
            <View style={styles.calorieInputBlock}>
              <Text style={styles.calorieInputLabel}>Calories</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) => setCalorieDraft("calories", value)}
                placeholder="500"
                placeholderTextColor={theme.placeholder}
                style={styles.calorieInput}
                value={calorieDraft.calories}
              />
            </View>
            <View style={styles.foodMacroGrid}>
              {(Object.keys(MACRO_LABELS) as MacroName[]).map((macroName) => (
                <View key={macroName} style={styles.foodMacroInputBlock}>
                  <Text style={styles.calorieInputLabel}>{MACRO_LABELS[macroName]}</Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={(value) => setCalorieDraft(macroName, value)}
                    placeholder="0g"
                    placeholderTextColor={theme.placeholder}
                    style={styles.calorieInput}
                    value={calorieDraft[macroName]}
                  />
                </View>
              ))}
            </View>
            <TouchableOpacity activeOpacity={0.8} onPress={submitFoodLog} style={styles.addWeekButton}>
              <Text style={styles.addWeekText}>Add Meal</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Meals</Text>
            <Text style={styles.historyCount}>{macroFoodLogs.length} entries</Text>
          </View>
          {macroFoodLogs.length === 0 ? (
            <Text style={styles.noHistoryText}>No macro meals logged yet.</Text>
          ) : (
            macroFoodLogs.map((log) => {
              const logMacros = log.macros ?? EMPTY_MACROS;
              return (
                <View key={log.id} style={styles.historyRow}>
                  <View style={styles.historyTypeDot} />
                  <View style={styles.historyCopy}>
                    <Text style={styles.historyMain}>
                      {log.label ?? "Meal"} - +{log.amount} kcal
                    </Text>
                    <Text style={styles.historyDate}>
                      {formatDateTime(log.createdAt)} - {formatMacroSummary(logMacros)}
                    </Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.75} onPress={() => deleteCalorieLog(log.id)} style={styles.deleteLogButton}>
                    <Text style={styles.deleteLogText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );

  const renderWeightTab = () => (
    <ScrollView bounces contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.screenTitle}>Weight</Text>
          <Text style={styles.screenSubtitle}>Week {currentWeek.weekNumber}, synced from Workouts.</Text>
        </View>
      </View>

      {renderStorageWarning()}

      <View style={styles.weightHero}>
        <Text style={styles.labelText}>Current Bodyweight</Text>
        <View style={styles.weightValueRow}>
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setBodyweightValue}
            placeholder="182.8"
            placeholderTextColor={theme.placeholder}
            style={styles.bodyweightLargeInput}
            value={currentWeek.bodyweight.value}
          />
          <TouchableOpacity activeOpacity={0.75} onPress={toggleWeightUnit} style={styles.weightUnitButton}>
            <Text style={styles.weightUnitButtonText}>{currentWeek.bodyweight.unit}</Text>
          </TouchableOpacity>
        </View>
        <View
          style={[
            styles.weightProgressBadge,
            weightProgress.tone === "positive"
              ? styles.positiveProgressBadge
              : weightProgress.tone === "negative"
                ? styles.negativeProgressBadge
                : styles.neutralProgressBadge,
          ]}
        >
          <Text
            style={[
              styles.weightProgressArrow,
              weightProgress.tone === "positive"
                ? styles.positiveProgressText
                : weightProgress.tone === "negative"
                  ? styles.negativeProgressText
                  : styles.neutralProgressText,
            ]}
          >
            {weightProgress.arrow}
          </Text>
          <View style={styles.weightProgressCopy}>
            <Text
              style={[
                styles.weightProgressLabel,
                weightProgress.tone === "positive"
                  ? styles.positiveProgressText
                  : weightProgress.tone === "negative"
                    ? styles.negativeProgressText
                    : styles.neutralProgressText,
              ]}
            >
              {weightProgress.label}
            </Text>
            <Text style={styles.weightProgressMeta}>Goal Mode: {goalMode}</Text>
          </View>
        </View>
      </View>

      <View style={styles.averagePanel}>
        <Text style={styles.labelText}>Weekly Average</Text>
        <Text style={styles.averageValue}>
          {weeklyAverageWeight > 0 ? `${weeklyAverageWeight.toFixed(1)} ${currentWeek.bodyweight.unit}` : "--"}
        </Text>
      </View>

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Weight History</Text>
        <Text style={styles.historyCount}>{weeks.length} entries</Text>
      </View>
      <View style={styles.weightHistoryList}>
        {[...weeks].reverse().map((week, reverseIndex) => {
          const originalIndex = weeks.length - 1 - reverseIndex;
          return (
            <View key={week.id} style={styles.weightHistoryRow}>
              <View>
                <Text style={styles.weightHistoryWeek}>Week {week.weekNumber}</Text>
                <Text style={styles.weightHistoryMeta}>{formatWeightEntryDate(weeks.length, originalIndex)}</Text>
              </View>
              <Text style={styles.weightHistoryValue}>
                {week.bodyweight.value ? `${week.bodyweight.value} ${week.bodyweight.unit}` : "--"}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderAnalyticsTab = () => (
    <ScrollView bounces contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.screenTitle}>Analytics</Text>
          <Text style={styles.screenSubtitle}>Progressive overload at a glance.</Text>
        </View>
      </View>

      <View style={styles.analyticsGrid}>
        <View style={styles.analyticsCard}>
          <Text style={styles.labelText}>Streak</Text>
          <Text style={styles.analyticsNumber}>{workoutOrNutritionStreak}</Text>
          <Text style={styles.sectionSubtitle}>completed workout or calorie-goal days</Text>
        </View>
        <View style={styles.analyticsCard}>
          <Text style={styles.labelText}>Current Volume</Text>
          <Text style={styles.analyticsNumber}>{Math.round(calculateWeekVolume(currentWeek, currentExtraWorkoutDays))}</Text>
          <Text style={styles.sectionSubtitle}>sets x reps x load</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Consistency Calendar</Text>
          <Text style={styles.historyCount}>Last 28 days</Text>
        </View>
        <View style={styles.calendarGrid}>
          {calendarCells.map((cell) => (
            <View
              key={cell.key}
              style={[
                styles.calendarCell,
                cell.completed && styles.calendarCellCompleted,
                cell.isToday && styles.calendarCellToday,
              ]}
            >
              <Text style={[styles.calendarCellText, cell.completed && styles.calendarCellTextCompleted]}>
                {cell.dayNumber}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Personal Records</Text>
          <Text style={styles.historyCount}>{personalRecords.length} lifts</Text>
        </View>
        {personalRecords.length === 0 ? (
          <Text style={styles.noHistoryText}>No personal records yet.</Text>
        ) : (
          personalRecords.map((record) => (
            <View key={`${record.exerciseName}-${record.weekNumber}`} style={styles.prRow}>
              <View style={styles.prCopy}>
                <Text style={styles.prExercise}>{record.exerciseName}</Text>
                <Text style={styles.prMeta}>Week {record.weekNumber}</Text>
              </View>
              <Text style={styles.prValue}>
                {record.weight}{record.unit} x {record.reps} reps
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.chartCard}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Total Volume</Text>
          <Text style={styles.historyCount}>by week</Text>
        </View>
        <View style={styles.volumeChart}>
          {weeklyVolumeData.map((entry) => {
            const height = Math.max(18, (entry.volume / maxWeeklyVolume) * 150);
            return (
              <View key={entry.weekNumber} style={styles.volumeBarColumn}>
                <Text style={styles.volumeValue}>{Math.round(entry.volume)}</Text>
                <View style={[styles.volumeBar, { height }]} />
                <Text style={styles.volumeLabel}>W{entry.weekNumber}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.historyTitle}>Estimated 1RM Snapshot</Text>
        {currentWorkoutDay.exercises.map((exercise) => (
          <View key={exercise.id} style={styles.oneRmRow}>
            <Text style={styles.oneRmName}>{exercise.name}</Text>
            <Text style={styles.oneRmValue}>{Math.round(calculateExerciseOneRepMax(exercise)) || "--"} {currentWeek.bodyweight.unit}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderSegmentOption = <T extends string,>(
    value: T,
    activeValue: T,
    onSelect: (nextValue: T) => void,
    label: string,
  ) => {
    const isActive = value === activeValue;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onSelect(value)}
        style={[styles.segmentOption, isActive && styles.segmentOptionActive]}
      >
        <Text style={[styles.segmentOptionText, isActive && styles.segmentOptionTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderSettingsTab = () => (
    <ScrollView bounces contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.screenTitle}>Settings</Text>
          <Text style={styles.screenSubtitle}>Goals, appearance, and rest timer.</Text>
        </View>
      </View>

      {renderStorageWarning()}

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Goal Mode</Text>
        <Text style={styles.sectionSubtitle}>Weight progress colors adapt to this goal.</Text>
        <View style={styles.segmentControl}>
          {renderSegmentOption<GoalMode>("Bulk", goalMode, setGoalMode, "Bulk")}
          {renderSegmentOption<GoalMode>("Cut", goalMode, setGoalMode, "Cut")}
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Theme Mode</Text>
        <Text style={styles.sectionSubtitle}>Changes the full app instantly.</Text>
        <View style={styles.segmentControl}>
          {renderSegmentOption<ThemeMode>("Light", themeMode, setThemeMode, "Light Mode")}
          {renderSegmentOption<ThemeMode>("Dark", themeMode, setThemeMode, "Dark Mode")}
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionTitle}>Macro Targets</Text>
        <Text style={styles.sectionSubtitle}>
          {macroTargetMode === "Auto" ? `${goalMode}: ${macroTargets.protein}P / ${macroTargets.carbs}C / ${macroTargets.fats}F grams.` : "Custom macro grams."}
        </Text>
        <View style={styles.segmentControl}>
          {renderSegmentOption<MacroTargetMode>("Auto", macroTargetMode, toggleMacroTargetMode, "Auto")}
          {renderSegmentOption<MacroTargetMode>("Custom", macroTargetMode, toggleMacroTargetMode, "Custom")}
        </View>
        {macroTargetMode === "Custom" ? (
          <View style={styles.foodMacroGrid}>
            {(Object.keys(MACRO_LABELS) as MacroName[]).map((macroName) => (
              <View key={macroName} style={styles.foodMacroInputBlock}>
                <Text style={styles.calorieInputLabel}>{MACRO_LABELS[macroName]}</Text>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => updateMacroTarget(macroName, value)}
                  placeholder="0g"
                  placeholderTextColor={theme.placeholder}
                  style={styles.calorieInput}
                  value={customMacroTargets[macroName]}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.settingsCard}>
        <View style={styles.settingsRow}>
          <View style={styles.settingsCopy}>
            <Text style={styles.sectionTitle}>Enable Rest Timer</Text>
            <Text style={styles.sectionSubtitle}>
              {timerSettings.enabled ? "Starts after checked sets and vibrates when done." : "Hidden from Workouts and will not start."}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleTimerEnabled}
            style={[styles.toggleSwitch, timerSettings.enabled && styles.toggleSwitchOn]}
          >
            <View style={[styles.toggleKnob, timerSettings.enabled && styles.toggleKnobOn]} />
          </TouchableOpacity>
        </View>

        <View style={styles.timerDurationPanel}>
          <Text style={styles.labelText}>Custom Duration</Text>
          <Text style={styles.sectionSubtitle}>Use presets or enter any number of seconds.</Text>
          <View style={styles.timerPresetGrid}>
            {REST_TIMER_PRESETS.map((preset) => {
              const isActive = timerSettings.duration === preset.seconds;
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  key={preset.label}
                  onPress={() => setRestTimerDuration(preset.seconds)}
                  style={[styles.timerPresetButton, isActive && styles.timerPresetButtonActive]}
                >
                  <Text style={[styles.timerPresetText, isActive && styles.timerPresetTextActive]}>{preset.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.timerDurationControls}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => adjustTimerDuration(-30)} style={styles.durationButton}>
              <Text style={styles.durationButtonText}>-30</Text>
            </TouchableOpacity>
            <View style={styles.durationDisplay}>
              <Text style={styles.durationDisplayText}>{timerSettings.duration}s</Text>
            </View>
            <TouchableOpacity activeOpacity={0.8} onPress={() => adjustTimerDuration(30)} style={styles.durationButton}>
              <Text style={styles.durationButtonText}>+30</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.timerManualRow}>
            <TextInput
              keyboardType="number-pad"
              onBlur={applyTimerDurationDraft}
              onChangeText={updateTimerDurationDraft}
              onSubmitEditing={applyTimerDurationDraft}
              placeholder="90"
              placeholderTextColor={theme.placeholder}
              returnKeyType="done"
              style={styles.durationInput}
              value={timerDurationDraft}
            />
            <TouchableOpacity activeOpacity={0.85} onPress={applyTimerDurationDraft} style={styles.calorieActionButton}>
              <Text style={styles.calorieActionButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderActiveTab = () => {
    if (activeTab === "Nutrition") {
      return renderNutritionTab();
    }

    if (activeTab === "Weight") {
      return renderWeightTab();
    }

    if (activeTab === "Analytics") {
      return renderAnalyticsTab();
    }

    if (activeTab === "Settings") {
      return renderSettingsTab();
    }

    return renderWorkoutTab();
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle={themeMode === "Dark" ? "light-content" : "dark-content"} backgroundColor={theme.surface} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={IOS_KEYBOARD_VERTICAL_OFFSET}
        style={styles.keyboardRoot}
      >
        <View style={styles.appShell}>
          <View style={styles.contentArea}>{renderActiveTab()}</View>
          {renderPlateModal()}
          {renderAddDayModal()}

          <View style={styles.bottomTabBar}>
            {APP_TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[styles.bottomTabButton, isActive && styles.activeBottomTabButton]}
                >
                  <Text style={[styles.bottomTabText, isActive && styles.activeBottomTabText]}>{tab}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
  safeArea: {
    backgroundColor: theme.surface,
    flex: 1,
  },
  keyboardRoot: {
    backgroundColor: theme.surface,
    flex: 1,
  },
  appShell: {
    backgroundColor: theme.background,
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: 18,
    paddingTop: SCREEN_TOP_PADDING,
    paddingBottom: SCREEN_BOTTOM_PADDING,
  },
  topBar: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  screenTitle: {
    color: theme.text,
    fontSize: 30,
    fontWeight: "900",
  },
  screenSubtitle: {
    color: theme.mutedText,
    fontSize: 13,
    marginTop: 4,
  },
  screenMeta: {
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.strongText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  screenMetaButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  screenMetaButtonText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  heroHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  weekPanel: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  weekSelector: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  weekButtonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  weekTitleBlock: {
    alignItems: "center",
  },
  labelText: {
    color: theme.strongText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  weekTitle: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 2,
  },
  addWeekButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
  },
  addWeekText: {
    color: theme.inverseText,
    fontSize: 14,
    fontWeight: "900",
  },
  deleteWeekButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    paddingVertical: 12,
  },
  deleteWeekText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "900",
  },
  timerPanel: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    padding: 14,
  },
  activeTimerPanel: {
    backgroundColor: theme.text,
  },
  timerHint: {
    color: theme.mutedText,
    fontSize: 13,
    marginTop: 3,
  },
  activeTimerText: {
    color: theme.inverseText,
  },
  activeTimerSubtext: {
    color: theme.inverseText,
  },
  timerValue: {
    color: theme.text,
    fontSize: 32,
    fontWeight: "900",
  },
  activeTimerValue: {
    color: theme.inverseText,
  },
  timerRightBlock: {
    alignItems: "flex-end",
    gap: 8,
  },
  timerSettingsButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeTimerSettingsButton: {
    backgroundColor: theme.text,
    borderColor: theme.surface,
  },
  timerSettingsButtonText: {
    color: theme.text,
    fontSize: 11,
    fontWeight: "900",
  },
  activeTimerSettingsButtonText: {
    color: theme.inverseText,
  },
  disabledButton: {
    opacity: 0.35,
  },
  warningBanner: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  warningText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  dayTabsContent: {
    gap: 10,
    paddingBottom: 16,
  },
  workoutTabsBlock: {
    marginBottom: 2,
  },
  dayTab: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 104,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  activeDayTab: {
    backgroundColor: theme.text,
  },
  extraDayTab: {
    minWidth: 128,
  },
  dayTabText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
  },
  activeDayTabText: {
    color: theme.inverseText,
  },
  addDayButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    paddingVertical: 12,
  },
  addDayButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "900",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 21,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: theme.mutedText,
    fontSize: 13,
    marginTop: 3,
  },
  addExerciseRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  exerciseInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 70,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: theme.inverseText,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyBody: {
    color: theme.mutedText,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  exerciseSwipeFrame: {
    marginBottom: 14,
    overflow: "hidden",
    position: "relative",
  },
  swipeActionRail: {
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: 88,
  },
  swipeDeleteButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
  },
  swipeDeleteText: {
    color: theme.inverseText,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  exerciseCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  exerciseCardSwiped: {
    transform: [{ translateX: -88 }],
  },
  exerciseHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  exerciseHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  exerciseOrderControls: {
    flexDirection: "row",
    gap: 4,
  },
  orderButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 30,
  },
  disabledIconButton: {
    opacity: 0.32,
  },
  orderButtonText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
  },
  exerciseTitleWrap: {
    flex: 1,
  },
  exerciseNameInput: {
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    paddingVertical: 8,
  },
  oneRepMaxText: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
  },
  removeExerciseButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  setHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  setHeaderIndex: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    width: 28,
  },
  setHeaderText: {
    color: theme.mutedText,
    flex: 1.4,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
  },
  setHeaderRpe: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    width: 44,
  },
  setHeaderPrevious: {
    color: theme.mutedText,
    flex: 1.25,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
  },
  setHeaderDone: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    width: 38,
  },
  setHeaderDelete: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    width: 32,
  },
  setRow: {
    borderBottomColor: theme.subtle,
    borderBottomWidth: 1,
    gap: 8,
    marginBottom: 10,
    paddingBottom: 10,
  },
  setMainRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  setNumber: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
    width: 28,
  },
  setInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    fontSize: 15,
    fontWeight: "800",
    height: 42,
    paddingHorizontal: 9,
    textAlign: "center",
    width: 54,
  },
  rpeInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
    height: 42,
    paddingHorizontal: 6,
    textAlign: "center",
    width: 44,
  },
  setWeightCell: {
    flex: 1.4,
    flexDirection: "row",
    gap: 3,
  },
  setWeightInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    height: 42,
    paddingHorizontal: 5,
    textAlign: "center",
  },
  weightQuickActions: {
    gap: 3,
    width: 23,
  },
  weightQuickButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 19,
  },
  weightQuickText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
  },
  plateMiniButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 28,
  },
  plateMiniButtonText: {
    color: theme.inverseText,
    fontSize: 11,
    fontWeight: "900",
  },
  previousBadge: {
    alignItems: "center",
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 7,
  },
  previousLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingLeft: 34,
  },
  previousLineLabel: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  previousBadgeText: {
    color: theme.strongText,
    fontSize: 11,
    fontWeight: "800",
  },
  progressBadge: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 8,
    width: 118,
  },
  positiveProgressBadge: {
    backgroundColor: theme.mode === "Dark" ? "rgba(34, 197, 94, 0.14)" : "rgba(22, 163, 74, 0.08)",
    borderColor: theme.positive,
  },
  negativeProgressBadge: {
    backgroundColor: theme.mode === "Dark" ? "rgba(248, 113, 113, 0.14)" : "rgba(220, 38, 38, 0.08)",
    borderColor: theme.negative,
  },
  neutralProgressBadge: {
    backgroundColor: theme.background,
    borderColor: theme.border,
  },
  progressSymbol: {
    fontSize: 12,
    fontWeight: "900",
  },
  progressLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "900",
  },
  positiveProgressText: {
    color: theme.positive,
  },
  negativeProgressText: {
    color: theme.negative,
  },
  neutralProgressText: {
    color: theme.neutral,
  },
  maxEffortBadge: {
    alignSelf: "flex-start",
    backgroundColor: theme.mode === "Dark" ? "rgba(248, 250, 252, 0.12)" : "rgba(15, 23, 42, 0.06)",
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  maxEffortText: {
    color: theme.text,
    fontSize: 11,
    fontWeight: "900",
  },
  removeSetButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 32,
  },
  removeSetText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 16,
  },
  doneSetButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 38,
  },
  doneSetButtonActive: {
    backgroundColor: theme.text,
  },
  doneSetText: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "900",
  },
  doneSetTextActive: {
    color: theme.inverseText,
  },
  exerciseActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: theme.inverseText,
    fontSize: 13,
    fontWeight: "900",
  },
  outlineButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1.25,
    paddingVertical: 12,
  },
  outlineButtonText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "900",
  },
  weightHero: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    padding: 16,
  },
  weightValueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  bodyweightLargeInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 32,
    fontWeight: "900",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  weightUnitButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 62,
    minWidth: 72,
    paddingHorizontal: 16,
  },
  weightUnitButtonText: {
    color: theme.inverseText,
    fontSize: 15,
    fontWeight: "900",
  },
  weightProgressBadge: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    padding: 12,
  },
  weightProgressArrow: {
    fontSize: 24,
    fontWeight: "900",
    width: 32,
  },
  weightProgressCopy: {
    flex: 1,
  },
  weightProgressLabel: {
    fontSize: 14,
    fontWeight: "900",
  },
  weightProgressMeta: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  weightHistoryList: {
    gap: 10,
  },
  weightHistoryRow: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  weightHistoryWeek: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  weightHistoryMeta: {
    color: theme.mutedText,
    fontSize: 12,
    marginTop: 3,
  },
  weightHistoryValue: {
    color: theme.text,
    fontSize: 17,
    fontWeight: "900",
  },
  averagePanel: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  averageValue: {
    color: theme.text,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 4,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 96,
    padding: 12,
    width: "48%",
  },
  metricCardWide: {
    width: "100%",
  },
  metricValue: {
    color: theme.text,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 10,
  },
  metricInput: {
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    color: theme.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6,
    paddingVertical: 5,
  },
  caloriePanel: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  calorieHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  targetInputWrap: {
    minWidth: 104,
  },
  targetInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlign: "center",
  },
  calorieMetricRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 22,
  },
  remainingLabel: {
    color: theme.mutedText,
    fontSize: 13,
    fontWeight: "800",
  },
  remainingValue: {
    color: theme.text,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 2,
  },
  calorieTotals: {
    alignItems: "flex-end",
    paddingBottom: 4,
  },
  netText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 3,
  },
  smallMetricText: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  progressTrack: {
    backgroundColor: theme.subtle,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 14,
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: theme.text,
    height: "100%",
  },
  calorieInputGrid: {
    gap: 12,
    marginTop: 18,
  },
  calorieInputBlock: {
    gap: 8,
  },
  calorieInputLabel: {
    color: theme.strongText,
    fontSize: 13,
    fontWeight: "900",
  },
  calorieInputRow: {
    flexDirection: "row",
    gap: 10,
  },
  foodMacroGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  foodMacroInputBlock: {
    flex: 1,
    gap: 8,
  },
  calorieInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  calorieActionButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 86,
  },
  calorieActionButtonText: {
    color: theme.inverseText,
    fontSize: 13,
    fontWeight: "900",
  },
  quickAddGrid: {
    gap: 10,
    marginBottom: 16,
    marginTop: 16,
  },
  quickAddButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  quickAddTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  quickAddMeta: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  macroCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  macroHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  macroTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  macroMeta: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  macroInputRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  macroInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  disabledInput: {
    opacity: 0.7,
  },
  smallBlackButton: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 58,
  },
  smallBlackButtonText: {
    color: theme.inverseText,
    fontSize: 12,
    fontWeight: "900",
  },
  historyHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 22,
  },
  historyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  historyCount: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  noHistoryText: {
    color: theme.mutedText,
    fontSize: 13,
    marginTop: 12,
  },
  historyRow: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    padding: 12,
  },
  historyTypeDot: {
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    width: 10,
  },
  extractDot: {
    backgroundColor: theme.surface,
  },
  historyCopy: {
    flex: 1,
  },
  historyMain: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
  },
  historyDate: {
    color: theme.mutedText,
    fontSize: 12,
    marginTop: 2,
  },
  deleteLogButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteLogText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  calendarCell: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.subtle,
    borderRadius: 5,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: "12%",
  },
  calendarCellCompleted: {
    backgroundColor: theme.text,
    borderColor: theme.text,
  },
  calendarCellToday: {
    borderWidth: 2,
  },
  calendarCellText: {
    color: theme.mutedText,
    fontSize: 10,
    fontWeight: "800",
  },
  calendarCellTextCompleted: {
    color: theme.inverseText,
  },
  prRow: {
    alignItems: "center",
    borderBottomColor: theme.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  prCopy: {
    flex: 1,
  },
  prExercise: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
  },
  prMeta: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  prValue: {
    color: theme.strongText,
    fontSize: 14,
    fontWeight: "900",
  },
  analyticsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  analyticsCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 136,
    padding: 14,
  },
  analyticsNumber: {
    color: theme.text,
    fontSize: 38,
    fontWeight: "900",
    marginTop: 8,
  },
  chartCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  volumeChart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    minHeight: 210,
  },
  volumeBarColumn: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  volumeValue: {
    color: theme.mutedText,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
  },
  volumeBar: {
    backgroundColor: theme.text,
    borderRadius: 8,
    width: "100%",
  },
  volumeLabel: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8,
  },
  oneRmRow: {
    alignItems: "center",
    borderBottomColor: theme.subtle,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  oneRmName: {
    color: theme.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  oneRmValue: {
    color: theme.strongText,
    fontSize: 15,
    fontWeight: "900",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: theme.backdrop,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 420,
    padding: 18,
    width: "100%",
  },
  modalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "900",
  },
  modalCloseButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalCloseText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  extraDayOptions: {
    gap: 10,
    marginTop: 18,
  },
  extraDayOptionButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  extraDayOptionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  extraDayOptionMeta: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  customDayBox: {
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  settingsCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
  },
  settingsCopy: {
    flex: 1,
  },
  segmentControl: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  segmentOption: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 10,
  },
  segmentOptionActive: {
    backgroundColor: theme.text,
  },
  segmentOptionText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  segmentOptionTextActive: {
    color: theme.inverseText,
  },
  timerToggleRow: {
    alignItems: "center",
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    padding: 14,
  },
  toggleSwitch: {
    alignItems: "flex-start",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 3,
    width: 58,
  },
  toggleSwitchOn: {
    alignItems: "flex-end",
    backgroundColor: theme.text,
  },
  toggleKnob: {
    backgroundColor: theme.text,
    borderRadius: 13,
    height: 26,
    width: 26,
  },
  toggleKnobOn: {
    backgroundColor: theme.surface,
  },
  timerDurationPanel: {
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  timerPresetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  timerPresetButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  timerPresetButtonActive: {
    backgroundColor: theme.text,
  },
  timerPresetText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  timerPresetTextActive: {
    color: theme.inverseText,
  },
  timerDurationControls: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  timerManualRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  durationButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 72,
    paddingVertical: 12,
  },
  durationButtonText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "900",
  },
  durationDisplay: {
    alignItems: "center",
    backgroundColor: theme.text,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  durationDisplayText: {
    color: theme.inverseText,
    fontSize: 18,
    fontWeight: "900",
  },
  durationInput: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: "center",
  },
  plateTotal: {
    color: theme.text,
    fontSize: 36,
    fontWeight: "900",
    marginTop: 18,
  },
  plateList: {
    gap: 10,
    marginTop: 16,
  },
  plateRow: {
    alignItems: "center",
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },
  plateWeight: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "900",
  },
  plateCount: {
    color: theme.strongText,
    fontSize: 14,
    fontWeight: "800",
  },
  bottomTabBar: {
    backgroundColor: theme.surface,
    borderTopColor: theme.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: BOTTOM_TAB_BOTTOM_PADDING,
  },
  bottomTabButton: {
    alignItems: "center",
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 3,
    paddingVertical: 10,
  },
  activeBottomTabButton: {
    backgroundColor: theme.text,
  },
  bottomTabText: {
    color: theme.text,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  activeBottomTabText: {
    color: theme.inverseText,
  },
  });
}
