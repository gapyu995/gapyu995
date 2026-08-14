# 🐍 GitHub Contribution Snake

<p align="center">
  <img src="./snake-contribution.svg?v=19-b8d9b61180e8" alt="GitHub contribution snake animation" width="100%" />
</p>

The contribution snake is generated automatically from the GitHub contribution
calendar. The SVG uses SMIL animation and loops continuously.

## Rules

- Every non-empty GitHub contribution day is a food point.
- The snake always targets the oldest food point.
- Contribution levels provide 1, 2, 3, or 4 growth points; every 4 points add one segment.
- Every eaten point has its own 35-step recovery timer; all points due on the same step regenerate together.
- The snake naturally loses one segment every 10 movement steps without creating food.
- Snake length never exceeds the current number of contribution days.

## Automatic updates

The `Update contribution snake SVG` GitHub Actions workflow runs every day at
00:00 UTC and can also be started manually. It fetches contribution data, runs
the regression tests, regenerates `snake-contribution.svg`, and commits the
updated files to the repository.

To include contribution data from private repositories, configure a repository
secret named `CONTRIBUTIONS_TOKEN` with permission to read those repositories.

## Local generation

```bash
npm install
node fetchData.js
npm test
npm run generate
```
