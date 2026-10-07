$ModsPath = Join-Path $PSScriptRoot "mods"

function Format-Size($Bytes) {
    if ($Bytes -lt 1KB) {
        return "$Bytes B"
    }
    elseif ($Bytes -lt 1MB) {
        return "{0:N1} KB" -f ($Bytes / 1KB)
    }
    else {
        return "{0:N1} MB" -f ($Bytes / 1MB)
    }
}

# ============================================================
# mods/index.html
# ============================================================

$Directories = Get-ChildItem -Path $ModsPath -Directory |
    Sort-Object Name

$Html = @"
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet">


    <title>Index of /mods/</title>

    <style>
        body {
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            margin: 40px;
            background: #000;
            color: #fff;
        }

        h1 {
            margin-bottom: 25px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th,
        td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }

        a {
            color: #0067c0;
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        @media (max-width: 600px) {
            body {
                margin: 15px;
            }
        }
    </style>
</head>

<body>

<h1>Index of /mods/</h1>

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Last modified</th>
        </tr>
    </thead>

    <tbody>
"@

foreach ($Directory in $Directories) {

    $Html += @"
        <tr>
            <td>
                [DIR]
                <a href="$($Directory.Name)/">
                    $($Directory.Name)/
                </a>
            </td>

            <td>-</td>
        </tr>
"@
}

$Html += @"
    </tbody>
</table>

</body>
</html>
"@

$Utf8 = New-Object System.Text.UTF8Encoding($false)

[System.IO.File]::WriteAllText(
    (Join-Path $ModsPath "index.html"),
    $Html,
    $Utf8
)

# ============================================================
# mods/files/index.html
# ============================================================

$FilesPath = Join-Path $ModsPath "files"
$FilesIndexPath = Join-Path $FilesPath "index.html"

if (Test-Path $FilesPath) {

    $JarFiles = Get-ChildItem `
        -Path $FilesPath `
        -Filter "*.jar" `
        -File |
        Sort-Object Name

    $Html = @"
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet">

    <title>Index of /mods/files/</title>

    <style>
        body {
            font-family: -apple-system, "Segoe UI", "Inter";
            margin: 40px;
            background: #000;
            color: #fff;
        }

        h1 {
            margin-bottom: 20px;
        }

        .toolbar {
            margin-bottom: 25px;
        }

        button {
            border: none;
            border-radius: 8px;
            padding: 10px 16px;
            background: #0078d4;
            color: white;
            cursor: pointer;
            font-size: 14px;
        }

        button:hover {
            background: #106ebe;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th,
        td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }

        a {
            color: #0067c0;
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        .size {
            color: #777;
        }

        @media (max-width: 600px) {
            body {
                margin: 15px;
            }

            th:nth-child(3),
            td:nth-child(3) {
                display: none;
            }
        }
    </style>
</head>

<body>

<h1>Index of /mods/files/</h1>

<div class="toolbar">
    <button onclick="downloadAll()">
        &#1057;&#1082;&#1072;&#1095;&#1072;&#1090;&#1100; &#1074;&#1089;&#1077; .jar
    </button>
</div>

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Last modified</th>
            <th>Size</th>
        </tr>
    </thead>

    <tbody>
"@

    foreach ($Jar in $JarFiles) {

        $Size = Format-Size $Jar.Length

        $Modified = $Jar.LastWriteTime.ToString(
            "dd-MMM-yyyy HH:mm"
        )

        $Html += @"
        <tr>
            <td>
                <a href="$($Jar.Name)">
                    $($Jar.Name)
                </a>
            </td>

            <td>$Modified</td>

            <td class="size">
                $Size
            </td>
        </tr>
"@
    }

    $Html += @"
    </tbody>
</table>

<script>

const jarFiles = [
"@

    foreach ($Jar in $JarFiles) {

        $Html += @"
    "$($Jar.Name)",
"@
    }

    $Html += @"
];

async function downloadAll() {

    if (jarFiles.length === 0) {
        alert("JAR files not found.");
        return;
    }

    if (!confirm(
        "Files to download: " +
        jarFiles.length +
        ". Continue?"
    )) {
        return;
    }

    for (const file of jarFiles) {

        const link = document.createElement("a");

        link.href = file;
        link.download = file;

        document.body.appendChild(link);

        link.click();

        link.remove();

        await new Promise(
            resolve => setTimeout(resolve, 500)
        );
    }
}

</script>

</body>
</html>
"@

    [System.IO.File]::WriteAllText(
        $FilesIndexPath,
        $Html,
        $Utf8
    )

    Write-Host "mods/index.html updated"
    Write-Host "mods/files/index.html updated"
    Write-Host "JAR files found: $($JarFiles.Count)"
}
else {

    Write-Host "mods/files directory not found!"
}

Write-Host ""
Write-Host "Done!"
