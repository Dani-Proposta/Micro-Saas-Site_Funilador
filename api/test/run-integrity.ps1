# Somente contas ficticias e backend local conectado a development.
$ErrorActionPreference = 'Stop'
$confirmation = Read-Host 'Confira a branch Neon e a role do backend. Digite DEVELOPMENT para confirmar o ambiente de teste'
if ($confirmation -cne 'DEVELOPMENT') { throw 'Teste cancelado.' }
$previousEncoding = $OutputEncoding
$exitCode = 1
try {
    $admin = Get-Credential -Message 'Administrador de development: e-mail e senha'
    if (-not $admin) { throw 'Teste cancelado.' }
    $client = Get-Credential -Message 'Cliente ficticio de development: e-mail e senha'
    if (-not $client) { throw 'Teste cancelado.' }
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    @{
        confirmacao = $confirmation
        admin = @{email = $admin.UserName; password = $admin.GetNetworkCredential().Password}
        cliente = @{email = $client.UserName; password = $client.GetNetworkCredential().Password}
    } | ConvertTo-Json -Compress -Depth 4 | & node (Join-Path $PSScriptRoot 'integrity.test.mjs')
    $exitCode = $LASTEXITCODE
} finally {
    $OutputEncoding = $previousEncoding
    Remove-Variable admin,client -ErrorAction SilentlyContinue
}
exit $exitCode
