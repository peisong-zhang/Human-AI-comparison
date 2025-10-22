# Data Directory

Place experiment case images inside the mode-specific folders:

- `data/cases/standard` &rarr; Mode `A`
- `data/cases/ai_human` &rarr; Mode `B`

Each image filename becomes the `image_id` used in the session (without the extension).
Example: `patient_001.jpg` &rarr; `image_id` = `patient_001`.

> Tip: keep filenames URL-safe (letters, numbers, `_`, `-`) to simplify routing.

You can add additional folders or update `config/experiment.json` to point at
different directories as long as the backend container can access them. When running
via Docker the `data/` directory is mounted automatically so new images are detected
without rebuilding the container.
