@echo off
setlocal

pushd "%~dp0" || exit /b 1
call npm run dev
set "exit_code=%errorlevel%"
popd

exit /b %exit_code%
