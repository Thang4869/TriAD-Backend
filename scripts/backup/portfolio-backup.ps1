param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Setup', 'SetupNeon', 'Backup', 'BackupNeon', 'Verify', 'InstallTask', 'RemoveTask')]
    [string]$Action,
    [string]$Archive
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Use this launcher on Windows under your own account.' }
$stateDirectory = Join-Path $env:LOCALAPPDATA 'TriAD-Backup'
$configPath = Join-Path $stateDirectory 'settings.json'
$scriptPath = $PSCommandPath
$nodeScript = Join-Path $PSScriptRoot 'portfolio-backup.cjs'
$taskName = 'TriAD Portfolio Backup'
$logDirectory = Join-Path $stateDirectory 'logs'
$executionId = [guid]::NewGuid().ToString()

function Write-BackupLog {
    param([string]$Level, [string]$Stage, [string]$Message)
    try {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        $record = [ordered]@{
            timestamp = [DateTime]::UtcNow.ToString('o')
            executionId = $executionId
            level = $Level
            stage = $Stage
            message = ($Message -replace '(?i)postgres(?:ql)?://[^\s''"`]+', '[REDACTED_DATABASE_URL]' -replace '(?i)(PASSWORD|DATABASE_URL|RECOVERY_KEY)=[^\s]+', '$1=[REDACTED]')
        }
        ($record | ConvertTo-Json -Compress) | Add-Content -LiteralPath (Join-Path $logDirectory 'launcher.log') -Encoding UTF8
    } catch {
        [Console]::Error.WriteLine('Backup launcher log unavailable; see the Node execution log if the process started.')
    }
}

Write-BackupLog 'INFO' 'configuration' 'Backup launcher started.'

if ($Action -eq 'RemoveTask') {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host 'Schedule removed; backups and recovery key retained.'
    return
}
if ($Action -eq 'Setup') {
    if (Test-Path -LiteralPath $configPath) { throw 'Configuration already exists; do not overwrite your recovery key.' }
    Get-Command node, docker -ErrorAction Stop | Out-Null
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $stateDirectory /inheritance:r /grant:r ('*' + $sid + ':(OI)(CI)F') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict backup configuration permissions.' }
    $backupDirectory = Read-Host 'Backup folder outside the repository (example D:\TriAD-Backups)'
    if (-not [IO.Path]::IsPathRooted($backupDirectory)) { throw 'Use an absolute backup directory.' }
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    $keyPath = Join-Path $stateDirectory 'recovery.key'
    if (Test-Path -LiteralPath $keyPath) { throw 'Recovery key already exists; keep it safe and review configuration manually.' }
    $url = Read-Host 'Render External Database URL (hidden input)' -AsSecureString
    # Windows DPAPI: only this Windows user on this machine can decrypt the URL.
    $protectedUrl = ConvertFrom-SecureString -SecureString $url
    & node -e "require('node:fs').writeFileSync(process.argv[1],require('node:crypto').randomBytes(32).toString('hex'),{flag:'wx',mode:384})" $keyPath
    if ($LASTEXITCODE -ne 0) { throw 'Recovery key creation failed.' }
    @{
        ProtectedUrl = $protectedUrl
        KeyPath = $keyPath
        BackupDirectory = [IO.Path]::GetFullPath($backupDirectory)
    } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    Write-Host ('Settings saved. Keep an independent offline copy of: ' + $keyPath)
    Write-Host 'Next: run Backup, confirm PASS, then InstallTask. No schedule has been created yet.'
    return
}
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Run Setup first.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($Action -eq 'SetupNeon') {
    . (Join-Path $PSScriptRoot 'neon-connection.ps1')
    $url = Read-Host 'Neon connection URI (hidden input)' -AsSecureString
    $pointer = [IntPtr]::Zero
    $plainUrl = $null

    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($url)
        $plainUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)

        Test-NeonConnectionUri -ConnectionUri $plainUrl | Out-Null

        $protectedNeonUrl = ConvertFrom-SecureString -SecureString $url
    }
    finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
        $plainUrl = $null
        $url.Dispose()
    }
    $settings = [ordered]@{
        ProtectedUrl = $config.ProtectedUrl
        ProtectedNeonUrl = $protectedNeonUrl
        KeyPath = $config.KeyPath
        BackupDirectory = $config.BackupDirectory
    }
    $settings | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    Write-Host 'Neon settings saved without replacing the Render configuration.'
    return
}
if ($Action -eq 'InstallTask') {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task exists; inspect it instead of overwriting it.' }
    if (-not (Get-ChildItem -LiteralPath $config.BackupDirectory -Filter '*.dump.enc.verified.json' -File)) {
        throw 'Run a successful Backup/Verify before installing the task.'
    }
    # Interactive principal: no account password saved, runs only while logged on.
    $taskAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument ('-NoProfile -File "' + $scriptPath + '" -Action Backup') -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At '20:30'
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
    Write-Host 'Daily 20:30 LOCAL time. Requires logged-in user, running Docker and network access. This is best effort.'
    return
}
$names = @('PORTFOLIO_BACKUP_DATABASE_URL', 'PORTFOLIO_BACKUP_SOURCE', 'PORTFOLIO_BACKUP_KEY_FILE', 'PORTFOLIO_BACKUP_DIRECTORY', 'PORTFOLIO_BACKUP_ARCHIVE', 'PORTFOLIO_BACKUP_FIXTURE', 'PORTFOLIO_BACKUP_NETWORK')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$nodeExitCode = 0
try {
    Write-BackupLog 'INFO' 'configuration' 'Loading backup configuration.'
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
    $env:PORTFOLIO_BACKUP_FIXTURE = $null
    $env:PORTFOLIO_BACKUP_NETWORK = $null
    $env:PORTFOLIO_BACKUP_KEY_FILE = $config.KeyPath
    $env:PORTFOLIO_BACKUP_DIRECTORY = $config.BackupDirectory
    if ($Action -in @('Backup', 'BackupNeon')) {
        $sourceConfig = if ($Action -eq 'BackupNeon') { 'ProtectedNeonUrl' } else { 'ProtectedUrl' }
        if (-not $config.$sourceConfig) { throw ('Run SetupNeon first for ' + $Action + '.') }
        $env:PORTFOLIO_BACKUP_SOURCE = if ($Action -eq 'BackupNeon') { 'neon' } else { 'render' }
        $secret = ConvertTo-SecureString $config.$sourceConfig
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try { $env:PORTFOLIO_BACKUP_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        Write-BackupLog 'INFO' 'execution' 'Starting Node backup process.'
        & $nodeCommand $nodeScript backup
    } else {
        if (-not $Archive) { throw 'Provide -Archive with the full encrypted backup path.' }
        $env:PORTFOLIO_BACKUP_DATABASE_URL = $null
        $env:PORTFOLIO_BACKUP_ARCHIVE = $Archive
        Write-BackupLog 'INFO' 'execution' 'Starting Node verification process.'
        & $nodeCommand $nodeScript verify
    }
    $nodeExitCode = $LASTEXITCODE
    Write-BackupLog $(if ($nodeExitCode -eq 0) { 'INFO' } else { 'ERROR' }) 'execution' ('Node process exited with code ' + $nodeExitCode + '.')
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
if ($nodeExitCode -ne 0) {
    Write-BackupLog 'ERROR' 'cleanup' 'Backup failed; earlier archives and recovery key were retained.'
    exit $nodeExitCode
}
Write-BackupLog 'INFO' 'cleanup' 'Backup launcher completed successfully.'
