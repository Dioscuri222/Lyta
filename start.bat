@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "MODEL_NAME=qwen2.5:3b-instruct-q4_K_M"
set "OLLAMA_FLASH_ATTENTION=1"
set "OLLAMA_KV_CACHE_TYPE=q8_0"
set "OLLAMA_ORIGINS=*"
set "OLLAMA_MAX_LOADED_MODELS=1"

echo ==========================================
echo   Lyta - Lightweight AI Companion (4GB VRAM)
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js tidak ditemukan. Silakan instal Node.js LTS terlebih dahulu.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/4] Menginstal dependensi Node.js...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Gagal menjalankan npm install.
    pause
    exit /b 1
  )
) else (
  echo [1/4] Dependensi siap.
)

where ollama >nul 2>&1
if errorlevel 1 (
  echo [2/4] Ollama tidak ditemukan di PATH. Melanjutkan dalam mode Gemini Hybrid...
  goto :start_server
)

curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if not errorlevel 1 (
  echo [2/4] Ollama sudah berjalan.
  goto :ollama_ready
)

echo [2/4] Menyalakan Ollama di latar belakang (1 terminal)...
start "" /B cmd /c "ollama serve >nul 2>&1"
set /a RETRIES=0

:wait_ollama
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if not errorlevel 1 goto :ollama_ready
set /a RETRIES+=1
if %RETRIES% LSS 15 goto :wait_ollama
echo [PERINGATAN] Ollama belum merespons dalam 15 detik, melanjutkan startup server...
goto :start_server

:ollama_ready
ollama list | findstr /I "%MODEL_NAME%" >nul 2>&1
if errorlevel 1 (
  echo [3/4] Mengunduh model ringan %MODEL_NAME%...
  ollama pull %MODEL_NAME%
) else (
  echo [3/4] Model %MODEL_NAME% sudah tersedia.
)

echo [3/4] Memuat model %MODEL_NAME% ke VRAM...
curl -s -X POST http://127.0.0.1:11434/api/generate -H "Content-Type: application/json" -d "{\"model\":\"%MODEL_NAME%\",\"prompt\":\"\",\"keep_alive\":\"15m\"}" >nul 2>&1

:start_server
echo [4/4] Menjalankan server Lyta di http://localhost:3000 ...
start "" /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm run dev
