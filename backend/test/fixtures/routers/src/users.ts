import prisma from "./db";

export async function createUser(name: string) {
  return prisma.user.create({ data: { name } });
}
