const fs = require("fs");
const path = require("path");

const swapFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo",
  "node_modules",
  "@expo",
  "log-box",
  "ios",
  "ExpoRedBoxSwap.mm",
);

const noopSymbol = [
  "#else",
  "",
  "// Keep this translation unit non-empty when Expo LogBox swapping is disabled.",
  'extern "C" void ExpoRedBoxSwapNoop(void) {}',
  "",
  "#endif",
].join("\n");

if (!fs.existsSync(swapFile)) {
  process.exit(0);
}

const source = fs.readFileSync(swapFile, "utf8");

if (source.includes("ExpoRedBoxSwapNoop")) {
  process.exit(0);
}

fs.writeFileSync(swapFile, source.replace(/\n#endif\s*$/, `\n${noopSymbol}\n`));
