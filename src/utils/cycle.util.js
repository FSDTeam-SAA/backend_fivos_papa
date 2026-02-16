const DAY_IN_MS = 1000 * 60 * 60 * 24;

const toValidDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const extractSubmissionTimes = (entries = []) =>
  entries
    .map((entry) => toValidDate(entry?.submissionTime))
    .filter(Boolean);

export const getCycleStartDate = (submission, now = new Date()) => {
  if (!submission) {
    return now;
  }

  const combinedSubmissionTimes = [
    ...extractSubmissionTimes(submission.participatedTMCTargets),
    ...extractSubmissionTimes(submission.participatedARVTargets),
  ].sort((a, b) => a.getTime() - b.getTime());

  const totalSubmissions = combinedSubmissionTimes.length;
  const completedChallengesRaw = Number(submission.completedChallenges) || 0;
  const completedChallenges = Math.max(
    0,
    Math.min(Math.floor(completedChallengesRaw), totalSubmissions),
  );

  if (completedChallenges > 0) {
    const cycleStartIndex = totalSubmissions - completedChallenges;
    return (
      combinedSubmissionTimes[cycleStartIndex] ||
      toValidDate(submission.lastChallengeDate) ||
      toValidDate(submission.createdAt) ||
      now
    );
  }

  return (
    toValidDate(submission.lastChallengeDate) ||
    toValidDate(submission.createdAt) ||
    now
  );
};

export const getCycleStats = (submission, now = new Date()) => {
  const cycleStartDate = getCycleStartDate(submission, now);
  const gamesCompleted = Math.max(
    0,
    Number(submission?.completedChallenges || 0),
  );
  const daysInCycle = Math.max(
    0,
    Math.floor((now.getTime() - cycleStartDate.getTime()) / DAY_IN_MS),
  );

  return {
    gamesCompleted,
    daysInCycle,
    cycleStartDate,
  };
};
