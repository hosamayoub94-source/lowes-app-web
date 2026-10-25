import assert from 'node:assert/strict';
import { approachOf, isSellerGate, orgTypeOf } from '../src/services/b2bModel.js';

const cases = [
  {
    name: 'independent online skincare store with its own app',
    lead: { lead_type: 'online', channel: 'app', category: 'متجر أونلاين — تجميل' },
    type: 'online_store',
    approach: 'direct_outreach',
    sellerGate: false,
  },
  {
    name: 'multi-seller marketplace',
    lead: { lead_type: 'online', channel: 'marketplace', category: 'منصة متعددة البائعين' },
    type: 'marketplace',
    approach: 'account_opening',
    sellerGate: true,
  },
  {
    name: 'quick commerce platform',
    lead: { lead_type: 'online', channel: 'app', category: 'منصة توصيل سريع' },
    type: 'quick_commerce',
    approach: 'account_opening',
    sellerGate: true,
  },
  {
    name: 'online pharmacy storefront (not a marketplace by default)',
    lead: { lead_type: 'online', channel: 'website', category: 'صيدلية أونلاين' },
    type: 'online_store',
    approach: 'direct_outreach',
    sellerGate: false,
  },
];

for (const c of cases) {
  assert.equal(orgTypeOf(c.lead), c.type, c.name + ': org type');
  assert.equal(approachOf(c.lead), c.approach, c.name + ': approach');
  assert.equal(isSellerGate(c.lead), c.sellerGate, c.name + ': seller gate');
}

console.log(`B2B marketplace classification: ${cases.length} cases passed`);
