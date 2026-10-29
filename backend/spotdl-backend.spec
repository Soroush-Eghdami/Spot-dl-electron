# PyInstaller build for the download worker.
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

packages = ("spotdl", "spotapi", "yt_dlp", "ytmusicapi", "pykakasi")
hiddenimports = []
datas = []
for package in packages:
    hiddenimports += collect_submodules(package)
    datas += collect_data_files(package)

# Keep version numbers readable inside the frozen app.
datas += copy_metadata("spotdl")
datas += copy_metadata("yt-dlp")

a = Analysis(
    ["spotdl_backend.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "pytest", "IPython"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="spotdl-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    icon="../build/icon.ico",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="spotdl-backend",
)
