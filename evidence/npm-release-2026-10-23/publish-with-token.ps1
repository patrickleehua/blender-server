$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Blender Agent - NEW npm publish token'
$taskRepo = 'E:\workplace\blender-server'
$taskTarball = Join-Path $taskRepo 'release\patricklee2001-blender-agent-1.0.0.tgz'
$taskExpectedHash = '60cd4bbf1ada6df3e2cb16d517a80d176c48ec1b4504920c8ca0b1c121a71386'
$taskReceipt = Join-Path $taskRepo 'tmp\npm-token-publish-receipt.json'
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskNpm = Join-Path (Split-Path -Parent $taskNode) 'node_modules\npm\bin\npm-cli.js'
$taskActualHash = (Get-FileHash -LiteralPath $taskTarball -Algorithm SHA256).Hash.ToLowerInvariant()
if ($taskActualHash -ne $taskExpectedHash) { throw '安装包 SHA256 与已验收包不一致，发布已停止。' }
if (-not (Test-Path -LiteralPath $taskNpm -PathType Leaf)) { throw '找不到 npm CLI，发布已停止。' }
$taskTemporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ('blender-agent-publish-' + [Guid]::NewGuid().ToString('N'))
$taskConfig = Join-Path $taskTemporaryDirectory '.npmrc'
$taskPublishCode = 1
$taskLog = ''
$taskSecureToken = $null
$taskTokenPointer = [IntPtr]::Zero
try {
    Write-Host 'Blender Agent 1.0.0 / npm 首次发布' -ForegroundColor Cyan
    Write-Host '请从 npm 页面复制新 Token，粘贴到下方；输入不会显示。'
    Write-Host 'Token 仅存在本次进程内存中，不写入仓库、配置文件或命令历史。'
    Write-Host ''
    $taskSecureToken = Read-Host '粘贴 npm Token 后按回车' -AsSecureString
    $taskTokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecureToken)
    $env:BLENDER_AGENT_PUBLISH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskTokenPointer).Trim()
    if (-not $env:BLENDER_AGENT_PUBLISH_TOKEN.StartsWith('npm_')) { throw 'Token 格式不正确，请重新运行后粘贴完整 npm Token。' }
    $null = New-Item -ItemType Directory -Path $taskTemporaryDirectory
    # The file stores an environment reference, never the token value.
    [IO.File]::WriteAllText($taskConfig, 'registry=https://registry.npmjs.org/' + "`n" + '//registry.npmjs.org/:_authToken=${BLENDER_AGENT_PUBLISH_TOKEN}' + "`n", [Text.UTF8Encoding]::new($false))
    Write-Host '正在发布已经验收的同一份安装包……'
    $taskPreviousNativePreference = $PSNativeCommandUseErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $false
    try {
        $taskOutput = & $taskNode $taskNpm publish $taskTarball --userconfig $taskConfig --registry=https://registry.npmjs.org --access public --ignore-scripts --loglevel=warn 2>&1
        $taskPublishCode = $LASTEXITCODE
    } finally { $PSNativeCommandUseErrorActionPreference = $taskPreviousNativePreference }
    $taskLog = ($taskOutput | ForEach-Object { $_.ToString() }) -join "`n"
    $taskLog = $taskLog.Replace($env:BLENDER_AGENT_PUBLISH_TOKEN, '[redacted]')
    Write-Host $taskLog
} catch {
    $taskLog = $_.Exception.Message
    if ($env:BLENDER_AGENT_PUBLISH_TOKEN) { $taskLog = $taskLog.Replace($env:BLENDER_AGENT_PUBLISH_TOKEN, '[redacted]') }
    Write-Host $taskLog -ForegroundColor Red
} finally {
    [Environment]::SetEnvironmentVariable('BLENDER_AGENT_PUBLISH_TOKEN', $null, 'Process')
    if ($taskTokenPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskTokenPointer) }
    if ($taskSecureToken) { $taskSecureToken.Dispose() }
    if (Test-Path -LiteralPath $taskConfig) { Remove-Item -LiteralPath $taskConfig -Force }
    if (Test-Path -LiteralPath $taskTemporaryDirectory) { Remove-Item -LiteralPath $taskTemporaryDirectory -Force }
    @{ package = '@patricklee2001/blender-agent@1.0.0'; tarballSha256 = $taskActualHash; exitCode = $taskPublishCode; log = $taskLog; credentialsWritten = $false; finishedAt = [DateTimeOffset]::UtcNow.ToString('o') } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskReceipt -Encoding utf8
}
Write-Host ''
if ($taskPublishCode -eq 0) { Write-Host '发布命令已完成，请回 Codex。我会继续核对 npm 并验证在线安装。' -ForegroundColor Green }
else { Write-Host '发布没有完成。错误已安全记录，请回 Codex 继续处理。' -ForegroundColor Yellow }
