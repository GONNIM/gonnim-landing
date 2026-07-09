export type ContactState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldError?: string | null;
};

export const INITIAL_STATE: ContactState = {
  status: "idle",
  message: "",
  fieldError: null,
};
