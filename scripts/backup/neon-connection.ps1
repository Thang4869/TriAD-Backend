function Test-NeonConnectionUri {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionUri
    )

    $uri = $null
    try {
        $uri = [Uri]::new($ConnectionUri)
        if (
            $uri.Scheme -notin @('postgresql', 'postgres') -or
            $uri.Fragment
        ) {
            throw 'Invalid Neon connection URI.'
        }

        if (
            $uri.Host -notmatch
            '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+neon\.tech$'
        ) {
            throw 'Invalid Neon hostname.'
        }

        if ($uri.Port -notin @(-1, 5432)) {
            throw 'Neon must use port 5432.'
        }

        if ($uri.AbsolutePath -ne '/triad_staging') {
            throw 'Invalid Neon database name.'
        }

        $credentials = $uri.UserInfo -split ':', 2
        if ($credentials.Count -ne 2) {
            throw 'Invalid Neon credentials.'
        }

        $username = [Uri]::UnescapeDataString($credentials[0])
        if ($username -ne 'triad_staging_owner') {
            throw 'Invalid Neon username.'
        }

        $password = [Uri]::UnescapeDataString($credentials[1])
        if ([string]::IsNullOrWhiteSpace($password)) {
            throw 'Invalid Neon credentials.'
        }

        $query = @{}
        $queryText = $uri.Query.TrimStart('?')
        if ([string]::IsNullOrEmpty($queryText)) {
            throw 'Neon SSL mode must be require.'
        }

        foreach ($item in $queryText.Split('&')) {
            if ([string]::IsNullOrEmpty($item)) {
                throw 'Invalid Neon query parameter.'
            }

            $parts = $item -split '=', 2
            if ($parts.Count -ne 2 -or [string]::IsNullOrEmpty($parts[0])) {
                throw 'Invalid Neon query parameter.'
            }

            $key = [Uri]::UnescapeDataString($parts[0]).ToLowerInvariant()
            $value = [Uri]::UnescapeDataString($parts[1])
            if ($query.ContainsKey($key)) {
                throw 'Duplicate Neon connection parameter.'
            }
            if ($key -notin @('sslmode', 'channel_binding')) {
                throw 'Unsupported Neon connection parameter.'
            }
            $query[$key] = $value
        }

        if ($query['sslmode'] -ne 'require') {
            throw 'Neon SSL mode must be require.'
        }
        if (
            $query.ContainsKey('channel_binding') -and
            $query['channel_binding'] -notin @('require', 'prefer', 'disable')
        ) {
            throw 'Invalid Neon channel binding mode.'
        }

        return [PSCustomObject]@{
            Scheme         = $uri.Scheme
            Host           = $uri.Host
            Port           = if ($uri.Port -eq -1) { 5432 } else { $uri.Port }
            Database       = 'triad_staging'
            Username       = $username
            SslMode        = $query['sslmode']
            ChannelBinding = $query['channel_binding']
        }
    }
    catch {
        if ($_.Exception.Message -like 'Invalid Neon*' -or
            $_.Exception.Message -like 'Neon*') {
            throw
        }
        throw 'Invalid Neon connection URI.'
    }
    finally {
        $uri = $null
    }
}
