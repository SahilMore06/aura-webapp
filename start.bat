@echo off
REM Set working directory
cd /d "%~dp0"

echo ==========================================
echo    AURA Air Quality Platform Launcher
echo ==========================================
echo.

REM 1. Prerequisite Check
echo Processing: Checking Node.js...
where node >nul 2>nul
if errorlevel 1 goto NO_NODE

echo Processing: Checking Python...
set PYTHON_CMD=
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 set PYTHON_CMD=python
if "%PYTHON_CMD%"=="" (
    where python3 >nul 2>nul
    if %ERRORLEVEL% EQU 0 set PYTHON_CMD=python3
)

if "%PYTHON_CMD%"=="" (
    echo [WARNING] Python not found. ML Backend will not start.
)

echo ------------------------------------------

REM 2. Frontend Dependencies
echo Processing: Checking Dependencies...
if not exist "frontend\node_modules\" (
    echo [INFO] Installing frontend dependencies...
    cd frontend && call npm install && cd ..
)

REM 3. Launching Services
if not "%PYTHON_CMD%"=="" (
    if exist "backend\predict.py" (
        echo [INFO] Starting ML Backend...
        start "AURA ML Backend" cmd /k "cd backend && %PYTHON_CMD% predict.py"
    )
)

echo [INFO] Starting Frontend...
if exist "frontend" (
    start "AURA Frontend" cmd /k "cd frontend && npm run dev"
) else (
    echo [ERROR] Frontend folder missing!
    pause
    exit /b
)

echo ------------------------------------------
echo All services are starting up.
echo Waiting 5 seconds for initialization...
ping 127.0.0.1 -n 6 > nul

echo [INFO] Opening browser...
start http://localhost:3000

echo.
echo Success: AURA is running.
echo You can close this window now.
echo.

pause
exit /b

:NO_NODE
echo [ERROR] Node.js not found! Please install it from https://nodejs.org
pause
exit /b
