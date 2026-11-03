param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectRoot 'local-server.js'
$dataDirectory = Join-Path $projectRoot 'local-data'
$pidFile = Join-Path $dataDirectory 'server.pid'
$baseUrl = 'http://127.0.0.1:8777'

function Test-WorkbenchHealth {
    try {
        $response = Invoke-RestMethod -Uri ($baseUrl + '/api/local/health') -TimeoutSec 1 -UseBasicParsing
        return ($response.app -eq 'vivian-local' -and $response.workspace -eq $projectRoot -and $response.dataDirectory -eq $dataDirectory)
    } catch {
        return $false
    }
}

function Test-LocalPort {
    $connection = New-Object System.Net.Sockets.TcpClient
    try {
        $pending = $connection.BeginConnect('127.0.0.1', 8777, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(500)) { return $false }
        $connection.EndConnect($pending)
        return $true
    } catch {
        return $false
    } finally {
        $connection.Close()
    }
}

try {
    if (Test-WorkbenchHealth) {
        if (-not $NoBrowser) { Start-Process -FilePath $baseUrl }
        Write-Host 'Vivian workbench is already running.'
        exit 0
    }
    if (Test-LocalPort) {
        throw 'Port 8777 is occupied by another service. Close that service, then try again. No existing process was stopped.'
    }
    if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
        throw 'local-server.js is missing. Keep the complete workbench folder together.'
    }
    $nodeCommand = Get-Command -Name 'node.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $nodeCommand) {
        throw 'Node.js was not found. Install Node.js 18 or newer, then reopen this launcher.'
    }
    [System.IO.Directory]::CreateDirectory($dataDirectory) | Out-Null
    $env:PORT = '8777'
    $env:VIVIAN_DATA_DIR = $dataDirectory
    $serverProcess = Start-Process -FilePath $nodeCommand.Source `
        -ArgumentList ('"{0}"' -f $serverPath) `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $dataDirectory 'server.out.log') `
        -RedirectStandardError (Join-Path $dataDirectory 'server.err.log') `
        -PassThru
    [System.IO.File]::WriteAllText($pidFile, [string]$serverProcess.Id, [System.Text.Encoding]::ASCII)

    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 10) {
        if (Test-WorkbenchHealth) {
            if (-not $NoBrowser) { Start-Process -FilePath $baseUrl }
            Write-Host 'Vivian workbench is ready.'
            exit 0
        }
        $serverProcess.Refresh()
        if ($serverProcess.HasExited) {
            throw 'The workbench could not start. Check local-data/server.err.log. Port 8777 may have been taken by another service.'
        }
        Start-Sleep -Milliseconds 200
    }
    throw 'The workbench did not become ready within 10 seconds. Check local-data/server.err.log, then try again. The browser was not opened.'
} catch {
    Write-Host ('Cannot open Vivian workbench: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
