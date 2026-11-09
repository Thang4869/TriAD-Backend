
$ErrorActionPreference = 'Stop'

$configPath = Join-Path $env:LOCALAPPDATA 'TriAD-Backup\settings.json'

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Không tìm thấy backup settings."
}

$config = Get-Content -LiteralPath $configPath -Raw |
    ConvertFrom-Json

if (-not $config.ProtectedUrl) {
    throw "Không tìm thấy ProtectedUrl."
}

$renderSecure = ConvertTo-SecureString $config.ProtectedUrl
$neonSecure = Read-Host 'Nhập Neon connection URI (ẩn)' -AsSecureString

function Convert-SecureUriToEnvironment {
    param([securestring]$SecureUri)

    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureUri)

    try {
        $connectionString =
            [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)

        $uri = [System.Uri]$connectionString

        if ($uri.Scheme -notin @('postgres', 'postgresql')) {
            throw 'Connection URI không hợp lệ.'
        }

        $userInfo = $uri.UserInfo.Split(':', 2)

        if ($userInfo.Count -ne 2) {
            throw 'Connection URI thiếu thông tin xác thực.'
        }

        $allowedHost = $uri.Host -eq 'dpg-dbcbq8ff3r2c739hbi3g-a.singapore-postgres.render.com' -or
            $uri.Host -match '^[a-z0-9-]+\.neon\.tech$'
        if (-not $allowedHost) { throw 'Connection URI chứa host không được phép.' }
        if ($uri.AbsolutePath -ne '/triad_staging') { throw 'Connection URI chứa database không được phép.' }
        $user = [Uri]::UnescapeDataString($userInfo[0])
        if ($uri.Host -match '\.neon\.tech$' -and $user -ne 'triad_staging_owner') {
            throw 'Connection URI chứa role Neon không được phép.'
        }
        if ($uri.Host -notmatch '\.neon\.tech$' -and $user -ne 'triad_staging') {
            throw 'Connection URI chứa role Render không được phép.'
        }
        if ($uri.Port -gt 0 -and $uri.Port -ne 5432) { throw 'Connection URI chứa port không được phép.' }

        $env:PGHOST = $uri.Host
        $port = if ($uri.Port -lt 1) { 5432 } else { $uri.Port }
        $env:PGPORT = [string]$port
        $env:PGUSER = $user
        $env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo[1])
        $env:PGDATABASE = [Uri]::UnescapeDataString(
            $uri.AbsolutePath.TrimStart('/')
        )
        $env:PGSSLMODE = 'require'
        $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=120000'

        $query = @{}
        foreach ($item in $uri.Query.TrimStart('?').Split('&')) {
            if (-not $item) { continue }
            $pair = $item.Split('=', 2)
            $query[[Uri]::UnescapeDataString($pair[0])] =
                if ($pair.Count -gt 1) {
                    [Uri]::UnescapeDataString($pair[1])
                } else { '' }
        }

        if (@($query.Keys | Where-Object { $_ -notin @('sslmode', 'channel_binding') }).Count -gt 0) {
            throw 'Connection URI chứa query parameter không được phép.'
        }
        if ($query['sslmode'] -ne 'require') { throw 'Kết nối từ xa bắt buộc sslmode=require.' }
        $env:PGSSLMODE = 'require'
        if ($query.ContainsKey('channel_binding') -and $query['channel_binding'] -notin @('require', 'prefer', 'disable')) {
            throw 'channel_binding không hợp lệ.'
        }
        if ($query.ContainsKey('channel_binding')) {
            $env:PGCHANNELBINDING = $query['channel_binding']
        }
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        $connectionString = $null
    }
}

$auditSql = @'
SELECT format(
    'SELECT %L, count(*), md5(COALESCE(string_agg(to_jsonb(t)::text, E''\n'' ORDER BY to_jsonb(t)::text), '''')) FROM %I.%I AS t;',
    schemaname || '.' || tablename,
    schemaname,
    tablename
)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
\gexec
'@

function Invoke-DatabaseAudit {
    param(
        [string]$Label,
        [securestring]$SecureUri
    )

    Write-Host "`n=== $Label ===" -ForegroundColor Cyan

    Convert-SecureUriToEnvironment -SecureUri $SecureUri

    try {
        $output = @(
            $auditSql | docker run --rm -i `
                --env PGHOST `
                --env PGPORT `
                --env PGUSER `
                --env PGPASSWORD `
                --env PGDATABASE `
                --env PGSSLMODE `
                --env PGOPTIONS `
                --env PGCHANNELBINDING `
                --entrypoint psql `
                postgres:18-alpine `
                -X -v ON_ERROR_STOP=1 -A -t -F '|'
        )

        if ($LASTEXITCODE -ne 0) {
            throw "Truy vấn $Label thất bại."
        }

        return $output
    }
    finally {
        foreach ($name in @(
            'PGHOST', 'PGPORT', 'PGUSER',
            'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE',
            'PGOPTIONS', 'PGCHANNELBINDING'
        )) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        }
    }
}

try {
    $renderRows = Invoke-DatabaseAudit 'RENDER' $renderSecure
    $neonRows = Invoke-DatabaseAudit 'NEON' $neonSecure

    function Convert-AuditRows($Rows) {
        $map = @{}

        foreach ($line in $Rows) {
            $parts = "$line".Trim().Split('|')

            if (
                $parts.Count -eq 3 -and
                $parts[1] -match '^\d+$' -and
                $parts[2] -match '^[a-f0-9]{32}$'
            ) {
                $map[$parts[0]] = "$($parts[1])|$($parts[2])"
            }
        }

        return $map
    }

    $renderMap = Convert-AuditRows $renderRows
    $neonMap = Convert-AuditRows $neonRows

    $allTables = @($renderMap.Keys + $neonMap.Keys) |
        Sort-Object -Unique

    $comparison = foreach ($table in $allTables) {
        $r = $renderMap[$table]
        $n = $neonMap[$table]

        [PSCustomObject]@{
            Table  = $table
            Render = $r
            Neon   = $n
            Result = if ($r -and $n -and $r -eq $n) {
                'MATCH'
            } else {
                'DIFFERENT'
            }
        }
    }

    Write-Host "`n=== DATABASE COMPARISON ===" -ForegroundColor Cyan
    $comparison | Format-Table -AutoSize

    $matched = @($comparison | Where-Object Result -eq 'MATCH').Count
    $different = @($comparison | Where-Object Result -eq 'DIFFERENT').Count

    Write-Host "Render tables: $($renderMap.Count)"
    Write-Host "Neon tables: $($neonMap.Count)"
    Write-Host "Matching: $matched"
    Write-Host "Different: $different"

    if ($renderMap.Count -ne 19 -or $neonMap.Count -ne 19) {
        Write-Warning 'Số bảng không bằng baseline 19. Cần điều tra.'
    }

    if ($different -gt 0) {
        Write-Warning 'Dữ liệu có khác biệt. Chưa được rollback hoặc xóa database cũ.'
        exit 1
    }
}
finally {
    foreach ($name in @(
        'PGHOST', 'PGPORT', 'PGUSER',
        'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE',
        'PGOPTIONS', 'PGCHANNELBINDING'
    )) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }

    $renderSecure = $null
    $neonSecure = $null
    $config = $null
}
