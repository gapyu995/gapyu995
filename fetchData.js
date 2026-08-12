// Fetch every non-zero GitHub contribution day, including its official level.

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
require('dotenv').config({ quiet: true });

const username = process.env.GITHUB_USERNAME ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  'gapyu995';
const contributionToken = process.env.CONTRIBUTIONS_TOKEN ||
  process.env.GH_PAT ||
  process.env.GITHUB_TOKEN;

if (!contributionToken) {
  throw new Error(
    'Missing GitHub token. Set CONTRIBUTIONS_TOKEN, GH_PAT, or GITHUB_TOKEN.',
  );
}

const octokit = new Octokit({ auth: contributionToken });

async function getContributions() {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          hasAnyRestrictedContributions
          restrictedContributionsCount
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                color
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql(query, { username });
    const collection = response.user.contributionsCollection;
    const calendar = collection.contributionCalendar;
    const nonzeroDays = calendar.weeks
      .flatMap(week => week.contributionDays)
      .filter(day => Number(day.contributionCount) > 0).length;

    fs.writeFileSync('contributions.json', JSON.stringify(response, null, 2));
    console.log(
      `Fetched ${calendar.totalContributions} contributions across ` +
      `${nonzeroDays} non-empty days for ${username}.`,
    );

    if (collection.restrictedContributionsCount > 0) {
      console.log(
        `Included ${collection.restrictedContributionsCount} restricted contributions.`,
      );
    }

    if (!process.env.CONTRIBUTIONS_TOKEN && !process.env.GH_PAT) {
      console.warn(
        'Using GITHUB_TOKEN. Configure CONTRIBUTIONS_TOKEN with access to the ' +
        'required private repositories if the signed-in GitHub graph shows more.',
      );
    }
  } catch (error) {
    console.error('Failed to fetch contribution data:', error.message);
    process.exitCode = 1;
  }
}

getContributions();
