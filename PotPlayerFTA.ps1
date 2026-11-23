[CmdletBinding()]
param(
  [ValidateSet('Set', 'Verify', 'List')]
  [string]$Action = 'Set',
  [string]$PlayerPath = 'D:\soft\player\PotPlayer\PotPlayerMini64.exe',
  [string[]]$Extensions,
  [switch]$SkipLegacy,
  [switch]$SkipSelfCheck
)

$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'SFTA.ps1'
if (-not (Test-Path -LiteralPath $modulePath -PathType Leaf)) {
  throw "SFTA.ps1 was not found beside this script."
}
. $modulePath

function Get-PotPlayerAssociations {
  param([string]$ExecutablePath)

  $capabilityPath = 'Software\Clients\Media\PotPlayerMini64\Capabilities\FileAssociations'
  $capabilityKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($capabilityPath)
  if (-not $capabilityKey) {
    $capabilityKey = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($capabilityPath)
  }
  if (-not $capabilityKey) {
    throw 'PotPlayerMini64 file associations were not registered.'
  }

  try {
    $associations = foreach ($extension in $capabilityKey.GetValueNames()) {
      [pscustomobject]@{
        Extension = $extension.ToLowerInvariant()
        ProgId = [string]$capabilityKey.GetValue($extension)
      }
    }
  }
  finally {
    $capabilityKey.Dispose()
  }

  if ($associations.Count -eq 0) {
    throw 'PotPlayerMini64 has no registered file associations.'
  }

  $registeredPath = (Get-ItemProperty 'Registry::HKEY_CLASSES_ROOT\Applications\PotPlayerMini64.exe\shell\open\command').'(default)'
  if ($registeredPath -and $registeredPath -notmatch [regex]::Escape($ExecutablePath)) {
    Write-Warning "The shortcut path differs from the registered PotPlayer command. Using the registered ProgIDs."
  }
  $associations
}

function Get-RequestedAssociations {
  param([object[]]$Registered)

  if (-not $Extensions) {
    return $Registered
  }

  $requested = @($Extensions | ForEach-Object {
      if ($_ -notmatch '^\.') { ".$_" } else { $_ }
    } | ForEach-Object { $_.ToLowerInvariant() })
  $selected = @($Registered | Where-Object { $_.Extension -in $requested })
  $missing = @($requested | Where-Object { $_ -notin $selected.Extension })
  if ($missing.Count -gt 0) {
    throw "PotPlayer does not advertise these extensions: $($missing -join ', ')"
  }
  $selected
}

function Get-EffectiveExecutable {
  param([string]$Extension)

  $progId = Get-SftaChoiceProgId -KeyPath "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$Extension"
  $command = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command" -ErrorAction SilentlyContinue).'(default)'
  if ($command -match '^\s*"([^"]+\.exe)"') { return $Matches[1] }
  if ($command -match '^\s*([^ ]+\.exe)') { return $Matches[1] }
  return $null
}

$registered = @(Get-PotPlayerAssociations -ExecutablePath $PlayerPath)
$selected = @(Get-RequestedAssociations -Registered $registered)

switch ($Action) {
  'List' {
    $selected | Sort-Object Extension
    break
  }
  'Verify' {
    $rows = foreach ($association in $selected) {
      $extension = ([string]$association.Extension).Trim()
      $currentKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$extension"
      $current = (Get-ItemProperty "$currentKey\UserChoiceLatest\ProgId" -Name ProgId -ErrorAction SilentlyContinue).ProgId
      if (-not $current) {
        $current = (Get-ItemProperty "$currentKey\UserChoice" -Name ProgId -ErrorAction SilentlyContinue).ProgId
      }
      [pscustomobject]@{
        Extension = $extension
        ExpectedProgId = $association.ProgId
        CurrentProgId = $current
        EffectiveExecutable = Get-EffectiveExecutable $association.Extension
        Matches = $current -eq $association.ProgId
      }
    }
    $rows | Format-Table -AutoSize
    if (@($rows | Where-Object { -not $_.Matches }).Count -gt 0) { exit 2 }
    break
  }
  'Set' {
    foreach ($association in $selected) {
      Set-FTA -ProgId $association.ProgId -Extension $association.Extension `
        -SkipLegacy:$SkipLegacy -SkipSelfCheck:$SkipSelfCheck
    }
    & $PSCommandPath -Action Verify -PlayerPath $PlayerPath -Extensions $selected.Extension
  }
}
