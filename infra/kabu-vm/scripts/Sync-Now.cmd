@echo off
REM Manual one-shot: probe + sync (+ optional trade)
REM Usage: Sync-Now.cmd           → probe + sync
REM        Sync-Now.cmd trade     → probe + sync + trade
setlocal
set BRIDGE=C:\kabu-bridge
set SETUP=C:\kabu-setup
set LOG=%SETUP%\manual-sync.log
if not exist "%SETUP%" mkdir "%SETUP%"
echo ===== %DATE% %TIME% Sync-Now =====>> "%LOG%"
cd /d "%BRIDGE%"
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm.cmd not found>> "%LOG%"
  echo npm.cmd not found
  exit /b 1
)
call npm.cmd run probe >> "%LOG%" 2>&1
set PROBE_RC=%ERRORLEVEL%
call npm.cmd run sync >> "%LOG%" 2>&1
set SYNC_RC=%ERRORLEVEL%
if /I "%~1"=="trade" (
  call npm.cmd run trade >> "%LOG%" 2>&1
  set TRADE_RC=%ERRORLEVEL%
  echo probe=%PROBE_RC% sync=%SYNC_RC% trade=%TRADE_RC%
  echo probe=%PROBE_RC% sync=%SYNC_RC% trade=%TRADE_RC%>> "%LOG%"
) else (
  echo probe=%PROBE_RC% sync=%SYNC_RC%
  echo probe=%PROBE_RC% sync=%SYNC_RC%>> "%LOG%"
)
exit /b %SYNC_RC%
