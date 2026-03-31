export declare const appConfig: (() => {
    nodeEnv: string;
    port: number;
    apiPrefix: string;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    nodeEnv: string;
    port: number;
    apiPrefix: string;
}>;
export declare const databaseConfig: (() => {
    url: string | undefined;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    url: string | undefined;
}>;
export declare const redisConfig: (() => {
    host: string;
    port: number;
    password: string | undefined;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    host: string;
    port: number;
    password: string | undefined;
}>;
export declare const jwtConfig: (() => {
    secret: string | undefined;
    accessExpiresIn: string;
    refreshSecret: string | undefined;
    refreshExpiresIn: string;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    secret: string | undefined;
    accessExpiresIn: string;
    refreshSecret: string | undefined;
    refreshExpiresIn: string;
}>;
export declare const whatsappConfig: (() => {
    apiVersion: string;
    graphBaseUrl: string;
    accessToken: string | undefined;
    phoneNumberId: string | undefined;
    businessAccountId: string | undefined;
    verifyToken: string | undefined;
    appSecret: string | undefined;
    appId: string | undefined;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    apiVersion: string;
    graphBaseUrl: string;
    accessToken: string | undefined;
    phoneNumberId: string | undefined;
    businessAccountId: string | undefined;
    verifyToken: string | undefined;
    appSecret: string | undefined;
    appId: string | undefined;
}>;
export declare const encryptionConfig: (() => {
    key: string | undefined;
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    key: string | undefined;
}>;
export declare const corsConfig: (() => {
    origins: string[];
}) & import("@nestjs/config").ConfigFactoryKeyHost<{
    origins: string[];
}>;
