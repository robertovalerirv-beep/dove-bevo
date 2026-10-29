param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$signingDirectory = Join-Path $env:LOCALAPPDATA 'DoveBevo\signing'
$repository = 'robertovalerirv-beep/dove-bevo'
$files = @{
    DOVEBEVO_ANDROID_KEYSTORE_BASE64 = 'android-upload.p12'
    DOVEBEVO_IOS_CERTIFICATE_BASE64 = 'ios-distribution.p12'
    DOVEBEVO_IOS_PROFILE_BASE64 = 'DoveBevo_AppStore.mobileprovision'
}
if (-not $Apply) {
    Write-Output 'Plan: send the approved encrypted signing identities, profile, password and public Android certificate fingerprint directly to Roberto repository Actions secrets. No values printed.'
    exit 0
}
if ((Get-Item -LiteralPath $signingDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Signing store must not follow links' }
foreach ($file in @($files.Values) + @('signing-password.dpapi', 'android-upload.pem')) {
    $item = Get-Item -LiteralPath (Join-Path $signingDirectory $file) -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Invalid signing input' }
}
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText((Join-Path $signingDirectory 'android-upload.pem')))
try {
    $fingerprint = $certificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256)
    if ($fingerprint -notmatch '^[A-F0-9]{64}$') { throw 'Invalid certificate fingerprint' }
} finally { $certificate.Dispose() }
$ghPath = (Get-Command gh -CommandType Application).Source
function Set-RepositorySecret([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'Empty secret input' }
    $start = [Diagnostics.ProcessStartInfo]::new($ghPath)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('secret', 'set', $Name, '--repo', $repository)) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($start)
    try {
        $process.StandardInput.Write($Value)
        $process.StandardInput.Close()
        $outputRead = $process.StandardOutput.ReadToEndAsync()
        $errorRead = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $null = $outputRead.GetAwaiter().GetResult()
        $null = $errorRead.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw "GitHub rejected secret $Name; values and remote output withheld" }
    } finally { $process.Dispose() }
}
$secureValue = (Get-Content -LiteralPath (Join-Path $signingDirectory 'signing-password.dpapi') -Raw).Trim() | ConvertTo-SecureString
$clearPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
try {
    foreach ($name in $files.Keys) {
        $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $signingDirectory $files[$name])))
        Set-RepositorySecret $name $encoded
        $encoded = $null
    }
    Set-RepositorySecret 'DOVEBEVO_SIGNING_PASSWORD' ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($clearPointer))
    Set-RepositorySecret 'DOVEBEVO_ANDROID_CERT_SHA256' $fingerprint
    Write-Output 'Approved signing secrets stored in Roberto repository. No private values printed or written to the project.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($clearPointer)
    $secureValue.Dispose()
}
