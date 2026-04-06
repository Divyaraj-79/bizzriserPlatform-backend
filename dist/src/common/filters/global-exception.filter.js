"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GlobalExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let GlobalExceptionFilter = GlobalExceptionFilter_1 = class GlobalExceptionFilter {
    logger = new common_1.Logger(GlobalExceptionFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let error = 'InternalServerError';
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
                const res = exceptionResponse;
                message = res['message'] || message;
                error = res['error'] || error;
            }
            else {
                message = exceptionResponse;
            }
        }
        else if (exception instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            status = this.mapPrismaError(exception);
            message = this.getPrismaErrorMessage(exception);
            error = 'DatabaseError';
        }
        else if (exception instanceof client_1.Prisma.PrismaClientValidationError) {
            status = common_1.HttpStatus.BAD_REQUEST;
            message = 'Invalid data provided';
            error = 'ValidationError';
        }
        else if (exception instanceof Error) {
            message = exception.message;
        }
        const isServerError = status >= 500;
        if (isServerError) {
            const prismaCode = exception?.code ? ` [Code: ${exception.code}]` : '';
            this.logger.error(`[${request.method}] ${request.url} - ${status} - ${message}${prismaCode}`, exception instanceof Error ? exception.stack : String(exception));
        }
        else {
            this.logger.warn(`[${request.method}] ${request.url} - ${status} - ${message}`);
        }
        response.status(status).json({
            success: false,
            statusCode: status,
            error,
            message,
            details: exception?.meta || exception?.code ? { code: exception.code, ...(exception.meta || {}) } : undefined,
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }
    mapPrismaError(error) {
        switch (error.code) {
            case 'P2002':
                return common_1.HttpStatus.CONFLICT;
            case 'P2025':
                return common_1.HttpStatus.NOT_FOUND;
            case 'P2003':
                return common_1.HttpStatus.BAD_REQUEST;
            default:
                return common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        }
    }
    getPrismaErrorMessage(error) {
        switch (error.code) {
            case 'P2002': {
                const fields = error.meta?.['target']?.join(', ');
                return `Database constraint violation: duplicate value for ${fields ?? 'field'}`;
            }
            case 'P2025':
                return 'Record not found for update/delete';
            case 'P2003':
                return 'Foreign key constraint failed';
            default:
                return `Database operation failed [Prisma Code: ${error.code}]`;
        }
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = GlobalExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map