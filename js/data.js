/* Reference data for the P2P Workbench. Everything here is fictional. */
(function (root, factory) {
  var REF = factory();
  if (typeof module === "object" && module.exports) module.exports = REF;
  else root.P2P_REF = REF;
})(typeof self !== "undefined" ? self : this, function () {
  return {
    thresholds: {
      director: 5000,    // requests at or above this also need the Director
      executive: 50000,  // requests at or above this also need the Executive
      rfx: 10000,        // direct buys at or above this need an RFx unless an active contract covers the item
      poOverrun: 0.10,   // a PO may not exceed the approved PR value by more than this
      priceVariance: 0.10 // a PO priced this far above the contract or standard price needs a written reason
    },
    sites: ["Pilot Line", "Plant A", "Plant B", "Field Service"],
    costCenters: ["CC-100 Operations", "CC-200 Engineering", "CC-300 Maintenance", "CC-400 Quality"],
    // Annual budget per cost center. A request that would take a cost center past its budget needs Executive approval.
    budgets: { "CC-100 Operations": 150000, "CC-200 Engineering": 90000, "CC-300 Maintenance": 90000, "CC-400 Quality": 25000 },
    // Spend categories. Direct spend goes into the product, indirect spend keeps the business running.
    // Services are bought as an estimated quantity of hours, days, weeks or months at a rate, and consumed over time.
    categories: ["Raw materials", "Components", "Packaging", "MRO", "Services"],
    categoryType: { "Raw materials": "Direct", "Components": "Direct", "Packaging": "Direct", "MRO": "Indirect", "Services": "Indirect" },
    // Share of a service PO used up before the screens warn that it is running out.
    serviceWarnPct: 80,
    // Who releases a service entry. The Manager releases every entry. From these values per entry, the Director
    // and then the Executive release it too, in order.
    serviceRelease: { director: 5000, executive: 10000 },
    // Supplier documents. Every supplier needs the first two. Suppliers of these categories also need the third.
    subtierCategories: ["Raw materials", "Components"],
    docTypes: { quality: "Quality certificate", origin: "Origin declaration", subtier: "Sub-tier disclosure" },
    docWarnDays: 30,

    roles: [
      { id: "requester", label: "Requester", persona: "Maya Chen, Line Engineer",
        desc: "Raises purchase requests and can cancel their own.",
        can: "Create and cancel requests" },
      { id: "manager", label: "Manager", persona: "Daniel Reyes, Operations Manager",
        desc: "First approver on every request.",
        can: "Approve or reject at the Manager step" },
      { id: "quality", label: "Quality", persona: "Priya Nair, Quality Lead",
        desc: "Approves raw materials and packaging and decides what happens to receipts on hold.",
        can: "Approve at the Quality step, release or reject quality holds, record supplier document renewals" },
      { id: "engineering", label: "Engineering", persona: "Ken Ito, Design Engineer",
        desc: "Approves engineered components.",
        can: "Approve at the Engineering step" },
      { id: "director", label: "Director", persona: "Sofia Marin, Director of Operations",
        desc: "Approves requests of $5,000 or more.",
        can: "Approve at the Director step" },
      { id: "executive", label: "Executive", persona: "Alan Brooks, VP Operations",
        desc: "Approves requests of $50,000 or more.",
        can: "Approve at the Executive step" },
      { id: "buyer", label: "Buyer", persona: "Jordan Lee, Material Planner",
        desc: "Runs sourcing, creates POs, chases suppliers and fixes price issues.",
        can: "Start RFx, enter quotes, award, create and change POs" },
      { id: "warehouse", label: "Warehouse", persona: "Sam Patel, Warehouse Lead",
        desc: "Receives goods against POs.",
        can: "Post goods receipts (GRN)" },
      { id: "ap", label: "Accounts Payable", persona: "Rita Gomez, AP Specialist",
        desc: "Enters supplier invoices, runs the match and releases payment.",
        can: "Enter invoices, re-run match, reject, pay" }
    ],

    // What each role works on, and what it follows along with. Used for the sidebar groups and the "View only" line.
    // This is about focus, not permission: the engine rules decide who can act. Screens in neither list sit under "More screens".
    focus: {
      requester:   { work: ["projects", "requests", "rfx", "services"], view: ["pos", "grn", "audit"] },
      manager:     { work: ["requests", "services"], view: ["projects", "rfx", "contracts", "pos", "expedite", "grn", "invoices", "suppliers", "audit"] },
      quality:     { work: ["requests", "rfx", "grn", "suppliers"], view: ["pos", "audit"] },
      engineering: { work: ["requests", "rfx"], view: ["pos", "audit"] },
      director:    { work: ["requests", "rfx", "contracts", "services"], view: ["projects", "pos", "expedite", "grn", "invoices", "suppliers", "audit"] },
      executive:   { work: ["requests", "rfx", "contracts", "services"], view: ["projects", "pos", "expedite", "grn", "invoices", "suppliers", "audit"] },
      buyer:       { work: ["rfx", "contracts", "pos", "expedite", "suppliers", "invoices"], view: ["projects", "requests", "grn", "services", "audit"] },
      warehouse:   { work: ["grn"], view: ["pos", "invoices", "audit"] },
      ap:          { work: ["invoices"], view: ["contracts", "pos", "grn", "services", "suppliers", "audit"] }
    },
    // Who works on each screen, shown to roles that only view it.
    screenOwners: {
      requests: "The Requester raises requests here. Approvers decide on them in order.",
      rfx: "The Buyer runs sourcing here. The user side checks offers against the spec, and the Director approves awards.",
      projects: "The Requester groups the requests that must come together by one date into a project. Everyone else follows it.",
      pos: "The Buyer creates POs and keeps supplier dates and prices current.",
      contracts: "The Buyer sets up rate contracts. The Director approves them, and the Executive too from $50,000. Each PO from a contract is a release that uses up its cap.",
      expedite: "The Buyer chases suppliers from here.",
      grn: "Receiving is done by the Warehouse. Quality decides what happens to held goods.",
      services: "The Requester records the service work from the site log and the supplier's timesheet. The Manager releases it, plus the Director from $5,000 and the Executive from $10,000.",
      invoices: "Accounts Payable enters, matches and pays invoices here. Price gaps go to the Buyer, receipt gaps to the Warehouse.",
      suppliers: "Quality records document renewals. The Buyer keeps supplier emails."
    },

    // status: Qualified | Conditional | Not qualified. quality is a 0 to 100 supplier rating.
    suppliers: [
      { id: "northfield", name: "Northfield Metals", categories: ["Raw materials", "Components"], status: "Qualified", quality: 92, terms: 45 },
      { id: "helio", name: "Helio Components", categories: ["Components", "Raw materials"], status: "Qualified", quality: 88, terms: 30 },
      { id: "brightpath", name: "Brightpath Electronics", categories: ["Components", "Raw materials", "Packaging"], status: "Qualified", quality: 85, terms: 45 },
      { id: "atlas", name: "Atlas Fastener Supply", categories: ["MRO", "Components"], status: "Qualified", quality: 80, terms: 30 },
      { id: "cobaltridge", name: "Cobalt Ridge Chemicals", categories: ["Raw materials"], status: "Qualified", quality: 90, terms: 60 },
      { id: "sunarc", name: "SunArc Mounting", categories: ["Components"], status: "Qualified", quality: 84, terms: 30 },
      { id: "kestrel", name: "Kestrel Parts", categories: ["Components"], status: "Conditional", quality: 70, terms: 30 },
      { id: "tidewater", name: "Tidewater Seals", categories: ["Components", "MRO"], status: "Qualified", quality: 87, terms: 45 },
      { id: "orbit", name: "Orbit Controls", categories: ["Components", "Raw materials", "Packaging"], status: "Not qualified", quality: 55, terms: 30 },
      { id: "meridian", name: "Meridian MRO", categories: ["MRO"], status: "Qualified", quality: 91, terms: 30 },
      { id: "pinecrest", name: "Pinecrest Cable", categories: ["Components", "Raw materials", "Packaging"], status: "Conditional", quality: 72, terms: 60 },
      { id: "summit", name: "Summit Packaging", categories: ["Packaging"], status: "Qualified", quality: 89, terms: 45 },
      { id: "greenline", name: "Greenline Pack", categories: ["Packaging"], status: "Qualified", quality: 83, terms: 30 },
      { id: "keystone", name: "Keystone Field Services", categories: ["Services"], status: "Qualified", quality: 88, terms: 30 },
      { id: "crestline", name: "Crestline Lift and Rigging", categories: ["Services"], status: "Qualified", quality: 86, terms: 30 },
      { id: "ridgeway", name: "Ridgeway Scaffold Hire", categories: ["Services"], status: "Qualified", quality: 82, terms: 45 },
      { id: "truegauge", name: "Truegauge Calibration Lab", categories: ["Services"], status: "Qualified", quality: 93, terms: 30 },
      { id: "northwind", name: "Northwind Compressor Care", categories: ["Services"], status: "Conditional", quality: 74, terms: 45 }
    ],

    // Contract prices are not here. They live on contracts (Contracts screen), which have dates and a value cap.
    items: [
      { id: "RM-101", name: "Aluminum extrusion profile", category: "Raw materials", uom: "ea", stdPrice: 42.00, needsQuality: true, needsEngineering: false },
      { id: "PK-102", name: "Food grade laminate film", category: "Packaging", uom: "roll", stdPrice: 380.00, needsQuality: true, needsEngineering: false },
      { id: "RM-103", name: "Industrial solvent concentrate, 200 L drum", category: "Raw materials", uom: "drum", stdPrice: 1450.00, needsQuality: true, needsEngineering: false },
      { id: "CP-104", name: "Machined aluminum housing", category: "Components", uom: "ea", stdPrice: 215.00, needsQuality: false, needsEngineering: true },
      { id: "CP-201", name: "Steel support rail, 3 m", category: "Components", uom: "ea", stdPrice: 38.00, needsQuality: false, needsEngineering: false },
      { id: "CP-202", name: "Motor control board", category: "Components", uom: "ea", stdPrice: 640.00, needsQuality: false, needsEngineering: true },
      { id: "MR-203", name: "Pump seal overhaul kit", category: "MRO", uom: "kit", stdPrice: 910.00, needsQuality: false, needsEngineering: false },
      { id: "MR-209", name: "Seal kit, pump P-204, carbon and silicon carbide faces", category: "MRO", uom: "kit", stdPrice: 935.00, needsQuality: false, needsEngineering: false },
      { id: "CP-301", name: "Power cable assembly", category: "Components", uom: "ea", stdPrice: 76.00, needsQuality: false, needsEngineering: true },
      { id: "CP-302", name: "Forged steel bracket", category: "Components", uom: "ea", stdPrice: 24.50, needsQuality: false, needsEngineering: false },
      { id: "CP-303", name: "Connector kit", category: "Components", uom: "kit", stdPrice: 11.80, needsQuality: false, needsEngineering: true },
      { id: "MR-401", name: "Hydraulic hose assembly, 1 in", category: "MRO", uom: "ea", stdPrice: 58.00, needsQuality: false, needsEngineering: false },
      { id: "MR-402", name: "Sealed bearing 6205", category: "MRO", uom: "ea", stdPrice: 9.40, needsQuality: false, needsEngineering: false },
      { id: "MR-403", name: "Cut resistant gloves", category: "MRO", uom: "pair", stdPrice: 6.20, needsQuality: false, needsEngineering: false },
      { id: "MR-404", name: "Grease cartridge, 400 g", category: "MRO", uom: "case", stdPrice: 96.00, needsQuality: false, needsEngineering: false },
      { id: "MR-405", name: "Fastener assortment M6 to M12", category: "MRO", uom: "kit", stdPrice: 84.00, needsQuality: false, needsEngineering: false },
      // Services. The quantity is an estimate of hours, days, weeks or months. The price is the rate.
      { id: "SV-501", name: "Maintenance technician labor, per man hour", category: "Services", uom: "hour", stdPrice: 68.00, needsQuality: false, needsEngineering: false, service: true },
      { id: "SV-502", name: "Mobile crane hire with operator, per day", category: "Services", uom: "day", stdPrice: 1450.00, needsQuality: false, needsEngineering: false, service: true },
      { id: "SV-503", name: "Scaffold rental, erected and dismantled, per week", category: "Services", uom: "week", stdPrice: 520.00, needsQuality: false, needsEngineering: false, service: true },
      { id: "SV-504", name: "Air compressor maintenance contract, per month", category: "Services", uom: "month", stdPrice: 2100.00, needsQuality: false, needsEngineering: false, service: true },
      { id: "SV-505", name: "Gauge and instrument calibration, per instrument", category: "Services", uom: "instrument", stdPrice: 45.00, needsQuality: true, needsEngineering: false, service: true },
      { id: "SV-506", name: "Industrial cleaning crew, per shift", category: "Services", uom: "shift", stdPrice: 780.00, needsQuality: false, needsEngineering: false, service: true },
      { id: "SV-507", name: "Forklift rental with servicing, per month", category: "Services", uom: "month", stdPrice: 1150.00, needsQuality: false, needsEngineering: false, service: true }
    ]
  };
});
