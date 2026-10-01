# 1. In den Rust-ModCore-Ordner wechseln
Set-Location "$PSScriptRoot\modcore"

# 2. WebAssembly bauen
wasm-pack build --target web

# 3. Zurück in fractal-demo
Set-Location "$PSScriptRoot"

# 4. Dateien aus modcore/pkg nach fractal-demo kopieren
Copy-Item ".\modcore\pkg\modcore.js" -Destination ".\modcore.js" -Force
Copy-Item ".\modcore\pkg\modcore_bg.wasm" -Destination ".\modcore_bg.wasm" -Force

Write-Host "ModCore WASM erfolgreich gebaut und kopiert."
