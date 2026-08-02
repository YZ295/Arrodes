@echo off
chcp 65001 >nul
echo 正在打包桌面宠物程序...
echo.

D:\python3.14.3\python.exe -m PyInstaller --noconfirm --onefile --windowed --name "桌宠-愚者" ^
    --add-data "character_no_bg.png;." ^
    desktop_pet.py

echo.
echo 打包完成！
echo 可执行文件位于 dist\桌宠-愚者.exe
pause
