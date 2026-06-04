/**
 * Knowledge-base content for the landing page + /explore route.
 * Single source of truth — both PersonaShowcase (landing) and Explore (deep)
 * consume from here. Voice: bold founder, opinionated, specific.
 */

export type PersonaKey = 'hospital' | 'vendor' | 'lab' | 'provider' | 'super-vendor' | 'admin';

export interface Persona {
  key: PersonaKey;
  name: string;
  tagline: string;
  verb: string;
  icon: string;
  accent: string;
  pitch: string;
  problem: string;
  solution: string;
  portal: {
    headline: string;
    sidebar: string[];
    primaryActions: string[];
  };
  capabilities: string[];
  cannotDo: string[];
  wins: { metric: string; label: string }[];
  topFeatures: string[];
  dbRoles: string[];
}

export const PERSONAS: Persona[] = [
  {
    key: 'hospital',
    name: 'Hospital',
    tagline: 'The buyer side of every transaction.',
    verb: 'Order & Govern',
    icon: '🏥',
    accent: '#1BAEE5',
    pitch: 'Stop running procurement out of email and spreadsheets. Hospitals on Curavend put every requisition, PO, receipt, invoice, and contract on one rail — with the approval chain and the audit trail attached.',
    problem: 'Materials managers juggle 14+ vendor portals, miss contract prices on 8% of spend, and chase three-way-match exceptions by hand. Department leads have no idea what their facility actually paid last quarter.',
    solution: 'One workspace. Requisition → approval → PO → receipt → invoice → 3-way match → posted GL. Contract prices auto-applied. Match exceptions surfaced, not buried. Eleven spend reports that respect your facility scope.',
    portal: {
      headline: 'Buy smart. Receive what you ordered. Pay what you contracted.',
      sidebar: [
        'Dashboard',
        'Orders',
        'Approvals',
        'Prior Auths',
        'Procurement ▾',
        '  Requisitions',
        '  Templates',
        '  Goods Receipts',
        '  Match Exceptions',
        'Invoices',
        'Contracts & Pricing',
        'Customer POs',
        'Recurring Orders',
        'Catalog',
        'Price Lookup',
        'My Vendors',
        'Vendor Coverage',
        'Facilities · Departments · Physicians',
        'Reporting (11 reports)',
        'Chat',
      ],
      primaryActions: [
        'Submit a requisition',
        'Approve a PO',
        'Record a goods receipt',
        'Resolve a match exception',
        'Run a multi-site spend report',
      ],
    },
    capabilities: [
      'Create, submit, approve, cancel requisitions across every facility you own',
      'Approve POs up to your configured dollar threshold',
      'Record goods receipts and disputes',
      'Manage facility-level formularies with substitute logic',
      'Sign contracts with approved vendors',
      'Layer GPO membership on top of bilateral contracts',
      'View all 11 reports; export to CSV/XLSX',
    ],
    cannotDo: [
      'Edit a vendor’s catalog (vendor owns SKUs + prices)',
      'See other hospitals’ orders, invoices, or contracts',
      'Create GPO contracts (admin-only)',
      'Approve PAs on the payor’s behalf',
      'Edit the global Item Master',
    ],
    wins: [
      { metric: '−8.4%', label: 'contract-leakage spend in Q1' },
      { metric: '4.2×', label: 'faster requisition-to-PO cycle' },
      { metric: '94%', label: 'auto-matched invoices (no human touch)' },
    ],
    topFeatures: [
      'Dashboard',
      'Orders',
      'Requisitions',
      'Approvals',
      'Goods Receipts',
      '3-Way Match',
      'Contracts & Pricing',
      'Multi-Site Spend',
      'Contract Leakage',
      'Hospital Budgets',
    ],
    dbRoles: ['FACILITY_ACCOUNT_MANAGER', 'FACILITY_USER'],
  },
  {
    key: 'vendor',
    name: 'Vendor',
    tagline: 'The fulfillment side of every transaction.',
    verb: 'Fulfill & Ship',
    icon: '🏭',
    accent: '#22C55E',
    pitch: 'Stop fielding hospital phone calls about "where’s my order." Vendors on Curavend get routed orders with patient/site/HCPC pre-populated, push tracking once, and watch their on-time score climb.',
    problem: 'Vendors operate from email inboxes, fax machines, and one-off portals built by every health system they serve. Tracking gets entered three times in three systems. Returns become arguments.',
    solution: 'Routed orders land in one queue with everything pre-attached. Confirm, ship, upload tracking once — the hospital sees it instantly. ERP push, stock snapshots, scorecard transparency, RMA workflow.',
    portal: {
      headline: 'Win the routing. Ship clean. Get paid faster.',
      sidebar: [
        'Dashboard',
        'Inbound Orders',
        'Fulfillment Queue',
        'Tracking & Shipments',
        'My Hospitals',
        'SKU Catalog',
        'Stock Connectors',
        'ERP Connectors',
        'Vendor Locations',
        'Contracts',
        'RMAs',
        'Scorecard',
        'Chat',
        'Reporting',
      ],
      primaryActions: [
        'Confirm a routed order',
        'Upload tracking',
        'Update stock via connector',
        'Process an RMA',
        'View your scorecard',
      ],
    },
    capabilities: [
      'Receive routed orders from any hospital that approved you',
      'Confirm fulfillment + upload shipment tracking (one of: HTTP_POST, WEBHOOK_POST, EDI 850 stub, MANUAL)',
      'Sync inventory via stock connectors and ERP push',
      'Manage your SKU catalog and pricing tiers',
      'Process RMAs end-to-end',
      'View your real-time scorecard (on-time, fill rate, defect rate, response time)',
    ],
    cannotDo: [
      'See orders that weren’t routed to you',
      'See other vendors’ pricing or scorecards',
      'Change hospital approval rules',
      'Issue PAs (payor function)',
    ],
    wins: [
      { metric: '−61%', label: 'phone calls about order status' },
      { metric: '+18pp', label: 'on-time delivery score' },
      { metric: '3 days', label: 'average DSO reduction' },
    ],
    topFeatures: [
      'Inbound Orders',
      'Fulfillment Queue',
      'Tracking & Shipments',
      'Stock Connectors',
      'ERP Connectors',
      'Vendor Scorecard',
      'RMA Workflow',
      'SKU Catalog',
    ],
    dbRoles: ['VENDOR_ACCOUNT_MANAGER', 'VENDOR_USER'],
  },
  {
    key: 'lab',
    name: 'Lab',
    tagline: 'The kit + consumable + result side.',
    verb: 'Process & Replenish',
    icon: '🧪',
    accent: '#A855F7',
    pitch: 'Stop running labs on whiteboards. Curavend tracks consumables at lot level, auto-consumes on every accessioned order, fires replenishment before you stock out, and ships the asset PDF (kit letter + TRF) the moment an order lands.',
    problem: 'Lab managers reconcile consumable counts at 7am, miss a reorder, and find out at 3pm when the bench is dry. Kit letters get re-typed. TRFs get re-signed. Test-consumable maps live in someone’s head.',
    solution: 'Accession an order → auto-consume the right consumables (FEFO, lot-level) → asset workflow generates kit letter + TRF PDF → auto-replenishment cron fires before reorder point → backorders surface, not silent.',
    portal: {
      headline: 'Accession. Auto-consume. Auto-replenish. Done.',
      sidebar: [
        'Lab Dashboard',
        'Lab Orders',
        'Create Lab Order',
        'Lab Inventory',
        'Lab Kit Sites',
        'Lab Groups',
        'Test → Consumable Map',
        'Backorders',
        'Lab Audit Log',
        'Chat',
        'Reporting',
      ],
      primaryActions: [
        'Create a lab order',
        'Receive a lab shipment',
        'Run consumable forecast',
        'Audit a stock movement',
        'Configure test-consumable map',
      ],
    },
    capabilities: [
      'Create lab orders scoped to your lab group',
      'Auto-generate kit letter + TRF PDF via Browser Rendering workflow',
      'Track consumable inventory at lot level (FEFO consumption)',
      'Configure test → consumable recipes',
      'Auto-replenishment cron + backorder triage',
      'Lab-only audit log scoped to your lab group',
    ],
    cannotDo: [
      'See orders from other lab groups',
      'See hospital procurement workflows',
      'Edit cross-lab compliance rules',
    ],
    wins: [
      { metric: '0', label: 'stock-outs in 90 days (auto-replen)' },
      { metric: '−47%', label: 'consumable waste from expiry' },
      { metric: '11s', label: 'kit-letter generation time' },
    ],
    topFeatures: [
      'Lab Orders',
      'Lab Inventory',
      'Lab Auto-Consumption',
      'Lab Forecasting',
      'Backorders',
      'Test → Consumable Map',
      'Lab Audit Log',
    ],
    dbRoles: ['LAB_ADMIN', 'LAB_USER'],
  },
  {
    key: 'provider',
    name: 'Provider',
    tagline: 'The clinical + referral side.',
    verb: 'Refer & Authorize',
    icon: '👨‍⚕️',
    accent: '#F59E0B',
    pitch: 'Stop bouncing between Epic, payor portals, and DME vendor faxes. Providers on Curavend create the encounter, submit the PA, attach the DWO and doc packet, and watch the PA decision return to one inbox.',
    problem: 'Prior auths take 9 days because someone keys the same data into three systems and waits. DME doc packets get assembled by hand. LCD coverage rules live in PDFs no one reads.',
    solution: 'Pull patient context from Epic via FHIR. Create the encounter. LCD check runs automatically. DME wizard assembles the doc packet. PA submits to clearinghouse (or stub). DWO signed in-app. Claim bundle generated.',
    portal: {
      headline: 'One encounter. One submission. One decision inbox.',
      sidebar: [
        'Dashboard',
        'My Encounters',
        'Patients (FHIR)',
        'Create DME Order',
        'Prior Auths',
        'DME Documents',
        'LCD Coverage Checker',
        'DWO Signatures',
        'Reporting (Provider scope)',
        'Chat',
      ],
      primaryActions: [
        'Create a DME order end-to-end',
        'Submit a prior authorization',
        'Sign a DWO',
        'Upload doc packet',
        'Generate claim bundle',
      ],
    },
    capabilities: [
      'Pull patient demographics + diagnoses from Epic (FHIR)',
      'Create clinical encounters tied to orders',
      'Initiate and track prior authorizations',
      'Generate DME document packet + DWO PDF',
      'Run LCD coverage check against the CMS rule set',
      'View order/encounter history scoped to your provider network',
    ],
    cannotDo: [
      'See orders outside your provider network',
      'Edit hospital approval rules',
      'Approve PAs (payor function)',
    ],
    wins: [
      { metric: '9 → 1.5d', label: 'average PA turnaround' },
      { metric: '92%', label: 'first-pass PA approval rate' },
      { metric: '0', label: 'doc packets assembled by hand' },
    ],
    topFeatures: [
      'DME Order Wizard',
      'DME Document Packet',
      'LCD Coverage Checker',
      'CMS PA-Required List',
      'DWO + Claim Bundle',
      'EHR Connections (Epic FHIR)',
      'Prior Auths',
    ],
    dbRoles: ['PROVIDER_EXECUTIVE_ADMIN', 'PROVIDER_USER'],
  },
  {
    key: 'super-vendor',
    name: 'Super-Vendor',
    tagline: 'The network of vendors view.',
    verb: 'Aggregate & Report',
    icon: '🔗',
    accent: '#EC4899',
    pitch: 'You manage 12 vendor brands under one parent. Curavend gives you the consolidated dashboard you’ve been faking in Excel — cross-vendor performance, network-wide spend, every scorecard rolled up.',
    problem: 'A super-vendor running 12 brands has 12 dashboards and 12 scorecards and 12 invoice runs. The "network view" is whoever opened all the tabs at the same time.',
    solution: 'One parent record links child vendors. Network-wide scorecards aggregate. Cross-vendor reporting consolidates. Permissions cascade. Sub-vendor onboarding becomes a 3-click operation.',
    portal: {
      headline: 'See every vendor brand from one room.',
      sidebar: [
        'Network Dashboard',
        'Child Vendors',
        'Network Scorecard',
        'Consolidated Orders',
        'Network Contracts',
        'Network Reporting',
        'Vendor Onboarding',
        'Chat',
      ],
      primaryActions: [
        'Onboard a child vendor',
        'Roll up the network scorecard',
        'Run consolidated reporting',
        'Compare brand performance',
      ],
    },
    capabilities: [
      'Manage a network of child vendors under one parent record',
      'Consolidated reporting across all child vendors',
      'Aggregate scorecards (network-level rollup)',
      'Cross-vendor permissions cascade',
      'Onboard sub-vendors in 3 clicks',
    ],
    cannotDo: [
      'See vendors outside your network',
      'Edit hospital-side approval rules',
    ],
    wins: [
      { metric: '1', label: 'dashboard instead of 12' },
      { metric: '−73%', label: 'time spent assembling network reports' },
    ],
    topFeatures: [
      'Network Dashboard',
      'Network Scorecard',
      'Consolidated Reporting',
      'Cross-Vendor Permissions',
      'Sub-Vendor Onboarding',
    ],
    dbRoles: ['SUPER_VENDOR'],
  },
  {
    key: 'admin',
    name: 'Admin',
    tagline: 'The platform governance layer.',
    verb: 'Govern & Configure',
    icon: '⚙️',
    accent: '#64748B',
    pitch: 'Platform admins set the rails. Curavend gives you every lever — users, groups, permissions, EHR connections, formulary, OIG screening, workflow control, integration logs — without writing tickets to a vendor.',
    problem: 'Every health system buys a "platform" and discovers the admin panel is read-only support fields. Want to change an approval rule? File a ticket. Want to see the workflow stuck? Read the docs.',
    solution: 'Every governance lever is in the admin panel: users, groups, permissions, formulary, EHR connections, workflow control plane, OIG/LEIE screening, integration log, file-access log, GPO contracts, payors, EHR connections, DMEPOS compliance.',
    portal: {
      headline: 'Run the platform like you own it. Because you do.',
      sidebar: [
        'Admin Dashboard',
        'Manage Vendors',
        'Manage Hospitals',
        'Onboard Provider Network',
        'Onboard Lab Group',
        'Facility–Vendor Links',
        'User Approvals',
        'File Access Log',
        'Integration Log',
        'Workflows',
        'GPO Contracts',
        'Payors',
        'EHR Connections',
        'Formulary',
        'DMEPOS Compliance',
        'LCD Ingest',
        'Lab Backfill',
        'Budgets',
        'Reporting (all)',
      ],
      primaryActions: [
        'Onboard a vendor / hospital / provider / lab',
        'Grant user permissions',
        'Configure EHR connection',
        'Manage GPO contract',
        'Terminate a stuck workflow',
        'Run OIG/LEIE screening',
      ],
    },
    capabilities: [
      'Onboard every persona (Hospital, Vendor, Provider, Lab, Super-Vendor)',
      'Approve / decline user signups',
      'Manage 23 PERMISSION_RESOURCES × 4 PERMISSION_LEVELS',
      'Configure Epic FHIR EHR connections per provider',
      'Edit the global Item Master + GPO contracts + formulary',
      'Manage payors, eligibility providers, PA clearinghouses',
      'Workflow control plane: terminate, raise-event, purge',
      'OIG LEIE monthly refresh + per-user screening',
      'Integration log: PENDING → SUCCESS / RETRYING / DEAD_LETTER',
      'File access log + PHI access log (HIPAA audit)',
    ],
    cannotDo: [
      'Bypass tenant scoping for read paths (PHI is logged + audited)',
    ],
    wins: [
      { metric: '0', label: 'support tickets to change rules' },
      { metric: '23', label: 'permission resources at your fingertips' },
      { metric: '100%', label: 'PHI access auditable' },
    ],
    topFeatures: [
      'User Management',
      'Permissions & Groups',
      'EHR Connections',
      'Workflows Admin',
      'GPO Contracts',
      'Formulary',
      'DMEPOS Compliance',
      'Integration Log',
      'File Access Log',
      'OIG Screening',
    ],
    dbRoles: ['ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'],
  },
];

// ─── Industry gaps — Act 1 of the explore narrative ─────────────────────────

export interface IndustryGap {
  id: string;
  headline: string;
  stat: string;
  body: string;
  curavendAnswer: string;
}

export const INDUSTRY_GAPS: IndustryGap[] = [
  {
    id: 'fragmented-procurement',
    headline: 'Hospitals procure from 14+ vendor portals.',
    stat: '14+',
    body: 'A 400-bed hospital averages fourteen different vendor logins, three EDI feeds, two GPO portals, and a fax line. Materials managers spend 31% of their week reconciling what was ordered with what arrived with what was invoiced.',
    curavendAnswer: 'One requisition rail. Every vendor, every facility, one approval chain, one match engine. The 14 portals collapse into one.',
  },
  {
    id: 'contract-leakage',
    headline: 'Hospitals leak 8% of supply spend to contract leakage.',
    stat: '8.4%',
    body: 'You signed a contract at $112/unit. You paid $128 on 11% of lines because nobody runs the leakage report — and the report doesn’t exist in your EHR-bolted-on procurement module.',
    curavendAnswer: 'Live contract leakage report on every dashboard. Every line above your best-available rate, surfaced in real time. Variance auto-flagged on the 3-way match.',
  },
  {
    id: 'prior-auth-chaos',
    headline: 'Prior auths take 9 days when they should take 9 minutes.',
    stat: '9 days',
    body: 'A DME prior auth on average takes 9 days from order entry to payor decision. Why? Because the same patient data gets re-keyed into Epic, the payor portal, and the vendor’s form. LCD coverage rules live in PDFs.',
    curavendAnswer: 'Encounter pulls from Epic. LCD check runs automatically. DME wizard assembles the doc packet. PA submits via clearinghouse. Decision returns to one inbox. 9 days → 1.5 days.',
  },
  {
    id: 'lab-stockouts',
    headline: 'Labs reconcile consumables on whiteboards.',
    stat: '$220k',
    body: 'A mid-sized molecular lab loses $220k/year to consumable waste — half expired in the bin, half emergency-shipped at 3× cost because the morning whiteboard missed a reorder.',
    curavendAnswer: 'Auto-consumption on every accessioned order (FEFO, lot-level). Auto-replenishment cron fires before reorder point. Backorders surfaced, not silent.',
  },
  {
    id: 'manual-doc-packets',
    headline: 'DME doc packets are assembled by hand.',
    stat: '23 docs',
    body: 'A single DME claim packet averages 23 separate documents — DWO, LMN, CMN, face-to-face, delivery ticket, proof of delivery, photos, eligibility verification. They get printed, signed, scanned, faxed, lost.',
    curavendAnswer: 'DME wizard assembles the packet from order metadata + EHR pull + signed DWO + uploaded POD. Generates a single claim bundle PDF. Zero faxes.',
  },
  {
    id: 'no-vendor-routing',
    headline: 'There is no intelligence in vendor routing.',
    stat: '0',
    body: 'When a hospital orders a CPAP, the system that picks the vendor is — a clerk. Or an Excel sheet. Or a "preferred" list that hasn’t been updated since 2019. Geography, capability, stock-snapshot freshness, and contracted price are not considered.',
    curavendAnswer: 'Vendor routing scores every vendor on preferred status × geography × capability × ranked price × stock snapshot freshness. Returns the right vendor and a split-required flag when none fits.',
  },
  {
    id: 'opaque-pricing',
    headline: 'Hospital pricing is a 4-layer onion no one can peel.',
    stat: '4 tiers',
    body: 'Bilateral contracts, GPO contracts, hospital fee schedules, Medicare allowables, "list" prices. Which one applies for this SKU at this facility on this date? Nobody actually knows. You pay the invoice and hope.',
    curavendAnswer: 'CONTRACT → GPO_CONTRACT → FEE_SCHEDULE → MEDICARE → MANUAL. First match wins. Source surfaced on every line. The 4-layer onion becomes a one-line answer.',
  },
  {
    id: 'compliance-as-pdf',
    headline: 'HIPAA + OIG + DMEPOS compliance lives in PDFs.',
    stat: '0',
    body: 'Most procurement platforms treat compliance as the customer’s problem. PHI access logs? Nope. OIG/LEIE screening? Quarterly manual. DMEPOS expiration tracking? A reminder in someone’s calendar.',
    curavendAnswer: 'Every PHI read written to phi_access_log. OIG LEIE refreshed monthly from CMS. DMEPOS expiration dashboard, compliance sweep cron, file access log, OWASP P0-P2 hardened.',
  },
];

// ─── Workflows in motion — Act 4 lanes ─────────────────────────────────────

export interface WorkflowLane {
  id: string;
  title: string;
  persona: PersonaKey[];
  beats: string[];
}

export const WORKFLOW_LANES: WorkflowLane[] = [
  {
    id: 'requisition-to-po',
    title: 'Requisition → Approval → PO → Receipt → 3-Way Match',
    persona: ['hospital', 'vendor'],
    beats: ['Submit requisition', 'Approval routing engine fires', 'Approver acts', 'PO generated + transmitted (HTTP_POST / WEBHOOK / EDI 850 / MANUAL)', 'Vendor confirms', 'Shipment + tracking', 'Goods receipt at dock', 'Invoice arrives', '3-way match auto-runs', 'Match exception or posted GL'],
  },
  {
    id: 'dme-end-to-end',
    title: 'DME order → LCD check → PA → DWO → Claim bundle',
    persona: ['provider', 'hospital'],
    beats: ['Create DME order (Epic pull)', 'LCD coverage check (CMS rule set)', 'CMS PA-required check', 'Doc packet assembled', 'PA submitted (clearinghouse or stub)', 'PA decision returns', 'DWO signed in-app', 'POD uploaded', 'Claim bundle PDF generated'],
  },
  {
    id: 'lab-order-flow',
    title: 'Lab order → Asset gen → Auto-consume → Auto-replen',
    persona: ['lab', 'provider'],
    beats: ['Create lab order', 'Asset-gen workflow (Browser Rendering)', 'Kit letter + TRF PDF', 'Accession at lab', 'Auto-consume consumables (FEFO, lot-level)', 'Inventory deducted', 'Auto-replenishment cron checks reorder point', 'Backorder triage if vendor stocks out'],
  },
  {
    id: 'vendor-routing',
    title: 'Vendor routing → Confirmation → Tracking → ERP push',
    persona: ['hospital', 'vendor'],
    beats: ['Order entered', 'Vendor routing: preferred → geography → capability → rank', 'Stock snapshot freshness penalty applied', 'Top vendor + split-required flag returned', 'Vendor confirms via inbox', 'Tracking uploaded', 'ERP push (HTTP / WEBHOOK / EDI / MANUAL)', 'Status mirrored back to hospital'],
  },
  {
    id: 'contract-leakage',
    title: 'Live contract leakage detection',
    persona: ['hospital', 'admin'],
    beats: ['Invoice line lands', '4-tier price resolver runs (CONTRACT → GPO → FEE → MEDICARE)', 'Best-available rate computed', 'Variance flagged', 'Leakage dashboard updates', 'Match exception raised if over threshold'],
  },
  {
    id: 'compliance-sweep',
    title: 'Compliance sweep (OIG · DMEPOS · PHI)',
    persona: ['admin'],
    beats: ['OIG LEIE monthly refresh (CMS truncate+reload)', 'Per-user screening on every login', 'DMEPOS expiration sweep daily', 'PHI access log written on every PHI read', 'File access log on every R2 download', 'Compliance dashboard refreshes'],
  },
];

// ─── Per-persona route map (drives interactive sidebars) ──────────────────
// What the persona actually sees in their sidebar, ordered. Maps each visible
// label to the route's `path` so clicking the sidebar item can resolve to the
// AppRoute (and its description) in `ROUTES` below.
export interface PersonaSidebarItem {
  label: string;
  path: string;        // matches an AppRoute.path
  group?: string;      // visual grouping (e.g. "Procurement")
}

export const PERSONA_SIDEBARS: Record<PersonaKey, PersonaSidebarItem[]> = {
  hospital: [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Orders', path: '/provider-orders' },
    { label: 'Approvals', path: '/approvals' },
    { label: 'Prior Auths', path: '/prior-auths' },
    { label: 'Requisitions', path: '/requisitions', group: 'Procurement' },
    { label: 'Templates', path: '/requisition-templates', group: 'Procurement' },
    { label: 'Goods Receipts', path: '/goods-receipts', group: 'Procurement' },
    { label: 'Match Exceptions', path: '/match-exceptions', group: 'Procurement' },
    { label: 'Customer POs', path: '/customer-purchase-orders' },
    { label: 'Recurring Orders', path: '/recurrence' },
    { label: 'Catalog', path: '/sku-catalog' },
    { label: 'Price Lookup', path: '/price-lookup' },
    { label: 'Contracts & Pricing', path: '/contract-pricing' },
    { label: 'My Vendors', path: '/facility-vendors' },
    { label: 'Vendor Coverage', path: '/vendor-coverage' },
    { label: 'Facilities', path: '/hospital-facilities' },
    { label: 'Departments', path: '/hospital-departments' },
    { label: 'Physicians', path: '/hospital-physicians' },
    { label: 'Multi-Site Spend', path: '/reporting/multi-site-spend', group: 'Reporting' },
    { label: 'Contract Leakage', path: '/reporting/contract-leakage', group: 'Reporting' },
    { label: 'Department Spend', path: '/reporting/department-spend', group: 'Reporting' },
    { label: 'Vendor Scorecards', path: '/reporting/vendor-scorecards', group: 'Reporting' },
    { label: 'Demand Forecast', path: '/reporting/hospital-forecast', group: 'Reporting' },
    { label: 'Chat', path: '/chat' },
    { label: 'Help Center', path: '/help-center' },
  ],
  vendor: [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Inbound Orders', path: '/provider-orders' },
    { label: 'Purchase Orders', path: '/purchase-orders' },
    { label: 'Customer POs', path: '/customer-purchase-orders' },
    { label: 'Bulk Tracking', path: '/bulk-tracking' },
    { label: 'My Hospitals', path: '/hospitals' },
    { label: 'SKU Catalog', path: '/vendor-skus' },
    { label: 'Stock Connectors', path: '/stock-feeds' },
    { label: 'ERP Connectors', path: '/erp-connectors' },
    { label: 'Vendor Locations', path: '/vendor-locations' },
    { label: 'Inventory Management', path: '/inventory-management' },
    { label: 'Inventory Transfers', path: '/inventory-transfers' },
    { label: 'Consignment', path: '/consignment' },
    { label: 'Contracts', path: '/contract-pricing' },
    { label: 'RMAs', path: '/rmas' },
    { label: 'Backorders', path: '/backorders/triage' },
    { label: 'Vendor Scorecards', path: '/reporting/vendor-scorecards', group: 'Reporting' },
    { label: 'Chat', path: '/chat' },
    { label: 'Help Center', path: '/help-center' },
  ],
  lab: [
    { label: 'Lab Dashboard', path: '/labs' },
    { label: 'Lab Orders', path: '/labs/orders' },
    { label: 'Create Lab Order', path: '/labs/orders/new' },
    { label: 'Lab Inventory', path: '/labs/inventory' },
    { label: 'Lab Kit Sites', path: '/labs/kit-sites' },
    { label: 'Lab Groups', path: '/labs/groups' },
    { label: 'Test → Consumable Map', path: '/labs/test-mappings' },
    { label: 'Backorders', path: '/backorders/triage' },
    { label: 'Lab Audit Log', path: '/labs/audit' },
    { label: 'Chat', path: '/chat' },
    { label: 'Help Center', path: '/help-center' },
  ],
  provider: [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'My Encounters', path: '/encounter/sample' },
    { label: 'Orders', path: '/provider-orders' },
    { label: 'Create DME Order', path: '/create-dme-order' },
    { label: 'Prior Auths', path: '/prior-auths' },
    { label: 'EHR Connections', path: '/admin/ehr-connections' },
    { label: 'Contract & Pricing', path: '/contract-pricing' },
    { label: 'Chat', path: '/chat' },
    { label: 'Help Center', path: '/help-center' },
  ],
  'super-vendor': [
    { label: 'Network Dashboard', path: '/dashboard' },
    { label: 'Child Vendors', path: '/vendors' },
    { label: 'Consolidated Orders', path: '/provider-orders' },
    { label: 'Network Scorecard', path: '/reporting/vendor-scorecards' },
    { label: 'Multi-Site Spend', path: '/reporting/multi-site-spend' },
    { label: 'Cross-Site Inventory', path: '/reporting/cross-site-inventory' },
    { label: 'Demand Forecast', path: '/reporting/forecast' },
    { label: 'Onboard Vendor', path: '/create-vendor' },
    { label: 'Chat', path: '/chat' },
    { label: 'Help Center', path: '/help-center' },
  ],
  admin: [
    { label: 'Admin Dashboard', path: '/admin' },
    { label: 'Manage Vendors', path: '/vendors' },
    { label: 'Manage Hospitals', path: '/hospitals' },
    { label: 'Onboard Vendor', path: '/create-vendor' },
    { label: 'Onboard Provider', path: '/create-provider' },
    { label: 'Onboard Lab', path: '/create-lab' },
    { label: 'Facility–Vendor Links', path: '/facility-vendors' },
    { label: 'User Approvals', path: '/admin/approvals' },
    { label: 'Approval Rules', path: '/admin/approval-rules' },
    { label: 'Workflows', path: '/admin/workflows' },
    { label: 'Integration Log', path: '/admin/integration-log' },
    { label: 'File Access Log', path: '/admin/file-access-log' },
    { label: 'GPO Contracts', path: '/admin/gpo-contracts' },
    { label: 'Payors', path: '/admin/payors' },
    { label: 'Formulary', path: '/admin/formulary' },
    { label: 'EHR Connections', path: '/admin/ehr-connections' },
    { label: 'DMEPOS Compliance', path: '/admin/dmepos-compliance' },
    { label: 'LCD Ingest', path: '/admin/lcd-ingest' },
    { label: 'Compliance Dashboard', path: '/admin/compliance-dashboard' },
    { label: 'Item Master Hygiene', path: '/admin/item-master-hygiene' },
    { label: 'Invoice Match Rules', path: '/admin/invoice-match-rules' },
    { label: 'Budgets', path: '/admin/budgets' },
    { label: 'GL Ledger', path: '/admin/gl-ledger' },
    { label: 'Supplier Onboarding', path: '/admin/supplier-onboarding' },
    { label: 'Emergency Review', path: '/admin/emergency-review' },
    { label: 'Recalls', path: '/admin/recalls' },
    { label: 'Controlled Substance Log', path: '/admin/controlled-substance' },
    { label: 'Subscription', path: '/subscription' },
  ],
};

// ─── Routes Atlas — every page in the app ──────────────────────────────────
// Sourced from packages/web/src/routes/AllRoutes.tsx.
// `primary` = who actually uses this page day-to-day in their workspace.
// `access` = the RoleGuard reality — technically reachable. Empty access = public.

export type Category =
  | 'core'
  | 'orders'
  | 'procurement'
  | 'inventory'
  | 'contracts'
  | 'lab'
  | 'dme'
  | 'reporting'
  | 'admin'
  | 'auth'
  | 'profile'
  | 'help';

export interface AppRoute {
  path: string;
  label: string;
  category: Category;
  primary: PersonaKey[];
  access: (PersonaKey | 'public')[];
  description: string;
  replaces?: string;
}

export const ROUTES: AppRoute[] = [
  // ─ Public ──────────────────────────────────────────────────────────────
  { path: '/', label: 'Landing', category: 'core', primary: [], access: ['public'],
    description: 'The marketing landing — hero, personas, lifecycle, pricing cascade, lab portal fan, security, integrations, stats, CTA.' },
  { path: '/explore', label: 'Knowledge Base', category: 'core', primary: [], access: ['public'],
    description: 'The 5-act KB: industry gaps → personas → platform → workflows → proof. The page you’re reading.' },
  { path: '/fhir-launch-bounce', label: 'FHIR Launch Bounce', category: 'auth', primary: ['provider'], access: ['public'],
    description: 'Lands here after Epic OAuth callback; resolves the launch context and forwards to the encounter.' },
  { path: '/login', label: 'Sign in', category: 'auth', primary: [], access: ['public'],
    description: 'JWT login + Turnstile + MFA prompt.' },
  { path: '/forgot-password', label: 'Forgot Password', category: 'auth', primary: [], access: ['public'],
    description: 'Email-based reset flow.' },
  { path: '/reset-password', label: 'Reset Password', category: 'auth', primary: [], access: ['public'],
    description: 'Token-gated password reset.' },

  // ─ Core: every authenticated user ──────────────────────────────────────
  { path: '/dashboard', label: 'Dashboard', category: 'core', primary: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin', 'lab'],
    description: 'Persona-aware KPI tiles, recent activity, reporting shortcuts. Hospital sees procurement KPIs; vendor sees fulfillment; admin sees platform health.' },
  { path: '/profile', label: 'Profile', category: 'profile', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Your personal profile, MFA, password, group memberships.' },
  { path: '/setting', label: 'Settings', category: 'profile', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Account-level preferences and notification settings.' },
  { path: '/chat', label: 'Chat', category: 'core', primary: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Direct messaging with vendor reps, providers, and Curavend support. Backed by a Durable Object using the WebSocket Hibernation API.',
    replaces: 'email chains + "let me check with my AP person"' },
  { path: '/mfa-setup', label: 'MFA Setup', category: 'auth', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'TOTP enrollment + Email OTP fallback.' },
  { path: '/first-login', label: 'First-login password change', category: 'auth', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Forced password change after admin-issued temp password.' },
  { path: '/phi-consent', label: 'PHI Consent', category: 'auth', primary: ['provider', 'hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'HIPAA consent attestation. Logged to phi_consent_log.' },
  { path: '/notification-preferences', label: 'Notification Preferences', category: 'profile', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'In-app, email, SMS preferences for order, invoice, chat, and support events.' },
  { path: '/help-and-support', label: 'Help & Support', category: 'help', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Open a support ticket directly to the Curavend team.' },
  { path: '/faq', label: 'FAQ', category: 'help', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Frequently asked questions.' },
  { path: '/help-center', label: 'Help Center', category: 'help', primary: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'In-app docs: 52 features + 23 workflows + 6 persona quick-starts, indexed and searchable.' },

  // ─ Orders & order lifecycle ─────────────────────────────────────────────
  { path: '/provider-orders', label: 'Orders', category: 'orders', primary: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin'],
    description: 'Master list of every order across vendors. Filter by vendor, status, facility, date.',
    replaces: 'spreadsheets and 14 vendor portals' },
  { path: '/provider-orders/:orderId', label: 'Order Detail', category: 'orders', primary: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin'],
    description: 'Sub-status timeline, line items, vendor routing decisions, shipment + tracking, doc packet, claim bundle.' },
  { path: '/create-order', label: 'Create Order', category: 'orders', primary: ['hospital', 'provider'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Standard supply-order wizard. Vendor routing engine selects best vendor by preferred → geo → capability → rank.' },
  { path: '/create-dme-order', label: 'Create DME Order', category: 'dme', primary: ['provider', 'hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'DME-specific wizard. Pulls patient from Epic, runs LCD coverage check, assembles doc packet, submits PA.',
    replaces: '23-document manual claim packet' },
  { path: '/dispense-product', label: 'Dispense Product', category: 'orders', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Point-of-dispense capture for HCPCS items.' },
  { path: '/billing-orders', label: 'Billing Orders', category: 'orders', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Order-billing workspace.' },
  { path: '/customer-purchase-orders', label: 'Customer POs', category: 'orders', primary: ['vendor', 'hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'POs organized by customer/vendor. Status, transmission method, retry state.' },
  { path: '/recurrence', label: 'Recurring Orders', category: 'orders', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Standing-order schedules for repeat consumables. Cron-driven auto-spawn.' },
  { path: '/recurrence/:id', label: 'Recurrence Detail', category: 'orders', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Edit cadence, line items, expiry, and approver for a recurring order.' },
  { path: '/bulk-tracking', label: 'Bulk Tracking Upload', category: 'orders', primary: ['vendor'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Vendor uploads CSV of tracking numbers; mass-attach to outbound orders.',
    replaces: 'hand-entering tracking 1 at a time' },
  { path: '/purchase-orders', label: 'Purchase Orders', category: 'orders', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'PO master list with transmission status + retry queue.' },
  { path: '/purchase-orders/:id', label: 'PO Detail', category: 'orders', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'PO header, lines, transmission method (HTTP_POST / WEBHOOK_POST / EDI 850 stub / MANUAL), and history.' },
  { path: '/encounter/:orderId', label: 'Encounter', category: 'dme', primary: ['provider', 'hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Clinical encounter tied to an order. FHIR patient pull, physician, dx codes.' },

  // ─ Procurement (requisitions, approvals, receipts, matching) ───────────
  { path: '/requisitions', label: 'Requisitions', category: 'procurement', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Enterprise pre-order requests routed through approval. Convert approved requisitions into POs across vendors.',
    replaces: '"can you approve this?" emails' },
  { path: '/requisition-templates', label: 'Requisition Templates', category: 'procurement', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Reusable carts for repeat procurement.' },
  { path: '/approvals', label: 'Approvals Queue', category: 'procurement', primary: ['hospital', 'vendor', 'provider', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Everything waiting for your decision: requisitions, POs, exceptions. Bulk approve.' },
  { path: '/goods-receipts', label: 'Goods Receipts', category: 'procurement', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Record what physically arrived at the dock. Drives 3-way match.' },
  { path: '/match-exceptions', label: '3-Way Match Exceptions', category: 'procurement', primary: ['hospital', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Resolve PO/Receipt/Invoice variances. Side-by-side comparison. Approve variance or push back to vendor.',
    replaces: 'AP-clerk reconciliation spreadsheet' },
  { path: '/prior-auths', label: 'Prior Authorizations', category: 'dme', primary: ['provider', 'hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Submit PAs to payor clearinghouses (or stub). Decision returns to one inbox.' },
  { path: '/rmas', label: 'RMAs', category: 'procurement', primary: ['vendor', 'hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Return-merchandise-authorization workflow with status tracking.' },
  { path: '/backorders/triage', label: 'Backorder Triage', category: 'procurement', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'When a vendor stocks out, route to alternate vendors or substitute SKUs.' },

  // ─ Contracts & pricing ─────────────────────────────────────────────────
  { path: '/contract-pricing', label: 'Contracts & Pricing', category: 'contracts', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Bilateral contracts, fee schedules, revisions, history.' },
  { path: '/contracts/new', label: 'Add Contract Wizard', category: 'contracts', primary: ['hospital', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Wizard to create a vendor-hospital contract with items + fee schedule.' },
  { path: '/contracts/:id', label: 'Contract Detail', category: 'contracts', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Contract terms, items, revision history, expirations.' },
  { path: '/price-lookup', label: 'Price Lookup', category: 'contracts', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Best price for a HCPC/SKU across all your contracts. Shows source: CONTRACT → GPO → FEE → MEDICARE.' },
  { path: '/sku-catalog', label: 'SKU Catalog', category: 'contracts', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Browse products from vendors you have contracted with.' },
  { path: '/sku-groups', label: 'SKU Groups', category: 'contracts', primary: ['hospital', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Group SKUs (substitutes, families) for formulary rules.' },

  // ─ Vendor catalog & operations ─────────────────────────────────────────
  { path: '/vendor-locations', label: 'Vendor Locations', category: 'inventory', primary: ['vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Vendor warehouse and DC locations for routing decisions.' },
  { path: '/vendor-skus', label: 'Vendor SKU Catalog', category: 'inventory', primary: ['vendor'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Vendor’s own SKU master with pricing tiers.' },
  { path: '/vendor-coverage', label: 'Vendor Coverage Map', category: 'inventory', primary: ['hospital', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Which vendor supplies which HCPC in which region. Drives routing.' },
  { path: '/facility-vendors', label: 'Facility–Vendor Links', category: 'inventory', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'The approved-vendor list per facility. Drives catalog visibility.' },
  { path: '/stock-feeds', label: 'Stock Connectors', category: 'inventory', primary: ['vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Vendor stock-snapshot feeds (push or pull). Stale-feed penalty applied in routing.' },
  { path: '/erp-connectors', label: 'ERP Connectors', category: 'inventory', primary: ['vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Push POs to vendor ERP via HTTP_POST / WEBHOOK_POST / EDI 850 (stub) / MANUAL.' },
  { path: '/inventory-management', label: 'Inventory Management', category: 'inventory', primary: ['vendor', 'admin'], access: ['vendor', 'admin', 'super-vendor'],
    description: 'Vendor inventory workspace — lots, locations, transfers.' },
  { path: '/inventory-transfers', label: 'Inventory Transfers', category: 'inventory', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Cross-site lot transfers.' },
  { path: '/point-of-use', label: 'Point-of-Use Capture', category: 'inventory', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Scan-at-use consumption capture. Drives charge capture.' },
  { path: '/logistics', label: 'Logistics & Cold Chain', category: 'inventory', primary: ['hospital', 'vendor'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Shipment temperature logs for cold-chain consumables.' },
  { path: '/consignment', label: 'Consignment Closets', category: 'inventory', primary: ['hospital', 'vendor'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Track consignment inventory on-site at the hospital.' },

  // ─ Lab portal ──────────────────────────────────────────────────────────
  { path: '/labs', label: 'Lab Dashboard', category: 'lab', primary: ['lab'], access: ['lab', 'admin'],
    description: 'Lab-group KPIs: open orders, inventory health, backorders, recent audit events.' },
  { path: '/labs/orders', label: 'Lab Orders', category: 'lab', primary: ['lab'], access: ['lab', 'admin'],
    description: 'List of lab orders scoped to your lab group.' },
  { path: '/labs/orders/new', label: 'Create Lab Order', category: 'lab', primary: ['lab', 'provider'], access: ['lab', 'admin'],
    description: 'Create a lab order. Triggers asset-gen workflow (kit letter + TRF PDF) via Browser Rendering.' },
  { path: '/labs/orders/:id', label: 'Lab Order Detail', category: 'lab', primary: ['lab'], access: ['lab', 'admin'],
    description: 'Lifecycle, assets, consumption, related audit events.' },
  { path: '/labs/groups', label: 'Lab Groups', category: 'lab', primary: ['lab', 'admin'], access: ['lab', 'admin'],
    description: 'Lab groups (SINGLE_SITE / D2P) with vendor linkage.' },
  { path: '/labs/kit-sites', label: 'Lab Kit Sites', category: 'lab', primary: ['lab', 'admin'], access: ['lab', 'admin'],
    description: 'Sites where kits ship from / accession at.' },
  { path: '/labs/inventory', label: 'Lab Inventory', category: 'lab', primary: ['lab'], access: ['lab', 'admin'],
    description: 'Consumable inventory at lot level. FEFO consumption + auto-replenishment.',
    replaces: '7am whiteboard reconciliation' },
  { path: '/labs/test-mappings', label: 'Test → Consumable Map', category: 'lab', primary: ['lab'], access: ['lab', 'admin'],
    description: 'Which consumables each test recipe burns. Drives auto-consume.' },
  { path: '/labs/audit', label: 'Lab Audit Log', category: 'lab', primary: ['lab', 'admin'], access: ['lab', 'admin'],
    description: 'Lab-group-scoped audit log: orders, accessions, consumption, transfers.' },

  // ─ Reporting ───────────────────────────────────────────────────────────
  { path: '/reporting/:reportId', label: 'Reports (catch-all)', category: 'reporting', primary: ['hospital', 'vendor', 'provider', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Dynamic report router — 11 reports keyed by reportId.' },
  { path: '/reporting/multi-site-spend', label: 'Multi-Site Spend', category: 'reporting', primary: ['hospital', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Cross-facility spend comparison with respect for your facility scope.' },
  { path: '/reporting/contract-leakage', label: 'Contract Leakage', category: 'reporting', primary: ['hospital', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Lines paid above best-available contracted rate. The 8.4% you can finally see.' },
  { path: '/reporting/department-spend', label: 'Department Spend', category: 'reporting', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Roll up spend by cost center / department.' },
  { path: '/reporting/cross-site-inventory', label: 'Cross-Site Inventory', category: 'reporting', primary: ['hospital', 'vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Inventory positions across facilities.' },
  { path: '/reporting/vendor-scorecards', label: 'Vendor Scorecards', category: 'reporting', primary: ['hospital', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'On-time delivery, fill rate, defect rate, response time. Monthly snapshots.' },
  { path: '/reporting/hospital-forecast', label: 'Hospital Demand Forecast', category: 'reporting', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Trailing-12-month per-SKU demand forecast with confidence bands.' },
  { path: '/reporting/charge-capture-leakage', label: 'Charge Capture Leakage', category: 'reporting', primary: ['hospital', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Items used at point-of-care that never made it to a claim.' },
  { path: '/reporting/price-variance', label: 'Price Variance', category: 'reporting', primary: ['hospital', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Lines paid above same-SKU average. Different from leakage — variance over time.' },
  { path: '/reporting/clinical-consumption', label: 'Clinical Consumption', category: 'reporting', primary: ['hospital'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Consumption by physician, department, procedure.' },
  { path: '/reporting/forecast', label: 'Forecast', category: 'reporting', primary: ['hospital', 'super-vendor', 'admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Top-level demand forecast view.' },

  // ─ Hospital management ─────────────────────────────────────────────────
  { path: '/hospitals', label: 'Hospitals', category: 'admin', primary: ['admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Hospital directory (read-only for non-admin).' },
  { path: '/hospital-facilities', label: 'Hospital Facilities', category: 'admin', primary: ['hospital', 'admin'], access: ['hospital', 'admin'],
    description: 'Campuses + satellite clinics under a hospital.' },
  { path: '/hospital-departments', label: 'Hospital Departments', category: 'admin', primary: ['hospital', 'admin'], access: ['hospital', 'admin'],
    description: 'Cost centers / departments inside each facility.' },
  { path: '/hospital-physicians', label: 'Hospital Physicians', category: 'admin', primary: ['hospital', 'admin'], access: ['hospital', 'admin'],
    description: 'Prescribers attached to facilities.' },
  { path: '/admin/ehr-connections', label: 'EHR Connections (Epic FHIR)', category: 'admin', primary: ['hospital', 'admin'], access: ['hospital', 'admin'],
    description: 'Epic FHIR connection per provider org. Fernet-encrypted tokens, refresh handler, scope test.' },

  // ─ Admin — Platform management ─────────────────────────────────────────
  { path: '/admin', label: 'Admin Dashboard', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Platform-wide KPIs: integration health, OIG/LEIE freshness, workflow queue, file-access volume.' },
  { path: '/vendors', label: 'Manage Vendors', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Platform vendor directory with onboarding + status.' },
  { path: '/create-vendor', label: 'Onboard Vendor', category: 'admin', primary: ['admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: 'Vendor onboarding wizard.' },
  { path: '/create-provider', label: 'Onboard Provider Network', category: 'admin', primary: ['admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: '5-step wizard: basic info → facilities → vendors → admin user → review.' },
  { path: '/create-lab', label: 'Onboard Lab Group', category: 'admin', primary: ['admin'], access: ['hospital', 'vendor', 'lab', 'provider', 'super-vendor', 'admin'],
    description: '3-step wizard: lab group → admin user → review.' },
  { path: '/admin/approvals', label: 'User Approvals', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Approve/decline user signup requests.' },
  { path: '/admin/file-access-log', label: 'File Access Log', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Every R2 file download logged. HIPAA audit.' },
  { path: '/admin/integration-log', label: 'Integration Log', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'PENDING → SUCCESS / RETRYING / DEAD_LETTER. Retry, replay, manual resolve.' },
  { path: '/admin/workflows', label: 'Workflows Admin', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Workflow control plane: terminate, raise-event, purge. View instance + event timeline.' },
  { path: '/admin/gpo-contracts', label: 'GPO Contracts', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Group purchasing organization contracts layered on top of bilateral.' },
  { path: '/admin/payors', label: 'Payors', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Payor directory + eligibility/PA provider config.' },
  { path: '/admin/formulary', label: 'Formulary', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Global formulary + substitution rules.' },
  { path: '/admin/approval-rules', label: 'Approval Rules', category: 'admin', primary: ['admin', 'hospital'], access: ['admin'],
    description: 'Threshold + department + HCPC routing rules for requisitions.' },
  { path: '/admin/dmepos-compliance', label: 'DMEPOS Compliance', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Track DMEPOS supplier expirations, accreditations, surety bonds.' },
  { path: '/admin/lcd-ingest', label: 'LCD Ingest', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Pull LCD coverage rules from CMS MCD scraper. Preview + ingest.' },
  { path: '/admin/lab-backfill', label: 'Lab Backfill', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Backfill lab inventory transactions from CSV.' },
  { path: '/admin/budgets', label: 'Hospital Budgets', category: 'admin', primary: ['admin', 'hospital'], access: ['admin'],
    description: 'Department / facility budget caps with consumption tracking.' },
  { path: '/admin/gl-ledger', label: 'GL Ledger', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'General-ledger entries for posted matched invoices.' },
  { path: '/admin/supplier-onboarding', label: 'Supplier Onboarding', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Multi-stage supplier onboarding: COI, W9, OIG, banking, review.' },
  { path: '/admin/compliance-dashboard', label: 'Compliance Dashboard', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'OIG, DMEPOS, PHI audit health in one screen.' },
  { path: '/admin/item-master-hygiene', label: 'Item Master Hygiene', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Dedupe, normalize, and flag the canonical SKU / HCPC dictionary.' },
  { path: '/admin/invoice-match-rules', label: 'Invoice Match Rules', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Variance tolerances and rules used by the 3-way match engine.' },
  { path: '/admin/emergency-review', label: 'Emergency Review Queue', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Off-contract, emergency-purchasing orders flagged for review.' },
  { path: '/admin/recalls', label: 'Recalls', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'FDA recall ingest + impact analysis across inventory.' },
  { path: '/admin/controlled-substance', label: 'Controlled Substance Log', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'DEA Schedule II–V controlled substance transaction log.' },
  { path: '/subscription', label: 'Subscription Plans', category: 'admin', primary: ['admin'], access: ['admin'],
    description: 'Platform subscription tiers.' },
];

// ─── Pillars — Act 5 closing proof ─────────────────────────────────────────

export interface Pillar {
  id: string;
  title: string;
  detail: string;
  emoji: string;
}

export const PILLARS: Pillar[] = [
  {
    id: 'security',
    title: 'HIPAA + OWASP P0–P2 hardened',
    detail: 'Every PHI read logged. JWT + Turnstile + MFA. Fernet-encrypted EHR tokens. R2 downloads proxied (no signed URLs). OIG monthly refresh from CMS.',
    emoji: '🔒',
  },
  {
    id: 'integrations',
    title: 'Epic FHIR · EDI 850 · ERP push · Stripe',
    detail: 'Epic FHIR (production-ready), EDI 850 (stubbed), HTTP_POST + WEBHOOK_POST + MANUAL ERP push, Resend transactional email, Stripe billing slot ready.',
    emoji: '🔌',
  },
  {
    id: 'scale',
    title: '145 tables · 55 routes · 23 permission resources',
    detail: 'D1 SQLite at the edge. Cloudflare Workers serve from the user’s nearest colo. R2 for PHI files. KV for OIG cache. Queues for event bus. Workers AI (Llama 3.2 Vision) for medical-order extraction.',
    emoji: '⚡',
  },
  {
    id: 'audit',
    title: 'Full audit trail. No black boxes.',
    detail: 'phi_access_log, file_access_log, integration_log, workflow_activity_log, encounter_audit_logs, substitution_audit_log, controlled_substance_log. Every event is reconstructable.',
    emoji: '📜',
  },
];
