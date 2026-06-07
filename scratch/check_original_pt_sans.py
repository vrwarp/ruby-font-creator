import subprocess
from fontTools.ttLib import TTFont

PINYIN_REQUIRED_CHARS = [
  'ā', 'á', 'ǎ', 'à',
  'ē', 'é', 'ě', 'è',
  'ī', 'í', 'ǐ', 'ì',
  'ō', 'ó', 'ǒ', 'ò',
  'ū', 'ú', 'ǔ', 'ù',
  'ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'
]

def check_git_version(git_path):
    # Get original bytes from git
    data = subprocess.check_output(['git', 'show', f'HEAD:{git_path}'])
    # parse TTFont
    import io
    font = TTFont(io.BytesIO(data))
    cmap = font.getBestCmap()
    missing = []
    for char in PINYIN_REQUIRED_CHARS:
        cp = ord(char)
        if cp not in cmap:
            missing.append(char)
    print(f"{git_path}: missing {len(missing)}: {missing}")

check_git_version('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Regular.ttf')
check_git_version('frontend/public/resources/fonts/PT_Sans-Narrow-Web-Bold.ttf')
