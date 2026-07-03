import path from "node:path";

import { initialCouncilState } from "../../domain/council/state.js";
import { readJsonFile } from "./atomicFile.js";

export const loadLegacyCouncilState = async (dataDir) => {
  const [threads, students, tags, profileRequests, notificationEmails] = await Promise.all([
    readJsonFile(path.join(dataDir, "threads.json"), initialCouncilState.threads),
    readJsonFile(path.join(dataDir, "students.json"), initialCouncilState.students),
    readJsonFile(path.join(dataDir, "tags.json"), initialCouncilState.tags),
    readJsonFile(path.join(dataDir, "profile-requests.json"), initialCouncilState.profileRequests),
    readJsonFile(path.join(dataDir, "notification-emails.json"), initialCouncilState.notificationEmails),
  ]);

  return {
    ...initialCouncilState,
    notificationEmails: Array.isArray(notificationEmails) ? notificationEmails : [],
    profileRequests: Array.isArray(profileRequests) ? profileRequests : [],
    students: students && typeof students === "object" ? students : {},
    tags: Array.isArray(tags) ? tags : [],
    threads: Array.isArray(threads) ? threads : [],
  };
};
