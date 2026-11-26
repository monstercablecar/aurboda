# Installs the ActivityWatch -> Aurboda push agent on Windows and runs it every 5 minutes.
#
#   $env:AURBODA_TOKEN='<TOKEN>'; irm __AURBODA_API_URL__/agents/activitywatch.ps1 | iex
#
# Optional: $env:AURBODA_DEVICE='<name>' names this computer (default: its computer name),
# $env:AURBODA_URL='<api url>' points at another Aurboda server, and
# $env:AURBODA_UNINSTALL='1' removes the agent, its scheduled task and its settings.
#
# Re-running replaces the installed files and keeps one scheduled task. No administrator rights needed.
# Kept to ASCII so Windows PowerShell 5.1 reads it the same whatever the code page.

function Install-AwAurboda {
  $ErrorActionPreference = 'Stop'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $apiUrl = '__AURBODA_API_URL__'
  if ($env:AURBODA_URL) { $apiUrl = $env:AURBODA_URL }
  $apiUrl = $apiUrl.TrimEnd('/')
  $dir = Join-Path $env:LOCALAPPDATA 'aw-aurboda'
  $agentPath = Join-Path $dir 'aw-to-aurboda.ps1'
  $configPath = Join-Path $dir 'config.json'
  $taskName = 'Aurboda ActivityWatch push'

  if ($env:AURBODA_UNINSTALL -eq '1') {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    if (Test-Path $dir) { Remove-Item -Recurse -Force -Path $dir }
    Remove-Item Env:AURBODA_UNINSTALL -ErrorAction SilentlyContinue
    Write-Host 'Removed the ActivityWatch -> Aurboda agent, its scheduled task and its settings.' -ForegroundColor Green
    return
  }

  $token = $env:AURBODA_TOKEN
  if (-not $token) {
    Write-Host "Set your Aurboda API key first: `$env:AURBODA_TOKEN='<TOKEN>'" -ForegroundColor Red
    return
  }
  if ($token -notmatch '^[A-Za-z0-9+/=._:~-]+$') {
    Write-Host 'That does not look like an Aurboda API key.' -ForegroundColor Red
    return
  }
  if ($apiUrl -notmatch '^https?://') {
    Write-Host "Set the Aurboda API URL first: `$env:AURBODA_URL='https://...'" -ForegroundColor Red
    return
  }
  $device = $env:AURBODA_DEVICE
  if (-not $device) { $device = $env:COMPUTERNAME }
  if ($device.Length -gt 100) {
    Write-Host 'The device name can be at most 100 characters.' -ForegroundColor Red
    return
  }

  try {
    Invoke-RestMethod -Uri 'http://localhost:5600/api/0/info' -TimeoutSec 3 | Out-Null
    Write-Host 'ActivityWatch is running.' -ForegroundColor Green
  } catch {
    Write-Host 'ActivityWatch is not answering at http://localhost:5600 yet. Install it from https://activitywatch.net and start it; the agent sends data from the first run after it is up.' -ForegroundColor Yellow
  }

  $agentScript = @'
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:LOCALAPPDATA 'aw-aurboda'
$Config = Get-Content -Raw -Path (Join-Path $Dir 'config.json') | ConvertFrom-Json
$env:AURBODA_URL = $Config.url
$env:AURBODA_TOKEN = $Config.token
$env:AW_STATE_DIR = $Dir
if ($Config.aw_api_key) { $env:AW_API_KEY = $Config.aw_api_key }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw 'Install Python 3.9 or newer with python on PATH, then retry the ActivityWatch agent.'
}
$program = @"
__AW_PYTHON_AGENT__
"@
$program | python -
exit $LASTEXITCODE
'@

  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Set-Content -Path $agentPath -Value $agentScript -Encoding UTF8
  [ordered]@{ url = $apiUrl; token = $token; device_name = $device } | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8
  Write-Host "Installed the agent at $agentPath (settings in $configPath)." -ForegroundColor Green

  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agentPath`""
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Sends ActivityWatch app usage to Aurboda every 5 minutes.' -Force | Out-Null
  Write-Host "Runs every 5 minutes (scheduled task '$taskName')." -ForegroundColor Green

  Write-Host ''
  Write-Host 'Running the agent once:'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Data from '$device' shows up in Aurboda within a few minutes." -ForegroundColor Green
  } else {
    Write-Host 'The first run failed (see above). The scheduled task retries every 5 minutes.' -ForegroundColor Yellow
  }
  Remove-Item Env:AURBODA_TOKEN -ErrorAction SilentlyContinue

  Write-Host ''
  Write-Host "To uninstall: `$env:AURBODA_UNINSTALL='1'; irm $apiUrl/agents/activitywatch.ps1 | iex"
}

Install-AwAurboda
