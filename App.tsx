import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type ListRenderItemInfo,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
  type ViewStyle,
} from "react-native";
import {
  addDaysToDateKey,
  buildConsumedCaloriesByDate,
  buildProgressHistoryMonths,
  buildWeekCalendarCells,
  CALENDAR_WEEKDAY_LABELS,
  dateKeyFromIso,
  formatDateKey,
  getCalendarWeekRangeLabel,
  getDateKeyDistance,
  getPreviousDateKey,
  getStartOfWeekDateKey,
  isValidDateKey,
  mergeCompletedDateKeys,
  sanitizeCompletedDateKeys,
  type CalendarCell,
  type CalendarCalorieLog,
  type CalendarMonthCell,
} from "./progressCalendar";

type WorkoutDayName = "Push" | "Pull" | "Legs";
type WeightUnit = "lbs" | "kg";
type CalorieLogType = "add" | "extract";
type CalorieLogMode = "quick" | "macro";
type AppTab = "Workouts" | "Nutrition" | "Weight" | "Stats" | "Settings";
type GoalMode = "Bulk" | "Cut";
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
  timerSettings: TimerSettings;
  macroTargetMode: MacroTargetMode;
  customMacroTargets: MacroDrafts;
};
type ThemeTokens = {
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
type GamificationStats = {
  streakCount: number;
  lastWorkoutDate: string | null;
  totalXP: number;
  workoutBonusClaims: Record<string, string>;
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
type WeightHistoryItem = {
  week: WeekEntry;
  originalIndex: number;
};

const STORAGE_KEY = "@iphone_gym_tracker/weeks_v1";
const EXTRA_DAYS_STORAGE_KEY = "@iphone_gym_tracker/extra_workout_days_v1";
const TIMER_SETTINGS_STORAGE_KEY = "@iphone_gym_tracker/timer_settings_v1";
const APP_SETTINGS_STORAGE_KEY = "@iphone_gym_tracker/app_settings_v1";
const COMPLETED_SETS_STORAGE_KEY = "@iphone_gym_tracker/completed_sets_v1";
const COMPLETED_DATES_STORAGE_KEY = "@iphone_gym_tracker/completed_dates_v1";
const DAILY_CALORIE_TARGETS_STORAGE_KEY = "@iphone_gym_tracker/daily_calorie_targets_v1";
const GAMIFICATION_STORAGE_KEY = "@iphone_gym_tracker/gamification_v1";
const STORAGE_BACKUP_SUFFIX = ":backup_v1";
type StoredJsonSource = "primary" | "backup";
type StoredJsonResult<T> = {
  found: boolean;
  hadError: boolean;
  source: StoredJsonSource | null;
  value: T | null;
};
type StorageIssueOperation = "load" | "recover" | "save" | "validate";
const DAY_NAMES: WorkoutDayName[] = ["Push", "Pull", "Legs"];
const APP_TABS: AppTab[] = ["Workouts", "Nutrition", "Weight", "Stats", "Settings"];
const REST_SECONDS = 90;
const MIN_REST_SECONDS = 1;
const QUICK_WEIGHT_TAP_STEP_KG = 2.5;
const QUICK_WEIGHT_LONG_PRESS_STEP_KG = 1.25;
const REST_TIMER_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "60s", seconds: 60 },
  { label: "90s", seconds: 90 },
  { label: "2m", seconds: 120 },
  { label: "3m", seconds: 180 },
];
const IOS_KEYBOARD_VERTICAL_OFFSET = Platform.OS === "ios" ? 20 : 0;
const KEYBOARD_DISMISS_MODE = Platform.OS === "ios" ? "interactive" : "on-drag";
const SCREEN_TOP_PADDING = Platform.OS === "ios" ? 58 : 22;
const SCREEN_BOTTOM_PADDING = Platform.OS === "ios" ? 44 : 28;
const BOTTOM_TAB_BOTTOM_PADDING = Platform.OS === "ios" ? 26 : 10;
const BAR_WEIGHT_KG = 20;
const PLATE_OPTIONS_KG = [20, 10, 5];
const STREAK_WINDOW_DAYS = 7;
const XP_PER_COMPLETED_SET = 10;
const XP_PER_COMPLETED_WORKOUT_DAY = 50;
const XP_PER_LEVEL = 500;
const MAX_STORED_WEEKS = 520;
const MAX_EXTRA_DAYS_PER_WEEK = 365;
const MAX_EXERCISES_PER_DAY = 100;
const MAX_SETS_PER_EXERCISE = 100;
const MAX_CALORIE_LOGS_PER_DAY = 5000;
const MAX_COMPLETED_SET_IDS = 50000;
const MAX_DAILY_CALORIE_TARGETS = 10000;
const MAX_WORKOUT_BONUS_CLAIMS = 50000;
const MAX_REST_SECONDS = 24 * 60 * 60;
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
const DEFAULT_GAMIFICATION_STATS: GamificationStats = {
  streakCount: 0,
  lastWorkoutDate: null,
  totalXP: 0,
  workoutBonusClaims: {},
};
const MACRO_LABELS: Record<MacroName, string> = {
  protein: "Protein",
  carbs: "Carbs",
  fats: "Fats",
};
const MACRO_NAMES = Object.keys(MACRO_LABELS) as MacroName[];
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
  timerSettings: {
    enabled: true,
    duration: REST_SECONDS,
  },
  macroTargetMode: "Auto",
  customMacroTargets: DEFAULT_MACRO_TARGETS,
};
const summarizeStorageError = (error: unknown) => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return typeof error === "string" ? error : "Unknown storage error";
};

const storageBackupKey = (key: string) => `${key}${STORAGE_BACKUP_SUFFIX}`;

const storageTimestamp = () => new Date().toISOString();

const reportStorageIssue = (
  operation: StorageIssueOperation,
  key: string,
  error: unknown,
  details: Record<string, unknown> = {},
) => {
  console.warn("storage_issue", {
    ...details,
    error: summarizeStorageError(error),
    key,
    operation,
    ts: storageTimestamp(),
  });
};

const parseStoredJson = <T,>(
  key: string,
  rawValue: string,
  normalize: (value: unknown) => T | null,
  source: StoredJsonSource,
): StoredJsonResult<T> => {
  const normalizedValue = normalize(JSON.parse(rawValue));
  if (normalizedValue === null) {
    reportStorageIssue("validate", key, "Stored payload did not match the expected shape.", { source });
    return { found: true, hadError: true, source, value: null };
  }

  return { found: true, hadError: false, source, value: normalizedValue };
};

const readStoredJsonSource = async <T,>(
  key: string,
  normalize: (value: unknown) => T | null,
  source: StoredJsonSource,
): Promise<StoredJsonResult<T>> => {
  let rawValue: string | null = null;

  try {
    rawValue = await AsyncStorage.getItem(key);
  } catch (error) {
    reportStorageIssue("load", key, error, { source });
    return { found: false, hadError: true, source, value: null };
  }

  if (!rawValue) {
    return { found: false, hadError: false, source, value: null };
  }

  try {
    return parseStoredJson(key, rawValue, normalize, source);
  } catch (error) {
    reportStorageIssue("load", key, error, { source });
    return { found: true, hadError: true, source, value: null };
  }
};

const loadStoredJson = async <T,>(
  key: string,
  normalize: (value: unknown) => T | null,
): Promise<StoredJsonResult<T>> => {
  const primary = await readStoredJsonSource(key, normalize, "primary");
  if (primary.value !== null || (primary.found && !primary.hadError)) {
    return primary;
  }

  const backup = await readStoredJsonSource(storageBackupKey(key), normalize, "backup");
  if (backup.value !== null) {
    reportStorageIssue("recover", key, "Recovered stored payload from backup.", {
      primaryHadError: primary.hadError,
    });
    return { ...backup, hadError: true };
  }

  return {
    found: primary.found || backup.found,
    hadError: primary.hadError || backup.hadError,
    source: backup.found ? backup.source : primary.source,
    value: null,
  };
};

const saveStoredJson = async (key: string, value: unknown) => {
  let serializedValue: string;
  try {
    serializedValue = JSON.stringify(value);
  } catch (error) {
    reportStorageIssue("save", key, error, { source: "serialize" });
    throw error;
  }

  try {
    await AsyncStorage.setItem(storageBackupKey(key), serializedValue);
  } catch (error) {
    reportStorageIssue("save", key, error, { source: "backup" });
  }

  try {
    await AsyncStorage.setItem(key, serializedValue);
  } catch (error) {
    reportStorageIssue("save", key, error, { source: "primary" });
    throw error;
  }
};
const APP_THEME: ThemeTokens = {
  background: "#000000",
  surface: "#111111",
  text: "#F5F5F5",
  strongText: "#FFFFFF",
  mutedText: "#9A9A9A",
  placeholder: "#737373",
  border: "#1E1E1E",
  subtle: "#222222",
  inverseText: "#000000",
  positive: "#2F7BFF",
  negative: "#FF5A5F",
  neutral: "#7A7A7A",
  backdrop: "rgba(0, 0, 0, 0.72)",
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
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDecimal = (value: number, useCommaDecimal: boolean) =>
  value.toFixed(1).replace(".", useCommaDecimal ? "," : ".");

const usesCommaDecimal = (...values: Array<string | undefined>) =>
  values.some((value) => Boolean(value?.includes(",")));

const formatRpeInput = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) {
    return "";
  }

  return String(Math.min(10, Math.max(1, Number(digits))));
};

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

const isWorkoutDayFullyCompleted = (
  day: Pick<WorkoutDayEntry, "exercises"> | Pick<ExtraWorkoutDayEntry, "exercises">,
  completedSets: CompletedSetsById,
) =>
  day.exercises.length > 0 &&
  day.exercises.every(
    (exercise) => exercise.sets.length > 0 && exercise.sets.every((set) => Boolean(completedSets[set.id])),
  );

const calculateWeekVolume = (week: WeekEntry, extraDays: ExtraWorkoutDayEntry[] = []) =>
  DAY_NAMES.reduce(
    (weekTotal, dayName) =>
      weekTotal + calculateWorkoutDayVolume(week.days[dayName]),
    0,
  ) + extraDays.reduce((total, day) => total + calculateWorkoutDayVolume(day), 0);

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

const limitStoredItems = <T,>(items: T[], limit: number) => items.slice(0, Math.max(0, limit));

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const normalizeStoredNumber = (value: unknown, fallback = 0) => (isFiniteNumber(value) ? value : fallback);

const normalizeStoredNonNegativeNumber = (value: unknown) => Math.max(0, normalizeStoredNumber(value));

const isValidDateString = (value: string) => !Number.isNaN(new Date(value).getTime());

const normalizeStoredDate = (value: unknown) =>
  typeof value === "string" && isValidDateString(value) ? value : new Date().toISOString();

const normalizeCompletedAt = (value: unknown) => {
  if (typeof value === "string" && value.trim() && isValidDateString(value)) {
    return value;
  }

  if (value === true) {
    return new Date().toISOString();
  }

  return null;
};

const normalizeMacroValues = (value: unknown): MacroValues => {
  const record = asRecord(value);
  return {
    protein: normalizeStoredNonNegativeNumber(record?.protein),
    carbs: normalizeStoredNonNegativeNumber(record?.carbs),
    fats: normalizeStoredNonNegativeNumber(record?.fats),
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
  const sets = rawSets.length > 0 ? limitStoredItems(rawSets, MAX_SETS_PER_EXERCISE).map(normalizeSet) : [makeSet()];

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

  if ((type !== "add" && type !== "extract") || !isFiniteNumber(amount) || amount <= 0) {
    return null;
  }

  return {
    id: typeof record?.id === "string" ? record.id : makeId("calorie"),
    type,
    amount,
    mode,
    label,
    macros,
    createdAt: normalizeStoredDate(record?.createdAt),
  };
};

const normalizeCalories = (value: unknown): DayCalories => {
  const record = asRecord(value);
  const rawLogs = Array.isArray(record?.logs) ? record.logs : [];

  return {
    target: typeof record?.target === "string" ? record.target : "2500",
    logs: limitStoredItems(rawLogs, MAX_CALORIE_LOGS_PER_DAY)
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
    exercises: limitStoredItems(rawExercises, MAX_EXERCISES_PER_DAY).map(normalizeExercise),
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
    createdAt: normalizeStoredDate(record.createdAt),
  };
};

const normalizeExtraWorkoutDaysByWeek = (value: unknown): ExtraWorkoutDaysByWeek => {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return Object.entries(record).reduce((accumulator, [weekId, rawDays]) => {
    if (Array.isArray(rawDays)) {
      const normalizedDays = limitStoredItems(rawDays, MAX_EXTRA_DAYS_PER_WEEK)
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
  const rawDuration = record?.duration;
  const duration = isFiniteNumber(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : REST_SECONDS;

  return {
    enabled: typeof record?.enabled === "boolean" ? record.enabled : true,
    duration: Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, duration)),
  };
};

const normalizeAppSettings = (value: unknown): AppSettings => {
  const record = asRecord(value);
  const goalMode = record?.goalMode === "Cut" ? "Cut" : "Bulk";
  const macroTargetMode = record?.macroTargetMode === "Custom" ? "Custom" : "Auto";

  return {
    goalMode,
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

  return limitStoredItems(Object.entries(record), MAX_COMPLETED_SET_IDS).reduce((completed, [setId, rawValue]) => {
    const completedAt = normalizeCompletedAt(rawValue);
    if (completedAt) {
      completed[setId] = completedAt;
    }

    return completed;
  }, {} as CompletedSetsById);
};

const normalizeCompletedDates = (value: unknown): CompletedDates => {
  const result = sanitizeCompletedDateKeys(value);
  if (result.invalidCount > 0 || result.duplicateCount > 0 || result.truncatedCount > 0) {
    reportStorageIssue("validate", COMPLETED_DATES_STORAGE_KEY, "Ignored invalid, duplicate, or excessive completed date keys.", {
      duplicateCount: result.duplicateCount,
      invalidCount: result.invalidCount,
      truncatedCount: result.truncatedCount,
    });
  }

  return result.dateKeys;
};

const normalizeDailyCalorieTargets = (value: unknown): DailyCalorieTargets => {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return limitStoredItems(Object.entries(record), MAX_DAILY_CALORIE_TARGETS).reduce((targets, [dateKey, target]) => {
    if (isValidDateKey(dateKey) && typeof target === "string" && safeNumber(target) > 0) {
      targets[dateKey] = target;
    }

    return targets;
  }, {} as DailyCalorieTargets);
};

const normalizeWorkoutBonusClaims = (value: unknown): Record<string, string> => {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return limitStoredItems(Object.entries(record), MAX_WORKOUT_BONUS_CLAIMS).reduce((claims, [claimKey, dateKey]) => {
    if (typeof claimKey === "string" && typeof dateKey === "string" && isValidDateKey(dateKey)) {
      claims[claimKey] = dateKey;
    }

    return claims;
  }, {} as Record<string, string>);
};

const normalizeGamificationStats = (value: unknown): GamificationStats => {
  const record = asRecord(value);
  if (!record) {
    return DEFAULT_GAMIFICATION_STATS;
  }

  const rawTotalXP = normalizeStoredNumber(record.totalXP);
  const rawStreak = normalizeStoredNumber(record.streakCount);
  const lastWorkoutDate =
    typeof record.lastWorkoutDate === "string" && isValidDateKey(record.lastWorkoutDate)
      ? record.lastWorkoutDate
      : null;

  return {
    streakCount: Math.max(0, Math.floor(rawStreak)),
    lastWorkoutDate,
    totalXP: Math.max(0, Math.floor(rawTotalXP)),
    workoutBonusClaims: normalizeWorkoutBonusClaims(record.workoutBonusClaims),
  };
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

const completedNutritionDatesFromCalories = (calories: DayCalories): CompletedDates => {
  const target = safeNumber(calories.target);
  if (target <= 0) {
    return [];
  }

  const netCaloriesByDate = calories.logs.reduce((totals, log) => {
    const dateKey = dateKeyFromIso(log.createdAt);
    if (!dateKey) {
      return totals;
    }

    const signedAmount = log.type === "add" ? log.amount : -log.amount;
    totals.set(dateKey, (totals.get(dateKey) ?? 0) + signedAmount);
    return totals;
  }, new Map<string, number>());

  return Array.from(netCaloriesByDate.entries())
    .filter(([, netCalories]) => netCalories >= target)
    .map(([dateKey]) => dateKey);
};

const completedNutritionDatesFromWeeks = (
  weeks: WeekEntry[],
  extraDaysByWeek: ExtraWorkoutDaysByWeek,
): CompletedDates =>
  mergeCompletedDateKeys(
    weeks.flatMap((week) =>
      DAY_NAMES.flatMap((dayName) => completedNutritionDatesFromCalories(week.days[dayName].calories)),
    ),
    Object.values(extraDaysByWeek).flatMap((extraDays) =>
      extraDays.flatMap((extraDay) => completedNutritionDatesFromCalories(extraDay.calories)),
    ),
  );

const appendCalendarCalorieLogs = (logs: CalendarCalorieLog[], calories: DayCalories) => {
  calories.logs.forEach((log) => {
    if (!isStarterCalorieLog(log)) {
      logs.push(log);
    }
  });
};

const calorieIntakeByDateFromWeeks = (
  weeks: WeekEntry[],
  extraDaysByWeek: ExtraWorkoutDaysByWeek,
): Record<string, number> => {
  const logs: CalendarCalorieLog[] = [];

  weeks.forEach((week) => {
    DAY_NAMES.forEach((dayName) => appendCalendarCalorieLogs(logs, week.days[dayName].calories));
  });
  Object.values(extraDaysByWeek).forEach((extraDays) => {
    extraDays.forEach((extraDay) => appendCalendarCalorieLogs(logs, extraDay.calories));
  });

  return buildConsumedCaloriesByDate(logs);
};

const formatCalendarCalories = (calories: number) => {
  if (!Number.isFinite(calories) || calories <= 0) {
    return "";
  }

  const roundedCalories = Math.round(calories);
  return roundedCalories >= 10000 ? `${Math.round(roundedCalories / 1000)}k` : String(roundedCalories);
};

const awardGamificationForCompletedSet = (
  stats: GamificationStats,
  workoutDateKey: string,
  workoutBonusClaimKey: string | null,
): GamificationStats => {
  const daysSinceLastWorkout = stats.lastWorkoutDate
    ? getDateKeyDistance(stats.lastWorkoutDate, workoutDateKey)
    : null;
  const nextStreakCount =
    !stats.lastWorkoutDate
      ? 1
      : daysSinceLastWorkout === 0
        ? Math.max(1, stats.streakCount)
        : daysSinceLastWorkout !== null && daysSinceLastWorkout > 0 && daysSinceLastWorkout <= STREAK_WINDOW_DAYS
          ? Math.max(1, stats.streakCount + 1)
          : Math.max(1, daysSinceLastWorkout !== null && daysSinceLastWorkout < 0 ? stats.streakCount : 1);
  const canClaimWorkoutBonus = Boolean(workoutBonusClaimKey && !stats.workoutBonusClaims[workoutBonusClaimKey]);
  const nextWorkoutBonusClaims =
    workoutBonusClaimKey && canClaimWorkoutBonus
      ? { ...stats.workoutBonusClaims, [workoutBonusClaimKey]: workoutDateKey }
      : stats.workoutBonusClaims;

  return {
    ...stats,
    streakCount: nextStreakCount,
    lastWorkoutDate: workoutDateKey,
    totalXP: stats.totalXP + XP_PER_COMPLETED_SET + (canClaimWorkoutBonus ? XP_PER_COMPLETED_WORKOUT_DAY : 0),
    workoutBonusClaims: nextWorkoutBonusClaims,
  };
};

const normalizeWeeks = (value: unknown): WeekEntry[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return limitStoredItems(value, MAX_STORED_WEEKS).map((weekValue, index) => {
    const week = asRecord(weekValue);
    const bodyweight = asRecord(week?.bodyweight);
    const days = asRecord(week?.days);
    const rawUnit = bodyweight?.unit;
    const rawWeekNumber = week?.weekNumber;
    const unit: WeightUnit = rawUnit === "kg" || rawUnit === "lbs" ? rawUnit : "lbs";

    return {
      id: typeof week?.id === "string" ? week.id : makeId("week"),
      weekNumber: isFiniteNumber(rawWeekNumber) && rawWeekNumber > 0 ? Math.floor(rawWeekNumber) : index + 1,
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

type AppStyles = Record<string, any>;

type BottomTabButtonProps = {
  activeTab: AppTab;
  onPress: (tab: AppTab) => void;
  styles: AppStyles;
  tab: AppTab;
};

function BottomTabButton({ activeTab, onPress, styles, tab }: BottomTabButtonProps) {
  const isActive = activeTab === tab;

  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      activeOpacity={1}
      onPress={() => onPress(tab)}
      style={[styles.bottomTabButton, isActive && styles.activeBottomTabButton]}
    >
      <Text numberOfLines={1} style={[styles.bottomTabText, isActive && styles.activeBottomTabText]}>
        {tab}
      </Text>
    </TouchableOpacity>
  );
}

type SmoothModalProps = {
  backdropStyle: StyleProp<ViewStyle>;
  cardStyle: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onRequestClose: () => void;
  visible: boolean;
};

function SmoothModal({ backdropStyle, cardStyle, children, onRequestClose, visible }: SmoothModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onRequestClose}>
      <View style={backdropStyle}>
        <View style={cardStyle}>{children}</View>
      </View>
    </Modal>
  );
}

type WorkoutSetRowProps = {
  completed: boolean;
  exerciseId: string;
  exerciseName: string;
  onAdjustSetWeight: (exerciseId: string, setId: string, deltaKg: number, fallbackWeight?: string) => void;
  onOpenPlateCalculator: (exerciseName: string, weight: string) => void;
  onRemoveSet: (exerciseId: string, setId: string) => void;
  onToggleSetComplete: (setId: string) => void;
  onUpdateSet: (
    exerciseId: string,
    setId: string,
    field: keyof Pick<WorkoutSet, "weight" | "reps" | "rpe">,
    value: string,
  ) => void;
  previousLabel: string;
  previousSetWeight?: string;
  progressStatus: SetProgressStatus;
  set: WorkoutSet;
  setIndex: number;
  styles: AppStyles;
};

const WorkoutSetRow = React.memo(function WorkoutSetRow({
  completed,
  exerciseId,
  exerciseName,
  onAdjustSetWeight,
  onOpenPlateCalculator,
  onRemoveSet,
  onToggleSetComplete,
  onUpdateSet,
  previousLabel,
  previousSetWeight,
  progressStatus,
  set,
  setIndex,
  styles,
}: WorkoutSetRowProps) {
  const isMaxEffort = completed && safeNumber(set.rpe) >= 10;
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
    <View style={styles.setRow}>
      <View style={styles.setMainRow}>
        <Text style={styles.setNumber}>S{setIndex + 1}</Text>
        <TextInput
          blurOnSubmit={false}
          key={`${set.id}-weight`}
          keyboardType="decimal-pad"
          onChangeText={(value) => onUpdateSet(exerciseId, set.id, "weight", value)}
          placeholder="KG"
          placeholderTextColor="#777777"
          style={styles.setWeightInput}
          value={set.weight}
        />
        <TextInput
          blurOnSubmit={false}
          key={`${set.id}-reps`}
          keyboardType="number-pad"
          onChangeText={(value) => onUpdateSet(exerciseId, set.id, "reps", value)}
          placeholder="Reps"
          placeholderTextColor="#777777"
          style={styles.setInput}
          value={set.reps}
        />
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onToggleSetComplete(set.id)}
          style={[styles.doneSetButton, completed && styles.doneSetButtonActive]}
        >
          <Text style={[styles.doneSetText, completed && styles.doneSetTextActive]}>DONE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onRemoveSet(exerciseId, set.id)}
          style={styles.removeSetButton}
        >
          <Text style={styles.removeSetText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.setUtilityRow}>
        <View style={styles.rpeControl}>
          <Text style={styles.utilityLabel}>RPE</Text>
          <TextInput
            blurOnSubmit={false}
            key={`${set.id}-rpe`}
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(value) => onUpdateSet(exerciseId, set.id, "rpe", value)}
            placeholder="RPE"
            placeholderTextColor="#777777"
            style={styles.rpeInput}
            value={set.rpe}
          />
        </View>
        <View style={styles.weightQuickActions}>
          <TouchableOpacity
            activeOpacity={0.76}
            delayLongPress={260}
            onLongPress={() => onAdjustSetWeight(exerciseId, set.id, -QUICK_WEIGHT_LONG_PRESS_STEP_KG, previousSetWeight)}
            onPress={() => onAdjustSetWeight(exerciseId, set.id, -QUICK_WEIGHT_TAP_STEP_KG, previousSetWeight)}
            style={styles.weightQuickButton}
          >
            <Text style={styles.weightQuickText}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.76}
            delayLongPress={260}
            onLongPress={() => onAdjustSetWeight(exerciseId, set.id, QUICK_WEIGHT_LONG_PRESS_STEP_KG, previousSetWeight)}
            onPress={() => onAdjustSetWeight(exerciseId, set.id, QUICK_WEIGHT_TAP_STEP_KG, previousSetWeight)}
            style={styles.weightQuickButton}
          >
            <Text style={styles.weightQuickText}>+</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={() => onOpenPlateCalculator(exerciseName, set.weight)} style={styles.plateMiniButton}>
          <Text style={styles.plateMiniButtonText}>Plates</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.previousLine}>
        <Text numberOfLines={1} style={styles.previousLineLabel}>Prev:</Text>
        <View style={styles.previousBadge}>
          <Text numberOfLines={1} style={styles.previousBadgeText}>
            {previousLabel}
          </Text>
        </View>
        <View style={[styles.progressBadge, progressBadgeStyle]}>
          <Text style={[styles.progressSymbol, progressTextStyle]}>{progressStatus.symbol}</Text>
          <Text numberOfLines={1} style={[styles.progressLabel, progressTextStyle]}>
            {progressStatus.label}
          </Text>
        </View>
      </View>
      {isMaxEffort ? (
        <View style={styles.maxEffortBadge}>
          <Text style={styles.maxEffortText}>Max Effort</Text>
        </View>
      ) : null}
    </View>
  );
});

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
  const [selectedCalendarWeekStartKey, setSelectedCalendarWeekStartKey] = useState(
    () => getStartOfWeekDateKey(formatDateKey(new Date())) ?? formatDateKey(new Date()),
  );
  const [isProgressHistoryOpen, setIsProgressHistoryOpen] = useState(false);
  const [dailyCalorieTargets, setDailyCalorieTargets] = useState<DailyCalorieTargets>({});
  const [restSeconds, setRestSeconds] = useState(0);
  const [plateModal, setPlateModal] = useState<PlateModalState>(null);
  const [extraWorkoutDays, setExtraWorkoutDays] = useState<ExtraWorkoutDaysByWeek>({});
  const [activeWorkoutDayId, setActiveWorkoutDayId] = useState<string>("Push");
  const [isAddDayModalVisible, setIsAddDayModalVisible] = useState(false);
  const [customDayName, setCustomDayName] = useState("");
  const [goalMode, setGoalMode] = useState<GoalMode>(DEFAULT_APP_SETTINGS.goalMode);
  const [timerSettings, setTimerSettings] = useState<TimerSettings>({
    ...DEFAULT_APP_SETTINGS.timerSettings,
  });
  const [timerDurationDraft, setTimerDurationDraft] = useState(String(DEFAULT_APP_SETTINGS.timerSettings.duration));
  const [macroTargetMode, setMacroTargetMode] = useState<MacroTargetMode>(DEFAULT_APP_SETTINGS.macroTargetMode);
  const [customMacroTargets, setCustomMacroTargets] = useState<MacroDrafts>(DEFAULT_APP_SETTINGS.customMacroTargets);
  const [nutritionResetNotice, setNutritionResetNotice] = useState<string | null>(null);
  const [gamificationStats, setGamificationStats] = useState<GamificationStats>(DEFAULT_GAMIFICATION_STATS);
  const [showWorkoutScrollTop, setShowWorkoutScrollTop] = useState(false);
  const [showExerciseRecommendations, setShowExerciseRecommendations] = useState(false);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const completedSetsRef = useRef<CompletedSetsById>({});
  const shouldVibrateWhenTimerEndsRef = useRef(false);
  const warnedAtThreeSecondsRef = useRef(false);
  const appliedDailyCalorieTargetRef = useRef<string | null>(null);
  const tabPagerRef = useRef<ScrollView>(null);
  const isProgrammaticTabScrollRef = useRef(false);
  const programmaticTabScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workoutListRef = useRef<FlatList<ExerciseEntry>>(null);
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = Math.max(1, windowWidth);
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
    : activeExtraWorkoutDay?.baseDay ?? "Push";
  const currentWorkoutDay = activeExtraWorkoutDay ?? currentWeek.days[activeWorkoutBaseDay];
  const currentWorkoutDayLabel = activeExtraWorkoutDay?.label ?? activeWorkoutBaseDay;
  const theme = APP_THEME;
  const styles = useMemo(() => createStyles(APP_THEME), []);
  const gymLevel = useMemo(
    () => Math.floor(gamificationStats.totalXP / XP_PER_LEVEL) + 1,
    [gamificationStats.totalXP],
  );
  const currentLevelXP = useMemo(() => gamificationStats.totalXP % XP_PER_LEVEL, [gamificationStats.totalXP]);
  const levelProgress = useMemo(() => currentLevelXP / XP_PER_LEVEL, [currentLevelXP]);
  const recommendedExercises = useMemo(() => {
    const previousDay = previousWeek?.days[activeWorkoutBaseDay];
    if (!previousDay) {
      return [];
    }

    const currentExerciseNames = new Set(currentWorkoutDay.exercises.map((exercise) => normalizeName(exercise.name)));
    const seenRecommendations = new Set<string>();

    return previousDay.exercises.reduce((recommendations, exercise) => {
      const exerciseName = exercise.name.trim();
      const recommendationKey = normalizeName(exerciseName);
      const wasCompletedLastWeek = exercise.sets.some(
        (set) => Boolean(completedSets[set.id]) || (safeNumber(set.weight) > 0 && safeNumber(set.reps) > 0),
      );

      if (!exerciseName || !wasCompletedLastWeek || currentExerciseNames.has(recommendationKey) || seenRecommendations.has(recommendationKey)) {
        return recommendations;
      }

      seenRecommendations.add(recommendationKey);
      return [...recommendations, exerciseName];
    }, [] as string[]);
  }, [activeWorkoutBaseDay, completedSets, currentWorkoutDay.exercises, previousWeek]);

  useEffect(() => {
    completedSetsRef.current = completedSets;
  }, [completedSets]);

  useEffect(() => {
    let isMounted = true;

    const loadWeeks = async () => {
      let hadStorageIssue = false;
      const noteStorageIssue = (result: { hadError: boolean }) => {
        hadStorageIssue = hadStorageIssue || result.hadError;
      };
      const loadStorageSlot = async <T,>(
        key: string,
        normalize: (value: unknown) => T | null,
        applyValue: (value: T) => void,
      ) => {
        const result = await loadStoredJson(key, normalize);
        noteStorageIssue(result);
        if (result.value !== null && isMounted) {
          applyValue(result.value);
        }

        return result;
      };

      try {
        await loadStorageSlot(STORAGE_KEY, normalizeWeeks, (savedWeeks) => {
          setWeeks(savedWeeks);
          setActiveWeekIndex(savedWeeks.length - 1);
        });

        await loadStorageSlot(EXTRA_DAYS_STORAGE_KEY, normalizeExtraWorkoutDaysByWeek, setExtraWorkoutDays);

        const savedCompletedSets = await loadStorageSlot(
          COMPLETED_SETS_STORAGE_KEY,
          normalizeCompletedSets,
          (normalizedCompletedSets) => {
            completedSetsRef.current = normalizedCompletedSets;
            setCompletedSets(normalizedCompletedSets);
          },
        );
        const normalizedCompletedSets = savedCompletedSets.value ?? {};

        const savedCompletedDates = await loadStoredJson(COMPLETED_DATES_STORAGE_KEY, normalizeCompletedDates);
        noteStorageIssue(savedCompletedDates);
        if (isMounted) {
          setCompletedDates(savedCompletedDates.value ?? completedDatesFromCompletedSets(normalizedCompletedSets));
        }

        await loadStorageSlot(
          DAILY_CALORIE_TARGETS_STORAGE_KEY,
          normalizeDailyCalorieTargets,
          setDailyCalorieTargets,
        );

        await loadStorageSlot(GAMIFICATION_STORAGE_KEY, normalizeGamificationStats, setGamificationStats);

        const savedAppSettings = await loadStorageSlot(APP_SETTINGS_STORAGE_KEY, normalizeAppSettings, (savedSettings) => {
          setGoalMode(savedSettings.goalMode);
          setTimerSettings(savedSettings.timerSettings);
          setTimerDurationDraft(String(savedSettings.timerSettings.duration));
          setMacroTargetMode(savedSettings.macroTargetMode);
          setCustomMacroTargets(savedSettings.customMacroTargets);
        });
        const hasSavedAppSettings = Boolean(savedAppSettings.value);

        const savedTimerSettings = await loadStoredJson(TIMER_SETTINGS_STORAGE_KEY, normalizeTimerSettings);
        noteStorageIssue(savedTimerSettings);
        if (savedTimerSettings.value !== null && !hasSavedAppSettings && isMounted) {
          setTimerSettings(savedTimerSettings.value);
          setTimerDurationDraft(String(savedTimerSettings.value.duration));
        }
      } catch (error) {
        reportStorageIssue("load", "app_storage", error);
        hadStorageIssue = true;
        if (isMounted) {
          setStorageError("Saved data could not be loaded. Showing starter weeks.");
        }
      } finally {
        if (isMounted) {
          if (hadStorageIssue) {
            setStorageError("Some saved data could not be loaded. Recovered what was valid.");
          }
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

    saveStoredJson(STORAGE_KEY, weeks).catch(() => {
      setStorageError("Changes could not be saved to this device.");
    });
  }, [hasLoadedStorage, weeks]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    saveStoredJson(EXTRA_DAYS_STORAGE_KEY, extraWorkoutDays).catch(() => {
      setStorageError("Extra workout days could not be saved to this device.");
    });
  }, [extraWorkoutDays, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    saveStoredJson(COMPLETED_SETS_STORAGE_KEY, completedSets).catch(() => {
      setStorageError("Completed sets could not be saved to this device.");
    });
  }, [completedSets, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    saveStoredJson(COMPLETED_DATES_STORAGE_KEY, completedDates).catch(() => {
      setStorageError("Completed dates could not be saved to this device.");
    });
  }, [completedDates, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    saveStoredJson(DAILY_CALORIE_TARGETS_STORAGE_KEY, dailyCalorieTargets).catch(() => {
      setStorageError("Daily calorie targets could not be saved to this device.");
    });
  }, [dailyCalorieTargets, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    saveStoredJson(GAMIFICATION_STORAGE_KEY, gamificationStats).catch(() => {
      setStorageError("Gamification progress could not be saved to this device.");
    });
  }, [gamificationStats, hasLoadedStorage]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    setGamificationStats((stats) => {
      if (!stats.lastWorkoutDate || stats.streakCount === 0) {
        return stats;
      }

      const daysSinceLastWorkout = getDateKeyDistance(stats.lastWorkoutDate, todayDateKey);
      if (daysSinceLastWorkout !== null && daysSinceLastWorkout > STREAK_WINDOW_DAYS) {
        return {
          ...stats,
          streakCount: 0,
        };
      }

      return stats;
    });
  }, [hasLoadedStorage, todayDateKey]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    const nextSettings: AppSettings = {
      goalMode,
      timerSettings,
      macroTargetMode,
      customMacroTargets,
    };

    saveStoredJson(APP_SETTINGS_STORAGE_KEY, nextSettings).catch(() => {
      setStorageError("Settings could not be saved to this device.");
    });
  }, [customMacroTargets, goalMode, hasLoadedStorage, macroTargetMode, timerSettings]);

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
        if (index !== activeWeekIndex || week.days[activeDay].calories.target === resolvedTarget.target) {
          return week;
        }

        const day = week.days[activeDay];
        return {
          ...week,
          days: {
            ...week.days,
            [activeDay]: {
              ...day,
              calories: {
                ...day.calories,
                target: resolvedTarget.target,
              },
            },
          },
        };
      }),
    );
  }, [
    activeWeekIndex,
    activeDay,
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

  useEffect(() => {
    Keyboard.dismiss();
  }, [activeTab]);

  useEffect(() => {
    const keyboardHideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setShowExerciseRecommendations(false);
    });

    return () => {
      keyboardHideSubscription.remove();
    };
  }, []);

  useEffect(
    () => () => {
      if (programmaticTabScrollTimerRef.current) {
        clearTimeout(programmaticTabScrollTimerRef.current);
      }
    },
    [],
  );

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

  const syncActiveTabFromOffset = useCallback(
    (offsetX: number) => {
      const nextIndex = Math.min(APP_TABS.length - 1, Math.max(0, Math.round(offsetX / pageWidth)));
      const nextTab = APP_TABS[nextIndex];

      if (nextTab) {
        setActiveTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
      }
    },
    [pageWidth],
  );

  const clearProgrammaticTabScroll = useCallback(() => {
    isProgrammaticTabScrollRef.current = false;
    if (programmaticTabScrollTimerRef.current) {
      clearTimeout(programmaticTabScrollTimerRef.current);
      programmaticTabScrollTimerRef.current = null;
    }
  }, []);

  const handleTabScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isProgrammaticTabScrollRef.current) {
        return;
      }

      syncActiveTabFromOffset(event.nativeEvent.contentOffset.x);
    },
    [syncActiveTabFromOffset],
  );

  const handleTabMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearProgrammaticTabScroll();
      syncActiveTabFromOffset(event.nativeEvent.contentOffset.x);
    },
    [clearProgrammaticTabScroll, syncActiveTabFromOffset],
  );

  const handleTabScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isProgrammaticTabScrollRef.current) {
        return;
      }

      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) < 0.05) {
        syncActiveTabFromOffset(event.nativeEvent.contentOffset.x);
      }
    },
    [syncActiveTabFromOffset],
  );

  const handleTabPress = useCallback(
    (tab: AppTab) => {
      const nextIndex = APP_TABS.indexOf(tab);
      if (nextIndex < 0) {
        return;
      }

      Keyboard.dismiss();
      const currentIndex = APP_TABS.indexOf(activeTab);
      const shouldAnimate = currentIndex >= 0 && Math.abs(nextIndex - currentIndex) <= 1;

      if (activeTab === tab) {
        return;
      }

      if (programmaticTabScrollTimerRef.current) {
        clearTimeout(programmaticTabScrollTimerRef.current);
        programmaticTabScrollTimerRef.current = null;
      }

      setActiveTab(tab);

      if (!shouldAnimate) {
        isProgrammaticTabScrollRef.current = false;
        tabPagerRef.current?.scrollTo({ animated: false, x: nextIndex * pageWidth, y: 0 });
        return;
      }

      isProgrammaticTabScrollRef.current = true;
      programmaticTabScrollTimerRef.current = setTimeout(() => {
        isProgrammaticTabScrollRef.current = false;
        programmaticTabScrollTimerRef.current = null;
        setActiveTab(tab);
      }, 650);
      tabPagerRef.current?.scrollTo({ animated: true, x: nextIndex * pageWidth, y: 0 });
    },
    [activeTab, pageWidth],
  );

  const handleWorkoutScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const shouldShow = event.nativeEvent.contentOffset.y > 360;
    setShowWorkoutScrollTop((isVisible) => (isVisible === shouldShow ? isVisible : shouldShow));
  }, []);

  const scrollWorkoutToTop = useCallback(() => {
    workoutListRef.current?.scrollToOffset({ animated: false, offset: 0 });
    setShowWorkoutScrollTop(false);
  }, []);

  const updateExercise = useCallback(
    (exerciseId: string, updater: (exercise: ExerciseEntry) => ExerciseEntry) => {
      updateCurrentWorkoutDay((day) => ({
        ...day,
        exercises: day.exercises.map((exercise) => (exercise.id === exerciseId ? updater(exercise) : exercise)),
      }));
    },
    [updateCurrentWorkoutDay],
  );

  const findPreviousExercise = useCallback(
    (exercise: ExerciseEntry, exerciseIndex: number) => {
      if (!previousWeek) {
        return undefined;
      }

      const previousExtraWorkoutDays = extraWorkoutDays[previousWeek.id] ?? [];
      const matchingExtraDay = activeExtraWorkoutDay
        ? previousExtraWorkoutDays.find((day) => normalizeName(day.label) === normalizeName(activeExtraWorkoutDay.label))
        : undefined;
      const previousDayCandidates: WorkoutDayContent[] = [];

      if (matchingExtraDay) {
        previousDayCandidates.push(matchingExtraDay);
      }

      previousDayCandidates.push(previousWeek.days[activeWorkoutBaseDay]);

      previousExtraWorkoutDays.forEach((day) => {
        if (day.baseDay === activeWorkoutBaseDay && day.id !== matchingExtraDay?.id) {
          previousDayCandidates.push(day);
        }
      });

      previousExtraWorkoutDays.forEach((day) => {
        if (day.baseDay !== activeWorkoutBaseDay) {
          previousDayCandidates.push(day);
        }
      });

      const exerciseName = normalizeName(exercise.name);
      const namedMatch = previousDayCandidates
        .flatMap((day) => day.exercises)
        .find((candidate) => exerciseName !== "" && normalizeName(candidate.name) === exerciseName);

      return namedMatch ?? previousDayCandidates[0]?.exercises[exerciseIndex];
    },
    [activeExtraWorkoutDay, activeWorkoutBaseDay, extraWorkoutDays, previousWeek],
  );

  const getPreviousSet = useCallback(
    (exercise: ExerciseEntry, exerciseIndex: number, setIndex: number) =>
      findPreviousExercise(exercise, exerciseIndex)?.sets[setIndex],
    [findPreviousExercise],
  );

  const previousSetLabel = useCallback(
    (exercise: ExerciseEntry, exerciseIndex: number, setIndex: number) => {
      const previousSet = getPreviousSet(exercise, exerciseIndex, setIndex);

      if (!previousSet || (!previousSet.weight && !previousSet.reps)) {
        return "--";
      }

      const weight = previousSet.weight || "--";
      const reps = previousSet.reps || "--";
      return `${weight}${currentWeek.bodyweight.unit} x ${reps}`;
    },
    [currentWeek.bodyweight.unit, getPreviousSet],
  );

  const previousSetPlaceholder = useCallback(
    (
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
    },
    [activeWeekIndex, currentWeek.bodyweight.unit, getPreviousSet],
  );

  const setProgressStatus = useCallback(
    (
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
        return { symbol: "▲", label: "Progressive", tone: "positive" };
      }

      if (currentWeight === previousWeight && currentReps === previousReps) {
        return { symbol: "=", label: "Same as last week", tone: "neutral" };
      }

      return { symbol: "▼", label: "Below last week", tone: "negative" };
    },
    [getPreviousSet],
  );

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

  const completedProgressDateKeys = useMemo(
    () =>
      mergeCompletedDateKeys(
        completedDates,
        completedDatesFromCompletedSets(completedSets),
        completedNutritionDatesFromWeeks(weeks, extraWorkoutDays),
      ),
    [completedDates, completedSets, extraWorkoutDays, weeks],
  );

  const calorieIntakeByDate = useMemo(
    () => calorieIntakeByDateFromWeeks(weeks, extraWorkoutDays),
    [extraWorkoutDays, weeks],
  );

  const currentCalendarWeekStartKey = useMemo(
    () => getStartOfWeekDateKey(todayDateKey) ?? todayDateKey,
    [todayDateKey],
  );
  const calendarWeekRange = useMemo(
    () => getCalendarWeekRangeLabel(selectedCalendarWeekStartKey),
    [selectedCalendarWeekStartKey],
  );
  const calendarCells = useMemo(
    () => buildWeekCalendarCells(completedProgressDateKeys, selectedCalendarWeekStartKey, todayDateKey),
    [completedProgressDateKeys, selectedCalendarWeekStartKey, todayDateKey],
  );
  const progressHistoryMonths = useMemo(
    () => buildProgressHistoryMonths(completedProgressDateKeys, todayDateKey, 1, calorieIntakeByDate),
    [calorieIntakeByDate, completedProgressDateKeys, todayDateKey],
  );
  const progressHistoryCompletedCount = completedProgressDateKeys.length;
  const canGoToNextCalendarWeek =
    (getDateKeyDistance(selectedCalendarWeekStartKey, currentCalendarWeekStartKey) ?? 0) > 0;

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
    const roundedDelta = formatDecimal(
      Math.abs(delta),
      usesCommaDecimal(currentWeek.bodyweight.value, previousWeek?.bodyweight.value),
    );

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

  const currentWeekVolume = useMemo(
    () => calculateWeekVolume(currentWeek, currentExtraWorkoutDays),
    [currentExtraWorkoutDays, currentWeek],
  );

  const currentOneRepMaxSnapshot = useMemo(
    () =>
      currentWorkoutDay.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        oneRepMax: calculateExerciseOneRepMax(exercise),
      })),
    [currentWorkoutDay.exercises],
  );

  const weightHistory = useMemo<WeightHistoryItem[]>(
    () =>
      weeks
        .map((week, originalIndex) => ({ originalIndex, week }))
        .reverse(),
    [weeks],
  );

  const nutritionLogs = useMemo(
    () => (nutritionMode === "Quick Calories" ? quickCalorieLogs : macroFoodLogs),
    [macroFoodLogs, nutritionMode, quickCalorieLogs],
  );

  const setBodyweightValue = useCallback((value: string) => {
    updateCurrentWeek((week) => ({
      ...week,
      bodyweight: { ...week.bodyweight, value },
    }));
  }, [updateCurrentWeek]);

  const toggleWeightUnit = useCallback(() => {
    updateCurrentWeek((week) => ({
      ...week,
      bodyweight: {
        ...week.bodyweight,
        unit: week.bodyweight.unit === "lbs" ? "kg" : "lbs",
      },
    }));
  }, [updateCurrentWeek]);

  const addWeek = useCallback(() => {
    const previous = weeks[weeks.length - 1];
    const nextWeekNumber = (previous?.weekNumber ?? weeks.length) + 1;
    const nextWeek = createBlankWeek(nextWeekNumber, previous);
    setWeeks((previousWeeks) => [...previousWeeks, nextWeek]);
    setActiveWeekIndex(weeks.length);
    setActiveDay("Push");
    setActiveWorkoutDayId("Push");
  }, [weeks]);

  const deleteCurrentWeek = useCallback(() => {
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
    completedSetsRef.current = {};
    setCompletedSets({});
    shouldVibrateWhenTimerEndsRef.current = false;
    warnedAtThreeSecondsRef.current = false;
    setRestSeconds(0);
  }, [activeWeekIndex, currentWeek.id, weeks.length]);

  const confirmDeleteCurrentWeek = useCallback(() => {
    Alert.alert(
      "Delete Week",
      `Are you sure you want to delete Week ${currentWeek.weekNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", onPress: deleteCurrentWeek, style: "destructive" },
      ],
    );
  }, [currentWeek.weekNumber, deleteCurrentWeek]);

  const addExercise = useCallback(() => {
    const trimmedName = newExerciseName.trim();
    if (!trimmedName) {
      return;
    }

    updateCurrentWorkoutDay((day) => ({
      ...day,
      exercises: [...day.exercises, makeExercise(trimmedName)],
    }));
    setNewExerciseName("");
    setShowExerciseRecommendations(false);
  }, [newExerciseName, updateCurrentWorkoutDay]);

  const addRecommendedExercise = useCallback((exerciseName: string) => {
    updateCurrentWorkoutDay((day) => {
      const recommendationKey = normalizeName(exerciseName);
      const alreadyExists = day.exercises.some((exercise) => normalizeName(exercise.name) === recommendationKey);
      if (alreadyExists) {
        return day;
      }

      return {
        ...day,
        exercises: [...day.exercises, makeExercise(exerciseName)],
      };
    });
    Keyboard.dismiss();
    setShowExerciseRecommendations(false);
  }, [updateCurrentWorkoutDay]);

  const clearCompletedSetIds = useCallback((setIds: string[]) => {
    if (setIds.length === 0) {
      return;
    }

    const nextCompletedSets = { ...completedSetsRef.current };
    let changed = false;

    setIds.forEach((setId) => {
      if (nextCompletedSets[setId]) {
        delete nextCompletedSets[setId];
        changed = true;
      }
    });

    if (changed) {
      completedSetsRef.current = nextCompletedSets;
      setCompletedSets(nextCompletedSets);
    }
  }, []);

  const removeExercise = useCallback((exerciseId: string) => {
    const exerciseToRemove = currentWorkoutDay.exercises.find((exercise) => exercise.id === exerciseId);

    updateCurrentWorkoutDay((day) => ({
      ...day,
      exercises: day.exercises.filter((exercise) => exercise.id !== exerciseId),
    }));
    clearCompletedSetIds(exerciseToRemove?.sets.map((set) => set.id) ?? []);
  }, [clearCompletedSetIds, currentWorkoutDay.exercises, updateCurrentWorkoutDay]);

  const moveExercise = useCallback((exerciseId: string, direction: -1 | 1) => {
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
  }, [updateCurrentWorkoutDay]);

  const addSet = useCallback((exerciseId: string) => {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: [...exercise.sets, makeSet()],
    }));
  }, [updateExercise]);

  const removeSet = useCallback((exerciseId: string, setId: string) => {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.filter((set) => set.id !== setId),
    }));

    clearCompletedSetIds([setId]);
  }, [clearCompletedSetIds, updateExercise]);

  const updateSet = useCallback((exerciseId: string, setId: string, field: keyof Pick<WorkoutSet, "weight" | "reps" | "rpe">, value: string) => {
    const nextValue = field === "rpe" ? formatRpeInput(value) : value;
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: nextValue } : set)),
    }));
  }, [updateExercise]);

  const adjustSetWeight = useCallback((exerciseId: string, setId: string, deltaKg: number, fallbackWeight = "") => {
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
  }, [currentWeek.bodyweight.unit, updateExercise]);

  const copyPreviousSets = useCallback((exercise: ExerciseEntry, exerciseIndex: number) => {
    const previousExercise = findPreviousExercise(exercise, exerciseIndex);
    if (!previousExercise?.sets.length) {
      return;
    }

    updateExercise(exercise.id, (currentExercise) => ({
      ...currentExercise,
      sets: previousExercise.sets.map((set) => makeSet(set.weight, set.reps, set.rpe)),
    }));
  }, [findPreviousExercise, updateExercise]);

  const updateCalorieTarget = useCallback((value: string) => {
    updateCurrentDay((day) => ({
      ...day,
      calories: {
        ...day.calories,
        target: value,
      },
    }));

    if (safeNumber(value) > 0) {
      setDailyCalorieTargets((previousTargets) => ({
        ...previousTargets,
        [todayDateKey]: value,
      }));
    }
  }, [todayDateKey, updateCurrentDay]);

  const setCalorieDraft = useCallback((field: keyof FoodDraft, value: string) => {
    setCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: {
        ...previousDrafts[activeDay],
        [field]: value,
      },
    }));
  }, [activeDay]);

  const setQuickCalorieDraft = useCallback((type: CalorieLogType, value: string) => {
    setQuickCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: {
        ...previousDrafts[activeDay],
        [type]: value,
      },
    }));
  }, [activeDay]);

  const submitQuickCalorieLog = useCallback((type: CalorieLogType) => {
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
  }, [activeDay, quickCalorieDraft, updateCurrentDay]);

  const submitFoodLog = useCallback(() => {
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
  }, [activeDay, calorieDraft, updateCurrentDay]);

  const deleteCalorieLog = useCallback((logId: string) => {
    updateCurrentDay((day) => ({
      ...day,
      calories: {
        ...day.calories,
        logs: day.calories.logs.filter((log) => log.id !== logId),
      },
    }));
  }, [updateCurrentDay]);

  const resetNutritionForNewDay = useCallback(() => {
    updateCurrentDay((day) => ({
      ...day,
      calories: {
        ...day.calories,
        logs: [],
      },
    }));

    setQuickCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: {
        add: "",
        extract: "",
      },
    }));
    setCalorieDrafts((previousDrafts) => ({
      ...previousDrafts,
      [activeDay]: emptyFoodDraft(),
    }));
    setNutritionResetNotice(`New day started - ${formatDateTime(new Date().toISOString())}`);
  }, [activeDay, updateCurrentDay]);

  const confirmResetNutrition = useCallback(() => {
    Alert.alert(
      "Reset Nutrition?",
      "This will clear the current nutrition logs and drafts for this day, then start a new day. Are you sure you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Proceed", onPress: resetNutritionForNewDay, style: "destructive" },
      ],
    );
  }, [resetNutritionForNewDay]);

  const addCompletedDateForToday = useCallback(() => {
    const todayKey = formatDateKey(new Date());
    setCompletedDates((previousDates) => {
      if (previousDates.includes(todayKey)) {
        return previousDates;
      }

      return [todayKey, ...previousDates];
    });
  }, []);

  const toggleSetComplete = useCallback((setId: string) => {
    const currentCompletedSets = completedSetsRef.current;
    const shouldStartTimer = !currentCompletedSets[setId];
    const completedAt = new Date();
    const completedAtIso = completedAt.toISOString();
    const completedAtDateKey = formatDateKey(completedAt);
    const nextCompletedSets = shouldStartTimer
      ? {
          ...currentCompletedSets,
          [setId]: completedAtIso,
        }
      : (() => {
          const remainingCompletedSets = { ...currentCompletedSets };
          delete remainingCompletedSets[setId];
          return remainingCompletedSets;
        })();
    const workoutBonusClaimKey = `${currentWeek.id}:${activeWorkoutDayId}`;
    const shouldClaimWorkoutBonus =
      shouldStartTimer &&
      !isWorkoutDayFullyCompleted(currentWorkoutDay, currentCompletedSets) &&
      isWorkoutDayFullyCompleted(currentWorkoutDay, nextCompletedSets);

    if (shouldStartTimer && timerSettings.enabled) {
      shouldVibrateWhenTimerEndsRef.current = true;
      warnedAtThreeSecondsRef.current = false;
      setRestSeconds(timerSettings.duration);
    }

    if (shouldStartTimer) {
      addCompletedDateForToday();
      setGamificationStats((stats) =>
        awardGamificationForCompletedSet(
          stats,
          completedAtDateKey,
          shouldClaimWorkoutBonus ? workoutBonusClaimKey : null,
        ),
      );
    }

    completedSetsRef.current = nextCompletedSets;
    setCompletedSets(nextCompletedSets);
  }, [
    activeWorkoutDayId,
    addCompletedDateForToday,
    currentWeek.id,
    currentWorkoutDay,
    timerSettings.duration,
    timerSettings.enabled,
  ]);

  const openPlateCalculator = useCallback((exerciseName: string, weight: string) => {
    const parsedWeight = safeNumber(weight);
    if (parsedWeight <= 0) {
      return;
    }

    setPlateModal({ exerciseName, weight: parsedWeight });
  }, []);

  const updateMacroTarget = useCallback((macroName: MacroName, value: string) => {
    setMacroTargetMode("Custom");
    setCustomMacroTargets((previousTargets) => ({
      ...previousTargets,
      [macroName]: value,
    }));
  }, []);

  const selectWorkoutDay = useCallback((dayId: string) => {
    Keyboard.dismiss();
    setShowExerciseRecommendations(false);
    setActiveWorkoutDayId(dayId);
  }, []);

  const addExtraWorkoutDay = useCallback((preset: ExtraWorkoutDayPreset) => {
    const presetConfig = EXTRA_DAY_PRESETS.find((option) => option.label === preset) ?? EXTRA_DAY_PRESETS[0];
    const customLabel = customDayName.trim();
    const baseDay = preset === "Custom" ? activeWorkoutBaseDay : presetConfig.baseDay;
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
  }, [activeWorkoutBaseDay, currentExtraWorkoutDays.length, currentWeek.days, currentWeek.id, customDayName]);

  const setRestTimerDuration = useCallback((duration: number) => {
    const nextDuration = Math.max(MIN_REST_SECONDS, Math.round(duration));
    setTimerSettings((previousSettings) => ({ ...previousSettings, duration: nextDuration }));
    setTimerDurationDraft(String(nextDuration));
  }, []);

  const adjustTimerDuration = useCallback((delta: number) => {
    setRestTimerDuration(timerSettings.duration + delta);
  }, [setRestTimerDuration, timerSettings.duration]);

  const updateTimerDurationDraft = useCallback((value: string) => {
    setTimerDurationDraft(value.replace(/[^0-9]/g, ""));
  }, []);

  const applyTimerDurationDraft = useCallback(() => {
    const nextDuration = safeNumber(timerDurationDraft);

    if (nextDuration <= 0) {
      setTimerDurationDraft(String(timerSettings.duration));
      return;
    }

    setRestTimerDuration(nextDuration);
  }, [setRestTimerDuration, timerDurationDraft, timerSettings.duration]);

  const toggleTimerEnabled = useCallback(() => {
    setTimerSettings((previousSettings) => {
      const enabled = !previousSettings.enabled;
      if (!enabled) {
        shouldVibrateWhenTimerEndsRef.current = false;
        warnedAtThreeSecondsRef.current = false;
        setRestSeconds(0);
      }

      return { ...previousSettings, enabled };
    });
  }, []);

  const toggleMacroTargetMode = useCallback((mode: MacroTargetMode) => {
    if (mode === "Custom" && macroTargetMode === "Auto") {
      setCustomMacroTargets(macroTargets);
    }

    setMacroTargetMode(mode);
  }, [macroTargetMode, macroTargets]);

  const showPreviousCalendarWeek = useCallback(() => {
    setSelectedCalendarWeekStartKey((previousStartKey) =>
      addDaysToDateKey(previousStartKey, -7) ?? previousStartKey,
    );
  }, []);

  const showNextCalendarWeek = useCallback(() => {
    setSelectedCalendarWeekStartKey((previousStartKey) => {
      const nextStartKey = addDaysToDateKey(previousStartKey, 7) ?? previousStartKey;
      const daysUntilCurrentWeek = getDateKeyDistance(nextStartKey, currentCalendarWeekStartKey);
      return daysUntilCurrentWeek !== null && daysUntilCurrentWeek < 0 ? currentCalendarWeekStartKey : nextStartKey;
    });
  }, [currentCalendarWeekStartKey]);

  const showCurrentCalendarWeek = useCallback(() => {
    setSelectedCalendarWeekStartKey(currentCalendarWeekStartKey);
  }, [currentCalendarWeekStartKey]);

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
    <View style={styles.baseDayTabsRow}>
      {DAY_NAMES.map((dayName) => {
        const isActive = activeDay === dayName;
        return (
          <TouchableOpacity
            activeOpacity={0.8}
            key={dayName}
            onPress={() => {
              Keyboard.dismiss();
              setShowExerciseRecommendations(false);
              setActiveDay(dayName);
            }}
            style={[styles.dayTab, isActive && styles.activeDayTab]}
          >
            <Text style={[styles.dayTabText, isActive && styles.activeDayTabText]}>{dayName}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderWorkoutDayTabs = () => (
    <View style={styles.workoutTabsBlock}>
      <View style={styles.baseDayTabsRow}>
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
      </View>
      {currentExtraWorkoutDays.length > 0 ? (
        <ScrollView horizontal bounces={false} contentContainerStyle={styles.extraDayTabsContent} showsHorizontalScrollIndicator={false}>
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
      ) : null}
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

  const renderMacroBar = useCallback((macroName: MacroName) => {
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
  }, [macroProgress, macroTargetMode, macroTargets, macroTotals, styles, theme.placeholder, updateMacroTarget]);

  const renderPlateModal = () => {
    const targetKg = plateModal ? toKilograms(plateModal.weight, currentWeek.bodyweight.unit) : 0;
    let sideWeight = Math.max(0, (targetKg - BAR_WEIGHT_KG) / 2);
    const plates = PLATE_OPTIONS_KG.map((plate) => {
      const count = Math.floor(sideWeight / plate);
      sideWeight -= count * plate;
      return { count, plate };
    });

    return (
      <SmoothModal
        backdropStyle={styles.modalBackdrop}
        cardStyle={styles.modalCard}
        visible={Boolean(plateModal)}
        onRequestClose={() => setPlateModal(null)}
      >
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
      </SmoothModal>
    );
  };

  const renderAddDayModal = () => (
    <SmoothModal
      backdropStyle={styles.modalBackdrop}
      cardStyle={styles.modalCard}
      visible={isAddDayModalVisible}
      onRequestClose={() => setIsAddDayModalVisible(false)}
    >
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
    </SmoothModal>
  );

  const exerciseKeyExtractor = useCallback((exercise: ExerciseEntry) => exercise.id, []);

  const renderGamificationCard = useCallback(
    () => (
      <View style={styles.gamificationCard}>
        <View style={styles.streakHeaderRow}>
          <View style={styles.streakTitleBlock}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakTitle}>{gamificationStats.streakCount} Week Streak</Text>
          </View>
          <View style={styles.levelPill}>
            <Text style={styles.levelPillText}>Level {gymLevel}</Text>
          </View>
        </View>
        <View style={styles.xpMetaRow}>
          <Text style={styles.xpMetaText}>{gamificationStats.totalXP} Total XP</Text>
          <Text style={styles.xpMetaText}>{currentLevelXP}/{XP_PER_LEVEL} XP</Text>
        </View>
        <View style={styles.levelProgressTrack}>
          <View style={[styles.levelProgressFill, { width: `${levelProgress * 100}%` }]} />
        </View>
      </View>
    ),
    [currentLevelXP, gamificationStats.streakCount, gamificationStats.totalXP, gymLevel, levelProgress, styles],
  );

  const renderRecommendedExercises = useCallback(() => {
    if (!showExerciseRecommendations || recommendedExercises.length === 0) {
      return null;
    }

    return (
      <View style={styles.recommendedExercisePanel}>
        <Text style={styles.recommendedExerciseTitle}>Recommended Exercises</Text>
        <Text style={styles.recommendedExerciseSubtitle}>Based on what you completed last week.</Text>
        <View style={styles.recommendedExerciseList}>
          {recommendedExercises.map((exerciseName) => (
            <TouchableOpacity
              activeOpacity={0.84}
              key={exerciseName}
              onPress={() => addRecommendedExercise(exerciseName)}
              style={styles.recommendedExerciseButton}
            >
              <Text numberOfLines={1} style={styles.recommendedExerciseText}>{exerciseName}</Text>
              <Text style={styles.recommendedExerciseAdd}>Add</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }, [addRecommendedExercise, recommendedExercises, showExerciseRecommendations, styles]);

  const renderWorkoutHeader = useCallback(
    () => (
      <>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.screenTitle}>{currentWorkoutDayLabel}</Text>
            <Text style={styles.screenSubtitle}>Week {currentWeek.weekNumber} - Workouts</Text>
          </View>
        </View>

        {renderGamificationCard()}
        {renderStorageWarning()}
        {renderRestTimer()}
        {renderWeekSelector()}
        {renderWorkoutDayTabs()}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Exercises</Text>
            <Text style={styles.sectionSubtitle}>
              {timerSettings.enabled ? "Tap weight for plates. Check a set to start rest." : "Tap weight for plates. Rest timer is hidden."}
            </Text>
          </View>
        </View>

        <View style={styles.addExerciseRow}>
          <TextInput
            blurOnSubmit={false}
            key={`${activeWorkoutDayId}-add-exercise`}
            onChangeText={setNewExerciseName}
            onFocus={() => setShowExerciseRecommendations(true)}
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
        {renderRecommendedExercises()}
      </>
    ),
    [
      addExercise,
      activeWorkoutDayId,
      currentWeek.weekNumber,
      currentWorkoutDayLabel,
      newExerciseName,
      renderRestTimer,
      renderGamificationCard,
      renderRecommendedExercises,
      renderStorageWarning,
      renderWeekSelector,
      renderWorkoutDayTabs,
      styles,
      theme.placeholder,
      timerSettings.enabled,
    ],
  );

  const renderWorkoutEmpty = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No exercises yet</Text>
        <Text style={styles.emptyBody}>Add your first movement and start logging quality work.</Text>
      </View>
    ),
    [styles],
  );

  const renderExerciseItem = useCallback(
    ({ item: exercise, index: exerciseIndex }: ListRenderItemInfo<ExerciseEntry>) => {
      const hasPreviousSets = Boolean(findPreviousExercise(exercise, exerciseIndex)?.sets.length);
      const oneRepMax = calculateExerciseOneRepMax(exercise);

      return (
        <View style={styles.exerciseSwipeFrame}>
          <View style={styles.exerciseCard}>
            <View style={styles.exerciseAccentLine} />
            <View style={styles.exerciseHeader}>
              <View style={styles.exerciseTitleWrap}>
                <TextInput
                  blurOnSubmit={false}
                  key={`${exercise.id}-exercise-name`}
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
                <Text style={styles.oneRepMaxText}>
                  {oneRepMax > 0 ? `Est. 1RM ${Math.round(oneRepMax)}${currentWeek.bodyweight.unit}` : "Est. 1RM --"}
                </Text>
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
              <Text style={styles.setHeaderWeight}>KG</Text>
              <Text style={styles.setHeaderReps}>Reps</Text>
              <Text style={styles.setHeaderDone}>Done</Text>
              <Text style={styles.setHeaderDelete}>Del</Text>
            </View>

            {exercise.sets.map((set, setIndex) => {
              const previousSet = getPreviousSet(exercise, exerciseIndex, setIndex);
              const progressStatus = setProgressStatus(exercise, exerciseIndex, setIndex, set);

              return (
                <WorkoutSetRow
                  completed={Boolean(completedSets[set.id])}
                  exerciseId={exercise.id}
                  exerciseName={exercise.name}
                  key={set.id}
                  onAdjustSetWeight={adjustSetWeight}
                  onOpenPlateCalculator={openPlateCalculator}
                  onRemoveSet={removeSet}
                  onToggleSetComplete={toggleSetComplete}
                  onUpdateSet={updateSet}
                  previousLabel={previousSetLabel(exercise, exerciseIndex, setIndex)}
                  previousSetWeight={previousSet?.weight}
                  progressStatus={progressStatus}
                  set={set}
                  setIndex={setIndex}
                  styles={styles}
                />
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
    },
    [
      addSet,
      adjustSetWeight,
      completedSets,
      copyPreviousSets,
      currentWeek.bodyweight.unit,
      currentWorkoutDay.exercises.length,
      findPreviousExercise,
      getPreviousSet,
      moveExercise,
      openPlateCalculator,
      previousSetLabel,
      removeExercise,
      removeSet,
      setProgressStatus,
      styles,
      toggleSetComplete,
      updateExercise,
      updateSet,
    ],
  );

  const renderWorkoutTab = () => (
    <View style={styles.workoutTabShell}>
      <FlatList<ExerciseEntry>
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        bounces
        contentContainerStyle={styles.screenContent}
        data={currentWorkoutDay.exercises}
        initialNumToRender={4}
        keyboardDismissMode={KEYBOARD_DISMISS_MODE}
        keyboardShouldPersistTaps="handled"
        keyExtractor={exerciseKeyExtractor}
        ListEmptyComponent={renderWorkoutEmpty}
        ListHeaderComponent={renderWorkoutHeader()}
        maxToRenderPerBatch={4}
        onScroll={handleWorkoutScroll}
        ref={workoutListRef}
        removeClippedSubviews={Platform.OS === "android"}
        renderItem={renderExerciseItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={32}
        windowSize={5}
      />
      {showWorkoutScrollTop ? (
        <TouchableOpacity
          accessibilityLabel="Scroll workouts to top"
          activeOpacity={0.86}
          delayPressIn={0}
          hitSlop={{ bottom: 12, left: 12, right: 12, top: 12 }}
          onPress={scrollWorkoutToTop}
          onPressIn={scrollWorkoutToTop}
          style={styles.scrollTopButton}
        >
          <Text style={styles.scrollTopButtonText}>↑</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const nutritionLogKeyExtractor = useCallback((log: CalorieLog) => log.id, []);

  const renderNutritionHeader = () => (
    <>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.screenTitle}>Nutrition</Text>
          <Text style={styles.screenSubtitle}>Week {currentWeek.weekNumber} - independent daily calories.</Text>
        </View>
        <TouchableOpacity activeOpacity={0.8} onPress={confirmResetNutrition} style={styles.nutritionResetButton}>
          <Text style={styles.nutritionResetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {renderStorageWarning()}
      {nutritionResetNotice ? (
        <View style={styles.nutritionResetNotice}>
          <Text style={styles.nutritionResetNoticeText}>{nutritionResetNotice}</Text>
        </View>
      ) : null}

      <View style={styles.metricGrid}>
        <View style={[styles.metricCard, styles.metricCardWide]}>
          <Text style={styles.labelText}>Target</Text>
          <TextInput
            blurOnSubmit={false}
            key={`${activeDay}-calorie-target`}
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
        <View style={styles.calorieInputGrid}>
          <View style={styles.calorieInputBlock}>
            <Text style={styles.calorieInputLabel}>Add Calories</Text>
            <View style={styles.calorieInputRow}>
              <TextInput
                blurOnSubmit={false}
                key={`${activeDay}-quick-add-calories`}
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
                blurOnSubmit={false}
                key={`${activeDay}-quick-extract-calories`}
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
          {MACRO_NAMES.map(renderMacroBar)}

          <View style={styles.calorieInputGrid}>
            <View style={styles.calorieInputBlock}>
              <Text style={styles.calorieInputLabel}>Food</Text>
              <TextInput
                blurOnSubmit={false}
                key={`${activeDay}-food-name`}
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
                blurOnSubmit={false}
                key={`${activeDay}-food-calories`}
                keyboardType="number-pad"
                onChangeText={(value) => setCalorieDraft("calories", value)}
                placeholder="500"
                placeholderTextColor={theme.placeholder}
                style={styles.calorieInput}
                value={calorieDraft.calories}
              />
            </View>
            <View style={styles.foodMacroGrid}>
              {MACRO_NAMES.map((macroName) => (
                <View key={macroName} style={styles.foodMacroInputBlock}>
                  <Text style={styles.calorieInputLabel}>{MACRO_LABELS[macroName]}</Text>
                  <TextInput
                    blurOnSubmit={false}
                    key={`${activeDay}-food-${macroName}`}
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
        </>
      )}

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>{nutritionMode === "Quick Calories" ? "Quick Logs" : "Meals"}</Text>
        <Text style={styles.historyCount}>{nutritionLogs.length} entries</Text>
      </View>
    </>
  );

  const renderNutritionEmpty = useCallback(
    () => (
      <Text style={styles.noHistoryText}>
        {nutritionMode === "Quick Calories" ? "No quick calorie logs yet." : "No macro meals logged yet."}
      </Text>
    ),
    [nutritionMode, styles.noHistoryText],
  );

  const renderNutritionLogItem = useCallback(
    ({ item: log }: ListRenderItemInfo<CalorieLog>) => {
      if (nutritionMode === "Quick Calories") {
        return (
          <View style={styles.historyRow}>
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
        );
      }

      const logMacros = log.macros ?? EMPTY_MACROS;
      return (
        <View style={styles.historyRow}>
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
    },
    [deleteCalorieLog, nutritionMode, styles],
  );

  const renderNutritionTab = () => (
    <FlatList<CalorieLog>
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      bounces
      contentContainerStyle={styles.screenContent}
      data={nutritionLogs}
      initialNumToRender={8}
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="always"
      keyExtractor={nutritionLogKeyExtractor}
      ListEmptyComponent={renderNutritionEmpty}
      ListHeaderComponent={renderNutritionHeader()}
      maxToRenderPerBatch={8}
      removeClippedSubviews={Platform.OS === "android"}
      renderItem={renderNutritionLogItem}
      showsVerticalScrollIndicator={false}
      updateCellsBatchingPeriod={32}
      windowSize={7}
    />
  );

  const weightHistoryKeyExtractor = useCallback((entry: WeightHistoryItem) => entry.week.id, []);

  const renderWeightHeader = () => (
    <>
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
            blurOnSubmit={false}
            key={`${currentWeek.id}-bodyweight`}
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
    </>
  );

  const renderWeightHistoryItem = useCallback(
    ({ item }: ListRenderItemInfo<WeightHistoryItem>) => (
      <View style={styles.weightHistoryRow}>
        <View>
          <Text style={styles.weightHistoryWeek}>Week {item.week.weekNumber}</Text>
          <Text style={styles.weightHistoryMeta}>{formatWeightEntryDate(weeks.length, item.originalIndex)}</Text>
        </View>
        <Text style={styles.weightHistoryValue}>
          {item.week.bodyweight.value ? `${item.week.bodyweight.value} ${item.week.bodyweight.unit}` : "--"}
        </Text>
      </View>
    ),
    [styles, weeks.length],
  );

  const renderWeightTab = () => (
    <FlatList<WeightHistoryItem>
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      bounces
      contentContainerStyle={styles.screenContent}
      data={weightHistory}
      initialNumToRender={8}
      keyboardDismissMode={KEYBOARD_DISMISS_MODE}
      keyboardShouldPersistTaps="handled"
      keyExtractor={weightHistoryKeyExtractor}
      ListHeaderComponent={renderWeightHeader()}
      maxToRenderPerBatch={8}
      removeClippedSubviews={Platform.OS === "android"}
      renderItem={renderWeightHistoryItem}
      showsVerticalScrollIndicator={false}
      updateCellsBatchingPeriod={32}
      windowSize={7}
    />
  );

  const renderCalendarCell = (cell: CalendarCell, compact = false) => (
    <View
      accessible
      accessibilityLabel={`${cell.weekdayLabel} ${cell.monthLabel} ${cell.dayNumber}${cell.completed ? ", completed" : ""}${cell.isToday ? ", today" : ""}`}
      key={cell.key}
      style={[
        styles.calendarCell,
        compact && styles.progressCalendarCell,
        cell.completed && styles.calendarCellCompleted,
        cell.isToday && styles.calendarCellToday,
      ]}
    >
      <Text style={[styles.calendarCellText, cell.completed && styles.calendarCellTextCompleted]}>
        {cell.dayNumber}
      </Text>
    </View>
  );

  const renderProgressMonthCell = (cell: CalendarMonthCell) => {
    if (cell.isBlank) {
      return (
        <View
          key={cell.key}
          style={[styles.calendarCell, styles.progressMonthCalendarCell, styles.progressMonthBlankCell]}
        />
      );
    }

    const calorieText = cell.completed || cell.isToday ? formatCalendarCalories(cell.calories) : "";

    return (
      <View
        accessible
        accessibilityLabel={`${cell.weekdayLabel} ${cell.monthLabel} ${cell.dayNumber}${cell.completed ? ", completed" : ""}${cell.isToday ? ", today" : ""}${calorieText ? `, ${Math.round(cell.calories)} calories eaten` : ""}`}
        key={cell.key}
        style={[
          styles.calendarCell,
          styles.progressMonthCalendarCell,
          cell.completed && styles.calendarCellCompleted,
          cell.isToday && styles.calendarCellToday,
        ]}
      >
        <Text style={[styles.calendarCellText, cell.completed && styles.calendarCellTextCompleted]}>
          {cell.dayNumber}
        </Text>
        {calorieText ? (
          <Text
            numberOfLines={1}
            style={[styles.calendarCalorieText, cell.completed && styles.calendarCalorieTextCompleted]}
          >
            {calorieText}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderFullProgressHistory = () => (
    <ScrollView bounces contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.heroHeader}>
        <View style={styles.historyHeroCopy}>
          <Text style={styles.screenTitle}>Progress History</Text>
          <Text style={styles.screenSubtitle}>
            {progressHistoryCompletedCount} completed {progressHistoryCompletedCount === 1 ? "day" : "days"}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel="Back to normal stats"
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={() => setIsProgressHistoryOpen(false)}
          style={styles.historyOpenButton}
        >
          <Text style={styles.historyOpenButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.historyHeader}>
          <View style={styles.historyHeaderCopy}>
            <Text style={styles.historyTitle}>Full Progress</Text>
            <Text style={styles.historyCount}>
              {progressHistoryMonths.length} available {progressHistoryMonths.length === 1 ? "month" : "months"}
            </Text>
          </View>
        </View>
        {progressHistoryCompletedCount === 0 ? (
          <Text style={styles.noHistoryText}>No completed days yet.</Text>
        ) : null}
        <View style={styles.progressHistoryList}>
          {progressHistoryMonths.map((month) => (
            <View key={month.key} style={styles.progressMonthSection}>
              <View style={styles.progressMonthHeader}>
                <Text style={styles.progressMonthTitle}>{month.label}</Text>
                <Text style={styles.progressMonthCount}>
                  {month.completedCount} completed {month.completedCount === 1 ? "day" : "days"}
                </Text>
              </View>
              <View style={styles.calendarWeekdayRow}>
                {CALENDAR_WEEKDAY_LABELS.map((label) => (
                  <Text key={`${month.key}-${label}`} style={styles.calendarWeekdayLabel}>{label}</Text>
                ))}
              </View>
              <View style={styles.progressMonthGrid}>
                {Array.from({ length: Math.ceil(month.cells.length / 7) }, (_, rowIndex) => (
                  <View key={`${month.key}-row-${rowIndex}`} style={styles.progressMonthWeekRow}>
                    {month.cells.slice(rowIndex * 7, rowIndex * 7 + 7).map(renderProgressMonthCell)}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const renderAnalyticsTab = () => {
    if (isProgressHistoryOpen) {
      return renderFullProgressHistory();
    }

    return (
      <ScrollView bounces contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.screenTitle}>Stats</Text>
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
            <Text style={styles.analyticsNumber}>{Math.round(currentWeekVolume)}</Text>
            <Text style={styles.sectionSubtitle}>sets x reps x load</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.historyHeader}>
            <View style={styles.historyHeaderCopy}>
              <Text style={styles.historyTitle}>Consistency Calendar</Text>
              <Text style={styles.historyCount}>{calendarWeekRange}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Open full progress history"
              accessibilityRole="button"
              activeOpacity={0.8}
              onPress={() => setIsProgressHistoryOpen(true)}
              style={styles.historyOpenButton}
            >
              <Text style={styles.historyOpenButtonText}>Open</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.calendarWeekdayRow}>
            {CALENDAR_WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.calendarWeekdayLabel}>{label}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendarCells.map((cell) => renderCalendarCell(cell))}
          </View>
          <View style={styles.calendarNavRow}>
            <TouchableOpacity
              accessibilityLabel="Show previous consistency week"
              accessibilityRole="button"
              activeOpacity={0.8}
              onPress={showPreviousCalendarWeek}
              style={styles.calendarNavButton}
            >
              <Text style={styles.calendarNavButtonText}>Prev</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Show current consistency week"
              accessibilityRole="button"
              activeOpacity={0.8}
              onPress={showCurrentCalendarWeek}
              style={styles.calendarNavButton}
            >
              <Text style={styles.calendarNavButtonText}>This Week</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Show next consistency week"
              accessibilityRole="button"
              activeOpacity={0.8}
              disabled={!canGoToNextCalendarWeek}
              onPress={showNextCalendarWeek}
              style={[styles.calendarNavButton, !canGoToNextCalendarWeek && styles.disabledButton]}
            >
              <Text style={styles.calendarNavButtonText}>Next</Text>
            </TouchableOpacity>
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
          {currentOneRepMaxSnapshot.map((exercise) => (
            <View key={exercise.id} style={styles.oneRmRow}>
              <Text style={styles.oneRmName}>{exercise.name}</Text>
              <Text style={styles.oneRmValue}>{Math.round(exercise.oneRepMax) || "--"} {currentWeek.bodyweight.unit}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

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
    <ScrollView
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      bounces
      contentContainerStyle={styles.screenContent}
      keyboardDismissMode={KEYBOARD_DISMISS_MODE}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.screenTitle}>Settings</Text>
          <Text style={styles.screenSubtitle}>Goals, macros, and rest timer.</Text>
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

  const renderTabPageContent = (tab: AppTab) => {
    if (tab === "Nutrition") {
      return renderNutritionTab();
    }

    if (tab === "Weight") {
      return renderWeightTab();
    }

    if (tab === "Stats") {
      return renderAnalyticsTab();
    }

    if (tab === "Settings") {
      return renderSettingsTab();
    }

    return renderWorkoutTab();
  };

  return (
    <View style={styles.gestureRoot}>
      <View style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={theme.surface} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={IOS_KEYBOARD_VERTICAL_OFFSET}
          style={styles.keyboardRoot}
        >
          <View style={styles.appShell}>
            <View style={styles.contentArea}>
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.tabPagerContent}
                decelerationRate="fast"
                disableIntervalMomentum
                horizontal
                keyboardDismissMode={KEYBOARD_DISMISS_MODE}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                onMomentumScrollEnd={handleTabMomentumEnd}
                onScroll={handleTabScroll}
                onScrollEndDrag={handleTabScrollEndDrag}
                overScrollMode="never"
                pagingEnabled
                ref={tabPagerRef}
                scrollEventThrottle={16}
                showsHorizontalScrollIndicator={false}
                snapToAlignment="start"
                snapToInterval={pageWidth}
              >
                {APP_TABS.map((tab) => (
                  <View key={tab} style={[styles.tabPage, { width: pageWidth }]}>
                    {renderTabPageContent(tab)}
                  </View>
                ))}
              </ScrollView>
            </View>
            {renderPlateModal()}
            {renderAddDayModal()}

            <View style={styles.bottomTabBar}>
              {APP_TABS.map((tab) => (
                <BottomTabButton
                  activeTab={activeTab}
                  key={tab}
                  onPress={handleTabPress}
                  styles={styles}
                  tab={tab}
                />
              ))}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const accent = "#2F7BFF";
  const doneGreen = "#22C55E";
  const coral = "#FF5A5F";
  const background = "#000000";
  const surface = "#111111";
  const surfaceElevated = "#151515";
  const border = "#1E1E1E";
  const inputBorder = "#333333";

  return StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  safeArea: {
    backgroundColor: background,
    flex: 1,
  },
  keyboardRoot: {
    backgroundColor: background,
    flex: 1,
  },
  appShell: {
    backgroundColor: background,
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  tabPagerContent: {
    flexGrow: 1,
  },
  tabPage: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: 20,
    paddingTop: SCREEN_TOP_PADDING + 4,
    paddingBottom: SCREEN_BOTTOM_PADDING,
  },
  topBar: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  screenTitle: {
    color: theme.strongText,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0,
  },
  screenSubtitle: {
    color: theme.mutedText,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
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
    marginBottom: 20,
  },
  weekPanel: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  weekSelector: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekButton: {
    alignItems: "center",
    backgroundColor: "#151515",
    borderColor: inputBorder,
    borderRadius: 10,
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
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
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
    backgroundColor: accent,
    borderColor: accent,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
  },
  addWeekText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  deleteWeekButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 10,
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
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    padding: 14,
  },
  activeTimerPanel: {
    backgroundColor: accent,
    borderColor: accent,
  },
  timerHint: {
    color: theme.mutedText,
    fontSize: 13,
    marginTop: 3,
  },
  activeTimerText: {
    color: "#FFFFFF",
  },
  activeTimerSubtext: {
    color: "#FFFFFF",
  },
  timerValue: {
    color: theme.text,
    fontSize: 32,
    fontWeight: "900",
  },
  activeTimerValue: {
    color: "#FFFFFF",
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
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  warningText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "800",
  },
  gamificationCard: {
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  streakHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  streakTitleBlock: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  streakIcon: {
    color: accent,
    fontSize: 22,
    lineHeight: 24,
  },
  streakTitle: {
    color: accent,
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
  },
  levelPill: {
    backgroundColor: "rgba(47, 123, 255, 0.14)",
    borderColor: accent,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  levelPillText: {
    color: theme.strongText,
    fontSize: 12,
    fontWeight: "900",
  },
  xpMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  xpMetaText: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  levelProgressTrack: {
    backgroundColor: "#0A0A0A",
    borderColor: inputBorder,
    borderRadius: 999,
    borderWidth: 1,
    height: 10,
    marginTop: 9,
    overflow: "hidden",
  },
  levelProgressFill: {
    backgroundColor: accent,
    height: "100%",
  },
  baseDayTabsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingBottom: 18,
    width: "100%",
  },
  extraDayTabsContent: {
    gap: 10,
    paddingBottom: 12,
  },
  workoutTabsBlock: {
    marginBottom: 2,
  },
  workoutTabShell: {
    flex: 1,
  },
  dayTab: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  activeDayTab: {
    backgroundColor: accent,
    borderColor: accent,
  },
  extraDayTab: {
    flex: 0,
    minWidth: 128,
  },
  dayTabText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "900",
  },
  activeDayTabText: {
    color: "#FFFFFF",
  },
  scrollTopButton: {
    alignItems: "center",
    backgroundColor: accent,
    borderColor: accent,
    borderRadius: 24,
    borderWidth: 1,
    bottom: 18,
    elevation: 20,
    height: 48,
    justifyContent: "center",
    position: "absolute",
    right: 18,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    width: 48,
    zIndex: 20,
  },
  scrollTopButtonText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 26,
  },
  addDayButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 12,
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
    marginBottom: 14,
  },
  sectionTitle: {
    color: theme.strongText,
    fontSize: 22,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: theme.mutedText,
    fontSize: 13,
    marginTop: 3,
  },
  addExerciseRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  exerciseInput: {
    backgroundColor: surface,
    borderColor: inputBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.text,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: accent,
    borderColor: accent,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 70,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  recommendedExercisePanel: {
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 16,
    padding: 14,
  },
  recommendedExerciseTitle: {
    color: theme.strongText,
    fontSize: 16,
    fontWeight: "900",
  },
  recommendedExerciseSubtitle: {
    color: theme.mutedText,
    fontSize: 12,
    fontWeight: "800",
    marginTop: -5,
  },
  recommendedExerciseList: {
    gap: 8,
  },
  recommendedExerciseButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: inputBorder,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  recommendedExerciseText: {
    color: theme.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  recommendedExerciseAdd: {
    color: accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 12,
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
  exerciseCard: {
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  exerciseAccentLine: {
    backgroundColor: accent,
    borderRadius: 999,
    height: 3,
    marginBottom: 14,
    width: 42,
  },
  exerciseHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
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
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 30,
  },
  disabledIconButton: {
    opacity: 0.32,
  },
  orderButtonText: {
    color: theme.strongText,
    fontSize: 15,
    fontWeight: "900",
  },
  exerciseTitleWrap: {
    flex: 1,
  },
  exerciseNameInput: {
    borderBottomColor: border,
    borderBottomWidth: 1,
    color: theme.strongText,
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    paddingVertical: 8,
  },
  oneRepMaxText: {
    color: accent,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
  },
  removeExerciseButton: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeText: {
    color: coral,
    fontSize: 12,
    fontWeight: "900",
  },
  setHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
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
  setHeaderWeight: {
    color: theme.mutedText,
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 88,
    textAlign: "center",
    textTransform: "uppercase",
  },
  setHeaderReps: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    width: 62,
  },
  setHeaderRpe: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    width: 42,
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
    width: 70,
  },
  setHeaderDelete: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    width: 38,
  },
  setRow: {
    alignItems: "center",
    borderBottomColor: "#242424",
    borderBottomWidth: 1,
    gap: 10,
    marginBottom: 12,
    paddingBottom: 14,
    width: "100%",
  },
  setMainRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 48,
    width: "100%",
  },
  setNumber: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center",
    width: 28,
  },
  setInput: {
    backgroundColor: "#111111",
    borderColor: inputBorder,
    borderRadius: 8,
    borderWidth: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    height: 46,
    paddingHorizontal: 10,
    paddingVertical: 0,
    textAlign: "center",
    width: 62,
  },
  rpeInput: {
    backgroundColor: "#111111",
    borderColor: inputBorder,
    borderRadius: 8,
    borderWidth: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    height: 36,
    paddingHorizontal: 6,
    paddingVertical: 0,
    textAlign: "center",
    width: 50,
  },
  setWeightInput: {
    backgroundColor: "#111111",
    borderColor: inputBorder,
    borderRadius: 8,
    borderWidth: 1,
    color: "#FFFFFF",
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    height: 46,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 0,
    textAlign: "center",
  },
  setUtilityRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingLeft: 34,
    width: "100%",
  },
  rpeControl: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  utilityLabel: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  weightQuickActions: {
    flexDirection: "row",
    gap: 6,
  },
  weightQuickButton: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderColor: inputBorder,
    borderRadius: 6,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  weightQuickText: {
    color: accent,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 14,
  },
  plateMiniButton: {
    alignItems: "center",
    backgroundColor: "#222222",
    borderColor: inputBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  plateMiniButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  previousBadge: {
    alignItems: "center",
    backgroundColor: "#0A0A0A",
    borderColor: border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1.15,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 120,
    paddingHorizontal: 10,
  },
  previousLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingLeft: 34,
    width: "100%",
  },
  previousLineLabel: {
    color: theme.mutedText,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14,
    textTransform: "uppercase",
    width: 44,
  },
  previousBadgeText: {
    color: theme.strongText,
    fontSize: 12,
    fontWeight: "800",
  },
  progressBadge: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 132,
    paddingHorizontal: 10,
    width: 138,
  },
  positiveProgressBadge: {
    backgroundColor: "rgba(47, 123, 255, 0.14)",
    borderColor: accent,
  },
  negativeProgressBadge: {
    backgroundColor: "rgba(255, 90, 95, 0.12)",
    borderColor: coral,
  },
  neutralProgressBadge: {
    backgroundColor: "#0A0A0A",
    borderColor: border,
  },
  progressSymbol: {
    fontSize: 13,
    fontWeight: "900",
  },
  progressLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  positiveProgressText: {
    color: accent,
  },
  negativeProgressText: {
    color: coral,
  },
  neutralProgressText: {
    color: theme.neutral,
  },
  maxEffortBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(47, 123, 255, 0.12)",
    borderColor: accent,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  maxEffortText: {
    color: accent,
    fontSize: 11,
    fontWeight: "900",
  },
  removeSetButton: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderColor: inputBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 38,
  },
  removeSetText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
  },
  doneSetButton: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderColor: inputBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
    width: 70,
  },
  doneSetButtonActive: {
    backgroundColor: doneGreen,
    borderColor: doneGreen,
  },
  doneSetText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    lineHeight: 12,
  },
  doneSetTextActive: {
    color: "#000000",
  },
  exerciseActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: accent,
    borderColor: accent,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  outlineButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1.25,
    paddingVertical: 12,
  },
  outlineButtonText: {
    color: theme.strongText,
    fontSize: 13,
    fontWeight: "900",
  },
  weightHero: {
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
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
    backgroundColor: surface,
    borderColor: inputBorder,
    borderRadius: 12,
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
    backgroundColor: accent,
    borderColor: accent,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 62,
    minWidth: 72,
    paddingHorizontal: 16,
  },
  weightUnitButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  weightProgressBadge: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  weightProgressArrow: {
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    width: 34,
  },
  weightProgressCopy: {
    flex: 1,
    minWidth: 0,
  },
  weightProgressLabel: {
    fontSize: 16,
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
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
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
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
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
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 96,
    padding: 14,
    width: "48%",
  },
  metricCardWide: {
    width: "100%",
  },
  metricValue: {
    color: accent,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 10,
  },
  metricInput: {
    borderBottomColor: inputBorder,
    borderBottomWidth: 1,
    color: theme.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6,
    paddingVertical: 5,
  },
  nutritionResetButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: coral,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14,
  },
  nutritionResetText: {
    color: coral,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  nutritionResetNotice: {
    backgroundColor: "rgba(47, 123, 255, 0.12)",
    borderColor: accent,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  nutritionResetNoticeText: {
    color: theme.strongText,
    fontSize: 13,
    fontWeight: "800",
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
    backgroundColor: "#0A0A0A",
    borderColor: border,
    borderRadius: 999,
    borderWidth: 1,
    height: 14,
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: accent,
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
    backgroundColor: surface,
    borderColor: inputBorder,
    borderRadius: 10,
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
    backgroundColor: accent,
    borderColor: accent,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 86,
  },
  calorieActionButtonText: {
    color: "#FFFFFF",
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
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
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
    backgroundColor: surface,
    borderColor: inputBorder,
    borderRadius: 10,
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
  historyHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  historyHeroCopy: {
    flex: 1,
    paddingRight: 12,
  },
  historyOpenButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 74,
    paddingHorizontal: 14,
  },
  historyOpenButtonText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  noHistoryText: {
    color: theme.mutedText,
    fontSize: 13,
    marginTop: 12,
  },
  historyRow: {
    alignItems: "center",
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    padding: 12,
  },
  historyTypeDot: {
    backgroundColor: accent,
    borderColor: accent,
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
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteLogText: {
    color: coral,
    fontSize: 12,
    fontWeight: "900",
  },
  calendarGrid: {
    flexDirection: "row",
    gap: 6,
  },
  calendarWeekdayRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  calendarWeekdayLabel: {
    color: theme.mutedText,
    flex: 1,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
  },
  calendarCell: {
    alignItems: "center",
    backgroundColor: "#0B0B0B",
    borderColor: "#161616",
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    height: 36,
    justifyContent: "center",
  },
  calendarCellCompleted: {
    backgroundColor: accent,
    borderColor: accent,
  },
  calendarCellToday: {
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  calendarCellText: {
    color: theme.mutedText,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
  },
  calendarCellTextCompleted: {
    color: "#FFFFFF",
  },
  calendarCalorieText: {
    color: theme.mutedText,
    fontSize: 9,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    lineHeight: 11,
    textAlign: "center",
  },
  calendarCalorieTextCompleted: {
    color: "#FFFFFF",
  },
  calendarNavRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  calendarNavButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  calendarNavButtonText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  progressHistoryList: {
    gap: 18,
    marginTop: 4,
  },
  progressMonthSection: {
    alignItems: "stretch",
    borderBottomColor: theme.subtle,
    borderBottomWidth: 1,
    gap: 10,
    paddingBottom: 16,
  },
  progressMonthHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  progressMonthTitle: {
    color: theme.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  progressMonthCount: {
    color: theme.mutedText,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
  progressMonthGrid: {
    gap: 6,
  },
  progressMonthWeekRow: {
    flexDirection: "row",
    gap: 6,
  },
  progressCalendarCell: {
    flex: 0,
    height: 24,
    width: 24,
  },
  progressMonthCalendarCell: {
    flex: 1,
    gap: 3,
    height: 54,
    paddingHorizontal: 1,
    paddingVertical: 6,
  },
  progressMonthBlankCell: {
    backgroundColor: "transparent",
    borderColor: "transparent",
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
    gap: 12,
    marginBottom: 16,
  },
  analyticsCard: {
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 136,
    padding: 14,
  },
  analyticsNumber: {
    color: accent,
    fontSize: 38,
    fontWeight: "900",
    marginTop: 8,
  },
  chartCard: {
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
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
    backgroundColor: accent,
    borderRadius: 999,
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
    backgroundColor: surfaceElevated,
    borderColor: border,
    borderRadius: 12,
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
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 10,
  },
  segmentOptionActive: {
    backgroundColor: accent,
    borderColor: accent,
  },
  segmentOptionText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  segmentOptionTextActive: {
    color: "#FFFFFF",
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
    backgroundColor: surface,
    borderColor: inputBorder,
    borderRadius: 18,
    borderWidth: 1,
    padding: 3,
    width: 58,
  },
  toggleSwitchOn: {
    alignItems: "flex-end",
    backgroundColor: accent,
    borderColor: accent,
  },
  toggleKnob: {
    backgroundColor: theme.strongText,
    borderRadius: 13,
    height: 26,
    width: 26,
  },
  toggleKnobOn: {
    backgroundColor: "#000000",
  },
  timerDurationPanel: {
    borderColor: border,
    borderRadius: 12,
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
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  timerPresetButtonActive: {
    backgroundColor: accent,
    borderColor: accent,
  },
  timerPresetText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: "900",
  },
  timerPresetTextActive: {
    color: "#FFFFFF",
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
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 10,
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
    backgroundColor: accent,
    borderColor: accent,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  durationDisplayText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  durationInput: {
    backgroundColor: surface,
    borderColor: inputBorder,
    borderRadius: 10,
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
    backgroundColor: "#050505",
    borderTopColor: border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: BOTTOM_TAB_BOTTOM_PADDING,
  },
  bottomTabButton: {
    alignItems: "center",
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    overflow: "hidden",
    paddingHorizontal: 3,
    paddingVertical: 10,
    position: "relative",
  },
  bottomTabActiveFill: {
    backgroundColor: accent,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  bottomTabLabelStack: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 14,
    width: "100%",
  },
  bottomTabLabelOverlay: {
    position: "absolute",
  },
  activeBottomTabButton: {
    backgroundColor: accent,
    borderColor: accent,
  },
  bottomTabText: {
    color: theme.text,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  activeBottomTabText: {
    color: "#FFFFFF",
  },
  });
}
