# Download parcels.pmtiles from the latest successful "Build PMTiles" workflow run.
# Requires: gh CLI, authenticated for prohousingpgh/assessments_dataviz

param(
    [string]$Repo = "prohousingpgh/assessments_dataviz",
    [string]$Dest = "data/parcels.pmtiles"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$destPath = Join-Path $root $Dest

$runId = gh run list --repo $Repo --workflow build-pmtiles.yml --limit 1 --json databaseId,conclusion,status `
    --jq '.[] | select(.conclusion=="success") | .databaseId' 2>$null | Select-Object -First 1

if (-not $runId) {
    Write-Error "No successful Build PMTiles run found. Push .github/workflows/build-pmtiles.yml and run: gh workflow run build-pmtiles.yml --repo $Repo"
}

$tmp = Join-Path $env:TEMP "parcels-pmtiles-$runId"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null

Write-Host "Downloading artifact from run $runId..."
gh run download $runId --repo $Repo --name parcels-pmtiles --dir $tmp

$artifact = Get-ChildItem -Path $tmp -Recurse -Filter "parcels.pmtiles" | Select-Object -First 1
if (-not $artifact) {
    Write-Error "Artifact did not contain parcels.pmtiles"
}

New-Item -ItemType Directory -Force -Path (Split-Path $destPath) | Out-Null
Copy-Item -Force $artifact.FullName $destPath
$mb = [math]::Round((Get-Item $destPath).Length / 1MB, 1)
Write-Host "Installed $destPath ($mb MB)"
