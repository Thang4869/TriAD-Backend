<#
.SYNOPSIS
  Regenerate a single B10 dependency stage using npm (not manual lockfile edits).
.EXAMPLE
  .\scripts\b10-upgrade.ps1 -Stage proxy-addr
  .\scripts\b10-upgrade.ps1 -Stage multer
  .\scripts\b10-upgrade.ps1 -Stage bcrypt
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("proxy-addr", "multer", "bcrypt")]
  [string]$Stage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repositoryRoot

function Invoke-Npm([string[]]$Arguments) {
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  if (-not (Test-Path "package-lock.json")) {
    throw "Cannot regenerate a missing package-lock.json"
  }

  Write-Host "B10 dependency upgrade stage: $Stage"
  switch ($Stage) {
    "proxy-addr" {
      Invoke-Npm @("pkg", "set", "overrides.proxy-addr=2.0.8")
      Invoke-Npm @("install", "--package-lock-only", "--ignore-scripts", "--no-audit")
    }
    "multer" {
      Invoke-Npm @("install", "--save-exact", "--package-lock-only", "--ignore-scripts", "--no-audit", "multer@2.4.0")
      Invoke-Npm @("install", "--save-dev", "--save-exact", "--package-lock-only", "--ignore-scripts", "--no-audit", "@types/multer@2.3.0")
    }
    "bcrypt" {
      Invoke-Npm @("install", "--save-exact", "--package-lock-only", "--ignore-scripts", "--no-audit", "bcrypt@6.0.0")
      Invoke-Npm @("install", "--save-dev", "--save-exact", "--package-lock-only", "--ignore-scripts", "--no-audit", "@types/bcrypt@6.0.0")
    }
  }

  $manifest = Get-Content "package.json" -Raw | ConvertFrom-Json
  $lockfile = Get-Content "package-lock.json" -Raw | ConvertFrom-Json
  if ($Stage -eq "proxy-addr") {
    if ($manifest.overrides.'proxy-addr' -ne "2.0.8" -or $lockfile.packages.'node_modules/proxy-addr'.version -ne "2.0.8") {
      throw "proxy-addr override/lockfile did not resolve 2.0.8"
    }
  }
  elseif ($Stage -eq "multer") {
    if ($lockfile.packages.'node_modules/multer'.version -ne "2.4.0") {
      throw "Multer lockfile did not resolve 2.4.0"
    }
    if ($lockfile.packages.'node_modules/@types/multer'.version -ne "2.3.0") {
      throw "@types/multer lockfile did not resolve 2.3.0"
    }
  }
  else {
    if ($lockfile.packages.'node_modules/bcrypt'.version -ne "6.0.0") {
      throw "bcrypt lockfile did not resolve 6.0.0"
    }
  }

  # Always check that a clean reinstall succeeds from the generated lockfile.
  Invoke-Npm @("ci")
  Invoke-Npm @("run", "typecheck")
  Invoke-Npm @("run", "lint")
  Invoke-Npm @("run", "architecture:check")
  Invoke-Npm @("run", "test:unit")
  Invoke-Npm @("run", "build")

  # npm audit returns exit code 1 when advisories remain; report without
  # treating that exit code alone as a broken npm install.
  & npm audit --omit=dev
  if ($LASTEXITCODE -gt 1) {
    throw "npm audit could not produce a valid report (exit code $LASTEXITCODE)"
  }

  Write-Host "Review changes before committing:"
  git diff --check
  if ($LASTEXITCODE -ne 0) {
    throw "git diff --check failed"
  }
  git status --short
  Write-Host "Commit package.json and package-lock.json together only after review, then run full CI / Docker / FE-BE tests."
}
finally {
  Pop-Location
}
