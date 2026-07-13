import { Test, TestingModule } from '@nestjs/testing';
import { OfferCodesController } from './offer-codes.controller';

describe('OfferCodesController', () => {
  let controller: OfferCodesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OfferCodesController],
    }).compile();

    controller = module.get<OfferCodesController>(OfferCodesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
