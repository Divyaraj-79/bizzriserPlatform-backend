import { IsString, IsNotEmpty, IsArray, IsOptional, IsEnum } from 'class-validator';

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE'
}

export class KeyValuePairDto {
  @IsString()
  key: string;

  @IsString()
  value: string;
}

export class TestRequestDto {
  @IsEnum(HttpMethod)
  method: HttpMethod;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsArray()
  @IsOptional()
  queryParams?: KeyValuePairDto[];

  @IsArray()
  @IsOptional()
  headers?: KeyValuePairDto[];

  @IsOptional()
  body?: any;
}
