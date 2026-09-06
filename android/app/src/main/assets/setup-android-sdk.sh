#!/usr/bin/env bash
# DSHA: installs JDK 17 + Gradle + Android SDK into the DSH sandbox.
# Idempotent: finished steps are skipped, so re-running it is a safe "update".
# Progress goes to stdout — the app streams it into files/logs/harness.log.
set -u

SDK="$HOME/.dsh/android-sdk"
MARKER="$SDK/.installed"
mkdir -p "$SDK"
ARCH=$(uname -m)
echo "[sdk] arch=$ARCH start"

fetch() {
  # fetch <url> <out>
  if command -v curl >/dev/null 2>&1; then
    curl -L --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$2" "$1"
  else
    node -e "const https=require('https'),fs=require('fs');const get=(u)=>https.get(u,r=>{if(r.statusCode>=300&&r.headers.location)return get(r.headers.location);r.pipe(fs.createWriteStream(process.argv[2]))});get('$1')" 2>/dev/null || { echo "[sdk] no downloader"; exit 1; }
  fi
}

# ── JDK 17 (Temurin via Adoptium API) ────────────────────────────────
if [ ! -x "$SDK/jdk/bin/java" ]; then
  case "$ARCH" in
    aarch64|arm64) JARCH=aarch64 ;;
    *)             JARCH=x64 ;;
  esac
  echo "[sdk] downloading JDK 17 ($JARCH)…"
  fetch "https://api.adoptium.net/v3/binary/latest/17/ga/linux/${JARCH}/jdk/hotspot/normal/eclipse" /tmp/dsh-jdk.tar.gz || exit 1
  rm -rf "$SDK/jdk"; mkdir -p "$SDK/jdk"
  tar -xzf /tmp/dsh-jdk.tar.gz -C "$SDK/jdk" --strip-components=1 && rm -f /tmp/dsh-jdk.tar.gz
  echo "[sdk] JDK installed"
else
  echo "[sdk] JDK: cached"
fi
export JAVA_HOME="$SDK/jdk"
export PATH="$JAVA_HOME/bin:$PATH"

# ── Gradle 8.13 ──────────────────────────────────────────────────────
if [ ! -x "$SDK/gradle/bin/gradle" ]; then
  echo "[sdk] downloading Gradle 8.13…"
  fetch "https://services.gradle.org/distributions/gradle-8.13-bin.zip" /tmp/dsh-gradle.zip || exit 1
  rm -rf "$SDK/gradle"; mkdir -p "$SDK/gradle"
  "$JAVA_HOME/bin/jar" -xf /tmp/dsh-gradle.zip -C 2>/dev/null || (cd "$SDK" && "$JAVA_HOME/bin/jar" -xf /tmp/dsh-gradle.zip && mv gradle-8.13 gradle)
  rm -f /tmp/dsh-gradle.zip
  echo "[sdk] Gradle installed"
else
  echo "[sdk] Gradle: cached"
fi
export GRADLE_HOME="$SDK/gradle"
export PATH="$GRADLE_HOME/bin:$PATH"

# ── Android cmdline-tools + packages ─────────────────────────────────
SDKM="$SDK/cmdline-tools/bin/sdkmanager"
if [ ! -x "$SDKM" ]; then
  echo "[sdk] downloading Android cmdline-tools…"
  fetch "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" /tmp/dsh-tools.zip || exit 1
  mkdir -p "$SDK/cmdline-tools"
  (cd "$SDK/cmdline-tools" && "$JAVA_HOME/bin/jar" -xf /tmp/dsh-tools.zip)
  rm -f /tmp/dsh-tools.zip
  echo "[sdk] cmdline-tools installed"
else
  echo "[sdk] cmdline-tools: cached"
fi
export ANDROID_HOME="$SDK"

echo "[sdk] accepting licenses…"
yes | "$SDKM" --licenses >/dev/null 2>&1 || true
echo "[sdk] installing platform-tools + android-35 + build-tools…"
"$SDKM" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

"$JAVA_HOME/bin/java" -version 2>&1 | head -1 > "$SDK/versions.txt"
"$GRADLE_HOME/bin/gradle" --version 2>/dev/null | grep Gradle >> "$SDK/versions.txt" || true
echo "SDK: $ANDROID_HOME" >> "$SDK/versions.txt"
touch "$MARKER"
echo "[sdk] DONE"
