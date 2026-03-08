@echo off
cd /d %~dp0

echo [U-Stock Runner] Installing deps...
python -m pip install -r requirements.txt

echo [U-Stock Runner] Starting runner...
python main.py

pause
