param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Setup', 'Backup', 'Verify', 'InstallTask', 'RemoveTask')]
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
if ($Action -eq 'InstallTask') {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task exists; inspect it instead of overwriting it.' }
    if (-not (Get-ChildItem -LiteralPath $config.BackupDirectory -Filter '*.dump.enc.verified.json' -File)) {
        throw 'Run a successful Backup/Verify before installing the task.'
    }
    # Interactive principal: no account password saved, runs only while logged on.
    $taskAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument ('-NoProfile -File "' + $scriptPath + '" -Action Backup')
    $trigger = New-ScheduledTaskTrigger -Daily -At '20:30'
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
    Write-Host 'Daily 20:30 LOCAL time. Requires logged-in user, running Docker and network access. This is best effort.'
    return
}
$names = @('PORTFOLIO_BACKUP_DATABASE_URL', 'PORTFOLIO_BACKUP_KEY_FILE', 'PORTFOLIO_BACKUP_DIRECTORY', 'PORTFOLIO_BACKUP_ARCHIVE', 'PORTFOLIO_BACKUP_FIXTURE', 'PORTFOLIO_BACKUP_NETWORK')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:PORTFOLIO_BACKUP_FIXTURE = $null
    $env:PORTFOLIO_BACKUP_NETWORK = $null
    $env:PORTFOLIO_BACKUP_KEY_FILE = $config.KeyPath
    $env:PORTFOLIO_BACKUP_DIRECTORY = $config.BackupDirectory
    if ($Action -eq 'Backup') {
        $secret = ConvertTo-SecureString $config.ProtectedUrl
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try { $env:PORTFOLIO_BACKUP_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        & node $nodeScript backup
    } else {
        if (-not $Archive) { throw 'Provide -Archive with the full encrypted backup path.' }
        $env:PORTFOLIO_BACKUP_DATABASE_URL = $null
        $env:PORTFOLIO_BACKUP_ARCHIVE = $Archive
        & node $nodeScript verify
    }
    if ($LASTEXITCODE -ne 0) { throw 'Backup/verification failed. Earlier backups were retained.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
