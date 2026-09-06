@echo off
rem 本地预览器：双击后自动启动本地服务并打开浏览器
rem （H5 构建产物必须经 http 访问，浏览器禁止 file:// 页面加载 ES module 脚本，双击 index.html 会白屏）
cd /d %~dp0
start "快乐学单词-本地预览服务" cmd /c "node tools\serve.mjs 4173"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173/"
echo 本地预览已启动：http://127.0.0.1:4173/
echo 关闭弹出的服务窗口即可停止。
