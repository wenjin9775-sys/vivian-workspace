$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'local-server.js'))
$pidFile = Join-Path $projectRoot 'local-data\server.pid'

try {
    if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
        Write-Host 'No launcher PID file was found. No process was stopped.'
        exit 0
    }
    $pidText = [System.IO.File]::ReadAllText($pidFile).Trim()
    $serverProcessId = 0
    if (-not [int]::TryParse($pidText, [ref]$serverProcessId) -or $serverProcessId -le 0) {
        throw 'The PID file is invalid. No process was stopped.'
    }
    $serverProcess = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + $serverProcessId)
    if (-not $serverProcess) {
        Remove-Item -LiteralPath $pidFile
        Write-Host 'The workbench is already stopped.'
        exit 0
    }
    $pathPattern = '(?i)(?:^|[\s"])' + [regex]::Escape($serverPath) + '(?:$|[\s"])'
    if ($serverProcess.Name -ine 'node.exe' -or [string]::IsNullOrWhiteSpace($serverProcess.CommandLine) -or $serverProcess.CommandLine -notmatch $pathPattern) {
        throw 'The saved PID does not match this workbench server. No process was stopped.'
    }
    Stop-Process -Id $serverProcessId -ErrorAction Stop
    Remove-Item -LiteralPath $pidFile
    Write-Host 'Vivian workbench is stopped. Your saved data is kept in local-data.'
} catch {
    Write-Host ('Cannot stop Vivian workbench: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
