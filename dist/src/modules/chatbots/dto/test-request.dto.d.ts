export declare enum HttpMethod {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    PATCH = "PATCH",
    DELETE = "DELETE"
}
export declare class KeyValuePairDto {
    key: string;
    value: string;
}
export declare class TestRequestDto {
    method: HttpMethod;
    url: string;
    queryParams?: KeyValuePairDto[];
    headers?: KeyValuePairDto[];
    body?: any;
}
