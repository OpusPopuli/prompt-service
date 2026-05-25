import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global exception filter.
 *
 * Contract: every error response MUST keep the NestJS default shape
 * `{ statusCode, message, error }`. The public `@opuspopuli/prompt-client`
 * and node code parses error bodies against those keys. Changing the shape
 * is a breaking change for currently-deployed clients (issue #58).
 *
 * Behavior:
 *   - HttpException → pass the existing body through unchanged. NestJS's
 *     ValidationPipe and the auth guards already emit the canonical shape;
 *     don't second-guess them.
 *   - Anything else (Prisma, unexpected JS errors) → log the raw error
 *     server-side and return a masked 500 with the same three-key shape.
 *     Never let a Prisma error message, stack trace, connection string,
 *     or other internal detail reach the wire.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const normalized = this.normalizeHttpExceptionBody(
        body,
        status,
        exception,
      );
      response.status(status).json(normalized);
      return;
    }

    this.logger.error(
      {
        event: 'unhandled_exception',
        method: request.method,
        url: request.url,
        error:
          exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      },
      'Unhandled exception — returning masked 500',
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }

  /**
   * NestJS's HttpException.getResponse() returns either a string or an object.
   * Normalize to the canonical `{ statusCode, message, error }` shape.
   * If the exception already emits the shape (ValidationPipe, guards, manual
   * BadRequestException with a string), preserve it verbatim.
   */
  private normalizeHttpExceptionBody(
    body: unknown,
    status: number,
    exception: HttpException,
  ): Record<string, unknown> {
    if (typeof body === 'string') {
      return {
        statusCode: status,
        message: body,
        error: exception.name.replace(/Exception$/, ''),
      };
    }
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      return {
        statusCode: obj.statusCode ?? status,
        message: obj.message ?? exception.message,
        error: obj.error ?? exception.name.replace(/Exception$/, ''),
        ...obj,
      };
    }
    return {
      statusCode: status,
      message: exception.message,
      error: exception.name.replace(/Exception$/, ''),
    };
  }
}
