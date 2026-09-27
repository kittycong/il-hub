# il-hub 빌드: src/ 폴더의 조각 파일을 합쳐 index.html 한 파일로 만듭니다.
# 사용법: 이 폴더에서  python3 build.py   (파이썬 3만 있으면 됨, 추가 설치 없음)
import pathlib
root = pathlib.Path(__file__).parent
src = root/'src'
ORDER = ['core.js','hodata.js','data.js','connect.js','home.js','calendar.js','bridge.js','docs.js','docs2.js','photos.js','yesu.js','budget.js','handover.js','extras.js','embed.js','settings.js']
head = (src/'head.html').read_text(encoding='utf-8')
body = (src/'body.html').read_text(encoding='utf-8')
js = '\n'.join((src/f).read_text(encoding='utf-8') for f in ORDER)
gh = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1F5F6B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="업무허브">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon.svg">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}[hidden]{{display:none!important}}</style>
{head}
</head>
<body>
{body}<script>window.HUB_ENV='web';</script>
<script>
{js}
</script>
</body>
</html>
'''
(root/'index.html').write_text(gh, encoding='utf-8')
print('index.html', len(gh), '자')
