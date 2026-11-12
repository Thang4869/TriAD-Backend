param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Setup', 'SetupNeon', 'Backup', 'BackupNeon', 'Verify', 'InstallTask', 'RemoveTask', 'SetRecurringSchedule', 'Retention', 'InstallRetentionTask', 'RemoveRetentionTask')]
    [string]$Action,
    [string]$Archive,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Use this launcher on Windows under your own account.' }
$stateDirectory = Join-Path $env:LOCALAPPDATA 'TriAD-Backup'
$configPath = Join-Path $stateDirectory 'settings.json'
$scriptPath = $PSCommandPath
$nodeScript = Join-Path $PSScriptRoot 'portfolio-backup.cjs'
$retentionScript = Join-Path $PSScriptRoot 'portfolio-backup-retention.cjs'
$taskName = 'TriAD Portfolio Backup'
$retentionTaskName = 'TriAD Portfolio Backup Retention'
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
if ($Action -eq 'RemoveRetentionTask') {
    Unregister-ScheduledTask -TaskName $retentionTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Retention schedule removed; backup archives and recovery key retained.'
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
if ($Action -eq 'SetRecurringSchedule') {
    $expectedTasks = @(
        @{ Name = $taskName; BackupAction = 'Backup'; Times = @('00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00') },
        @{ Name = 'TriAD Portfolio Backup Neon'; BackupAction = 'BackupNeon'; Times = @('00:20', '03:20', '06:20', '09:20', '12:20', '15:20', '18:20', '21:20') }
    )
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    foreach ($entry in $expectedTasks) {
        $task = Get-ScheduledTask -TaskName $entry.Name -ErrorAction Stop
        if ($task.Principal.LogonType -notin @('Interactive', 'InteractiveToken') -or $task.Principal.RunLevel -ne 'Limited') {
            throw ('Refusing to alter a task without the expected interactive/limited principal: ' + $entry.Name)
        }
        if ($task.Principal.UserId -and $task.Principal.UserId -ne $currentUser) {
            throw ('Refusing to alter a task owned by another Windows account: ' + $entry.Name)
        }
        if (@($task.Actions).Count -ne 1) { throw ('Unexpected task action count: ' + $entry.Name) }
        $taskAction = @($task.Actions)[0]
        if (
            $taskAction.Execute -notmatch '(?i)\\powershell\.exe
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
if ($Action -eq 'InstallRetentionTask') {
    if (Get-ScheduledTask -TaskName $retentionTaskName -ErrorAction SilentlyContinue) {
        throw 'Retention task exists; inspect it instead of overwriting it.'
    }
    if (-not (Get-ChildItem -LiteralPath $config.BackupDirectory -Filter '*.dump.enc.verified.json' -File)) {
        throw 'A successful backup receipt is required before installing retention.'
    }
    $taskAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -File "' + $scriptPath + '" -Action Retention -Apply') -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At '23:50'
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    Register-ScheduledTask -TaskName $retentionTaskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
    Write-Host 'Daily 23:50 LOCAL time retention task installed. It applies only the same-day cleanup rules; run Retention dry-run first.'
    return
}

if ($Action -eq 'Retention') {
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
    $env:PORTFOLIO_BACKUP_KEY_FILE = $config.KeyPath
    $env:PORTFOLIO_BACKUP_DIRECTORY = $config.BackupDirectory
    if ($Apply) {
        & $nodeCommand $retentionScript --apply
    }
    else {
        & $nodeCommand $retentionScript --dry-run
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
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
        $pointer = [IntPtr]::Zero

        try {
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
            $env:PORTFOLIO_BACKUP_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        finally {
            if ($pointer -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            }
            $secret.Dispose()
        }
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
 -or
            $taskAction.Arguments -notlike ('*' + $scriptPath + '*') -or
            $taskAction.Arguments -notmatch ('(?i)-Action\s+' + [regex]::Escape($entry.BackupAction) + '(\s|$)')
        ) {
            throw ('Refusing to alter a task whose action does not match this checkout: ' + $entry.Name)
        }
    }

    foreach ($entry in $expectedTasks) {
        $triggers = @(
            foreach ($time in $entry.Times) {
                $at = [datetime]::ParseExact($time, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
                New-ScheduledTaskTrigger -Daily -At $at
            }
        )
        if ($Apply) {
            Set-ScheduledTask -TaskName $entry.Name -Trigger $triggers -ErrorAction Stop | Out-Null
            Write-Host ('Updated triggers for ' + $entry.Name + '. Existing action, principal and task settings were preserved.')
        }
        else {
            Write-Host ('DRY RUN ' + $entry.Name + ': ' + ($entry.Times -join ', '))
        }
    }
    if (-not $Apply) { Write-Host 'No task was changed. Re-run with -Apply only after reviewing both schedules.' }
    return
}

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
        $pointer = [IntPtr]::Zero

        try {
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
            $env:PORTFOLIO_BACKUP_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        finally {
            if ($pointer -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            }
            $secret.Dispose()
        }
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
