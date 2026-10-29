param([switch]$Apply)
$ErrorActionPreference = 'Stop'
# Credentials deliberately belong to this protected OS store, never the project.
$signingRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'DoveBevo\signing'))
$localRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
if (-not $signingRoot.StartsWith($localRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid signing store' }
$oneDriveRoot = [Environment]::GetEnvironmentVariable('OneDrive')
if ($oneDriveRoot -and $signingRoot.StartsWith([IO.Path]::GetFullPath($oneDriveRoot) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Signing store cannot be in OneDrive' }
$openssl = Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe'
if (-not (Test-Path -LiteralPath $openssl -PathType Leaf)) { throw 'The installed Git OpenSSL runtime is required' }
if (-not $Apply) { Write-Output 'Plan: create encrypted iOS CSR key and Android upload identity in the protected local signing store. No credentials created.'; exit 0 }
foreach ($path in @((Join-Path $localRoot 'DoveBevo'), $signingRoot)) {
    if (Test-Path -LiteralPath $path) {
        if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Signing store must not follow links' }
    } else { New-Item -ItemType Directory -Path $path | Out-Null }
}
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($owner)
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($owner, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $signingRoot -AclObject $acl
$targets = @('signing-password.dpapi', 'ios-private.pem', 'ios-distribution.csr', 'android-private.pem', 'android-upload.pem', 'android-upload.p12')
$existing = @($targets | Where-Object { Test-Path -LiteralPath (Join-Path $signingRoot $_) })
if ($existing.Count -gt 0) { throw 'Signing material already exists; preserve it and inspect the existing state instead of overwriting' }
$password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$securePassword = ConvertTo-SecureString -String $password -AsPlainText -Force
ConvertFrom-SecureString -SecureString $securePassword | Set-Content -LiteralPath (Join-Path $signingRoot 'signing-password.dpapi') -Encoding ascii
$env:DOVEBEVO_SIGNING_PASSWORD = $password
try {
    & $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -aes-256-cbc -pass env:DOVEBEVO_SIGNING_PASSWORD -out (Join-Path $signingRoot 'ios-private.pem') 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'iOS private key generation failed; preserve partial state' }
    & $openssl req -new -sha256 -key (Join-Path $signingRoot 'ios-private.pem') -passin env:DOVEBEVO_SIGNING_PASSWORD -out (Join-Path $signingRoot 'ios-distribution.csr') -subj '/CN=Dove Bevo Distribution/O=Svg associates Ltd'
    if ($LASTEXITCODE -ne 0) { throw 'iOS certificate request failed' }
    & $openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -aes-256-cbc -pass env:DOVEBEVO_SIGNING_PASSWORD -out (Join-Path $signingRoot 'android-private.pem') 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Android private key generation failed' }
    & $openssl req -new -x509 -sha256 -days 10000 -key (Join-Path $signingRoot 'android-private.pem') -passin env:DOVEBEVO_SIGNING_PASSWORD -out (Join-Path $signingRoot 'android-upload.pem') -subj '/CN=Dove Bevo Upload/O=Svg associates Ltd'
    if ($LASTEXITCODE -ne 0) { throw 'Android upload certificate generation failed' }
    & $openssl pkcs12 -export -name dovebevo-upload -inkey (Join-Path $signingRoot 'android-private.pem') -in (Join-Path $signingRoot 'android-upload.pem') -passin env:DOVEBEVO_SIGNING_PASSWORD -passout env:DOVEBEVO_SIGNING_PASSWORD -out (Join-Path $signingRoot 'android-upload.p12')
    if ($LASTEXITCODE -ne 0) { throw 'Android upload identity export failed' }
    Write-Output 'Encrypted signing material and iOS public CSR created in the protected local signing store. No credentials printed or stored in the project.'
} finally {
    Remove-Item Env:DOVEBEVO_SIGNING_PASSWORD -ErrorAction SilentlyContinue
    $password = $null
    $securePassword.Dispose()
}
