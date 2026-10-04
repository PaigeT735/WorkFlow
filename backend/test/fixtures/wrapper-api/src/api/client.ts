export const api = {
  post(path: string) {
    return fetch(path, { method: "POST" });
  },
};
