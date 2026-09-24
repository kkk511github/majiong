@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

echo [1/4] Installing locked dependencies...
call npm.cmd ci
if errorlevel 1 goto failed

echo [2/4] Building bundled app with .env.native...
call npm.cmd run build:native
if errorlevel 1 goto failed

echo [3/4] Syncing Android assets...
call npx.cmd cap sync android
if errorlevel 1 goto failed
call node.exe scripts/normalize-native-paths.mjs
if errorlevel 1 goto failed

echo [4/4] Building Android debug APK...
call android\gradlew.bat -p android assembleDebug
if errorlevel 1 goto failed

echo.
echo APK: %CD%\android\app\build\outputs\apk\debug\app-debug.apk
popd
exit /b 0

:failed
echo.
echo Build stopped. Check the error above and docs\WINDOWS-ANDROID.md.
popd
exit /b 1
