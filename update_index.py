# работай мой клод код, работай!
import os
import time

# Корень, который сканируем рекурсивно.
# Индекс будет сгенерирован ВНУТРИ этой папки и внутри каждой её подпапки.
ROOT_DIR = "mods/files"


def format_size(size_bytes):
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


def generate_index(dir_path, title_path):
    """Генерирует index.html внутри dir_path со списком его непосредственного содержимого."""
    entries = sorted(os.listdir(dir_path))

    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Index of /{title_path}/</title>
    <style>
        body {{ font-family: monospace; padding: 20px; background-color: #1e1e2e; color: #cdd6f4; }}
        h1 {{ font-size: 1.5em; font-weight: normal; }}
        hr {{ border: 0; border-top: 1px solid #ccc; }}
        a {{ text-decoration: none; color: #cdd6f4; }}
        a:hover {{ text-decoration: underline; }}
        table {{ border-collapse: collapse; min-width: 600px; }}
        th {{ text-align: left; padding: 0 20px 10px 0; }}
        td {{ padding: 2px 20px 2px 0; white-space: nowrap; }}
    </style>
</head>
<body>
    <h1>Index of /{title_path}/</h1>
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
"""

    files_count = 0
    dirs_count = 0

    for entry_name in entries:
        if entry_name == "index.html":
            continue  # не показываем сам индекс в его же списке

        entry_path = os.path.join(dir_path, entry_name)
        is_dir = os.path.isdir(entry_path)
        stat = os.stat(entry_path)
        mtime = time.strftime('%d-%b-%Y %H:%M', time.localtime(stat.st_mtime))

        if is_dir:
            display_name = f"{entry_name}/"
            href = f"{entry_name}/"
            size_str = "-"
            dirs_count += 1
        else:
            display_name = entry_name
            href = entry_name
            size_str = format_size(stat.st_size)
            files_count += 1

        html += f"""
        <tr>
            <td><a href="{href}">{display_name}</a></td>
            <td>{mtime}</td>
            <td>{size_str}</td>
        </tr>"""

    html += """
    </table>
    <hr>
</body>
</html>
"""

    output_path = os.path.join(dir_path, "index.html")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"OK: {output_path} (файлов: {files_count}, папок: {dirs_count})")


def walk_and_generate(root_dir):
    if not os.path.isdir(root_dir):
        print(f"Ошибка: папка {root_dir} не найдена!")
        return

    for current_dir, _, _ in os.walk(root_dir):
        title_path = current_dir.replace(os.sep, "/")
        generate_index(current_dir, title_path)


if __name__ == "__main__":
    walk_and_generate(ROOT_DIR)
