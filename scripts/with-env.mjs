import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const separatorIndex = process.argv.indexOf("--");

if (separatorIndex === -1) {
  console.error("Usage: node scripts/with-env.mjs KEY=value [KEY=value ...] -- command [args...]");
  process.exit(1);
}

const envArgs = process.argv.slice(2, separatorIndex);
const commandArgs = process.argv.slice(separatorIndex + 1);

if (commandArgs.length === 0) {
  console.error("Missing command after --");
  process.exit(1);
}

const env = { ...process.env };
const isWindows = process.platform === "win32";

function ensureLocalProtoc() {
  const protocKey = resolveEnvKey("PROTOC");
  const protocIncludeKey = resolveEnvKey("PROTOC_INCLUDE");
  const includeCandidates = [];
  const bundledRoot = path.join(repoRoot, "protoc");
  const bundledProtoc = isWindows
    ? path.join(bundledRoot, "bin", "protoc.exe")
    : path.join(bundledRoot, "bin", "protoc");
  const bundledInclude = path.join(bundledRoot, "include");
  const hasBundledProtoc = fs.existsSync(bundledProtoc);
  const hasBundledInclude = fs.existsSync(
    path.join(bundledInclude, "google", "protobuf", "empty.proto"),
  );

  if (hasBundledProtoc) {
    env[protocKey] = bundledProtoc;
  }
  if (hasBundledInclude) {
    env[protocIncludeKey] = bundledInclude;
  }

  if (env[protocKey] && env[protocIncludeKey]) {
    return;
  }

  if (env[protocKey]) {
    const protocDir = path.dirname(env[protocKey]);
    includeCandidates.push(
      path.resolve(protocDir, "..", "include"),
      path.resolve(protocDir, "..", "..", "include"),
    );
  }

  const candidates = isWindows
    ? [
        path.join(repoRoot, "tools", "protoc", "bin", "protoc.exe"),
        path.join(repoRoot, "bin", "protoc.exe"),
      ]
    : [
        path.join(repoRoot, "tools", "protoc", "bin", "protoc"),
        path.join(repoRoot, "bin", "protoc"),
      ];

  if (!env[protocKey]) {
    const localProtoc = candidates.find((candidate) => fs.existsSync(candidate));
    if (localProtoc) {
      env[protocKey] = localProtoc;
      const protocDir = path.dirname(localProtoc);
      includeCandidates.push(
        path.resolve(protocDir, "..", "include"),
        path.resolve(protocDir, "..", "..", "include"),
      );
    }
  }

  if (!env[protocIncludeKey]) {
    const localInclude = includeCandidates.find((candidate) =>
      fs.existsSync(path.join(candidate, "google", "protobuf", "empty.proto")),
    );
    if (localInclude) {
      env[protocIncludeKey] = localInclude;
    }
  }
}

function commandLooksLikeRustBuild() {
  const command = commandArgs[0]?.toLowerCase();
  return command === "cargo" || command === "tauri";
}

function commandIsCargo() {
  return commandArgs[0]?.toLowerCase() === "cargo";
}

function ensureWindowsRustToolchain() {
  if (!isWindows || !commandLooksLikeRustBuild()) {
    return;
  }

  const targetKey = resolveEnvKey("CARGO_BUILD_TARGET");
  const toolchainKey = resolveEnvKey("RUSTUP_TOOLCHAIN");
  if (env[targetKey] || env[toolchainKey]) {
    return;
  }

  const rustup = spawnSync("rustup", ["toolchain", "list"], {
    encoding: "utf8",
    shell: true,
  });
  if (rustup.status !== 0) {
    return;
  }

  const installed = rustup.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const preferredToolchain = installed.find((line) =>
    line.startsWith("stable-x86_64-pc-windows-msvc"),
  ) ?? installed.find((line) => line.startsWith("x86_64-pc-windows-msvc"));

  if (preferredToolchain) {
    env[toolchainKey] = preferredToolchain.replace(/\s+\(.*\)$/, "");
    if (commandIsCargo()) {
      env[targetKey] = "x86_64-pc-windows-msvc";
    }
    return;
  }

  const active = spawnSync("rustup", ["show", "active-toolchain"], {
    encoding: "utf8",
    shell: true,
  });
  const activeToolchain = active.stdout.trim();
  if (activeToolchain.includes("windows-gnu")) {
    console.warn(
      "[with-env] Detected GNU Rust toolchain on Windows. `lancedb`/`lance` often fails to link with MinGW. Install MSVC and run `rustup default stable-x86_64-pc-windows-msvc`.",
    );
  }
}

function resolveEnvKey(key) {
  const existingKey = Object.keys(env).find(
    (envKey) => envKey.toLowerCase() === key.toLowerCase(),
  );
  return existingKey ?? key;
}

for (const entry of envArgs) {
  const pathAppendIndex = entry.indexOf("+=");
  const equalsIndex = entry.indexOf("=");

  if (pathAppendIndex > 0) {
    const key = resolveEnvKey(entry.slice(0, pathAppendIndex));
    const value = entry.slice(pathAppendIndex + 2);
    const currentValue = env[key];
    env[key] = currentValue ? `${value}${path.delimiter}${currentValue}` : value;
    continue;
  }

  if (equalsIndex <= 0) {
    console.error(`Invalid environment assignment: ${entry}`);
    process.exit(1);
  }

  const key = resolveEnvKey(entry.slice(0, equalsIndex));
  const value = entry.slice(equalsIndex + 1);
  env[key] = value;
}

ensureLocalProtoc();
ensureWindowsRustToolchain();

const child = spawn(commandArgs[0], commandArgs.slice(1), {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
