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
      rfx: 10000,        // direct buys at or above this need an RFx unless a contract exists
      poOverrun: 0.10,   // a PO may not exceed the approved PR value by more than this
      priceVariance: 0.10 // a PO priced this far above the contract or standard price needs a written reason
    },
    sites: ["Pilot Line", "Plant A", "Plant B", "Field Service"],
    costCenters: ["CC-100 Operations", "CC-200 Engineering", "CC-300 Maintenance", "CC-400 Quality"],
    // Annual budget per cost center. A request that would take a cost center past its budget needs Executive approval.
    budgets: { "CC-100 Operations": 150000, "CC-200 Engineering": 90000, "CC-300 Maintenance": 40000, "CC-400 Quality": 25000 },
    // Spend categories. Direct spend goes into the product, indirect spend keeps the business running.
    categories: ["Raw materials", "Components", "Packaging", "MRO"],
    categoryType: { "Raw materials": "Direct", "Components": "Direct", "Packaging": "Direct", "MRO": "Indirect" },
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
      { id: "greenline", name: "Greenline Pack", categories: ["Packaging"], status: "Qualified", quality: 83, terms: 30 }
    ],

    // contract: pre negotiated supplier and price, allows a direct PO at any value
    items: [
      { id: "RM-101", name: "Aluminum extrusion profile", category: "Raw materials", uom: "ea", stdPrice: 42.00, needsQuality: true, needsEngineering: false, contract: null },
      { id: "PK-102", name: "Food grade laminate film", category: "Packaging", uom: "roll", stdPrice: 380.00, needsQuality: true, needsEngineering: false, contract: null },
      { id: "RM-103", name: "Industrial solvent concentrate, 200 L drum", category: "Raw materials", uom: "drum", stdPrice: 1450.00, needsQuality: true, needsEngineering: false, contract: null },
      { id: "CP-104", name: "Machined aluminum housing", category: "Components", uom: "ea", stdPrice: 215.00, needsQuality: false, needsEngineering: true, contract: null },
      { id: "CP-201", name: "Steel support rail, 3 m", category: "Components", uom: "ea", stdPrice: 38.00, needsQuality: false, needsEngineering: false, contract: null },
      { id: "CP-202", name: "Motor control board", category: "Components", uom: "ea", stdPrice: 640.00, needsQuality: false, needsEngineering: true, contract: null },
      { id: "MR-203", name: "Pump seal overhaul kit", category: "MRO", uom: "kit", stdPrice: 910.00, needsQuality: false, needsEngineering: false, contract: null },
      { id: "CP-301", name: "Power cable assembly", category: "Components", uom: "ea", stdPrice: 76.00, needsQuality: false, needsEngineering: true, contract: null },
      { id: "CP-302", name: "Forged steel bracket", category: "Components", uom: "ea", stdPrice: 24.50, needsQuality: false, needsEngineering: false, contract: null },
      { id: "CP-303", name: "Connector kit", category: "Components", uom: "kit", stdPrice: 11.80, needsQuality: false, needsEngineering: true, contract: null },
      { id: "MR-401", name: "Hydraulic hose assembly, 1 in", category: "MRO", uom: "ea", stdPrice: 58.00, needsQuality: false, needsEngineering: false, contract: null },
      { id: "MR-402", name: "Sealed bearing 6205", category: "MRO", uom: "ea", stdPrice: 9.40, needsQuality: false, needsEngineering: false, contract: { supplierId: "meridian", price: 9.10 } },
      { id: "MR-403", name: "Cut resistant gloves", category: "MRO", uom: "pair", stdPrice: 6.20, needsQuality: false, needsEngineering: false, contract: { supplierId: "meridian", price: 5.90 } },
      { id: "MR-404", name: "Grease cartridge, 400 g", category: "MRO", uom: "case", stdPrice: 96.00, needsQuality: false, needsEngineering: false, contract: { supplierId: "meridian", price: 92.00 } },
      { id: "MR-405", name: "Fastener assortment M6 to M12", category: "MRO", uom: "kit", stdPrice: 84.00, needsQuality: false, needsEngineering: false, contract: null }
    ]
  };
});
