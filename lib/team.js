// Shared internal team roster. Edit this list to add/remove people — used by
// Invoice Maker's "Your Name" autocomplete (matches as you type, case-insensitive,
// and fills in PAN + email).
export const TEAM = [
  { name: "Loshan Parajuli", pan: "601234567", email: "loshan@fromsilicon.com", sub: "on behalf of fromSilicon" },
  { name: "Team Member 2", pan: "600000002", email: "" },
  { name: "Team Member 3", pan: "600000003", email: "" },
];

export function matchTeamMember(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  const matches = TEAM.filter((m) => m.name.toLowerCase().startsWith(q));
  return matches.length === 1 ? matches[0] : null;
}
