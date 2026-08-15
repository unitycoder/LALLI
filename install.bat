@echo off
setlocal

cd /d "%~dp0backend"

echo Checking Python...
where py >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON=py -3"
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo Python 3.10 or newer is required. Install it from https://www.python.org/downloads/windows/
        exit /b 1
    )
    set "PYTHON=python"
)

if not exist "venv\Scripts\python.exe" (
    echo Creating virtual environment...
    %PYTHON% -m venv venv
    if errorlevel 1 (
        echo Failed to create the virtual environment.
        exit /b 1
    )
)

set "VENV_PYTHON=%~dp0backend\venv\Scripts\python.exe"

echo Updating pip...
"%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 (
    echo Failed to update pip.
    exit /b 1
)

echo Installing Python dependencies...
"%VENV_PYTHON%" -m pip install -r requirements.txt
if errorlevel 1 (
    echo Failed to install Python dependencies.
    exit /b 1
)

echo Downloading the default Piper voice...
"%VENV_PYTHON%" -m piper.download_voices en_US-lessac-medium --data-dir .\voices
if errorlevel 1 (
    echo Failed to download the Piper voice. You can retry this command later:
    echo "%VENV_PYTHON%" -m piper.download_voices en_US-lessac-medium --data-dir .\voices
    exit /b 1
)

echo.
echo Installation complete.
echo Start the app with backend\runserver.bat, then open http://localhost:8000
endlocal
exit /b 0
