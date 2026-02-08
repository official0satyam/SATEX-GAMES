@echo off
echo.
echo ===========================================
echo   Initializing Git Repository for Archad
echo ===========================================
echo.

:: Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in your PATH.
    echo Please install Git from https://git-scm.com/download/win
    echo and restart your terminal/VS Code.
    pause
    exit /b
)

:: Initialize git
echo 1. Initializing new git repository...
git init

:: Add all files
echo 2. Adding files to staging...
git add .

:: Commit
echo 3. Creating initial commit...
git commit -m "Initial launch of Midnight Arcade"

echo.
echo ===========================================
echo   SUCCESS! Git repository initialized.
echo ===========================================
echo.
echo NEXT STEPS:
echo 1. Create a new repository on GitHub.com
echo 2. Copy the commands shown on GitHub (remote add & push)
echo 3. Paste them here to upload your code.
echo.
pause
