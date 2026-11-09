$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot '..\..\scripts\backup\neon-connection.ps1'
. $validator

$validUri = 'postgresql://triad_staging_owner:test-only-secret@ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech/triad_staging?sslmode=require&channel_binding=require'

function Assert-Pass {
    param([string]$Name, [scriptblock]$Action)
    try {
        & $Action
        Write-Output "PASS: $Name"
    }
    catch {
        throw "FAIL: $Name - $($_.Exception.Message)"
    }
}

function Assert-Rejects {
    param([string]$Name, [string]$Uri)
    try {
        Test-NeonConnectionUri -ConnectionUri $Uri | Out-Null
        throw "FAIL: $Name - URI was accepted"
    }
    catch {
        if ($_.Exception.Message -like 'FAIL:*') { throw }
        if ($_.Exception.Message -match 'test-only-secret') {
            throw "FAIL: $Name - password leaked in exception"
        }
        Write-Output "PASS: $Name"
    }
}

Assert-Pass 'valid Neon URI' {
    $result = Test-NeonConnectionUri -ConnectionUri $validUri
    if ($result.Host -ne 'ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech' -or
        $result.Port -ne 5432 -or
        $result.Database -ne 'triad_staging' -or
        $result.Username -ne 'triad_staging_owner' -or
        $result.SslMode -ne 'require') {
        throw 'Unexpected validated connection metadata.'
    }
}
Assert-Rejects 'spoofed hostname' ($validUri -replace
    'ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech',
    'neon.tech.evil.com')
Assert-Rejects 'sslmode disable' ($validUri -replace 'sslmode=require', 'sslmode=disable')
Assert-Rejects 'wrong database' ($validUri -replace '/triad_staging?', '/other?')
Assert-Rejects 'wrong username' ($validUri -replace 'triad_staging_owner', 'triad_staging')
Assert-Rejects 'wrong port' ($validUri -replace '/triad_staging?', ':5433/triad_staging?')
Assert-Rejects 'missing password' ($validUri -replace 'triad_staging_owner:test-only-secret@', 'triad_staging_owner@')
Assert-Rejects 'blank encoded password' ($validUri -replace 'test-only-secret', '%20')
Assert-Rejects 'unsupported query parameter' ($validUri + '&options=unsafe')
Assert-Rejects 'duplicate query parameter' ($validUri + '&sslmode=require')
Assert-Rejects 'Render hostname in Neon validator' ($validUri -replace
    'ep-calm-band-aoiy16yn.c-2.ap-southeast-1.aws.neon.tech',
    'dpg-dbcbq8ff3r2c739hbi3g-a.singapore-postgres.render.com')
