import type { FastifyReply, FastifyRequest } from 'fastify';

/** preHandler that rejects unauthenticated requests. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.currentUser) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
}

/** preHandler that requires an admin user. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.currentUser) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  if (!req.currentUser.isAdmin) {
    await reply.code(403).send({ error: 'forbidden' });
  }
}
