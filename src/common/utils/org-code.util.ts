export function generateOrgCode(orgName: string): string {
  if (!orgName || orgName.trim().length === 0) {
    orgName = 'B';
  }
  const firstLetter = orgName.trim()[0].toUpperCase();
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const rand = String(Math.floor(10 + Math.random() * 90)); // 10–99
  return `BZ${firstLetter}${dd}${mm}${yy}${rand}`;
}
