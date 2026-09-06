$RootDir = "mods/files"

function Format-Size {
    param([long]$SizeBytes)
    if ($SizeBytes -lt 1MB) {
        return "{0:N1} KB" -f ($SizeBytes / 1KB)
    } else {
        return "{0:N1} MB" -f ($SizeBytes / 1MB)
    }
}

$downloadScript = @'
    <script>
    document.getElementById('download-all-btn').addEventListener('click', downloadAllFiles);

    async function downloadAllFiles() {
    const btn = document.getElementById('download-all-btn');
      btn.disabled = true;
      const status = document.getElementById('download-status');
      const links = Array.from(document.querySelectorAll('table a'))
        .filter(a => !a.getAttribute('href').startsWith('..'));
        status.textContent = 'Готово!';
        btn.disabled = false;

      const zip = new JSZip();
      let done = 0;

      for (const link of links) {
        const url = link.href;
        const name = decodeURIComponent(link.getAttribute('href'));
        status.textContent = `Скачиваю ${++done}/${links.length}: ${name}`;

        const response = await fetch(url);
        const blob = await response.blob();
        zip.file(name, blob);
      }

      status.textContent = 'Упаковываю zip...';
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'mods.zip');
      status.textContent = 'Готово!';
    }
    </script>
'@

function Generate-Index {
    param(
        [string]$DirPath,
        [string]$TitlePath
    )

    # ��������� ��� ��, ��� os.listdir + sorted() � Python
    $entries = Get-ChildItem -LiteralPath $DirPath -Force | Sort-Object Name

    $html = @"
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Index of /$TitlePath/</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'JetBrains Mono'; padding: 20px; background-color: #1e1e2e; color: #cdd6f4; }
        jetbrains-mono-<uniquifier> { font-family: "JetBrains Mono", monospace; font-optical-sizing: auto; font-weight: <weight>; font-style: normal;}
        h1 { font-size: 1.5em; font-weight: normal; }
        hr { border: 0; border-top: 1px solid #ccc; }
        a { text-decoration: none; color: #cdd6f4; }
        a:hover { text-decoration: underline; }
        table { border-collapse: collapse; min-width: 600px; }
        th { text-align: left; padding: 0 20px 10px 0; }
        td { padding: 2px 20px 2px 0; white-space: nowrap; }
        #download-all-btn {
            font-family: 'JetBrains Mono', monospace;
            background-color: #313244;
            color: #cdd6f4;
            border: 1px solid #45475a;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 0.95em;
            cursor: pointer;
            transition: background-color 0.15s ease, border-color 0.15s ease;
        }

        #download-status {
            font-family: 'JetBrains Mono', monospace;
            margin-left: 12px;
            color: #a6adc8;
            font-size: 0.9em;
        }

        .header-bar {
            display: flex;
            justify-content: flex-start;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
        }

        #download-all-btn {
            font-family: 'JetBrains Mono', monospace;
            background-color: #313244;
            color: #cdd6f4;
            border: 1px solid #45475a;
            border-radius: 6px;
            padding: 8px 16px;
            font-size: 0.95em;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: background-color 0.15s ease, border-color 0.15s ease;
        }

        #download-all-btn svg {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
        }

        #download-all-btn:hover {
            background-color: #45475a;
            border-color: #585b70;
        }

        #download-all-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        @media (max-width: 600px) {
            #download-all-btn {
                width: 44px;
                height: 44px;
                padding: 0;
                border-radius: 50%;
                justify-content: center;
            }

            #download-all-btn .btn-label {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="header-bar">
        <h1>Index of /$TitlePath/</h1>
        <div>
            <button id="download-all-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span class="btn-label">Скачать всё</span>
            </button>
            <span id="download-status"></span>
        </div>
    </div>
    $downloadScript
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
            continue  # �� ���������� ��� ������ � ��� �� ������
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

    Write-Host "OK: $outputPath (������: $filesCount, �����: $dirsCount)"
}

function Walk-AndGenerate {
    param([string]$RootDir)

    if (-not (Test-Path -LiteralPath $RootDir -PathType Container)) {
        Write-Host "������: ����� $RootDir �� �������!"
        return
    }

    # ���� �������� ����� + ��� �������� ����������
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
