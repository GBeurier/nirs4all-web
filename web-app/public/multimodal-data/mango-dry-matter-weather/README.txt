Mango dry matter: derived teaching subset of Anderson, Walsh, Subedi and Walsh, "Mango DMC and NIR spectra",
Mendeley Data v6 (2026), https://doi.org/10.17632/46htwnp833.6 (paper https://doi.org/10.1016/j.postharvbio.2020.111202),
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), joined with daily weather from the Open-Meteo
Historical Weather API (ERA5, Copernicus Climate Change Service; CC BY 4.0, https://open-meteo.com/).
Changes: one spectrum per fruit (replicate scans averaged), seasons 1-3 train / season 4 test as in the source,
up to 12/15 fruits per harvest event; weather = 90 daily steps x 4 variables before each harvest date at one
representative location per region (Humpty Doo NT, Mareeba QLD); day 0 = the full local day of the date (taken as
the harvest date). Folds are grouped by region x season. Target: dry matter (% DM). Results with this subset and
protocol are not comparable with the publications' own splits.
Limitation: orchard coordinates are not published, so weather is regional and shared within a harvest event.
