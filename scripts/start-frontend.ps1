# 启动前端开发服务器（http://localhost:5173）
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'frontend')

if (-not (Test-Path 'node_modules')) {
    Write-Host '首次运行，正在安装前端依赖…' -ForegroundColor Cyan
    npm install
}

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
}

npm run dev
