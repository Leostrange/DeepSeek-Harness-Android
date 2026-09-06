This Android module now uses an embedded Termux-compatible runtime instead of a separately installed Termux app.

Important: targetSdk is intentionally 28 for this sideload build because the runtime executes native binaries extracted into app-private writable storage. compileSdk remains 35 and minSdk remains 26.
