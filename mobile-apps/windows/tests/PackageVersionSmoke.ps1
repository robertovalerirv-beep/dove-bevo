$ErrorActionPreference = 'Stop'
$packager = Join-Path (Split-Path -Parent $PSScriptRoot) 'build-msix.ps1'
foreach ($case in @(
        @{ Version = '1.0.0.8'; Expected = 'zero MSIX revision' },
        @{ Version = '0.1.8.0'; Expected = 'major version' }
    )) {
    try {
        & $packager -IdentityName 'DoveBevo.Development' -Publisher 'CN=DoveBevo Development' -Version $case.Version | Out-Null
        throw "Invalid Store version $($case.Version) was accepted."
    }
    catch {
        if ($_.Exception.Message -notlike "*$($case.Expected)*") { throw }
    }
}
'Windows package version policy: invalid revision and major versions rejected.'
