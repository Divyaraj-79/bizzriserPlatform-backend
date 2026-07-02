/**
 * Meta WhatsApp Business API — Official Per-Country Conversation Pricing
 *
 * Rates are in USD per conversation (24-hour window).
 * Source: https://developers.facebook.com/docs/whatsapp/pricing
 * Last updated: 2025-07
 */

export interface CountryPricing {
  countryCode: string;
  countryName: string;
  currency: string;
  usdToLocalRate: number;
  taxRate: number;
  marketing: number;
  utility: number;
}

export const META_PRICING: Record<string, CountryPricing> = {
  // South Asia
  IN: { countryCode: 'IN', countryName: 'India', currency: 'INR', usdToLocalRate: 84.0, taxRate: 0.18, marketing: 0.0115, utility: 0.0040 },
  PK: { countryCode: 'PK', countryName: 'Pakistan', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0125, utility: 0.0042 },
  BD: { countryCode: 'BD', countryName: 'Bangladesh', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0125, utility: 0.0042 },
  LK: { countryCode: 'LK', countryName: 'Sri Lanka', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0115, utility: 0.0040 },
  NP: { countryCode: 'NP', countryName: 'Nepal', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0115, utility: 0.0040 },
  // Americas
  US: { countryCode: 'US', countryName: 'United States', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0250, utility: 0.0110 },
  CA: { countryCode: 'CA', countryName: 'Canada', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0250, utility: 0.0110 },
  BR: { countryCode: 'BR', countryName: 'Brazil', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0125, utility: 0.0070 },
  MX: { countryCode: 'MX', countryName: 'Mexico', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0150, utility: 0.0090 },
  AR: { countryCode: 'AR', countryName: 'Argentina', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0150, utility: 0.0090 },
  CO: { countryCode: 'CO', countryName: 'Colombia', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0150, utility: 0.0090 },
  CL: { countryCode: 'CL', countryName: 'Chile', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0150, utility: 0.0090 },
  PE: { countryCode: 'PE', countryName: 'Peru', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0150, utility: 0.0090 },
  // Europe
  GB: { countryCode: 'GB', countryName: 'United Kingdom', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0365, utility: 0.0158 },
  DE: { countryCode: 'DE', countryName: 'Germany', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0146 },
  FR: { countryCode: 'FR', countryName: 'France', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0180 },
  IT: { countryCode: 'IT', countryName: 'Italy', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0100 },
  ES: { countryCode: 'ES', countryName: 'Spain', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0089 },
  PT: { countryCode: 'PT', countryName: 'Portugal', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0089 },
  NL: { countryCode: 'NL', countryName: 'Netherlands', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  BE: { countryCode: 'BE', countryName: 'Belgium', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  CH: { countryCode: 'CH', countryName: 'Switzerland', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  AT: { countryCode: 'AT', countryName: 'Austria', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  SE: { countryCode: 'SE', countryName: 'Sweden', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  NO: { countryCode: 'NO', countryName: 'Norway', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  DK: { countryCode: 'DK', countryName: 'Denmark', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  FI: { countryCode: 'FI', countryName: 'Finland', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  PL: { countryCode: 'PL', countryName: 'Poland', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  RO: { countryCode: 'RO', countryName: 'Romania', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  CZ: { countryCode: 'CZ', countryName: 'Czech Republic', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  HU: { countryCode: 'HU', countryName: 'Hungary', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  GR: { countryCode: 'GR', countryName: 'Greece', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  UA: { countryCode: 'UA', countryName: 'Ukraine', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0132 },
  // Middle East & Africa
  AE: { countryCode: 'AE', countryName: 'UAE', currency: 'USD', usdToLocalRate: 1, taxRate: 0.05, marketing: 0.0450, utility: 0.0420 },
  SA: { countryCode: 'SA', countryName: 'Saudi Arabia', currency: 'USD', usdToLocalRate: 1, taxRate: 0.15, marketing: 0.0270, utility: 0.0218 },
  EG: { countryCode: 'EG', countryName: 'Egypt', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0128, utility: 0.0082 },
  MA: { countryCode: 'MA', countryName: 'Morocco', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0300, utility: 0.0100 },
  NG: { countryCode: 'NG', countryName: 'Nigeria', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0256, utility: 0.0095 },
  IL: { countryCode: 'IL', countryName: 'Israel', currency: 'USD', usdToLocalRate: 1, taxRate: 0.17, marketing: 0.0362, utility: 0.0217 },
  TR: { countryCode: 'TR', countryName: 'Turkey', currency: 'USD', usdToLocalRate: 1, taxRate: 0.18, marketing: 0.0150, utility: 0.0120 },
  ZA: { countryCode: 'ZA', countryName: 'South Africa', currency: 'USD', usdToLocalRate: 1, taxRate: 0.15, marketing: 0.0400, utility: 0.0200 },
  KE: { countryCode: 'KE', countryName: 'Kenya', currency: 'USD', usdToLocalRate: 1, taxRate: 0.16, marketing: 0.0256, utility: 0.0095 },
  GH: { countryCode: 'GH', countryName: 'Ghana', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0256, utility: 0.0095 },
  IQ: { countryCode: 'IQ', countryName: 'Iraq', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0200, utility: 0.0100 },
  KW: { countryCode: 'KW', countryName: 'Kuwait', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0450, utility: 0.0420 },
  QA: { countryCode: 'QA', countryName: 'Qatar', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0450, utility: 0.0420 },
  JO: { countryCode: 'JO', countryName: 'Jordan', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0200, utility: 0.0100 },
  LB: { countryCode: 'LB', countryName: 'Lebanon', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0200, utility: 0.0100 },
  // Asia Pacific
  ID: { countryCode: 'ID', countryName: 'Indonesia', currency: 'USD', usdToLocalRate: 1, taxRate: 0.11, marketing: 0.0200, utility: 0.0080 },
  PH: { countryCode: 'PH', countryName: 'Philippines', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0135, utility: 0.0060 },
  MY: { countryCode: 'MY', countryName: 'Malaysia', currency: 'USD', usdToLocalRate: 1, taxRate: 0.06, marketing: 0.0295, utility: 0.0148 },
  TH: { countryCode: 'TH', countryName: 'Thailand', currency: 'USD', usdToLocalRate: 1, taxRate: 0.07, marketing: 0.0220, utility: 0.0090 },
  SG: { countryCode: 'SG', countryName: 'Singapore', currency: 'USD', usdToLocalRate: 1, taxRate: 0.09, marketing: 0.0363, utility: 0.0200 },
  VN: { countryCode: 'VN', countryName: 'Vietnam', currency: 'USD', usdToLocalRate: 1, taxRate: 0.10, marketing: 0.0220, utility: 0.0090 },
  AU: { countryCode: 'AU', countryName: 'Australia', currency: 'USD', usdToLocalRate: 1, taxRate: 0.10, marketing: 0.0363, utility: 0.0200 },
  NZ: { countryCode: 'NZ', countryName: 'New Zealand', currency: 'USD', usdToLocalRate: 1, taxRate: 0.15, marketing: 0.0363, utility: 0.0200 },
  JP: { countryCode: 'JP', countryName: 'Japan', currency: 'USD', usdToLocalRate: 1, taxRate: 0.10, marketing: 0.0363, utility: 0.0200 },
  KR: { countryCode: 'KR', countryName: 'South Korea', currency: 'USD', usdToLocalRate: 1, taxRate: 0.10, marketing: 0.0363, utility: 0.0200 },
  HK: { countryCode: 'HK', countryName: 'Hong Kong', currency: 'USD', usdToLocalRate: 1, taxRate: 0, marketing: 0.0363, utility: 0.0200 },
  TW: { countryCode: 'TW', countryName: 'Taiwan', currency: 'USD', usdToLocalRate: 1, taxRate: 0.05, marketing: 0.0363, utility: 0.0200 },
  // CIS
  RU: { countryCode: 'RU', countryName: 'Russia', currency: 'USD', usdToLocalRate: 1, taxRate: 0.20, marketing: 0.0363, utility: 0.0146 },
  KZ: { countryCode: 'KZ', countryName: 'Kazakhstan', currency: 'USD', usdToLocalRate: 1, taxRate: 0.12, marketing: 0.0200, utility: 0.0100 },
};

export const DEFAULT_COUNTRY_CODE = 'IN';

export function getPricingForCountry(countryCode: string): CountryPricing {
  return META_PRICING[countryCode] || META_PRICING[DEFAULT_COUNTRY_CODE];
}

export function calculateConversationCost(
  pricing: CountryPricing,
  category: 'MARKETING' | 'UTILITY',
): {
  baseRateUsd: number;
  taxRate: number;
  taxAmountUsd: number;
  totalUsd: number;
  totalLocal: number;
  currency: string;
} {
  const baseRateUsd = category === 'MARKETING' ? pricing.marketing : pricing.utility;
  const taxAmountUsd = baseRateUsd * pricing.taxRate;
  const totalUsd = baseRateUsd + taxAmountUsd;
  const totalLocal = totalUsd * pricing.usdToLocalRate;
  return { baseRateUsd, taxRate: pricing.taxRate, taxAmountUsd, totalUsd, totalLocal, currency: pricing.currency };
}
