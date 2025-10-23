# Data Directory

Place experiment case images in the subset + mode folders:

- `data/cases/subset_a/human/` → Stage using Subset A without AI overlay
- `data/cases/subset_a/ai_assisted/` → Subset A with AI overlay embedded in the image
- `data/cases/subset_b/human/`
- `data/cases/subset_b/ai_assisted/`

Each physical case should have matching filenames across the two modes if you want the
same patient to appear in both stages (e.g. `case_001.jpg` in each folder). Filenames
(without extension) become the `image_id` recorded in the database.

Feel free to reorganize or add new subsets/modes—just update `config/experiment.json`
with the correct paths. When the backend starts (or when `/api/session/start` is called),
it scans these directories so new images are picked up automatically.
