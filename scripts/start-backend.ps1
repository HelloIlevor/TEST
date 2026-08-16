# 启动后端开发服务器（http://127.0.0.1:8000）
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'backend')

if (-not (Test-Path '.venv')) {
    Write-Host '首次运行，正在创建虚拟环境并安装依赖…' -ForegroundColor Cyan
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host '已从 .env.example 生成 .env（Phase 1、2 走 Mock，无需填 API Key）' -ForegroundColor Yellow
}

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
