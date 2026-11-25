$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
. (Join-Path $repo 'SFTA.ps1')

$token = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$directory = Join-Path ([IO.Path]::GetTempPath()) "fta-tests-$token"
$extensions = ".fta-test-$token-a", ".fta-test-$token-b", ".fta-test-$token-c"
$progIds = "FTA.Test.$token.A", "FTA.Test.$token.B", "FTA.Test.$token.C"
$classes = 'HKEY_CURRENT_USER\Software\Classes'
$worker = Join-Path $repo 'desktop\AssociationWorker.ps1'

function Invoke-Worker($Request) {
    $json = $Request | ConvertTo-Json -Depth 8 -Compress
    $output = $json | powershell.exe -NoProfile -NonInteractive -STA -File $worker
    if ($LASTEXITCODE -ne 0) { throw $output }
    return ($output | ConvertFrom-Json)
}

function Assert-Equal($Actual, $Expected, [string]$Label) {
    if ($Actual -ne $Expected) { throw "$Label expected [$Expected], got [$Actual]" }
}

function Set-TestChoice($Extension, $ProgId) {
    Set-FTA -ProgId $ProgId -Extension $Extension | Out-Null
    $current = Invoke-Worker @{ action = 'state'; extension = $Extension }
    Assert-Equal $current.progId $ProgId 'Windows test default'
}

if (Test-Path -LiteralPath $directory) { throw 'Test directory already exists.' }
[void][IO.Directory]::CreateDirectory($directory)
try {
    $paths = @(
        (Join-Path $directory 'player-a.exe')
        (Join-Path $directory 'player-b.exe')
        (Join-Path $directory 'player-c.exe')
    )
    for ($index = 0; $index -lt $progIds.Count; $index++) {
        Copy-Item -LiteralPath (Join-Path $env:WINDIR 'System32\notepad.exe') -Destination $paths[$index]
        [Microsoft.Win32.Registry]::SetValue("$classes\$($progIds[$index])\shell\open\command", '', ('"{0}" "%1"' -f $paths[$index]))
        foreach ($ext in $extensions) {
            [Microsoft.Win32.Registry]::SetValue("$classes\$ext\OpenWithProgids", $progIds[$index], [byte[]]@(), [Microsoft.Win32.RegistryValueKind]::None)
        }
    }
    foreach ($ext in $extensions) { Set-TestChoice $ext $progIds[0] }

    $catalog = Invoke-Worker @{ action = 'catalog' }
    $target = $catalog.apps | Where-Object executable -EQ $paths[1] | Select-Object -First 1
    if (-not $target) { throw 'Test executable was not discovered.' }

    $journalPath = Join-Path $directory 'apply-test.jsonl'
    $transition = Invoke-Worker @{ action = 'apply'; appId = $target.id; extensions = @($extensions[0]); journalPath = $journalPath }
    $events = @(Get-Content -LiteralPath $journalPath | ForEach-Object { ConvertFrom-Json $_ })
    Assert-Equal $events.Count 2 'Journal event count'
    Assert-Equal $events[0].kind 'start' 'Journal intent'
    Assert-Equal $events[0].desired $progIds[1] 'Journal intended default'
    Assert-Equal $events[1].kind 'finish' 'Journal completion'
    Assert-Equal $events[1].id $events[0].id 'Journal attempt identity'
    Assert-Equal $events[1].result.after.progId $progIds[1] 'Journal Windows result'
    Assert-Equal $transition.results[0].before.progId $progIds[0] 'Original application'
    Assert-Equal $transition.results[0].after.progId $progIds[1] 'New application'
    Set-TestChoice $extensions[0] $progIds[2]
    $rollback = @{ action = 'rollback'; extension = $extensions[0]; expected = $progIds[1]; progId = $transition.results[0].before.progId }
    $stale = Invoke-Worker $rollback
    Assert-Equal $stale.status 'stale' 'External modification'
    Assert-Equal $stale.current.progId $progIds[2] 'Latest default'
    $rollback.expected = $stale.current.progId
    $restored = Invoke-Worker $rollback
    Assert-Equal $restored.status 'changed' 'Rollback result'
    Assert-Equal $restored.after.progId $progIds[0] 'Older history entry restores A from C'
    Write-Host 'Passed live A to B to C, stale confirmation, C to A rollback, and journal writes.'

    $expected = @{}
    $expected[$extensions[1]] = $progIds[0]
    $expected[$extensions[2]] = $progIds[2]
    $restore = @{ action = 'restore'; groups = @(@{ appId = $target.id; extensions = $extensions[1..2]; expected = $expected }) }
    $batch = (Invoke-Worker $restore).results
    Assert-Equal $batch[0].status 'changed' 'First batch item'
    Assert-Equal $batch[1].status 'failed' 'Second batch item'
    Assert-Equal $batch[1].reason 'stale' 'Second batch item reason'
    $restore.groups[0].extensions = @($extensions[2])
    $restore.groups[0].expected[$extensions[2]] = $progIds[0]
    $retry = (Invoke-Worker $restore).results
    Assert-Equal $retry.Count 1 'Retry size'
    Assert-Equal $retry[0].extension $extensions[2] 'Retry selected extension'
    Assert-Equal $retry[0].status 'changed' 'Retry result'
    $completed = Invoke-Worker @{ action = 'state'; extension = $extensions[1] }
    Assert-Equal $completed.progId $progIds[1] 'Completed format after retry'
    Write-Host 'Passed partial failure and retry of the failed item only.'

    Remove-Item -LiteralPath "HKCU:\Software\Classes\$($progIds[0])" -Recurse
    Update-RegistryChanges
    $missing = Invoke-Worker @{ action = 'rollback'; extension = $extensions[1]; expected = $progIds[1]; progId = $progIds[0] }
    Assert-Equal $missing.reason 'missing' 'Uninstalled original application'
    $current = Invoke-Worker @{ action = 'state'; extension = $extensions[1] }
    Assert-Equal $current.progId $progIds[1] 'Windows default after unavailable rollback'
    Write-Host 'Passed rollback with the original application missing.'
} finally {
    foreach ($ext in $extensions) {
        foreach ($leaf in 'UserChoiceLatest\ProgId', 'UserChoiceLatest', 'UserChoice') {
            [SftaNative]::DeleteKey("$script:FileExtsRoot\$ext\$leaf")
        }
        foreach ($key in "HKCU:\Software\Classes\$ext", "HKCU:\$script:FileExtsRoot\$ext") {
            if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse }
        }
    }
    foreach ($progId in $progIds) {
        $key = "HKCU:\Software\Classes\$progId"
        if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Recurse }
    }
    foreach ($path in $paths) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
    }
    if ($journalPath -and (Test-Path -LiteralPath $journalPath)) { Remove-Item -LiteralPath $journalPath }
    Remove-Item -LiteralPath $directory
    Update-RegistryChanges
}
