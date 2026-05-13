const fs = require("fs");

const README_PATH = "README.md";
const USERNAME = process.env.GITHUB_USERNAME || "tikeysus";
const TIME_ZONE = process.env.TIME_ZONE || "America/Toronto";
const COMMIT_LIMIT = Number(process.env.COMMIT_LIMIT || 100);

const START_MARKER = "<!-- TODAY:START -->";
const END_MARKER = "<!-- TODAY:END -->";

function dateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function repoLink(repoName) {
  return `[${repoName}](https://github.com/${repoName})`;
}

function commitLink(commit) {
  const message = commit.commit.message.split("\n")[0];

  return `[${message}](${commit.html_url})`;
}

async function fetchTodayCommits() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${USERNAME}-readme-updater`,
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const query = encodeURIComponent(`author:${USERNAME} author-date:${todayKey()}`);
  const response = await fetch(`https://api.github.com/search/commits?q=${query}&sort=author-date&order=desc&per_page=${COMMIT_LIMIT}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

function buildMarkdown(commits) {
  const latestCommitsByRepo = new Map();

  for (const commit of commits) {
    const repoName = commit.repository.full_name;

    if (!latestCommitsByRepo.has(repoName)) {
      latestCommitsByRepo.set(repoName, commit);
    }
  }

  const items = Array.from(latestCommitsByRepo.entries())
    .slice(0, 6)
    .map(([repoName, commit]) => `${repoLink(repoName)} - ${commitLink(commit)}`);

  if (items.length === 0) {
    return `- No public commits yet today.`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function updateReadme(markdown) {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);

  if (start === -1 || end === -1 || start > end) {
    throw new Error(`Could not find ${START_MARKER} and ${END_MARKER} in ${README_PATH}`);
  }

  const before = readme.slice(0, start + START_MARKER.length);
  const after = readme.slice(end);
  fs.writeFileSync(README_PATH, `${before}\n${markdown}\n${after}`);
}

async function main() {
  const commits = await fetchTodayCommits();
  updateReadme(buildMarkdown(commits));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
