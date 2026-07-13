import { Test, TestingModule } from '@nestjs/testing';
import { OfferCodesService } from './offer-codes.service';

describe('OfferCodesService', () => {
  let service: OfferCodesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OfferCodesService],
    }).compile();

    service = module.get<OfferCodesService>(OfferCodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
