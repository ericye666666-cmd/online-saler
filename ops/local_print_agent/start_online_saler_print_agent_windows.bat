@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0DirectLoopPrintAgent.exe" (
  echo DirectLoopPrintAgent.exe is missing. Extract the complete downloaded ZIP first.
  pause
  exit /b 1
)
"%~dp0DirectLoopPrintAgent.exe"
set "agent_exit_code=%errorlevel%"
pause
exit /b %agent_exit_code%
