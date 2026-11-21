"""Small dataset views for the demo slides, drawn from the demo-kit files.

Usage: python3 scripts/deck-dataset-views.py <demo-kit>/datasets <output-dir> [--demo1 <spectroscopy example dir>]
Demonstration 1 is drawn from the public teaching example given with --demo1
(public/multimodal-data/spectroscopy-complementary); demonstrations 2 to 4 from the demo-kit folders.
"""
import csv, sys, pathlib, random
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from PIL import Image

KIT, OUT = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
DEMO1 = pathlib.Path(sys.argv[sys.argv.index('--demo1') + 1]) if '--demo1' in sys.argv else None
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 13, 'axes.titlesize': 15, 'axes.titleweight': 'bold',
                     'axes.spines.top': False, 'axes.spines.right': False, 'axes.edgecolor': '#94a3b8', 'axes.labelcolor': '#334155',
                     'xtick.color': '#475569', 'ytick.color': '#475569', 'axes.titlelocation': 'left', 'axes.titlepad': 8})
CMAP = 'viridis'
rng = random.Random(20261121)

def table(path):
    with open(path, newline='') as f:
        rows = list(csv.reader(f))
    return rows[0], rows[1:]

def matrix(path):
    head, rows = table(path)
    return [r[0] for r in rows], np.array([[float(x) if x not in ('', 'NA') else np.nan for x in r[1:]] for r in rows]), head[1:]

def spectra(ax, path, target, title, xlabel, n=60, invert=False):
    ids, X, cols = matrix(path)
    axis = np.array([float(c) for c in cols])
    y = np.array([target[i] for i in ids])
    pick = sorted(rng.sample(range(len(ids)), min(n, len(ids))), key=lambda i: y[i])
    norm = plt.Normalize(np.nanmin(y), np.nanmax(y))
    for i in pick:
        ax.plot(axis, X[i], lw=0.9, alpha=0.85, color=plt.get_cmap(CMAP)(norm(y[i])))
    ax.set_title(title); ax.set_xlabel(xlabel)
    if invert: ax.invert_xaxis()
    ax.set_yticks([])
    return norm

def colorbar(fig, axes, norm, label):
    sm = plt.cm.ScalarMappable(norm=norm, cmap=CMAP); sm.set_array([])
    cb = fig.colorbar(sm, ax=axes, fraction=0.025, pad=0.015); cb.set_label(label); cb.outline.set_visible(False)

def save(fig, name):
    fig.savefig(OUT / name, dpi=150, facecolor='white'); plt.close(fig); print(OUT / name)

# 1 · three spectroscopies coloured by the target (public teaching example; skipped without --demo1)
if DEMO1:
    head, rows = table(DEMO1 / 'metadata.csv')
    y = {r[0]: float(r[head.index('target')]) for r in rows}
    fig, axes = plt.subplots(3, 1, figsize=(9.6, 6.6), constrained_layout=True)
    for ax, (file, title, unit) in zip(axes, [('raman.csv', 'Raman · 48 variables', 'cm⁻¹'), ('nirs.csv', 'NIRS · 64 variables', 'nm'), ('mir.csv', 'MIR · 56 variables', 'cm⁻¹')]):
        norm = spectra(ax, DEMO1 / file, y, title, unit)
    colorbar(fig, axes, norm, 'cible (u.a.)')
    save(fig, 'spectroscopy-data.png')

# 2 · wheat: grain and leaf spectra coloured by yield, SNP dosages
d = KIT / '2-ble-NIRS-grain-feuille-SNP'
_, rows = table(d / 'metadata.csv'); y = {r[0]: float(r[2]) for r in rows}
fig = plt.figure(figsize=(9.6, 6.6), constrained_layout=True)
gs = fig.add_gridspec(2, 2, height_ratios=[1, 1])
a1, a2, a3 = fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1]), fig.add_subplot(gs[1, :])
norm = spectra(a1, d / 'nirs_grain.csv', y, 'NIRS grain (dérivée 1re)', 'nm')
spectra(a2, d / 'nirs_leaf.csv', y, 'NIRS feuille (dérivée 1re)', 'nm')
ids, M, _ = matrix(d / 'markers.csv')
order = np.argsort([y[i] for i in ids])
a3.imshow(M[order][:, :400], aspect='auto', cmap=ListedColormap(['#f1f5f9', '#5eead4', '#0f766e']), interpolation='nearest')
a3.set_title('SNP · dosages 0 / 1 / 2 · 400 des 2 000 marqueurs'); a3.set_xlabel('marqueur'); a3.set_ylabel('variétés (par rendement)'); a3.set_yticks([])
colorbar(fig, [a1, a2], norm, 'rendement')
save(fig, 'genetics-data.png')

# 3 · rice: mean pixel spectrum per variety, and one image per variety
d = KIT / '3-riz-image-3pixels-CLASSIFICATION'
_, rows = table(d / 'metadata.csv'); variety = {r[0]: r[1] for r in rows}
names = sorted(set(variety.values()))
colors = plt.get_cmap('tab10')
fig = plt.figure(figsize=(9.6, 6.6), constrained_layout=True)
gs = fig.add_gridspec(2, 3, height_ratios=[1.1, 1])
for k, (file, title) in enumerate([('pixel_center.csv', 'Pixel central'), ('pixel_a.csv', 'Pixel A'), ('pixel_b.csv', 'Pixel B')]):
    ax = fig.add_subplot(gs[0, k])
    ids, X, cols = matrix(d / file); axis = np.array([float(c) for c in cols])
    for v, name in enumerate(names):
        rows_v = [i for i, s in enumerate(ids) if variety[s] == name]
        ax.plot(axis, np.nanmean(X[rows_v], axis=0), lw=1.4, color=colors(v), label=name)
    ax.set_title(title); ax.set_xlabel('nm'); ax.set_yticks([])
    if k == 0: ax.set_ylabel('moyenne par variété')
mosaic = fig.add_subplot(gs[1, :])
_, rows = table(d / 'images.csv'); files = {r[0]: r[1] for r in rows}
tiles = []
for name in names:
    picks = [s for s in sorted(files) if variety.get(s) == name][:2]
    tiles.append(np.vstack([np.asarray(Image.open(d / files[s]).convert('RGB').resize((64, 64), Image.NEAREST)) for s in picks]))
mosaic.imshow(np.hstack(tiles)); mosaic.set_xticks([32 + 64 * i for i in range(len(names))]); mosaic.set_xticklabels(names, fontsize=11)
mosaic.set_yticks([]); mosaic.set_title('Images RGB 32 × 32 · deux grains par variété')
for i, label in enumerate(mosaic.get_xticklabels()): label.set_color(colors(i))
save(fig, 'images-data.png')

# 4 · mango: spectra coloured by dry matter, weather of each harvest
d = KIT / '4-mangue-NIR-meteo-SERIE-TEMPORELLE'
_, rows = table(d / 'metadata.csv'); y = {r[0]: float(r[1]) for r in rows}; harvest = {r[0]: r[3] for r in rows}
fig = plt.figure(figsize=(9.6, 6.6), constrained_layout=True)
gs = fig.add_gridspec(2, 4, height_ratios=[1.15, 1])
a = fig.add_subplot(gs[0, :])
norm = spectra(a, d / 'nir.csv', y, 'Spectre Vis-SWNIR · 245 points', 'nm', n=80)
colorbar(fig, [a], norm, 'matière sèche (%)')
_, rows = table(d / 'weather.csv')
series = {}
for r in rows:
    series.setdefault(harvest[r[0]], {}).setdefault(int(r[1]), [float(x) for x in r[2:]])
labels = ['T max (°C)', 'T min (°C)', 'pluie (mm)', 'rayonnement (MJ/m²)']
for k, label in enumerate(labels):
    ax = fig.add_subplot(gs[1, k])
    for h, days in series.items():
        t = sorted(days); ax.plot(t, [days[i][k] for i in t], lw=0.7, alpha=0.6, color='#0d9488' if h.startswith('NT') else '#7c3aed')
    ax.set_title(label, fontsize=12); ax.set_xticks([-90, -45, 0])
fig.supxlabel('jours avant récolte · une courbe par récolte · vert : Territoire du Nord · violet : Queensland', fontsize=11, color='#475569')
save(fig, 'timeseries-data.png')
