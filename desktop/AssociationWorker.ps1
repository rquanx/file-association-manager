
#requires -Version 5.1
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class DefaultAssociation {
    [StructLayout(LayoutKind.Sequential)]
    struct Size { public int Width; public int Height; }

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory {
        [PreserveSig] int GetImage(Size size, uint flags, out IntPtr bitmap);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHCreateItemFromParsingName(string name, IntPtr context, ref Guid iid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr bitmap);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    static extern int RegDeleteKeyW(IntPtr key, string subKey);

    public static int DeleteUserKey(string subKey) {
        return RegDeleteKeyW(new IntPtr(unchecked((int)0x80000001)), subKey);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern uint ExtractIconEx(string file, int index, out IntPtr large, IntPtr small, uint count);

    [DllImport("user32.dll")]
    static extern bool DestroyIcon(IntPtr icon);

    public static string ExecutableIcon(string file) {
        IntPtr handle;
        if (ExtractIconEx(file, 0, out handle, IntPtr.Zero, 1) != 1 || handle == IntPtr.Zero) return null;
        try {
            using (var icon = System.Drawing.Icon.FromHandle(handle))
            using (var image = icon.ToBitmap()) {
                return EncodeImage(image);
            }
        } finally {
            DestroyIcon(handle);
        }
    }

    static string EncodeImage(System.Drawing.Image image) {
        using (var stream = new System.IO.MemoryStream()) {
            image.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
        }
    }

    public static string Icon(string appId) {
        Guid iid = typeof(IShellItemImageFactory).GUID;
        IShellItemImageFactory item;
        if (SHCreateItemFromParsingName(@"shell:AppsFolder\" + appId, IntPtr.Zero, ref iid, out item) != 0) return null;
        IntPtr bitmap = IntPtr.Zero;
        try {
            if (item.GetImage(new Size { Width = 48, Height = 48 }, 0, out bitmap) != 0 || bitmap == IntPtr.Zero) return null;
            using (var image = System.Drawing.Image.FromHbitmap(bitmap)) {
                return EncodeImage(image);
            }
        } finally {
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            Marshal.ReleaseComObject(item);
        }
    }

    [ComImport, Guid("4e530b0a-e611-4c77-a3ac-9031d022281b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IApplicationAssociationRegistration {
        [PreserveSig] int QueryCurrentDefault(
            [MarshalAs(UnmanagedType.LPWStr)] string association,
            int type, int level, [MarshalAs(UnmanagedType.LPWStr)] out string result);
    }

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    static extern uint AssocQueryString(uint flags, uint kind, string association, string extra,
        StringBuilder output, ref uint length);

    static IApplicationAssociationRegistration registration;

    public static string Effective(string extension) {
        if (registration == null) {
            Type type = Type.GetTypeFromCLSID(new Guid("591209c7-767b-42b2-9fba-44ee4615f2c7"));
            registration = (IApplicationAssociationRegistration)Activator.CreateInstance(type);
        }
        string result;
        return registration.QueryCurrentDefault(extension, 0, 1, out result) == 0 &&
            !String.Equals(result, "Unknown", StringComparison.OrdinalIgnoreCase) ? result : null;
    }

    public static string Describe(string progId, uint kind) {
        var output = new StringBuilder(4096);
        uint length = (uint)output.Capacity;
        return AssocQueryString(0x800, kind, progId, null, output, ref length) == 0
            ? output.ToString() : null;
    }
}
'@ -ReferencedAssemblies System.Drawing

$classes = [Microsoft.Win32.Registry]::ClassesRoot
$extensionPattern = '^\.[a-zA-Z0-9][a-zA-Z0-9_+-]{0,31}$'
$apps = @{}
$types = @{}
$owners = @{}
$descriptions = @{}

function Get-RegistryValues {
    param($Root, [string]$Path)
    $key = $Root.OpenSubKey($Path)
    if (-not $key) { return }
    try {
        foreach ($name in $key.GetValueNames()) {
            [pscustomobject]@{ Name = $name; Value = $key.GetValue($name) }
        }
    } finally { $key.Dispose() }
}

function Get-HandlerDescription {
    param([string]$Id)
    if (-not $descriptions.ContainsKey($Id)) {
        $friendly = [DefaultAssociation]::Describe($Id, 4)
        $exe = [DefaultAssociation]::Describe($Id, 2)
        $appId = [DefaultAssociation]::Describe($Id, 21)
        $idForGrouping = if ($appId) { $appId } elseif ($exe) { $exe } else { $Id }
        $descriptions[$Id] = @{
            Name = if ($friendly) { $friendly } elseif ($exe) { [IO.Path]::GetFileNameWithoutExtension($exe) } else { $Id }
            Type = if ($exe) { 'desktop' } elseif ($appId) { 'packaged' } else { 'handler' }
            Group = $idForGrouping.ToLowerInvariant()
            Executable = $exe
            AppUserModelId = $appId
        }
    }
    return $descriptions[$Id]
}

function Add-Handler {
    param([string]$Extension, [string]$ProgId, [string]$RegisteredName)
    if ($Extension -notmatch $extensionPattern -or [string]::IsNullOrWhiteSpace($ProgId)) { return }
    $Extension = $Extension.ToLowerInvariant()
    $description = Get-HandlerDescription $ProgId
    $id = $description.Group
    if (-not $apps.ContainsKey($id)) {
        $apps[$id] = @{
            id = $id
            name = if ($RegisteredName -and $description.Name -eq $ProgId) { $RegisteredName } else { $description.Name }
            detail = $description.Type
            handlers = @{}
            executable = $description.Executable
            appUserModelId = $description.AppUserModelId
        }
    }
    if (-not $apps[$id].handlers.ContainsKey($Extension)) {
        $apps[$id].handlers[$Extension] = $ProgId
    }
    $owners[$ProgId] = $id
    $types[$Extension] = $true
}

function Get-Catalog {
    foreach ($location in @(
        @{ Root = [Microsoft.Win32.Registry]::CurrentUser; Path = 'Software\RegisteredApplications' },
        @{ Root = [Microsoft.Win32.Registry]::LocalMachine; Path = 'Software\RegisteredApplications' },
        @{ Root = [Microsoft.Win32.Registry]::LocalMachine; Path = 'Software\WOW6432Node\RegisteredApplications' }
    )) {
        foreach ($app in Get-RegistryValues $location.Root $location.Path) {
            if ($app.Value -isnot [string] -or -not $app.Value) { continue }
            foreach ($mapping in Get-RegistryValues $location.Root "$($app.Value)\FileAssociations") {
                Add-Handler $mapping.Name $mapping.Value $app.Name
            }
        }
    }

    $user = [Microsoft.Win32.Registry]::CurrentUser
    $userRoot = 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts'
    $extensions = @($classes.GetSubKeyNames())
    $userExtensions = $user.OpenSubKey($userRoot)
    if ($userExtensions) {
        try { $extensions += $userExtensions.GetSubKeyNames() } finally { $userExtensions.Dispose() }
    }

    $rows = foreach ($ext in ($extensions + @($types.Keys) | Where-Object { $_ -match $extensionPattern } | Sort-Object -Unique)) {
        $ext = $ext.ToLowerInvariant()
        foreach ($source in @(
            @{ Root = $classes; Path = "$ext\OpenWithProgids" },
            @{ Root = $user; Path = "$userRoot\$ext\OpenWithProgids" }
        )) {
            foreach ($candidate in Get-RegistryValues $source.Root $source.Path) {
                if (-not $candidate.Name) { continue }
                $description = Get-HandlerDescription $candidate.Name
                if ($description.Name -ne $candidate.Name -or $description.Executable) {
                    Add-Handler $ext $candidate.Name
                }
            }
        }

        $effective = [DefaultAssociation]::Effective($ext)
        if ($effective) { Add-Handler $ext $effective }
        if ($types.ContainsKey($ext)) {
            [pscustomobject]@{
                extension = $ext
                currentProgId = $effective
                currentAppId = if ($effective) { $owners[$effective] } else { $null }
            }
        }
    }
    return @{ apps = @($apps.Values | Sort-Object name); types = @($rows) }
}

function Get-AssociationState {
    param([string]$Extension)
    $progId = [DefaultAssociation]::Effective($Extension)
    if (-not $progId) { return @{ progId = $null; name = $null } }
    $description = Get-HandlerDescription $progId
    return @{ progId = $progId; name = $description.Name }
}

function Write-AssociationEvent {
    param($Event)
    if (-not $script:associationLog) { return }
    $line = (ConvertTo-Json -InputObject $Event -Depth 8 -Compress) + [Environment]::NewLine
    $bytes = [Text.Encoding]::UTF8.GetBytes($line)
    $script:associationLog.Write($bytes, 0, $bytes.Length)
    $script:associationLog.Flush($true)
}

function Start-AssociationAttempt {
    param($Extension, $Before, $Desired)
    $id = [Guid]::NewGuid().ToString()
    Write-AssociationEvent @{ kind = 'start'; id = $id; extension = $Extension; before = $Before;
        desired = $Desired; time = [DateTime]::UtcNow.ToString('o') }
    return $id
}

function Complete-AssociationAttempt {
    param($Attempt, $Result)
    if ($Attempt) {
        try { Write-AssociationEvent @{ kind = 'finish'; id = $Attempt; result = $Result } }
        catch { $Result.journalError = $true }
    }
    return $Result
}

function Get-AssociationError {
    param($Failure)
    $message = $Failure.Exception.Message
    if ($message -match 'Disable-Ucpd|UCPD|[Aa]ccess.*denied|[Aa]ccess.*is denied') {
        return @{ reason = 'windows'; message = 'Windows blocked the change.' }
    }
    return @{ reason = 'other'; message = $message }
}

function New-AssociationResult {
    param([string]$Extension, [string]$Status, $Before, $After, $Failure)
    $row = @{ extension = $Extension; status = $Status; before = $Before; after = $After }
    if ($Failure) {
        $errorDetails = Get-AssociationError $Failure
        $row.reason = $errorDetails.reason
        $row.message = $errorDetails.message
    }
    if ($Before -and $After -and $Before.progId -ne $After.progId) {
        $row.time = [DateTime]::UtcNow.ToString('o')
    }
    return $row
}

function Restore-AssociationRecord {
    param($Request)
    $ext = [string]$Request.extension
    if ($ext -notmatch $extensionPattern) { throw 'Invalid extension.' }
    $before = Get-AssociationState $ext
    if ([string]$before.progId -ne [string]$Request.expected) {
        return @{ status = 'stale'; current = $before }
    }
    $desired = [string]$Request.progId
    if ([string]$before.progId -eq $desired) {
        return (New-AssociationResult $ext 'unchanged' $before $before)
    }
    if ($desired -and -not ([DefaultAssociation]::Describe($desired, 2) -or [DefaultAssociation]::Describe($desired, 21) -or [DefaultAssociation]::Describe($desired, 1))) {
        return @{ extension = $ext; status = 'failed'; reason = 'missing' }
    }
    $attempt = $null
    try {
        $attempt = Start-AssociationAttempt $ext $before $desired
        if ($desired) {
            Set-FTA -ProgId $desired -Extension $ext -SkipSelfCheck -WarningAction SilentlyContinue | Out-Null
        } else {
            foreach ($leaf in 'UserChoiceLatest\ProgId', 'UserChoiceLatest', 'UserChoice') {
                $code = [DefaultAssociation]::DeleteUserKey("$script:FileExtsRoot\$ext\$leaf")
                if ($code -notin 0, 2) { throw "Access denied while clearing the Windows default ($code)." }
            }
            Update-RegistryChanges
        }
        $after = Get-AssociationState $ext
        if ([string]$after.progId -ne $desired) {
            if ($before.progId -and $after.progId -ne $before.progId) {
                Set-FTA -ProgId $before.progId -Extension $ext -SkipSelfCheck -WarningAction SilentlyContinue | Out-Null
            }
            $result = New-AssociationResult $ext 'failed' $before (Get-AssociationState $ext)
            $result.reason = 'fallback'
            return (Complete-AssociationAttempt $attempt $result)
        }
        return (Complete-AssociationAttempt $attempt (New-AssociationResult $ext 'changed' $before $after))
    } catch {
        return (Complete-AssociationAttempt $attempt (New-AssociationResult $ext 'failed' $before (Get-AssociationState $ext) $_))
    }
}

function Set-Associations {
    param($Request)

    $app = $apps[[string]$Request.appId]
    $executable = [string]$Request.executable
    if ($executable) {
        $file = Get-Item -LiteralPath $executable
        if ($file.PSIsContainer -or $file.Extension -ne '.exe') { throw 'Choose a Windows .exe file.' }
        $executable = $file.FullName
        $sha = [Security.Cryptography.SHA256]::Create()
        try {
            $digest = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($executable.ToLowerInvariant()))).Replace('-', '')
        } finally { $sha.Dispose() }
        $portableProgId = "FileAssociationManager.App.$digest"
    } elseif (-not $app) { throw 'The selected app is no longer registered.' }
    $requested = @($Request.extensions | Sort-Object -Unique)
    if (-not $requested.Count -or $requested.Count -gt 2048) { throw 'Invalid extension count.' }
    foreach ($ext in $requested) {
        if ($ext -notmatch $extensionPattern -or (-not $executable -and -not $app.handlers.ContainsKey($ext))) {
            throw "The selected app has no registered handler for $ext."
        }
    }

    $expected = @{}
    foreach ($property in $Request.expected.PSObject.Properties) { $expected[$property.Name] = $property.Value }
    $results = foreach ($ext in $requested) {
        $progId = if ($executable) { $portableProgId } else { $app.handlers[$ext] }
        $before = Get-AssociationState $ext
        $attempt = $null
        try {
            if ($before.progId -and ($before.progId -eq $progId -or ($app -and $owners[$before.progId] -eq $app.id))) {
                [pscustomobject]@{ extension = $ext; status = 'unchanged' }
                continue
            }
            if ($expected.ContainsKey($ext) -and [string]$before.progId -ne [string]$expected[$ext]) {
                @{ extension = $ext; status = 'failed'; reason = 'stale'; before = $before; message = 'The default app changed after the import preview.' }
                continue
            }
            $attempt = Start-AssociationAttempt $ext $before $progId
            if ($executable) {
                $base = "HKEY_CURRENT_USER\Software\Classes"
                [Microsoft.Win32.Registry]::SetValue("$base\$progId", '', [IO.Path]::GetFileNameWithoutExtension($executable))
                [Microsoft.Win32.Registry]::SetValue("$base\$progId\shell\open\command", '', ('"{0}" "%1"' -f $executable))
                [Microsoft.Win32.Registry]::SetValue("$base\$ext\OpenWithProgids", $progId, [byte[]]@(), [Microsoft.Win32.RegistryValueKind]::None)
            }
            Set-FTA -ProgId $progId -Extension $ext -SkipSelfCheck -WarningAction SilentlyContinue | Out-Null
            $after = Get-AssociationState $ext
            if ($after.progId -ne $progId) { throw 'Windows did not report the requested default after writing.' }
            Complete-AssociationAttempt $attempt (New-AssociationResult $ext 'changed' $before $after)
        } catch {
            Complete-AssociationAttempt $attempt (New-AssociationResult $ext 'failed' $before (Get-AssociationState $ext) $_)
        }
    }
    return @{ results = @($results) }
}

try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.action -in 'apply', 'restore', 'rollback') {
        if ($request.journalPath) {
            $script:associationLog = [IO.File]::Open($request.journalPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        }
        if ($request.action -ne 'rollback') { $null = Get-Catalog }
        $enginePath = Join-Path $PSScriptRoot 'SFTA.ps1'
        if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf)) {
            $enginePath = Join-Path (Split-Path $PSScriptRoot) 'SFTA.ps1'
        }
        . $enginePath
        $plan = Get-UclWritePlan
        if ($plan.Action -eq 'refuse') { throw $plan.Reason }
        if ($plan.Action -eq 'write' -and (Test-UclSelfCheck -Quiet) -eq 'mismatch') {
            throw 'This Windows build failed the association compatibility check.'
        }
    }
    $response = switch ($request.action) {
        'catalog' { Get-Catalog }
        'apply' { Set-Associations $request }
        'state' {
            if ($request.extension -notmatch $extensionPattern) { throw 'Invalid extension.' }
            Get-AssociationState $request.extension
        }
        'states' {
            $states = @{}
            foreach ($ext in $request.extensions) {
                if ($ext -notmatch $extensionPattern) { throw 'Invalid extension.' }
                $states[$ext] = Get-AssociationState $ext
            }
            $states
        }
        'rollback' { Restore-AssociationRecord $request }
        'icons' {
            $icons = @{}
            foreach ($item in $request.items) {
                try {
                    $icons[$item.id] = if ($item.executable) {
                        [DefaultAssociation]::ExecutableIcon($item.executable)
                    } else {
                        [DefaultAssociation]::Icon($item.appUserModelId)
                    }
                } catch { $icons[$item.id] = $null }
            }
            $icons
        }
        'restore' {
            $rows = foreach ($group in $request.groups) {
                try {
                    (Set-Associations $group).results
                } catch {
                    foreach ($ext in $group.extensions) {
                        New-AssociationResult $ext 'failed' $null $null $_
                    }
                }
            }
            @{ results = @($rows) }
        }
        default { throw 'Unknown action.' }
    }
    [Console]::WriteLine((ConvertTo-Json -InputObject $response -Depth 8 -Compress))
} catch {
    [Console]::WriteLine((ConvertTo-Json -InputObject @{ error = $_.Exception.Message } -Compress))
    exit 1
} finally {
    if ($script:associationLog) { $script:associationLog.Dispose() }
}
