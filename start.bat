@echo off
setlocal EnableExtensions
cd /d "%~dp0"

:: ==========================================
:: Konfigurasi Engine Lokal (1 Klik, 1 Terminal)
:: Pilihan LOCAL_ENGINE: llamacpp | ollama | gemini
:: ==========================================
set "LOCAL_ENGINE=llamacpp"

:: Konfigurasi llama.cpp (llama-server) untuk RAM 16GB / VRAM 4GB
set "LLAMA_SERVER_BIN=llama-server"
set "LLAMA_MODEL_PATH=models\qwen2.5-3b-instruct-q4_k_m.gguf"
set "LLAMA_CTX=4096"
set "LLAMA_NGL=99"
set "LLAMA_PORT=8080"

:: Konfigurasi Ollama (fallback / opsi kedua)
set "MODEL_NAME=qwen2.5:3b-instruct-q4_K_M"
set "OLLAMA_FLASH_ATTENTION=1"
set "OLLAMA_KV_CACHE_TYPE=q8_0"
set "OLLAMA_ORIGINS=*"
set "OLLAMA_MAX_LOADED_MODELS=1"

echo ==========================================
echo   Lyta - Companion Ringan (RAM 16GB / VRAM 4GB)
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

if /I "%LOCAL_ENGINE%"=="gemini" goto :start_server
if /I "%LOCAL_ENGINE%"=="ollama" goto :boot_ollama

:: --- Jalur llama.cpp (llama-server) ---
if exist "%~dp0llama-server.exe" set "LLAMA_SERVER_BIN=%~dp0llama-server.exe"
where "%LLAMA_SERVER_BIN%" >nul 2>&1
if errorlevel 1 (
  echo [PERINGATAN] llama-server tidak ditemukan di PATH maupun folder proyek.
  echo              Taruh llama-server.exe atau tambahkan ke PATH, lalu jalankan ulang.
  echo              Mencoba fallback ke Ollama jika tersedia...
  goto :boot_ollama
)

if not exist "%LLAMA_MODEL_PATH%" (
  for %%F in ("models\*.gguf") do (
    set "LLAMA_MODEL_PATH=%%~F"
    goto :llama_model_found
  )
  echo [PERINGATAN] File model GGUF belum ditemukan di "%LLAMA_MODEL_PATH%" atau folder models\.
  echo              Taruh file .gguf ke folder models\ atau lanjut dengan Ollama / Gemini Hybrid.
  goto :boot_ollama
)

:llama_model_found
curl -s http://127.0.0.1:%LLAMA_PORT%/health >nul 2>&1
if not errorlevel 1 (
  echo [2/4] llama-server sudah berjalan di port %LLAMA_PORT%.
  goto :start_server
)

echo [2/4] Menyalakan llama-server (ctx=%LLAMA_CTX%, ngl=%LLAMA_NGL%, FlashAttn + KV Q8_0)...
start "" /B cmd /c ""%LLAMA_SERVER_BIN%" -m "%LLAMA_MODEL_PATH%" -c %LLAMA_CTX% -ngl %LLAMA_NGL% -fa on -ctk q8_0 -ctv q8_0 --host 127.0.0.1 --port %LLAMA_PORT% >nul 2>&1"
set /a RETRIES=0

:wait_llamacpp
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:%LLAMA_PORT%/health >nul 2>&1
if not errorlevel 1 goto :llamacpp_ready
set /a RETRIES+=1
if %RETRIES% LSS 20 goto :wait_llamacpp
echo [PERINGATAN] llama-server belum merespons dalam 20 detik, melanjutkan startup server Lyta...
goto :start_server

:llamacpp_ready
echo [3/4] llama-server siap di http://127.0.0.1:%LLAMA_PORT% (model: %LLAMA_MODEL_PATH%).
goto :start_server

:: --- Jalur Ollama ---
:boot_ollama
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
