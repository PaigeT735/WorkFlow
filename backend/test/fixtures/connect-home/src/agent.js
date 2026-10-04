const requests = {
  get: (url) => url,
};

const Articles = {
  all: () => requests.get("/articles"),
  feed: () => requests.get("/articles/feed"),
};

export default { Articles };
