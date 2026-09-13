/**
 * scoring.js — turns an application's structured fields into a 0-100
 * "auto score" that ranks candidates for a job. This is a starting
 * suggestion only: admins can override it per-application (see
 * server/routes/adminApplications.js).
 *
 * Weighting (100 total):
 *   - Education level   -> up to 30
 *   - Years of experience -> up to 30 (capped at 7.5+ years)
 *   - Keyword match against the job's listed keywords, matched against
 *     the applicant's cover message -> up to 40
 */

const EDUCATION_POINTS = {
  high_school: 10,
  diploma: 15,
  bachelors: 20,
  masters: 25,
  phd: 30,
};

function educationScore(education) {
  return EDUCATION_POINTS[education] || 0;
}

function experienceScore(years) {
  const n = Number(years) || 0;
  return Math.max(0, Math.min(30, n * 4));
}

function keywordScore(coverMessage, keywords) {
  if (!keywords || !keywords.length) return 0;
  const text = (coverMessage || '').toLowerCase();
  const hits = keywords.filter((kw) => text.includes(String(kw).toLowerCase()));
  return Math.round((hits.length / keywords.length) * 40);
}

function computeAutoScore({ education, yearsExperience, coverMessage }, jobKeywords) {
  const total =
    educationScore(education) +
    experienceScore(yearsExperience) +
    keywordScore(coverMessage, jobKeywords);
  return Math.max(0, Math.min(100, Math.round(total)));
}

const EDUCATION_LEVELS = Object.keys(EDUCATION_POINTS);

module.exports = { computeAutoScore, EDUCATION_LEVELS };
