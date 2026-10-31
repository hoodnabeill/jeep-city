import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

/** An error the user may see. `message` is plain Arabic; `code` is for the client's logic only. */
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} غير موجود.`);

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof AppError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return reply.status(422).send({
      error: {
        code: "invalid_input",
        message: "بعض البيانات ناقصة أو غير صحيحة. راجع الحقول المعلَّمة.",
        details: err.issues.map((i) => ({ path: i.path.join("."), problem: i.message })),
      },
    });
  }
  const fe = err as FastifyError;
  if (fe.statusCode === 429) {
    return reply.status(429).send({ error: { code: "too_many_attempts", message: "محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى." } });
  }
  if (fe.statusCode && fe.statusCode < 500) {
    return reply.status(fe.statusCode).send({ error: { code: fe.code ?? "bad_request", message: "الطلب غير صحيح." } });
  }
  req.log.error(err);
  return reply.status(500).send({ error: { code: "server_error", message: "حدث خطأ في الخادم. لم يُحفظ أي تغيير. حاول مرة أخرى." } });
}
