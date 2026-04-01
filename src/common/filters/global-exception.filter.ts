import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res['message'] as string) || message;
        error = (res['error'] as string) || error;
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = this.mapPrismaError(exception);
      message = this.getPrismaErrorMessage(exception);
      error = 'DatabaseError';
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data provided';
      error = 'ValidationError';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const isServerError = status >= 500;
    if (isServerError) {
      const prismaCode = (exception as any)?.code ? ` [Code: ${(exception as any).code}]` : '';
      this.logger.error(
        `[${request.method}] ${request.url} - ${status} - ${message}${prismaCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} - ${status} - ${message}`);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private mapPrismaError(error: Prisma.PrismaClientKnownRequestError): number {
    switch (error.code) {
      case 'P2002':
        return HttpStatus.CONFLICT;
      case 'P2025':
        return HttpStatus.NOT_FOUND;
      case 'P2003':
        return HttpStatus.BAD_REQUEST;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  private getPrismaErrorMessage(error: Prisma.PrismaClientKnownRequestError): string {
    switch (error.code) {
      case 'P2002': {
        const fields = (error.meta?.['target'] as string[])?.join(', ');
        return `A record with this ${fields ?? 'field'} already exists`;
      }
      case 'P2025':
        return 'Record not found';
      case 'P2003':
        return 'Referenced record not found';
      default:
        return 'Database operation failed';
    }
  }
}
