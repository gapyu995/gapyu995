const fs = require('fs');

const CONTRIBUTION_LEVEL_POINTS = Object.freeze({
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
});

const CONTRIBUTION_COLOR_POINTS = Object.freeze({
  // GitHub light contribution palette.
  '#9be9a8': 1,
  '#40c463': 2,
  '#30a14e': 3,
  '#216e39': 4,
  // GitHub dark contribution palette.
  '#0e4429': 1,
  '#006d32': 2,
  '#26a641': 3,
  '#39d353': 4,
});

function contributionPointsForDay(day) {
  if (Number(day.contributionCount) <= 0) return 0;

  const levelPoints = CONTRIBUTION_LEVEL_POINTS[day.contributionLevel];
  if (levelPoints > 0) return levelPoints;

  const colorPoints = CONTRIBUTION_COLOR_POINTS[String(day.color).toLowerCase()];
  return colorPoints || 1;
}

function loadContributionData(filePath = 'contributions.json') {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const data = raw.data || raw;
  const weeks = data.user.contributionsCollection.contributionCalendar.weeks;
  const totalContributions = Number(
    data.user.contributionsCollection.contributionCalendar.totalContributions,
  ) || 0;
  const rows = 7;
  const sourceCols = weeks.length;
  const cols = sourceCols % 2 === 0 ? sourceCols : sourceCols + 1;
  const colorMap = Array.from({ length: rows }, () => Array(cols).fill('#161b22'));
  const contributionSet = new Set();
  const contributionWeights = new Map();
  const contributionLevels = new Map();
  const contributionCounts = new Map();

  weeks.forEach((week, col) => {
    week.contributionDays.forEach((day, row) => {
      if (row >= rows) return;
      const key = `${row},${col}`;
      colorMap[row][col] = day.color || '#39d353';
      if (Number(day.contributionCount) <= 0) return;

      contributionSet.add(key);
      contributionWeights.set(key, contributionPointsForDay(day));
      contributionLevels.set(key, day.contributionLevel || null);
      contributionCounts.set(key, Number(day.contributionCount));
    });
  });

  return {
    rows,
    cols,
    sourceCols,
    colorMap,
    contributionSet,
    contributionWeights,
    contributionLevels,
    contributionCounts,
    totalContributions,
    weeks,
  };
}

module.exports = {
  CONTRIBUTION_LEVEL_POINTS,
  contributionPointsForDay,
  loadContributionData,
};
