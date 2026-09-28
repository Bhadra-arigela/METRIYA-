@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo        METRIYA - ORGANIZE PROJECT
echo ============================================
echo.

echo Creating folders...
if not exist "data" mkdir "data"
if not exist "data\ml_data" mkdir "data\ml_data"
if not exist "tests" mkdir "tests"
if not exist "ml" mkdir "ml"
if not exist "docs" mkdir "docs"
if not exist "scripts" mkdir "scripts"
if not exist "assets" mkdir "assets"

echo.
echo Moving ML dataset...
if exist "ml_data\field_training.csv" move /Y "ml_data\field_training.csv" "data\ml_data\" >nul

echo Moving test files...
for %%F in ("test_consensus.py" "test_multi_ocr.py" "test_ocr_engines.py") do if exist "%%~F" move /Y "%%~F" "tests\" >nul

echo Moving ML evaluation/training files...
for %%F in ("train_ml_model.py" "evaluate_ml_model.py" "evaluate_real_package.py") do if exist "%%~F" move /Y "%%~F" "ml\" >nul

echo Moving documentation...
for %%F in ("README_ML_IMPLEMENTATION.md" "README_ONE_CLICK.txt") do if exist "%%~F" move /Y "%%~F" "docs\" >nul

echo Moving startup scripts...
for %%F in ("Start_METRIYA.bat" "Start_METRIYA.vbs") do if exist "%%~F" move /Y "%%~F" "scripts\" >nul

echo Moving test image...
if exist "test.png" move /Y "test.png" "assets\" >nul

echo Moving real package CSV...
if exist "real_package_test.csv" move /Y "real_package_test.csv" "data\" >nul

echo.
echo ============================================
echo Organization complete!
echo ============================================
echo.
echo IMPORTANT: Main application files were NOT moved.
echo main.py
echo app_METRIYA.js
echo index_METRIYA.html
echo ml_field_extractor.py
echo requirements_ML.txt
echo.
pause
endlocal
