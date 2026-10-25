import assert from 'node:assert/strict';
import { approachOf, isPersistableStage, isSellerGate, orgTypeOf, stageOf } from '../src/services/b2bModel.js';

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

const persistedLead = { lead_type: 'online', channel: 'marketplace', category: 'منصة', account_status: 'pending_approval', status: 'contacted' };
assert.equal(stageOf(persistedLead), 'pending_approval', 'persisted account_status must take precedence over derived legacy status');
assert.equal(isPersistableStage('pending_approval'), true, 'all market-entry stages should be persistable');
assert.equal(isPersistableStage('not_a_stage'), false, 'unknown stages must be rejected');

console.log(`B2B marketplace classification: ${cases.length} cases + persisted-stage checks passed`);
