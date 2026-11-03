param(
    [Parameter(Mandatory = $true)][string]$IdentityName,
    [Parameter(Mandatory = $true)][string]$Publisher,
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$PublisherDisplayName = 'Dove Bevo',
    [string]$OutputRoot = ''
)

$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSCommandPath
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $source 'out'
}
$sourceFull = [IO.Path]::GetFullPath($source)
$outputFull = [IO.Path]::GetFullPath($OutputRoot)
if (-not $outputFull.StartsWith($sourceFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Build output must remain inside the selected Windows project folder.'
}
if ($IdentityName -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]{1,49}$' -or
    $Publisher -notmatch '^CN=[A-Za-z0-9 .,_=-]{1,120}$' -or
    $PublisherDisplayName -notmatch '^[A-Za-z0-9 .,&-]{1,80}$' -or
    $Version -notmatch '^[0-9]{1,5}(\.[0-9]{1,5}){3}$') {
    throw 'Invalid MSIX identity or version.'
}
$parts = $Version.Split('.') | ForEach-Object { [int]$_ }
if ($parts | Where-Object { $_ -gt 65535 }) { throw 'MSIX version components must fit 16 bits.' }
if ($parts[0] -eq 0) { throw 'MSIX major version must be greater than zero.' }
if ($parts[3] -ne 0) { throw 'Microsoft Store requires a zero MSIX revision component.' }
$versionFolder = Join-Path $outputFull $Version
if (Test-Path -LiteralPath $versionFolder) { throw 'This output version already exists; choose a fresh output root.' }
$publish = Join-Path $versionFolder 'publish'
$stage = Join-Path $versionFolder 'stage'
$package = Join-Path $versionFolder ('DoveBevo.Windows_' + $Version + '_x64.msix')
New-Item -ItemType Directory -Path $publish, $stage -Force | Out-Null

dotnet publish (Join-Path $source 'DoveBevo.Windows.csproj') -c Release -r win-x64 --self-contained true -o $publish -p:DebugType=None -p:PublishReadyToRun=false
if ($LASTEXITCODE -ne 0) { throw 'Windows publish failed.' }
Get-ChildItem -LiteralPath $publish -Force | Copy-Item -Destination $stage -Recurse
if (-not (Test-Path -LiteralPath (Join-Path $stage 'DoveBevo.Windows.exe')) -or
    -not (Test-Path -LiteralPath (Join-Path $stage 'Assets\Logo.png')) -or
    -not (Test-Path -LiteralPath (Join-Path $stage 'VenueCapture.js')) -or
    -not (Test-Path -LiteralPath (Join-Path $stage 'SearchClick.js'))) {
    throw 'Published app is incomplete.'
}

$identityXml = [Security.SecurityElement]::Escape($IdentityName)
$publisherXml = [Security.SecurityElement]::Escape($Publisher)
$publisherDisplayXml = [Security.SecurityElement]::Escape($PublisherDisplayName)
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap10 rescap">
  <Identity Name="$identityXml" Version="$Version" Publisher="$publisherXml" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>Dove Bevo</DisplayName>
    <PublisherDisplayName>$publisherDisplayXml</PublisherDisplayName>
    <Description>Prezzi dei drink nei locali, prima di ordinare.</Description>
    <Logo>Assets\Logo.png</Logo>
  </Properties>
  <Resources><Resource Language="it-IT" /></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
  <Applications>
    <Application Id="DoveBevo" Executable="DoveBevo.Windows.exe"
                 uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
      <uap:VisualElements DisplayName="Dove Bevo" Description="Prezzi reali, persone reali."
                          Square150x150Logo="Assets\Logo.png" Square44x44Logo="Assets\Logo.png"
                          BackgroundColor="#FFF4E4" />
    </Application>
  </Applications>
</Package>
"@
[IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifest,
    [Text.UTF8Encoding]::new($false))

$sdk = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe'
if (-not (Test-Path -LiteralPath $sdk)) { throw 'Windows SDK MakeAppx.exe is required.' }
$packOutput = & $sdk pack /d $stage /p $package /no
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $package)) { throw 'MSIX packaging failed.' }
$packOutput | Select-Object -Last 2
$hash = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
[pscustomobject]@{
    package = $package
    sha256 = $hash
    identity = $IdentityName
    publisher = $Publisher
    version = $Version
    signed = $false
} | ConvertTo-Json -Depth 3
