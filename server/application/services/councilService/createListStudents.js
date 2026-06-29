import { listPublicStudents } from "../../../domain/council/state.js";

export const createListStudents = ({ stateStore }) => async () => {
  const state = await stateStore.read();
  return { students: listPublicStudents(state) };
};
