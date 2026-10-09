@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Please create the environment first: py -m venv .venv
  echo Then install: .venv\Scripts\python.exe -m pip install -r requirements-web.txt
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8000 in your browser.
.venv\Scripts\python.exe app.py
pause
