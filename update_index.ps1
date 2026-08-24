# Корень, который сканируем рекурсивно.
# Индекс будет сгенерирован ВНУТРИ этой папки и внутри каждой её подпапки.
$RootDir = "mods/files"

function Format-Size {
    param([long]$SizeBytes)
    if ($SizeBytes -lt 1MB) {
        return "{0:N1} KB" -f ($SizeBytes / 1KB)
    } else {
        return "{0:N1} MB" -f ($SizeBytes / 1MB)
    }
}

function Generate-Index {
    param(
        [string]$DirPath,
        [string]$TitlePath
    )

    # Сортируем так же, как os.listdir + sorted() в Python
    $entries = Get-ChildItem -LiteralPath $DirPath -Force | Sort-Object Name

    $html = @"
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Index of /$TitlePath/</title>
    <style>
        body { font-family: monospace; padding: 20px; background-color: #1e1e2e; color: #cdd6f4; }
        h1 { font-size: 1.5em; font-weight: normal; }
        hr { border: 0; border-top: 1px solid #ccc; }
        a { text-decoration: none; color: #cdd6f4; }
        a:hover { text-decoration: underline; }
        table { border-collapse: collapse; min-width: 600px; }
        th { text-align: left; padding: 0 20px 10px 0; }
        td { padding: 2px 20px 2px 0; white-space: nowrap; }
    </style>
</head>
<body>
    <h1>Index of /$TitlePath/</h1>
    <hr>
    <table>
        <tr>
            <th>Name</th>
            <th>Last modified</th>
            <th>Size</th>
        </tr>
        <tr>
            <td><a href="../">../</a></td>
            <td>-</td>
            <td>-</td>
        </tr>
"@

    $filesCount = 0
    $dirsCount = 0

    foreach ($entry in $entries) {
        if ($entry.Name -eq "index.html") {
            continue  # не показываем сам индекс в его же списке
        }

        $mtime = $entry.LastWriteTime.ToString("dd-MMM-yyyy HH:mm")

        if ($entry.PSIsContainer) {
            $displayName = "$($entry.Name)/"
            $href = "$($entry.Name)/"
            $sizeStr = "-"
            $dirsCount++
        } else {
            $displayName = $entry.Name
            $href = $entry.Name
            $sizeStr = Format-Size -SizeBytes $entry.Length
            $filesCount++
        }

        $html += @"

        <tr>
            <td><a href="$href">$displayName</a></td>
            <td>$mtime</td>
            <td>$sizeStr</td>
        </tr>
"@
    }

    $html += @"

    </table>
    <hr>
</body>
</html>
"@

    $outputPath = Join-Path $DirPath "index.html"
    [System.IO.File]::WriteAllText($outputPath, $html, [System.Text.Encoding]::UTF8)

    Write-Host "OK: $outputPath (файлов: $filesCount, папок: $dirsCount)"
}

function Walk-AndGenerate {
    param([string]$RootDir)

    if (-not (Test-Path -LiteralPath $RootDir -PathType Container)) {
        Write-Host "Ошибка: папка $RootDir не найдена!"
        return
    }

    # Сама корневая папка + все подпапки рекурсивно
    $allDirs = @(Get-Item -LiteralPath $RootDir) + (Get-ChildItem -LiteralPath $RootDir -Recurse -Directory)

    foreach ($dir in $allDirs) {
        $titlePath = $dir.FullName.Substring((Get-Item -LiteralPath $RootDir).FullName.Length).TrimStart('\', '/')
        if ($titlePath -eq "") {
            $titlePath = (Split-Path -Leaf $RootDir)
        } else {
            $titlePath = "$(Split-Path -Leaf $RootDir)/$($titlePath -replace '\\','/')"
        }
        Generate-Index -DirPath $dir.FullName -TitlePath $titlePath
    }
}

Walk-AndGenerate -RootDir $RootDir