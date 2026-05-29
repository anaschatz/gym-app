# Gym App

A personal gym tracker built with Expo and React Native. The app helps track push,
pull, and leg workouts, log nutrition, monitor bodyweight, and review progress
analytics across training weeks.

## Features

- Push, Pull, and Legs workout tracking
- Custom extra workout days
- Exercise, set, weight, reps, and RPE logging
- Set completion tracking with rest timer support
- Previous-week set reference and estimated one-rep max display
- Plate calculator for kilogram-based barbell loading
- Quick calorie logging and macro-based meal tracking
- Daily calorie targets with automatic or custom macro goals
- Weekly bodyweight tracking with bulk/cut goal context
- Analytics for streaks, weekly volume, personal records, and 1RM snapshots
- Light and dark theme modes
- Local persistence with AsyncStorage

## Tech Stack

- Expo
- React Native
- TypeScript
- AsyncStorage
- React Native Web

## Getting Started

### Prerequisites

- Node.js
- npm
- Expo-compatible iOS, Android, or web environment
- Xcode for iOS simulator builds, if running on iOS
- Android Studio for Android emulator builds, if running on Android

### Install Dependencies

```bash
npm install
```

The install step also runs `scripts/patch-expo-logbox.js`, which applies a small
Expo LogBox iOS compatibility patch when the relevant generated file exists.

### Run the App

Start the Expo development server:

```bash
npm start
```

Run on iOS:

```bash
npm run ios
```

Run on Android:

```bash
npm run android
```

Run in the browser:

```bash
npm run web
```

## Available Scripts

| Script | Description |
| --- | --- |
| `npm start` | Starts the Expo development server. |
| `npm run ios` | Builds and runs the app on iOS. |
| `npm run android` | Builds and runs the app on Android. |
| `npm run web` | Starts the Expo web build. |
| `npm run postinstall` | Runs the Expo LogBox patch script. |

## Project Structure

```text
.
├── App.tsx                     # Main application UI, state, storage, and logic
├── app.json                    # Expo app configuration
├── assets/
│   └── icon.png                # App icon
├── metro.config.js             # Metro bundler configuration
├── package.json                # Dependencies and npm scripts
├── scripts/
│   └── patch-expo-logbox.js    # Postinstall Expo LogBox compatibility patch
└── tsconfig.json               # TypeScript configuration
```

## Data Storage

The app stores training weeks, extra workout days, calorie logs, completed sets,
completed dates, daily calorie targets, timer settings, and app settings locally
with AsyncStorage. Data is kept on the device or browser profile where the app is
running.

## Notes

- The app currently keeps its main implementation in `App.tsx`.
- `metro.config.js` blocks noisy generated paths while preserving Expo internals.
- If dependencies are reinstalled, the postinstall patch script runs again
  automatically.

## Troubleshooting

If the app fails after dependency changes, reinstall dependencies and restart
Expo:

```bash
npm install
npm start
```

If Metro appears stuck, clear Expo's cache:

```bash
npx expo start --clear
```
