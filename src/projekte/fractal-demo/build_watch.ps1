# build_watch.ps1

$root = $PSScriptRoot
$modcore = Join-Path $root "modcore"
$pkg = Join-Path $modcore "pkg"

Write-Host "Watching Rust files in $modcore\src ..."

# FileSystemWatcher einrichten
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = "$modcore\src"
$watcher.Filter = "*.rs"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Event-Handler
Register-ObjectEvent $watcher Changed -Action {
    Write-Host "`nÄnderung erkannt → baue WASM..."

    # Rust bauen
    wasm-pack build --target web

    # Dateien kopieren
    Copy-Item "$pkg\modcore.js" "$root\mod_core_wasm.js" -Force
    Copy-Item "$pkg\modcore_bg.wasm" "$root\mod_core_wasm_bg.wasm" -Force

    Write-Host "WASM aktualisiert → Browser reloaden (F5)"
}

# Script läuft weiter
Write-Host "Watcher aktiv. STRG+C zum Beenden."
while ($true) { Start-Sleep -Seconds 1 }
