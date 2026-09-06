#!/usr/bin/env bash
# DSHA: installs JDK 17 + Gradle + Android SDK into the DSH sandbox.
# Idempotent: finished steps are skipped, so re-running it is a safe "update".
# Progress goes to stdout — the app streams it into files/logs/harness.log.
#
# JDK comes from the Termux repo (bionic build — glibc JDKs do not run in
# this sandbox). zip archives are unpacked with unzip (JDK jar is unavailable
# before the JDK itself is in place).
set -u

SDK="$HOME/.dsh/android-sdk"
MARKER="$SDK/.installed"
mkdir -p "$SDK"
echo "[sdk] arch=$(uname -m) start"

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -L --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$2" "$1"
  else
    echo "[sdk] no downloader (curl/wget missing)"; exit 1
  fi
}

# ── JDK 17 (Termux repo .debs: bionic build; apt/dpkg are absent) ─────
# Resolve openjdk-17 + its dependency chain from Packages.gz and unpack
# every .deb with a node ar-reader + tar (xz/gz data archives).
if ! command -v java >/dev/null 2>&1; then
  MIRROR="https://packages.termux.dev/apt/termux-main"
  ARCH=$(uname -m)
  echo "[sdk] resolving openjdk-17 ($ARCH) from Termux repo…"
  fetch "$MIRROR/dists/stable/main/binary-$ARCH/Packages.gz" /tmp/dsh-pkgs.gz || exit 1
  gzip -dc /tmp/dsh-pkgs.gz > /tmp/dsh-Packages
  cat > /tmp/dsh-resolve.js <<'EOF'
const fs = require('fs');
const raw = fs.readFileSync(process.argv[2], 'utf8');
const pkgs = {};
raw.split('\n\n').forEach(b => {
  const m = b.match(/^Package: (.+)$/m);
  if (m && !pkgs[m[1].trim()]) pkgs[m[1].trim()] = b;
});
const seen = {}, order = [];
function depsOf(b) {
  const m = b.match(/^Depends: (.+)$/m);
  if (!m) return [];
  return m[1].split(',').map(s => s.trim().split(' ')[0].split('|')[0].trim()).filter(Boolean);
}
function visit(p) {
  if (seen[p] || !pkgs[p]) return;
  seen[p] = 1;
  depsOf(pkgs[p]).forEach(visit);
  order.push(p);
}
process.argv.slice(3).forEach(visit);
order.forEach(p => {
  const f = (pkgs[p].match(/^Filename: (.+)$/m) || [])[1];
  if (f) console.log(f);
});
EOF
  node /tmp/dsh-resolve.js /tmp/dsh-Packages openjdk-17 > /tmp/dsh-debs.txt
  [ -s /tmp/dsh-debs.txt ] || { echo "[sdk] openjdk-17 not found in repo index"; exit 1; }
  cat > /tmp/dsh-ar.js <<'EOF'
const fs = require('fs');
const buf = fs.readFileSync(process.argv[2]);
let off = 8;
while (off + 60 <= buf.length) {
  const hdr = buf.slice(off, off + 60).toString();
  const name = hdr.slice(0, 16).trim().replace(/\/$/, '');
  const size = parseInt(hdr.slice(48, 58), 10);
  if (name === process.argv[3]) {
    fs.writeFileSync(process.argv[4], buf.slice(off + 60, off + 60 + size));
    process.exit(0);
  }
  off += 60 + size + (size % 2);
}
process.exit(1);
EOF
  while read -r REL; do
    [ -z "$REL" ] && continue
    echo "[sdk] + $(basename "$REL")"
    fetch "$MIRROR/$REL" /tmp/dsh-pkg.deb || exit 1
    mkdir -p /tmp/dsh-x
    node /tmp/dsh-ar.js /tmp/dsh-pkg.deb data.tar.xz /tmp/dsh-x/data.tar.xz \
      || node /tmp/dsh-ar.js /tmp/dsh-pkg.deb data.tar.gz /tmp/dsh-x/data.tar.gz \
      || { echo "[sdk] deb read failed"; exit 1; }
    if [ -f /tmp/dsh-x/data.tar.xz ]; then tar -xJf /tmp/dsh-x/data.tar.xz -C /; fi
    if [ -f /tmp/dsh-x/data.tar.gz ]; then tar -xzf /tmp/dsh-x/data.tar.gz -C /; fi
    rm -f /tmp/dsh-pkg.deb /tmp/dsh-x/data.tar.*
  done < /tmp/dsh-debs.txt
  rm -rf /tmp/dsh-Packages /tmp/dsh-pkgs.gz /tmp/dsh-debs.txt /tmp/dsh-resolve.js /tmp/dsh-ar.js /tmp/dsh-x
  # tar does not run postinst: the JVM lives in usr/lib/jvm without bin
  # symlinks — point JAVA_HOME straight at it.
  JH=$(ls -d /data/data/com.termux/files/usr/lib/jvm/java-17-openjdk 2>/dev/null \
    || ls -d /data/data/com.termux/files/usr/lib/jvm/* 2>/dev/null | head -1)
  if [ -z "$JH" ] || [ ! -x "$JH/bin/java" ]; then echo "[sdk] jvm not found after unpack"; exit 1; fi
  export JAVA_HOME="$JH"
  export PATH="$JAVA_HOME/bin:$PATH"
  echo "[sdk] openjdk-17 installed at $JAVA_HOME"
else
  echo "[sdk] java: cached"
  JH=$(ls -d /data/data/com.termux/files/usr/lib/jvm/java-17-openjdk 2>/dev/null \
    || ls -d /data/data/com.termux/files/usr/lib/jvm/* 2>/dev/null | head -1)
  [ -n "$JH" ] && export JAVA_HOME="$JH" && export PATH="$JAVA_HOME/bin:$PATH"
fi
echo "[sdk] java: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# ── Gradle 8.13 ──────────────────────────────────────────────────────
if [ ! -x "$SDK/gradle/bin/gradle" ]; then
  echo "[sdk] downloading Gradle 8.13…"
  fetch "https://services.gradle.org/distributions/gradle-8.13-bin.zip" /tmp/dsh-gradle.zip || exit 1
  rm -rf "$SDK/gradle"
  "$JAVA_HOME/bin/jar" -xf /tmp/dsh-gradle.zip -C "$SDK" 2>/dev/null || (cd "$SDK" && "$JAVA_HOME/bin/jar" -xf /tmp/dsh-gradle.zip)
  [ -d "$SDK/gradle" ] || mv "$SDK/gradle-8.13" "$SDK/gradle"
  rm -f /tmp/dsh-gradle.zip
  echo "[sdk] Gradle installed"
else
  echo "[sdk] Gradle: cached"
fi
export GRADLE_HOME="$SDK/gradle"
export PATH="$GRADLE_HOME/bin:$PATH"

# ── Android cmdline-tools + packages ─────────────────────────────────
SDKM="$SDK/cmdline-tools/bin/sdkmanager"
if [ ! -f "$SDKM" ]; then
  echo "[sdk] downloading Android cmdline-tools…"
  fetch "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" /tmp/dsh-tools.zip || exit 1
  rm -rf "$SDK/cmdline-tools"
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
