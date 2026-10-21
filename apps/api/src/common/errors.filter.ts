import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@techmunda/database';
import { ProviderError, scrubSecrets } from '@techmunda/core';
import type { Request, Response } from 'express';

/** Standard error envelope: { error: { code, message, details?, requestId } } — never leaks stack traces. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as any;
      if (typeof r === 'string') message = r;
      else {
        message = Array.isArray(r.message) ? r.message.join('; ') : r.message ?? exception.message;
        code = r.code ?? statusCode(status);
        details = r.details;
      }
      if (!code || code === 'INTERNAL_ERROR') code = statusCode(status);
    } else if (typeof (exception as any)?.status === 'number' && (exception as any).status >= 400 && (exception as any).status < 500 && (exception as any).type) {
      // body-parser errors (payload too large, malformed JSON, …)
      status = (exception as any).status;
      code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
      message = status === 413 ? 'Request body is too large' : 'Malformed request body';
    } else if (exception instanceof ProviderError) {
      status = exception.code === 'NOT_CONFIGURED' ? 503 : exception.code === 'RATE_LIMITED' ? 429 : 502;
      code = exception.code === 'NOT_CONFIGURED' ? 'AI_NOT_CONFIGURED' : 'AI_PROVIDER_ERROR';
      message = exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        message = 'A record with these unique values already exists';
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Record not found';
      } else this.logger.error(scrubSecrets(exception.message));
    } else {
      this.logger.error(scrubSecrets(exception instanceof Error ? `${exception.message}\n${exception.stack ?? ''}` : String(exception)));
    }

    res.status(status).json({ error: { code, message, details, requestId: (req as any).id ?? res.getHeader('x-request-id') } });
  }
}

function statusCode(status: number): string {
  return (
    { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 422: 'UNPROCESSABLE', 429: 'RATE_LIMITED', 503: 'UNAVAILABLE' } as Record<number, string>
  )[status] ?? 'ERROR';
}
