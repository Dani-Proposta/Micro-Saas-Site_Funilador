# Execute apenas com contas ficticias e backend conectado a development.
$ErrorActionPreference = 'Stop'
$previousEncoding = $OutputEncoding
$exitCode = 1
try {
    $a = Get-Credential -Message 'Cliente ficticio A (development): e-mail e senha'
    if (-not $a) { throw 'Teste cancelado.' }
    $b = Get-Credential -Message 'Cliente ficticio B (development): e-mail e senha'
    if (-not $b) { throw 'Teste cancelado.' }
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    @(
        @{email = $a.UserName; password = $a.GetNetworkCredential().Password},
        @{email = $b.UserName; password = $b.GetNetworkCredential().Password}
    ) | ConvertTo-Json -Compress | & node (Join-Path $PSScriptRoot 'authorization.test.mjs')
    $exitCode = $LASTEXITCODE
} finally {
    $OutputEncoding = $previousEncoding
    Remove-Variable a,b -ErrorAction SilentlyContinue
}
exit $exitCode
