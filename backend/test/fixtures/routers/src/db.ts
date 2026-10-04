const prisma = {
  user: {
    create(input: { data: { name: string } }) {
      return input;
    },
  },
};

export default prisma;
